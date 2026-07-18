from datetime import date, datetime, timedelta

from django.contrib.gis.geos import Point, Polygon
from django.test import TestCase
from django.utils import timezone

from character.models import Character
from economy.constants import GROWTH_DURATION, PER_WORKER_DAILY_CAPACITY, YIELD_PER_AREA
from economy.models import FieldCrop, GoodsStock
from economy.tasks import advance_field_economy_tick
from locations.models import (
    Building,
    InteriorSpace,
    LandArea,
    Node,
    PopulationCentre,
    Subzone,
)

# Fixed reference dates so tests don't depend on the real wall-clock date
# falling inside/outside the sowing window.
IN_WINDOW_DATE = date(2026, 3, 15)
IN_WINDOW_NOW = timezone.make_aware(datetime(2026, 3, 15, 12, 0, 0))
OUT_OF_WINDOW_DATE = date(2026, 8, 1)
OUT_OF_WINDOW_NOW = timezone.make_aware(datetime(2026, 8, 1, 12, 0, 0))


def _square(cx, cy, half_side):
    return Polygon(
        (
            (cx - half_side, cy - half_side),
            (cx - half_side, cy + half_side),
            (cx + half_side, cy + half_side),
            (cx + half_side, cy - half_side),
            (cx - half_side, cy - half_side),
        ),
        srid=3857,
    )


def _make_field_crop(
    centre_name="Cropville", half_side=10, stage=FieldCrop.Stage.FALLOW
):
    centre_point = Point(0, 0, srid=3857)
    centre = PopulationCentre.objects.create(
        name=centre_name, location=centre_point, boundary=_square(0, 0, 50)
    )
    land_area = LandArea.objects.create(
        name=f"{centre_name} Farmland",
        population_centre=centre,
        location=centre_point,
        boundary=_square(100, 0, half_side),
        size=1.0,
    )
    subzone = Subzone.objects.create(
        land_area=land_area,
        name=f"{centre_name} Farmland - Crops",
        usage="crops",
        boundary=_square(100, 0, half_side),
        location=Point(100, 0, srid=3857),
        size=1.0,
    )
    shelter = Building.objects.create(
        name=f"Field Shelter of ({centre_name})",
        building_type="field_shelter",
        location=Point(90, 0, srid=3857),
        footprint=_square(90, 0, 5),
        population_centre=centre,
    )
    shelter_node = Node.objects.create(
        name=f"Node for {shelter.name}",
        location=shelter.location,
        kind=Node.Kind.BUILDING,
        building=shelter,
    )
    crop = FieldCrop.objects.create(
        subzone=subzone, shelter_building=shelter, stage=stage
    )
    return centre, subzone, shelter, shelter_node, crop


def _make_granary(centre, storage_area=100.0):
    granary = Building.objects.create(
        name=f"Granary of ({centre.name})",
        building_type="granary",
        location=Point(-90, 0, srid=3857),
        footprint=_square(-90, 0, 5),
        population_centre=centre,
    )
    InteriorSpace.objects.create(
        building=granary, name="Storage", usage="storage", area=storage_area
    )
    return granary


class GenerateFieldsEconomyTickTests(TestCase):
    def test_fallow_crop_replants_inside_the_sowing_window(self):
        _, _, _, _, crop = _make_field_crop(stage=FieldCrop.Stage.FALLOW)

        advance_field_economy_tick(today=IN_WINDOW_DATE, now=IN_WINDOW_NOW)

        crop.refresh_from_db()
        self.assertEqual(crop.stage, FieldCrop.Stage.GROWING)
        self.assertEqual(crop.planted_at, IN_WINDOW_NOW)
        self.assertEqual(crop.last_processed_on, IN_WINDOW_DATE)

    def test_fallow_crop_stays_fallow_outside_the_sowing_window(self):
        _, _, _, _, crop = _make_field_crop(stage=FieldCrop.Stage.FALLOW)

        advance_field_economy_tick(today=OUT_OF_WINDOW_DATE, now=OUT_OF_WINDOW_NOW)

        crop.refresh_from_db()
        self.assertEqual(crop.stage, FieldCrop.Stage.FALLOW)
        self.assertIsNone(crop.planted_at)
        # The tick still counts as having processed this crop today, so a
        # second run the same day is still a no-op.
        self.assertEqual(crop.last_processed_on, OUT_OF_WINDOW_DATE)

    def test_growing_crop_becomes_ready_after_growth_duration(self):
        _, subzone, _, _, crop = _make_field_crop(stage=FieldCrop.Stage.GROWING)
        crop.planted_at = IN_WINDOW_NOW - GROWTH_DURATION - timedelta(hours=1)
        crop.save(update_fields=["planted_at"])

        advance_field_economy_tick(today=IN_WINDOW_DATE, now=IN_WINDOW_NOW)

        crop.refresh_from_db()
        self.assertEqual(crop.stage, FieldCrop.Stage.READY)
        self.assertAlmostEqual(crop.ready_yield, subzone.boundary.area * YIELD_PER_AREA)
        self.assertEqual(crop.harvested_amount, 0)

    def test_growing_crop_not_yet_ready_stays_growing(self):
        _, _, _, _, crop = _make_field_crop(stage=FieldCrop.Stage.GROWING)
        crop.planted_at = IN_WINDOW_NOW
        crop.save(update_fields=["planted_at"])

        advance_field_economy_tick(
            today=IN_WINDOW_DATE + timedelta(days=1),
            now=IN_WINDOW_NOW + timedelta(days=1),
        )

        crop.refresh_from_db()
        self.assertEqual(crop.stage, FieldCrop.Stage.GROWING)
        self.assertIsNone(crop.ready_yield)

    def test_harvest_capped_by_workers_present(self):
        centre, _, shelter, shelter_node, crop = _make_field_crop(
            stage=FieldCrop.Stage.READY
        )
        crop.ready_yield = 1000.0
        crop.harvested_amount = 0
        crop.save(update_fields=["ready_yield", "harvested_amount"])
        _make_granary(centre, storage_area=10000.0)

        Character.objects.create(
            first_name="Worker1",
            location=shelter.location,
            current_node=shelter_node,
            is_moving=False,
        )
        Character.objects.create(
            first_name="Worker2",
            location=shelter.location,
            current_node=shelter_node,
            is_moving=False,
        )

        advance_field_economy_tick()

        crop.refresh_from_db()
        self.assertEqual(crop.harvested_amount, 2 * PER_WORKER_DAILY_CAPACITY)
        self.assertEqual(crop.stage, FieldCrop.Stage.READY)

        stock = GoodsStock.objects.get(building__building_type="granary")
        self.assertEqual(stock.quantity, 2 * PER_WORKER_DAILY_CAPACITY)

    def test_harvest_capped_by_remaining_crop_and_transitions_to_fallow(self):
        centre, _, shelter, shelter_node, crop = _make_field_crop(
            stage=FieldCrop.Stage.READY
        )
        crop.ready_yield = 100.0
        crop.harvested_amount = 95.0
        crop.save(update_fields=["ready_yield", "harvested_amount"])
        _make_granary(centre, storage_area=10000.0)

        for i in range(5):
            Character.objects.create(
                first_name=f"Worker{i}",
                location=shelter.location,
                current_node=shelter_node,
                is_moving=False,
            )

        advance_field_economy_tick()

        crop.refresh_from_db()
        self.assertEqual(crop.harvested_amount, 100.0)
        self.assertEqual(crop.stage, FieldCrop.Stage.FALLOW)

        stock = GoodsStock.objects.get(building__building_type="granary")
        self.assertEqual(stock.quantity, 5.0)

    def test_deposit_capped_by_granary_capacity(self):
        centre, _, shelter, shelter_node, crop = _make_field_crop(
            stage=FieldCrop.Stage.READY
        )
        crop.ready_yield = 1000.0
        crop.harvested_amount = 0
        crop.save(update_fields=["ready_yield", "harvested_amount"])
        # Tiny storage area -> tiny capacity, much less than one worker's
        # daily capacity.
        granary = _make_granary(centre, storage_area=0.1)

        Character.objects.create(
            first_name="Worker1",
            location=shelter.location,
            current_node=shelter_node,
            is_moving=False,
        )

        advance_field_economy_tick()

        stock = GoodsStock.objects.get(building=granary)
        self.assertEqual(stock.quantity, stock.capacity)
        self.assertLess(stock.quantity, PER_WORKER_DAILY_CAPACITY)

    def test_no_granary_does_not_raise(self):
        centre, _, shelter, shelter_node, crop = _make_field_crop(
            stage=FieldCrop.Stage.READY
        )
        crop.ready_yield = 1000.0
        crop.harvested_amount = 0
        crop.save(update_fields=["ready_yield", "harvested_amount"])

        Character.objects.create(
            first_name="Worker1",
            location=shelter.location,
            current_node=shelter_node,
            is_moving=False,
        )

        advance_field_economy_tick()

        crop.refresh_from_db()
        self.assertEqual(crop.harvested_amount, PER_WORKER_DAILY_CAPACITY)
        self.assertFalse(GoodsStock.objects.exists())

    def test_running_twice_in_the_same_day_only_processes_once(self):
        centre, _, shelter, shelter_node, crop = _make_field_crop(
            stage=FieldCrop.Stage.READY
        )
        crop.ready_yield = 1000.0
        crop.harvested_amount = 0
        crop.save(update_fields=["ready_yield", "harvested_amount"])
        _make_granary(centre, storage_area=10000.0)

        Character.objects.create(
            first_name="Worker1",
            location=shelter.location,
            current_node=shelter_node,
            is_moving=False,
        )

        advance_field_economy_tick()
        advance_field_economy_tick()

        crop.refresh_from_db()
        self.assertEqual(crop.harvested_amount, PER_WORKER_DAILY_CAPACITY)

        stock = GoodsStock.objects.get(building__building_type="granary")
        self.assertEqual(stock.quantity, PER_WORKER_DAILY_CAPACITY)
