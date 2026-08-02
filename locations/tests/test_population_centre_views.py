from django.contrib.gis.geos import Point
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from locations.models import Node, Path, Journey, PopulationCentre
from character.models import Character, PlayerCharacterLink
from users.tests import user_factory


class PopulationCentreMapViewJourneyTest(TestCase):
    """Guards against reintroducing an N+1 query per moving character when
    the map endpoint looks up active journeys (see prefetch in
    PopulationCentreMapView.get)."""

    def setUp(self):
        self.centre = PopulationCentre.objects.create(
            name="Map Journey Village", location=Point(0, 0, srid=3857)
        )
        self.node_a = Node.objects.create(name="A", location=Point(0, 0, srid=3857))
        self.node_b = Node.objects.create(name="B", location=Point(10, 0, srid=3857))
        Path.objects.create(from_node=self.node_a, to_node=self.node_b)

        self.moving_characters = []
        for i in range(5):
            character = Character.objects.create(
                first_name=f"Mover{i}",
                location=Point(0, 0, srid=3857),
                current_node=self.node_a,
                population_centre=self.centre,
                is_moving=True,
            )
            Journey.objects.create(
                character=character,
                start_node=self.node_a,
                destination_node=self.node_b,
                path_nodes=[self.node_a.pk, self.node_b.pk],
                current_index=0,
                status="active",
            )
            self.moving_characters.append(character)

        user = user_factory()
        self.client = APIClient()
        self.client.force_authenticate(user=user)

    def test_map_response_includes_path_for_each_moving_character(self):
        url = reverse("populationcentre-map", args=[self.centre.pk])
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        character_features = [
            f
            for f in response.data["features"]
            if f["properties"].get("feature_type") == "character"
        ]
        self.assertEqual(len(character_features), len(self.moving_characters))
        for feature in character_features:
            self.assertEqual(feature["properties"]["path"], [[10.0, 0.0]])

    def test_map_response_does_not_scale_journey_queries_with_character_count(self):
        url = reverse("populationcentre-map", args=[self.centre.pk])

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        journey_queries = [
            q["sql"] for q in ctx.captured_queries if "locations_journey" in q["sql"]
        ]
        self.assertEqual(
            len(journey_queries),
            1,
            "active journeys should be prefetched in one query instead of "
            f"one per character: {journey_queries}",
        )


class PopulationCentreVillagePointsTest(TestCase):
    """Guards against the N+1 pattern in PopulationCentre.village_points
    (Sentry issue 129622699), where every resident triggered its own
    unfiltered PlayerCharacterLink query, and progress/state each
    recomputed village_points from scratch on top of that."""

    def setUp(self):
        self.centre = PopulationCentre.objects.create(
            name="Test Village",
            location=Point(0, 0, srid=3857),
        )
        self.residents = [
            Character.objects.create(
                first_name=f"Resident{i}",
                location=Point(0, 0, srid=3857),
                population_centre=self.centre,
            )
            for i in range(4)
        ]

        user = user_factory(with_player=True)
        PlayerCharacterLink.objects.create(
            player=user.player, character=self.residents[0], is_active=True
        )

    def _link_queries(self, ctx):
        return [
            q["sql"]
            for q in ctx.captured_queries
            if "character_playercharacterlink" in q["sql"].lower()
        ]

    def test_village_points_batches_link_queries_per_resident(self):
        with CaptureQueriesContext(connection) as ctx:
            points = self.centre.village_points

        self.assertIsInstance(points, int)
        link_queries = self._link_queries(ctx)
        self.assertEqual(
            len(link_queries),
            1,
            "village_points should fetch all residents' links in one "
            f"query instead of one per resident: {link_queries}",
        )

    def test_village_points_is_cached_across_progress_and_state(self):
        with CaptureQueriesContext(connection) as ctx:
            points = self.centre.village_points
            self.centre.progress
            self.centre.state

        link_queries = self._link_queries(ctx)
        self.assertEqual(
            len(link_queries),
            1,
            "village_points should be computed once and reused by "
            f"progress/state, not recomputed per property: {link_queries}",
        )
