# Plan: Registration Kill Switch (#501)

## 1. High-level strategy

Add a single boolean toggle, `GameSettings.registration_enabled` (default `True`), following
the exact pattern already used for `activity_search_includes_tasks`. Gate the signup endpoint
itself (`CustomRegisterView`) on this flag at the top of `create()`, before any serializer or
DB work runs, so a direct POST is rejected the same as a UI-driven one. Surface the flag
through the existing `RegistrationStatusAPIView` (`/api/v1/registration_status/`) alongside
the existing `registration_open` field, and have `RegisterPage` branch on it to render a
distinct "kill switch" fallback (static message + optional legacy Mailchimp link), separate
from the existing "waitlist full" fallback.

This reuses the existing singleton settings model, existing admin, and the existing
registration-status endpoint/hook/query — no new model, endpoint, or flag system is
introduced.

## 2. Files likely to change

| File | Change | New? |
|---|---|---|
| `core/models.py` | Add `registration_enabled` BooleanField to `GameSettings` (default `True`) | existing |
| `core/migrations/` | New migration for the field | new file |
| `core/admin.py` | Add field to `GameSettingsAdmin.list_display` and a fieldset | existing |
| `api/serializers.py` | Add `registration_enabled` to `RegistrationStatusResponseSerializer` | existing |
| `api/views.py` | `RegistrationStatusAPIView.get()` includes the flag; `CustomRegisterView` gates `create()` on it | existing |
| `frontend/src/types/api.ts` | Add `registration_enabled: boolean` to `RegistrationStatus` | existing |
| `frontend/src/pages/RegisterPage/RegisterPage.tsx` | Add kill-switch fallback branch, checked before the existing cap-based fallback | existing |
| `frontend/src/pages/RegisterPage/*.module.scss` (or similar) | Minor styling reuse for the new fallback if needed | existing |
| `users/tests/test_waitlist.py` (or a new `test_registration_kill_switch.py`) | Backend tests for both flag states | existing or new |
| `frontend` component/E2E test for `RegisterPage` | Frontend test for fallback rendering | existing |

No new backend app, model, or feature-flag mechanism is required — `server_management.FeatureFlag`
(access-group based: all/premium/testers) doesn't fit this use case, since the kill switch is a
single global ops toggle, not a per-user-cohort rollout flag. `GameSettings` is the correct home,
consistent with `registration_cap`.

## 3. Implementation plan

1. **Model + migration**: add `registration_enabled` to `GameSettings`, generate migration.
2. **Admin**: expose the new field (list_display + "Registration" fieldset, next to `registration_cap`).
3. **Backend gate**: in `CustomRegisterView`, override `create()` to short-circuit with a
   `403` (or `503`) JSON error response when `GameSettings.current().registration_enabled` is
   `False`, before calling `super().create()`. Keep `perform_create` untouched.
4. **Status endpoint**: add `registration_enabled` to `RegistrationStatusResponseSerializer`
   and `RegistrationStatusAPIView.get()`'s response.
5. **Frontend type + fallback**: extend `RegistrationStatus` type; in `RegisterPage`, add a
   branch checked first (kill switch overrides invite tokens too — an emergency switch should
   block even invited users) that renders the fallback UI when `!data.registration_enabled`.
6. **Tests**: backend endpoint tests (both flag states, direct-POST bypass attempt) and a
   frontend test asserting the fallback renders and the form doesn't when the flag is off.

Each step above is a small, independently reviewable commit.

## 4. Design decisions

**(a) New `GameSettings` field vs. new model/endpoint**
Chosen: extend `GameSettings`. Alternative: a dedicated `KillSwitch` model or reusing
`server_management.FeatureFlag`. Reasoning: `GameSettings` is already the home for the
closely-related `registration_cap`, has a singleton accessor, admin UI, and no caching to
invalidate — the smallest possible change. `FeatureFlag` models per-cohort access
(all/premium/testers) which doesn't map onto a binary ops kill switch.

**(b) Gate in `CustomRegisterView.create()` vs. middleware**
Chosen: check inside `create()`. Alternative: a middleware check like
`AsyncMaintenanceModeMiddleware`. Reasoning: the kill switch only needs to affect one endpoint;
a middleware adds a new cross-cutting concern and an exempt-path list to maintain for a
single-endpoint requirement. A one-line guard in the view is simpler and matches the
acceptance criteria ("gate the endpoint itself") directly.

**(c) Separate `registration_enabled` field vs. reusing `registration_open`**
Chosen: separate field, both returned from the same status endpoint. Alternative: fold the
kill switch into the existing cap check so `registration_open` goes `False` when either
condition is true. Reasoning: the two states need different frontend messaging — "temporarily
full, join the waitlist" vs. an emergency "registration is down" message potentially pointing at
the legacy Mailchimp list (per issue notes on #497). Collapsing them would lose that
distinction and force awkward client-side inference.

**(d) Kill switch overrides invite tokens**
Chosen: the kill-switch fallback branch is checked before the invite-token bypass in
`RegisterPage`, and the backend gate in `CustomRegisterView` applies unconditionally (no
invite-token bypass). Alternative: let invited users through even during a kill switch, matching
the cap-bypass behavior. Reasoning: the acceptance criteria frame this as an *emergency* switch —
it should be a hard stop, not conditional on invite status. Cap bypass for invitees is a
different, non-emergency mechanism (honoring a slot already promised).

## 5. Edge cases

- **Direct API calls during kill switch**: covered explicitly by the `create()` guard — must
  return before Turnstile/serializer validation runs, so no partial side effects.
- **Migration default**: default `True` means the flag is a no-op on deploy — matches how
  `registration_cap`'s default (`1_000_000_000`) was chosen to be a no-op.
  Existing rows don't need a backfill migration since the default handles new/existing
  singleton row identically via `get_or_create`.
  Actually: existing `GameSettings` singleton row already exists in prod/staging; adding a
  field with `default=True` applies to existing rows automatically via the schema migration —
  no data migration needed (contrast with `waitlist_nudges_enabled_from`, which needed a data
  migration because its default was "now", not a static value).
- **Concurrent toggle mid-request**: reading `GameSettings.current()` once at the top of
  `create()` is sufficient; no read-then-write race exists since the view only reads the flag.
- **Frontend caching**: `useRegistrationStatus` has `staleTime: 60_000` — toggling the flag
  won't reflect in an already-open tab for up to 60s. Acceptable for an emergency switch (same
  staleness the existing cap check already tolerates); no WebSocket push is warranted for this.
- **Error response shape**: reuse the same `{"detail": "..."}` shape used elsewhere in
  `api/views.py` (e.g. `WaitlistSignupAPIView`'s 503) for consistency.

## 6. Tests

- **Backend** (extend `users/tests/test_waitlist.py` or new file):
  - `registration_enabled=False` → `RegistrationStatusAPIView` returns it in the payload.
  - `registration_enabled=False` → POST to `/api/v1/auth/registration/` returns an error status,
    no `User` row created, no confirmation email sent.
  - `registration_enabled=True` (default) → existing signup flow (`SignupIgnoresCapTest` etc.)
    is unaffected — run existing suite to confirm no regression.
  - Kill switch blocks even with a valid invite token (backend has no bypass).
- **Frontend**:
  - `RegisterPage` renders kill-switch fallback (not `RegistrationForm`, not `WaitlistForm`)
    when `registration_enabled: false`.
  - `RegisterPage` renders normal form when `registration_enabled: true` and cap not reached
    (regression check against existing behavior).

## 7. Risks

- Forgetting to check the flag in `create()` specifically (vs. `perform_create()`, which runs
  after validation) — would let invalid-but-still-processed requests through partially.
- Returning a `200`/success-shaped response on the blocked path by mistake, which the frontend
  or a direct API caller could misinterpret as success.
- Adding the flag check in a way that still executes the rate-limit decorator or Turnstile
  verification first, leaking information or consuming rate-limit budget unnecessarily.
- Missing the admin fieldset/list_display update, leaving the field toggleable only via shell.

## 8. Open questions

- Exact fallback copy/link for the kill-switch state (static "come back later" message vs. a
  link to the legacy Mailchimp list per #497) — needs coordination with whoever implements #497
  per the issue's own note, since both touch `RegisterPage`.
- ~~Preferred HTTP status for the blocked signup response~~ — resolved: use `503 Service
  Unavailable`, consistent with `AsyncMaintenanceModeMiddleware` and `WaitlistSignupAPIView`.
  Now documented as a repo-wide convention in `CLAUDE.md`.
