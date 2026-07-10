# Plan: Simple Top-Down Village View (Visual Only)

Goal: a small village view showing stationary or slowly-moving characters, purely
decorative, with no gameplay logic attached. Reuse the existing PostGIS
location system where it fits; avoid pulling in the pathfinding/Journey/Celery
movement machinery built for future travel-quest gameplay.

---

## 1. High-level strategy

- **Reuse the data layer as-is**: `PopulationCentre`, `Building`, `Node`,
  `PopulationCentreMapView`, and the GeoJSON serializers already produce
  exactly the shape a village view needs (boundary, buildings, character
  points). No new models for the map/village structure itself.
- **Do not reuse the existing movement stack** (`movement.py` BFS pathfinding,
  `Journey`, `move_characters_tick` Celery loop). It's built for a different
  purpose (multi-step travel between named destinations), has a known bug
  (`place_characters.py:49`), and would couple this purely-visual feature to
  gameplay machinery that isn't ready. Instead, add a small, separate,
  decorative-only "wander" mechanism that nudges `Character.location` within
  the village boundary — no `Journey` rows, no pathfinding, no Celery tick
  reuse.
- **Rebuild the frontend rendering**, not the data-fetching. `Map.tsx` is a
  ~150-line scaffold (dots for characters, paths hidden via `opacity={0}`,
  no transitions). Replace point/building rendering with a more polished
  look (sprites instead of dots, CSS transitions for movement) but keep the
  GeoJSON-consuming contract so the API layer doesn't need reshaping.
- **Seed one small village** via the existing `spawn_villages` /
  `place_characters` commands with reduced counts, skipping the commands
  that only serve interior/pathfinding/land-use gameplay
  (`populate_interiors`, `generate_paths`, `generate_landarea`) since none of
  that is rendered or needed for a visual-only village.

---

## 2. Files likely to change

| File | Change | Exists? |
|---|---|---|
| `locations/views.py` | Reuse `PopulationCentreMapView` as-is, or add a lighter `?visual=1`-style trim if payload size matters later (defer unless proven necessary) | Existing |
| `locations/serializers.py` | No change expected; `CharacterPointFeatureSerializer` already emits what's needed | Existing |
| `locations/services/wander.py` | New: small decorative movement helper — pick a nearby point inside the village boundary and update `Character.location` directly, no `Journey`/pathfinding | New |
| `locations/tasks.py` | Add a small, separate periodic task (e.g. `wander_tick`) for decorative movement — kept independent of `move_characters_tick` | Existing (new task added) |
| `character/models/character.py` | Possibly add a minimal `sprite_key` (or similar) field if visual variety is wanted for MVP; otherwise derive a sprite deterministically from `character.id` and skip this file entirely | Existing (optional) |
| `locations/management/commands/setup_world.py` | Add a `--visual-only` / reduced-scale path, or a new thin command that calls `spawn_villages` + `place_characters` only | Existing (or new command) |
| `frontend/src/components/Map/Map.tsx` | Rework point/building rendering: sprite images instead of `<circle>`, remove hardcoded `opacity={0}` decision (either render paths properly or drop path fetching), add CSS transition on position change | Existing |
| `frontend/src/components/Map/Map.module.scss` | New sprite/building/village visual styling | Existing |
| `frontend/src/pages/VillagePage/VillagePage.tsx` | Likely minor: polling interval for decorative movement instead of fetch-once, or leave fetch-once if characters are stationary in phase 1 | Existing |
| `locations/tests.py` | Add tests for the new wander helper/task | Existing |
| `frontend` component tests | Add/adjust tests for new Map rendering | Existing (find via existing `*.test.tsx` alongside Map) |

No new Django models are proposed — everything needed (centre, buildings,
character points) already exists.

---

## 3. Implementation plan (small, reviewable commits)

1. **Seeding**: add a reduced-scale seeding path for one small village
   (either flags on existing commands or a thin new command chaining
   `spawn_villages` + `place_characters`). Verify `place_characters.py:49`
   bug either doesn't trigger in this path or fix it as a prerequisite
   (it will trigger if interiors aren't populated, which is the case here
   since `populate_interiors` is skipped — needs to be fixed regardless).
2. **Decorative movement helper**: add `wander()` in a new
   `locations/services/wander.py` that only touches `Character.location`
   within `population_centre.boundary`, with no `Journey`/`Node` state
   change beyond optionally updating `current_node` for display grouping.
   Unit test in isolation.
3. **Wander task**: add a Celery periodic task calling `wander()` for
   villages/characters flagged as decorative (see open question on how
   "decorative" characters are identified). Confirm it does not touch or
   interact with `is_moving`/`current_node`/`target_node` in a way that
   would confuse the existing gameplay movement system if it's ever
   switched on for the same characters.
4. **Frontend rendering pass**: replace the `<circle>` character markers
   with sprite `<image>`/`<use>` elements, keep buildings as polygons but
   restyle, decide on paths (either drop the fetch/filter entirely for this
   view or give them real styling — don't ship another silent
   `opacity={0}`).
5. **Movement animation**: add CSS `transition: transform` (or
   `requestAnimationFrame` interpolation if CSS transitions look choppy at
   the polling interval) so position updates from polling read as smooth
   drift, not teleporting.
6. **Polling**: switch `VillagePage` from fetch-once to a polling interval
   (interval should roughly match the wander task's cadence) only if
   characters are meant to visibly wander in this phase; skip this commit
   entirely if phase 1 is stationary-only.
7. **Polish pass**: village background/ground texture, building sprites,
   simple z-ordering — purely CSS/asset work, no backend changes.

Each step above is independently shippable and reviewable; 3–6 could each be
their own PR.

---

## 4. Design decisions

**a. Reuse `PopulationCentre`/`Building`/`Node`/GeoJSON endpoint vs. new
lightweight models.**
- Chosen: reuse as-is. They already model exactly a village layout with
  spatial coordinates, and the GeoJSON contract is a clean, tested seam.
- Alternative: a new minimal "VillageScene" model with plain x/y ints,
  bypassing PostGIS entirely.
- Reasoning: the existing models cost nothing extra to keep, PostGIS
  distance/point math is already in place, and introducing a parallel
  simpler model would duplicate a concept that already exists — against
  the "reuse over new abstractions" principle.

**b. Decorative movement: new lightweight helper vs. reusing
`movement.py`/`Journey`/Celery tick.**
- Chosen: new, separate, decorative-only helper with no `Journey` rows.
- Alternative: reuse `set_destination`/`step_toward`/`move_characters_tick`
  wholesale, treating decorative wander as just frequent short journeys.
- Reasoning: the existing stack is designed for goal-directed travel
  (pathfinding to named destinations, journey completion semantics) and
  has a known bug in the adjacent seeding command — coupling a
  purely-visual feature to it means bugs/changes in a not-yet-relied-upon
  gameplay system can break the visual feature and vice versa. A ~20-line
  "pick a nearby point, update location" helper is simpler and fully
  decoupled, consistent with "no gameplay logic attached yet."

**c. Sprite/appearance: new `Character` field vs. deterministic
client-side/serializer-side mapping from `character.id`.**
- Chosen (recommended default): deterministic mapping — e.g. `character.id
  % N` selects from a small fixed sprite set — added in the serializer or
  even purely in the frontend, no schema change.
- Alternative: add a real `sprite_key`/`appearance` field to `Character` now.
- Reasoning: no appearance system exists today, and this is stated to be a
  first visual pass with "no gameplay logic attached yet" — a schema
  change should wait until there's an actual customization requirement
  (avoids speculative modeling). Flagged as an open question below since
  the user may already want per-character persistence.

**d. Movement animation: CSS transitions on polled positions vs. keeping
the existing snap-on-refetch behavior.**
- Chosen: CSS `transition: transform` on marker position, driven by
  regular polling.
- Alternative: WebSocket push of position updates (mirroring
  `TimerConsumer`'s pattern).
- Reasoning: gameplay app confirmed to have zero coupling to `locations`
  today (no WebSocket channel carries position data) — building a new
  WebSocket channel for slow decorative drift is disproportionate.
  Polling every few seconds with a CSS transition reads as smooth "slow
  movement" without new infrastructure.

---

## 5. Edge cases

- **`place_characters.py:49` bug**: `Building.Node.Kind.BUILDING` will
  raise `AttributeError` when a character's assigned building has no
  interior node lookup available — this path is very likely to be hit if
  `populate_interiors` is skipped for the trimmed seeding flow. Needs
  fixing (or the reduced seeding command needs to route around it) before
  this plan's seeding step can run cleanly.
- **Village with zero characters**: `Map.tsx`/`VillagePage` should already
  degrade to an empty-but-valid view; confirm rendering doesn't break if
  `residents` is empty (existing `PopulationCentreResidents` already
  handles this).
- **Character with no `location`** (defaults to `Point(0,0)`): a
  freshly-created character not yet placed by `place_characters` will
  render at the origin, likely outside the village boundary — decide
  whether to filter these out of the visual feed or force-place on
  creation.
- **Wander drift outside boundary**: the new wander helper must clamp/
  reject candidate points outside `population_centre.boundary` (reuse the
  walkable-area computation pattern from `generate_points.py` rather than
  reinventing it, but without needing full `Node` graph placement).
- **Concurrent wander task runs**: if the wander task is periodic
  (Celery beat) rather than self-rescheduling, ensure it's idempotent per
  tick and can't pile up overlapping runs for the same population centre
  (e.g. via a cheap lock or just accepting occasional harmless overlap
  since writes are single-field location updates, not multi-step state).
- **Interaction with future gameplay movement**: if/when true travel
  quests reuse `Movable`/`Journey` for the same `Character` rows, the
  decorative wander task must not run concurrently with an active
  `Journey` for the same character (check `current_journey`/`is_moving`
  before wandering, even though this phase doesn't create journeys).

---

## 6. Tests

- **New**: unit tests for the wander helper — candidate point stays within
  village boundary, `Character.location` updates, no `Journey` created, no
  interaction with `is_moving`/`current_node` state used by the real
  movement system.
- **New**: task test for the wander Celery task — runs against a
  population centre with N characters, confirms it only touches
  decorative characters (per whatever flag/criterion is chosen — see open
  questions) and completes without touching `movement.py` code paths.
- **Existing**: `locations/tests.py::LocationsModelsTestCase` — no changes
  expected, but rerun to confirm the trimmed seeding path doesn't break
  assumptions (e.g. `Node`/`Path` still get created since `Movable`/
  `move_to` tests depend on them).
- **New/adjusted**: frontend tests for `Map.tsx` — sprite rendering per
  character, transition behavior (or at least that transform/position
  props update correctly), and the empty-village case.
- **Manual**: run the trimmed seeding command against a dev DB and view
  `/village` in the browser to confirm the fix for the `place_characters`
  bug and the new sprite rendering, per this repo's "test the golden path
  in a browser before reporting complete" convention.

---

## 7. Risks

- Underestimating how much the `place_characters` bug blocks any seeding
  path — it should be treated as a required fix, not a footnote.
- Accidentally wiring the new wander task through `movement.py` helpers
  (e.g. calling `set_destination`) "for convenience," which would silently
  reintroduce the `Journey`/pathfinding coupling this plan explicitly
  avoids.
- Polling interval and CSS transition duration mismatched, producing
  visibly janky rather than smooth movement — worth tuning empirically,
  not guessing a number upfront.
- Scope creep into full sprite/appearance customization (new field,
  admin UI, etc.) when the ask is a first visual pass — keep the
  deterministic-mapping approach unless the user confirms they want
  persisted per-character appearance now.
- Treating `Node`/`Path` as required for the visual-only village when
  they're actually only load-bearing for the movement/pathfinding system
  this plan is deliberately not using — seeding could likely skip
  `generate_paths` entirely, but double-check nothing in the GeoJSON
  serializer path silently depends on `Path` rows existing.

---

## 8. Open questions

- Should decorative wandering be visible in phase 1, or is a fully
  stationary village (dots that don't move at all) sufficient for the
  first cut, with slow movement added later? This changes whether steps
  3, 5, 6 in the implementation plan are in scope now.
- Should sprite/appearance be persisted per character (new field) or is a
  deterministic/random visual assignment acceptable indefinitely?
- Is there a design/art asset source for sprites, or does this plan need
  to assume simple colored shapes/icons as a placeholder until real art
  exists?
- How should "decorative" characters be distinguished from any future
  gameplay-driven ones (e.g. NPCs vs. player-linked characters) — is
  `is_npc` (referenced in the frontend residents list) the right flag to
  gate wandering on?
- Is there a target village to build this for (one of the 2 seeded by
  `spawn_villages` defaults), or should village count/scale be revisited
  as part of this work?
