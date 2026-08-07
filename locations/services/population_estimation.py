"""
Estimate how many residents a settlement's housing can plausibly support,
from residential building *geometry* alone - no Character rows required.

This is one step further back than economy.services.planning_services:
that layer answers "given a population, what infrastructure should exist";
this layer answers "given the residential buildings that exist (or will),
how big a population do they imply". It exists so a freshly-imported
settlement (see locations/services/watabou_import.py) - which has no real
residents yet, since population/place_characters/assign_workers all run
later in setup_world.py's pipeline - can still get a population figure to
feed planning_services.settlement_plan(population=...). Wiring that up is
a separate follow-up; this module only produces the estimate.
"""

import math

from locations.management.commands.populate_interiors import (
    BUILDING_INTERIORS_PROPORTIONS,
)

# Square metres of sleeping space assumed to house one resident - a shared/
# historical sleeping density (a room sleeps several people), not modern
# one-person-per-bedroom floor space. The single arbitrary number in this
# module; every estimate below derives from it plus the existing
# BUILDING_INTERIORS_PROPORTIONS sleeping-space split, so retuning either
# automatically flows through.
SLEEPING_AREA_PER_RESIDENT_SQM = 6.0


def _capacity_from_area(footprint_area: float) -> int:
    """
    Core calc both public entry points below delegate to: how many
    residents a residential footprint of this area could sleep, using the
    same "sleeping" proportion of a building's footprint that
    populate_interiors.generate_subspaces would carve out as an
    InteriorSpace - computed analytically so this works before interiors
    (or even a database row) exist.
    """
    sleeping_fraction = BUILDING_INTERIORS_PROPORTIONS["residential"]["sleeping"]
    return math.floor(
        footprint_area * sleeping_fraction / SLEEPING_AREA_PER_RESIDENT_SQM
    )


def residential_capacity(building) -> int:
    """
    Capacity of one real, saved residential Building. 0 for any other
    building_type, or a Building with no footprint.
    """
    if building.building_type != "residential" or not building.footprint:
        return 0
    return _capacity_from_area(building.footprint.area)


def population_capacity(population_centre) -> int:
    """
    Sum of residential_capacity over every residential Building already
    saved for a PopulationCentre - for settlements with real Building rows.
    Unlike estimate_population_from_footprint_areas below, this needs the
    buildings to already exist and be typed "residential".
    """
    return sum(
        residential_capacity(building)
        for building in population_centre.buildings.filter(building_type="residential")
    )


def estimate_population_from_footprint_areas(footprint_areas: list[float]) -> int:
    """
    Sum of _capacity_from_area over a raw list of footprint areas (square
    metres) - for watabou_import, which has building footprint Polygons
    before any Building row is created (see _assign_building_types, called
    ahead of the Building.objects.create loop), so it has no building_type
    to filter on yet.
    """
    return sum(_capacity_from_area(area) for area in footprint_areas)
