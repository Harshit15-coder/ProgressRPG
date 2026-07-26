import random

from celery import shared_task
from django.core.management import call_command


@shared_task
def move_characters_tick(time_delta=1.0):
    """Process character movement in batches. Avoid loading all movers into memory."""
    from character.models import Character
    from .models import Journey

    batch_size = 100
    movers_to_update = []
    has_more_movers = False

    # Process movers in batches to avoid memory overload
    for char in (
        Character.objects.filter(is_moving=True)
        .select_related(
            "current_node",
            "target_node",
        )
        .iterator(chunk_size=batch_size)
    ):
        # Check if there's an active journey for this character
        journey = Journey.objects.filter(character_id=char.id, status="active").first()

        if not journey:
            char.is_moving = False
            char.target_node = None
        else:
            char._journey = journey
            char.step_toward(time_delta)

        movers_to_update.append(char)

        # Bulk update in batches to avoid memory accumulation
        if len(movers_to_update) >= batch_size:
            Character.objects.bulk_update(
                movers_to_update,
                (
                    "location",
                    "current_node",
                    "target_node",
                    "is_moving",
                ),
            )
            movers_to_update = []

    # Update any remaining movers
    if movers_to_update:
        Character.objects.bulk_update(
            movers_to_update,
            (
                "location",
                "current_node",
                "target_node",
                "is_moving",
            ),
        )

    # Check if there are still moving characters
    if Character.objects.filter(is_moving=True).exists():
        move_characters_tick.apply_async(countdown=time_delta)


@shared_task
def wander_tick(fraction=0.2):
    """
    Decorative-only movement for the village view: each tick, nudges a random
    subset of idle characters within their village boundary (linked or not -
    this is purely visual, not tied to gameplay). Deliberately independent of
    move_characters_tick/Journey - does not touch is_moving/current_node, so
    it can't interfere with the travel/pathfinding system. Only a subgroup
    moves per tick so the whole village doesn't shuffle in lockstep.
    """
    from character.models import Character
    from .services.wander import wander

    candidate_ids = list(
        Character.objects.filter(
            is_moving=False, population_centre__isnull=False
        ).values_list("id", flat=True)
    )
    if not candidate_ids:
        return

    sample_size = max(1, round(len(candidate_ids) * fraction))
    chosen_ids = random.sample(candidate_ids, min(sample_size, len(candidate_ids)))

    for character in Character.objects.filter(id__in=chosen_ids).select_related(
        "population_centre"
    ):
        wander(character)


@shared_task
def commute_tick():
    """
    Sweep idle, village-assigned characters and send anyone who should be
    home/at work but isn't (and isn't already heading there) via the
    existing Journey/set_destination movement stack. Replaces wander_tick
    as the scheduled beat task - see locations.services.schedule.
    """
    from character.models import Character
    from .services.schedule import sync_character_location

    for character in (
        Character.objects.filter(is_moving=False, population_centre__isnull=False)
        .select_related("current_node", "target_node")
        .iterator(chunk_size=100)
    ):
        sync_character_location(character)


@shared_task
def spawn_villages_task():
    call_command("spawn_villages")


@shared_task
def spawn_characters_task():
    call_command("spawn_characters")


@shared_task
def populate_interiors_task():
    call_command("populate_interiors")


@shared_task
def place_characters_task():
    call_command("place_characters")


@shared_task
def generate_landarea_task(overwrite=False):
    call_command("generate_landarea", overwrite=overwrite)
