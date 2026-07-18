from django.contrib.gis.geos import Point, Polygon
from django.test import TestCase

from economy.conversion import convert_goods
from economy.models import GoodsStock
from locations.models import Building, InteriorSpace, PopulationCentre


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


def _make_building(name, building_type, storage_usage, storage_area, centre):
    building = Building.objects.create(
        name=name,
        building_type=building_type,
        location=Point(0, 0, srid=3857),
        footprint=_square(0, 0, 5),
        population_centre=centre,
    )
    if storage_area:
        InteriorSpace.objects.create(
            building=building, name="Storage", usage=storage_usage, area=storage_area
        )
    return building


class ConvertGoodsTests(TestCase):
    def setUp(self):
        self.centre = PopulationCentre.objects.create(
            name="Millville",
            location=Point(0, 0, srid=3857),
            boundary=_square(0, 0, 50),
        )
        self.granary = _make_building(
            "Granary", "granary", "grain_storage", 1000.0, self.centre
        )
        self.mill = _make_building("Mill", "mill", "flour_storage", 1000.0, self.centre)
        GoodsStock.objects.create(
            building=self.granary, good_type=GoodsStock.GoodType.WHEAT, quantity=500.0
        )

    def test_converts_full_labor_capped_amount_when_unconstrained(self):
        converted = convert_goods(
            self.granary,
            self.mill,
            input_good=GoodsStock.GoodType.WHEAT,
            output_good=GoodsStock.GoodType.FLOUR,
            workers_present=2,
            per_worker_capacity=20.0,
            conversion_ratio=0.75,
        )

        self.assertEqual(converted, 40.0)
        wheat = GoodsStock.objects.get(building=self.granary, good_type="wheat")
        flour = GoodsStock.objects.get(building=self.mill, good_type="flour")
        self.assertEqual(wheat.quantity, 460.0)
        self.assertEqual(flour.quantity, 30.0)

    def test_capped_by_available_input_stock(self):
        wheat = GoodsStock.objects.get(building=self.granary, good_type="wheat")
        wheat.quantity = 5.0
        wheat.save(update_fields=["quantity"])

        converted = convert_goods(
            self.granary,
            self.mill,
            input_good=GoodsStock.GoodType.WHEAT,
            output_good=GoodsStock.GoodType.FLOUR,
            workers_present=10,
            per_worker_capacity=20.0,
            conversion_ratio=0.75,
        )

        self.assertEqual(converted, 5.0)
        wheat.refresh_from_db()
        self.assertEqual(wheat.quantity, 0.0)

    def test_throttles_input_when_output_storage_would_overflow_instead_of_wasting(
        self,
    ):
        # Tiny flour storage: room for far less flour than 40 units of wheat
        # would produce at a 0.75 ratio.
        flour_space = InteriorSpace.objects.get(
            building=self.mill, usage="flour_storage"
        )
        flour_space.area = 1.0  # capacity = 1.0 * STORAGE_CAPACITY_PER_AREA (5.0) = 5.0
        flour_space.save(update_fields=["area"])

        converted = convert_goods(
            self.granary,
            self.mill,
            input_good=GoodsStock.GoodType.WHEAT,
            output_good=GoodsStock.GoodType.FLOUR,
            workers_present=2,
            per_worker_capacity=20.0,
            conversion_ratio=0.75,
        )

        # 5.0 units of flour headroom / 0.75 ratio = 6.666... units of wheat,
        # not the full labor-capped 40 - and none of the wheat is wasted,
        # it's simply left in the granary.
        self.assertAlmostEqual(converted, 5.0 / 0.75)
        wheat = GoodsStock.objects.get(building=self.granary, good_type="wheat")
        flour = GoodsStock.objects.get(building=self.mill, good_type="flour")
        self.assertAlmostEqual(wheat.quantity, 500.0 - (5.0 / 0.75))
        self.assertEqual(flour.quantity, 5.0)

    def test_no_input_stock_converts_nothing(self):
        GoodsStock.objects.filter(building=self.granary, good_type="wheat").delete()

        converted = convert_goods(
            self.granary,
            self.mill,
            input_good=GoodsStock.GoodType.WHEAT,
            output_good=GoodsStock.GoodType.FLOUR,
            workers_present=5,
            per_worker_capacity=20.0,
            conversion_ratio=0.75,
        )

        self.assertEqual(converted, 0)
        flour = GoodsStock.objects.filter(building=self.mill, good_type="flour").first()
        self.assertTrue(flour is None or flour.quantity == 0)

    def test_capacity_is_per_good_type_not_shared(self):
        # The mill has a flour_storage interior but no grain_storage one -
        # its wheat capacity should read 0, independent of its flour
        # capacity, since the two usages are tracked separately.
        wheat_stock, _ = GoodsStock.objects.get_or_create(
            building=self.mill, good_type=GoodsStock.GoodType.WHEAT
        )
        flour_stock, _ = GoodsStock.objects.get_or_create(
            building=self.mill, good_type=GoodsStock.GoodType.FLOUR
        )
        self.assertEqual(wheat_stock.capacity, 0)
        self.assertGreater(flour_stock.capacity, 0)
