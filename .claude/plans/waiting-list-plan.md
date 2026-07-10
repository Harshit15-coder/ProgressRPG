# Registration Cap + Waitlist — Implementation Plan

## Locked-in design decisions
1. **Waitlist is fully separate** from the existing Mailchimp-backed `WaitlistSignupAPIView`/`subscribe_email_to_waitlist` (untouched, keeps its `/waitlist_signup/` URL). New model/endpoint gets new names (`Waitlist` model, `/waitlist_join/` URL) to avoid collision.
2. **Cap counts all `CustomUser` rows** (`CustomUser.objects.count()`), compared with `>=` against `GameSettings.registration_cap` (i.e. "at or above cap" closes registration).
3. **RegisterPage.tsx is restored** from `RegisterPage.backup.tsx` (converted to proper `.tsx`, dropping `@ts-nocheck`) and gated by a status fetch; the external progressrpg.com link is removed entirely. Backup file deleted once restored.
4. **Admin actions are fully functional**, not stubs — invite/resend logic lives in a reusable service module so a future scheduled-invite job can call the same functions.

## Backend

### `core/models.py` — `GameSettings`
- Add field, same pattern as `trial_period_days`:
  ```python
  registration_cap = models.IntegerField(default=1_000_000_000)
  ```
  Huge default so registration is effectively always open out of the box (no extra buffer math in code — the stored value already includes any margin).
- `clean()`: add `if self.registration_cap < 0: errors["registration_cap"] = "Must be non-negative."`
- Migration: new auto-migration in `core` adding this field (default backfills existing singleton row automatically).

### `core/admin.py` — `GameSettingsAdmin`
- Add `"registration_cap"` to `list_display`.
- Add fieldset `("Registration", {"fields": ("registration_cap",)})`.

### `users/models.py` — new `Waitlist` model
Place next to `InviteCode` (same app, same style):
```python
class Waitlist(models.Model):
    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        INVITED = "invited", "Invited"
        REDEEMED = "redeemed", "Redeemed"
        REMOVED = "removed", "Removed"

    email = models.EmailField()
    signup_timestamp = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.WAITING, db_index=True)
    invite_token = models.CharField(max_length=64, blank=True, null=True, unique=True)
    invited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["signup_timestamp"]
        constraints = [
            models.UniqueConstraint(
                fields=["email"],
                condition=models.Q(status__in=["waiting", "invited"]),
                name="unique_active_waitlist_email",
            )
        ]
        indexes = [models.Index(fields=["status", "signup_timestamp"])]

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.email} ({self.status})"
```
- Email normalized to lowercase on save (mirrors `CustomUserManager.normalize_email`) — otherwise the unique constraint is case-sensitive and easy to bypass.
- Migration: new migration in `users` app adding this model + constraint + index.

### `users/services/waitlist_service.py` (new file)
Reusable service functions — fully functional, designed so a later scheduled-job feature calls the same entry points. `send_email_to_users` (in `users/utils.py`) already normalizes raw email strings (`user.email if hasattr(user, "email") else user`) and dispatches async via `send_email_to_users_task.delay(...)` (Celery) — confirmed by reading `users/utils.py`, no fallback needed.
```python
import secrets
from django.conf import settings
from django.utils import timezone

from users.models import Waitlist
from users.utils import send_email_to_users


def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


def build_invite_url(token: str) -> str:
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    return f"{frontend_url}/waitlist/redeem/{token}"


def send_invite_email(entry: Waitlist) -> None:
    """Queues (or re-queues) the invitation email for an already-invited entry."""
    context = {
        "invite_url": build_invite_url(entry.invite_token),
        "current_year": timezone.now().year,
    }
    send_email_to_users(
        users=[entry.email],
        subject="You're invited to Progress RPG",
        template_base="emails/waitlist_invite_message",
        context=context,
        cc_admin=False,
    )


def invite_entry(entry: Waitlist) -> Waitlist:
    """Promotes a waiting entry to invited and sends the invite email. Idempotent token: only generates one if absent."""
    if not entry.invite_token:
        entry.invite_token = generate_invite_token()
    entry.status = Waitlist.Status.INVITED
    entry.invited_at = timezone.now()
    entry.save(update_fields=["invite_token", "status", "invited_at"])
    send_invite_email(entry)
    return entry


def resend_invite_email(entry: Waitlist) -> Waitlist:
    """Resends the existing invitation without touching token, invited_at, or queue position."""
    send_invite_email(entry)
    return entry
```
- New template files needed: `templates/emails/waitlist_invite_message.txt` and `.html`, in whatever directory `emails/welcome_email.txt`/`.html` and `emails/email_confirmation_message.txt`/`.html` live (locate via those existing templates at implementation time — path not confirmed from tagged files, but naming convention is clear).
- Also add `users/services/__init__.py` if a `services` package doesn't already exist in `users` (CLAUDE.md notes "Business logic lives in `models.py` and `services/`" as a repo-wide convention — check whether `users` already has one).

### `users/admin.py` — `WaitlistAdmin`
```python
from users.services import waitlist_service

@admin.register(Waitlist)
class WaitlistAdmin(admin.ModelAdmin):
    list_display = ["email", "status", "signup_timestamp", "invited_at"]
    list_filter = ["status"]
    search_fields = ["email"]
    ordering = ["signup_timestamp"]
    readonly_fields = ["invite_token", "signup_timestamp"]
    actions = ["invite_selected_now", "resend_invite_email_action", "mark_as_removed", "export_selected_to_csv"]

    @admin.action(description="Invite selected now")
    def invite_selected_now(self, request, queryset):
        eligible = queryset.filter(status=Waitlist.Status.WAITING)
        count = 0
        for entry in eligible:
            waitlist_service.invite_entry(entry)
            count += 1
        skipped = queryset.count() - count
        msg = f"Invited {count} waitlist entrant(s)."
        if skipped:
            msg += f" Skipped {skipped} not in 'waiting' status."
        self.message_user(request, msg)

    @admin.action(description="Resend invite email")
    def resend_invite_email_action(self, request, queryset):
        eligible = queryset.filter(status=Waitlist.Status.INVITED)
        count = 0
        for entry in eligible:
            waitlist_service.resend_invite_email(entry)
            count += 1
        skipped = queryset.count() - count
        msg = f"Resent invite email to {count} entrant(s)."
        if skipped:
            msg += f" Skipped {skipped} not currently 'invited'."
        self.message_user(request, msg)

    @admin.action(description="Mark as removed")
    def mark_as_removed(self, request, queryset):
        updated = queryset.update(status=Waitlist.Status.REMOVED)
        self.message_user(request, f"Marked {updated} entrant(s) as removed.")

    @admin.action(description="Export selected to CSV")
    def export_selected_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="waitlist_export.csv"'
        writer = csv.writer(response)
        writer.writerow(["email", "status", "signup_timestamp", "invited_at", "invite_token"])
        for entry in queryset:
            writer.writerow([entry.email, entry.status, entry.signup_timestamp, entry.invited_at, entry.invite_token])
        return response
```
- Method named `resend_invite_email_action` (not `resend_invite_email`) to avoid shadowing the imported `waitlist_service.resend_invite_email` function.
- `invite_selected_now` only affects `waiting` entries (idempotent, no double-invite); `resend_invite_email_action` only affects `invited` entries. Both report skipped counts.
- `mark_as_removed`: model as scoped has no removal timestamp field, so just `status=removed` — not adding a new field since it wasn't requested.
- `export_selected_to_csv`: fully implemented, not a stub.

### `api/serializers.py`
Add:
```python
class RegistrationStatusResponseSerializer(serializers.Serializer):
    registration_open = serializers.BooleanField()

class WaitlistJoinRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

class WaitlistJoinResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()
```
(New classes to avoid ambiguity with the existing `WaitlistSignupRequestSerializer`/`WaitlistSignupResponseSerializer` used by the Mailchimp flow.)

### `api/views.py`
Add two views, near `WaitlistSignupAPIView`/`AppConfigView`:
```python
class RegistrationStatusAPIView(APIView):
    permission_classes = [AllowAny]
    serializer_class = RegistrationStatusResponseSerializer

    def get(self, request):
        game_settings = GameSettings.current()
        registration_open = User.objects.count() < game_settings.registration_cap
        return Response({"registration_open": registration_open})


class WaitlistJoinAPIView(APIView):
    permission_classes = [AllowAny]
    serializer_class = WaitlistJoinResponseSerializer
    request_serializer_class = WaitlistJoinRequestSerializer

    @method_decorator(ratelimit(key="ip", rate="10/h", method="POST", block=True))
    def post(self, request):
        serializer = self.request_serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()

        already_waiting = Waitlist.objects.filter(
            email=email, status__in=[Waitlist.Status.WAITING, Waitlist.Status.INVITED]
        ).exists()
        if not already_waiting:
            try:
                Waitlist.objects.create(email=email, status=Waitlist.Status.WAITING)
            except IntegrityError:
                pass  # race with a concurrent signup — treat as already-waiting

        return Response({"detail": "You're on the waitlist."}, status=status.HTTP_200_OK)
```
- Import `Waitlist` from `users.models`; `User = get_user_model()` (already imported as `get_user_model` in `api/views.py`).
- Both cases (already waiting, or just created) return the same friendly message — no enumeration concern here, but consistent UX either way.

### `api/urls.py`
Add two paths near `game_settings/` and `waitlist_signup/`:
```python
path("registration_status/", RegistrationStatusAPIView.as_view(), name="registration_status"),
path("waitlist_join/", WaitlistJoinAPIView.as_view(), name="waitlist_join"),
```
Add both view names to the `from api.views import (...)` block.

### `CustomRegisterView` / registration endpoint
**No changes.** Confirmed requirement: signup must never check the cap.

## Frontend

### New: `frontend/src/hooks/useRegistrationStatus.ts`
Per CLAUDE.md ("State: TanStack Query manages server state"; `src/hooks/` = "TanStack Query wrappers"), this should be a `useQuery` wrapper (a GET status check benefits from caching/refetch), not modeled on `useRegister.ts`'s raw-fetch mutation style. Check an existing `useQuery`-based hook in `src/hooks/` as the template at implementation time.

### New: `frontend/src/hooks/useWaitlistJoin.ts`
A POST/mutation hook — can mirror `useRegister.ts`'s raw-fetch mutation style (already precedent in this exact area of the codebase), or use `useMutation` if that's the established pattern for other mutations in the repo. Verify against an existing mutation hook rather than assuming.

### New: `frontend/src/components/WaitlistForm/WaitlistForm.tsx` (+ `.module.scss`)
Small form: email input + submit, reusing the existing `Form` component pattern seen in `RegisterPage.backup.tsx`. On success, show confirmation message inline (no navigation).

### `frontend/src/pages/RegisterPage/RegisterPage.tsx` — restore + gate
```tsx
export default function RegisterPage() {
  const { loading, registrationOpen } = useRegistrationStatus();

  if (loading) return <LoadingSpinner /* or existing pattern */ />;

  if (!registrationOpen) {
    return (
      <div className={styles.page}>
        <div className={styles.formFrame}>
          <h1 className={styles.title}>Registration is temporarily full</h1>
          <p>We've reached our current capacity for new players. Join the waitlist and we'll be in touch.</p>
          <WaitlistForm />
        </div>
      </div>
    );
  }

  return <RegistrationForm />; // logic ported from RegisterPage.backup.tsx
}
```
- Port the body of `RegisterPage.backup.tsx` into either the same file or a new `RegistrationForm.tsx`, removing `@ts-nocheck`, adding proper types (expect ~15-20 min of typing work — the backup file's escape hatch means latent type issues may surface).
- Delete `RegisterPage.backup.tsx` once ported.
- Reuse existing `styles.formFrame`/`styles.title`/`styles.content`/`styles.footer` classes from `RegisterPage.module.scss` for both states.
- Need a loading state on `/register` while `registrationOpen` resolves — decide spinner vs skeleton during implementation.

### `frontend/src/routes/routesConfig.jsx`
No change needed — `/register` route already points at `RegisterPage`.

## Tests

Test package location confirmed: `users/tests/` is already a package (`__init__.py`, `tests.py`, `test_management_commands.py`), not a flat file. New tests go in a new module: `users/tests/test_waitlist.py`.

Project already uses `CELERY_TASK_ALWAYS_EAGER=True` in test settings — confirmed via `EmailTaskTest` in `users/tests/tests.py:498-529`, which uses:
```python
@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
```
and asserts directly on `django.core.mail.outbox`. **Follow this exact pattern for waitlist invite email tests — do NOT mock Celery tasks or assert on `.delay` calls; assume tasks execute synchronously and assert on `mail.outbox`.**

### `core/tests.py` additions
- `GameSettingsSingletonTest.test_defaults`: add assertion `registration_cap == 1_000_000_000`.
- `GameSettingsValidationTest`: add `test_negative_registration_cap_rejected`.

### `users/tests/test_waitlist.py` (new file)
- `RegistrationStatusAPITest`:
  - below cap → `registration_open: true`
  - `registration_cap` set to current user count → `registration_open: false` (at-cap closes)
  - endpoint requires no auth (200 for anonymous client)
- `WaitlistJoinAPITest`:
  - valid email → 200, `Waitlist` row created with `status=waiting`
  - duplicate email while waiting → 200, no second row created
  - email normalized to lowercase before storage/uniqueness check
  - rate limit triggers on 11th request within an hour (mirror existing `WaitlistSignupAPIView` test pattern if one exists)
- `SignupIgnoresCapTest`: set `registration_cap` below current user count, POST to `auth/registration/` with valid data, assert still succeeds — proves signup endpoint ignores cap.
- `WaitlistServiceEmailTest` (decorated with the eager-Celery/locmem pattern above):
  ```python
  @override_settings(
      CELERY_TASK_ALWAYS_EAGER=True,
      EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
  )
  class WaitlistServiceEmailTest(TestCase):
      def setUp(self):
          self.entry = Waitlist.objects.create(email="waiter@example.com")

      def test_invite_entry_sends_email_and_sets_fields(self):
          from django.core import mail
          waitlist_service.invite_entry(self.entry)

          self.entry.refresh_from_db()
          self.assertEqual(self.entry.status, Waitlist.Status.INVITED)
          self.assertIsNotNone(self.entry.invite_token)
          self.assertIsNotNone(self.entry.invited_at)

          self.assertEqual(len(mail.outbox), 1)
          self.assertEqual(mail.outbox[0].to, ["waiter@example.com"])
          self.assertIn(self.entry.invite_token, mail.outbox[0].body)

      def test_invite_entry_preserves_existing_token(self):
          from django.core import mail
          self.entry.invite_token = "existing-token"
          self.entry.status = Waitlist.Status.INVITED
          self.entry.save()

          waitlist_service.invite_entry(self.entry)

          self.entry.refresh_from_db()
          self.assertEqual(self.entry.invite_token, "existing-token")
          self.assertEqual(len(mail.outbox), 1)

      def test_resend_invite_email_does_not_change_token_or_timestamp(self):
          from django.core import mail
          waitlist_service.invite_entry(self.entry)
          mail.outbox.clear()
          original_token = self.entry.invite_token
          original_invited_at = self.entry.invited_at

          waitlist_service.resend_invite_email(self.entry)

          self.entry.refresh_from_db()
          self.assertEqual(self.entry.invite_token, original_token)
          self.assertEqual(self.entry.invited_at, original_invited_at)
          self.assertEqual(len(mail.outbox), 1)
  ```
- `WaitlistAdminActionsTest` (same eager-Celery/locmem decorator):
  - `invite_selected_now`: only affects `waiting` entries in the queryset; `invited`/`redeemed`/`removed` entries untouched; correct message shown; `mail.outbox` count matches number of eligible entries (e.g. 2 waiting entries selected → `len(mail.outbox) == 2`).
  - `resend_invite_email_action`: only affects `invited` entries; others skipped; asserts on `mail.outbox`.
  - `mark_as_removed`: sets `status=removed` regardless of prior status.
  - `export_selected_to_csv`: response has `Content-Type: text/csv` and contains selected emails.
- `Waitlist` model constraint test: creating a second `waiting`/`invited` row with the same (lowercased) email raises `IntegrityError`; a `removed`/`redeemed` row with that email does not block a new `waiting` row.

## Edge cases / risks
- **Concurrent signups at the cap boundary**: acceptable — signup never checks the cap, so a couple of overshoots are fine; the stored cap already has margin baked in.
- **Unique constraint + case sensitivity**: must normalize email casing before insert (handled in `Waitlist.save()` and in `WaitlistJoinAPIView`), or two differently-cased submissions of the same address both succeed.
- **`invite_token` uniqueness with NULL**: Postgres treats NULLs as distinct for unique constraints, so multiple `waiting` rows with `invite_token=None` is fine.
- **Migration ordering**: two independent migrations (`core` for `registration_cap`, `users` for `Waitlist`) — no cross-dependency, safe as separate commits.
- **`RegisterPage.tsx` retyping risk**: the backup file is `@ts-nocheck`; converting it to real TS may surface latent type issues in the `Form` component's prop contract — allocate real time for this, don't treat it as pure copy-paste.
- **Email template lookup path**: `templates/emails/waitlist_invite_message.txt`/`.html` need to be created; confirm the exact directory by checking where `emails/welcome_email.txt`/`.html` currently live.
- **`users/services/` package**: may not exist yet in the `users` app specifically (other apps like `character` use flat `signals.py`) — create `__init__.py` if needed.

## Recommended commit order
1. **Backend models + admin**: `GameSettings.registration_cap` (+migration), `Waitlist` model (+migration), `waitlist_service.py`, `WaitlistAdmin` with 4 actions, `GameSettingsAdmin` fieldset update, email templates. Tests: settings validation/defaults, Waitlist model constraint, service email tests, admin action tests.
2. **Backend API**: `RegistrationStatusAPIView`, `WaitlistJoinAPIView`, serializers, `urls.py` wiring, rate limiting. Tests: status endpoint, waitlist-join endpoint, signup-ignores-cap regression test.
3. **Frontend**: restore `RegisterPage.tsx` from backup (typed), new `WaitlistForm` component, `useRegistrationStatus`/`useWaitlistJoin` hooks, delete `RegisterPage.backup.tsx`. Manual browser verification of both states (below cap / at cap) per CLAUDE.md's UI-testing guidance.
