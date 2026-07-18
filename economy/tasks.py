import logging

from celery import shared_task
from django.utils import timezone

from .constants import (
    GROWTH_DURATION,
    PER_WORKER_DAILY_CAPACITY,
    SOWING_WINDOW_MONTHS,
    YIELD_PER_AREA,
)
from .models import FieldCrop, GoodsStock

logger = logging.getLogger("general")


@shared_task
def advance_field_economy_tick(today=None, now=None):
    """
    Daily economy step, run once shortly after the work shift ends: advance
    each FieldCrop's growth cycle one stage, and if ready, harvest capped by
    how many workers are physically present at its field_shelter.
    """
    today = today or timezone.localdate()
    now = now or timezone.now()

    for crop in FieldCrop.objects.select_related(
        "subzone", "shelter_building", "shelter_building__population_centre"
    ):
        if crop.last_processed_on == today:
            continue

        if crop.stage == FieldCrop.Stage.FALLOW:
            _replant(crop, today, now)
        elif crop.stage == FieldCrop.Stage.GROWING:
            _maybe_ripen(crop, now)
        elif crop.stage == FieldCrop.Stage.READY:
            _harvest(crop)

        crop.last_processed_on = today
        crop.save(
            update_fields=[
                "stage",
                "planted_at",
                "ready_yield",
                "harvested_amount",
                "last_processed_on",
            ]
        )


def _replant(crop, today, now):
    # Spring wheat has a real sowing window - a field harvested in August
    # can't be replanted again until next spring, so it just stays fallow
    # until the window comes back around.
    if today.month not in SOWING_WINDOW_MONTHS:
        return

    crop.planted_at = now
    crop.stage = FieldCrop.Stage.GROWING


def _maybe_ripen(crop, now):
    if crop.planted_at is None:
        crop.planted_at = now
        return

    if now - crop.planted_at < GROWTH_DURATION:
        return

    crop.ready_yield = crop.subzone.boundary.area * YIELD_PER_AREA
    crop.harvested_amount = 0
    crop.stage = FieldCrop.Stage.READY


def _harvest(crop):
    remaining = crop.ready_yield - crop.harvested_amount
    if remaining <= 0:
        crop.stage = FieldCrop.Stage.FALLOW
        return

    workers_present = _workers_present(crop.shelter_building)
    today_yield = min(remaining, workers_present * PER_WORKER_DAILY_CAPACITY)
    if today_yield <= 0:
        return

    _deposit_into_granary(crop.shelter_building, today_yield)

    crop.harvested_amount += today_yield
    if crop.harvested_amount >= crop.ready_yield:
        crop.stage = FieldCrop.Stage.FALLOW


def _workers_present(shelter_building):
    from character.models import Character

    return Character.objects.filter(
        current_node__building=shelter_building, is_moving=False
    ).count()


def _find_granary(population_centre):
    if population_centre is None:
        return None
    return (
        population_centre.buildings.filter(building_type="granary")
        .order_by("id")
        .first()
    )


def _deposit_into_granary(shelter_building, amount):
    population_centre = shelter_building.population_centre
    if population_centre is None:
        logger.warning(
            "FieldCrop harvest for shelter %s has no population centre - " "wheat lost",
            shelter_building.id,
        )
        return

    granary = _find_granary(population_centre)
    if granary is None:
        logger.warning(
            "No granary in %s - harvested wheat lost", population_centre.name
        )
        return

    stock, _ = GoodsStock.objects.get_or_create(
        building=granary, good_type=GoodsStock.GoodType.WHEAT
    )
    deposit = min(amount, max(0.0, stock.capacity - stock.quantity))
    if deposit <= 0:
        return

    stock.quantity += deposit
    stock.save(update_fields=["quantity"])
