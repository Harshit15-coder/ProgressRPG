from datetime import timedelta, datetime, time
from django.utils import timezone
import logging
from progression.models import CharacterActivity

logger = logging.getLogger("general")


def window_for_date(date, behaviour):
    # reuse Behaviour logic (returns dawn, dusk, next_dawn); use it to get the sleep tail
    dawn, dusk, next_dawn = behaviour._day_window(date)
    tz = timezone.get_current_timezone()
    window_start = timezone.make_aware(datetime.combine(date, time(0, 0)), tz)
    # include sleep tail so checks match generate_day's delete logic
    # sleep_end is the tail returned via next_dawn for the following day; generate_day uses its computed sleep_end
    # fallback to end-of-day if you don't want the tail
    window_end = (
        next_dawn  # or timezone.make_aware(datetime.combine(date, time(23,59,59)), tz)
    )
    return window_start, window_end


def activities_exist_for_date(character, date):
    window_start, window_end = window_for_date(date, character.behaviour)
    return CharacterActivity.objects.filter(
        character=character,
        scheduled_start__lt=window_end,
        scheduled_end__gt=window_start,
    ).exists()


def ensure_day_activities(character, date, create_if_missing=True):
    if not activities_exist_for_date(character, date) and create_if_missing:
        # generate_day is atomic and does cleanup/select_for_update internally
        return character.behaviour.generate_day(date)
    return None


WORK_ACTIVITIES_BY_BUILDING_TYPE = {
    "field_shelter": [
        "watering crops",
        "weeding the fields",
        "planting seedlings",
        "harvesting wheat",
        "threshing grain",
        "tending the garden",
        "scaring off crows",
        "digging drainage ditches",
        "checking traps",
        "clearing debris",
    ],
    "granary": [
        "carrying supplies to storage",
        "organising the storeroom",
        "counting provisions",
        "sorting harvested goods",
        "maintaining toolshed",
        "writing inventory records",
    ],
    "mill": [
        "grinding grain into flour",
        "hauling water from the well",
        "repairing carts",
        "maintaining toolshed",
        "sharpening blades",
    ],
    "bakery": [
        "baking bread",
        "cooking a meal",
        "preserving food",
        "smoking meat",
        "cleaning the hearth",
    ],
    "inn": [
        "cooking a meal",
        "cleaning the hearth",
        "sweeping the yard",
        "mending clothes",
        "delivering goods to neighbours",
    ],
    "communal": [
        "feeding the chickens",
        "collecting eggs",
        "milking the goats",
        "cleaning the animal pens",
        "repairing a fence",
        "mending tools",
        "chopping firewood",
        "stacking firewood",
        "patching a roof",
        "oiling leather gear",
        "spinning wool",
        "weaving cloth",
        "tanning hides",
        "maintaining pathways",
        "repairing nets",
    ],
    "default": [
        "feeding the chickens",
        "collecting eggs",
        "chopping firewood",
        "stacking firewood",
        "hauling water from the well",
        "mending tools",
        "sweeping the yard",
        "mending clothes",
        "clearing debris",
        "delivering goods to neighbours",
    ],
}


def work_activities_for(character):
    """
    Flavor-text pool for a character's "work" CharacterActivity blocks,
    keyed by their actual job (via CharacterLocation role=WORK) rather than
    a single generic list - falls back to "default" if unemployed or their
    workplace's building_type has no dedicated list.
    """
    from character.models import CharacterLocation

    work_location = (
        CharacterLocation.objects.filter(
            character=character,
            role=CharacterLocation.Role.WORK,
            is_primary=True,
        )
        .select_related("location")
        .first()
    )

    building_type = work_location.location.building_type if work_location else None
    return WORK_ACTIVITIES_BY_BUILDING_TYPE.get(
        building_type, WORK_ACTIVITIES_BY_BUILDING_TYPE["default"]
    )
