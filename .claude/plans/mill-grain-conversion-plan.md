# Plan: Shared goods-conversion helper + mill grain-to-flour processing

## Context

Follow-up to [wheat-harvest-simulation-plan.md](wheat-harvest-simulation-plan.md),
which deposits harvested wheat into the village granary's `GoodsStock`. This
plan adds the next link: a mill converts granary wheat into flour, stored at
the mill itself. `GoodsStock` was explicitly designed to be reused unchanged
for this. Bakery (flour → bread) will follow the identical shape as a fast
follow-up once this is proven - not included here, to keep this change small
and reviewable.

Two decisions were made discussing this plan, both driven by how real mills
work:
- Grain and flour are stored separately (different perishability/pest risk,
  historically different floors/rooms) - `InteriorSpace` gets two new usage
  types instead of one shared `storage` bucket.
- If the flour store is full, the mill throttles back rather than grinding
  grain it can't store - grain keeps fine in storage, flour doesn't, so a
  real miller wouldn't grind more than they can hold. No wheat is ever
  destroyed by this process; it just waits, un-milled, in the granary.

---

## 1. High-level strategy

- A generic `convert_goods()` helper (`economy/conversion.py`) does the
  shared "consume input good, produce output good, capped by labor / input
  stock / output storage capacity" arithmetic. It takes explicit input and
  output `Building`s (not assumed to be the same building), since the mill
  consumes from the granary but stores its own output.
- A new `GoodsConversionState` model gives each processing building (mill
  today, bakery later) its own `last_processed_on` idempotency guard,
  mirroring `FieldCrop.last_processed_on` but decoupled from crop-specific
  fields - milling has no growth stages, just a daily conversion pass.
- `GoodsStock.capacity` changes from summing *all* `storage`-usage
  `InteriorSpace` area to summing the usage type specific to that
  `good_type` (wheat → `grain_storage`, flour → `flour_storage`), so a mill
  holding both doesn't let one good silently borrow the other's space.
- One new daily task, `advance_mill_economy_tick`, iterates `mill`
  buildings, counts workers physically present, and calls `convert_goods()`
  once per mill.

---

## 2. Files likely to change

- `economy/conversion.py` - **new file**. `convert_goods()` helper.
- `economy/models.py` - existing. Add `GoodsStock.GoodType.FLOUR`; change
  `GoodsStock.capacity` to look up usage via a `good_type` → `InteriorSpace`
  usage mapping; add `GoodsConversionState` model.
- `economy/tasks.py` - existing. Add `advance_mill_economy_tick`.
- `economy/constants.py` - existing. Add milling constants (see
  Implementation plan step 4).
- `economy/admin.py` - existing. Register `GoodsConversionState`.
- `locations/models.py` - existing. Add `InteriorSpace.SpaceUsage.GRAIN_STORAGE`
  and `FLOUR_STORAGE`; migration for the choices change.
- `locations/management/commands/populate_interiors.py` - existing.
  Granary's `storage: 1.0` becomes `grain_storage: 1.0`; mill's
  `workshop/storage` split becomes `workshop/grain_storage/flour_storage`.
- `progress_rpg/celery.py` - existing. Add a beat entry for
  `advance_mill_economy_tick`, scheduled after the field-harvest tick.

---

## 3. Implementation plan

1. **`InteriorSpace.SpaceUsage`**: add `grain_storage`/`flour_storage`,
   migration. Update `populate_interiors.py`'s `BUILDING_INTERIORS_PROPORTIONS`
   for `granary` and `mill` to use the new usage types (proportions are
   placeholder starting values, same as the existing constants - tuned
   later).
2. **`GoodsStock` changes**: add `FLOUR` to `GoodType`. Add a
   `good_type` → `InteriorSpace` usage mapping (e.g.
   `GOOD_TYPE_STORAGE_USAGE = {"wheat": "grain_storage", "flour":
   "flour_storage"}` in `economy/constants.py`), and change `capacity` to
   sum only that usage's `InteriorSpace` area for the stock's building.
3. **`GoodsConversionState`**: `building` (OneToOne → `locations.Building`),
   `last_processed_on` (nullable DateField). Created on demand (`get_or_create`)
   by the mill task the first time it processes a given mill - no signal or
   seeding-time creation needed, since it holds no data until the first tick.
4. **Constants**: `PER_WORKER_DAILY_MILLING_CAPACITY` (grain units one
   worker can process per day), `WHEAT_TO_FLOUR_RATIO` (flour units
   produced per grain unit consumed).
5. **`convert_goods(input_building, output_building, *, input_good,
   output_good, workers_present, per_worker_capacity, conversion_ratio)`**:
   - `available_input = <input_building's input_good stock quantity>`
   - `labor_cap = workers_present * per_worker_capacity`
   - `output_stock = get_or_create(output_building, output_good)`
   - `output_headroom_in_input_units = (output_stock.capacity -
     output_stock.quantity) / conversion_ratio`
   - `input_to_convert = min(available_input, labor_cap,
     output_headroom_in_input_units)` (never negative)
   - if `<= 0`: return 0
   - deduct `input_to_convert` from the input stock, add
     `input_to_convert * conversion_ratio` to the output stock, return the
     amount converted.
6. **`advance_mill_economy_tick`**: for each `mill` `Building`, skip if its
   `GoodsConversionState.last_processed_on == today`. Count workers via
   `current_node__building=mill, is_moving=False` (same physical-presence
   pattern as the field harvest - matches "must actually show up"). Find
   the population centre's granary the same way the field-harvest task
   does (first `granary`-type building by id). Call `convert_goods(
   input_building=granary, output_building=mill, input_good=WHEAT,
   output_good=FLOUR, ...)`. Set `last_processed_on = today` regardless of
   whether anything converted.
7. **`progress_rpg/celery.py`**: add `advance_mill_economy`, scheduled at
   18:10 - after `advance_field_economy` (18:05), so the same day's
   granary deposit is available to mill from immediately.

---

## 4. Design decisions

**Throttle production vs. waste excess output.** Chosen: throttle - cap
`input_to_convert` by remaining output headroom, so grain that can't be
turned into storable flour simply isn't milled yet, rather than being
consumed and the resulting flour discarded. Alternative: mirror the field
harvest's "waste excess" precedent exactly, for consistency - rejected
because the two cases aren't equivalent: the field harvest wastes wheat
that's *already been picked* (labor already spent, nothing left to do with
it), whereas milling has a choice at the input stage and grain keeps fine
sitting in the granary, so there's no reason to destroy it.

**Separate `grain_storage`/`flour_storage` `InteriorSpace` usage vs. one
shared `storage` bucket.** Chosen: separate, reflecting how real mills
operate - grain and flour have different storage/spoilage needs and were
historically kept in different areas. Alternative: keep the existing single
`storage` usage and let all goods at a building share one pool - simpler,
but wrong now that a single building (the mill) holds two different goods
at once; a shared pool would let flour silently eat into grain's space (or
vice versa) with no way to reason about either capacity independently.

**Input/output at different buildings (granary → mill) vs. requiring goods
to be "transported" to the processing building first.** Chosen: `convert_goods`
takes explicit input and output buildings, and the mill task reads
directly from the granary's stock - no transport/logistics system exists
yet, and building one is out of scope here. This is a deliberate
simplification (wheat is available to any building in the same population
centre with no travel time or carrying), consistent with the wheat-harvest
plan's own "straight into the pool, no per-character carrying" simplification.
Flagged as a risk below in case it reads as an oversight rather than a
choice.

**New `GoodsConversionState` model vs. reusing `FieldCrop`'s
`last_processed_on`.** Chosen: new, minimal model - `FieldCrop` is about
growth stages that milling doesn't have; forcing milling through a
crop-shaped model would be a worse fit than a small dedicated one. It's
intentionally thin (just the idempotency guard) so it stays reusable for
bakery without modification.

**No locking/`select_for_update` on `GoodsStock` rows during conversion.**
Chosen: none, consistent with `advance_field_economy_tick`, which already
mutates `GoodsStock` unlocked. Both tasks run as a single sequential
in-process loop from Celery beat, not concurrently against each other or
themselves, so there's no genuine race to guard against yet.

---

## 5. Edge cases

- **No granary in the population centre.** Same as the field harvest:
  `convert_goods` simply sees `available_input = 0` (no matching
  `GoodsStock` row) and converts nothing - no special-casing needed beyond
  what `GoodsStock.objects.filter(...).first()` already returns.
- **Mill has no `GoodsConversionState` yet (first run ever).**
  `get_or_create` handles it inline in the task; no seeding/migration step
  needed.
- **Multiple mills in one population centre.** Each is processed
  independently against the same granary - if the granary doesn't have
  enough wheat for both, whichever mill is processed first (iteration
  order) gets first claim. Acceptable for now; not a scenario
  `spawn_villages` currently produces (one mill per village).
  Deterministic `order_by("id")` avoids at least making it random.
- **`InteriorSpace` usage migration for existing seeded worlds.** Existing
  granaries/mills keep their old `storage`-usage interiors until
  `populate_interiors` is re-run (it deletes and regenerates all interior
  spaces per building) - until then, `GoodsStock.capacity` for wheat/flour
  reads 0 (no matching usage), so nothing can be milled. Matches the
  existing "reseed to pick up interior changes" expectation, not a new
  problem this plan introduces.

---

## 6. Tests

- `convert_goods`: capped by labor, capped by available input stock,
  capped by output storage headroom (throttles input consumption, doesn't
  waste), converts the correct `conversion_ratio`-scaled amount when
  nothing is constraining.
- `GoodsStock.capacity` now reflects only the usage matching its
  `good_type`, not a building's total storage area (e.g. a mill with both
  `grain_storage` and `flour_storage` interiors - wheat capacity and flour
  capacity differ and don't double-count each other's space).
- `advance_mill_economy_tick`: converts wheat to flour capped by workers
  physically present at the mill; no-granary case doesn't raise;
  idempotency (`last_processed_on` guard, running twice same day is a
  no-op); multiple mills in one centre both get processed, deterministically
  ordered.

---

## 7. Risks

- The granary→mill "instant transport" simplification (Design decisions)
  could be mistaken for an oversight by a future engineer rather than a
  deliberate scoping choice - worth a code comment at the point `convert_goods`
  is called from the mill task, not just in this plan doc.
- Forgetting to re-run `populate_interiors` after this ships means existing
  mills/granaries have no `grain_storage`/`flour_storage` interiors yet,
  so `GoodsStock.capacity` reads 0 and nothing mills - easy to mistake for
  a bug rather than "needs a reseed," same class of issue already flagged
  for the wheat-harvest plan.
- Getting the throttle math backwards (capping by *output* headroom
  converted into input units, not input units converted into output units)
  is an easy off-by-a-ratio mistake - worth a explicit unit test with a
  `conversion_ratio != 1` to catch it.

---

## 8. Open questions

- `PER_WORKER_DAILY_MILLING_CAPACITY` and `WHEAT_TO_FLOUR_RATIO` are
  placeholder constants (proposing round numbers during implementation,
  tuned by feel afterward), same as the wheat-harvest plan's approach.
- Should flour eventually move to a shared "market" building rather than
  sitting at the mill indefinitely, once bakery needs to consume it?
  Leaning toward: bakery just reads from the mill's `GoodsStock` directly,
  the same way the mill reads from the granary - no market abstraction
  needed unless a village ever has multiple mills/bakeries and goods need
  to be pooled centrally.
