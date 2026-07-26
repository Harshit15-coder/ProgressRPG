# Field Placement Plan

Scope: place a real, rendered field just outside each village's boundary, wired into the
existing home/work commute system, so farmers can be assigned there and walk out to work.
Explicitly **out of scope**: the wheat→flour→bread production/resource system — that's a
separate follow-up once this lands.

---

## 1. High-level strategy

Model the field as a `Building` (type `"field"`), not a new geometry type. This is the
simplest fit because every piece of the commute stack — `CharacterLocation.location` (FK to
`Building`), `assign_workers`, `force_commute`, `generate_paths`'s entrance-node discovery,
the map's `BuildingFeatureSerializer` — already operates on `Building` rows keyed by
`population_centre`. A field that's just another `Building` gets pathing, worker assignment,
and rendering for free; nothing needs to special-case it.

The only structural gap: `PopulationCentre.boundary` (set once in `spawn_villages`, and used
directly as the map view's `bbox`) only encloses the settlement's own building footprints. A
field placed outside it would exist in the DB but fall outside the rendered viewBox. So
boundary needs to be recomputed to include the field footprint once it's placed.

## 2. Files likely to change

- `locations/models.py` — add `"field"` to `Building.BUILDING_TYPES`. Existing file.
- `locations/management/commands/generate_fields.py` — **new**. Creates one field `Building`
  + footprint + entrance/centre `Node`s per `PopulationCentre`, positioned outside the
  current boundary, then recomputes `population_centre.boundary` to include it.
- `locations/management/commands/spawn_villages.py` — reuse `create_building_footprint`,
  `create_centre_boundary`, `compute_building_entrance_point` (import, no logic changes).
- `locations/management/commands/assign_workers.py` — add `"field"` to
  `WORK_BUILDING_TYPES`. Existing file, one-line change.
- `locations/management/commands/setup_world.py`,
  `locations/management/commands/seed_village_view.py` — insert `generate_fields` step,
  after `spawn_villages`/`spawn_villages`+`generate_points` and before `generate_paths`
  (same ordering constraint as other buildings: entrance nodes must exist before paths are
  built).
- `frontend/src/components/Map/Map.tsx` — add `field: "Field"` to the existing
  `building_type` → label map (~line 278) so the tooltip doesn't just say the raw type.
  Optional: distinct fill colour, since all building polygons currently render `#ddd`
  uniformly — cosmetic, not required for placement to work.
- `locations/tests.py` — new coverage (see Tests section).

No changes needed to `generate_paths.py`: it already discovers entrance nodes via
`Node.objects.filter(building__population_centre=centre, kind=BUILDING_ENTRANCE)`, which
picks up the field automatically once it exists with the right FK.

## 3. Implementation plan

1. Add `"field"` to `Building.BUILDING_TYPES`; migration.
2. `generate_fields` command, per `PopulationCentre`:
   a. Compute a placement point just outside the existing `boundary` (e.g. extend outward
      from the centroid past the boundary's bounding-box edge by a fixed margin).
   b. Build a footprint polygon there via `create_building_footprint` (larger size range
      than houses, so it visually reads as a field once styled).
   c. Create `Building(building_type="field", population_centre=pc, location=..., footprint=...)`.
   d. Create its `BUILDING` centre node and `BUILDING_ENTRANCE` node (mirrors what
      `spawn_villages` does for every other building), via `compute_building_entrance_point`.
   e. Recompute `population_centre.boundary` via `create_centre_boundary`, passing in the
      existing footprints *plus* the field's, and save it — this is what makes the field
      appear inside the map's `bbox`.
3. Add `"field"` to `assign_workers.WORK_BUILDING_TYPES`.
4. Wire `generate_fields` into `setup_world.py` and `seed_village_view.py`, positioned after
   village/point generation and before `generate_paths`.
5. Frontend label tweak in `Map.tsx`.
6. Manual verification: rerun the seed pipeline, confirm the field polygon renders at the
   village edge, `assign_workers` puts characters there, and `force_commute --role work`
   walks them out to it and back (reusing the `test_commute.py` pattern from earlier).

## 4. Design decisions

**Field as `Building` vs. reusing `LandArea`/`Subzone`.**
`LandArea`/`Subzone` already model land use (`generate_landarea` even creates a `crops`
subzone) and would be the more semantically "correct" home for farmland. But they're
currently centered *on* the settlement (same square as the village itself, not offset
outward), aren't wired into `PopulationCentreMapView`'s geojson output at all, and
`CharacterLocation.location` can only FK to `Building` — so making a `Subzone` a workable
work-location would mean either changing that FK (touches the whole commute system) or
bolting a `Building` onto the subzone anyway. Given the field needs to be a work
*destination* right now, and the crop-yield economy is explicitly deferred, treating it as a
`Building` is the smaller, more consistent change. `LandArea`/`Subzone` remain a natural fit
to revisit when the production system actually needs "how much land is this" rather than
"where do workers walk to."

**One field per population centre vs. configurable count.**
Mirrors `RESIDENTIAL_PER_VILLAGE`-style fixed constants already used in `spawn_villages.py`.
Start with exactly one field per centre (simplest, matches "2-3 characters work here" scale
established for other work buildings) rather than a count parameter — easy to extend to
`--num-fields` later if needed.

**Boundary recompute vs. changing the map view's bbox calculation.**
Alternative: leave `boundary` untouched and instead compute `bbox` in
`PopulationCentreMapView` as the union of `boundary.extent` and all building footprint
extents. Rejected because `boundary` is also rendered as its own `boundary` feature
(`BoundaryFeatureSerializer`) — if it doesn't actually include the field, the visible
"village outline" would look wrong (field appears to float outside it) even if the bbox
crop were fixed. Recomputing `boundary` keeps the single source of truth consistent.

## 5. Edge cases

- **Village with no buildings yet** (fresh `PopulationCentre`, `boundary=None`): guard in
  `generate_fields`, same as `assign_workers` already does for "no work buildings found."
- **Re-running `generate_fields`**: should be idempotent-ish — check for an existing
  `building_type="field"` per centre before creating another, same pattern as
  `place_characters`'s "skip already-housed" fix from the housing-stacking bug earlier.
- **`generate_paths` re-run**: no special handling needed — it already deletes and rebuilds
  all `Path` rows per centre, and will pick up the field's entrance node like any other.
- **Migration**: adding a choice to `BUILDING_TYPES` needs no data migration since existing
  rows are unaffected; only the choices list changes.

## 6. Tests

- `generate_fields` creates exactly one field `Building` per centre, with an entrance node,
  positioned outside the pre-existing boundary bounding box.
- `population_centre.boundary` after `generate_fields` contains the field's footprint
  (e.g. `boundary.contains(field.footprint)` or an intersection check).
- `assign_workers` assigns eligible characters to a field building when one exists (extend
  existing `assign_workers` test scenario, if one exists, or add one).
- Re-running `generate_fields` twice doesn't create duplicate field buildings per centre.
- Existing `Map.test.tsx` footprint/tooltip tests keep passing unmodified; optionally add one
  asserting the `field` → `"Field"` label.

## 7. Risks

- Placing the field footprint naively (e.g. always due east) could overlap another village's
  buildings in dense multi-village setups (`setup_world` spawns multiple centres) — worth
  checking placement against other centres' boundaries, or just accepting it for now since
  `spawn_villages` doesn't currently guard against inter-village overlap either.
- Forgetting to recompute `boundary` (or getting the hull/buffer wrong) silently breaks
  rendering only — the DB state is fine, `force_commute` still works, but nothing shows on
  the map. Easy to miss without visually checking the map after seeding.
- If `generate_fields` runs after `generate_paths` by mistake in either pipeline command, the
  field's entrance node won't be in the street network and commute will fail with "could not
  route character" — the same class of bug already hit twice this session with
  populate_interiors/generate_paths ordering.

## 8. Open questions

- How far outside the boundary should the field sit, and does it need to avoid other
  villages' footprints, or is single-village testing (`seed_village_view`) the only realistic
  near-term use case?
- Should field footprints be visually distinct (colour/size) now, or is a plain grey box
  acceptable until the production system gives a reason to invest in field art?
