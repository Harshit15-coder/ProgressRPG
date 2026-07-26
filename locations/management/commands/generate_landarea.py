import math
import random

from django.contrib.gis.geos import Point, Polygon
from django.core.management.base import BaseCommand
from django.db import transaction
from locations.models import Building, LandArea, Subzone, PopulationCentre

PLACEMENT_ATTEMPTS = 100
LANDAREA_BUFFER = 5
MIN_MARGIN_BEYOND_BOUNDARY = 10
MAX_MARGIN_BEYOND_BOUNDARY = 40


class Command(BaseCommand):
    help = "Generate LandAreas and Subzones for each village based on population."

    def add_arguments(self, parser):
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Delete all existing LandAreas/Subzones before generation.",
        )

    # -----------------------------
    # Helpers
    # -----------------------------
    def estimate_required_land(self, residents: int) -> float:
        """
        Estimate required land in hectares for a village population.
        0.1 ha per resident + 20% buffer.
        """
        base = residents * 0.1
        return base * 1.2

    def assign_landarea_geometry(self, landarea: LandArea, other_boundaries):
        """
        Place the LandArea just outside its village's own boundary, in a
        random direction, avoiding overlap with the village's own boundary
        and any other village's boundary - mirrors generate_fields' original
        placement so farmland never visually overlaps a settlement.
        Returns True if placed, False if no valid spot was found.
        """
        centre = landarea.population_centre
        # Convert hectares to rough meters (1 ha = 100 m x 100 m = 10,000 m^2)
        half_side = (landarea.size * 10000) ** 0.5 / 2

        min_x, min_y, max_x, max_y = centre.boundary.extent
        # Rough "radius" of the settlement from its own centre point, so the
        # LandArea lands just past the boundary edge regardless of direction.
        radius = max(
            max_x - centre.location.x,
            centre.location.x - min_x,
            max_y - centre.location.y,
            centre.location.y - min_y,
        )

        for _ in range(PLACEMENT_ATTEMPTS):
            angle = random.uniform(0, 2 * math.pi)
            margin = random.uniform(
                MIN_MARGIN_BEYOND_BOUNDARY, MAX_MARGIN_BEYOND_BOUNDARY
            )
            # The square's own half-diagonal reach must be added too - for a
            # LandArea whose side is comparable to (or bigger than) the
            # village itself, placing only its center point past the
            # boundary isn't enough; its near edge/corner would still fold
            # back across the settlement regardless of angle chosen.
            distance = radius + margin + half_side * math.sqrt(2)

            cx = centre.location.x + distance * math.cos(angle)
            cy = centre.location.y + distance * math.sin(angle)

            boundary = Polygon(
                (
                    (cx - half_side, cy - half_side),
                    (cx - half_side, cy + half_side),
                    (cx + half_side, cy + half_side),
                    (cx + half_side, cy - half_side),
                    (cx - half_side, cy - half_side),
                ),
                srid=3857,
            )
            buffered = boundary.buffer(LANDAREA_BUFFER)

            # Guarantee a visible gap from the centre's own boundary too, not
            # just other villages' - otherwise the LandArea's near edge can
            # land on top of the boundary line, making it look fused on.
            if centre.boundary.intersects(buffered):
                continue

            if any(other.intersects(buffered) for other in other_boundaries):
                continue

            landarea.boundary = boundary
            landarea.location = Point(cx, cy, srid=3857)
            landarea.save(update_fields=["boundary", "location"])
            return True

        return False

    def subdivide_landarea(self, landarea: LandArea):
        """
        Split a LandArea into Subzones proportionally.
        """
        breakdown = {
            "crops": 0.60,
            "grazing": 0.20,
            "mixed_crops": 0.20,
        }

        for usage, fraction in breakdown.items():
            Subzone.objects.create(
                name=f"{landarea.name} - {usage.capitalize()}",
                land_area=landarea,
                usage=usage,
                size=landarea.size * fraction,
            )

    def assign_subzone_geometry(self, landarea: LandArea):
        # Simplified: split LandArea square into N subzone squares
        N = len(landarea.subzones.all())
        if N == 0:
            return

        # Bounding box of landarea
        min_x, min_y, max_x, max_y = landarea.boundary.extent
        width = (max_x - min_x) / N
        height = max_y - min_y  # same height for all

        for i, subzone in enumerate(landarea.subzones.all()):
            x0 = min_x + i * width
            x1 = x0 + width
            subzone.boundary = Polygon(
                (
                    (x0, min_y),
                    (x0, max_y),
                    (x1, max_y),
                    (x1, min_y),
                    (x0, min_y),
                ),
                srid=3857,
            )
            # center as location
            subzone.location = Point((x0 + x1) / 2, (min_y + max_y) / 2, srid=3857)
            subzone.save(update_fields=["boundary", "location"])

    # -----------------------------
    # Main logic
    # -----------------------------
    @transaction.atomic
    def handle(self, *args, **options):
        overwrite = options["overwrite"]

        # if overwrite:
        self.stdout.write("Deleting existing LandAreas and Subzones...")
        # Deleting a Subzone cascades its FieldCrop (generate_fields), but
        # nothing points back from Subzone/FieldCrop to the field_shelter
        # Building generate_fields also created alongside it - without this,
        # that Building is orphaned and a later generate_fields run collides
        # on its unique name when trying to recreate it for the new subzone.
        Building.objects.filter(building_type="field_shelter").delete()
        Subzone.objects.all().delete()
        LandArea.objects.all().delete()

        population_centres = list(PopulationCentre.objects.all())

        if not population_centres:
            self.stdout.write(self.style.WARNING("No population centres found."))
            return

        for pc in population_centres:
            residents = pc.residents.count()
            if residents <= 0:
                self.stdout.write(
                    self.style.WARNING(f"{pc.name} has no residents, skipping.")
                )
                continue

            if pc.boundary is None or pc.location is None:
                self.stdout.write(
                    self.style.WARNING(f"{pc.name} has no boundary, skipping.")
                )
                continue

            required_area = self.estimate_required_land(residents)

            landarea = LandArea.objects.create(
                name=f"{pc.name} Land Area",
                population_centre=pc,
                size=required_area,
            )

            other_boundaries = [
                other.boundary
                for other in population_centres
                if other.id != pc.id and other.boundary is not None
            ]
            placed = self.assign_landarea_geometry(landarea, other_boundaries)
            if not placed:
                self.stdout.write(
                    self.style.WARNING(
                        f"Could not place a Land Area for {pc.name} after "
                        f"{PLACEMENT_ATTEMPTS} attempts - skipping."
                    )
                )
                landarea.delete()
                continue

            self.subdivide_landarea(landarea)

            self.assign_subzone_geometry(landarea)

            self.stdout.write(
                self.style.SUCCESS(
                    f"Generated {landarea} with {landarea.subzones.count()} subzones."
                )
            )

        self.stdout.write(self.style.SUCCESS("All land areas generated successfully."))
