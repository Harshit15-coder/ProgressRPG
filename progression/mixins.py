# progression/mixins.py
from typing import Any, TypeVar
from collections.abc import Iterable

from django.db import models
from django.db.models import QuerySet
from django.utils import timezone

T = TypeVar("T", bound="PlayerOwnedMixin")


class PlayerOwnedMixin(models.Model):
    """
    Provides common helper methods for models where players
    can perform CRUD operations.
    """

    class Meta:
        abstract = True

    def rename(self, new_name: str):
        """Update the instance's name field."""
        if hasattr(self, "name"):
            self.name = new_name
            self.save(update_fields=["name"])
        return self

    def to_dict(self, fields: Iterable[str] | None = None) -> dict[str, Any]:
        """
        Return a dictionary representation of the instance.
        If `fields` is provided, only include those fields.
        """
        data = {}
        for field in self._meta.fields:
            fname = field.name
            if fields and fname not in fields:
                continue
            data[fname] = getattr(self, fname)
        return data

    @classmethod
    def list_fields(cls: type[T]) -> list[str]:
        """Return all field names for easier introspection."""
        return [f.name for f in cls._meta.fields]

    @classmethod
    def for_player(cls: type[T], player) -> "QuerySet[T]":
        return cls._default_manager.filter(player=player)

    @classmethod
    def for_player_ids(cls: type[T], player) -> list[int]:
        return list(
            cls._default_manager.filter(player=player).values_list("id", flat=True)
        )

    def touch(self):
        """Update the last_updated timestamp if present."""
        if hasattr(self, "last_updated"):
            self.last_updated = timezone.now()
            self.save(update_fields=["last_updated"])
        return self
