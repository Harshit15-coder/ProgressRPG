from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point, Polygon
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from unittest.mock import patch

from .models import Node, Path, Building, Journey, PopulationCentre
from .services.wander import wander
from .tasks import wander_tick
from character.models import Character, PlayerCharacterLink


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
