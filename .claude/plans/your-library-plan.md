# Your Library — Implementation Plan

Branch: `feat/your-library-page` (off `development`)
Feature flag: `your_library` (default `[]`, off)

---

## Assumptions

- Scope is three tabs: **Tasks**, **Activities**, and **Skills** (Activities added after the original brief was found to have missed it — the Activity Timeline / activity history page was always meant to fold into Library alongside Tasks). Categories and Projects are dropped entirely for this pass — not built as placeholders, not referenced in nav or tabs. Can be added later as their own follow-up.
- Tab order: Tasks, Activities, Skills — the two functional tabs first (matching their relative prominence in the current standalone nav), placeholder last.
- `ActivitiesPage` folds in the same way as `TasksPage` — reused wholesale, unconditionally, with its own `<h1>` suppressed via the same `showHeading` prop pattern. The standalone `/activities` route and its nav link are hidden (not removed) once `your_library` is ON, exactly like `/tasks`.
- `/tasks`, `/activities`, and `/projects` standalone routes are left in place, untouched, and still reachable by direct URL when `your_library` is ON. Only scope is nav + a new tabbed page; removing/redirecting old routes is out of scope.
- No deep-linking to a specific tab (e.g. `/library/skills`); a single `/library` route with client-side tab state is sufficient — matches "information architecture refactor, not a redesign."
- Tasks and Activities tabs are always usable inside Your Library regardless of the existing `tasksFeature` flag (Activities was never behind a flag) — Library is the new home for both and shouldn't be gated by the old flag.
- Skills tab is **not** gated behind the existing `skillsPage` flag. That flag exists to stage rollout of the real Skills feature; the tab is currently a static, harmless "Coming soon" placeholder with nothing to stage. Tying tab visibility to `skillsPage` would just add a second switch that has to move in lockstep with `your_library` for no behavioural benefit — when real Skills functionality ships, `skillsPage` becomes relevant again for gating *that content*, not the tab itself. Skills tab is always visible whenever `your_library` is on.
- Nav entry icon: reuse an unused emoji (📚) for "Your Library"; not specified in the brief, low-stakes, easy to change later.
- "Coming soon" placeholder uses the existing `FeatureToggle` fallback card copy/style as visual precedent, but is implemented as a dedicated small component (see below) since it lives inside a tab, not behind `FeatureToggle`.

---

## 1. High-level strategy

Add a new `LibraryPage` with Radix `Tabs` (already used in `ActivityInputScreen`) containing three tabs: Tasks, Activities, and Skills. The Tasks and Activities tabs mount the existing `TasksPage` and `ActivitiesPage` components verbatim — zero logic duplication. The Skills tab renders a new `ComingSoonPanel` placeholder component that mimics their layout shape (header + empty state box) so swapping in real CRUD later is a content change, not a structural one. Categories and Projects are out of scope for this pass (see assumptions).

Route `/library` is gated by a new `your_library` feature flag via the existing `FeatureToggle` pattern. `Navbar`/`NavDrawer` conditionally show either the legacy "Tasks" + "Activities" links (flag off) or a single "Your Library" link (flag on) — never both.

## 2. Files likely to change

| File | Change | New? |
|---|---|---|
| `frontend/src/types/enums.ts` | add `"your_library"` to `FeatureFlagKey` | existing |
| `frontend/src/featureFlags.ts` | add `your_library: []` | existing |
| `frontend/src/routes/routePaths.js` | add `"/library"` | existing |
| `frontend/src/routes/routesConfig.jsx` | add `/library` route, lazy-loaded, wrapped in `PrivateRoute` + `FeatureToggle flag="your_library"` | existing |
| `frontend/src/layout/Navbar/Navbar.tsx` | conditional nav entry (desktop + mobile icon nav); also folds the standalone Activities link | existing |
| `frontend/src/layout/NavDrawer/NavDrawer.tsx` | conditional nav entry; same Activities fold | existing |
| `frontend/src/pages/ActivitiesPage.tsx` | add `showHeading` prop (same pattern as `TasksPage`), default `true` | existing |
| `frontend/src/pages/LibraryPage/LibraryPage.tsx` | new tabbed container (Tasks + Activities + Skills) | new |
| `frontend/src/pages/LibraryPage/LibraryPage.module.scss` | tab bar + page layout styles | new |
| `frontend/src/pages/LibraryPage/LibraryPage.test.tsx` | tab behaviour tests | new |
| `frontend/src/components/ComingSoonPanel/ComingSoonPanel.tsx` | placeholder for Skills tab, `itemLabelPlural` prop (kept generic so it's reusable if Categories/Projects are added later) | new |
| `frontend/src/components/ComingSoonPanel/ComingSoonPanel.module.scss` | mirrors `TasksPage`/`ActivitiesPage` empty-state/header spacing | new |
| `frontend/src/components/ComingSoonPanel/ComingSoonPanel.test.tsx` | renders label, no actions | new |
| `frontend/src/layout/Navbar/Navbar.test.tsx` (if exists) | update for new flag branch | existing |
| `frontend/src/layout/NavDrawer/NavDrawer.test.tsx` (if exists) | update for new flag branch | existing |

No backend changes — this is a pure frontend IA refactor.

## 3. Implementation plan

**Phase 1 — flag + route + skeleton page (no nav change)**
- Add `your_library` to `FeatureFlagKey` and `featureFlags.ts`.
- Add `showHeading` prop to `ActivitiesPage` (mirrors `TasksPage`'s existing prop), default `true`.
- Build `ComingSoonPanel` (label prop, header + "Coming soon" empty state — no CRUD affordances of any kind).
- Build `LibraryPage`: Radix `Tabs.Root` (`defaultValue="tasks"`), `Tabs.List` with Tasks/Activities/Skills triggers, `Tabs.Content` per tab. Tasks tab renders `<TasksPage showHeading={false} />`, Activities tab renders `<ActivitiesPage showHeading={false} />`, both unconditionally (not gated by `tasksFeature`). Skills tab renders `<ComingSoonPanel itemLabelPlural="skills" />`, unconditionally (not gated by `skillsPage`).
- Add `/library` route (`PrivateRoute` + `FeatureToggle flag="your_library"`), add path to `routePaths.js`.
- Flag OFF: route inert (unreachable via nav, `FeatureToggle` fallback if visited directly). Flag ON: `/library` fully functional but not yet linked from nav. App behaviour otherwise unchanged either way.

**Phase 2 — navigation wiring**
- `Navbar.tsx`: compute `isLibraryEnabled = useFeatureFlag("your_library")`. When true, render a single "Your Library" link (`/library`, 📚) in place of both the existing Tasks link and the always-on Activities link; when false, both existing branches are untouched. Same for the mobile icon nav's active-state checks (`isTasksPage`/`isActivitiesPage` → also treat `/library` prefix as active for the Library entry).
- `NavDrawer.tsx`: same conditional swap, folding both Tasks and Activities into the single Library entry.
- Flag OFF: nav identical to today (Timer, Activities, Tasks-if-enabled, Account, Log out). Flag ON: nav shows Timer, Your Library, Account, Log out; page fully reachable and usable.

**Phase 3 — tests & polish**
- `LibraryPage.test.tsx`: default tab is Tasks; switching tabs renders the right panel (Activities, then Skills); placeholder tab renders no buttons/inputs.
- `ComingSoonPanel.test.tsx`: renders label text, no interactive CRUD elements.
- Update `Navbar`/`NavDrawer` tests for both flag states.
- Manual a11y pass on the new tab bar (Radix handles roving tabindex/ARIA, but verify focus order and screen-reader labelling against existing patterns).

Each phase leaves `main`/`development` buildable and behaviourally correct with the flag both ON and OFF.

## 4. Design decisions

**Reuse `TasksPage` and `ActivitiesPage` wholesale instead of extracting shared hooks/components**
- Chosen: mount `<TasksPage />` and `<ActivitiesPage />` directly inside their respective `Tabs.Content`. Both are already self-contained (own data fetching, own `<h1>`; `TasksPage`'s only side effect is `navigate("/timer")` on start, which works from any parent route; `ActivitiesPage` has no navigation side effects at all).
- Alternative: extract each page's hook + JSX into a shared presentational component consumed by both the standalone route and the Library tab. Rejected — `/tasks` and `/activities` stay as dormant standalone routes per assumptions, so a second consumer isn't needed yet; introducing an extraction layer now is speculative abstraction for two reuse sites that don't need it.
- Minor cleanup needed for both: each page's own `<h1>` would duplicate the Library page's "Your Library" heading + tab label — suppress via a `showHeading` prop (already added to `TasksPage`; same small, justified change applied to `ActivitiesPage`) rather than fighting CSS-module scoping across files.

**`ComingSoonPanel` as a standalone reusable component, not inline JSX in `LibraryPage`**
- Chosen: small standalone component parameterized by label, even though only one tab (Skills) uses it right now.
- Alternative: inline the placeholder markup directly in `LibraryPage`. Rejected — a named, parameterized component costs almost nothing and is the natural drop-in point if Categories/Projects (or other placeholders) are added later; inlining would mean re-extracting it at that point anyway.

**Skills tab not gated behind the `skillsPage` flag**
- Chosen: Skills tab visibility depends only on `your_library`; the placeholder is always shown once Library ships.
- Alternative: also require `skillsPage` to be truthy before showing the tab. Rejected — `skillsPage` is meant to stage the *real* Skills feature's rollout; the placeholder has no functionality to stage, so gating it adds a second flag to keep in sync for no behavioural benefit. Revisit `skillsPage` when real Skills CRUD replaces the placeholder content.

**Radix `Tabs` for tab navigation**
- Chosen: already a project dependency, already used in `ActivityInputScreen.tsx`, accessible by default.
- Alternative: custom tab implementation. Rejected — no reason to reinvent, inconsistent with existing pattern.

**Nav entry replaces rather than supplements the Tasks and Activities links**
- Chosen: when `your_library` is ON, "Your Library" fully replaces both "Tasks" and "Activities" in `Navbar` and `NavDrawer`.
- Alternative: show all links side by side. Rejected — brief specifies "the main navigation entry should be Your Library," implying consolidation, not addition; keeping a redundant standalone Activities link defeats the point of folding it in.

## 5. Edge cases

- Direct navigation to `/library` with flag OFF → standard `FeatureToggle` fallback ("Coming soon" card), consistent with `tasksFeature`/`projectsPage` today.
- `your_library` ON but `tasksFeature` OFF: Tasks tab must still work (Library's Tasks tab is intentionally independent of the legacy flag — see assumptions). Activities was never gated, so no equivalent concern there.
- Nav active-state highlighting: `/library` (and any future sub-paths) should mark the "Your Library" nav item active, not "no item active." Both the old `isTasksPage` and `isActivitiesPage` checks are superseded by `isLibraryPage` when the flag is on.
- No data/model changes, so no migration or backwards-compatibility concerns.
- Existing `/tasks`, `/activities`, and `/projects` E2E/Playwright tests should keep passing unchanged since those routes/components aren't modified.

## 6. Tests

- New: `LibraryPage.test.tsx` — default tab is Tasks, tab switching shows Activities then Skills panels, Skills panel has no actionable controls.
- New: `ComingSoonPanel.test.tsx` — renders given label, no buttons/inputs present.
- Modify: `Navbar.test.tsx` / `NavDrawer.test.tsx` (if present) — assert Tasks+Activities links shown when `your_library` off, Your Library link shown when on, never both.
- No changes needed to `TasksPage.test.tsx`, `ActivitiesPage.test.tsx`, `SkillsPage.test.tsx`, `CategoriesPage.test.tsx`, `ProjectsPage.test.tsx` — those components/routes are untouched (beyond the additive `showHeading` prop, which defaults to preserving current behaviour).
- Consider one Playwright smoke test: flag on → `/library` loads, tabs switch, Tasks tab supports add/edit/delete (reusing existing Tasks E2E assertions if any exist).

## 7. Risks

- Forgetting to make the Tasks/Activities tabs independent of `tasksFeature` — would silently break Library for users who don't have the old flag, contradicting "reuse existing functionality."
- Double `<h1>` / heading hierarchy issues from mounting `TasksPage`/`ActivitiesPage` inside `LibraryPage` — an a11y regression if not addressed with proper heading levels via `showHeading`.
- Nav active-state logic drifting (e.g. `/library` not matching any `isXPage` check) — item never highlights as active, minor but noticeable.
- Accidentally wiring `ComingSoonPanel` with a real add-form input that posts nowhere (must have zero CRUD affordances, per spec — no inputs/buttons, not just disabled ones, to avoid confusing "why doesn't this work" UX).
- Conflating `skillsPage` and `your_library` flags during implementation (e.g. a stray `useFeatureFlag("skillsPage")` check creeping into the Skills tab) — would contradict the explicit decision above.
- Forgetting to fold the *Activities* nav link specifically (easy to remember Tasks since it was already flag-gated, easier to overlook Activities since it's always-on today).

## 8. Open questions

- Confirm `📚` (or any icon) is acceptable for the "Your Library" nav entry, or if a specific icon/asset should be used.
- Should the old `/tasks`/`/activities` routes eventually redirect to `/library` once this ships, or stay as separate dormant entry points indefinitely? (Out of scope for this plan either way — flagging for a future decision.)
- When Categories/Projects are picked back up, do they get added as more `ComingSoonPanel` tabs in this same page, or reconsidered as part of a separate follow-up plan?
