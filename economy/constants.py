import math
from datetime import timedelta
from enum import Enum

# Spring wheat: sown Feb-Apr, ready roughly 5 months later (Jul-Sep) - a
# real calendar-driven sowing window rather than year-round planting.
SOWING_WINDOW_MONTHS = frozenset({2, 3, 4})
GROWTH_DURATION = timedelta(days=150)

# Remaining values are re-derived from real-world reference points below
# (yield, labor throughput, storage density, daily consumption) rather than
# being pure placeholders - see each constant's comment for its reasoning.
# They're still approximate and expected to need a balance pass once
# visible in the browser.


class UnitKind(Enum):
    """
    Which base unit a good's `GoodsStock.quantity` is accounted in - not a
    model field (never stored), just used to interpret/format quantities
    and to pick the right storage-capacity constant.
    """

    WEIGHT = "weight"  # grams
    VOLUME = "volume"  # litres


# Wheat, flour and bread are all mass-accounted: milling/baking yields and
# daily bread consumption are naturally expressed by weight. A future
# genuinely volume-native good (e.g. "water") would be added here as
# UnitKind.VOLUME. Falls back to UnitKind.WEIGHT for any good_type not
# listed.
GOOD_TYPE_UNIT = {
    "wheat": UnitKind.WEIGHT,
    "flour": UnitKind.WEIGHT,
    "bread": UnitKind.WEIGHT,
}

# Wheat units per crop-Subzone area unit (m^2) at full maturity, in grams.
# ~300 g/m^2 approximates ~3 tonnes/hectare, a modest pre-industrial wheat
# yield (real-world yields range roughly 3-8 tonnes/hectare). A whole
# number of grams - there's no meaningful sub-gram precision for a weight-
# kind good (see GOOD_TYPE_UNIT), unlike volume-kind goods below.
YIELD_PER_AREA = 300

# Grams of wheat one physically-present worker can harvest per day.
# ~100kg/day approximates a manual (non-mechanized) harvest rate.
PER_WORKER_DAILY_CAPACITY = 100_000

# Storage capacity per unit of storage-usage InteriorSpace area (m^2), split
# by how the good is physically stored rather than one flat figure for
# everything:
# - Direct weight-per-area, for goods stored as discrete sacked/shelved
#   units (flour, bread): ~1 tonne/m^2 at a practical ~2m storage height.
STORAGE_CAPACITY_PER_AREA_WEIGHT = 1_000_000
# - Volume-per-area, for goods stored as loose bulk material in a silo
#   (wheat - see GOOD_TYPE_BULK_DENSITY below) or, once one exists, a
#   genuinely volume-accounted liquid good: ~1000L/m^2 at a practical ~2m
#   storage height. Kept as a float, unlike its weight sibling above -
#   litres are volume-kind and fractional values are meaningful (e.g. a
#   half-full barrel), so this shouldn't be forced to a whole number.
STORAGE_CAPACITY_PER_AREA_VOLUME = 1_000.0

# Which goods are stored as loose bulk material (a silo/granary) rather
# than as discrete sacked/shelved units, even though they're mass-accounted
# (see GOOD_TYPE_UNIT). For these, storage capacity is limited by the
# room's *volume* (STORAGE_CAPACITY_PER_AREA_VOLUME) and converted to a
# grams ceiling via the good's real bulk density (g per litre), rather
# than using the flat weight-per-area figure. Only wheat qualifies today -
# flour and bread are stored as sacks/loaves, not loose bulk. Bulk density
# of loose wheat grain is ~770 g/L.
GOOD_TYPE_BULK_DENSITY = {
    "wheat": 770,
}

# Which InteriorSpace usage stores a given good - grain and flour are kept
# separate (different spoilage/pest risk, historically different rooms),
# rather than sharing one generic "storage" bucket. Falls back to the
# generic "storage" usage for any good_type not listed here.
GOOD_TYPE_STORAGE_USAGE = {
    "wheat": "grain_storage",
    "flour": "flour_storage",
}

# Grams of grain one physically-present worker can mill per day.
PER_WORKER_DAILY_MILLING_CAPACITY = 100_000

# Grams of flour produced per gram of grain milled - a dimensionless yield
# ratio, kept as a float regardless of the good's UnitKind.
WHEAT_TO_FLOUR_RATIO = 0.75

# Grams of flour one physically-present worker can bake per day.
PER_WORKER_DAILY_BAKING_CAPACITY = 100_000

# Grams of bread produced per gram of flour baked - a dimensionless yield
# ratio, kept as a float regardless of the good's UnitKind.
FLOUR_TO_BREAD_RATIO = 0.8

# Grams of bread one character eats per day. ~500g/day sits within the
# historical/modern real-world range for bread as a dietary staple.
BREAD_PER_CHARACTER_DAILY_CONSUMPTION = 500

# How many days' worth of flour demand a mill is allowed to buffer ahead of
# consumption (see advance_mill_economy_tick). Flour keeps, unlike bread
# (see BREAD_PER_CHARACTER_DAILY_CONSUMPTION's sibling cap in
# advance_bakery_economy_tick, which is fixed at one day), so this is safe
# to raise - a month's buffer trades more idle storage/labor for fewer
# milling ticks needed to keep bakeries fed.
FLOUR_BUFFER_DAYS = 30

# Hunger added for each day a character goes unfed.
HUNGER_PER_MISSED_MEAL = 10.0

# Hunger is clamped at this value - consequences of sustained high hunger
# are deliberately not modelled yet, this just stops the stat growing
# unbounded.
HUNGER_MAX = 100.0


def unit_suffix(good_type):
    """Display suffix ("kg"/"L") for a good's quantity, per GOOD_TYPE_UNIT."""
    unit = GOOD_TYPE_UNIT.get(good_type, UnitKind.WEIGHT)
    return "L" if unit == UnitKind.VOLUME else "kg"


# Bread naturally exists as discrete loaves, so it's displayed as a loaf
# count rather than a weight - 1 loaf = 1kg is an exact, not approximate,
# conversion for display purposes.
LOAF_WEIGHT_GRAMS = 1000

# Flour is displayed as the number of sacks required to store it (always
# rounded up - any remaining flour still needs another sack), rather than
# as a fractional weight. 20kg/sack is an assumed round figure, not a
# real-world reference value.
SACK_CAPACITY_GRAMS = 20_000


def _format_default(good_type, value, signed=False):
    """
    Format a quantity as a plain weight/volume figure. Weight-kind goods are
    stored in grams but displayed in kilograms for readability; volume-kind
    goods (litres) keep one decimal place, since fractional litres are
    meaningful.
    """
    unit = GOOD_TYPE_UNIT.get(good_type, UnitKind.WEIGHT)
    display_value = value if unit == UnitKind.VOLUME else value / 1000
    sign = "+" if signed else ""
    return f"{display_value:{sign},.1f}{unit_suffix(good_type)}"


def _format_bread(value):
    loaves = value / LOAF_WEIGHT_GRAMS
    suffix = "loaf" if loaves == 1 else "loaves"
    return f"{loaves:,.1f} {suffix}"


def _format_flour(value):
    sacks = math.ceil(value / SACK_CAPACITY_GRAMS)
    suffix = "sack" if sacks == 1 else "sacks"
    return f"{sacks:,} {suffix}"


# Per-good_type display strategy for absolute quantities, mirroring the
# GOOD_TYPE_UNIT/GOOD_TYPE_BULK_DENSITY/GOOD_TYPE_STORAGE_USAGE pattern
# above. Only used for signed=False - see format_quantity.
GOOD_TYPE_FORMATTER = {
    "bread": _format_bread,
    "flour": _format_flour,
}


def format_quantity(good_type, value, signed=False):
    """
    Format a quantity for display. Signed values (deltas) always show as a
    plain weight/volume figure, since "round up to a whole sack/loaf" has
    no sensible meaning for a change amount. Unsigned values use each
    good's own display strategy (see GOOD_TYPE_FORMATTER), falling back to
    the plain weight/volume figure for goods with no special strategy.
    """
    if signed:
        return _format_default(good_type, value, signed=True)

    formatter = GOOD_TYPE_FORMATTER.get(good_type)
    if formatter:
        return formatter(value)
    return _format_default(good_type, value)
