# Plan: CharacterLocation model + home/work scheduling

## Context

Characters currently wander randomly every 10s via `wander_tick` (Celery beat,
`locations/tasks.py`), nudging `Character.location` within the whole village
boundary. This looks janky/unrealistic. The ask is to replace it with a
scheduled home/work commute: characters walk to work in the day, walk home at
night, and otherwise sit idle — with a single walk animation triggered only on
state change, staggered per character so the village doesn't move in lockstep.

This introduces a `CharacterLocation` join model (character/building/role) as
the source of truth for "where is this character's home" and "where is their
work", decoupled from the single `Character.building` FK (which stays as-is
for other uses, e.g. `assign_home`/residents listings).

Key findings from exploration that shape this plan:
- A real pathfinding/movement stack already exists (`locations/services/movement.py`,
  `Journey`, `move_characters_tick`) that does BFS pathing + per-tick
  interpolation + self-rescheduling + stop-on-arrival — this is exactly
  "walk from A to B, then idle", so we reuse it rather than building a new
  animation mechanism.
- `movement.py::arrive()` references `movable.current_content_type` /
  `current_object_id`, fields that don't exist on `Movable`/`Character`. This
  is dead/aspirational code that will raise `AttributeError` the first time a
  real `Journey` completes — which never happens today because nothing
  triggers real journeys in production (`village-view.md` explicitly avoided
  this stack for the decorative wander). This plan is the first thing to
  actually exercise `arrive()`, so the bug must be fixed as a prerequisite.
- A separate sun-phase/astral system (`gameworld/`) exists but is fully
  dormant (not on Celery beat, backing table never populated) — confirmed not
  in scope; day/night uses a simple fixed local-time window instead.
- `wander_tick`/`wander()` stay in the codebase (still useful/decorative) but
  are removed from `beat_schedule` and replaced by the new scheduling task.

---

## 1. High-level strategy

- Add `CharacterLocation(character, location=FK(Building), role, is_primary)`
  with a migration that also backfills a `role="home"` row from each
  character's existing `building` FK.
- Add a new service function (`character/services/` or `locations/services/`)
  that: determines a character's target role (`home`/`work`) from a fixed
  daily time window with a per-character stagger, looks up the matching
  `CharacterLocation`, and calls the existing `Movable.set_destination(obj=building)`
  only if the character isn't already there/heading there.
- Replace `wander_tick`'s Celery beat entry with a new periodic task that
  sweeps idle characters and applies this logic. Keep `wander_tick`/`wander()`
  as unused-but-available code (not deleted) since removing it isn't
  required and it may still serve other decorative purposes later — but stop
  scheduling it, since the ask is to replace the random-walk *behaviour*.
- Fix the `arrive()` bug (drop the two `current_content_type`/`current_object_id`
  lines — no such fields exist to set).
- No frontend changes needed: `Map.tsx`'s existing CSS-transition-on-poll
  rendering already animates any `location` change smoothly; a real `Journey`
  just means the polled GeoJSON coordinates change more times in sequence
  (once per `move_characters_tick` step) before settling, which reads fine
  with the existing 4s CSS transition. Confirm `MapPage`'s 10s poll interval
  still gives an acceptable visual cadence (may shrink to e.g. 5s in a
  follow-up if walks look choppy — treat as tuning, not blocking).

---

## 2. Files likely to change

| File | Change | Exists? |
|---|---|---|
| `character/models/__init__.py`, new `character/models/location.py` (or add to `character.py`) | New `CharacterLocation` model | New file or extend existing |
| `character/migrations/00XX_characterlocation.py` | Migration: create table + data migration backfilling `role="home"` from `Character.building` | New |
| `character/admin.py` | Register `CharacterLocation` (repo convention — check current registrations) | Existing |
| `locations/services/schedule.py` (new) | `target_role_for(character, now)` (fixed time window + per-character jitter) and `sync_character_location(character)` (compare current state to target, call `set_destination` if changed, else idle/no-op; small-radius-skip fallback if no work location — chosen: stay idle) | New |
| `locations/tasks.py` | Add `commute_tick` periodic task sweeping idle characters via `sync_character_location`; leave `wander_tick`/`wander` in place but unscheduled | Existing |
| `progress_rpg/celery.py` | Replace `wander_tick` beat entry with `commute_tick` | Existing |
| `locations/services/movement.py` | Fix `arrive()`: remove the two lines referencing nonexistent `current_content_type`/`current_object_id` | Existing |
| `character/tests.py` or `character/tests/` | Tests for `CharacterLocation` model + migration backfill | Existing (extend) |
| `locations/tests.py` | Tests for `commute_tick`/`sync_character_location`, `arrive()` fix | Existing (extend) |

No frontend files change.

---

## 3. Implementation plan

1. **Model + migration** — add `CharacterLocation` (character FK, location
   FK→`Building`, `role` as `TextChoices` with `HOME`/`WORK` per the
   `Node.Kind`/`InteriorSpace.SpaceUsage` convention, `is_primary` bool
   default `True`). Add a `unique_together`/partial-unique constraint on
   `(character, role, is_primary)` where `is_primary=True`, so at most one
   primary home and one primary work per character (schema-level, per the
   "exactly one home and one work for now" requirement) — mirrors the
   `PlayerCharacterLink` partial-unique-constraint pattern already in the
   codebase. Data migration backfills existing `Character.building` values
   as `role="home"` rows.

2. **Fix `arrive()` bug** — small standalone commit removing the two dead
   lines in `locations/services/movement.py`. Add/adjust a test asserting a
   completed `Journey` doesn't raise.

3. **Scheduling service** — `target_role_for(character, now=None)`: fixed
   window (e.g. 08:00–18:00 local time) → `WORK`, else `HOME`; apply a
   per-character stagger by offsetting the transition boundary
   deterministically (e.g. `hash(character.id) % 2400` seconds, capped to
   ±10–20 min) so not everyone flips at exactly 08:00/18:00.
   `sync_character_location(character)`: skip if `character.is_moving`
   (already mid-journey — don't interrupt); resolve target role's primary
   `CharacterLocation`; if none (no work location), leave character where
   they are; compare target building's entrance node against
   `character.current_node`/`target_node` — no-op if already there or
   already heading there; otherwise call `character.set_destination(obj=target_building)`.

4. **Task + beat wiring** — `commute_tick` in `locations/tasks.py`, batched
   like `wander_tick`/`move_characters_tick` (`.iterator(chunk_size=100)`,
   only over `is_moving=False` characters with a `population_centre`).
   Update `progress_rpg/celery.py` beat schedule: remove `wander_tick` entry,
   add `commute_tick` (interval short enough to catch staggered transitions
   promptly — e.g. every 60s, cheap since it only acts on state changes).

5. **Tests** — model/migration backfill test, scheduling-service unit tests
   (target role at various times/stagger offsets, no-work fallback, already-there
   no-op), task test (mirrors `WanderTickTaskTest` structure), `arrive()` fix
   regression test.

Each step is independently reviewable/shippable.

---

## 4. Design decisions

**a. `CharacterLocation.location` → `Building`.** Chosen per confirmation.
Alternative: FK to `Node` — rejected, adds indirection since a building's
entrance node is already resolvable via existing `Node.objects.filter(building=..., kind=BUILDING_ENTRANCE)`
lookups (used by `go_home()`), consistent with how `set_destination(obj=building)`
already resolves buildings today.

**b. Fixed time window for day/night.** Chosen per confirmation.
Alternative: revive the dormant astral sun-phase system — rejected as
out-of-scope extra work (unpopulated table, unwired beat task, new
dependency surface) for a feature that only needs two states.

**c. Reuse `Journey`/`set_destination`/`move_characters_tick` for the walk.**
Chosen per confirmation — matches "single walk animation on state
change, idle otherwise" exactly, since `move_characters_tick` already
self-reschedules only while `is_moving=True` and stops cleanly on arrival.
Alternative: new direct-interpolation walk — rejected, would duplicate
logic that already exists and works, at the cost of routing realism.
Requires fixing `arrive()` and handling the "no path found" case (see Edge
cases) since this is the first feature to rely on the Node/Path graph being
populated between two specific buildings.

**d. No-work fallback: stay idle.** Chosen per confirmation — simplest,
avoids a small-radius wander_by-home helper for a case the task itself
flagged as optional.

**e. New `commute_tick` vs. extending `wander_tick` in place.** Chosen: new
task, `wander_tick` left unscheduled but not deleted. Reasoning: the two
behaviours are conceptually distinct (goal-directed commute vs. decorative
drift) and mixing them into one function/task would make future toggling
(e.g. re-enabling decorative wander for characters at idle/work) harder.
Deleting `wander_tick` entirely isn't required by the ask and risks losing
tested code for no benefit.

---

## 5. Edge cases

- **No Node/Path graph connecting home ↔ work** (or either building has no
  entrance node): `set_destination` raises `ValueError`. `sync_character_location`
  must catch this, log, and leave the character in place rather than
  crashing the periodic task for the whole batch.
- **Character has no `current_node`** (never placed): `set_destination`
  raises `ValueError("Movable has no current_node")` — same catch-and-skip.
- **Character already mid-journey when their transition time arrives**:
  skip (checked via `is_moving`) rather than cancelling — avoids
  interrupting a walk that's already in progress, and avoids fighting
  `set_destination`'s own active-journey cancellation logic.
- **Migration backfill**: characters with `building=None` get no
  `CharacterLocation` row (fine — `sync_character_location` treats missing
  home the same as missing work: skip role, stay put).
  Enforce via the partial-unique constraint, not extra validation code.
- **Concurrent `commute_tick` runs** (if a run overlaps its own next
  scheduled tick under load): idempotent by construction — the state
  comparison (already-there/already-heading-there) plus `set_destination`'s
  `@transaction.atomic` active-journey cancellation makes duplicate triggers
  a no-op or a harmless journey replacement, not a correctness issue. No
  locking needed.
- **`arrive()` fix backwards compatibility**: no other code path currently
  reads `current_content_type`/`current_object_id` (grep confirms — not
  defined as model fields anywhere), so removing the two lines is safe.

---

## 6. Tests

- **New** (`character` app): `CharacterLocation` creation, `role` choices,
  partial-unique constraint (two primary `home` rows for one character
  raises `IntegrityError`), migration backfill (character with `building`
  set gets a `role="home"` row after migrating).
- **New** (`locations` app): `target_role_for` at various times including
  boundary/stagger cases; `sync_character_location` — moves toward work
  during day, home at night, no-op when already at target, no-op when
  `is_moving=True`, no-op when no `CharacterLocation` for the target role,
  catches/skips on `ValueError` from `set_destination` (no path/no current_node).
- **New**: `commute_tick` task test mirroring `WanderTickTaskTest`'s
  structure — only touches idle, village-assigned characters.
- **New**: regression test for the `arrive()` fix — a `Journey` completing
  via `move_characters_tick` doesn't raise, and `current_node`/`location`
  land correctly on the destination.
- **Existing**: rerun `locations/tests.py::LocationsModelsTestCase` and
  `WanderTickTaskTest`/`WanderServiceTest` to confirm no regressions (they
  remain valid since `wander`/`wander_tick` code is untouched, only
  unscheduled).

---

## 7. Risks

- Assuming every seeded village actually has a connected Node/Path graph
  between residential and work buildings — if `generate_paths` wasn't run
  for existing dev data, `commute_tick` will hit the "no path" skip path
  for most/all characters and nothing will visibly move. Worth a manual
  check against a seeded village before calling this done.
- Forgetting to catch `ValueError` in `sync_character_location` and letting
  one bad character's exception kill the rest of a batch tick.
- Off-by-one on the stagger math causing many characters to still cluster
  at the exact same offset (e.g. reusing a low-entropy hash) — use
  `character.id` combined with enough spread that offsets don't collide in
  clumps.
- Confusing `Character.building` (existing single home FK, still used by
  `assign_home`/residents elsewhere) with the new `CharacterLocation` home
  row — they must stay in sync or at least not contradict each other; this
  plan treats `CharacterLocation` as authoritative for commute scheduling
  only, without changing what `Character.building`/`assign_home` do.

---

## 8. Open questions

- Should `assign_home`/character creation flows also create/update the
  primary `CharacterLocation(role="home")` row going forward, so
  `Character.building` and `CharacterLocation` don't drift apart for newly
  created characters? (Out of scope for this plan unless bundled in —
  recommend a quick follow-up rather than expanding this PR.)
- No workplace-assignment mechanism exists yet (which building is a given
  character's "work"?) — this plan only adds the model/schedule/movement
  machinery. Populating `role="work"` rows (e.g. via a management command or
  admin) is assumed to be a separate follow-up; confirm that's acceptable
  for this PR's scope.
- Exact work-hours window (08:00–18:00 assumed) and stagger range (±10–20
  min per the ask) — confirm these defaults or provide preferred values.
