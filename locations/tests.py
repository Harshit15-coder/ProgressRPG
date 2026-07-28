import random
from datetime import datetime

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point, Polygon
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from unittest.mock import patch

from .management.commands.spawn_villages import create_building_footprint
from .models import Node, Path, Building, Journey, PopulationCentre, LandArea, Subzone
from .serializers import CharacterPointFeatureSerializer, JOURNEY_PATH_PREVIEW_LIMIT
from .services.schedule import sync_character_location, target_role_for
from .services.wander import wander
from .tasks import commute_tick, move_characters_tick, wander_tick
from character.models import Character, CharacterLocation, PlayerCharacterLink
from economy.models import FieldCrop


class LocationsModelsTestCase(TestCase):
    def setUp(self):
        # Create a small linear graph of three nodes
        self.node_a = Node.objects.create(name="A", location=Point(0, 0, srid=3857))
        self.node_b = Node.objects.create(name="B", location=Point(10, 0, srid=3857))
        self.node_c = Node.objects.create(name="C", location=Point(20, 0, srid=3857))

        # Create directed paths A -> B -> C
        self.path_ab = Path.objects.create(from_node=self.node_a, to_node=self.node_b)
        self.path_bc = Path.objects.create(from_node=self.node_b, to_node=self.node_c)

        # Building near node B
        self.building = Building.objects.create(
            name="Test Inn",
            building_type="inn",
            location=Point(10, 0, srid=3857),
        )

        # Link building to node_b for semantic tests
        self.node_b.building = self.building
        self.node_b.save(update_fields=["building"])

    def test_path_length_and_neighbours(self):
        # Path length should be set on save and neighbours() should return expected node
        # Distance between A and B is 10 units
        self.assertIsNotNone(self.path_ab.length)
        self.assertAlmostEqual(
            self.path_ab.length,
            self.node_a.location.distance(self.node_b.location),
            places=6,
        )

        neighbours_of_a = list(self.node_a.neighbours())
        self.assertIn(self.node_b, neighbours_of_a)

    def test_movable_move_to_and_nearby_objects(self):
        # Create a character located at node A
        char = Character.objects.create(
            first_name="Mover",
            location=Point(0, 0, srid=3857),
            current_node=self.node_a,
        )

        # Move instantly to node B
        char.move_to(self.node_b)
        char.refresh_from_db()
        self.assertEqual(char.current_node, self.node_b)
        self.assertEqual(char.location.x, self.node_b.location.x)
        self.assertFalse(char.is_moving)

        # nearby_objects should find the building at node B within a small radius
        nearby = list(char.nearby_objects(Building.objects.all(), radius=1.0))
        # building is exactly at same coordinates as char after move, so should be returned
        self.assertTrue(any(b.pk == self.building.pk for b in nearby))

    def test_set_destination_creates_journey_and_triggers_task(self):
        # Patch out the async task to avoid side effects
        with patch("locations.tasks.move_characters_tick.apply_async") as mocked_task:
            char = Character.objects.create(
                first_name="Walker",
                location=Point(0, 0, srid=3857),
                current_node=self.node_a,
            )

            # Ensure there is no journey initially
            self.assertFalse(hasattr(char, "journey") and char.journey)

            # Set destination to node C - should create a Journey that goes A -> B -> C
            char.set_destination(node=self.node_c)

            char.refresh_from_db()
            # Character should be marked moving and a Journey should exist
            self.assertTrue(char.is_moving)

            # There should be exactly one Journey for this character in DB
            journey = Journey.objects.filter(character=char).first()
            self.assertIsNotNone(journey)

            # The saved path_nodes should include the nodes A, B, C in some order
            self.assertIsInstance(journey.path_nodes, list)
            self.assertGreaterEqual(len(journey.path_nodes), 2)

            # The task should be scheduled because this is the first moving character
            mocked_task.assert_called()

    def test_journey_serialize_and_advance(self):
        # Create a Journey manually spanning A -> B -> C
        journey = Journey.objects.create(
            character=Character.objects.create(
                first_name="J",
                location=Point(0, 0, srid=3857),
                current_node=self.node_a,
            ),
            start_node=self.node_a,
            destination_node=self.node_c,
            path_nodes=[self.node_a.pk, self.node_b.pk, self.node_c.pk],
            current_index=0,
            status="active",
        )

        serialized = journey.serialize_for_client()
        self.assertIn("path", serialized)
        self.assertIn("segment_distances", serialized)
        self.assertEqual(serialized["current_index"], 0)

        # Advance once: should return True and increment index
        progressed = journey.advance_node()
        self.assertTrue(progressed)
        journey.refresh_from_db()
        self.assertEqual(journey.current_index, 1)
        self.assertEqual(journey.current_node(), self.node_b)
        self.assertEqual(journey.next_node(), self.node_c)

        # Advance twice to finish
        progressed = journey.advance_node()
        self.assertTrue(progressed)
        journey.refresh_from_db()
        self.assertEqual(journey.current_index, 2)
        self.assertIsNone(journey.next_node())

        progressed = journey.advance_node()
        self.assertFalse(progressed)
        journey.refresh_from_db()
        self.assertEqual(journey.status, "complete")
        self.assertIsNotNone(journey.finished_at)

    def test_remaining_path_nodes_excludes_current_node_and_respects_limit(self):
        journey = Journey.objects.create(
            character=Character.objects.create(
                first_name="J2",
                location=Point(0, 0, srid=3857),
                current_node=self.node_a,
            ),
            start_node=self.node_a,
            destination_node=self.node_c,
            path_nodes=[self.node_a.pk, self.node_b.pk, self.node_c.pk],
            current_index=0,
            status="active",
        )

        self.assertEqual(journey.remaining_path_nodes(), [self.node_b, self.node_c])
        self.assertEqual(journey.remaining_path_nodes(limit=1), [self.node_b])

        journey.advance_node()
        journey.refresh_from_db()
        self.assertEqual(journey.remaining_path_nodes(), [self.node_c])

    def test_remaining_path_nodes_empty_when_no_path(self):
        journey = Journey.objects.create(
            character=Character.objects.create(
                first_name="J3",
                location=Point(0, 0, srid=3857),
                current_node=self.node_a,
            ),
            start_node=self.node_a,
            destination_node=self.node_a,
            path_nodes=None,
            current_index=0,
            status="active",
        )
        self.assertEqual(journey.remaining_path_nodes(), [])

    def test_journey_arrival_via_move_characters_tick_does_not_raise(self):
        """Regression test: arrive() used to reference nonexistent
        current_content_type/current_object_id fields, which raised
        AttributeError the moment any real Journey actually completed."""
        char = Character.objects.create(
            first_name="Arriver",
            location=Point(0, 0, srid=3857),
            current_node=self.node_a,
        )
        char.set_destination(node=self.node_b)
        char.refresh_from_db()
        self.assertTrue(char.is_moving)

        # A large time_delta covers the full A -> B distance (10 units) in
        # one step, but the Journey only reaches "complete" on the following
        # tick (the one that finds no next_node) - in production this is the
        # self-rescheduled tick; here we drive it explicitly twice.
        with patch("locations.tasks.move_characters_tick.apply_async"):
            move_characters_tick(time_delta=100.0)
            move_characters_tick(time_delta=100.0)

        char.refresh_from_db()
        self.assertFalse(char.is_moving)
        self.assertEqual(char.current_node, self.node_b)
        self.assertEqual(char.location.x, self.node_b.location.x)
        self.assertEqual(char.location.y, self.node_b.location.y)

        journey = Journey.objects.filter(character=char).first()
        self.assertEqual(journey.status, "complete")


class CharacterPointFeatureSerializerJourneyTest(TestCase):
    """Path-aware movement interpolation (#615): the map feature for a
    character exposes their remaining journey (capped) and effective speed,
    so the frontend can walk them along the real path instead of tweening
    blindly between two polled points."""

    def setUp(self):
        self.node_a = Node.objects.create(name="A", location=Point(0, 0, srid=3857))
        self.node_b = Node.objects.create(name="B", location=Point(10, 0, srid=3857))
        self.node_c = Node.objects.create(name="C", location=Point(20, 0, srid=3857))
        Path.objects.create(from_node=self.node_a, to_node=self.node_b)
        Path.objects.create(from_node=self.node_b, to_node=self.node_c)

    def test_idle_character_has_no_path(self):
        character = Character.objects.create(
            first_name="Idle",
            location=Point(0, 0, srid=3857),
            current_node=self.node_a,
            movement_speed=2.5,
        )

        props = CharacterPointFeatureSerializer(character).data["properties"]

        self.assertIsNone(props["path"])
        self.assertEqual(props["effective_speed"], 2.5)

    def test_moving_character_exposes_remaining_path_and_speed(self):
        character = Character.objects.create(
            first_name="Walker",
            location=Point(0, 0, srid=3857),
            current_node=self.node_a,
            is_moving=True,
            movement_speed=3.0,
        )
        Journey.objects.create(
            character=character,
            start_node=self.node_a,
            destination_node=self.node_c,
            path_nodes=[self.node_a.pk, self.node_b.pk, self.node_c.pk],
            current_index=0,
            status="active",
        )

        props = CharacterPointFeatureSerializer(character).data["properties"]

        self.assertEqual(props["path"], [[10.0, 0.0], [20.0, 0.0]])
        self.assertEqual(props["effective_speed"], 3.0)

    def test_path_is_capped_to_preview_limit(self):
        nodes = [self.node_a, self.node_b, self.node_c]
        for i in range(JOURNEY_PATH_PREVIEW_LIMIT + 5):
            nodes.append(
                Node.objects.create(
                    name=f"Extra{i}", location=Point(30 + i * 10, 0, srid=3857)
                )
            )
            Path.objects.create(from_node=nodes[-2], to_node=nodes[-1])

        character = Character.objects.create(
            first_name="LongHauler",
            location=Point(0, 0, srid=3857),
            current_node=self.node_a,
            is_moving=True,
        )
        Journey.objects.create(
            character=character,
            start_node=self.node_a,
            destination_node=nodes[-1],
            path_nodes=[n.pk for n in nodes],
            current_index=0,
            status="active",
        )

        props = CharacterPointFeatureSerializer(character).data["properties"]

        self.assertEqual(len(props["path"]), JOURNEY_PATH_PREVIEW_LIMIT)


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

        user = get_user_model().objects.create_user(
            email="map-viewer@example.com", password="testpassword123"
        )
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

        user = get_user_model().objects.create_user(
            email="linked-resident@example.com", password="testpassword123"
        )
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


VILLAGE_BOUNDARY = Polygon(
    ((-50, -50), (-50, 50), (50, 50), (50, -50), (-50, -50)), srid=3857
)


class WanderServiceTest(TestCase):
    """Decorative-only movement: must never touch Journey/is_moving/current_node
    or move a character outside its village boundary."""

    def setUp(self):
        self.centre = PopulationCentre.objects.create(
            name="Wander Village",
            location=Point(0, 0, srid=3857),
            boundary=VILLAGE_BOUNDARY,
        )
        self.character = Character.objects.create(
            first_name="Wanderer",
            location=Point(0, 0, srid=3857),
            population_centre=self.centre,
        )

    def test_wander_moves_character_within_boundary(self):
        moved = wander(self.character, radius=15)
        self.assertTrue(moved)
        self.character.refresh_from_db()
        self.assertTrue(self.centre.boundary.contains(self.character.location))

    def test_wander_does_not_create_journey_or_touch_movement_state(self):
        wander(self.character, radius=15)
        self.character.refresh_from_db()
        self.assertFalse(self.character.is_moving)
        self.assertIsNone(self.character.current_node)
        self.assertIsNone(self.character.target_node)
        self.assertEqual(Journey.objects.count(), 0)

    def test_wander_without_population_centre_is_a_noop(self):
        orphan = Character.objects.create(
            first_name="Orphan", location=Point(0, 0, srid=3857)
        )
        moved = wander(orphan, radius=15)
        self.assertFalse(moved)
        orphan.refresh_from_db()
        self.assertEqual(orphan.location.x, 0)
        self.assertEqual(orphan.location.y, 0)

    def test_wander_gives_up_gracefully_when_no_candidate_fits(self):
        # A character pinned at the boundary edge with a huge radius will
        # struggle to find an in-bounds candidate within max_attempts;
        # this should return False rather than raise or move out-of-bounds.
        self.character.location = Point(49, 49, srid=3857)
        self.character.save(update_fields=["location"])

        moved = wander(self.character, radius=1000, max_attempts=5)
        self.character.refresh_from_db()
        if moved:
            self.assertTrue(self.centre.boundary.contains(self.character.location))
        else:
            self.assertEqual(self.character.location.x, 49)
            self.assertEqual(self.character.location.y, 49)


class WanderTickTaskTest(TestCase):
    """wander_tick must exclude anyone mid-journey (is_moving), but is
    otherwise indifferent to player-linking - this is purely visual, not
    gameplay - and only moves a random subgroup of eligible characters
    per tick, not everyone at once."""

    def setUp(self):
        self.centre = PopulationCentre.objects.create(
            name="Tick Village",
            location=Point(0, 0, srid=3857),
            boundary=VILLAGE_BOUNDARY,
        )
        self.idle_npc = Character.objects.create(
            first_name="Idle",
            location=Point(0, 0, srid=3857),
            population_centre=self.centre,
            is_moving=False,
        )
        self.moving_npc = Character.objects.create(
            first_name="Moving",
            location=Point(0, 0, srid=3857),
            population_centre=self.centre,
            is_moving=True,
        )
        self.linked_character = Character.objects.create(
            first_name="Linked",
            location=Point(0, 0, srid=3857),
            population_centre=self.centre,
            is_moving=False,
        )
        user = get_user_model().objects.create_user(
            email="linked-wanderer@example.com", password="testpassword123"
        )
        PlayerCharacterLink.objects.create(
            player=user.player, character=self.linked_character, is_active=True
        )

    def test_wander_tick_excludes_moving_characters_but_not_linked_ones(self):
        # fraction=1.0 makes the sample deterministic (everyone eligible gets
        # wandered), isolating the is_moving exclusion from the random subset
        # selection tested separately below.
        with patch("locations.services.wander.wander") as mock_wander:
            wander_tick(fraction=1.0)

        wandered_ids = {call.args[0].id for call in mock_wander.call_args_list}
        self.assertEqual(wandered_ids, {self.idle_npc.id, self.linked_character.id})

    def test_wander_tick_only_moves_a_subset_when_fraction_is_small(self):
        with patch("locations.services.wander.wander") as mock_wander:
            wander_tick(fraction=0.1)

        # 2 eligible characters (idle_npc, linked_character); a small
        # fraction should still wander at least one but not both every time
        # in principle, so just assert it never exceeds the eligible pool
        # and never wanders the excluded is_moving character.
        wandered_ids = {call.args[0].id for call in mock_wander.call_args_list}
        self.assertTrue(
            wandered_ids.issubset({self.idle_npc.id, self.linked_character.id})
        )
        self.assertNotIn(self.moving_npc.id, wandered_ids)
        self.assertGreaterEqual(len(wandered_ids), 1)


class ScheduleServiceTargetRoleTest(TestCase):
    def setUp(self):
        self.character = Character.objects.create(
            first_name="Scheduled", location=Point(0, 0, srid=3857)
        )

    def test_target_role_is_work_at_midday(self):
        noon = timezone.make_aware(datetime(2026, 1, 1, 12, 0, 0))
        self.assertEqual(
            target_role_for(self.character, now=noon), CharacterLocation.Role.WORK
        )

    def test_target_role_is_home_at_midnight(self):
        midnight = timezone.make_aware(datetime(2026, 1, 1, 0, 0, 0))
        self.assertEqual(
            target_role_for(self.character, now=midnight), CharacterLocation.Role.HOME
        )

    def test_target_role_respects_per_character_stagger_at_boundary(self):
        with patch(
            "locations.services.schedule._stagger_offset_seconds", return_value=0
        ):
            at_work_start = timezone.make_aware(datetime(2026, 1, 1, 8, 0, 0))
            just_before = timezone.make_aware(datetime(2026, 1, 1, 7, 59, 59))
            self.assertEqual(
                target_role_for(self.character, now=at_work_start),
                CharacterLocation.Role.WORK,
            )
            self.assertEqual(
                target_role_for(self.character, now=just_before),
                CharacterLocation.Role.HOME,
            )

        with patch(
            "locations.services.schedule._stagger_offset_seconds",
            return_value=600,
        ):
            # Boundary shifted 10 minutes later: 08:05 should still read HOME.
            shifted = timezone.make_aware(datetime(2026, 1, 1, 8, 5, 0))
            self.assertEqual(
                target_role_for(self.character, now=shifted),
                CharacterLocation.Role.HOME,
            )


class SyncCharacterLocationTest(TestCase):
    def setUp(self):
        self.start_node = Node.objects.create(
            name="Start", location=Point(0, 0, srid=3857), kind=Node.Kind.OUTSIDE
        )
        self.home_building = Building.objects.create(
            name="Home", building_type="residential", location=Point(0, 0, srid=3857)
        )
        self.work_building = Building.objects.create(
            name="Work", building_type="communal", location=Point(20, 0, srid=3857)
        )
        self.home_node = Node.objects.create(
            name="HomeEntrance",
            location=Point(0, 0, srid=3857),
            kind=Node.Kind.BUILDING_ENTRANCE,
            building=self.home_building,
        )
        self.work_node = Node.objects.create(
            name="WorkEntrance",
            location=Point(20, 0, srid=3857),
            kind=Node.Kind.BUILDING_ENTRANCE,
            building=self.work_building,
        )
        Path.objects.create(from_node=self.start_node, to_node=self.home_node)
        Path.objects.create(from_node=self.start_node, to_node=self.work_node)
        Path.objects.create(from_node=self.home_node, to_node=self.work_node)

        self.character = Character.objects.create(
            first_name="Commuter",
            location=Point(0, 0, srid=3857),
            current_node=self.start_node,
        )
        CharacterLocation.objects.create(
            character=self.character,
            location=self.home_building,
            role=CharacterLocation.Role.HOME,
        )
        CharacterLocation.objects.create(
            character=self.character,
            location=self.work_building,
            role=CharacterLocation.Role.WORK,
        )

    def test_moves_toward_work_during_day(self):
        with patch(
            "locations.services.schedule.target_role_for",
            return_value=CharacterLocation.Role.WORK,
        ), patch("locations.tasks.move_characters_tick.apply_async"):
            sync_character_location(self.character)

        self.character.refresh_from_db()
        self.assertTrue(self.character.is_moving)
        self.assertEqual(self.character.target_node, self.work_node)

    def test_moves_toward_home_at_night(self):
        with patch(
            "locations.services.schedule.target_role_for",
            return_value=CharacterLocation.Role.HOME,
        ), patch("locations.tasks.move_characters_tick.apply_async"):
            sync_character_location(self.character)

        self.character.refresh_from_db()
        self.assertTrue(self.character.is_moving)
        self.assertEqual(self.character.target_node, self.home_node)

    def test_noop_when_already_at_target(self):
        self.character.current_node = self.home_node
        self.character.save(update_fields=["current_node"])

        with patch(
            "locations.services.schedule.target_role_for",
            return_value=CharacterLocation.Role.HOME,
        ):
            sync_character_location(self.character)

        self.character.refresh_from_db()
        self.assertFalse(self.character.is_moving)
        self.assertIsNone(self.character.target_node)

    def test_noop_when_already_heading_there(self):
        # is_moving False but target_node already set to the destination -
        # e.g. leftover from a cancelled journey. Should not re-trigger.
        self.character.target_node = self.work_node
        self.character.save(update_fields=["target_node"])

        with patch.object(
            self.character, "set_destination"
        ) as mock_set_destination, patch(
            "locations.services.schedule.target_role_for",
            return_value=CharacterLocation.Role.WORK,
        ):
            sync_character_location(self.character)

        mock_set_destination.assert_not_called()

    def test_noop_when_is_moving(self):
        self.character.is_moving = True
        self.character.save(update_fields=["is_moving"])

        with patch("locations.services.schedule.target_role_for") as mock_target_role:
            sync_character_location(self.character)

        mock_target_role.assert_not_called()

    def test_noop_when_no_matching_character_location(self):
        CharacterLocation.objects.filter(
            character=self.character, role=CharacterLocation.Role.WORK
        ).delete()

        with patch(
            "locations.services.schedule.target_role_for",
            return_value=CharacterLocation.Role.WORK,
        ):
            sync_character_location(self.character)

        self.character.refresh_from_db()
        self.assertFalse(self.character.is_moving)

    def test_catches_value_error_from_set_destination(self):
        with patch(
            "locations.services.schedule.target_role_for",
            return_value=CharacterLocation.Role.WORK,
        ), patch.object(
            self.character, "set_destination", side_effect=ValueError("no path")
        ):
            sync_character_location(self.character)  # should not raise

        self.character.refresh_from_db()
        self.assertFalse(self.character.is_moving)


class CommuteTickTaskTest(TestCase):
    def setUp(self):
        self.centre = PopulationCentre.objects.create(
            name="Commute Village", location=Point(0, 0, srid=3857)
        )
        self.idle_character = Character.objects.create(
            first_name="Idle",
            location=Point(0, 0, srid=3857),
            population_centre=self.centre,
            is_moving=False,
        )
        self.moving_character = Character.objects.create(
            first_name="Moving",
            location=Point(0, 0, srid=3857),
            population_centre=self.centre,
            is_moving=True,
        )
        self.orphan_character = Character.objects.create(
            first_name="Orphan",
            location=Point(0, 0, srid=3857),
            is_moving=False,
        )

    def test_commute_tick_only_syncs_idle_village_assigned_characters(self):
        with patch("locations.services.schedule.sync_character_location") as mock_sync:
            commute_tick()

        synced_ids = {call.args[0].id for call in mock_sync.call_args_list}
        self.assertEqual(synced_ids, {self.idle_character.id})


def _make_centre_with_building(name, centre_point):
    """Minimal PopulationCentre + one Building, boundary sized like spawn_villages."""
    footprint = create_building_footprint(centre_point, min_size=10, max_size=20)
    boundary = footprint.buffer(10)
    centre = PopulationCentre.objects.create(
        name=name, location=centre_point, boundary=boundary
    )
    Building.objects.create(
        name=f"House of {name}",
        building_type="residential",
        location=centre_point,
        footprint=footprint,
        population_centre=centre,
    )
    return centre


class GenerateLandareaCommandTest(TestCase):
    def setUp(self):
        # Deterministic placement - the command's own randomness (direction/
        # margin) otherwise makes assertions flaky.
        random.seed(1234)

    def test_places_landarea_outside_the_boundary(self):
        centre = _make_centre_with_building("Landtest village", Point(0, 0, srid=3857))
        Character.objects.create(population_centre=centre)
        original_boundary = centre.boundary

        call_command("generate_landarea")

        landarea = LandArea.objects.get(population_centre=centre)
        self.assertEqual(landarea.subzones.filter(usage="crops").count(), 1)

        centre.refresh_from_db()
        # The LandArea is deliberately left outside the village boundary
        # rather than folded into it - the boundary polygon is untouched,
        # and there must be a real gap so it doesn't visually fuse onto the
        # boundary line.
        self.assertFalse(centre.boundary.intersects(landarea.boundary))
        self.assertEqual(centre.boundary.area, original_boundary.area)

    def test_avoids_overlapping_a_neighbouring_villages_boundary(self):
        centre_a = _make_centre_with_building("Village A", Point(0, 0, srid=3857))
        Character.objects.create(population_centre=centre_a)
        centre_b = _make_centre_with_building("Village B", Point(500, 0, srid=3857))
        Character.objects.create(population_centre=centre_b)

        call_command("generate_landarea")

        landarea_a = LandArea.objects.get(population_centre=centre_a)
        landarea_b = LandArea.objects.get(population_centre=centre_b)

        centre_b.refresh_from_db()
        centre_a.refresh_from_db()
        self.assertFalse(centre_b.boundary.intersects(landarea_a.boundary))
        self.assertFalse(centre_a.boundary.intersects(landarea_b.boundary))

    def test_skips_centre_with_no_residents(self):
        _make_centre_with_building("Empty village", Point(0, 0, srid=3857))

        call_command("generate_landarea")

        self.assertEqual(LandArea.objects.count(), 0)


class GenerateFieldsCommandTest(TestCase):
    def setUp(self):
        # Deterministic placement - generate_landarea's own randomness
        # (direction/margin) otherwise makes assertions flaky.
        random.seed(1234)

    def _make_crops_subzone(self, centre, subzone_point):
        """A crops Subzone with real geometry, as generate_landarea would produce."""
        land_area = LandArea.objects.create(
            name=f"{centre.name} Farmland",
            population_centre=centre,
            location=subzone_point,
            boundary=create_building_footprint(subzone_point),
            size=1.0,
        )
        return Subzone.objects.create(
            land_area=land_area,
            name=f"{centre.name} Farmland - Crops",
            usage="crops",
            boundary=create_building_footprint(subzone_point),
            location=subzone_point,
            size=1.0,
        )

    def test_attaches_shelter_and_fieldcrop_to_existing_crops_subzone(self):
        centre = _make_centre_with_building("Fieldtest village", Point(0, 0, srid=3857))
        subzone = self._make_crops_subzone(centre, Point(100, 100, srid=3857))

        call_command("generate_fields")

        shelter = Building.objects.get(
            building_type="field_shelter", population_centre=centre
        )
        self.assertTrue(shelter.nodes.filter(kind=Node.Kind.BUILDING_ENTRANCE).exists())
        self.assertTrue(shelter.nodes.filter(kind=Node.Kind.BUILDING).exists())
        # The shelter is house-scale, much smaller than the crop area it sits
        # beside.
        self.assertLess(shelter.footprint.area, subzone.boundary.area)

        crop = FieldCrop.objects.get(subzone=subzone)
        self.assertEqual(crop.shelter_building, shelter)
        self.assertEqual(crop.stage, FieldCrop.Stage.FALLOW)

    def test_skips_crops_subzone_that_already_has_a_fieldcrop(self):
        centre = _make_centre_with_building(
            "Already fielded village", Point(0, 0, srid=3857)
        )
        subzone = self._make_crops_subzone(centre, Point(100, 100, srid=3857))
        existing_shelter = Building.objects.create(
            name="Existing shelter",
            building_type="field_shelter",
            location=Point(100, 100, srid=3857),
            footprint=create_building_footprint(Point(100, 100, srid=3857)),
            population_centre=centre,
        )
        FieldCrop.objects.create(
            subzone=subzone,
            shelter_building=existing_shelter,
            stage=FieldCrop.Stage.GROWING,
        )

        call_command("generate_fields")

        self.assertEqual(FieldCrop.objects.filter(subzone=subzone).count(), 1)
        self.assertEqual(
            Building.objects.filter(
                building_type="field_shelter", population_centre=centre
            ).count(),
            1,
        )

    def test_does_nothing_when_no_crops_subzones_exist(self):
        _make_centre_with_building("No fields village", Point(0, 0, srid=3857))

        call_command("generate_fields")

        self.assertEqual(FieldCrop.objects.count(), 0)
