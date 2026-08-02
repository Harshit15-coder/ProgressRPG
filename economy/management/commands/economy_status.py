from django.core.management.base import BaseCommand

from economy.constants import format_quantity
from economy.models import GoodsStock
from locations.models import Building, PopulationCentre


class Command(BaseCommand):
    help = "Print a snapshot of current economy state: goods stocks and conversion status per building"

    def add_arguments(self, parser):
        parser.add_argument(
            "--centre",
            help="Only show this population centre (by name)",
        )

    def handle(self, *args, **options):
        centres = PopulationCentre.objects.all()
        if options["centre"]:
            centres = centres.filter(name=options["centre"])
            if not centres.exists():
                self.stdout.write(
                    self.style.WARNING(
                        f"No PopulationCentre named {options['centre']!r}"
                    )
                )
                return

        buildings = (
            Building.objects.filter(population_centre__in=centres)
            .select_related("population_centre", "conversion_state")
            .prefetch_related("goods_stocks")
            .order_by("population_centre__name", "building_type", "name")
        )

        if not buildings.exists():
            self.stdout.write("No buildings found.")
            return

        current_centre = None
        for building in buildings:
            if building.population_centre_id != (current_centre and current_centre.id):
                current_centre = building.population_centre
                # Guaranteed non-null: buildings are filtered to
                # population_centre__in=centres above.
                assert current_centre is not None
                self.stdout.write(
                    self.style.MIGRATE_HEADING(f"\n{current_centre.name}")
                )

            self.stdout.write(f"  {building.name} [{building.building_type}]")

            stocks = list(building.goods_stocks.all())
            if stocks:
                for stock in stocks:
                    quantity = format_quantity(stock.good_type, stock.quantity)
                    capacity = format_quantity(stock.good_type, stock.capacity)
                    self.stdout.write(f"    {stock.good_type}: {quantity} / {capacity}")
            else:
                self.stdout.write("    (no goods stored)")

            state = getattr(building, "conversion_state", None)
            if state is not None:
                self.stdout.write(f"    last processed: {state.last_processed_on}")
