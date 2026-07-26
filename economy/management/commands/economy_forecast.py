from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.dateparse import parse_date

from character.models import CharacterLocation, CharacterNeeds
from economy.constants import (
    BREAD_PER_CHARACTER_DAILY_CONSUMPTION,
    FLOUR_TO_BREAD_RATIO,
    GROWTH_DURATION,
    WHEAT_TO_FLOUR_RATIO,
    YIELD_PER_AREA,
    format_quantity,
)
from economy.models import FieldCrop, GoodsStock
from economy.tasks import (
    advance_bakery_economy_tick,
    advance_bread_consumption_tick,
    advance_field_economy_tick,
    advance_mill_economy_tick,
)
from locations.models import Building, Node

# Overall wheat-to-bread yield of the full conversion chain, used for the
# quick analytic estimate printed before the simulation.
WHEAT_TO_BREAD_RATIO = WHEAT_TO_FLOUR_RATIO * FLOUR_TO_BREAD_RATIO

# Which good_type each working building type holds a GoodsStock for, per the
# conversion chain in economy/tasks.py (granary holds wheat, mill holds the
# flour it produces, bakery holds the bread it produces) - used to print
# storage capacity/fill for every working building, not just mills.
BUILDING_STORAGE_GOODS = {
    "granary": [GoodsStock.GoodType.WHEAT],
    "mill": [GoodsStock.GoodType.FLOUR],
    "bakery": [GoodsStock.GoodType.BREAD],
}


class Command(BaseCommand):
    help = (
        "Simulate the daily economy ticks forward N days (in a rolled-back "
        "transaction, unless --commit) and report wheat/flour/bread stock "
        "and character hunger trends over time - for tuning starting stock "
        "and economy constants by observation rather than guesswork."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=30,
            help="Number of days to simulate (default 365)",
        )
        parser.add_argument(
            "--start-date",
            help="Simulate starting from this date (YYYY-MM-DD), default today",
        )
        parser.add_argument(
            "--interval",
            type=int,
            default=30,
            help="Print a snapshot every N simulated days (default 30)",
        )
        parser.add_argument(
            "--seed-wheat",
            type=int,
            default=5000000,
            help="Add this much wheat (whole grams) to every granary before "
            "simulating, to test whether a given starting stock survives "
            "the ramp-up",
        )
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Persist the simulated changes instead of rolling them back",
        )

    def handle(self, *args, **options):
        start = (
            parse_date(options["start_date"])
            if options["start_date"]
            else timezone.localdate()
        )
        days = options["days"]
        interval = options["interval"]
        seed_wheat = options["seed_wheat"]

        self._print_analytic_estimate()

        with transaction.atomic():
            if seed_wheat:
                self._seed_wheat(seed_wheat)

            self._place_assigned_workers()
            self._print_storage_capacities()

            self.stdout.write(
                self.style.MIGRATE_HEADING(
                    f"\nSimulating {days} days from {start} "
                    f"(interval={interval}, "
                    f"seed_wheat={format_quantity('wheat', seed_wheat)})"
                )
            )
            self.stdout.write(
                f"{'day':>5} {'date':>10} {'wheat(kg)':>10} {'flour(kg)':>10} "
                f"{'bread(kg)':>10} {'avg hunger':>10} {'max hunger':>10} "
                f"{'unfed today':>11}"
            )

            first_bread_day = None
            min_bread = None
            worst_hunger = 0.0

            for day_offset in range(days):
                today = start + timedelta(days=day_offset)
                now = timezone.make_aware(datetime.combine(today, time(hour=18)))

                advance_field_economy_tick(today=today, now=now)
                advance_mill_economy_tick(today=today)
                advance_bakery_economy_tick(today=today)
                hunger_before = dict(CharacterNeeds.objects.values_list("id", "hunger"))
                advance_bread_consumption_tick(today=today)
                unfed_today = sum(
                    1
                    for needs_id, hunger_after in CharacterNeeds.objects.values_list(
                        "id", "hunger"
                    )
                    if hunger_after > hunger_before.get(needs_id, 0.0)
                )

                totals = self._stock_totals()
                if totals["bread"] > 0 and first_bread_day is None:
                    first_bread_day = day_offset
                if min_bread is None or totals["bread"] < min_bread:
                    min_bread = totals["bread"]

                hunger_values = list(
                    CharacterNeeds.objects.values_list("hunger", flat=True)
                )
                avg_hunger = (
                    sum(hunger_values) / len(hunger_values) if hunger_values else 0.0
                )
                max_hunger = max(hunger_values) if hunger_values else 0.0
                worst_hunger = max(worst_hunger, max_hunger)

                if day_offset % interval == 0 or day_offset == days - 1:
                    self.stdout.write(
                        f"{day_offset:>5} {today.isoformat():>10} "
                        f"{totals['wheat'] / 1000:>10,.1f} {totals['flour'] / 1000:>10,.1f} "
                        f"{totals['bread'] / 1000:>10,.1f} {avg_hunger:>10.1f} "
                        f"{max_hunger:>10.1f} {unfed_today:>11}"
                    )

            self._print_verdict(first_bread_day, min_bread, worst_hunger)

            if not options["commit"]:
                transaction.set_rollback(True)
                self.stdout.write(
                    self.style.WARNING("\nRolled back - nothing persisted.")
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS("\nCommitted - simulated state persisted.")
                )

    def _seed_wheat(self, amount):
        granaries = Building.objects.filter(building_type="granary")
        for granary in granaries:
            stock, _ = GoodsStock.objects.get_or_create(
                building=granary, good_type=GoodsStock.GoodType.WHEAT
            )
            stock.quantity = min(stock.capacity, stock.quantity + amount)
            stock.save(update_fields=["quantity"])
        self.stdout.write(
            f"Seeded {format_quantity('wheat', amount)} wheat into "
            f"{granaries.count()} granary(ies)"
        )

    def _place_assigned_workers(self):
        """
        Teleport every character with a primary WORK CharacterLocation to that
        building's entrance node. The real game gets characters to work via
        the commute_tick/move_characters_tick pipeline (real-time, step-by-step
        walking), which this day-granularity forecast doesn't run - without
        this, `assign_workers` alone leaves everyone at home and labor-gated
        ticks (harvest/mill/bakery) always see zero workers present. Always
        applied, since a forecast that can never show working ticks isn't
        useful - it assumes commuting always succeeds.
        """
        work_locations = CharacterLocation.objects.filter(
            role=CharacterLocation.Role.WORK, is_primary=True
        ).select_related("character", "location")

        placed = 0
        skipped = 0
        for work in work_locations:
            entrance_node = Node.objects.filter(
                building=work.location, kind=Node.Kind.BUILDING_ENTRANCE
            ).first()
            if entrance_node is None:
                skipped += 1
                continue

            character = work.character
            character.current_node = entrance_node
            character.target_node = None
            character.is_moving = False
            character.save(update_fields=["current_node", "target_node", "is_moving"])
            placed += 1

        self.stdout.write(
            f"Placed {placed} worker(s) at their assigned building"
            + (f", skipped {skipped} (no entrance node)" if skipped else "")
        )

    def _print_storage_capacities(self):
        """
        Storage capacity is derived per-building from its InteriorSpace area
        (see GoodsStock.capacity), not a flat constant - random building
        footprints mean it varies building to building, so it's worth
        surfacing here rather than only discoverable via the shell.
        """
        buildings = Building.objects.filter(
            building_type__in=BUILDING_STORAGE_GOODS
        ).select_related("population_centre")
        if not buildings:
            return

        self.stdout.write(self.style.MIGRATE_HEADING("\nWorking building storage"))
        for building in buildings:
            centre_name = (
                building.population_centre.name
                if building.population_centre
                else "(no centre)"
            )
            for good_type in BUILDING_STORAGE_GOODS[building.building_type]:
                stock, _ = GoodsStock.objects.get_or_create(
                    building=building, good_type=good_type
                )
                fill_percent = (
                    (stock.quantity / stock.capacity * 100) if stock.capacity else 0.0
                )
                self.stdout.write(
                    f"  {building.building_type.title()} {building.id} "
                    f"({centre_name}) {good_type}: "
                    f"{format_quantity(good_type, stock.quantity)} / "
                    f"{format_quantity(good_type, stock.capacity)} "
                    f"({fill_percent:.0f}%)"
                )

    def _stock_totals(self):
        totals = {"wheat": 0.0, "flour": 0.0, "bread": 0.0}
        for row in GoodsStock.objects.values("good_type").annotate(
            total=Sum("quantity")
        ):
            if row["good_type"] in totals:
                totals[row["good_type"]] = row["total"] or 0.0
        return totals

    def _print_verdict(self, first_bread_day, min_bread, worst_hunger):
        self.stdout.write(self.style.MIGRATE_HEADING("\nVerdict"))
        if first_bread_day is None:
            self.stdout.write("  Bread never became available in this window.")
        else:
            self.stdout.write(
                f"  First bread produced on simulated day {first_bread_day}."
            )
        self.stdout.write(
            f"  Minimum total bread stock reached: {format_quantity('bread', min_bread)}"
        )
        self.stdout.write(
            f"  Worst hunger value reached by any character: {worst_hunger:.1f}"
        )
        if worst_hunger > 0:
            self.stdout.write(
                self.style.WARNING(
                    "  Some characters went unfed at least once - consider a larger "
                    "seed stock or more workers at granary/mill/bakery."
                )
            )

    def _print_analytic_estimate(self):
        # `boundary.area` is a GEOS geometry property computed in Python, not
        # a DB column, so it can't be summed in the ORM - same reason
        # `_maybe_ripen` reads it off the fetched subzone rather than
        # querying for it.
        total_field_area = sum(
            crop.subzone.boundary.area
            for crop in FieldCrop.objects.select_related("subzone")
        )
        population = CharacterLocation.objects.filter(
            role=CharacterLocation.Role.HOME, is_primary=True
        ).count()

        annual_bread_potential = (
            total_field_area * YIELD_PER_AREA * WHEAT_TO_BREAD_RATIO
        )
        annual_demand = population * BREAD_PER_CHARACTER_DAILY_CONSUMPTION * 365
        ramp_days = GROWTH_DURATION.days
        # Wheat-equivalent buffer to bridge from world-start to first harvest,
        # assuming best-case (uncapped) milling/baking throughput - a lower
        # bound, not a guarantee; the simulation below tests the real number.
        bridge_wheat = (
            (population * BREAD_PER_CHARACTER_DAILY_CONSUMPTION * ramp_days)
            / WHEAT_TO_BREAD_RATIO
            if WHEAT_TO_BREAD_RATIO
            else 0.0
        )

        self.stdout.write(self.style.MIGRATE_HEADING("Quick analytic estimate"))
        self.stdout.write(f"  Total registered field area: {total_field_area:.1f} m^2")
        self.stdout.write(f"  Population (characters with a home): {population}")
        self.stdout.write(
            f"  Theoretical annual bread yield (full chain, no labor cap): "
            f"{format_quantity('bread', annual_bread_potential)}"
        )
        self.stdout.write(
            f"  Annual bread demand: {format_quantity('bread', annual_demand)}"
        )
        verdict = "surplus" if annual_bread_potential >= annual_demand else "DEFICIT"
        self.stdout.write(f"  -> {verdict}")
        self.stdout.write(
            f"  Suggested starting wheat seed to bridge the {ramp_days}-day growth "
            f"window (best case, ignores labor caps): "
            f"{format_quantity('wheat', bridge_wheat)}"
        )
        self.stdout.write(
            "  This is a lower bound - real throughput is capped by workers present "
            "at the mill/bakery. Use --seed-wheat with the simulation below to check "
            "whether a given amount actually survives the ramp-up.\n"
        )
