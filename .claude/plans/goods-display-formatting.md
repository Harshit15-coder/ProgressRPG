# Per-good human-readable quantity display (loaves, sacks)

## 1. High-level strategy

`format_quantity()` in `economy/constants.py` already centralizes all
good-quantity display logic and is the single call site every consumer
(`economy/admin.py`, the three `economy_*` management commands) goes
through — none of them read `GoodsStock.quantity` directly for display.
Storage stays in grams/litres exactly as now (`GOOD_TYPE_UNIT`,
`GoodsStock.quantity`, `GoodsStock.capacity` are untouched).

The change is to make `format_quantity()` dispatch on `good_type` to a
per-good display strategy instead of applying one kg/L rule uniformly:
bread → loaves (1 loaf = 1000g, one decimal place), flour → whole sacks
(20,000g/sack, always rounded up), wheat and everything else → the existing
kg/L formatting unchanged. This is an extension of the same
`GOOD_TYPE_X = {...}` dict pattern already used for `GOOD_TYPE_UNIT`,
`GOOD_TYPE_BULK_DENSITY`, and `GOOD_TYPE_STORAGE_USAGE` — not a new
architectural concept.

## 2. Files likely to change

- `economy/constants.py` (exists) — add `LOAF_WEIGHT_GRAMS`,
  `SACK_CAPACITY_GRAMS` constants; add a small per-good_type dispatch table;
  split `format_quantity`'s current body into a default (kg/L) formatter
  plus bread/flour formatters, selected via the dispatch table.
- `economy/tests/` (exists — wherever `format_quantity`/`GoodsStock`
  display is currently covered, e.g. `test_conversion.py` or a dedicated
  constants test file if one exists) — add cases for loaves/sacks
  formatting and rounding-up behaviour.
- No changes needed to `economy/models.py`, `economy/conversion.py`, or any
  `economy_*` management command — they all already call `format_quantity`
  generically by `good_type` and don't need to know the good's display
  strategy.

## 3. Implementation plan

1. Add `LOAF_WEIGHT_GRAMS = 1000` and `SACK_CAPACITY_GRAMS = 20_000` to
   `economy/constants.py`, each with a one-line comment citing the reasoning
   already given by the user (1 loaf = 1kg exact; 20kg/sack, arbitrary but
   reasonable default, called out as adjustable).
2. Extract the current `format_quantity` body (the kg/L branch) into a
   private `_format_default(good_type, value, signed)` helper — behaviour
   unchanged, just named so it can be reused as the fallback case.
3. Add `_format_bread(value, signed)`: `loaves = value / LOAF_WEIGHT_GRAMS`,
   formatted to one decimal place with a "loaf"/"loaves" suffix (singular
   only for exactly 1).
4. Add `_format_flour(value, signed)`: `sacks = math.ceil(value /
   SACK_CAPACITY_GRAMS)`, formatted as an integer with a "sack"/"sacks"
   suffix. See Edge cases for the `signed=True` (delta) case.
5. Add a `GOOD_TYPE_FORMATTER = {"bread": _format_bread, "flour":
   _format_flour}` dict next to the other `GOOD_TYPE_*` mappings.
6. Rewrite `format_quantity` to use `_format_default` whenever `signed=True`
   (deltas always show in plain kg/L, regardless of good_type), and
   otherwise look up `GOOD_TYPE_FORMATTER.get(good_type, _format_default)`
   and call it. Same public signature, same call sites, zero changes needed
   anywhere outside `constants.py`.
7. Update/add tests (see Tests section).

Each step is small and independently reviewable; steps 1–6 are really one
commit (they're one cohesive change to one function), step 7 could be a
separate commit if preferred.

## 4. Design decisions

**Evolve `format_quantity` in place, don't split into low-level +
high-level formatters.**
- Alternative considered: a `format_raw_quantity()` (kg/L only) plus a
  separate `format_display_quantity()` (loaves/sacks/kg) layered on top.
- Rejected because no current caller wants the low-level form — every call
  site (admin list_display, three forecast/status/dry-run commands) wants
  "the right human string for this good_type" and nothing else. Splitting
  would add an API surface with only one real consumer, and callers would
  have to know which one to pick per good_type anyway, which is exactly
  the dispatch this plan already centralizes. If a genuine second consumer
  of raw kg/L numbers shows up later (e.g. a chart), it's a trivial one-line
  addition then — not a reason to pre-build it now.

**Per-good_type dispatch dict over `if good_type == "bread": ... elif ...`
inline in `format_quantity`.**
- Alternative: keep one function with inline branching.
- Rejected in favour of the dict because it matches the codebase's existing
  convention (`GOOD_TYPE_UNIT`, `GOOD_TYPE_BULK_DENSITY`,
  `GOOD_TYPE_STORAGE_USAGE`) for "behaviour that varies per good_type," and
  keeps `format_quantity` itself trivial (one dict lookup + call) rather
  than growing a branch per future good.

**Signed deltas (`signed=True`) always display in plain kg/L, never as
loaves/sacks, regardless of good_type.**
- Alternative considered: round the delta's magnitude up to a whole sack
  and reapply the sign (e.g. a -500g change shows as "-1 sack").
- Rejected as unnecessary complexity for a case the user didn't actually
  ask about — the loaves/sacks request was specifically about displaying
  *stock levels*, and "always round up" only has a clear meaning for a
  quantity sitting in storage, not for a signed change. Only one call site
  (`economy_dry_run.py`) uses `signed=True`, and showing deltas in kg
  there is unambiguous and requires no extra rule.

**Flour rounds up via `math.ceil`, bread does not.**
- This directly reflects the user's stated domain rule (a sack is a
  discrete container; any remainder still needs one) vs. bread being an
  exact, already-discrete unit (1 loaf = 1kg) with no packaging step to
  round for.

**No new metadata/inventory system.**
- Considered whether "sacks"/"loaves" implies a discrete-item/inventory
  model. Rejected — nothing here changes what's stored or how goods flow
  through `convert_goods`/capacity; it's purely `value → string` at the
  point of display, consistent with the user's explicit framing.

## 5. Edge cases

- **Zero quantity for flour**: `math.ceil(0 / 20000) = 0` sacks — correct,
  no sack needed for nothing.
- **`signed=True` deltas for flour/bread**: `economy_dry_run.py` calls
  `format_quantity(good_type, new - old, signed=True)`. Per the decision
  above, `signed=True` always takes the `_format_default` (plain kg/L)
  path regardless of good_type, so a flour delta of -500g shows as
  "-0.5kg", not a fractional or sign-flipped sack count. This sidesteps the
  ambiguity of "round up" applied to a negative/partial change entirely.
- **Bread fractional display**: 500g → "0.5 loaves" per the user's own
  example ("or another sensible representation if preferred") — going with
  decimal loaves rather than a "½" glyph, since the codebase already
  formats other decimals this way (`,.1f` pattern) and a glyph would need
  special-casing for thirds/quarters etc. if precision ever changes.
- **Singular/plural suffix**: "1 loaf" / "1 sack" vs "2 loaves" / "2 sacks"
  — straightforward `== 1` check, called out only because it's easy to
  forget.
- **`unit_suffix()` is untouched** and still returns "kg"/"L" — it's used
  elsewhere for wheat/other goods' plain kg/L labels, and isn't called by
  the new bread/flour branches (they build their own suffix).

## 6. Tests

- New unit tests for `format_quantity`:
  - Bread: `12000 → "12.0 loaves"`, `1000 → "1.0 loaf"`,
    `500 → "0.5 loaves"`.
  - Flour: `1000 → "1 sack"`, `20000 → "1 sack"`, `21000 → "2 sacks"`,
    `38000 → "2 sacks"`, `41000 → "3 sacks"`, `0 → "0 sacks"`.
  - Wheat: confirm unchanged kg formatting (existing behaviour, regression
    guard only).
  - Any other/unlisted good_type: confirm it still falls through to
    `_format_default` (regression guard).
  - `signed=True`: confirm bread/flour deltas format as plain kg (e.g.
    `format_quantity("flour", -500, signed=True) == "-0.5kg"`), not as
    loaves/sacks.
- Existing tests to check: any test currently asserting the exact string
  `format_quantity("bread", ...)` or `format_quantity("flour", ...)`
  produces (grep needed at implementation time) will need updating to the
  new loaves/sacks strings — likely only incidental assertions in
  `economy_forecast`/`economy_status` output-format tests, if any exist.

## 7. Risks

- Forgetting to update an existing test/snapshot that hardcodes the old
  "X.Xkg" string for bread or flour specifically (wheat/other goods are
  unaffected, lower risk).
- Singular/plural suffix off-by-one (e.g. "1 sacks") — easy to miss without
  a dedicated test for the boundary value.
- Forgetting to route `signed=True` to `_format_default` before checking
  `GOOD_TYPE_FORMATTER` (i.e. checking good_type first would wrongly send
  signed flour/bread deltas through the sacks/loaves formatters).

## 8. Open questions

- Is 20kg/sack the right assumed capacity, or should it be a different
  round number? (User already flagged this as adjustable.)
