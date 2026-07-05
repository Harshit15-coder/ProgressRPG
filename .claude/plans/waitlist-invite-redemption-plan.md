# Issue #499 — Waitlist Invitation & Redemption Flow — Implementation Plan

## Context
The registration-cap + waitlist feature (previous issue) added the `Waitlist` model, a join endpoint, and an admin-triggered `invite_entry`/`resend_invite_email` service (`users/services/waitlist_service.py`). That covers *manually* pulling people off the waitlist. This issue closes the loop: a **weekly scheduled job** should automatically invite waiting users up to whatever headroom exists under `GameSettings.registration_cap`, and a **redemption flow** must let an invited user actually turn their invite token into a registered account — integrated with the existing registration serializer rather than a parallel code path.

## Locked-in design decisions
1. **Email match enforced.** Registering via `invite_token` must supply the same email as the `Waitlist` entry, or the request is rejected. Prevents a leaked token registering an unrelated address and keeps admin data consistent.
2. **`invite_token` is a sibling of `invite_code` on `CustomRegisterSerializer`**, not a bridge to `InviteCode`. Exactly one of the two must be supplied. This matches the issue's ask ("Waitlist entry becomes redeemed after successful registration") without introducing a second model to keep in sync.
3. **No dedicated redemption/status endpoint.** The frontend carries the token straight from the URL into the registration POST; `CustomRegisterSerializer.validate()`/`custom_signup` is the single place that ever looks up the token (existence, `INVITED` status, email match) and the single place that flips it to `redeemed`. Considered and rejected a separate GET status-check view (modeled on `ConfirmEmailView`): it would only ever be a pre-flight UX nicety — final validation still has to happen at registration time regardless (turnstile/terms/password can't be front-loaded) — and would duplicate the token-lookup query in two places that must stay in sync. Cost of skipping it: no early "this link is dead" warning before the user fills the form, and no server-side email pre-fill; both are minor and can be added later if it proves to matter.
4. **Frontend is in scope**: RegisterPage needs to read a token from the URL and thread it through registration, with the invalid/already-used case surfacing as a normal form-submission error (same as any other registration validation error) rather than a pre-flight check.

## Backend

### `users/tasks.py` — new weekly task
```python
@shared_task
def invite_waitlist_entries():
    from users.services import waitlist_service
    count = waitlist_service.invite_up_to_headroom()
    logger.info(f"[WAITLIST INVITE TASK] Invited {count} waitlist entrant(s).")
    return count
```
No `bind`/retries needed — mirrors `calculate_weekly_metrics` (plain `@shared_task`, no locking at the Celery level; correctness comes from the DB-level locking below).

### `progress_rpg/celery.py` — new Beat entry
Add alongside `calculate-weekly-metrics`:
```python
"invite_waitlist_weekly": {
    "task": "users.tasks.invite_waitlist_entries",
    "schedule": crontab(hour=3, minute=0, day_of_week=1),  # Mondays 3am, staggered after weekly metrics (2am)
},
```

### `users/services/waitlist_service.py` — new `invite_up_to_headroom()`
Core new logic. Compute headroom, lock exactly the FIFO slice of `WAITING` rows needed, flip them to `INVITED`, then send emails **after** the DB transaction commits (see risk below):
```python
from django.contrib.auth import get_user_model
from core.models import GameSettings

@transaction.atomic
def invite_up_to_headroom() -> int:
    registration_cap = GameSettings.current().registration_cap
    registered = get_user_model().objects.count()
    headroom = registration_cap - registered
    if headroom <= 0:
        return 0

    candidate_ids = list(
        Waitlist.objects.filter(status=Waitlist.Status.WAITING)
        .order_by("signup_timestamp")
        .values_list("id", flat=True)[:headroom]
    )
    if not candidate_ids:
        return 0

    entries = list(
        Waitlist.objects.select_for_update(skip_locked=True)
        .filter(id__in=candidate_ids, status=Waitlist.Status.WAITING)
        .order_by("signup_timestamp")
    )
    for entry in entries:
        invite_entry(entry)  # existing function: sets token/status/invited_at, queues email
    return len(entries)
```
- `values_list(...)[:headroom]` is evaluated in a plain (unlocked) query first, then re-locked by PK — avoids the `select_for_update()` + slicing ambiguity across DB backends.
- `skip_locked=True` means if the task somehow overlaps itself (retry, manual + scheduled run colliding), the second run simply skips rows the first one already has locked — no duplicate invites, no deadlock wait.
- Re-filtering on `status=WAITING` after acquiring the lock is what makes this safe against a run that raced past the initial candidate-ID query.

**Why locking here instead of a plain conditional `UPDATE ... WHERE status='waiting'`** (the idiom already used in `WaitlistJoinAPIView` and the redemption transition): those call sites do the check-and-mutate in one atomic SQL statement, so Postgres's own row lock during that single `UPDATE` is enough. This code can't do that, because it reuses `invite_entry()` unmodified, which generates a fresh per-row token in Python and then calls an unconditioned `entry.save(...)` — a bulk SQL update can't express "set a different random token per row." That forces a SELECT-then-save split, which is a TOCTOU window: without locking, two overlapping runs could both read the same `WAITING` row, both generate a token, and the later `.save()` would silently clobber the earlier one (row invited twice, two emails, one dead link). `select_for_update` closes that window by making the read itself take the lock; `skip_locked=True` means an overlapping run skips already-claimed rows instead of blocking a worker/connection on them. This project runs Postgres in dev/test/staging/prod (per CLAUDE.md), so `skip_locked`'s lack of SQLite support isn't a portability concern here.

**Risk to fix while doing this — email-before-commit race:** `invite_entry()` currently calls `send_invite_email()` synchronously (which calls `.delay()`), same as the existing admin action. Called from *inside* `@transaction.atomic` here, the Celery worker could pick up the send task and query the `Waitlist` row before this transaction commits its `INVITED` status. Fix: change `send_invite_email()`'s call site(s) to schedule via `transaction.on_commit(...)` instead of calling directly. `transaction.on_commit` runs immediately if there's no open transaction (per Django docs), so this is a no-op behavior change for the existing admin action (which isn't wrapped in atomic) and closes the race for the new task. One-line change in `waitlist_service.py`.

### `core/models.py` / `users/models.py`
No changes. `registration_cap` already exists; `Waitlist.Status.REDEEMED`, `invite_token` (unique), and the `["status", "signup_timestamp"]` index already support this query — **no new migration needed.**

### `api/serializers.py` — registration changes
```python
class CustomRegisterSerializer(RegisterSerializer):
    invite_code = serializers.CharField(write_only=True, required=False, allow_blank=True)
    invite_token = serializers.CharField(write_only=True, required=False, allow_blank=True)
    ...

    def validate(self, data):
        data = super().validate(data)
        invite_code = data.get("invite_code")
        invite_token = data.get("invite_token")
        if bool(invite_code) == bool(invite_token):  # neither or both
            raise serializers.ValidationError(
                "Provide exactly one of invite_code or invite_token."
            )
        if invite_token:
            try:
                entry = Waitlist.objects.get(
                    invite_token=invite_token, status=Waitlist.Status.INVITED
                )
            except Waitlist.DoesNotExist:
                raise serializers.ValidationError(
                    {"invite_token": "Invalid or already used invite token."}
                )
            if entry.email != data.get("email", "").strip().lower():
                raise serializers.ValidationError(
                    {"invite_token": "This invite token is for a different email address."}
                )
            self._waitlist_entry = entry
        return data
```
- `invite_code` becomes `required=False` (was `required=True`); its existing `validate_invite_code` is untouched — DRF only calls it when the key is present, so omitting `invite_code` when using a token skips that check entirely.
- `custom_signup` gains an `elif` branch for the token path, doing the atomic redemption:
```python
def custom_signup(self, request, user):
    invite_code = self.validated_data.get("invite_code")
    if invite_code:
        ...  # existing InviteCode.use() logic, unchanged
    else:
        entry = self._waitlist_entry
        updated = Waitlist.objects.filter(
            pk=entry.pk, status=Waitlist.Status.INVITED
        ).update(status=Waitlist.Status.REDEEMED)
        if not updated:
            raise serializers.ValidationError(
                {"invite_token": "This invite token has already been redeemed."}
            )
```
The conditional `.update()` (status must still be `INVITED`) is the same "check-then-mutate, guard against the race" idiom already used in `WaitlistJoinAPIView` — here we raise instead of swallowing, because a lost race means the account creation itself must not silently succeed twice against one token.

**Important correctness step:** `CustomRegisterView.perform_create` (`api/views.py:372`) must wrap `serializer.save(self.request)` in `transaction.atomic()` explicitly. Whether dj-rest-auth's base `RegisterSerializer.save()` already atomic-wraps the `custom_signup` call is a vendored-package detail not worth trusting blind — wrapping it ourselves guarantees that a `ValidationError` raised in the token-race case above rolls back the just-created `CustomUser` row rather than leaving an orphaned account.

No new views, serializers, or URLs are needed for redemption itself — it's fully handled inside the existing registration endpoint (`auth/registration/`).

### Email templates
None new. Invite emails already use `templates/emails/waitlist_invite_message.{txt,html}` (existing, from the previous issue) via `send_invite_email()`. No separate "redeemed" confirmation email is required — the standard post-registration `emails/email_confirmation_message` flow already fires from `CustomRegisterView.perform_create`.

### Optional (nice-to-have, not required by the issue)
A `users/management/commands/invite_waitlist.py` mirroring `metrics/management/commands/calculate_metrics.py`'s convention (thin wrapper calling `waitlist_service.invite_up_to_headroom()`) for manual/support use. Small, low-risk addition — include only if time allows after the core commits below.

## Frontend

### `frontend/src/hooks/useRegister.ts`
Extend the existing POST payload to optionally include `invite_token` alongside (instead of) `invite_code` — mirror whichever of the two the page has available.

### `frontend/src/pages/RegisterPage/RegisterPage.tsx`
- Read an optional `:token` route param (new route `/waitlist/redeem/:token` pointing at `RegisterPage`, registered in `routesConfig.jsx`).
- When a token is present: hide the `invite_code` input, let the user enter their email as normal (no pre-fill/lock, since there's no status check to source it from), and submit `invite_token` instead of `invite_code`.
- A 400 response with an `invite_token` error (invalid/used/mismatched-email) renders inline via the existing form-error handling — same mechanism as any other registration validation error, no new UI state needed.
- When no token: existing `invite_code`-based flow, unchanged.

## Tests

### `users/tests/test_waitlist.py` additions
- `WaitlistInviteTaskTest` (new class): headroom > queue size invites everyone waiting; headroom < queue size invites only the oldest N by `signup_timestamp`; headroom ≤ 0 invites nobody; already-`invited`/`redeemed`/`removed` entries are never touched; calling `waitlist_service.invite_up_to_headroom()` twice back-to-back the second time invites 0 (idempotency — first run already consumed the headroom). Follow existing `@override_settings(CELERY_TASK_ALWAYS_EAGER=True, EMAIL_BACKEND=...)` pattern and assert on `mail.outbox`, matching `WaitlistServiceEmailTest`.
- `WaitlistRegistrationRedemptionTest` (in `users/tests/test_waitlist.py` or alongside existing registration tests — check where `CustomRegisterSerializer` is currently tested and colocate):
  - valid token + matching email → registration succeeds, entry becomes `REDEEMED`.
  - valid token + mismatched email → 400, entry stays `INVITED`, no user created.
  - already-`REDEEMED` token → 400, no user created.
  - both `invite_code` and `invite_token` supplied → 400.
  - neither supplied → 400 (existing "invite_code required" behavior, now surfaced via the object-level check).
  - concurrent-redemption race: simulate by flipping status to `REDEEMED` between the two writes a test can control (e.g. mid-request via a mocked `.update()` or two sequential requests against the same token), confirm the second register POST 400s and **no orphaned `CustomUser` row exists** (proves the `transaction.atomic` wrap in `perform_create` works).

## Edge cases / risks (recap of key decisions above)
- **Double-run of the weekly task**: closed via `select_for_update(skip_locked=True)` + re-checking `status=WAITING` post-lock.
- **Email sent before transaction commit**: closed via switching `send_invite_email` call sites to `transaction.on_commit(...)`.
- **Headroom ≤ 0**: early return, no query.
- **Queue shorter than headroom**: slice naturally returns fewer rows; no special-casing needed.
- **Double redemption of one token**: closed via conditional `.update(status=Waitlist.Status.INVITED → REDEEMED)` returning 0 rows on race, raising to roll back the whole registration.
- **Orphaned user on redemption race**: closed via explicit `transaction.atomic()` wrap in `CustomRegisterView.perform_create`, not relying on dj-rest-auth's internal transaction behavior.
- **Tokens never expire**: no `expires_at` field exists on `Waitlist` (unlike `InviteCode`) and none is being added — matches the requirement as-is.
- **No new indexes/migrations needed**: `invite_token` is already `unique=True` (indexed); `["status", "signup_timestamp"]` composite index already covers the FIFO query.

## Recommended commit order
1. **Backend task + service**: `waitlist_service.invite_up_to_headroom()`, the `transaction.on_commit` email fix, `users/tasks.py::invite_waitlist_entries`, Beat schedule entry. Tests: `WaitlistInviteTaskTest`.
2. **Backend redemption**: `CustomRegisterSerializer`/`custom_signup` token-path changes; `perform_create` atomic wrap. Tests: `WaitlistRegistrationRedemptionTest`.
3. **Frontend**: `useRegister` token support, `RegisterPage` token handling, new route. Manual browser verification of both the invalid-token and valid-token→successful-registration paths.
4. *(Optional)* `invite_waitlist` management command, if time allows.

## Verification
- `docker compose run --rm web python manage.py test users.tests.test_waitlist` for the new backend tests.
- Manually trigger `invite_up_to_headroom()` via Django shell (`make ps`) against a seeded `Waitlist` + adjusted `registration_cap` to sanity-check FIFO ordering and headroom math before trusting the Beat schedule.
- For the frontend: `npm run dev`, visit `/waitlist/redeem/<token>` with a real `INVITED` entry's token (seeded via shell), complete registration, confirm the entry flips to `redeemed` in admin; then revisit the same link and re-register with a different email to confirm the inline "invalid/used token" error renders correctly.


## TODO / Design review

The current plan assumes invitations are triggered by a weekly Celery Beat task, following the original issue description.

I have since decided that this behaviour should be changed.

Instead, invitations should be sent immediately whenever an administrator increases `GameSettings.registration_cap`. Increasing the cap is an explicit decision to admit more players, so there should be no delay waiting for a scheduled task.

Before implementation:

- Remove the weekly Celery Beat approach.
- Determine the best place to trigger the invitation process when the registration cap increases (model, admin, service, or another appropriate location).
- Continue to execute the invitation process asynchronously via Celery so the admin UI remains responsive.
- Simplify the implementation where possible now that invitations are event-driven rather than scheduled.
