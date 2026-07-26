from __future__ import annotations

import logging
from datetime import time

from django.utils import timezone

logger = logging.getLogger("general")

WORK_START = time(8, 0)
WORK_END = time(18, 0)

# Per-character transition boundaries are jittered by up to this many
# seconds either way, so the whole village doesn't flip home/work in lockstep.
MAX_STAGGER_SECONDS = 20 * 60


def _stagger_offset_seconds(character_id: int) -> int:
    """Deterministic per-character offset in [-MAX_STAGGER_SECONDS, MAX_STAGGER_SECONDS]."""
    span = 2 * MAX_STAGGER_SECONDS + 1
    return (character_id % span) - MAX_STAGGER_SECONDS


def target_role_for(character, now=None) -> str:
    """Which role (home/work) a character should currently be at, based on a
    fixed daily time window with a per-character stagger on the transition
    boundaries."""
    from character.models import CharacterLocation

    now = now or timezone.localtime()
    seconds_since_midnight = now.hour * 3600 + now.minute * 60 + now.second

    offset = _stagger_offset_seconds(character.id)
    work_start_seconds = WORK_START.hour * 3600 + WORK_START.minute * 60 + offset
    work_end_seconds = WORK_END.hour * 3600 + WORK_END.minute * 60 + offset

    if work_start_seconds <= seconds_since_midnight < work_end_seconds:
        return CharacterLocation.Role.WORK
    return CharacterLocation.Role.HOME


def sync_character_location(character) -> None:
    """Compare a character's current/target position against their schedule
    and, if they should be elsewhere, send them there via the existing
    Journey/set_destination movement stack. No-op if already there, already
    heading there, mid-journey, or no matching CharacterLocation/path exists.
    """
    from character.models import CharacterLocation
    from locations.models import Node

    if character.is_moving:
        return

    target_role = target_role_for(character)
    target_location = (
        CharacterLocation.objects.filter(
            character=character, role=target_role, is_primary=True
        )
        .select_related("location")
        .first()
    )
    if target_location is None:
        return

    entrance_node = Node.objects.filter(
        building=target_location.location, kind=Node.Kind.BUILDING_ENTRANCE
    ).first()
    if entrance_node is None:
        return

    if character.current_node_id == entrance_node.id:
        return
    if character.target_node_id == entrance_node.id:
        return

    try:
        character.set_destination(node=entrance_node)
    except ValueError:
        logger.info(
            "sync_character_location: could not route character %s to %s (%s)",
            character.id,
            target_location.location,
            target_role,
        )
