// src/pages/MapPage.tsx
import React, { useEffect, useState } from "react";
import PopulationCentreMap from "../../components/Map/Map";
import { apiFetch } from "../../utils/api";

import styles from "./MapPage.module.scss";

// Close to move_characters_tick's 1s cadence (locations/tasks.py) so the map
// tracks actual journeys closely, without polling every single tick.
const MAP_POLL_INTERVAL_MS = 2000;

interface PopulationCentreListItem {
  id: number;
}

type PopulationCentreListResponse = { results?: PopulationCentreListItem[] } | PopulationCentreListItem[];

export default function MapPage(): React.ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [geojson, setGeojson] = useState<any>(null); // GeoJSON shape varies; typed loosely until Map is typed
  // Player-character linking isn't implemented yet (fetch_info deliberately
  // omits it), so the map view can't key off character.population_centre_id.
  // Instead it just picks the first population centre - fine while there's
  // only ever the one small seeded village.
  const [pcId, setPcId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolvePopulationCentre = async () => {
      try {
        const data = await apiFetch<PopulationCentreListResponse>("/population-centres/");
        const list = Array.isArray(data) ? data : data?.results ?? [];
        if (!cancelled && list.length > 0) setPcId(list[0].id);
      } catch (err) {
        console.error("Error fetching population centres:", err);
      }
    };

    resolvePopulationCentre();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pcId == null) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const data = await apiFetch(`/population-centres/${pcId}/map/`);
        if (!cancelled) setGeojson(data);
      } catch (err) {
        console.error("Error fetching map:", err);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, MAP_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [pcId]);

  return (
    <div className={styles.page}>
      {/* Visually hidden but still present - the page needs a heading for
          screen reader/landmark navigation even though this page has no
          visible title (the map itself is the content). */}
      <h1 className="sr-only">{geojson?.meta?.population_centre_name || "Village map"}</h1>
      <div className={styles.content}>
        {geojson ? (
          <PopulationCentreMap geojson={geojson} />
        ) : (
          "Loading..."
        )}
      </div>
    </div>
  );
}
