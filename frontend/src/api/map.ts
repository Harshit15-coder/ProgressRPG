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
