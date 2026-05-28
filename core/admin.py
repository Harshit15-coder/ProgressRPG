from django.contrib import admin

from .models import GameSettings, Image


@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ("__str__", "alt_text", "created_at")
    search_fields = ("alt_text",)


@admin.register(GameSettings)
class GameSettingsAdmin(admin.ModelAdmin):
    list_display = ("free_timer_limit_seconds",)

    def has_add_permission(self, request):
        return not GameSettings.objects.exists()
