# Unified Timer + List Homepage Component — Implementation Plan

Base branch: new branch off `development` (this plan was drafted on
`feat/unified-timer-homepage-plan`, cut from `development` at `b4f0f6c`).
Reference-only: `claude/unified-activity-list-522` (not a base — see notes below
on which pieces are ported vs. rebuilt).

Feature flag: `unified_homepage` (new `FeatureFlagKey`, default `[]` = off for
everyone until explicitly enabled).

---

## Assumptions

These are read as given from the task brief; flagging them up front since the
plan depends on them:

1. "Homepage" = `frontend/src/pages/Game2/ActivityTimelinePage.tsx` (route
   `/timer`), not `frontend/src/pages/Home/Home.tsx` (logged-out marketing
   page). The latter has no timer/list and is out of scope.
2. Blank Start is expected to work with **no backend schema change** — the
   `ActivityTimer`/`PlayerActivity` models already allow a blank activity name
   (see Design decision 2). Only a new DRF action is needed.
3. "Attaches the selected label to the running timer" applies whenever a
   timer is active, regardless of whether it already has a label — i.e.
   picking a different list item while a *labelled* timer is running
   relabels it in place, not just the unlabelled→labelled case. (Flagged
   again under Open Questions in case that's not the intent.)
4. Mode suggestion buttons ("Task planning", "Free text") are presentational
   triggers only for this plan — their exact behaviour needs product input
   (see Open Questions) and is scoped to a late, isolated phase so the rest
   of the work isn't blocked on it.
5. No existing animation library is present in `frontend/package.json`, so
   "a single animation system" requires adding one (Design decision 5).

---

## 1. High-level strategy

Keep all business logic exactly where it already lives — `useActivityTimer`,
`useActivityInput`, `useEntitySearchInput`/`useEntitySearchCache` — and extend
it additively (new optional params/handlers, nothing existing changes
behaviour). Build a new presentational component tree,
`UnifiedTimerHome`, that consumes this shared logic and renders the three UI
states. Gate the whole new tree behind `useFeatureFlag("unified_homepage")`
in `ActivityTimelinePage.tsx`, exactly like the existing hook-level flag
branches elsewhere in the app (e.g. `ActivityTimeline.tsx:49`). The legacy
`CurrentActivity` / `ActivityInput` / `ActivityTimeline` components are not
touched, so flag-off is a strict no-op.

Two small, self-contained backend/shared-logic gaps need filling before the
UI work can start:

- **Blank timer start**: mechanically already supported server-side
  (`set_activity` tolerates an empty name); the frontend hook just needs its
  early-return guard relaxed for an explicit "start blank" call.
- **Relabel a running timer without losing progress**: the model already has
  `ActivityTimer.rename_activity()` and `ActivityTimer.change_task()`, but
  neither is exposed over the API — today the only way to change a timer's
  activity is `set_activity`, which discards elapsed time and resets status
  to `"waiting"` (`gameplay/models.py:432-458`). This plan adds one new DRF
  action that calls the existing model methods in place.

The reference branch (`claude/unified-activity-list-522`) contributes one
genuinely reusable, self-contained piece: `useDefaultActivityEntries.ts`
(task/activity grouping for the default list). Everything else on that
branch is treated as design reference only, per the task brief, because it
deletes `ActivityTimeline` outright and tangles the grouping logic with UI
changes that predate this flag/phase structure.

---

## 2. Files likely to change

**Backend**
| File | Change | Exists? |
|---|---|---|
| `gameplay/views.py` | New `label_activity` action on `ActivityTimerViewSet` | Yes, extend |
| `gameplay/tests/` (wherever `ActivityTimerViewSet` is tested) | New tests for the action | Yes, extend |

No model or migration changes — `rename_activity`/`change_task` already exist
(`gameplay/models.py:496-500`).

**Frontend — shared logic (additive only)**
| File | Change | Exists? |
|---|---|---|
| `frontend/src/featureFlags.ts` | Add `unified_homepage: []` | Yes, extend |
| `frontend/src/types/enums.ts` | Add `"unified_homepage"` to `FeatureFlagKey` | Yes, extend |
| `frontend/src/types/timers.ts` | Add `labelActivity` to `ActivityTimerReturn`; extend `StartActivityInput`/`startActivity` signature for blank-start | Yes, extend |
| `frontend/src/hooks/useActivityTimer.ts` | Relax blank-text guard for explicit blank start; add `labelActivity(name, taskId)` | Yes, extend |
| `frontend/src/hooks/useDefaultActivityEntries.ts` | New hook, ported from reference branch | New (ported) |
| `frontend/src/hooks/useDefaultActivityEntries.test.ts` | Ported test | New (ported) |
| `frontend/src/components/ActivityInput/useActivityInput.ts` | Add `handleBlankStart`, `handleUnifiedSelect`/`handleUnifiedSubmit` handlers | Yes, extend |
| `frontend/src/components/EntitySearchInput/useEntitySearchInput.ts` | Add optional `defaultResults`/`alwaysOpen` support (falls back to current behaviour when unused) | Yes, extend |
| `frontend/src/components/EntitySearchInput/EntitySearchInput.tsx` | Render default/persistent list when `alwaysOpen` | Yes, extend |

**Frontend — new presentational tree**
| File | Change | Exists? |
|---|---|---|
| `frontend/src/components/UnifiedTimerHome/UnifiedTimerHome.tsx` | New: three-state layout, uses shared hooks | New |
| `frontend/src/components/UnifiedTimerHome/UnifiedTimerHome.module.scss` | New | New |
| `frontend/src/components/UnifiedTimerHome/ModeSuggestions.tsx` | New, isolated (Phase 5) | New |
| `frontend/src/pages/Game2/ActivityTimelinePage.tsx` | Branch on `useFeatureFlag("unified_homepage")` | Yes, extend |
| `frontend/package.json` | Add animation dependency (Design decision 5) | Yes, extend |

**Tests**
- New Vitest unit tests for the extended hooks/handlers.
- New/extended Playwright spec covering flag-on and flag-off paths.

---

## 3. Implementation plan (phased, each phase leaves the app working with the flag ON and OFF)

**Phase 0 — flag scaffold**
Add `unified_homepage` to `featureFlags.ts` and `FeatureFlagKey`. No
consumers yet. Zero behaviour change.

**Phase 1 — backend: expose relabel-in-place**
Add `label_activity` action to `ActivityTimerViewSet`:
- Accepts `activityName` (string) and optional `task_id`.
- Requires timer status in `{"active", "waiting"}`; no-op/400 otherwise
  (mirrors the "attach label to running timer" scope — nothing to attach to
  if nothing is running).
- Calls `timer.rename_activity(name)`, and `timer.change_task(task)` if
  `task_id` provided (reusing `get_object_or_404(Task, pk=task_id,
  player=request.user.player)` exactly as `set_activity` does today, line
  ~157).
- Returns the same shape as `set_activity` (`{"success": True,
  "activity_timer": ...}`) for frontend consistency.
- Unused by any frontend code yet — safe to ship standalone. Add tests.

**Phase 2 — frontend: extend the timer hook**
- `useActivityTimer.startActivity`: change the guard from
  `if (!text?.trim()) return null;` to also allow an explicit
  `allowBlank: true` flag on the input object, defaulting to `false` so
  every existing caller is unaffected.
- Add `labelActivity(name, taskId)`: posts to the new endpoint, then updates
  local `currentActivity` optimistically (`{ text: name.trim(), taskId }`)
  without touching `elapsed`/`status`/`startTimeRef` — this is the key
  difference from `startActivity`, which resets all of those.
- Extend `ActivityTimerReturn`/`StartActivityInput` types accordingly.
- Unit tests: blank start leaves `status: "active"`, `currentActivity.text:
  ""`; `labelActivity` updates the name without resetting `elapsed`.

**Phase 3 — port the grouping hook**
- Add `useDefaultActivityEntries.ts` + its test, adapted from the reference
  branch to current `development` types (`PlayerActivity`, `CharacterActivity`,
  `Task`, `SearchEntity`) — the research pass confirmed the dependencies
  (`useGame`, `useTasks`, `useFeatureFlag`) already match current
  `development`, so this should be a near-verbatim port.
- Not wired into any UI yet — pure addition, covered by its own unit tests.

**Phase 4 — extend `useActivityInput` with unified handlers**
- `handleBlankStart()`: calls `startActivity({ text: "", allowBlank: true,
  limitSeconds: ... })` (same limit logic already in `handleToggle`/
  `handleCreateActivity`).
- `handleUnifiedSelect(entity)` / `handleUnifiedSubmit(text)`: if
  `!isActive`, delegate to existing `handleSelectActivity`/
  `handleCreateActivity`; if `isActive`, call `labelActivity(name, taskId)`
  instead (covers both unlabelled→labelled and relabel-while-labelled per
  Assumption 3).
- Derive `isUnlabelled = isActive && !(currentActivity?.name ??
  currentActivity?.text ?? "").trim()` for the new components to consume.
- These are net-new exports from the hook; `ActivityInput.tsx` (legacy)
  doesn't call them, so its behaviour is unchanged. Unit tests for the new
  branch logic.

**Phase 5 — extend `EntitySearchInput` for a persistent/default list**
- Add optional props: `alwaysOpen?: boolean`, `defaultResults?:
  SearchEntity[]`, `emptyMessage?: string`.
- When `alwaysOpen` is true and the query is blank, render `defaultResults`
  (fed by `useDefaultActivityEntries` from the call site) instead of hiding
  the dropdown; when there's a query, existing Fuse-based `results` take
  over unchanged.
- Existing callers (`ActivityInput.tsx`) don't pass these props, so nothing
  changes for them. Unit/RTL tests for the new prop combination.

**Phase 6 — `UnifiedTimerHome` component + wiring**
- Build the three-state layout (Input / Running-unlabelled /
  Running-labelled) using: `useActivityInput()` (extended),
  `useDefaultActivityEntries()`, extended `EntitySearchInput`, and the
  existing `Button` component for Start/Stop.
- Add the animation dependency (Design decision 5) and use it only inside
  this new tree.
- Branch `ActivityTimelinePage.tsx` on `useFeatureFlag("unified_homepage")`:
  render `UnifiedTimerHome` instead of `CurrentActivity` + `ActivityTimeline`
  when on. This is the only edit to a shared file in the whole plan, and
  it's a pure conditional — flag off renders byte-identical output to today.
- Component/RTL tests for state transitions; manual QA against real backend.

**Phase 7 — mode suggestion buttons (isolated, needs Open Questions resolved)**
- Add `ModeSuggestions.tsx`: dismissible buttons shown only in
  Running-unlabelled state, per Assumption 4. Kept as its own commit since
  its actual behaviour is unresolved (see Open Questions) and everything
  else in the plan works without it.

**Phase 8 — polish**
- Accessibility pass (`aria-live` on the timer, focus management across
  state transitions, list `role`/labelling consistency with existing
  `EntitySearchInput`/`List` patterns).
- Playwright coverage for flag-on happy path and flag-off regression guard.

---

## 4. Design decisions

**1. Flag branch point: hook-level in `ActivityTimelinePage.tsx`, not
`<FeatureToggle>`.**
`FeatureToggle` (`components/FeatureToggle.tsx`) renders a fallback
"coming soon" card when off — appropriate for gating an entire route, not
for swapping between two equally-real implementations. Precedent for
hook-level branching already exists (`ActivityTimeline.tsx:49`,
`NavDrawer.tsx:15`). Chosen because it matches the existing convention for
this exact kind of "same route, different UI" flag.

**2. Blank start: extend `startActivity` with an explicit `allowBlank` flag,
not a separate function.**
Alternative considered: a standalone `startBlankActivity()`. Rejected
because it would duplicate the optimistic-state-set / API-call / rollback
logic already in `startActivity` (`useActivityTimer.ts:100-183`) for no
benefit — the backend already accepts a blank name via the same
`set_activity` → `start` call sequence (`gameplay/views.py:150-152` coerces
missing/falsy names to `""`; `PlayerActivity.name` is `blank=True`). A single
function with an opt-in flag keeps one source of truth.

**3. Relabel-in-place: new `label_activity` DRF action calling existing
model methods.**
Alternatives considered:
- Reuse `set_activity` — rejected: `new_activity()` always creates a *new*
  `PlayerActivity` and resets `start_time`/`elapsed_time`/`status` to
  `"waiting"` (`gameplay/models.py:449-451`), which would wipe the running
  timer's progress every time a label is attached.
- Do it client-side only, sync the name to the server on stop (via the
  existing `complete(newName=...)` override) — rejected: the server-side
  `PlayerActivity` would carry a blank name for the full duration of the
  timer, and other surfaces (task views, admin, any mid-flight polling)
  would see a nameless activity until stop. The model already has exactly
  the right primitive (`rename_activity`) sitting unused; exposing it is a
  ~15-line view change vs. carrying a client/server divergence.

**4. List unification: extend `EntitySearchInput` with default-results
support, don't restyle `ActivityTimeline` in place.**
Directly required by the task brief ("Reuse the existing fuzzy entity search
as the single source for both default and filtered list results"). Restyling
`ActivityTimeline` would leave two independent list implementations
(recent-activities list + search dropdown) that need to be kept visually and
behaviourally consistent by hand.

**5. Animation: add a library (Framer Motion) scoped to the new component
tree, not hand-rolled CSS.**
The codebase currently has zero collapse/expand or list enter/exit animation
patterns — every existing transition is a simple property tween or infinite
pulse loop (`CurrentActivity.module.scss:47`, `ActivityInput.module.scss:88`).
The brief explicitly asks for "a single animation system capable of handling
both layout resizing and enter/exit animations consistently" across three
states — that's exactly `AnimatePresence` + the `layout` prop. Hand-rolling
an equivalent (e.g. `grid-template-rows` tricks for resize + manual
mount/unmount timers for enter/exit) would end up building a bespoke, harder
to maintain version of the same thing. Framer Motion is a natural fit for
React 19 and has no dependency conflicts with the existing stack. Scoping it
to `UnifiedTimerHome` only avoids any risk to the legacy tree.

---

## 5. Edge cases

- **Blank Start double-click**: existing `isActive`/button-disabled guards
  in `useActivityInput`/`ActivityInput` already prevent double-start; the
  same pattern (disable Start while `status !== "empty"`/`!== "waiting"`)
  applies to the new blank-start button.
- **Select/submit while a *labelled* timer is running**: per Assumption 3,
  relabels in place rather than being a no-op — confirm this is the
  intended reading before implementing Phase 4.
- **`label_activity` called after the timer already completed** (e.g. a
  queued UI event fires after Stop): the new action should check
  `timer.status in {"active", "waiting"}` server-side and return a 409/no-op
  otherwise, mirroring the guard already needed for "attach to nothing
  running."
- **Selecting a task-grouped row while unlabelled-running**: needs to both
  rename the activity *and* link it to the task (`change_task`), so
  `label_activity` must accept `task_id` the same way `set_activity` does
  today — not just a name.
- **Data downstream of blank-named `PlayerActivity` rows**: these are
  already possible in the DB today (`name` is `blank=True`) but previously
  unreachable through the UI. Before Phase 6 ships, verify
  `get_xp_reward_summary()`/serializers/admin list views don't assume a
  non-empty name (quick grep + a manual check, not a redesign).
- **Auto-stop (time-limit) firing while unlabelled**: `tickMain`'s auto-stop
  path (`useActivityTimer.ts:76-84`) submits
  `currentActivityRef.current?.name || currentActivityRef.current?.text` as
  the completion name — if that's still blank, `complete()` already handles
  a blank/no `newName` gracefully (keeps existing activity name, i.e. `""`).
  No special-casing needed, but worth a test.
- **Concurrent renames**: two rapid `label_activity` calls (e.g. fast
  double-select) — no explicit locking needed; each call is a simple
  in-place field update (`self.activity.rename(name)`), last-write-wins is
  acceptable for a single-user timer resource (same reasoning as existing
  `set_activity`/`complete` which have no locking either).

---

## 6. Tests

**Backend**
- `label_activity`: renames in place without resetting `elapsed_time`/
  `start_time`/`status`; optionally attaches `task_id`; 404/400 for a
  non-owned task; no-op/409 when timer isn't active/waiting; requires auth.

**Frontend unit (Vitest)**
- `useActivityTimer`: blank start (`allowBlank: true`) leaves timer active
  with empty name; rejects blank start without the flag (regression guard
  for existing callers); `labelActivity` updates name/taskId without
  touching `elapsed`.
- `useActivityInput`: `handleBlankStart`, `handleUnifiedSelect`/
  `handleUnifiedSubmit` branch correctly on `isActive`/`isUnlabelled`.
- `useDefaultActivityEntries`: port existing reference-branch test as-is,
  adjust only for any type drift found during Phase 3.
- `EntitySearchInput`/`useEntitySearchInput`: `alwaysOpen` + `defaultResults`
  renders the default list on blank query, existing Fuse behaviour still
  used once query is non-empty, and legacy callers (no new props) are
  pixel/behaviour-identical to today.

**Frontend component (RTL)**
- `UnifiedTimerHome`: renders Input state by default; Blank Start →
  Running-unlabelled (timer visible, list still visible, mode suggestions
  shown); submit/select → Running-labelled (list/input shrink or hide).

**E2E (Playwright)**
- Flag ON: full happy path — blank start, type or select a label, stop,
  activity appears correctly grouped in the list afterward.
- Flag OFF: existing `/timer` page renders unchanged (regression guard —
  extend whatever spec currently covers `ActivityTimelinePage`/
  `ActivityTimeline`, noted as a known flaky area in project memory:
  "Projects page heading not found" / WebKit nav a11y issues, so isolate
  this new spec rather than bolting onto the flaky one).

---

## 7. Risks

- **State bleed between the two presentational trees**: since
  `useActivityInput`/`useActivityTimer` are shared, a bug introduced while
  extending them (e.g. changing the meaning of an existing field) would
  silently break the legacy flag-off UI too. Mitigation: every extension in
  Phases 2–5 must be additive (new optional params/exports only); this
  should be explicitly checked in review, not just tested.
- **Reusing `new_activity()`/`set_activity` by mistake instead of the new
  `label_activity` action**: easy mistake for whoever implements Phase 6,
  since `set_activity` is the "obvious" existing endpoint — but it silently
  destroys running progress. Flag explicitly in the Phase 4/6 PR
  description.
- **New animation dependency**: first use of Framer Motion in this repo —
  bundle size and unfamiliarity risk. Mitigated by scoping usage to one
  component tree and by the flag itself (fully reversible by toggling off).
- **Default-list cap and dataset mismatch**: `useDefaultActivityEntries`
  (ported, cap of 4, sourced from `useGame().playerActivities/
  characterActivities`) and the Fuse-based filtered results (cap of 8,
  sourced from `useEntitySearchCache`'s full-history query) are different
  datasets with different caps. This is fine per the task brief's "single
  source for both default and filtered list results" (they share the same
  *component* and *search mechanism*, not literally the same array), but an
  implementer should not assume they can be trivially merged into one
  `useMemo`.

---

## 8. Open questions

1. Does relabelling apply to an already-labelled running timer (spec says
   "otherwise attaches the selected label to the running timer" with no
   unlabelled/labelled distinction), or should selecting a new item while a
   labelled timer is running be a no-op? (Assumption 3 currently reads it as
   "always relabels.")
2. What do the mode suggestion buttons ("Task planning", "Free text")
   actually do when clicked — prefill the input, open the existing
   `SupportFlowModal`, or something else? Phase 7 is isolated specifically
   so this can be resolved without blocking the rest of the plan.
3. Is there a target row count for the default/persistent list, or is the
   reference branch's `MAX_DEFAULT_ENTRIES = 4` acceptable to carry over
   as-is?
4. Any specific requirement for what happens to `handleUnifiedSelect` when
   the running timer is a *support-flow* activity (`useSupportFlow`
   integration in `useActivityInput.ts:185-215` has its own start path) —
   out of scope for this plan unless flagged otherwise, since the brief
   doesn't mention support mode.
