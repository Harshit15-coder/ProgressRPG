# Issue #410 — Show trial status and days remaining on Account page

## 1. High-level strategy

Trial status is currently invisible: `UserSubscription` has no `trial_end` field, and both the webhook path (`payments/webhooks.py`) and the manual-sync path (`payments/services.py::_reconcile_subscriptions`) only ever set `active`/`plan`/`end_date`. `trial_end` is read transiently from the Stripe payload in `handle_trial_will_end` purely to send an email — never persisted.

Plan: add a `trial_end` column to `UserSubscription`, populate it from the Stripe subscription payload at the two points where we already reconcile subscription state (webhook `handle_subscription_updated`/`handle_checkout_session_completed`, and sync `_reconcile_subscriptions`), derive `is_trialing`/`trial_end` on `CustomUser` the same way `is_premium` is already derived, expose both through `PlayerSerializer`, and render a small trial banner in the Billing section of `Account.tsx` using the same `player?.is_premium`-style conditional already in place.

No new endpoints, models, or services — this extends the existing subscription-reconciliation code paths and the existing `Player` fetch the Account page already uses via `useGame`.

## 2. Files likely to change

**Backend**
- `payments/models.py` (exists) — add `trial_end = DateTimeField(null=True, blank=True)` to `UserSubscription`; add `is_trialing` property.
- `payments/migrations/00XX_usersubscription_trial_end.py` (new) — schema migration.
- `payments/services.py` (exists) — `_reconcile_subscriptions`: set/clear `trial_end` from the Stripe candidate when creating/reactivating/updating the local row.
- `payments/webhooks.py` (exists) — `handle_checkout_session_completed` and `handle_subscription_updated`: persist `trial_end` from `subscription_payload`/`retrieved_subscription` onto the local `UserSubscription` row. Reuse the existing timestamp-conversion snippet already in `handle_trial_will_end` (lines 211-216) rather than duplicating logic — extract it into a small helper.
- `users/models.py` (exists) — add `is_trialing` and `trial_end` properties on `CustomUser`, mirroring the existing `is_premium` property (delegates to `UserSubscription.active_for_user`).
- `users/serializers.py` (exists) — `PlayerSerializer`: add `is_trialing` (`BooleanField(source="user.is_trialing")`) and `trial_end` (`DateTimeField(source="user.trial_end")`) to `fields`/`read_only_fields`.
- `payments/tests.py` (exists) — extend reconciliation/webhook tests to assert `trial_end` persistence; extend `UserPremiumPropertyTests`-style tests for the new `CustomUser` properties.
- `users/tests.py` or wherever `PlayerSerializer` is tested (exists) — assert new fields appear/behave correctly.

**Frontend**
- `frontend/src/types/domain.ts` (exists) — add `is_trialing: boolean` and `trial_end: string | null` to `Player`.
- `frontend/src/pages/Account/useAccountPage.ts` (exists) — derive `isTrialing` and `trialDaysRemaining` from `player.is_trialing`/`player.trial_end`, return them.
- `frontend/src/pages/Account/Account.tsx` (exists) — render a trial banner/status line in the Billing section when `isTrialing` is true, including days remaining and an upgrade link.
- `frontend/src/pages/Account/Account.module.scss` (exists) — small style addition for the banner (reuse `.premiumBadge`/`.description` conventions already present).
- `frontend/src/pages/Account/Account.test.tsx` (exists) — new tests for banner presence/absence and days-remaining text, following the existing `mockPlayer({...})` pattern.

No new files beyond the migration.

## 3. Implementation plan

1. **Model + migration**: add `trial_end` to `UserSubscription`; run `makemigrations`.
2. **Persist `trial_end` in the sync path**: in `_reconcile_subscriptions`, when `stripe_status in ACTIVE_STATUSES`, read `candidate.trial_end` (Stripe gives this as a unix timestamp or `None`) and set it on `local_sub` whenever it differs, both on the "create" and "reactivate/update" branches. When status moves out of trialing (i.e. not in `ACTIVE_STATUSES` or `trial_end` is `None`), it naturally stops being read as trialing since `is_trialing` will check `trial_end` in the future — no explicit clearing needed, though setting it to `None` on deactivation keeps data tidy.
3. **Persist `trial_end` in the webhook path**: factor the existing timestamp conversion out of `handle_trial_will_end` into a small module-level helper (e.g. `_stripe_ts_to_datetime`), reuse it in `handle_checkout_session_completed` (from `retrieved_subscription`) and `handle_subscription_updated` (from `subscription_payload`) to set `subscription.trial_end` alongside the existing `plan`/`active` updates.
4. **`UserSubscription.is_trialing` property**: `self.active and self.trial_end is not None and self.trial_end > timezone.now()`.
5. **`CustomUser` properties**: `trial_end` returns `UserSubscription.active_for_user(self).trial_end` (or `None`); `is_trialing` delegates to the subscription's `is_trialing` (or `False` if no active subscription) — same shape as the existing `is_premium` property.
6. **Serializer**: add the two fields to `PlayerSerializer`.
7. **Frontend type + hook**: add fields to `Player`; in `useAccountPage`, compute days remaining via `Math.ceil((new Date(trial_end).getTime() - Date.now()) / 86_400_000)`, clamped to `>= 0`.
8. **Account.tsx UI**: in the existing Billing `section`, when `isTrialing`, show a small status line (e.g. "Free trial — N days remaining") above/alongside the existing premium badge, with a link to `/upgrade` (reusing the existing `Button as="a" href="/upgrade"` pattern). When not trialing, render nothing extra — existing Free/Premium branch is untouched.
9. Update tests (backend reconciliation/webhook, frontend Account/serializer) alongside each step rather than in one batch, per the "small reviewable commits" principle.

Suggested commit split: (1) model+migration+properties+tests, (2) sync-path persistence+tests, (3) webhook-path persistence+tests, (4) serializer+type+hook+tests, (5) Account.tsx UI+tests.

## 4. Design decisions

**Store `trial_end` on `UserSubscription` vs. a new `status` field**
- Chosen: add only `trial_end`; derive `is_trialing` from `active` + `trial_end` in the future.
- Alternative: also store the raw Stripe `status` string (`"trialing"`, `"active"`, etc.) for richer state.
- Reasoning: the acceptance criteria only need trial visibility. `active` + `trial_end` is sufficient and keeps the model minimal — avoids introducing a parallel status enum that could drift from `active`/`ACTIVE_STATUSES` semantics already governing the rest of the app.

**Where to persist `trial_end`: sync path and webhook path, not a new endpoint**
- Chosen: extend the two existing reconciliation entry points.
- Alternative: add a dedicated `/payments/trial-status/` endpoint that live-queries Stripe on each Account page load.
- Reasoning: the issue's own implementation notes say trial data "should already be accessible through the existing... backend." A live Stripe call per page view adds latency and an extra failure mode; reusing the webhook/sync-populated field means the Account page just rides the existing `Player` fetch, consistent with how `is_premium` already works.

**Derive `is_trialing` as a property vs. persisting it as a boolean column**
- Chosen: computed property (mirrors `is_premium`).
- Alternative: store `is_trialing` as a boolean, updated in the same places as `active`.
- Reasoning: a stored boolean can silently go stale if `trial_end` passes without a triggering webhook event (Stripe does send `customer.subscription.updated` when a trial converts, but relying solely on webhook delivery for a derived fact is fragile). Computing from `trial_end > now()` is always correct and requires no invalidation logic — same trust model as `is_premium`.

## 5. Edge cases

- **Trial already ended, no webhook received yet**: `is_trialing` correctly returns `False` since it checks `trial_end > now()`, even if `active` is stale — but `active` staleness is an existing, separate condition not introduced by this change.
- **`trial_end` present but subscription inactive** (e.g. canceled during trial): `is_trialing` requires `active`, so banner correctly disappears.
- **User has never had a subscription**: `UserSubscription.active_for_user` returns `None`; `is_trialing`/`trial_end` properties must handle `None` gracefully (return `False`/`None`), matching existing `is_premium` null-guard.
- **Days-remaining rounding**: use `ceil` on the day fraction so "23.9 hours left" still reads as "1 day remaining" rather than "0 days remaining" — avoids showing "0 days" while still technically in trial.
- **Migration backfill**: existing active trialing subscriptions in prod won't have `trial_end` populated until the next webhook event or manual sync. Confirmed acceptable — no backfill command needed; self-heals on next Stripe event (trial windows are short, so this resolves quickly). Call this out in the PR description so it's a known, not silent, gap.
- **Backwards compatibility**: `trial_end` nullable, no default-breaking changes to `PlayerSerializer` (new fields are additive, existing consumers unaffected).

## 6. Tests

**Backend**
- `UserSubscription` reconciliation (`payments/tests.py`, extend `_reconcile_subscriptions`-adjacent tests): trial_end set on create when Stripe status is `trialing`; trial_end updated if it changes; trial_end untouched on plain `active` renewals with no trial.
- Webhook tests: extend the existing trial-related tests (around `test_trial_will_end_sends_ending_soon_email_with_trial_end_date`) plus new assertions in `handle_subscription_updated`/`handle_checkout_session_completed` tests confirming `trial_end` is persisted.
- New `CustomUser.is_trialing`/`trial_end` property tests, mirroring `UserPremiumPropertyTests` structure (trialing, active-non-trial, no-subscription, trial-ended-but-still-active cases).
- `PlayerSerializer` test: confirms `is_trialing`/`trial_end` surface correctly for a trialing player.

**Frontend**
- `useAccountPage` (or via `Account.test.tsx`): days-remaining calculation for various `trial_end` values (future, past, null).
- `Account.test.tsx`: banner renders with correct day count when `is_trialing: true`; banner absent when `false` or player not premium; banner absent once trial has definitionally ended (`is_trialing: false` even if `is_premium: true` post-conversion).

## 7. Risks

- Forgetting to update **both** reconciliation paths (webhook and sync) — they currently duplicate similar logic already (plan/active updates appear in both `payments/services.py` and `payments/webhooks.py`), so it's easy to patch one and miss the other, leaving `trial_end` inconsistently populated depending on how the user's subscription state was last refreshed.
- Off-by-one errors in days-remaining rounding (floor vs. ceil) producing "0 days remaining" while still in trial.
- Treating `trial_end` in the past as still "trialing" if the `is_trialing` check forgets the `> now()` comparison and only checks `trial_end is not None`.
- Not guarding `None` on `UserSubscription.active_for_user(self)` before accessing `.trial_end` in the new `CustomUser` properties (would raise `AttributeError` for free users), analogous to the existing null-guard in `is_premium`.

## 8. Open questions

- Should the trial banner also appear for users who are trialing but haven't yet completed onboarding, or only within the existing Account page context (issue only mentions Account page, so scoping to Account.tsx only)?

Resolved: trial status renders as an inline status line (not a distinct colored banner), reusing existing `.description`/`.premiumBadge` styles. No backfill command — self-heals on next Stripe event.
