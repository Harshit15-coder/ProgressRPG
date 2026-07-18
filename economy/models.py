from django.db import models

from .constants import GOOD_TYPE_STORAGE_USAGE, STORAGE_CAPACITY_PER_AREA


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


class GoodsStock(models.Model):
    class GoodType(models.TextChoices):
        WHEAT = "wheat", "Wheat"
        FLOUR = "flour", "Flour"

    building = models.ForeignKey(
        "locations.Building", on_delete=models.CASCADE, related_name="goods_stocks"
    )
    good_type = models.CharField(max_length=20, choices=GoodType.choices)
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
        return storage_area * STORAGE_CAPACITY_PER_AREA


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
