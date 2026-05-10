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
