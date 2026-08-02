// src/api/map.ts
import { apiFetch } from "../utils/api";

interface PopulationCentreListItem {
  id: number;
}

type PopulationCentreListResponse =
  | { results?: PopulationCentreListItem[] }
  | PopulationCentreListItem[];

export async function fetchFirstPopulationCentreId(): Promise<number | null> {
  const data = await apiFetch<PopulationCentreListResponse>("/population-centres/");
  const list = Array.isArray(data) ? data : (data?.results ?? []);
  return list.length > 0 ? list[0].id : null;
}

export interface PopulationCentreSummary {
  id: number;
  name: string;
  location: [number, number];
}

type PopulationCentreSummaryResponse =
  | { results?: PopulationCentreSummary[] }
  | PopulationCentreSummary[];

// id/name/location for every seeded PopulationCentre - used to let the map
// jump the camera to any village on demand (see MapPage's "find village"
// button), not the heavier per-village payload PopulationCentreSerializer
// also nests (residents/buildings), which this endpoint returns too but
// callers here don't need.
export async function fetchPopulationCentres(): Promise<PopulationCentreSummary[]> {
  const data = await apiFetch<PopulationCentreSummaryResponse>("/population-centres/");
  const list = Array.isArray(data) ? data : (data?.results ?? []);
  // Guards against a stale/mismatched API response (e.g. an old serializer
  // still running, or a centre with no location for some other reason)
  // rather than handing MapPage a village it can't fly the camera to.
  return list.filter(
    (centre) =>
      Array.isArray(centre.location) &&
      centre.location.length === 2 &&
      centre.location.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

// GeoJSON shape varies by feature type; typed loosely until Map is typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fetchPopulationCentreMap(pcId: number): Promise<any> {
  return apiFetch(`/population-centres/${pcId}/map/`);
}

// Cross-village, bbox-bounded map data (MapViewportView, locations/views.py).
// `bbox` is "minx,miny,maxx,maxy" in raw EPSG:3857 metres.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fetchMapViewport(bbox: string): Promise<any> {
  return apiFetch(`/map/viewport/?bbox=${encodeURIComponent(bbox)}`);
}

interface MapWorldBoundsResponse {
  bbox: [number, number, number, number] | null;
}

// Padded bbox covering every seeded PopulationCentre (MapWorldBoundsView),
// used to derive the map's maxBounds so panning is limited to a generous
// area around the world instead of being unbounded.
export function fetchMapWorldBounds(): Promise<MapWorldBoundsResponse> {
  return apiFetch("/map/world-bounds/");
}
