// src/pages/MapPage.tsx
import React, { useState } from "react";
import PopulationCentreMap from "../../components/Map/Map";
import {
  useInitialMapCentre,
  useMapViewport,
  useMapWorldBounds,
  usePopulationCentreId,
} from "../../hooks/useMap";

import styles from "./MapPage.module.scss";

export default function MapPage(): React.ReactElement {
  const { data: pcId } = usePopulationCentreId();
  // One-time fetch of the single seeded village's map, used only to give the
  // camera somewhere to start (see useInitialMapCentre) and to have
  // something on screen before the camera has settled on its first
  // viewport below.
  const { data: initialCentre } = useInitialMapCentre(pcId);

  const [bbox, setBbox] = useState<string | null>(null);
  const { data: viewportGeojson } = useMapViewport(bbox);
  const { data: worldBounds } = useMapWorldBounds();

  // Once the map's camera has fitted itself to the initial village and
  // reported its first viewport (Map.tsx's onViewportChange), the
  // bbox-scoped viewport poll becomes the source of truth for what's on
  // screen; until then, fall back to the one-time initial fetch.
  const geojson = viewportGeojson ?? initialCentre;

  return (
    <div className={styles.page}>
      {/* Visually hidden but still present - the page needs a heading for
          screen reader/landmark navigation even though this page has no
          visible title (the map itself is the content). */}
      <h1 className="sr-only">{geojson?.meta?.population_centre_name || "Village map"}</h1>
      <div className={styles.content}>
        {initialCentre ? (
          <PopulationCentreMap
            geojson={geojson}
            onViewportChange={setBbox}
            worldBounds={worldBounds?.bbox}
          />
        ) : (
          "Loading..."
        )}
      </div>
    </div>
  );
}
