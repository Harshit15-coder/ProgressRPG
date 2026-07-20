# Plan: Bread Consumption (Characters Eat Bread)

## 1. High-level strategy

Close the economy loop's demand side: characters draw down village bread stock daily, tracked via a
new per-character `hunger` stat. Follow the existing "daily tick over buildings" convention
(`advance_field_economy_tick` → `advance_mill_economy_tick` → `advance_bakery_economy_tick`) with one
more link: `advance_bread_consumption_tick`.

Key simplification: consumption is drawn from the character's home population centre's bakery, not
from wherever the character is physically standing. Harvest/milling/baking require presence because
they model *labor*; eating models *demand*, so there's no reason to require a character be standing at
the bakery to be fed - reuse the existing `_find_granary`/`_find_mill` "one lookup per population
centre" pattern as `_find_bakery` instead of building a home-delivery/logistics system, which is a much
bigger feature than what's asked here.

Hunger itself gets a new model, `CharacterNeeds`, one-to-one with `Character`, created via signal -
this mirrors the existing `Behaviour` model exactly (same one-to-one-via-`post_save`-signal shape
already established in `character/signals.py`).

## 2. Files likely to change

| File | Change | Exists? |
|---|---|---|
| `character/models/needs.py` | New `CharacterNeeds` model: `character` (O2O), `hunger` (float), `last_fed_on` (date) | New file |
| `character/models/__init__.py` | Add `from .needs import *` | Exists |
| `character/signals.py` | Add `create_needs` receiver mirroring `create_behaviour` | Exists |
| `character/migrations/000X_characterneeds.py` | Migration for the new model | New file |
| `economy/constants.py` | Add `BREAD_PER_CHARACTER_DAILY_CONSUMPTION`, `HUNGER_PER_MISSED_MEAL`, `HUNGER_MAX` | Exists |
| `economy/tasks.py` | Add `_find_bakery` (mirrors `_find_mill`); add `advance_bread_consumption_tick` | Exists |
| `progress_rpg/celery.py` | Beat schedule entry after `advance_bakery_economy` | Exists |
| `economy/tests/test_tasks.py` | New test class for the consumption tick | Exists |
| `economy/management/commands/economy_dry_run.py` | Include the new tick in the dry-run chain | Exists |

No changes to `GoodsStock`/`GoodsConversionState`/`convert_goods` - consumption is a plain decrement,
not a conversion (no output good), so it doesn't fit `convert_goods`'s input→output shape and is
simpler written directly, same as `_deposit_into_granary` is a plain increment.

## 3. Implementation plan

1. Add `CharacterNeeds` model (`hunger` float default 0, `last_fed_on` nullable date) and wire it into
   `character/signals.py` via `get_or_create`, same as `Behaviour`. Migration.
2. Add consumption constants to `economy/constants.py`.
3. Add `_find_bakery(population_centre)` next to `_find_granary`/`_find_mill` in `economy/tasks.py`.
4. Add `advance_bread_consumption_tick(today=None)`:
   - Iterate `Character.objects.select_related(...)` with a primary `CharacterLocation(role=HOME)`.
   - Skip characters whose `CharacterNeeds.last_fed_on == today` (idempotency, same guard shape as
     `GoodsConversionState.last_processed_on`).
   - Resolve population centre from the home building; find its bakery via `_find_bakery`.
   - If bakery has a `GoodsStock(good_type=BREAD)` with enough quantity, deduct
     `BREAD_PER_CHARACTER_DAILY_CONSUMPTION`, reset/lower `hunger`. Otherwise increment `hunger` by
     `HUNGER_PER_MISSED_MEAL`, capped at `HUNGER_MAX`.
   - Set `last_fed_on = today` regardless of outcome (mirrors "mark processed even on no-op" in the
     existing ticks).
5. Register the task in `progress_rpg/celery.py`'s beat schedule.
6. Extend `economy_dry_run` to run the new tick inside the same rolled-back transaction and print
   hunger/bread diffs alongside the existing stock/crop diffs.
7. Tests: fed character consumes bread and hunger resets; no bakery/empty stock raises hunger instead;
   already-fed-today is a no-op; multiple characters sharing one bakery correctly share its stock
   (order-dependent - first-come-first-served, documented as a known simplification, not fixed with
   locking - see Design decisions).

## 4. Design decisions

**Consumption source: home population centre's bakery, not physical presence.**
Alternative: require the character be physically at (or near) a bakery/granary to eat, mirroring the
labor ticks. Rejected - modeling food distribution/logistics is a separate, larger feature; the
project has no delivery mechanic yet, and inventing one here would be scope creep beyond "characters
eat bread."

**New `CharacterNeeds` model rather than a field on `Character`.**
Alternative: add `hunger`/`last_fed_on` directly to `Character`. Rejected - `Character` already
composes several mixins; keeping need-tracking in its own O2O model (exactly like `Behaviour`) is more
consistent with the codebase's existing pattern and keeps future needs (thirst, rest, etc.) isolated
from core identity/movement fields.

**Idempotency via `last_fed_on` on `CharacterNeeds`, not a new state model.**
Alternative: a `FoodConsumptionState` model mirroring `GoodsConversionState`. Rejected - `CharacterNeeds`
already has to exist per character and already needs a "today" marker; a second model for the same
purpose would be pure duplication.

**Plain decrement, not `convert_goods`.**
`convert_goods` models an input-good → output-good transformation capped by labor and storage.
Consumption has no output good and no storage cap on the demand side - it's simpler and clearer as a
direct `GoodsStock.quantity` decrement, matching `_deposit_into_granary`'s directness rather than
forcing it through a mismatched abstraction.

## 5. Edge cases

- No bakery in the population centre → treat as a missed meal (increment hunger), same as the existing
  "no granary for mill" warning-and-skip pattern.
- Bakery bread stock insufficient for all residents → first-come-first-served by task iteration order;
  starving characters logged, not an error. Documented limitation, not solved with locking (see below).
- Character with no primary home `CharacterLocation` → skip entirely (nothing to resolve), log a
  warning once per run rather than per character to avoid log spam.
- `hunger` should be clamped at `HUNGER_MAX` so an indefinitely-neglected character doesn't grow an
  unbounded value - exact starvation consequences (beyond the stat existing) are explicitly out of
  scope for this plan (see Open questions).

## 6. Tests

- New: `AdvanceBreadConsumptionTickTests` in `economy/tests/test_tasks.py`, following the existing
  `AdvanceBakeryEconomyTickTests` fixture style (`_make_bakery`, plus a new `_make_character_with_home`
  helper).
  - Fed character: bread decrements, hunger resets, `last_fed_on` set.
  - No bakery in centre: hunger increments, no crash.
  - Empty bread stock: hunger increments same as no-bakery case.
  - Running twice same day: second run no-ops.
  - Two characters sharing one bakery with only enough bread for one: first fed, second's hunger rises.
- No changes needed to existing field/mill/bakery tick tests - this is additive.

## 7. Risks

- Forgetting to skip characters without a resolvable home location (would raise on `None.population_centre`).
- Double-counting if `_find_bakery` is called per-character in a loop without caching per population
  centre within a single tick run - fine for small worlds, but worth a comment noting it's O(characters)
  queries rather than O(population centres) if this ever needs optimizing.
- Getting the "mark processed even when no bakery" step wrong and causing a character to be silently
  skipped forever instead of retried daily.

## 8. Open questions

- Exact tuning values for `BREAD_PER_CHARACTER_DAILY_CONSUMPTION`, `HUNGER_PER_MISSED_MEAL`,
  `HUNGER_MAX` - placeholders, tuned by feel like the other economy constants.
- What (if anything) high hunger should *do* to a character - health/energy penalty, behaviour changes,
  death - deliberately out of scope here; this plan only introduces the stat and the feeding mechanism.
- Whether "one bread unit per character per day" should scale with character size/type (e.g. children
  eat less) - assumed no for now, flat rate.
