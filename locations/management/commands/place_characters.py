from django.core.management.base import BaseCommand
from django.contrib.gis.geos import Point
import random

from character.models import Character
from locations.models import Building, Node

DEFAULT_MAX_PER_BUILDING = 5


class Command(BaseCommand):
    help = (
        "Assign existing characters to residential buildings and move them "
        "there, up to a per-building cap. Characters beyond the buildings' "
        "combined capacity are left unplaced - this fills the village to a "
        "believable density, not every character."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--max-per-building",
            type=int,
            default=DEFAULT_MAX_PER_BUILDING,
            help=f"Cap on characters per residential building (default {DEFAULT_MAX_PER_BUILDING}).",
        )
        parser.add_argument(
            "--enforce-cap",
            action="store_true",
            help=(
                "Evict residents above --max-per-building from already-overcrowded "
                "buildings (e.g. left over from a run with a different cap) before "
                "placing anyone. Evicted characters are left unhoused, not moved "
                "straight to another building."
            ),
        )

    def handle(self, *args, **options):
        buildings = list(Building.objects.filter(building_type="residential"))
        if not buildings:
            self.stdout.write(self.style.WARNING("No buildings found"))
            return

        max_per_building = options["max_per_building"]

        if options["enforce_cap"]:
            self._evict_excess_residents(buildings, max_per_building)

        characters = list(Character.objects.all())
        if not characters:
            self.stdout.write(self.style.WARNING("No characters found"))
            return

        # Count existing residents so re-running this command tops up housing
        # rather than stacking new residents on top of a prior run's.
        occupancy = {building.id: building.residents.count() for building in buildings}
        already_housed_ids = {
            char.id for char in characters if char.building_id in occupancy
        }
        characters = [char for char in characters if char.id not in already_housed_ids]
        random.shuffle(characters)

        for char in characters:
            available = [b for b in buildings if occupancy[b.id] < max_per_building]
            if not available:
                self.stdout.write(
                    self.style.WARNING(
                        f"All residential buildings are at capacity ({max_per_building} "
                        "each) – skipping remaining characters"
                    )
                )
                break

            building = random.choice(available)
            if not building.nodes.exists():
                self.stdout.write(
                    self.style.WARNING(
                        f"Building {building.id} has no nodes – skipping character placement"
                    )
                )
                continue

            if char.is_moving:
                char.journeys.filter(status="active").update(status="cancelled")

            char.assign_home(building)
            occupancy[building.id] += 1

            node = None
            rooms = list(building.interiorspaces.all())

            if rooms:
                room = random.choice(rooms)
                node = room.nodes.first()
            if not node:
                node = building.nodes.filter(kind=Node.Kind.BUILDING).first()

            if not node:
                self.stdout.write(
                    self.style.WARNING(
                        f"Building {building.id} has no usable node – skipping character placement"
                    )
                )
                continue

            char.move_to(node)

            self.stdout.write(
                f"{char.full_name} moved to building {building.name} (ID {building.id})"
            )

        self.stdout.write(self.style.SUCCESS("Characters have been placed"))

    def _evict_excess_residents(self, buildings, max_per_building):
        from character.models import CharacterLocation

        for building in buildings:
            residents = list(building.residents.all())
            excess = len(residents) - max_per_building
            if excess <= 0:
                continue

            for char in random.sample(residents, excess):
                char.building = None
                char.population_centre = None
                char.save(update_fields=["building", "population_centre"])
                CharacterLocation.objects.filter(
                    character=char,
                    role=CharacterLocation.Role.HOME,
                    is_primary=True,
                ).delete()
                self.stdout.write(
                    f"Evicted {char.full_name} from overcrowded building "
                    f"{building.name} (ID {building.id})"
                )
