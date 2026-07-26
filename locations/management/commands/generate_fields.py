from django.core.management.base import BaseCommand
from django.db import transaction

from economy.models import FieldCrop
from locations.models import Building, Node, Subzone
from locations.management.commands.spawn_villages import (
    compute_building_entrance_point,
    create_building_footprint,
)

# Shelter buildings are a small work-site, not the field itself - sized like
# a house (matches spawn_villages' residential footprint range), not the
# crops Subzone's own (much larger) area.
SHELTER_MIN_SIZE = 10
SHELTER_MAX_SIZE = 25


class Command(BaseCommand):
    help = (
        "Attach an economy.FieldCrop, plus a small field_shelter Building on "
        "its edge for characters to work at, to each population centre's "
        "'crops' Subzone (created by generate_landarea - run that first). "
        "Skips centres with no crops Subzone yet, or whose crops Subzone "
        "already has a FieldCrop."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        crop_subzones = Subzone.objects.filter(
            usage="crops", land_area__population_centre__isnull=False
        ).select_related("land_area__population_centre")

        if not crop_subzones.exists():
            self.stdout.write(
                self.style.WARNING(
                    "No crops Subzones found - run generate_landarea first."
                )
            )
            return

        for subzone in crop_subzones:
            centre = subzone.land_area.population_centre

            if FieldCrop.objects.filter(subzone=subzone).exists():
                self.stdout.write(
                    f"{centre.name} crops Subzone already has a FieldCrop - skipping"
                )
                continue

            if subzone.boundary is None or subzone.location is None:
                self.stdout.write(
                    self.style.WARNING(
                        f"{centre.name} crops Subzone has no geometry yet - skipping"
                    )
                )
                continue

            shelter_point = compute_building_entrance_point(
                subzone.boundary, subzone.location
            )
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
                f"Attached FieldCrop and {shelter.name} to "
                f"{centre.name}'s crops Subzone"
            )

        self.stdout.write(self.style.SUCCESS("Fields generated successfully."))
