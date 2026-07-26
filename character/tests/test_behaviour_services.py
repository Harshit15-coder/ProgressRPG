from datetime import date

from django.contrib.gis.geos import Point
from django.test import TestCase

from character.models import Character, CharacterLocation
from character.utils import WORK_ACTIVITIES_BY_BUILDING_TYPE, work_activities_for
from locations.models import Building
from progression.models import CharacterActivity


class WorkActivitiesForTests(TestCase):
    def setUp(self):
        self.character = Character.objects.create(
            first_name="Marigold", location=Point(0, 0, srid=3857)
        )

    def test_returns_field_specific_activities_for_field_worker(self):
        field = Building.objects.create(
            name="Field of (Testville)",
            building_type="field_shelter",
            location=Point(10, 10, srid=3857),
        )
        CharacterLocation.objects.create(
            character=self.character, location=field, role=CharacterLocation.Role.WORK
        )

        self.assertEqual(
            work_activities_for(self.character),
            WORK_ACTIVITIES_BY_BUILDING_TYPE["field_shelter"],
        )

    def test_falls_back_to_default_when_unemployed(self):
        self.assertEqual(
            work_activities_for(self.character),
            WORK_ACTIVITIES_BY_BUILDING_TYPE["default"],
        )

    def test_falls_back_to_default_for_unmapped_building_type(self):
        home = Building.objects.create(
            name="Marigold's House",
            building_type="residential",
            location=Point(0, 0, srid=3857),
        )
        CharacterLocation.objects.create(
            character=self.character, location=home, role=CharacterLocation.Role.WORK
        )

        self.assertEqual(
            work_activities_for(self.character),
            WORK_ACTIVITIES_BY_BUILDING_TYPE["default"],
        )


class GenerateDayWorkFlavorTests(TestCase):
    def setUp(self):
        self.character = Character.objects.create(
            first_name="Oswin", location=Point(0, 0, srid=3857)
        )
        self.field = Building.objects.create(
            name="Field of (Testville)",
            building_type="field_shelter",
            location=Point(10, 10, srid=3857),
        )
        CharacterLocation.objects.create(
            character=self.character,
            location=self.field,
            role=CharacterLocation.Role.WORK,
        )

    def test_work_blocks_use_field_specific_flavor_text(self):
        self.character.behaviour.generate_day(date(2026, 1, 5))

        work_names = set(
            CharacterActivity.objects.filter(
                character=self.character, kind="work"
            ).values_list("name", flat=True)
        )
        self.assertTrue(work_names)
        self.assertTrue(
            work_names.issubset(set(WORK_ACTIVITIES_BY_BUILDING_TYPE["field_shelter"]))
        )

    def test_generating_the_same_day_twice_is_deterministic(self):
        self.character.behaviour.generate_day(date(2026, 1, 5))
        first_names = list(
            CharacterActivity.objects.filter(character=self.character, kind="work")
            .order_by("scheduled_start")
            .values_list("name", flat=True)
        )

        self.character.behaviour.generate_day(date(2026, 1, 5))
        second_names = list(
            CharacterActivity.objects.filter(character=self.character, kind="work")
            .order_by("scheduled_start")
            .values_list("name", flat=True)
        )

        self.assertEqual(first_names, second_names)
