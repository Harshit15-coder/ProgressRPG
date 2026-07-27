# Design Sync Notes — Progress RPG

## Setup (current: storybook shape)

- **Source shape switched `package` → `storybook`** (2026-07-11) — the repo added a real Storybook (`frontend/.storybook`) after the first sync. `cfg.shape` is now `"storybook"`, `cfg.storybookConfigDir` = `frontend/.storybook`, `cfg.storybookStatic` = `.design-sync/sb-reference`.
- The old package-shape authored previews (`Button.tsx`, `ButtonFrame.tsx`, hand-composed, no reference render) don't apply under the storybook shape (previews are now compiled from the real `*.stories.tsx` files instead) — deleted after confirming the storybook-shape sync worked end to end.
- **`frontend/package.json` now has `"types": "dist-ds/ds-entry.d.ts"`** and `frontend/vite.ds.config.js` uses `vite-plugin-dts` (`tsconfigPath: './tsconfig.ds.json'`, `rollupTypes: true`). This is required: storybook-shape component discovery (`exported = exportedNames(...)`) is 100% `.d.ts`-driven — with no `.d.ts` the converter finds 0 exports and drops every storied component (`[TITLE_UNMAPPED]`, "0/7 storybook components are public exports"). `componentSrcMap` does NOT feed this gate in storybook shape (only package shape).
- **`frontend/tsconfig.ds.json`** is a narrow tsconfig (extends `tsconfig.json`, `include` limited to `ds-entry.js` + the exported components' dirs, `exclude` test/story files) — needed because the full app tsconfig has unrelated pre-existing type errors (`ActivityInput`, `useGroups`) that would otherwise block `.d.ts` generation, and because scanning `*.test.tsx` pulls in `@testing-library/jest-dom` matcher types that aren't set up for this narrow program.
- **`frontend/src/ds-entry.js`** must list every component that has a `.stories.tsx` file (re-export from its real `.tsx`) — Button, ButtonFrame, Tooltip, ProgressBar, Input, Form, Modal, AlertDialog. Keep this in sync when new stories are added.

## Known render warns

- `[GRID_OVERFLOW]` on AlertDialog and Modal (Radix portal dialogs) → `cfg.overrides.<Name>: {"cardMode": "single", "primaryStory": "Default"}`.
- `[GRID_OVERFLOW]` on Form and Tooltip (stories wider than a grid cell) → `cfg.overrides.<Name>: {"cardMode": "column"}`.
- These are all recorded in `.design-sync/config.json`'s `overrides` — a future full rebuild should not re-surface them; if it does, the targeted rebuild loop (`preview-rebuild.mjs --components <names>`) is the fix, no re-grade needed (presentation-only keys aren't in the grade contract).

## `[BUNDLE_EXPORT]` / "Dynamic require of react" — root cause and fix (important, don't re-debug this)

The very first storybook-shape build failed every component render with `Error: Dynamic require of "react" is not supported`. Root cause: `frontend/vite.ds.config.js`'s `rollupOptions.external` only listed `'react'` and `'react-dom'` — NOT `'react/jsx-runtime'` / `'react/jsx-dev-runtime'`, the bare specifiers Vite's automatic-JSX transform actually imports. Since those weren't external, Vite/Rollup bundled a REAL copy of React's `jsx-runtime` source directly into `dist-ds/index.es.js`; that real module does its own internal `require("react")`, which esbuild's IIFE shim can't satisfy in a browser (no `require` global) — hence the throw, breaking every preview identically since they all load the same `_ds_bundle.js`.

**Fix, already applied**: `vite.ds.config.js` externals now include `/^react\/jsx-runtime$/`, `/^react\/jsx-dev-runtime$/`, and `/^react-dom\/.*/`. If a future React/Vite upgrade reintroduces this, the symptom is identical for EVERY component (not just one) and the tell is `grep -c 'jsx-runtime' frontend/dist-ds/index.es.js` returning a large match count (real source) instead of just the `import` line at the top (external, correctly stripped).

## Portal components and `sb-error` ("no storybook root content")

AlertDialog and Modal wrap Radix primitives whose `Root` renders nothing into `#storybook-root` — `Portal` mounts `Overlay`/`Content` straight to `document.body`. `compare.mjs`'s storybook-side capture only waits on `#storybook-root, #root` content, so it always reports `sb-error: "no storybook root content"` for these two components — this is a permanent structural fact, not a broken story, and there's no `cfg` knob to fix the harness's root-check.

**Resolution used**: verified manually — a throwaway playwright script (deleted after use) loaded both the storybook `iframe.html?id=...` and the preview `.html?story=...` and took `fullPage` screenshots (not just the `#storybook-root` element) for all 7 affected stories (3 AlertDialog + 4 Modal). All matched pixel-for-pixel. Wrote `{"verdict": "match", "basis": "manual-fullpage", "note": "..."}` directly into `.design-sync/.cache/compare/{AlertDialog,Modal}.grade.json`. Confirmed this is honored: `compare.mjs`'s `pendingGrade` check reads `grade.stories[name].verdict` for every story regardless of the harness's own recorded verdict (sb-error included) — a manual grade entry legitimately clears `pendingGrade`. Re-running `compare.mjs` after this correctly reports "carried forward — fully graded" for both.

If either component's stories change, this grade clears (source hash changes) and the manual full-page verification must be redone the same way — there is no automated re-check for this specific gap.

## Expanding component scope

All components need to be:
1. A real `*.stories.tsx` file (title `Shared/<Name>`, args covering the useful variants).
2. Re-exported from `frontend/src/ds-entry.js`.
3. `cd frontend && npx vite build --config vite.ds.config.js` (regenerates `dist-ds/` incl. `.d.ts`), then re-run the converter driver.

App-coupled components to **exclude** (require auth context, WebSocket, API calls):
- `PlayerSocketListener`, `MaintenanceWatcher`, `CharacterCurrentActivity`, `CurrentActivity`, `Achievements`, `ActivityInput`, `ActivityTimeline`, `FeedbackWidget`, `Map`, `EntitySearchInput`, `PopulationCentreResidents`, `PlayerItemList`, `PrivateRoute`, `RequirePremium`

Good candidates for next sync (add a `.stories.tsx` first): `List`, `StaticBanner`, `BackToTopButton`, `ErrorFallback`, `FeatureToggle`, `Seo`.

## Re-sync risks

- `frontend/dist-ds/` is gitignored — must rebuild (`buildCmd`) before running the converter on a fresh clone; `.design-sync/sb-reference/` is also gitignored and gets rebuilt via `npx storybook build -c frontend/.storybook -o <repo-root>/.design-sync/sb-reference` (must be run from `frontend/` so the storybook devDependencies resolve; `-o` must be the repo-root-relative path or the reference lands somewhere the converter won't find it).
- The AlertDialog/Modal manual-grade workaround (above) is NOT re-verified automatically — a re-sync that shows these two components as `pendingGrade` again (source changed) needs the manual full-page screenshot comparison repeated, not just a normal `compare.mjs` capture+grade.
- `vite-plugin-dts`'s `rollupTypes: true` type-checks against `tsconfig.ds.json`, not the full app tsconfig — if a synced component starts importing something outside its current include scope, add that path to `tsconfig.ds.json`'s `include` list or the `.d.ts` generation will error/omit it.
- Class name hashes in Vite output are stable (based on file path) but will change if component files are moved.
