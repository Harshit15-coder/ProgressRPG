# Storage Categories Plan

## Context

`GoodsStock.capacity` currently matches a good to storage via a 1:1 dict
(`GOOD_TYPE_STORAGE_USAGE`) from `good_type` to a single `InteriorSpace.usage`
value (`grain_storage`, `flour_storage`). This only works because each good
so far has its own dedicated room. It breaks down for:

- **General-purpose storage** (a house pantry) that should hold *several*
  goods (food items, small equipment) without a dedicated room per good.
- **Exceptions** within a category (a locked cellar that holds wine only,
  even though it's tagged `food`; a shed that holds all equipment except
  something oversized).

This plan replaces the 1:1 usage mapping with category tags plus optional
per-space allow/deny lists.

---

## 1. High-level strategy

- Give both goods and storage spaces a set of **category tags** (`food`,
  `grain`, `flour`, `equipment`, ...). A space's capacity for a good is
  driven by tag overlap, not a single `usage` value.
- Add optional `allowed_goods` / `excluded_goods` lists on `InteriorSpace`
  for exceptions that can't be expressed with tags alone.
- Collapse the `grain_storage` / `flour_storage` `SpaceUsage` entries back
  into the general `storage` usage — the distinction they encoded moves to
  categories, which generalizes past two hardcoded rooms.

---

## 2. Files likely to change

| File | Change | Status |
|---|---|---|
| `locations/models.py` | `InteriorSpace`: drop `GRAIN_STORAGE`/`FLOUR_STORAGE` from `SpaceUsage`; add `storage_categories`, `allowed_goods`, `excluded_goods` array fields | exists |
| `locations/migrations/000X_...py` | schema migration for the above; data migration to reclassify existing `grain_storage`/`flour_storage` rows | new |
| `economy/constants.py` | replace `GOOD_TYPE_STORAGE_USAGE` with `GOOD_TYPE_CATEGORIES` (good_type → frozenset of tags) | exists |
| `economy/models.py` | `GoodsStock.capacity`: match by category overlap + allow/deny override instead of a single usage lookup | exists |
| `locations/management/commands/populate_interiors.py` | `BUILDING_INTERIORS_PROPORTIONS` restructured to a list-of-subspaces per building type, each with `usage`, `fraction`, `categories` | exists |
| `economy/tests/test_conversion.py`, `economy/tests/test_tasks.py` | update `_make_building`/`_make_granary`/`_make_mill` helpers to set categories instead of the removed usage values | exists |
| `economy/tests/test_capacity.py` (or similar) | new tests for category overlap, whitelist, blacklist, multi-good shared storage | new |

---

## 3. Implementation plan

1. **Model fields.** Add to `InteriorSpace`:
   - `storage_categories = ArrayField(models.CharField(max_length=50), default=list, blank=True)`
   - `allowed_goods = ArrayField(models.CharField(max_length=50), default=list, blank=True)`
   - `excluded_goods = ArrayField(models.CharField(max_length=50), default=list, blank=True)`
   Remove `GRAIN_STORAGE`/`FLOUR_STORAGE` from `SpaceUsage`.
2. **Migration.** Schema migration for the new fields + altered choices, plus
   a data migration (`RunPython`) that converts any existing
   `usage="grain_storage"` row to `usage="storage", storage_categories=["grain"]`
   (same for flour), so staging data isn't silently orphaned.
3. **Constants.** Replace `GOOD_TYPE_STORAGE_USAGE` with `GOOD_TYPE_CATEGORIES`,
   e.g. `{"wheat": frozenset({"food", "grain"}), "flour": frozenset({"food", "flour"})}`.
   Every `GoodType` must have an entry — no implicit fallback (see Design
   decisions).
4. **`GoodsStock.capacity`.** For each `InteriorSpace` on the building:
   - if `allowed_goods` is non-empty, include the space only if `good_type`
     is in it (whitelist wins outright, categories ignored);
   - elif `good_type` is in `excluded_goods`, skip the space;
   - else include the space if its `storage_categories` overlaps the good's
     categories.
   Sum matching areas × `STORAGE_CAPACITY_PER_AREA`, as today.
5. **`populate_interiors.py`.** Change `BUILDING_INTERIORS_PROPORTIONS` values
   from `{usage: fraction}` to a list of `{"usage", "fraction", "categories"}`
   dicts, so a building type can have two rooms with the same `usage` (mill's
   grain room and flour room both become `usage="storage"`, distinguished
   only by `categories`). Update `generate_subspaces()` to iterate the list.
   Set categories per building type: granary → `["grain"]`; mill → one
   `["grain"]` room + one `["flour"]` room; residential/inn/communal storage
   → `["food", "equipment"]` (general household storage); field_shelter
   storage → `["grain"]` (temporary pre-granary holding).
6. **Update existing tests** that build `InteriorSpace` rows with the removed
   usage values to use `usage="storage"` + the appropriate `categories`.
7. **Add new capacity tests** covering overlap matching, whitelist, blacklist,
   and a shared multi-good space.

---

## 4. Design decisions

**Tags on both sides vs. a single enum-to-enum mapping (chosen: tags).**
The current `GOOD_TYPE_STORAGE_USAGE` dict is a 1:1 mapping; it can't express
"this room holds several goods" or "this good can go in several kinds of
room" without enumerating every combination. Tag overlap generalizes both
directions with one mechanism. Alternative considered: keep 1:1 usage
mapping and just add more specific usage values per good (`meat_storage`,
`tool_storage`, ...) — rejected, this is exactly the enum-explosion the
current design already hit with two goods.

**Category tags as free-text `CharField` list vs. a `StorageCategory` model.**
Chosen: plain string tags in an `ArrayField`, matching how `good_type` is
already a `TextChoices` string rather than a DB-backed model. A dedicated
model would let categories be admin-editable, but goods themselves are
code-defined (`GoodsStock.GoodType`), so category definitions are naturally
code-defined too (`GOOD_TYPE_CATEGORIES` in `constants.py`). Introducing a DB
model here would be inconsistent with how `good_type` is already modeled and
adds a join for no behavioural gain at this scale.

**Whitelist/blacklist as two separate override lists vs. one field with a
mode flag.** Chosen: two lists (`allowed_goods` takes priority over
`excluded_goods`), since a `field_shelter`-style space realistically needs
either "only these goods" or "these goods excluded," never both at once, and
two lists avoids modeling a mode enum for a case that's mutually exclusive
in practice already (whitelist wins if both happen to be set).

**Collapsing `grain_storage`/`flour_storage` back into `storage`.** These two
usage values were added one iteration ago specifically to distinguish grain
from flour rooms. Categories now do that job more generally, so keeping both
mechanisms would be duplication - `usage` would encode "what this room is
for" twice, once broadly (workshop/storage/kitchen) and once specifically
(grain_storage). Collapsing keeps `usage` as pure room-purpose and
`categories` as pure contents.

**No implicit fallback when a good_type has no `GOOD_TYPE_CATEGORIES`
entry (chosen: capacity is 0, hard requirement).** Alternative: fall back to
generic `storage` usage, as the current code does for unmapped goods.
Rejected - a silent fallback previously caused a real bug in this session
(the granary capacity test broke silently when the usage-lookup changed
underneath it). Requiring every good to have explicit categories fails loud
(capacity reads 0) instead of quietly matching the wrong room.

**Python-side loop in `capacity` vs. a single ORM aggregate.** Chosen:
iterate the building's (small, single-digit) `InteriorSpace` set in Python,
since whitelist/blacklist precedence isn't cleanly expressible as one
`aggregate()` call without raw SQL. Correctness and readability at this data
scale outweigh the minor query-count cost, consistent with the existing
`capacity` property's precedent of a single filtered aggregate per call.

---

## 5. Edge cases

- Good type missing from `GOOD_TYPE_CATEGORIES` → capacity is 0 for that
  good everywhere (fail loud, see above) - not an exception, since
  `capacity` is read in hot paths (`convert_goods`) that shouldn't raise.
- Space with empty `storage_categories` and empty `allowed_goods` matches
  nothing - it's just floor space, not storage (e.g. `living`, `kitchen`
  usages don't need categories set at all).
- `allowed_goods` and `excluded_goods` both set on the same space: whitelist
  wins, blacklist is ignored for that space (documented, not silently
  ambiguous).
- Existing DB rows with `usage="grain_storage"`/`"flour_storage"` at
  migration time — handled by the data migration in step 2; if
  `populate_interiors` is rerun after migrating, this is moot since it
  deletes and regenerates all `InteriorSpace` rows per building anyway.
- `ArrayField` requires the Postgres backend - already the case
  project-wide (PostGIS), no new dependency.

---

## 6. Tests

- New: category overlap grants capacity (single-category space, e.g.
  granary-style `["grain"]` matching wheat only).
- New: shared multi-good space (`["food", "equipment"]`) contributes
  capacity to more than one `good_type`.
- New: `allowed_goods` restricts a space to only listed goods even when
  categories would otherwise match.
- New: `excluded_goods` removes a specific good from an otherwise-matching
  category space.
- New: good_type with no `GOOD_TYPE_CATEGORIES` entry has capacity 0.
- Modify: `_make_granary`/`_make_mill` helpers in `economy/tests/test_tasks.py`
  and `_make_building` in `economy/tests/test_conversion.py` to use
  `usage="storage"` + `categories=[...]` instead of the removed usage values.
- Modify: any `populate_interiors` test/assertion relying on the old
  `BUILDING_INTERIORS_PROPORTIONS` dict shape.

---

## 7. Risks

- Forgetting to update a test helper that constructs `InteriorSpace` with
  the now-removed `grain_storage`/`flour_storage` usage — will silently
  read capacity 0 rather than erroring, since `usage` is a plain
  `CharField` with choices (not DB-enforced). Grep for both strings before
  considering this done.
- `BUILDING_INTERIORS_PROPORTIONS` changing shape (dict → list) is a
  breaking change to `generate_subspaces()` — any other caller of that
  dict (if one exists outside `populate_interiors.py`) needs updating too.
- Mixing up whitelist/blacklist precedence when both are set on a space.

---

## 8. Open questions

- Should `GOOD_TYPE_CATEGORIES` and the category tag vocabulary live in
  `economy/constants.py` (current proposal, keeps it next to `GoodType`) or
  in `locations/` (next to `InteriorSpace`)? Proposal keeps it in `economy`
  since goods are economy's concern and `locations` shouldn't need to know
  the good catalog.
- Do we need a `cold` category now (for future perishables), or add it when
  the first cold-storage good actually arrives? Proposal: add tags only
  when a concrete good needs them, per "avoid unnecessary abstraction."
