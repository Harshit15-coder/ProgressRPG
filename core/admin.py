from django.contrib import admin

from .models import GameSettings


@admin.register(GameSettings)
class GameSettingsAdmin(admin.ModelAdmin):
    list_display = ("free_timer_limit_seconds",)

    def has_add_permission(self, request):
        return not GameSettings.objects.exists()
