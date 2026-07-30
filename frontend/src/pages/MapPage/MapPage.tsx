// src/pages/MapPage.tsx
import React from "react";
import PopulationCentreMap from "../../components/Map/Map";
import { usePopulationCentreId, usePopulationCentreMap } from "../../hooks/useMap";

import styles from "./MapPage.module.scss";

export default function MapPage(): React.ReactElement {
  const { data: pcId } = usePopulationCentreId();
  const { data: geojson } = usePopulationCentreMap(pcId);

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
