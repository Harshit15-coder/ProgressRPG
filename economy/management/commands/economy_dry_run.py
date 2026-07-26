from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from character.models import CharacterNeeds
from economy.constants import format_quantity
from economy.models import FieldCrop, GoodsConversionState, GoodsStock
from economy.tasks import (
    advance_bakery_economy_tick,
    advance_bread_consumption_tick,
    advance_field_economy_tick,
    advance_mill_economy_tick,
)
from locations.models import Building


class Command(BaseCommand):
    help = (
        "Dry-run the daily economy ticks (field harvest, milling, baking, "
        "bread consumption) and print what would change, without persisting "
        "anything - runs the real tick tasks inside a transaction that's "
        "rolled back at the end."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            help="Simulate as if this date (YYYY-MM-DD) were today (default: today)",
        )

    def handle(self, *args, **options):
        today = parse_date(options["date"]) if options["date"] else timezone.localdate()
        self.stdout.write(f"Dry-running economy ticks for {today}\n")

        already_processed = list(
            GoodsConversionState.objects.filter(last_processed_on=today).select_related(
                "building"
            )
        )
        if already_processed:
            self.stdout.write(
                self.style.WARNING(
                    "Already marked processed for this date (will no-op): "
                    + ", ".join(s.building.name for s in already_processed)
                )
            )

        stock_before = self._snapshot_stocks()
        crop_before = self._snapshot_crops()
        hunger_before = self._snapshot_hunger()

        with transaction.atomic():
            advance_field_economy_tick(today=today)
            advance_mill_economy_tick(today=today)
            advance_bakery_economy_tick(today=today)
            advance_bread_consumption_tick(today=today)

            stock_after = self._snapshot_stocks()
            crop_after = self._snapshot_crops()
            hunger_after = self._snapshot_hunger()

            transaction.set_rollback(True)

        self._print_stock_diff(stock_before, stock_after)
        self._print_crop_diff(crop_before, crop_after)
        self._print_hunger_diff(hunger_before, hunger_after)

    def _snapshot_stocks(self):
        return {
            (s.building_id, s.good_type): s.quantity for s in GoodsStock.objects.all()
        }

    def _snapshot_crops(self):
        return {c.id: (c.stage, c.harvested_amount) for c in FieldCrop.objects.all()}

    def _snapshot_hunger(self):
        return {n.character_id: n.hunger for n in CharacterNeeds.objects.all()}

    def _print_stock_diff(self, before, after):
        self.stdout.write(self.style.MIGRATE_HEADING("\nGoods stock changes"))
        changed = False
        for building_id, good_type in sorted(set(before) | set(after)):
            old = before.get((building_id, good_type), 0.0)
            new = after.get((building_id, good_type), 0.0)
            if old != new:
                changed = True
                building = Building.objects.get(id=building_id)
                delta = format_quantity(good_type, new - old, signed=True)
                self.stdout.write(
                    f"  {building.name} [{good_type}]: "
                    f"{format_quantity(good_type, old)} -> "
                    f"{format_quantity(good_type, new)} ({delta})"
                )
        if not changed:
            self.stdout.write("  (no changes)")

    def _print_crop_diff(self, before, after):
        self.stdout.write(self.style.MIGRATE_HEADING("\nField crop changes"))
        changed = False
        for crop_id, (new_stage, new_harvested) in after.items():
            old_stage, old_harvested = before.get(crop_id, (None, None))
            if (old_stage, old_harvested) == (new_stage, new_harvested):
                continue
            changed = True
            crop = FieldCrop.objects.get(id=crop_id)
            # harvested_amount is wheat, a weight-kind good - whole grams.
            old_display = (
                "None" if old_harvested is None else f"{round(old_harvested)}g"
            )
            new_display = (
                "None" if new_harvested is None else f"{round(new_harvested)}g"
            )
            self.stdout.write(
                f"  {crop} stage: {old_stage} -> {new_stage}, "
                f"harvested: {old_display} -> {new_display}"
            )
        if not changed:
            self.stdout.write("  (no changes)")

    def _print_hunger_diff(self, before, after):
        self.stdout.write(self.style.MIGRATE_HEADING("\nCharacter hunger changes"))
        changed = False
        for character_id, new_hunger in after.items():
            old_hunger = before.get(character_id, 0.0)
            if old_hunger == new_hunger:
                continue
            changed = True
            self.stdout.write(
                f"  character {character_id}: {old_hunger:.1f} -> {new_hunger:.1f} "
                f"({new_hunger - old_hunger:+.1f})"
            )
        if not changed:
            self.stdout.write("  (no changes)")
