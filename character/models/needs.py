from django.db import models


class CharacterNeeds(models.Model):
    """
    Per-character upkeep tracking - currently just hunger, fed by the daily
    bread-consumption tick (economy.tasks.advance_bread_consumption_tick).
    One-to-one and signal-created, same shape as Behaviour.
    """

    character = models.OneToOneField(
        "character.Character", on_delete=models.CASCADE, related_name="needs"
    )
    hunger = models.FloatField(default=0)
    last_fed_on = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"CharacterNeeds({self.character_id}, hunger={self.hunger:.1f})"
