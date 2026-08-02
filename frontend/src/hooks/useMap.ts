// src/hooks/useMap.ts
import { useQuery } from "@tanstack/react-query";
import {
  fetchFirstPopulationCentreId,
  fetchMapViewport,
  fetchMapWorldBounds,
  fetchPopulationCentreMap,
  fetchPopulationCentres,
} from "../api/map";

// Close to move_characters_tick's 1s cadence (locations/tasks.py) so the map
// tracks actual journeys closely, without polling every single tick.
export const MAP_POLL_INTERVAL_MS = 2000;

// Player-character linking isn't implemented yet (fetch_info deliberately
// omits it), so the map view can't key off character.population_centre_id.
// Instead it just picks the first population centre - fine while there's
// only ever the one small seeded village.
export function usePopulationCentreId() {
  return useQuery({
    queryKey: ["population-centres", "first-id"],
    queryFn: fetchFirstPopulationCentreId,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// One-shot (not polled) fetch of the single existing village's map, used
// only to derive where the camera should start (see design decision #6 in
// the map-viewport plan: initial view centres on the single seeded
// PopulationCentre until multiple villages/player-linking exist). Once the
// camera exists, all ongoing data comes from useMapViewport below instead.
export function useInitialMapCentre(pcId: number | null | undefined) {
  return useQuery({
    queryKey: ["map", "population-centre", "initial-centre", pcId],
    queryFn: () => fetchPopulationCentreMap(pcId as number),
    enabled: pcId != null,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// Cross-village map data bounded by the camera's current viewport. `bbox` is
// a quantized "minx,miny,maxx,maxy" string (see quantizeBbox in
// components/Map/utils.ts) so sub-pixel camera jitter doesn't churn the
// query key, and is null while the map hasn't settled on an initial camera
// yet (query is disabled until then).
export function useMapViewport(bbox: string | null) {
  return useQuery({
    queryKey: ["map", "viewport", bbox],
    queryFn: () => fetchMapViewport(bbox as string),
    enabled: bbox != null,
    refetchInterval: MAP_POLL_INTERVAL_MS,
    staleTime: 5 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: (previousData: unknown) => previousData,
  });
}

// Padded bbox covering every seeded PopulationCentre, used to derive
// MapLibre's maxBounds (see design decision #6 in the map-viewport plan).
// One-shot per session rather than polled - the world's overall extent
// changes far more slowly than any individual viewport's contents.
export function useMapWorldBounds() {
  return useQuery({
    queryKey: ["map", "world-bounds"],
    queryFn: fetchMapWorldBounds,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

// id/name/location for every seeded PopulationCentre - lets MapPage's "find
// village" button cycle the camera through all of them. One-shot like
// useMapWorldBounds: which villages exist changes far more slowly than
// anything the map polls for.
export function usePopulationCentres() {
  return useQuery({
    queryKey: ["population-centres", "all"],
    queryFn: fetchPopulationCentres,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
