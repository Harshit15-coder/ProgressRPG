from django.contrib import admin

from .models import FieldCrop, GoodsConversionState, GoodsStock


@admin.register(FieldCrop)
class FieldCropAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "subzone",
        "shelter_building",
        "stage",
        "planted_at",
        "ready_yield",
        "harvested_amount",
        "last_processed_on",
    ]
    list_filter = ["stage"]
    readonly_fields = ["subzone", "shelter_building"]


@admin.register(GoodsStock)
class GoodsStockAdmin(admin.ModelAdmin):
    list_display = ["id", "building", "good_type", "quantity", "capacity"]
    list_filter = ["good_type"]
    readonly_fields = ["building", "good_type"]

    def capacity(self, obj):
        return obj.capacity


@admin.register(GoodsConversionState)
class GoodsConversionStateAdmin(admin.ModelAdmin):
    list_display = ["id", "building", "last_processed_on"]
    readonly_fields = ["building"]
