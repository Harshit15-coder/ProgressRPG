from django.contrib.gis.geos import Point
from django.test import TestCase

from locations.models import Node, Path, Journey
from locations.serializers import (
    CharacterPointFeatureSerializer,
    JOURNEY_PATH_PREVIEW_LIMIT,
)
from character.models import Character


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
            given_name="Idle",
            location=Point(0, 0, srid=3857),
            current_node=self.node_a,
            movement_speed=2.5,
        )

        props = CharacterPointFeatureSerializer(character).data["properties"]

        self.assertIsNone(props["path"])
        self.assertEqual(props["effective_speed"], 2.5)

    def test_moving_character_exposes_remaining_path_and_speed(self):
        character = Character.objects.create(
            given_name="Walker",
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
            given_name="LongHauler",
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
