from django.contrib import admin

from .models import GameSettings, Image


@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ("__str__", "alt_text", "created_at")
    search_fields = ("alt_text",)


@admin.register(GameSettings)
class GameSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "__str__",
        "free_timer_limit_seconds",
        "daily_login_base_xp",
        "daily_login_max_xp",
        "premium_activity_xp_multiplier",
        "trial_period_days",
    )
    fieldsets = (
        ("Timer", {"fields": ("free_timer_limit_seconds",)}),
        (
            "Daily login XP",
            {
                "fields": (
                    "daily_login_base_xp",
                    "daily_login_streak_step_xp",
                    "daily_login_max_xp",
                )
            },
        ),
        (
            "Activity XP",
            {
                "fields": (
                    "default_activity_xp_per_second",
                    "premium_activity_xp_multiplier",
                    "activity_search_includes_tasks",
                )
            },
        ),
        ("Stripe", {"fields": ("trial_period_days",)}),
    )

    def has_add_permission(self, request):
        return not GameSettings.objects.exists()
