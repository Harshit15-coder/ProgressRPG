// src/pages/VillagePage.tsx
import React, { useEffect, useState } from "react";
import PopulationCentreMap from "../../components/Map/Map";
import { useGame } from "../../hooks/useGame";
import { apiFetch } from "../../utils/api";
import ProgressBar from "../../components/ProgressBar/ProgressBar";
import PopulationCentreResidents from "../../components/PopulationCentreResidents/PopulationCentreResidents";

import styles from "./VillagePage.module.scss";

export default function VillagePage(): React.ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [geojson, setGeojson] = useState<any>(null); // GeoJSON shape varies; typed loosely until Map is typed
  const { character, populationCentre, fetchPopulationCentre } = useGame();
  const pcId = character?.population_centre_id;
  //console.log("character:", character);
  //console.log("pcId:", pcId);

  useEffect(() => {
    if (pcId == null) return;

    const fetchData = async () => {
      try {
        const data = await apiFetch(`/population-centres/${pcId}/map/`);
        setGeojson(data);
      } catch (err) {
        console.error("Error fetching map:", err);
      }
    };

    fetchData();
  }, [pcId]);

  useEffect(() => {
    if (pcId == null) return;
    fetchPopulationCentre(pcId);
  }, [pcId, fetchPopulationCentre]);

  //console.log("village:", populationCentre);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>{geojson?.meta?.population_centre_name || "Village"}</h1>
      </div>

      {populationCentre && (
        <div className={styles.progressInfo}>
          <p>
            Current State: <strong>{populationCentre.state}</strong>
          </p>

          <ProgressBar
            value={populationCentre.progress || 0}
            label="Village progress to next state"
          />
        </div>
      )}

      <div className={styles.content}>
        {geojson ? (
          <PopulationCentreMap geojson={geojson} width={650} height={650} />
        ) : (
          "Loading..."
        )}
      </div>

      {populationCentre && (
        <div className={styles.residentsSection}>
          <PopulationCentreResidents
            residents={populationCentre.residents}
            linkedCharacterId={character?.id}
          />
        </div>
      )}
    </div>
  );
}
