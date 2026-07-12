# Plan: Split toast triggers — REST for gameplay events, WS for server-push (#491)

## 1. High-level strategy

Move gameplay-event toasts (XP gained, level-up, activity completed) off the WebSocket `notification`
path and onto the REST response from activity completion, since that response already carries
`xp_gained` and `level_ups`. The WS `notification` path stays, but only for genuinely server-initiated
pushes (admin/maintenance).

Two sides:
- **Backend**: stop emitting `ServerMessage` WS notifications for activity-complete/level-up (the two
  emitters tied to `ActivityTimer.complete()`/`Player.add_activity()`). Leave `server_management/tasks.py`
  emitters untouched.
- **Frontend**: after `stop()` resolves in `ActivityTimer.tsx`, call the real `showToast` (fixing the
  currently-broken `LooseGameContext` cast) with a message derived from `xp_gained`/`level_ups`. Enable
  `toastsFeature`.

This avoids adding a `category` field to the WS payload and filtering client-side — removing the two
gameplay-specific backend emitters is simpler and matches the issue's proposed split exactly (REST for
events with a user-initiated success response, WS only for messages with "no user action to hang a
callback on").

## 2. Files likely to change

| File | Change | Exists? |
|---|---|---|
| `gameplay/models.py` (`ActivityTimer.complete`, ~line 562) | Remove the `ServerMessage.objects.create(...)` "Activity submitted..." call | existing |
| `users/models.py` (`Player.add_activity`, ~line 486) | Remove the per-level-up `ServerMessage.objects.create(...)` call; keep return value (`levelups`) unchanged | existing |
| `frontend/src/components/Timer/ActivityTimer.tsx` | Replace `LooseGameContext` cast with real `useToast()`; call `showToast` after `stop()` resolves, built from `xp_gained`/`level_ups` | existing |
| `frontend/src/featureFlags.ts` | Flip `toastsFeature: []` → `toastsFeature: ['all']` | existing |
| `gameplay/tests/*` (wherever `ActivityTimer.complete()` / activity-complete view is tested) | Update/remove assertions on the now-deleted `ServerMessage` | existing |
| `users/tests/*` (wherever `add_activity`/level-up is tested) | Update/remove assertions on the now-deleted `ServerMessage` | existing |
| `frontend/src/components/Timer/ActivityTimer.test.tsx` (or equivalent) | New/updated tests for toast content on submit | check if exists; likely new |

No new files, models, services, or endpoints required.

## 3. Implementation plan

1. **Backend: remove gameplay `ServerMessage` emitters**
   - Delete the `ServerMessage.objects.create(...)` block in `gameplay/models.py` `ActivityTimer.complete()`.
   - Delete the `ServerMessage.objects.create(...)` loop in `users/models.py` `Player.add_activity()`
     (keep the `levelups`/return-value logic — only remove the WS side effect).
   - Run/update backend tests that assert on these messages.

2. **Frontend: fix `ActivityTimer.tsx` toast wiring**
   - Remove `LooseGameContext` cast; import and use `useToast()` from `hooks/useToast.ts`.
   - After `await stop()` resolves successfully, build a toast message from the response
     (`xp_gained`, `level_ups`) and call `showToast(message)`. Keep the existing `catch` block's
     error-toast behaviour, now via the real `showToast`.
   - Decide message copy for: XP-only, XP + one level-up, XP + multiple level-ups (see design decisions).

3. **Frontend: enable the flag**
   - Flip `toastsFeature` to `['all']` in `featureFlags.ts` once step 2 is verified locally.

4. **Tests**
   - Add/adjust frontend tests asserting `showToast` is called with the right content for the
     `xp_gained`/`level_ups` combinations, and that WS `notification` still calls `showToast` for
     non-gameplay messages (that path is unchanged, just no longer receiving gameplay messages).
   - Adjust backend tests removing assertions on now-deleted `ServerMessage` rows for activity
     completion / level-up-via-activity.

Each step above is a reasonably small, independently reviewable commit (backend removal → frontend
wiring → flag flip → tests, or tests folded into each step).

## 4. Design decisions

**a. How to split WS vs REST (payload filtering vs removing backend emitters)**
- Chosen: remove the two backend `ServerMessage` emitters tied to activity completion/level-up.
- Alternative: add a `data.category` field to WS notifications and filter gameplay-category messages
  out in `handleGlobalWebSocketEvent.ts`.
- Reasoning: the issue's own proposed split maps 1:1 onto "does this event have a REST response to
  hang a callback on" — activity-complete and its level-ups do. Filtering client-side keeps the
  backend still doing pointless WS work (DB writes + broadcasts) for events that no longer need it,
  and adds a payload field/contract to maintain for no benefit. Removing the emitters is less code
  overall and avoids a class of "toast shown twice if WS is fast" races.

**b. Where to call `showToast` (real mutation `onSuccess` vs after `await stop()`)**
- Chosen: call `showToast` directly after `await stop()` resolves inside `handleSubmitActivity`
  (not a TanStack Query `onSuccess`), since `stop()` is a plain async method on `useActivityTimer()`,
  not a `useMutation`. Converting `stop()` into a `useMutation` is out of scope.
- Alternative: wrap `stop()` in a new `useMutation` so the toast lives in a real `onSuccess`.
- Reasoning: functionally identical (same resilience — no WS dependency), but avoids touching
  `useActivityTimer.ts`'s existing state machine (`status`, `autoStopCompletion`, auto-stop path) and
  the risk of duplicating that logic inside a mutation wrapper. Matches "reuse over new abstraction."

**c. Toast content source of truth**
- Chosen: derive the message inline in `ActivityTimer.tsx` from `stop()`'s `ActivityCompleteResponse`
  (`xp_gained`, `level_ups`), mirroring the copy the backend used to send ("Activity submitted. You got
  X XP!", "You levelled up! Now level N.").
- Alternative: keep composing the message server-side and return it as a new field on
  `ActivityCompleteResponse` (e.g. `toast_message`).
- Reasoning: the data needed (XP + level count) is already typed and present; building copy
  client-side avoids a backend contract change and keeps string content next to where it's rendered,
  consistent with how other UI copy is handled in this codebase (no existing precedent for
  server-composed toast strings).

**d. Auto-stop path**
- `autoStopCompletion` (populated only for `source === 'auto'`) already carries the same
  `xpGained`/`levelUps` fields. Decision: auto-stop also toasts — share the toast-building logic
  (XP/level-up message construction) between the manual `handleSubmitActivity` path and wherever
  `autoStopCompletion` is consumed, rather than duplicating the copy logic in two places.

**e. Zero-XP completions**
- Decision: suppress the toast entirely when `xp_gained === 0`. Avoids noise for trivial/instant
  activities; no fallback "Activity submitted" message is shown in this case.

**f. Quest-completion level-up notification scope**
- Decision: out of scope. Quests are not currently implemented, so `character_services.py`'s level-up
  `ServerMessage` emitter is presently dead code and is left untouched.

## 5. Edge cases

- **`stop()` throwing** (network error, 4xx/5xx): existing `catch` block already handles this — just
  needs to use the real `showToast` instead of the broken cast.
- **`level_ups` empty array**: message should read as XP-only ("You got X XP!") with no level-up line.
- **`xp_gained === 0`**: possible for a very short/instant activity — no toast is shown (see Design
  Decision e).
- **Multiple level-ups in one activity** (`level_ups.length > 1`): message summarizes to the highest
  level reached (see §8 Resolved decisions), not a list of every level gained.
- **`toastsFeature` still disabled for some users during rollout** (remote config override in
  `useAppConfig` could differ from the local default): `showToast` pushes into state regardless of the
  flag; `ToastManager` just won't render for flag-disabled users. No behavior change needed here —
  confirmed existing pattern in `ToastContext.tsx`.
- **Backward compatibility**: removing the two backend `ServerMessage` emitters is safe — no other
  consumer depends on activity-complete/level-up WS messages (only the frontend showToast call, which
  is being replaced). Confirm via grep before removal that no other WS-side consumer (e.g. another
  event handler keyed on this specific message text) exists.
- **Duplicate toast during the removal→adoption window**: if backend and frontend changes deploy in
  separate PRs, order matters — deploy backend removal first (or same PR) to avoid a period where both
  WS and REST toasts fire for the same event. Plan single PR or backend-first sequencing.

## 6. Tests

**Backend**
- Update/remove any test asserting a `ServerMessage` row (or WS broadcast) is created on
  `ActivityTimer.complete()` for the "Activity submitted..." message.
- Update/remove any test asserting a `ServerMessage` row is created on `Player.add_activity()` for the
  level-up message.
- Keep/verify tests asserting `xp_gained`/`level_ups` are still correctly computed and returned in the
  `/activity_timers/complete/` response — this contract is unchanged.

**Frontend**
- `ActivityTimer.tsx`: new test(s) asserting `showToast` is called with expected content for:
  XP-only, XP + single level-up, XP + multiple level-ups, and that it's *not* called (or shows a
  generic error) when `stop()` rejects.
- Confirm `handleGlobalWebSocketEvent.test` (if one is added) still calls `showToast` for non-gameplay
  WS `notification` messages — this path is unchanged.
- `useFeatureFlag`/`ToastContext` tests: no change expected, just confirm `toastsFeature: ['all']`
  doesn't break existing gating tests (they mock flag values directly, per research).

## 7. Risks

- **Touching the quest-completion emitter by mistake**: `character_services.py`'s level-up
  `ServerMessage` is confirmed out of scope (quests unimplemented) — don't remove or modify it as part
  of this issue; leave it untouched.
- **Double-toasting during rollout** if backend and frontend land in separate deploys out of order
  (see Edge Cases) — sequence carefully or ship in one PR.
- **Forgetting the auto-stop path**: auto-stop is confirmed in scope (§8) — easy to only wire the
  manual "Submit Activity" button and miss `autoStopCompletion`, leaving that path silent. Share the
  toast-building helper between both call sites to avoid this.
- **Message copy drift**: hand-writing frontend copy that no longer matches what the backend used to
  send could read oddly if only partially updated (e.g. forgetting the zero-XP suppression case or the
  multi-level-up summary case).

## 8. Resolved decisions

- **Auto-stop path**: also shows the toast. `autoStopCompletion` already carries `xpGained`/`levelUps`,
  so the same toast-building logic used for manual submit applies there too — wire both call sites.
- **Zero-XP completion**: suppressed. No toast when `xp_gained === 0` (avoids noise for trivial/instant
  activities); no "Activity submitted" fallback message.
- **Quests**: out of scope. Quests are not currently implemented, so the `character_services.py`
  level-up `ServerMessage` emitter is dead code today and is left untouched by this issue.
- **Multi-level-up wording**: summarize to the highest level reached (e.g. "Now level N."), not a list
  of every level gained.
