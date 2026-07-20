from datetime import timedelta

# Spring wheat: sown Feb-Apr, ready roughly 5 months later (Jul-Sep) - a
# real calendar-driven sowing window rather than year-round planting.
SOWING_WINDOW_MONTHS = frozenset({2, 3, 4})
GROWTH_DURATION = timedelta(days=150)

# Remaining values are placeholder starting figures - tuned by feel once
# visible in the browser, not derived from any real-world reference.

# Wheat units per crop-Subzone area unit (m^2) at full maturity.
YIELD_PER_AREA = 0.5

# Wheat units one physically-present worker can harvest per day.
PER_WORKER_DAILY_CAPACITY = 20.0

# Goods units of storage capacity per unit of storage-usage InteriorSpace
# area.
STORAGE_CAPACITY_PER_AREA = 5.0

# Which InteriorSpace usage stores a given good - grain and flour are kept
# separate (different spoilage/pest risk, historically different rooms),
# rather than sharing one generic "storage" bucket. Falls back to the
# generic "storage" usage for any good_type not listed here.
GOOD_TYPE_STORAGE_USAGE = {
    "wheat": "grain_storage",
    "flour": "flour_storage",
}

# Grain units one physically-present worker can mill per day.
PER_WORKER_DAILY_MILLING_CAPACITY = 20.0

# Flour units produced per grain unit milled.
WHEAT_TO_FLOUR_RATIO = 0.75

# Flour units one physically-present worker can bake per day.
PER_WORKER_DAILY_BAKING_CAPACITY = 20.0

# Bread units produced per flour unit baked.
FLOUR_TO_BREAD_RATIO = 0.8

# Bread units one character eats per day.
BREAD_PER_CHARACTER_DAILY_CONSUMPTION = 1.0

# Hunger added for each day a character goes unfed.
HUNGER_PER_MISSED_MEAL = 10.0

# Hunger is clamped at this value - consequences of sustained high hunger
# are deliberately not modelled yet, this just stops the stat growing
# unbounded.
HUNGER_MAX = 100.0
