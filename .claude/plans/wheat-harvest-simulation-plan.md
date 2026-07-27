# Plan: Field crop growth cycle + wheat harvest into granary storage

## Context

Follow-up to [field-placement-plan.md](field-placement-plan.md),
[unify-work-flavor-with-jobs-plan.md](unify-work-flavor-with-jobs-plan.md),
and [field-shelter-and-crop-subzone-plan.md](field-shelter-and-crop-subzone-plan.md)
(supersedes the field-as-`Building` design - the crop area is now a
`Subzone`, with a separate small `field_shelter` `Building` as the walkable
work-site). Confirmed direction: wheat yield is driven by the crop area's
size, a full planted → growing → ready → harvested → fallow crop cycle (not
a flat daily formula), yield is capped by how many workers are physically
present (not area alone), and harvested wheat goes straight into the
village granary's storage as a pool (no per-character carrying).

---

## 1. High-level strategy

- A new `FieldCrop` model, one-to-one with the crops `Subzone` (for area)
  and referencing the associated `field_shelter` `Building` (for physical
  presence checks - `CharacterLocation` can only target a `Building`, so the
  shelter remains the thing characters actually walk to and stand at).
  Tracks crop state: `fallow` → `growing` → `ready`, advanced by a daily
  Celery task.
- A new `GoodsStock` model tracks quantity of a named good (starting with
  `wheat`) held by a building, capped by that building's storage capacity
  (derived from its `storage`-usage `InteriorSpace` area). Reused unchanged
  for flour/bread in the next follow-ups.
- One daily task, run just after the work shift ends
  (`locations/services/schedule.py`'s `WORK_END` = 18:00), does the whole
  day's economy step per field: advance growth, and if ready, harvest capped
  by `min(remaining crop, workers physically present × per-worker capacity)`,
  depositing the result into the population centre's granary.
- New `economy` Django app hosts this - see Design decisions for why not
  `locations`.

---

## 2. Files likely to change

- `economy/` - **new app**. `models.py` (`FieldCrop`, `GoodsStock`),
  `admin.py`, `tasks.py`, `migrations/`, `apps.py`. Mirrors the existing
  per-domain app structure (`character/`, `locations/`, `progression/`).
- `progress_rpg/settings/base.py` - existing. Add `"economy"` to
  `INSTALLED_APPS`.
- `progress_rpg/celery.py` - existing. Add a `beat_schedule` entry for the
  new daily task, following the existing `crontab(hour=X, minute=Y)` pattern
  already used for `calculate-daily-metrics`.
- `locations/management/commands/generate_fields.py` - existing (per
  [field-shelter-and-crop-subzone-plan.md](field-shelter-and-crop-subzone-plan.md),
  already being rewritten to create a crops `Subzone` + `field_shelter`
  `Building` pair). No longer the place `FieldCrop` gets created (see design
  decision below - a signal handles it instead), but worth a one-line
  mention in its help text that new crop subzones get a crop record
  automatically.
- `character/signals.py` - existing, for reference only - not edited, but
  the new `economy` signal (see below) follows its exact
  `post_save`-on-`Character`/`post_save`-on-`Building` pattern.
- `locations/admin.py` or new `economy/admin.py` - register the two new
  models for inspection during dev/testing.

---

## 3. Implementation plan

1. **`economy` app scaffold** - `models.py`, `apps.py`, `admin.py`,
   `tasks.py`, register in `INSTALLED_APPS`.
2. **`FieldCrop` model**: `subzone` (OneToOne → `locations.Subzone`, the crop
   area - drives the yield-from-area calculation), `shelter_building` (FK →
   `locations.Building`, the `field_shelter` work-site - drives the
   physical-presence labor cap), `stage` (choices: `fallow`, `growing`,
   `ready`), `planted_at`
   (nullable DateTimeField), `ready_yield` (nullable FloatField, snapshotted
   once when the crop becomes ready - area × yield-per-area constant, so a
   later footprint change mid-cycle can't retroactively alter an in-progress
   harvest), `harvested_amount` (FloatField, default 0), `last_processed_on`
   (nullable DateField - see concurrency note below).
3. **`GoodsStock` model**: `building` FK, `good_type` (choices, starting
   with just `("wheat", "Wheat")` - extensible, not a free-text field, so
   flour/bread additions are a one-line choices change), `quantity`
   (FloatField, default 0). `unique_together` on `(building, good_type)`.
   Add a `capacity` property/method that sums the `area` of that building's
   `storage`-usage `InteriorSpace` rows × a capacity-per-area constant -
   computed on read, not stored, so it can't go stale when
   `populate_interiors` regenerates interior spaces.
4. **`FieldCrop` creation happens directly in `generate_fields.py`**, not via
   a signal (see Design decisions - unlike `Behaviour`/`Character`, this
   needs two related objects, the `Subzone` and the `field_shelter`
   `Building`, both created in the same command and linked together, which
   a single-model `post_save` signal can't cleanly express). Right after
   both are created: `FieldCrop.objects.create(subzone=crop_subzone,
   shelter_building=shelter, stage="fallow")`.
5. **`economy/tasks.py`**: one `@shared_task` (e.g.
   `advance_field_economy_tick`), run once daily. Per `FieldCrop`:
   - Skip entirely if `last_processed_on == today` (idempotency guard - see
     Edge cases).
   - `fallow` → `growing`: only if `today.month` falls within
     `SOWING_WINDOW_MONTHS` (spring wheat: Feb-Apr) - set `planted_at =
     now`, stage = `growing`. Outside the window the crop simply stays
     `fallow` until the window comes back around next year (see Design
     decisions for why this replaced the earlier immediate-replant
     placeholder).
   - `growing` → `ready`: if `now - planted_at >= GROWTH_DURATION`, compute
     `ready_yield = subzone.boundary.area * YIELD_PER_AREA`, stage =
     `ready`, `harvested_amount = 0`.
   - `ready`: count characters physically present at the shelter
     (`Character.objects.filter(current_node__building=shelter_building,
     is_moving=False).count()` - reuses the existing `current_building`/
     `Movable` pattern, not `CharacterLocation` assignment, so only workers
     who actually arrived count). `today_yield = min(remaining,
     workers_present * PER_WORKER_DAILY_CAPACITY)`. Deposit into the
     population centre's granary `GoodsStock` (capped at capacity - see Edge
     cases), increment `harvested_amount`. If `harvested_amount >=
     ready_yield`, stage → `fallow`.
   - Set `last_processed_on = today` regardless of branch taken.
6. **`progress_rpg/celery.py`**: add
   `"advance_field_economy": {"task": "economy.tasks.advance_field_economy_tick", "schedule": crontab(hour=18, minute=5)}`
   - 5 minutes after `WORK_END`, so the day's final commute has settled and
   presence counts are stable.
7. **Constants**: module-level in `economy/models.py` or a small
   `economy/constants.py` - `SOWING_WINDOW_MONTHS` (frozenset of calendar
   months a crop can be planted in - spring wheat: `{2, 3, 4}`),
   `GROWTH_DURATION` (timedelta from planting to ready - spring wheat:
   ~150 days, landing readiness around Jul-Sep), `YIELD_PER_AREA` (wheat
   units per crop-`Subzone` area unit at full maturity),
   `PER_WORKER_DAILY_CAPACITY` (wheat units one worker can harvest per day),
   `STORAGE_CAPACITY_PER_AREA` (goods units per storage-interior-space area
   unit).
8. **Admin registration** for `FieldCrop`/`GoodsStock` - read-only-ish dev
   visibility, matches existing admin patterns.

---

## 4. Design decisions

**New `economy` app vs. extending `locations`.** Chosen: new app. The field
*building* and its *footprint* belong in `locations` (geometry/placement),
but crop growth and goods storage are resource-production concerns that will
soon include the mill and bakery converting goods - none of that is a
location concept. Alternative considered: put `FieldCrop`/`GoodsStock` in
`locations` next to `Building` - rejected, `locations` would become a grab-bag
of "everything touching a Building" rather than staying about geometry/
placement/pathing, and the app boundary is cheap to get right now versus
expensive to unwind once flour/bread logic is layered on top.

**Physical presence (`current_node__building`, checked against the
`field_shelter` Building) vs. job assignment (`CharacterLocation`) for the
labor cap.** Chosen: physical presence - this is what makes it a simulation
rather than a formula; a worker assigned to the field but still commuting
shouldn't count. Alternative: use `CharacterLocation.role=WORK` counts
directly (cheaper query, no need to wait for the daily commute to settle) -
rejected as less faithful to "who actually showed up," which is the whole
appeal of area/labor-based yield.

**`FieldCrop` created directly by `generate_fields.py` vs. via a `post_save`
signal.** Chosen: direct creation. The original single-`Building` design
could mirror `character/signals.py`'s `Behaviour.objects.get_or_create`
pattern (one model, one signal). Once the crop area and work-site became two
separate objects (`Subzone` + `field_shelter` `Building`) that must be
created together and linked on the same `FieldCrop` row, a signal on either
model's `post_save` can't know about the other - whichever is created first
would fire before its sibling exists. `generate_fields.py` already has both
objects in hand at creation time, so it creates the `FieldCrop` explicitly
right after.

**Snapshot `ready_yield` at the moment of readiness vs. recompute live from
current footprint every tick.** Chosen: snapshot. A field's footprint
shouldn't change once placed, but snapshotting is defensive against a
future re-seed/edit mid-cycle silently changing an in-progress harvest's
total, which would be a confusing bug to chase.

**Real calendar-driven sowing window (spring wheat) vs. immediate replant.**
Chosen: spring wheat, sown Feb-Apr, ready ~150 days later (Jul-Sep) -
`fallow` only transitions to `growing` if the current month falls in
`SOWING_WINDOW_MONTHS`; otherwise it stays `fallow` until the window comes
back around next year. This replaces the original placeholder ("immediate
replant, no fallow gap, deferred for realism") once the user asked for
realistic growing seasons - a multi-month growth duration makes year-round
instant replanting look wrong (a field harvested in August immediately
resprouting), and a real fallow gap is expected, correct behaviour rather
than something to avoid. Winter wheat (sown Sep-Nov, ~10-11 month cycle) and
per-field variety (spring vs. winter, randomly assigned) were both
considered and rejected for the first version - winter wheat's cycle is
long enough to make the feature hard to observe/tune in-game, and mixed
varieties are a straightforward follow-up (a `variety` field driving which
constants apply) once the single-variety loop is proven.

**Capacity computed from `InteriorSpace` area vs. a stored field on
`GoodsStock`.** Chosen: computed on read from summed `storage`-usage
`InteriorSpace.area` for that building. `populate_interiors` deletes and
regenerates all interior spaces on every run (`building.interiorspaces.all().delete()`
in `populate_interiors.py`); a stored capacity value would go stale the next
time interiors are regenerated (e.g. reseeding), while stock quantity itself
must survive that regeneration - keeping capacity derived means it can never
disagree with the current world state.

**Idempotency guard (`last_processed_on`) vs. trusting Celery beat's single
schedule.** Chosen: explicit guard. Unlike `commute_tick` (naturally
idempotent - resyncing a character who's already where they should be is a
no-op) or `sync_character_location`, running the harvest step twice in one
day would double the wheat deposited, which is a real economy bug, not a
cosmetic one. A cheap per-`FieldCrop` date check is worth the extra field.

---

## 5. Edge cases

- **No granary in the population centre.** Skip the deposit, log a warning -
  matches `generate_fields`'s existing style of warning-and-continuing
  rather than raising.
- **Granary storage already at/near capacity.** Deposit only up to
  remaining capacity; the rest is lost this cycle (not carried over as a
  backlog) - simplest starting behaviour, worth flagging to the user as a
  deliberate simplification rather than an oversight.
- **Multiple granaries in one population centre.** Shouldn't happen given
  `spawn_villages` places exactly one, but if it ever does: deposit into the
  first by `id` for determinism, don't split.
- **Crop `Subzone` or `field_shelter` `Building` deleted mid-cycle.**
  `FieldCrop.subzone` is a `CASCADE` OneToOne, so deleting the crop area
  cleanly removes the crop record. `shelter_building` is a plain FK -
  decide `on_delete` behaviour deliberately (likely `CASCADE` too, since a
  `FieldCrop` without its work-site can't be harvested; document the choice
  during implementation rather than defaulting silently).
- **Task runs before any workers have ever been assigned to a ready
  field.** `workers_present` is naturally 0, `today_yield` is 0, crop stays
  `ready` indefinitely until someone's assigned and shows up - correct
  behaviour, not a bug case.
- **Migration/backfill for fields created before this feature ships.**
  `FieldCrop` rows are created directly by `generate_fields.py` going
  forward (see Design decisions), so any world seeded before this ships
  simply has no crop-area `Subzone`/`field_shelter` pair yet - reseeding via
  `setup_world`/`seed_village_view` (already the expected path per
  [field-shelter-and-crop-subzone-plan.md](field-shelter-and-crop-subzone-plan.md)'s
  own migration notes) covers it; no separate backfill needed.

---

## 6. Tests

- `generate_fields.py` creates a `FieldCrop(stage="fallow")` linked to the
  new `Subzone` and `field_shelter` `Building` it just placed.
- Growth transition: a `growing` crop past `GROWTH_DURATION` becomes `ready`
  with `ready_yield` matching `subzone.boundary.area * YIELD_PER_AREA`.
- Harvest capped by workers: `ready` crop with fewer physically-present
  workers (at the `field_shelter`) than the area would otherwise support
  yields `workers_present * PER_WORKER_DAILY_CAPACITY`, not the full
  remaining amount.
- Harvest capped by remaining crop: near-depleted crop with plenty of
  workers present yields only what's left, and transitions to `fallow`.
- Deposit capped by granary capacity: depositing more than remaining
  capacity only adds up to the cap, doesn't raise, doesn't exceed capacity.
- Idempotency: running the task twice in the same day only processes each
  `FieldCrop` once (`last_processed_on` guard).
- No-granary case: a population centre with no granary building doesn't
  raise when its field tries to deposit a harvest.

---

## 7. Risks

- Forgetting the `last_processed_on` guard (or getting its timezone/`today`
  comparison wrong across a daily task boundary) silently double-harvests -
  the most consequential correctness bug this feature could ship with.
- Using `CharacterLocation` instead of `current_node__building` (checked
  against `shelter_building`) for the labor count would quietly break the
  "must physically show up" premise the user explicitly wants.
- Checking presence against the crop `Subzone` instead of the
  `field_shelter` `Building` would silently return nothing - characters
  never have a `current_node` inside a `Subzone`, only inside a `Building`.
- `GoodsStock.capacity` recomputing from `InteriorSpace` on every read is a
  query per call - fine at current world sizes (single-digit buildings per
  village) but worth a comment noting it's not designed to scale to many
  granaries queried in a hot loop.

---

## 8. Open questions

- `SOWING_WINDOW_MONTHS` and `GROWTH_DURATION` are now grounded in a real
  spring wheat calendar (Feb-Apr sowing, ~150 days to ready), so they're
  settled rather than placeholders. `YIELD_PER_AREA`,
  `PER_WORKER_DAILY_CAPACITY`, and `STORAGE_CAPACITY_PER_AREA` remain
  placeholder starting values - tuning by feel once it's visible in the
  browser, rather than trying to derive "correct" numbers up front.
- Winter wheat and per-field crop variety were deferred (see Design
  decisions) - worth a follow-up once the single spring-wheat loop is
  proven and villages have more than one crop field to make variety
  visible.
- Should `GoodsStock`/`FieldCrop` be exposed on the map view (e.g. a
  granary's fill level, a field's growth stage as a tooltip/colour) as part
  of this piece, or is that purely a follow-up once wheat exists at all?
  Leaning toward follow-up - this plan is about the simulation being
  correct, not yet about surfacing it visually.
