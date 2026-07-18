# Plan: Tie work-flavor activities to a character's real job

## Context

This is a prerequisite for the wheat-harvest-yield calculation (economy plan
follow-up to [field-placement-plan.md](field-placement-plan.md)). Two
separate "work" concepts currently exist:

- `locations/services/schedule.py` (`WORK_START`/`WORK_END`, 08:00-18:00) -
  the real source of truth for physical presence. Drives `CharacterLocation`
  / `Journey` / `commute_tick`, i.e. whether a character is actually standing
  at their workplace `Building`.
- `character/services/behaviour_services.py` (`generate_day`) - generates two
  9am-ish "work" blocks (07:00-12:00, 13:00-17:00) as `CharacterActivity`
  rows with a flavor-text `name` (e.g. "milking the goats") drawn via
  `random.sample(WORK_ACTIVITIES, 2)` from a single flat list
  (`character/utils.py`). This is decorative XP-flavor, entirely disconnected
  from the character's actual assigned workplace - a granary worker can get
  "collecting eggs" as their activity text.

Before the harvest calculation can trust "a character worked at the field
today" as a meaningful signal for flavor/XP purposes too, the flavor text
should reflect the character's real job (via `CharacterLocation` role=WORK).
This plan only unifies the flavor-text selection; it does not touch the
physical-presence scheduling in `schedule.py`, which is already correct and
will remain the source of truth for harvest duration in the next step.

---

## 1. High-level strategy

Replace the single flat `WORK_ACTIVITIES` list with a mapping keyed by
`Building.building_type`. When `generate_day` builds the two work blocks, look
up the character's primary WORK `CharacterLocation`, resolve its building's
`building_type`, and sample flavor text from the matching list (falling back
to a generic list for characters with no work assignment yet).

---

## 2. Files likely to change

- `character/utils.py` - existing. Replace `WORK_ACTIVITIES` (flat list) with
  `WORK_ACTIVITIES_BY_BUILDING_TYPE` (dict keyed by `building_type`, plus a
  `"default"` fallback list for characters with no work `CharacterLocation`).
- `character/services/behaviour_services.py` - existing. `generate_day` needs
  to resolve the character's work building type and pass the right activity
  list into the `random.sample(...)` call instead of the flat constant.
- `character/tests/*` (wherever `behaviour_services`/`generate_day` is
  currently tested, or `character/tests.py` if no dedicated file exists) -
  existing. Extend/add coverage for the new lookup.

No model or migration changes - `CharacterLocation` and `Building.building_type`
already exist and already carry everything needed.

---

## 3. Implementation plan

1. In `character/utils.py`, group the existing `WORK_ACTIVITIES` strings by
   building type (field, granary, mill, bakery, inn, communal) plus a
   `"default"` list for unemployed/unassigned characters. Reuse the existing
   strings where they fit; only add new ones where a building type is
   under-represented (field-specific chores are thin in the current list -
   e.g. only "watering crops", "weeding the fields", "planting seedlings",
   "harvesting vegetables", "threshing grain").
2. Add a small helper (e.g. `work_activities_for(character)`) that queries
   the character's primary `CharacterLocation` with `role=WORK`, follows it
   to `location.building_type`, and returns the matching list (or
   `"default"` if no work location, or the building type isn't in the map).
3. In `generate_day`, replace `random.sample(WORK_ACTIVITIES, 2)` with
   `random.sample(work_activities_for(behaviour.character), 2)`. Keep using
   the same seeded `rng` (via `random.Random(...)`) for determinism, not the
   module-level `random` - **note**: current code already calls
   `random.sample` (module-level, not the seeded `rng`) at line 74, which is
   a pre-existing inconsistency with the rest of the function's determinism.
   Fix this alongside the change by using `rng.sample(...)` instead of
   `random.sample(...)`, since we're already touching that line.
4. Guard against a work-type list having fewer than 2 entries (only matters
   if a future building type gets a short list) - fall back to sampling with
   replacement or padding from `"default"` if needed.

---

## 4. Design decisions

**Grouping by `building_type` vs. a new per-building `Behaviour`/config
field.** Chosen: a static dict in `character/utils.py`, mirroring the
existing `BUILDING_INTERIORS_PROPORTIONS` pattern in
`populate_interiors.py` (a plain dict keyed by `building_type`). Alternative
considered: storing activity lists on the `Building` model itself - rejected
as unnecessary DB/schema overhead for flavor text that's static per building
*type*, not per building instance.

**Determinism fix (`random.sample` → `rng.sample`).** Chosen: fix it while
touching the line, since leaving it inconsistent means regenerating the same
date for the same character can produce different flavor text on rerun,
which contradicts the seeded-RNG intent already established elsewhere in the
function (`jitter_minutes` already uses `rng`). Alternative: leave as-is to
keep the diff minimal - rejected, the fix is a one-line change directly on
the line being edited anyway.

**Fallback for characters with no `CharacterLocation` WORK entry.** Chosen: a
`"default"` list (roughly today's flat list, trimmed of the strongly
job-specific entries like "grinding grain into flour"). Alternative:
skip generating "work" blocks entirely for unemployed characters - rejected,
out of scope and changes existing day-shape behaviour beyond what's needed
here.

---

## 5. Edge cases

- Character has no `CharacterLocation` with `role=WORK, is_primary=True` yet
  (e.g. newly created, not yet assigned by `assign_workers`) → fall back to
  `"default"`.
- `building_type` exists on the workplace but isn't in the map (e.g.
  `residential` - characters shouldn't be assigned to work at a house, but
  nothing currently prevents it) → fall back to `"default"`.
- A building-type list has fewer than 2 entries → sampling must not raise;
  pad from `"default"` or use `random.choices` (with-replacement) instead of
  `sample`.
- `generate_day` is called for both past-backfill and future dates
  (`is_past` branch) - the work-type lookup must use the character's
  *current* `CharacterLocation`, since there's no historical record of past
  job assignments. Acceptable: flavor text for backfilled past days reflects
  the character's current job, not whatever they were doing at the time.

---

## 6. Tests

- New test: character with a WORK `CharacterLocation` pointing at a `field`
  building gets flavor text drawn from the field-specific list (assert both
  sampled names are in the expected set).
- New test: character with no WORK `CharacterLocation` falls back to
  `"default"` without raising.
- New test: determinism - regenerating the same date for the same character
  (same seed) produces the same two activity names (covers the
  `random.sample` → `rng.sample` fix).
- Existing `generate_day`/`behaviour_services` tests (wherever they live)
  should keep passing - check whether any assert on the *literal* flavor
  text used (unlikely, but worth checking since the list contents are
  changing, not just the lookup mechanism).

---

## 7. Risks

- Forgetting to switch `random.sample` to `rng.sample` on that line negates
  the determinism fix silently (no test failure unless a determinism test is
  added - see Tests above).
- Miscategorising an existing flavor string (e.g. putting a granary-only
  phrase in the field list) is a low-stakes cosmetic bug, not a correctness
  one - fine to iterate on wording later.
- If a character's work `CharacterLocation` changes mid-day (re-assigned by
  `assign_workers`) after `generate_day` already ran for today, flavor text
  won't retroactively update - matches existing behaviour (activities are
  generated once per day, not live-recomputed), not a new risk introduced
  by this change.

---

## 8. Open questions

- Should `residential`/`communal` workers (there's no dedicated "unemployed"
  building type) get their own list, or share `"default"`? Leaning toward
  `communal` getting its own (there are enough generic-chore strings in the
  current list to fill it) and `"default"` being reserved for genuinely
  unassigned characters.
- Exact wording/grouping of the split lists is an editorial call best made
  during implementation rather than locked in here - the plan only commits
  to the mechanism (lookup by building type), not the final copy.
