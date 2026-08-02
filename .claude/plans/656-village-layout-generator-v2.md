# Village Map Layout Generator v2 (Issue #656)

## 1. High-level strategy

All of this is procedural-generation work in `locations/management/commands/` (`spawn_villages.py`, `generate_landarea.py`, `generate_fields.py`, `generate_paths.py`) plus the shared helpers in `spawn_villages.py` and `locations/utils.py`. Polygon-shaped features need no API/frontend changes: `PolygonFeatureSerializer.get_geometry` (`locations/serializers.py:150`) already emits the raw `coords[0]` ring of whatever `Polygon` is stored in `footprint`/`boundary`, and MapLibre renders arbitrary polygons already (confirmed in `frontend/src/components/Map/Map.tsx`). So rotated buildings and irregular fields "just render" once the generator produces the right geometry.

**Correction found during implementation:** `Path` is *not* the same as the polygon case. `PathFeatureSerializer` inherited `LineStringFeatureSerializer.get_geometry`, which reconstructs a straight 2-point line from `from_node.location`/`to_node.location` on every serialization — it never read the stored `Path.geom` field at all. Item 6 (paths routing around buildings) therefore did require a one-method serializer fix (`PathFeatureSerializer.get_geometry` now reads `obj.geom.coords` when set) — without it, a rerouted 3-point `geom` would be silently discarded at serialization time and the map would keep drawing the old straight line. This is the one place the "backend-only" framing in this plan was wrong.

Key finding that simplifies the "oriented collision" item: placement already calls `buffered_footprint.intersects(existing_fp.buffer(BUILDING_BUFFER))` (`spawn_villages.py:212-217`), which is true GEOS polygon-polygon intersection, not an axis-aligned bbox check. It's already "oriented" once footprints stop being axis-aligned rectangles. The only real gap is that `create_building_footprint` never rotates its corners. So step 1+2 of the issue's build order collapse into one change: add rotation to footprint generation; the existing intersection-based placement loop needs no rewrite.

Sequencing follows the issue's suggested order, since neighbourhoods/zones build on placement, irregular fields/multi-plot farms are independent of buildings, and paths must run last (already true today per `setup_world.py`).

## 2. Files likely to change

- `locations/management/commands/spawn_villages.py` (exists) — rotation in `create_building_footprint`, zone/neighbourhood-aware placement loop, shelter placement heuristic.
- `locations/management/commands/generate_landarea.py` (exists) — irregular Subzone polygons in `assign_subzone_geometry`; support multiple crops Subzones per LandArea.
- `locations/management/commands/generate_fields.py` (exists) — loop over multiple crops Subzones per centre, shared shelter Building per farm instead of one Subzone : one shelter.
- `locations/management/commands/generate_paths.py` (exists) — route paths around building footprints instead of straight nearest-neighbour lines.
- `locations/utils.py` (exists) — shared `rotate_point`/`perturb_quad_corners` helpers, reused by both `spawn_villages.py` (buildings) and `generate_landarea.py` (fields).
- `locations/models.py` (exists) — no schema change (no new field/model added).
- `locations/serializers.py` (exists) — `PathFeatureSerializer.get_geometry` now reads the stored `Path.geom` instead of always rebuilding a straight line from node endpoints (see correction above) — required for rerouted paths to actually render.
- `locations/tests.py` (exists) — new tests for the above commands, plus a serializer regression test.
- No new files expected unless the path-routing helper grows large enough to warrant its own module (see Design decisions).

## 3. Implementation plan

1. **Rotated footprints (oriented placement foundation)**
   - Add a `rotation` param to `create_building_footprint`, rotating the 4 corners about the centre before constructing the `Polygon`.
   - Randomize rotation per building in `spawn_villages.py`'s placement loop.
   - No change needed to the intersection check itself (GEOS `intersects()` already handles rotated polygons correctly).

2. **Neighbourhood/zone grouping**
   - In `spawn_villages.py`, before placing buildings, pick two fixed "zone anchor" offsets from the settlement centre point: `social` (residential, inn, communal) and `craft` (granary, mill, bakery).
   - Bias `attempt_place_building` to sample offsets near a building's assigned zone anchor instead of a uniform `[-50, 50]` offset from the village centre.
   - Purely algorithmic — no new model/field needed to satisfy "grouped by type"; the acceptance criterion is about spatial clustering, not a queryable zone entity.

3. **Irregular fields**
   - In `generate_landarea.py::assign_subzone_geometry`, replace the straight vertical-strip rectangle with a jittered polygon, reusing `create_building_footprint`'s `irregularity` perturbation as-is (same magnitude/pattern) applied to each strip's corners.
   - Keep the area-fraction logic (`subzone.size / landarea.size`) driving the strip's nominal width before jitter, so `FieldCrop` yield math (`crop.subzone.boundary.area`) stays proportionate.

4. **Multiple farm plots per farm**
   - `FieldCrop.shelter_building` is already a plain `ForeignKey` (not one-to-one), so multiple `FieldCrop` rows can already share one shelter `Building` — no model change needed.
   - Change `generate_landarea.py::subdivide_landarea` to split the `crops` allocation into 2-3 Subzones per LandArea (fixed small random count, e.g. `random.randint(2, 3)`) instead of exactly one, keeping their combined size fraction equal to today's single-Subzone `CROPS_SUBZONE_FRACTION`.
   - Change `generate_fields.py` to group crops Subzones per centre into one "farm" and create a single shared shelter Building per farm (placed once, near the group's centroid) with one `FieldCrop` per crops Subzone pointing at that shared shelter.

5. **Shelters positioned intelligently**
   - Replace `compute_building_entrance_point`-only placement in `generate_fields.py` with a heuristic: place the shelter at the crops-Subzone-group centroid, nudged toward the population centre (shorter commute) and away from other shelters (min-spacing check reusing the `distance()`/intersection pattern already used elsewhere).

6. **Paths route around buildings**
   - In `generate_paths.py::create_street_network`/`connect_to_nearest`, after picking nearest-neighbour node pairs, check whether the straight `LineString` between them intersects any building footprint (excluding the path's own endpoints' buildings). Only paths that actually intersect a footprint get a waypoint inserted (e.g. offset via one of the building's corner/buffer points) so the rendered line skirts around it; non-intersecting paths stay untouched straight lines, same as today.
   - Keep this a light heuristic (not full pathfinding/A*) — issue explicitly parks "character pathfinding" as visual-only.

7. **Pipeline/docs**
   - No reordering needed in `setup_world.py` — existing order already satisfies the new dependencies (landarea → fields → paths).
   - Update command docstrings/help text where behavior changes (e.g. `generate_fields` help text currently says "a small field_shelter Building" per centre — becomes per farm-group).

## 4. Design decisions

- **Rotation stored as geometry, not a field.** Alternative: add a `rotation` FloatField to `Building` and rotate at render time. Rejected — nothing in the render path (`PolygonFeatureSerializer`) or gameplay logic needs rotation as a queryable scalar; baking it into `footprint`'s stored coordinates keeps one source of truth and needs zero serializer/frontend changes.
- **Neighbourhoods as placement bias, not a model.** Alternative: a `Zone`/`Neighbourhood` model with FK from `Building`. Rejected for v1 — acceptance criteria only require visually distinct clustering, not queryable zones; a model would need migrations, admin, serializers for no current consumer. Revisit if a future issue needs to query "buildings in zone X".
- **Path routing via waypoint insertion, not real pathfinding.** Alternative: A* / visibility-graph routing around obstacles. Rejected — issue explicitly parks character-pathfinding; a light "does this line cross a footprint, if so offset" heuristic satisfies "visibly route around buildings" without introducing a routing engine and its edge cases (unreachable nodes, performance on larger villages).
- **Multiple farm plots via multiple Subzones + shared shelter, not a new `Farm` model.** Alternative: introduce a `Farm` model owning N `Subzone`s and 1 shelter `Building`, replacing today's implicit centre-level grouping. Rejected — `FieldCrop.shelter_building` already supports the fan-in relationship; grouping crops Subzones by centre in the generator (and, if ever needed, a cheap `FieldCrop.objects.filter(shelter_building=x)` query) covers the acceptance criterion without a new table.
- **Irregular field polygons via corner jitter, not noise-field/Voronoi.** Alternative: proper Perlin/simplex noise perturbation for organic edges. Rejected as over-engineered for hectare-scale farm plots at village zoom — the existing jitter pattern already used for buildings is proven, consistent, and enough to break the "obviously rectangular" look.

## 5. Edge cases

- Rotated building footprints must still pass the existing `intersects()` collision check without infinite retry loops — cap attempts as today (100), same fallback warning-and-skip behavior.
- Small LandAreas (low population) must not be forced into multiple crops Subzones if the resulting plots would be too small to be meaningful — gate "multiple plots" behind a minimum required-area threshold, else fall back to today's single-Subzone behavior.
- Path waypoint-offset heuristic must not itself create a new intersection with a *different* building — bound offset attempts and fall back to the original straight line (visually imperfect but no worse than today) rather than looping indefinitely.
- Zone-biased building placement must not break the "could not place after 100 attempts" fallback — if the zone-biased offset can't find a free spot, fall back to the existing uniform offset before giving up, so overall placement success rate doesn't regress.
- `generate_landarea --overwrite` / re-running commands must still be idempotent-ish (delete-and-regenerate), consistent with current behavior — multiple Subzones per LandArea must be cleanly deleted/recreated the same way.
- Existing seeded settlements/tests (`GenerateLandareaCommandTest`, `GenerateFieldsCommandTest`, `PopulationCentreMapViewJourneyTest`) must keep passing — acceptance criteria explicitly requires no regression for already-seeded settlements.

## 6. Tests

- New: rotation applied in `create_building_footprint` produces a non-axis-aligned polygon (corners not at fixed x/y) and collision detection still rejects true overlaps.
- New: zone-biased placement keeps buildings of the same type closer to each other on average than to other types (statistical/centroid-distance assertion, not exact-position).
- New: `assign_subzone_geometry` produces a non-rectangular polygon (not all 4 corners collinear/axis-aligned) while area stays within expected tolerance of the intended fraction.
- New: `generate_landarea`/`generate_fields` — a centre with enough required land gets 2+ crops Subzones, all sharing one shelter Building (extends existing `GenerateLandareaCommandTest`/`GenerateFieldsCommandTest` classes).
- New: shelter placement heuristic keeps shelters a minimum distance apart when a centre has multiple farms.
- New: `generate_paths` — a path between two nodes whose straight line crosses a building footprint gets rerouted (resulting `LineString` no longer intersects that footprint).
- Modify: existing `GenerateFieldsCommandTest.test_attaches_shelter_and_fieldcrop_to_existing_crops_subzone` — verify it still passes given a single-Subzone LandArea (small population), confirming backwards-compatible fallback.
- Regression: rerun `PopulationCentreMapViewJourneyTest` unchanged to confirm map serialization still works for boundary-less/irregular geometries.

## 7. Risks

- Forgetting to re-derive `compute_building_entrance_point` correctly once footprints are rotated — it already works generically off `footprint.coords`, but any *new* code that assumes axis-aligned min/max extents (like `assign_landarea_geometry`'s `boundary.extent` usage) needs re-checking wherever it's reused for rotated shapes.
- Path-offset heuristic accidentally routing a waypoint *through* a different building — must check intersection against all footprints, not just the one that triggered the reroute.
- Multiple-crops-Subzone change silently breaking the `FieldCrop` yield/consumption balance in `economy_forecast.py`/`economy/tasks.py`, since those sum `subzone.boundary.area` per crop — should net out correctly (same total crop area, just split across more polygons) but worth a forecast sanity check.
- Zone-biased placement reducing overall placement success rate (more retries/failures) for small villages with few valid offsets — watch the "could not place after 100 attempts" warning rate in testing.
- Scope creep: issue explicitly parks new building types/gameplay logic and character pathfinding — easy to accidentally pull those in while touching placement/paths code.

## 8. Resolved decisions

- **Multiple farm plots:** for the current village size, split each LandArea's crops allocation into 2-3 Subzones (fixed small range, not scaled by population for now) rather than a size/resident threshold.
- **Zones:** exactly two fixed zone anchors per village — `social` (residential, inn, communal) and `craft` (granary, mill, bakery, i.e. the remaining work buildings) — not a variable count scaled by building-type diversity.
- **Path waypoint-offset:** only runs for paths whose straight line actually crosses a building footprint; paths with no intersection are left as direct lines (as today).
- **Field irregularity:** reuse the same irregularity magnitude/pattern already used for building footprints (`create_building_footprint`'s `irregularity` param) as the v1 starting point for field polygons, rather than defining a separate tuning constant.
