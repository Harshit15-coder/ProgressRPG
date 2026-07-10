import math
import random

from django.contrib.gis.geos import Point


def wander(character, radius: float = 15.0, max_attempts: int = 10) -> bool:
    """
    Nudge a character's location a small random step within its population
    centre's boundary. Purely decorative: unlike movement.py's journeys, this
    does not touch is_moving/current_node/target_node or create a Journey, so
    it stays independent of the pathfinding/travel system.
    """
    centre = character.population_centre
    boundary = getattr(centre, "boundary", None) if centre else None
    origin = character.location

    if boundary is None or origin is None:
        return False

    for _ in range(max_attempts):
        angle = random.uniform(0, 2 * math.pi)
        step = random.uniform(0, radius)
        candidate = Point(
            origin.x + step * math.cos(angle),
            origin.y + step * math.sin(angle),
            srid=origin.srid,
        )
        if boundary.contains(candidate):
            character.location = candidate
            character.save(update_fields=["location"])
            return True

    return False
