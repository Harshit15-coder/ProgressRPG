# Richer building/character tooltips + crop-stage field visuals

## 1. High-level strategy

The map already renders buildings, characters, and crop subzones as GeoJSON
features (`PopulationCentreMapView` in `locations/views.py`), with tooltip
text computed ad hoc in `Map.tsx`'s `polygonTooltipContent()` from whatever
is in `properties`. Today `properties` is minimal (id/name/type only) for
every feature kind, so there's no data to build a richer tooltip from.

The plan is purely additive on both ends:

- **Backend**: extend the three feature serializers
  (`BuildingFeatureSerializer`, `CharacterPointFeatureSerializer`,
  `SubzoneFeatureSerializer`) to include the extra properties needed, and
  extend `PopulationCentreMapView.get()`'s querysets to fetch what those
  serializers need (`select_related`/`prefetch_related`, no N+1 growth per
  feature). Add one small presentation helper for hunger wording, mirroring
  `format_quantity`'s existing home in `economy/constants.py`.
- **Frontend**: replace the string-only tooltip content with structured
  per-feature-type tooltip components (still rendered inside the existing
  `<Tooltip content={...}>` wrapper, since `content` already accepts
  `ReactNode`), and make crop-subzone fill colour depend on the new `stage`/
  `progress` properties instead of the current flat `FIELD_FILL`.

No new endpoints, no new models, no new inventory/metadata system — this is
"add fields to existing serializers, add presentation logic to existing
components."

## 2. Files likely to change

- `locations/serializers.py` (exists) — extend `BuildingFeatureSerializer`,
  `CharacterPointFeatureSerializer`, `SubzoneFeatureSerializer` with new
  properties.
- `locations/views.py` (exists) — `PopulationCentreMapView.get()`: adjust
  querysets so the new serializer fields don't trigger N+1 queries
  (`prefetch_related` for building workers/goods, `select_related`/
  `prefetch_related` for character home/work/needs).
- `character/models/needs.py` (exists) — add a small `hunger_label()` method
  or module-level helper for player-friendly wording (see Design decisions).
- `economy/models.py` / `economy/constants.py` (exist) — no change to
  `FieldCrop` itself; add a small helper (property or function) that derives
  a 0–1 growth progress fraction from `planted_at` + `GROWTH_DURATION`, for
  the frontend to use in field colouring.
- `frontend/src/components/Map/Map.tsx` (exists) — replace string tooltip
  builders with structured content per feature type; add stage-based field
  fill/colour logic.
- `frontend/src/components/Map/` — possibly one new small file,
  `MapTooltips.tsx` (or similar), for the building/character tooltip content
  components, to keep `Map.tsx` from growing an unrelated JSX block. Not
  strictly required — could stay inline in `Map.tsx` if kept short.
- `locations/tests.py`, `economy/tests/` (exist) — extend/add serializer
  tests for the new properties; add a small test for the growth-progress
  helper.
- `frontend` component/unit tests, if any exist for `Map.tsx` (need to check
  at implementation time) — add cases for the new tooltip content and field
  colour selection.

No changes needed to `character/serializers.py`'s main `CharacterSerializer`
(used elsewhere, e.g. profile pages) — the map's character tooltip data goes
through `CharacterPointFeatureSerializer` only, which is map-specific.

## 3. Implementation plan

1. **Building workers + goods inventory (backend)**
   - In `BuildingFeatureSerializer.get_properties()`, add:
     - `workers`: count of `CharacterLocation` rows for this building with
       `role=WORK, is_primary=True` (reuses the same query shape already
       used in `economy_forecast.py`).
     - `goods`: list of `{good_type, display}` for this building's
       `GoodsStock` rows with `quantity > 0`, using the existing
       `economy.constants.format_quantity(good_type, quantity)` — this is
       exactly the "existing human-friendly formatting" the user asked to
       reuse, no new formatting logic needed.
   - In `PopulationCentreMapView.get()`, prefetch what's needed:
     `Building.objects.prefetch_related("character_locations", "goods_stock")`
     (adjust related_name to whatever `GoodsStock.building`'s FK actually
     uses — confirm at implementation time) instead of the current bare
     `population_centre.buildings.all()`.
2. **Character home/work/hunger (backend)**
   - In `CharacterPointFeatureSerializer.get_properties()`, add:
     - `home`: name of the character's primary `CharacterLocation` with
       `role=HOME` (or `None`).
     - `work`: name of the character's primary `CharacterLocation` with
       `role=WORK` (or `None`, since not everyone has a job).
     - `hunger_label`: player-friendly string from the new hunger-wording
       helper (see step 4), or `None` if the character has no `CharacterNeeds`
       row yet.
   - Adjust the `characters = population_centre.residents.only(...)` query
     to `select_related("needs")` and `prefetch_related("locations__location")`
     (or equivalent) so home/work/hunger don't each cost a query per
     character.
3. **Crop stage + growth progress (backend)**
   - Add a small helper — a `FieldCrop.growth_progress` property (0.0–1.0,
     `None` when not `GROWING`) computed from `(now - planted_at) /
     GROWTH_DURATION`, clamped to `[0, 1]`. `FALLOW` → no field crop / not
     applicable; `READY` → progress is moot (already at "ready" visual).
   - In `SubzoneFeatureSerializer.get_properties()`, when the subzone has an
     associated `FieldCrop` (via `subzone.fieldcrop` reverse OneToOne — name
     to confirm at implementation time), add `crop_stage` (`fallow`/
     `growing`/`ready`) and `crop_progress` (float or `None`).
   - `PopulationCentreMapView.get()`: change the crop-subzone queryset to
     `select_related("fieldcrop")` so this is one extra join, not N+1.
4. **Hunger wording helper (backend)**
   - Add a small tiered mapping (e.g. 4–5 bands across `0..HUNGER_MAX`) as a
     function near `CharacterNeeds`, e.g. `CharacterNeeds.hunger_label()` —
     "Well fed" / "Peckish" / "Hungry" / "Starving" or similar (exact wording
     TBD, see Open questions). Pure presentation, no new stored field.
5. **Frontend: building tooltip content**
   - Replace the building branch of `polygonTooltipContent()` with a small
     component/function that renders: building type label (existing
     `BUILDING_TYPE_LABELS` lookup, unchanged), `Workers: N` (only if
     `workers` property present/non-null), and an "Inventory:" list from
     `goods` (only entries with stock — the backend already filters
     `quantity > 0`, so the frontend just renders what it's given; empty
     list → no "Inventory" heading at all).
6. **Frontend: character tooltip content**
   - Replace the character tooltip's `content={f.properties?.name}` with a
     small component rendering: name, `Lives at: {home}` (omit line if
     `home` is null), `Works at: {work}` (omit if null), and the
     `hunger_label` string on its own line.
7. **Frontend: field visuals**
   - Replace the single `FIELD_FILL` constant with a small
     `fieldFillFor(stage, progress)` function: fallow → a neutral
     brown/tan; growing → a green that interpolates (e.g. HSL lightness or a
     2–3 step lookup) with `progress`; ready → the existing golden
     `FIELD_FILL` colour repurposed as the "mature" colour. Applied in the
     polygon `fill=...` branch alongside the existing `isCropSubzone` check.
8. **Tests**
   - Backend: serializer tests for the three extended serializers (new
     properties present/absent/shaped correctly); a test for
     `FieldCrop.growth_progress` at start/mid/end of `GROWTH_DURATION`; a
     test for the hunger-label boundaries.
   - Frontend: extend/add `Map.tsx` tests (if a test file exists — confirm
     at implementation time) for tooltip content assembly and field-colour
     selection given mock `properties`.

## 4. Design decisions

**Reuse `CharacterPointFeatureSerializer`/`BuildingFeatureSerializer`/
`SubzoneFeatureSerializer` rather than switching the map to the general
`CharacterSerializer`/`BuildingSerializer`.**
- Alternative: have the map response embed the full existing
  `CharacterSerializer`/`BuildingSerializer` objects instead of the slim
  GeoJSON-property versions.
- Rejected: those serializers carry many fields irrelevant to the map
  (xp, coins, description, etc.), bloating every map poll (already firing
  every 10s per `MAP_POLL_INTERVAL_MS`). The GeoJSON feature serializers
  exist specifically to keep map payloads slim; adding a handful of
  targeted fields to them fits that intent better than swapping in a
  heavier general serializer.

**Compute `goods` display strings server-side (via `format_quantity`)
rather than sending raw quantities for the frontend to format.**
- Alternative: send `{good_type, quantity}` and duplicate
  bread/flour/sack-rounding logic in the frontend.
- Rejected: `format_quantity()` is the established single source of truth
  for this formatting (per the just-completed goods-display work); doing it
  server-side avoids a second implementation of loaf/sack rules in
  TypeScript and keeps the frontend a pure renderer of already-correct
  strings.

**`growth_progress` as a computed property, not a stored field.**
- Alternative: store a `progress` field on `FieldCrop`, updated by the daily
  tick in `economy/tasks.py`.
- Rejected: progress is fully derivable from `planted_at` + the constant
  `GROWTH_DURATION` at read time, with no simulation behaviour depending on
  it — storing it would be a second source of truth that must be kept in
  sync with the tick for no benefit (mirrors why `FieldCrop` doesn't already
  store a duplicate of `stage`'s trigger condition).

**Hunger wording lives on `CharacterNeeds`, not in the serializer or a new
`economy`-style constants dict.**
- Alternative: a `GOOD_TYPE_FORMATTER`-style dict of thresholds in
  `economy/constants.py`, matching the goods-formatting convention.
- Considered, but hunger isn't a per-good_type concept — it's a single
  numeric stat with fixed bands, more naturally a method on the model that
  owns the stat (`CharacterNeeds`), consistent with keeping "business logic
  in models.py" per this repo's conventions. `economy/constants.py` already
  owns `HUNGER_MAX`/`HUNGER_PER_MISSED_MEAL`; the label thresholds can still
  reference `HUNGER_MAX` from there without needing to live in the same
  file.

**No building "status/activity" and no character "current activity" yet.**
- Explicitly deferred per the user's instruction — `Behaviour`/activity
  state exists elsewhere in the codebase but isn't considered reliable
  enough yet for tooltip display. Not touched by this plan.

**Field visual stays a fill-colour change, not a new sprite/icon system.**
- Alternative: swap in distinct SVG patterns/icons per stage.
- Rejected as disproportionate to the ask ("golden/mature appearance",
  "green, optionally varying with growth") — a colour/interpolation change
  fits the existing flat-fill rendering approach with no new asset
  pipeline.

## 5. Edge cases

- **Building with no workers and no goods**: `workers` should still report
  `0` (not omitted) since "Workers: 0" is meaningful; `goods` is an empty
  list, and the frontend renders no "Inventory" section at all (only show
  goods with stock, per the user's requirement, and no section when there's
  nothing to show).
- **Character with no home/work assigned**: `home`/`work` are `None`; the
  frontend tooltip omits those lines entirely rather than printing "Lives
  at: null" or similar. NPC characters without a `CharacterNeeds` row
  (should not happen post-signal-creation, but defensively): `hunger_label`
  falls back to `None` and the frontend omits that line too.
- **Subzone with no associated `FieldCrop` yet** (freshly created crop
  subzone before the daily tick first runs): `crop_stage`/`crop_progress`
  are `None`; frontend falls back to the current flat neutral/fallow fill
  rather than erroring.
- **`growth_progress` at exact stage boundary**: clamp to `[0, 1]` explicitly
  so a tick that's slightly overdue (task hasn't run yet at the exact
  `GROWTH_DURATION` mark) doesn't render a `>1.0` or negative progress.
- **N+1 queries**: the map endpoint is polled every 10s per open browser tab
  (`MAP_POLL_INTERVAL_MS`) — every new property must be backed by a
  `select_related`/`prefetch_related` addition in `PopulationCentreMapView`,
  not a per-object query. This is the main correctness risk of this plan
  (see Risks).
- **Migration concerns**: none — no new model fields, no new models. All
  additions are computed properties/serializer methods.
- **Backwards compatibility**: the map GeoJSON `properties` dict only grows
  new optional keys; nothing existing is renamed/removed, so no other
  consumer of this endpoint (there's only the one, `Map.tsx`) is at risk of
  breaking.

## 6. Tests

- New/updated serializer tests (`locations/tests.py` or a new
  `locations/tests_serializers.py` if a natural home doesn't already exist):
  - Building with workers + mixed goods stock (some zero, some positive) →
    `workers` count correct, `goods` only includes positive-stock entries,
    display strings match `format_quantity` output exactly (bread as
    loaves, flour as sacks).
  - Building with zero workers and zero goods → `workers: 0`, `goods: []`.
  - Character with home+work assigned vs. neither assigned → `home`/`work`
    populated or `None` as expected.
  - Character at various hunger values → correct `hunger_label` band,
    including exact boundary values between bands.
  - Crop subzone at `FALLOW`, `GROWING` (start/mid/near-end), and `READY` →
    correct `crop_stage`, and `crop_progress` within `[0, 1]` or `None` as
    appropriate.
- New test for `FieldCrop.growth_progress` (or wherever the helper lands):
  `planted_at = now` → progress ≈ 0; `planted_at = now - GROWTH_DURATION/2`
  → progress ≈ 0.5; `planted_at = now - GROWTH_DURATION` (or more) →
  progress clamped to 1.0.
- Frontend: if `Map.tsx` has existing tests, extend them with fixtures for
  the new properties; otherwise this is a good opportunity for a couple of
  focused unit tests on the extracted tooltip-content/field-colour
  functions specifically (pure functions, easy to test in isolation without
  full component rendering).
- Manual verification (per this repo's UI-change convention): open the map
  page, hover a building with assigned workers/goods, hover a character
  with home/work set, and visually confirm field colour differs across
  fallow/growing/ready subzones.

## 7. Risks

- **N+1 queries on the map endpoint** if `prefetch_related`/
  `select_related` additions are missed for any of the new relations — easy
  to miss since the serializer code will "just work" locally with a handful
  of characters/buildings and only show up as a real cost at village scale.
- **Reverse relation name guesses** (`GoodsStock.building`'s related_name,
  `Subzone`↔`FieldCrop`'s reverse accessor) — these need confirming against
  the actual model definitions at implementation time rather than assumed
  from this plan's prose.
- **Singular "Works at" wording when a character has multiple non-primary
  work locations** — only the primary (`is_primary=True`) should be shown;
  easy to accidentally query all `CharacterLocation` rows for a role instead
  of just the primary one.
- **Hunger band thresholds picked arbitrarily** without the user's input on
  exact wording/cutoffs — worth a quick confirmation before finalizing (see
  Open questions).
- **Reusing `FIELD_FILL`'s existing gold as "ready" vs. picking a new
  colour** could look identical to today's map for `READY` fields while
  looking different for `FALLOW`/`GROWING` — worth confirming that's the
  intended "no visible change for the already-common case" outcome rather
  than an oversight.

## 8. Open questions — resolved

- **Hunger labels**: two bands only — `"Well fed"` and `"Hungry"` — split at
  the midpoint of `0..HUNGER_MAX` (below midpoint → "Well fed", at/above →
  "Hungry"). Simpler than the originally-proposed 4-tier scheme; step 4 and
  the `CharacterNeeds` hunger-label test in step 8/Tests are updated
  accordingly (one boundary to test, not three).
- **Workers: 0**: always shown, never omitted — confirmed as originally
  planned in step 5/Edge cases.
- **Field colour**: continuous interpolation by `growth_progress`, not
  discrete steps — confirmed as originally planned in step 7 (`fieldFillFor`
  interpolates rather than picking from a small fixed palette).
