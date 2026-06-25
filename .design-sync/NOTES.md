# Design Sync Notes — Progress RPG

## Setup

- **Source shape**: `package` (no Storybook)
- **JSX not TypeScript** — no `.d.ts` files generated; component discovery relies entirely on `componentSrcMap`; prop contracts are weak (synthesized from JSX prop destructuring)
- **SCSS modules** — esbuild cannot handle `.module.scss` imports natively; solution: use Vite library build as a pre-compile step before running the converter
- **Build workflow**: `cd frontend && npx vite build --config vite.ds.config.js` → produces `frontend/dist-ds/index.es.js` + `frontend/dist-ds/frontend.css` → pass to converter with `--entry frontend/dist-ds/index.es.js`
- **Entry file**: `frontend/src/ds-entry.js` — add new component exports here when expanding scope
- **Vite config**: `frontend/vite.ds.config.js` — library mode, React externalized, CSS split disabled

## Known render warns

- `Button` renders blank (`bad=True`) because the floor card renders Button with no children; the empty `<button>` element produces a <5KB PNG. Fix: author `.design-sync/previews/Button.tsx` with a `<Button>Label</Button>` render, or add `"Button": "children: React.ReactNode;"` to `dtsPropsFor`.
- `ButtonFrame` shows the typographic floor card correctly (`fallbackCard=True`).

## Expanding component scope

All components need to be:
1. Added to `frontend/src/ds-entry.js` (re-export)
2. Added to `cfg.componentSrcMap` in `.design-sync/config.json`
3. Vite build + converter re-run

App-coupled components to **exclude** (require auth context, WebSocket, API calls):
- `PlayerSocketListener`, `MaintenanceWatcher`, `CharacterCurrentActivity`, `CurrentActivity`, `Achievements`, `ActivityInput`, `ActivityTimeline`, `FeedbackWidget`, `Map`, `EntitySearchInput`, `PopulationCentreResidents`, `PlayerItemList`, `PrivateRoute`, `RequirePremium`

Good candidates for next sync:
- `Input`, `Form`, `Modal`, `List`, `ProgressBar`, `StaticBanner`, `BackToTopButton`, `ErrorFallback`, `FeatureToggle`, `Seo`

## Re-sync risks

- `frontend/dist-ds/` is gitignored — must rebuild Vite before running converter on a fresh clone
- Class name hashes in Vite output are stable (based on file path) but will change if component files are moved
- No TypeScript means `dtsPropsFor` entries will be needed for any component with complex prop types
- `ds-entry.js` must be kept in sync with `componentSrcMap` — a mismatch means bundle has a component the converter doesn't know about (or vice versa)
