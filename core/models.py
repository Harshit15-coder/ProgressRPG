from django.core.exceptions import ValidationError
from django.db import models


def image_upload_path(instance, filename):
    return f"images/{instance.__class__.__name__.lower()}/{filename}"


class ImageBase(models.Model):
    image = models.ImageField(upload_to=image_upload_path)
    alt_text = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class GameSettings(models.Model):
    free_timer_limit_seconds = models.IntegerField(default=1800)

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

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
