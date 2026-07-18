import math
import random

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand
from django.db import transaction

from economy.models import FieldCrop
from locations.models import Building, LandArea, Node, PopulationCentre, Subzone
from locations.management.commands.spawn_villages import (
    compute_building_entrance_point,
    create_building_footprint,
)

CROP_MIN_SIZE = 35
CROP_MAX_SIZE = 60
CROP_BUFFER = 5
PLACEMENT_ATTEMPTS = 100
MIN_MARGIN_BEYOND_BOUNDARY = 10
MAX_MARGIN_BEYOND_BOUNDARY = 40

# Shelter buildings are a small work-site, not the field itself - sized like
# a house (matches spawn_villages' residential footprint range), not the
# 35-60 unit crop area.
SHELTER_MIN_SIZE = 10
SHELTER_MAX_SIZE = 25


class Command(BaseCommand):
    help = (
        "Place a crops Subzone (under a per-village 'Farmland' LandArea) just "
        "outside each population centre's boundary, plus a small field_shelter "
        "Building on its edge for characters to work at (avoiding overlap with "
        "other centres' boundaries). The crop area is deliberately left outside "
        "the boundary polygon - the map view's bbox is computed from all "
        "buildings/subzones, not just the boundary, so it still renders. Each "
        "new crop Subzone gets an economy.FieldCrop record automatically. "
        "Skips centres that already have a crops Subzone."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        centres = list(PopulationCentre.objects.exclude(boundary__isnull=True))
        if not centres:
            self.stdout.write(
                self.style.WARNING("No population centres with a boundary found")
            )
            return

        for centre in centres:
            if Subzone.objects.filter(
                land_area__population_centre=centre, usage="crops"
            ).exists():
                self.stdout.write(
                    f"{centre.name} already has a crops Subzone - skipping"
                )
                continue

            other_boundaries = [
                c.boundary
                for c in centres
                if c.id != centre.id and c.boundary is not None
            ]

            placement = self._find_crop_placement(centre, other_boundaries)
            if placement is None:
                self.stdout.write(
                    self.style.WARNING(
                        f"Could not place a crops Subzone for {centre.name} after "
                        f"{PLACEMENT_ATTEMPTS} attempts"
                    )
                )
                continue

            crop_point, crop_polygon = placement
            area_ha = crop_polygon.area / 10000

            land_area = LandArea.objects.create(
                name=f"{centre.name} Farmland",
                population_centre=centre,
                location=centre.location,
                boundary=crop_polygon,
                size=area_ha,
            )
            subzone = Subzone.objects.create(
                land_area=land_area,
                name=f"{centre.name} Farmland - Crops",
                usage="crops",
                boundary=crop_polygon,
                location=crop_point,
                size=area_ha,
            )

            shelter_point = compute_building_entrance_point(crop_polygon, crop_point)
            shelter_footprint = create_building_footprint(
                shelter_point,
                min_size=SHELTER_MIN_SIZE,
                max_size=SHELTER_MAX_SIZE,
                irregularity=0,
            )
            shelter = Building.objects.create(
                name=f"Field Shelter of ({centre.name})",
                building_type="field_shelter",
                location=shelter_point,
                footprint=shelter_footprint,
                population_centre=centre,
            )

            Node.objects.get_or_create(
                building=shelter,
                defaults={
                    "name": f"Node for {shelter.name}",
                    "location": shelter.location,
                    "kind": Node.Kind.BUILDING,
                },
            )
            entrance_point = compute_building_entrance_point(
                shelter.footprint, shelter.location
            )
            Node.objects.get_or_create(
                building=shelter,
                kind=Node.Kind.BUILDING_ENTRANCE,
                defaults={
                    "name": f"Entrance for {shelter.name}",
                    "location": entrance_point,
                },
            )

            FieldCrop.objects.create(
                subzone=subzone,
                shelter_building=shelter,
                stage=FieldCrop.Stage.FALLOW,
            )

            self.stdout.write(
                f"Placed crops Subzone and {shelter.name} for {centre.name} at {crop_point}"
            )

        self.stdout.write(self.style.SUCCESS("Fields generated successfully."))

    def _find_crop_placement(self, centre, other_boundaries):
        """
        Pick a point just outside centre.boundary, in a random direction from
        the centre's own location, that doesn't overlap any other centre's
        boundary. Returns (Point, Polygon) or None if no attempt succeeded.
        """
        min_x, min_y, max_x, max_y = centre.boundary.extent
        # Rough "radius" of the settlement from its own centre point, so the
        # crop area lands just past the boundary edge regardless of direction.
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
            distance = radius + margin

            candidate = Point(
                centre.location.x + distance * math.cos(angle),
                centre.location.y + distance * math.sin(angle),
                srid=centre.location.srid,
            )

            footprint = create_building_footprint(
                candidate,
                min_size=CROP_MIN_SIZE,
                max_size=CROP_MAX_SIZE,
                irregularity=0,
            )
            buffered = footprint.buffer(CROP_BUFFER)

            # Guarantee a visible gap from the centre's own boundary too, not
            # just other villages' - otherwise the crop area's near edge can
            # land on top of the boundary line, making it look fused on.
            if centre.boundary.intersects(buffered):
                continue

            if any(other.intersects(buffered) for other in other_boundaries):
                continue

            return candidate, footprint

        return None
