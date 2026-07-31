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
