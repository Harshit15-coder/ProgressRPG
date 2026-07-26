from django.db import models
from django.utils import timezone

from .constants import (
    GOOD_TYPE_BULK_DENSITY,
    GOOD_TYPE_STORAGE_USAGE,
    GOOD_TYPE_UNIT,
    GROWTH_DURATION,
    STORAGE_CAPACITY_PER_AREA_VOLUME,
    STORAGE_CAPACITY_PER_AREA_WEIGHT,
    UnitKind,
)


class FieldCrop(models.Model):
    """
    Tracks a crop `Subzone`'s growth cycle. Area (for yield) lives on the
    `Subzone`; physical presence (for the labor cap) is checked against the
    associated `field_shelter` Building, since CharacterLocation/Movable
    can only target a Building, not a Subzone.
    """

    class Stage(models.TextChoices):
        FALLOW = "fallow", "Fallow"
        GROWING = "growing", "Growing"
        READY = "ready", "Ready"

    subzone = models.OneToOneField(
        "locations.Subzone", on_delete=models.CASCADE, related_name="field_crop"
    )
    shelter_building = models.ForeignKey(
        "locations.Building", on_delete=models.CASCADE, related_name="field_crops"
    )
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.FALLOW)
    planted_at = models.DateTimeField(null=True, blank=True)
    # Snapshotted once when the crop becomes ready, so a later footprint
    # change mid-cycle can't retroactively alter an in-progress harvest.
    ready_yield = models.FloatField(null=True, blank=True)
    harvested_amount = models.FloatField(default=0)
    # Idempotency guard - without it, running the daily task twice would
    # double the wheat deposited.
    last_processed_on = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"FieldCrop({self.subzone_id}, {self.stage})"

    @property
    def growth_progress(self):
        """
        Fraction of GROWTH_DURATION elapsed since planting, clamped to
        [0, 1] - purely a display derivation (e.g. field colour), not used
        by the stage-transition logic itself (see advance_field_growth_tick
        in tasks.py, which compares planted_at/GROWTH_DURATION directly).
        Only meaningful while GROWING; None otherwise since fallow fields
        haven't been planted and ready fields are already at their mature
        appearance.
        """
        if self.stage != self.Stage.GROWING or self.planted_at is None:
            return None
        elapsed = timezone.now() - self.planted_at
        return max(0.0, min(1.0, elapsed / GROWTH_DURATION))


class GoodsStock(models.Model):
    # A plain string namespace, not wired into the model field's `choices`
    # (see below) - that way adding a new good type never needs a
    # migration, since Django would otherwise emit a no-op AlterField for
    # every addition just to keep migration state in sync. GoodsStock is
    # server-written economy state, not user-facing input, so no real
    # validation is lost.
    class GoodType(models.TextChoices):
        WHEAT = "wheat", "Wheat"
        FLOUR = "flour", "Flour"
        BREAD = "bread", "Bread"

    building = models.ForeignKey(
        "locations.Building", on_delete=models.CASCADE, related_name="goods_stocks"
    )
    good_type = models.CharField(max_length=20)
    # In the good's base unit per GOOD_TYPE_UNIT - grams for weight-kind
    # goods, litres for volume-kind goods. Note a good's storage *capacity*
    # may still be volume-derived even when its quantity is mass-accounted
    # (see GOOD_TYPE_BULK_DENSITY on the `capacity` property below).
    quantity = models.FloatField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["building", "good_type"], name="uniq_goods_stock_per_building"
            ),
        ]

    def __str__(self):
        return f"{self.quantity:.1f} {self.good_type} @ {self.building_id}"

    @property
    def capacity(self):
        # Computed on read, not stored: populate_interiors deletes and
        # regenerates all InteriorSpace rows on every run, so a stored
        # capacity would go stale the next time interiors are reseeded.
        # Each good_type is capped by its own InteriorSpace usage (grain and
        # flour don't share one pool), falling back to the generic "storage"
        # usage for any good_type not in the mapping.
        usage = GOOD_TYPE_STORAGE_USAGE.get(self.good_type, "storage")
        storage_area = (
            self.building.interiorspaces.filter(usage=usage).aggregate(
                total=models.Sum("area")
            )["total"]
            or 0
        )

        # Goods stored as loose bulk material (e.g. wheat in a silo) are
        # limited by the room's *volume*, converted to a grams ceiling via
        # the good's real bulk density - even though the good is otherwise
        # mass-accounted. Everything else uses a direct per-area figure
        # matching its own unit kind (weight or, for a future liquid good,
        # volume). Weight-kind results are rounded to a whole number of
        # grams (no meaningful sub-gram precision); a direct-volume result
        # is left as a float, since fractional litres are meaningful.
        bulk_density = GOOD_TYPE_BULK_DENSITY.get(self.good_type)
        if bulk_density is not None:
            return round(storage_area * STORAGE_CAPACITY_PER_AREA_VOLUME * bulk_density)

        if GOOD_TYPE_UNIT.get(self.good_type, UnitKind.WEIGHT) == UnitKind.VOLUME:
            return storage_area * STORAGE_CAPACITY_PER_AREA_VOLUME

        return round(storage_area * STORAGE_CAPACITY_PER_AREA_WEIGHT)


class GoodsConversionState(models.Model):
    """
    Per-building idempotency guard for a daily goods-conversion task (e.g.
    milling). Deliberately thin - unlike FieldCrop, conversion has no growth
    stages, just a daily "did we already process this building today" check
    - kept generic so bakery can reuse it unmodified later.
    """

    building = models.OneToOneField(
        "locations.Building", on_delete=models.CASCADE, related_name="conversion_state"
    )
    last_processed_on = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"GoodsConversionState({self.building_id}, {self.last_processed_on})"
