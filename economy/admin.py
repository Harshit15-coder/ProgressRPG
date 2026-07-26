from django.contrib import admin

from .constants import format_quantity
from .models import FieldCrop, GoodsConversionState, GoodsStock


@admin.register(FieldCrop)
class FieldCropAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "subzone",
        "shelter_building",
        "stage",
        "planted_at",
        "ready_yield_display",
        "harvested_amount_display",
        "last_processed_on",
    ]
    list_filter = ["stage"]
    readonly_fields = ["subzone", "shelter_building"]

    def ready_yield_display(self, obj):
        # Wheat, a weight-kind good - whole grams.
        return (
            None
            if obj.ready_yield is None
            else format_quantity("wheat", obj.ready_yield)
        )

    def harvested_amount_display(self, obj):
        return format_quantity("wheat", obj.harvested_amount)


@admin.register(GoodsStock)
class GoodsStockAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "building",
        "good_type",
        "quantity_display",
        "capacity_display",
    ]
    list_filter = ["good_type"]
    readonly_fields = ["building", "good_type"]

    def quantity_display(self, obj):
        return format_quantity(obj.good_type, obj.quantity)

    def capacity_display(self, obj):
        return format_quantity(obj.good_type, obj.capacity)


@admin.register(GoodsConversionState)
class GoodsConversionStateAdmin(admin.ModelAdmin):
    list_display = ["id", "building", "last_processed_on"]
    readonly_fields = ["building"]
