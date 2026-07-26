from django.test import SimpleTestCase

from economy.constants import format_quantity


class FormatQuantityTest(SimpleTestCase):
    def test_bread_displays_as_loaves(self):
        self.assertEqual(format_quantity("bread", 12000), "12.0 loaves")
        self.assertEqual(format_quantity("bread", 1000), "1.0 loaf")
        self.assertEqual(format_quantity("bread", 500), "0.5 loaves")

    def test_flour_displays_as_whole_sacks_rounded_up(self):
        self.assertEqual(format_quantity("flour", 1000), "1 sack")
        self.assertEqual(format_quantity("flour", 20000), "1 sack")
        self.assertEqual(format_quantity("flour", 21000), "2 sacks")
        self.assertEqual(format_quantity("flour", 38000), "2 sacks")
        self.assertEqual(format_quantity("flour", 41000), "3 sacks")
        self.assertEqual(format_quantity("flour", 0), "0 sacks")

    def test_wheat_and_unlisted_goods_use_plain_kg(self):
        self.assertEqual(format_quantity("wheat", 5000), "5.0kg")
        self.assertEqual(format_quantity("some_future_good", 2500), "2.5kg")

    def test_signed_deltas_always_use_plain_weight_regardless_of_good_type(self):
        self.assertEqual(format_quantity("flour", -500, signed=True), "-0.5kg")
        self.assertEqual(format_quantity("bread", 2000, signed=True), "+2.0kg")
