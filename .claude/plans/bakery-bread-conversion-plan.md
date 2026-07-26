# Bakery Bread Conversion Plan

## Context

The economy chain currently goes field → granary (wheat) → mill (flour).
This plan adds the next stage: mill → bakery (bread), reusing the same
`convert_goods` helper and `GoodsConversionState` idempotency guard that
milling already established - the `GoodsConversionState` docstring
(`economy/models.py`) already calls out "kept generic so bakery can reuse it
unmodified later."

`building_type="bakery"` already exists on `Building`, and
`populate_interiors.py` already seeds bakeries with `workshop`/`storage`/
`living` proportions (no dedicated flour or bread room).

---

## 0. Preliminary: stop migrating on every new good type

`GoodsStock.good_type` currently declares `choices=GoodType.choices` on the
model field. Postgres never enforces this (no CHECK constraint is
generated from Django `choices`), but `makemigrations` still emits an
`AlterField` every time the enum grows, purely to keep migration state in
sync - a no-op migration per good added. Before adding `BREAD`, drop
`choices=GoodType.choices` from the field (keep `GoodType` as a
`TextChoices` class for readable constants like `GoodType.WHEAT` - just
stop wiring it into the field itself). `GoodsStock` is server-written
economy state, not user-facing input, so this doesn't remove any real
validation - consistent with the project's "validate only at boundaries"
convention. This is a one-time migration; every good added after this
point needs none.

---

## 1. High-level strategy

- Add `GoodsStock.GoodType.BREAD`.
- Add an `advance_bakery_economy_tick` task, structurally identical to
  `advance_mill_economy_tick`: find each bakery's source building, call
  `convert_goods`, guard with `GoodsConversionState`.
- Source flour from the nearest mill in the same `PopulationCentre` (mirrors
  `_find_granary`), producing a new `_find_mill` helper.
- Bread output storage: reuse the bakery's existing generic `storage`
  interior space rather than adding a dedicated `bread_storage` usage -
  `GOOD_TYPE_STORAGE_USAGE.get(good_type, "storage")` already falls back to
  `storage` for any good with no dedicated entry, and bakeries already have
  a `storage` proportion seeded.
- No change to `populate_interiors.py` proportions is required for this to
  work, though see Design decisions on whether bakeries should get a
  dedicated flour room.

---

## 2. Files likely to change

| File | Change | Status |
|---|---|---|
| `economy/models.py` | Drop `choices=GoodType.choices` from `good_type` field; `GoodsStock.GoodType`: add `BREAD = "bread", "Bread"` | exists |
| `economy/constants.py` | add `PER_WORKER_DAILY_BAKING_CAPACITY`, `FLOUR_TO_BREAD_RATIO` | exists |
| `economy/tasks.py` | add `_find_mill`, add `advance_bakery_economy_tick` | exists |
| `progress_rpg/celery.py` | register `advance_bakery_economy` beat entry, after the mill tick | exists |
| `economy/tests/test_tasks.py` | add `_make_bakery` helper + `AdvanceBakeryEconomyTickTests` | exists |
| `economy/migrations/000X_...py` | migration for the new `GoodType` choice | new |

No new models, no new files beyond the migration.

---

## 3. Implementation plan

0. Drop `choices=GoodType.choices` from the `good_type` field (see §0);
   run `makemigrations` once for this change.
1. Add `BREAD` to `GoodsStock.GoodType`. No migration needed now that the
   field no longer carries `choices`.
2. Add `PER_WORKER_DAILY_BAKING_CAPACITY` and `FLOUR_TO_BREAD_RATIO` to
   `economy/constants.py`, following the existing "placeholder, tuned by
   feel" comment convention used for the milling constants.
3. Add `_find_mill(population_centre)` in `economy/tasks.py`, identical in
   shape to `_find_granary` (`filter(building_type="mill").order_by("id").first()`).
4. Add `advance_bakery_economy_tick`, copying `advance_mill_economy_tick`'s
   structure: iterate `Building.objects.filter(building_type="bakery")`,
   get-or-create `GoodsConversionState`, skip if already processed today,
   find the source mill, call `convert_goods(mill, bakery, input_good=FLOUR,
   output_good=BREAD, workers_present=_workers_present(bakery),
   per_worker_capacity=PER_WORKER_DAILY_BAKING_CAPACITY,
   conversion_ratio=FLOUR_TO_BREAD_RATIO)`, log a warning if no mill exists,
   then stamp `last_processed_on`.
5. Register `advance_bakery_economy` in `progress_rpg/celery.py`'s beat
   schedule at `crontab(hour=18, minute=15)` - 5 minutes after the mill
   tick, continuing the existing stagger pattern.
6. Add tests (see Tests section).

Each step is independently committable; step 4 is the only one that depends
on steps 1-3.

---

## 4. Design decisions

**Reuse `convert_goods`/`GoodsConversionState` as-is (chosen) vs. a new
bakery-specific helper.** The mill and bakery steps are structurally
identical (one input good, one output good, labor-capped, storage-capped,
daily idempotency). `convert_goods` is already building-agnostic. Writing a
bakery-specific converter would duplicate logic the field-harvest → mill
step already generalized. Chosen approach costs nothing but a few lines in
`tasks.py`.

**Bread storage: reuse generic `storage` usage (chosen) vs. add a dedicated
`bread_storage` `SpaceUsage` + bakery interior proportion.** The mill
precedent added dedicated `grain_storage`/`flour_storage` usages, which
could argue for a matching `bread_storage`. However, the most recent
`storage-categories-plan.md` (queued, not yet implemented) explicitly plans
to *collapse* `grain_storage`/`flour_storage` back into generic `storage`
with category tags, because the 1:1-usage-per-good pattern doesn't scale.
Adding a third dedicated usage now would move directly against that planned
direction and immediately need re-migrating once categories land. Chosen:
let bread use the existing generic `storage` fallback bakeries already have
seeded, and let the category-tags plan (when implemented) assign it
whatever tags make sense alongside the flour/grain reclassification.

**Flour sourced directly from the mill vs. adding a bakery-local flour
room.** Mirrors the existing granary→mill pattern exactly (mill has no
local wheat production, it pulls from the granary each tick). Adding a
flour room at the bakery would just be a second copy of the mill's own
flour stock with no behavioural difference, since `convert_goods` already
throttles by the *output's* headroom, not the input's local storage.
Rejected as unnecessary duplication.

**`_find_mill` as its own function vs. generalizing `_find_granary` into a
`_find_building_of_type(centre, type)` helper.** Chosen: keep them as two
small, near-identical functions, matching the existing precedent
(`_find_granary` wasn't written generically when it was the only one
either). A single parameterized helper is a reasonable follow-up but is a
speculative abstraction for a 3-line function; revisit only if a third
"find nearest supplier building" case shows up.

---

## 5. Edge cases

- No mill in the population centre → log a warning and skip, matching
  `_deposit_into_granary`'s / `advance_mill_economy_tick`'s existing
  "warn and lose nothing silently" pattern (nothing consumed, no state
  corruption).
- Multiple mills in one centre → `_find_mill` picks the lowest-id mill
  deterministically, same simplification `_find_granary` already makes.
  Not a real distribution model, but consistent with the existing
  precedent rather than a new inconsistency.
- Bakery has no `storage` interior space seeded (e.g. custom building data
  predating `populate_interiors`) → `GoodsStock.capacity` returns 0 via the
  existing aggregate-with-default-0 behavior, so `convert_goods` correctly
  converts nothing rather than erroring.
- Running the tick twice in one day → blocked by `GoodsConversionState`,
  identical guard to milling.
- Migration is additive only (new `TextChoices` member) - no backfill
  needed, no backwards-compatibility concern.

---

## 6. Tests

New in `economy/tests/test_tasks.py`:
- `_make_bakery(centre, storage_area=...)` helper, mirroring `_make_mill`/
  `_make_granary` (creates `Building`, `Node`, and a `storage`
  `InteriorSpace`).
- `AdvanceBakeryEconomyTickTests`:
  - converts flour to bread capped by workers present at the bakery
    (mirrors `test_mill_converts_wheat_to_flour_capped_by_workers_present`).
  - no mill in centre → no bread produced, no exception, warning logged.
  - running twice in one day → second run is a no-op
    (`GoodsConversionState` guard).
  - multiple bakeries in one centre are both processed independently
    (mirrors `test_multiple_mills_in_one_centre_are_both_processed`).

No changes needed to `economy/tests/test_conversion.py` - `convert_goods`
itself is untouched, only called with different good types/buildings.

---

## 7. Risks

- Forgetting to add `BREAD` to `GoodsStock.GoodType` before referencing it
  in `convert_goods` calls - will raise a validation/lookup issue at
  `get_or_create`, but should be caught immediately by the new tests.
- Copy-pasting `advance_mill_economy_tick` and forgetting to swap
  `GoodsConversionState` semantics - it's already generic per-building, so
  no change needed there, but worth double-checking the get-or-create still
  keys on the *bakery* building, not the mill.
- Placing the new beat schedule entry before `advance_mill_economy` instead
  of after - bread conversion must run after milling has deposited that
  day's flour, otherwise the bakery is always a day behind.

---

## 8. Open questions

- Should `PER_WORKER_DAILY_BAKING_CAPACITY`/`FLOUR_TO_BREAD_RATIO` values
  be balanced against real bread yield (e.g. ~0.8 loaves per unit flour) or
  left as round placeholder numbers like the existing milling constants?
  Proposal: placeholder, consistent with the "tuned by feel" comment
  already covering `YIELD_PER_AREA`/`WHEAT_TO_FLOUR_RATIO`.
- Does bread need a consumption sink yet (characters eating it), or does
  this plan stop at "bread accumulates in bakery storage" the same way
  flour currently just accumulates at the mill? Proposal: stop here -
  consumption is a separate concern (likely tied to player needs/hunger,
  not yet modeled) and out of scope for this conversion-chain step.
