"""
Tests for the spawn_characters management command - specifically that
generate_for_centre sizes a village's cast from
population_estimation.starting_population (residential capacity), not a
hardcoded per-building ratio.
"""

from django.contrib.gis.geos import Point, Polygon
from django.core.management import call_command
from django.test import TestCase

from character.models import Character
from locations.models import Building, PopulationCentre
from locations.services import population_estimation


def _square_footprint(size, x=0, y=0):
    return Polygon(
        (
            (x, y),
            (x + size, y),
            (x + size, y + size),
            (x, y + size),
            (x, y),
        ),
        srid=3857,
    )


class GenerateForCentreTests(TestCase):
    def _make_centre(self, name="Charactertown"):
        return PopulationCentre.objects.create(
            name=name, location=Point(0, 0, srid=3857)
        )

    def _make_residential_building(self, centre, size, x=0):
        return Building.objects.create(
            name=f"house at {x}",
            building_type="residential",
            location=Point(x, 0, srid=3857),
            footprint=_square_footprint(size, x=x),
            population_centre=centre,
        )

    def test_character_count_matches_starting_population(self):
        centre = self._make_centre()
        for x in range(4):
            self._make_residential_building(centre, size=30, x=x * 40)

        expected = population_estimation.starting_population(centre)
        self.assertGreater(expected, 0)

        call_command("spawn_characters", centre=centre.id)

        self.assertEqual(
            Character.objects.filter(population_centre=centre).count(), expected
        )

    def test_zero_capacity_centre_gets_no_characters(self):
        centre = self._make_centre()

        call_command("spawn_characters", centre=centre.id)

        self.assertEqual(Character.objects.filter(population_centre=centre).count(), 0)

    def test_generated_characters_are_housed_in_residential_buildings(self):
        centre = self._make_centre()
        building = self._make_residential_building(centre, size=30, x=0)

        call_command("spawn_characters", centre=centre.id)

        characters = Character.objects.filter(population_centre=centre)
        self.assertGreater(characters.count(), 0)
        for character in characters:
            self.assertEqual(character.building, building)
