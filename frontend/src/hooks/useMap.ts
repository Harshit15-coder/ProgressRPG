// src/hooks/useMap.ts
import { useQuery } from "@tanstack/react-query";
import { fetchFirstPopulationCentreId, fetchPopulationCentreMap } from "../api/map";

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
    staleTime: Infinity,
  });
}

export function usePopulationCentreMap(pcId: number | null | undefined) {
  return useQuery({
    queryKey: ["map", "population-centre", pcId],
    queryFn: () => fetchPopulationCentreMap(pcId as number),
    enabled: pcId != null,
    refetchInterval: MAP_POLL_INTERVAL_MS,
    // A slow/failed poll shouldn't clear what's already on screen - keep
    // rendering the last good geojson until a new one actually arrives.
    placeholderData: (previousData: unknown) => previousData,
  });
}
