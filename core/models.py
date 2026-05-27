from django.core.exceptions import ValidationError
from django.db import models


def image_upload_path(instance, filename):
    return f"images/{instance.__class__.__name__.lower()}/{filename}"


class Image(models.Model):
    image = models.ImageField(upload_to=image_upload_path)
    alt_text = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.alt_text or str(self.image)


class GameSettings(models.Model):
    free_timer_limit_seconds = models.IntegerField(default=1800)
    daily_login_base_xp = models.IntegerField(default=10)
    daily_login_streak_step_xp = models.IntegerField(default=2)
    daily_login_max_xp = models.IntegerField(default=20)
    premium_activity_xp_multiplier = models.DecimalField(
        max_digits=5, decimal_places=2, default="2.00"
    )
    default_activity_xp_per_second = models.DecimalField(
        max_digits=5, decimal_places=4, default="1.0000"
    )
    activity_search_includes_tasks = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Game settings"
        verbose_name_plural = "Game settings"

    def __str__(self):
        return "Game settings"

    @classmethod
    def current(cls):
        settings, _created = cls.objects.get_or_create(pk=1)
        return settings

    def clean(self):
        if GameSettings.objects.exclude(pk=self.pk).exists():
            raise ValidationError("Only one GameSettings instance allowed")

        errors = {}
        if self.free_timer_limit_seconds < 0:
            errors["free_timer_limit_seconds"] = "Must be non-negative."
        if self.daily_login_base_xp < 0:
            errors["daily_login_base_xp"] = "Must be non-negative."
        if self.daily_login_streak_step_xp < 0:
            errors["daily_login_streak_step_xp"] = "Must be non-negative."
        if self.daily_login_max_xp < 0:
            errors["daily_login_max_xp"] = "Must be non-negative."
        if self.daily_login_max_xp < self.daily_login_base_xp:
            errors["daily_login_max_xp"] = "Must be >= daily_login_base_xp."
        if self.premium_activity_xp_multiplier <= 0:
            errors["premium_activity_xp_multiplier"] = "Must be > 0."
        if self.default_activity_xp_per_second <= 0:
            errors["default_activity_xp_per_second"] = "Must be > 0."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
