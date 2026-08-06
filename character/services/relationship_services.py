from __future__ import annotations

import logging

from django.core.exceptions import ValidationError
from django.db import transaction

logger = logging.getLogger("general")
logger_errors = logging.getLogger("errors")


@transaction.atomic
def relationship_create(relationship_type, members, variant=""):
    """
    Create a CharacterRelationship of `relationship_type` with `members` (an
    iterable of (character, role) pairs) and validate that the finished
    relationship meets every role's minimum participant count.

    This whole-structure check is what individual CharacterRelationshipMembership
    saves can't do on their own (they're created one at a time, so a
    relationship is often transiently incomplete mid-construction) - this is
    the sanctioned, all-or-nothing way to build a relationship; the
    transaction rolls back if the finished structure is invalid.
    """
    from character.models import (
        CharacterRelationship,
        CharacterRelationshipMembership,
        RelationshipRole,
        RelationshipType,
        RELATIONSHIP_SPECS,
    )

    relationship_type = RelationshipType(relationship_type)
    spec = RELATIONSHIP_SPECS[relationship_type]

    relationship = CharacterRelationship.objects.create(
        relationship_type=relationship_type, variant=variant
    )

    counts = {}
    for character, role in members:
        role = RelationshipRole(role)
        CharacterRelationshipMembership.objects.create(
            relationship=relationship, character=character, role=role
        )
        counts[role] = counts.get(role, 0) + 1

    missing = [
        role.value
        for role, (min_count, _max_count) in spec.roles.items()
        if counts.get(role, 0) < min_count
    ]
    if missing:
        raise ValidationError(
            f"{relationship_type} relationship is missing required role(s): "
            f"{', '.join(missing)}."
        )

    return relationship


def relationship_get_related_characters(character, relationship_type, role=None):
    """
    Other characters sharing a `relationship_type` relationship with
    `character`, optionally restricted to those holding `role` in it.
    """
    from character.models import Character

    filters = {
        "characterrelationshipmembership__relationship__relationship_type": relationship_type,
        "characterrelationshipmembership__relationship__characters": character,
    }
    if role is not None:
        filters["characterrelationshipmembership__role"] = role

    return Character.objects.filter(**filters).exclude(pk=character.pk).distinct()


def relationship_get_parents(character):
    from character.models import RelationshipRole, RelationshipType

    return relationship_get_related_characters(
        character, RelationshipType.PARENT_CHILD, role=RelationshipRole.PARENT
    )


def relationship_get_children(character):
    from character.models import RelationshipRole, RelationshipType

    return relationship_get_related_characters(
        character, RelationshipType.PARENT_CHILD, role=RelationshipRole.CHILD
    )


def relationship_get_siblings(character):
    from character.models import RelationshipType

    return relationship_get_related_characters(character, RelationshipType.SIBLING)


def relationship_get_relationships_of_type(character, relationship_type):
    from character.models import CharacterRelationship

    return CharacterRelationship.objects.filter(
        relationship_type=relationship_type, characters=character
    ).distinct()
