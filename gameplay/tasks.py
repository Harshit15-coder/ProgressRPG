from celery import shared_task
from django.core.cache import cache
from django.utils import timezone

from character.models import PlayerCharacterLink
from .models import Quest, XpModifier

DISCONNECT_TASK_CACHE_KEY = "disconnect_task:{player_id}"


@shared_task(bind=True)
def auto_complete_timer_on_disconnect(self, player_id: int):
    """
    Complete an active activity timer for a player who disconnected without
    reconnecting within the grace window. Awards XP for elapsed time.
    Revoked by TimerConsumer.connect() if the player reconnects in time.
    """
    from .models import ActivityTimer

    stored_task_id = cache.get(DISCONNECT_TASK_CACHE_KEY.format(player_id=player_id))
    if stored_task_id != self.request.id:
        return "superseded"

    try:
        timer = ActivityTimer.objects.select_related("player", "activity").get(
            player_id=player_id
        )
    except ActivityTimer.DoesNotExist:
        return "no_timer"

    if timer.status != "active":
        cache.delete(DISCONNECT_TASK_CACHE_KEY.format(player_id=player_id))
        return f"skipped:{timer.status}"

    timer.complete(completion_source="auto")
    cache.delete(DISCONNECT_TASK_CACHE_KEY.format(player_id=player_id))
    return "completed"


@shared_task
def update_quest_availability():
    now = timezone.now()
    quests = Quest.objects.all()
    for quest in quests:
        if quest.start_date and quest.start_date <= now:
            quest.is_active = True

        if quest.end_date and quest.end_date < now:
            quest.is_active = False

        if quest.start_date or quest.end_date:
            quest.save()
    return "Successfully updated quest availability"


@shared_task(bind=True)
def end_online_boost(self, modifier_id: int):
    now = timezone.now()
    mod = XpModifier.objects.select_related("character__behaviour").get(id=modifier_id)

    # Superseded / cancelled
    if mod.task_id != self.request.id:
        return "superseded"
    if mod.ends_at is None or mod.ends_at > now or not mod.is_active:
        return "cancelled"

    # End + side effects
    mod.is_active = False
    mod.task_id = None
    mod.ends_at = now
    mod.save(update_fields=["is_active", "task_id", "ends_at"])

    behaviour = getattr(mod.character, "behaviour", None)
    if behaviour:
        behaviour.interrupt_current_activity()
    return "ended"
