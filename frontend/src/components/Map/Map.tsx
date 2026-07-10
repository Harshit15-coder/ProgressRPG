import { useEffect, useMemo, useState } from "react";
import Tooltip, { TooltipProvider } from "../Tooltip/Tooltip";
import { computeViewBox } from "./utils";
import styles from "./Map.module.scss";

interface GeoJSONFeatureProperties {
  feature_type?: string;
  name?: string;
  id?: number;
  [key: string]: unknown;
}

interface GeoJSONFeature {
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties?: GeoJSONFeatureProperties | null;
}

interface GeoJSON {
  features?: GeoJSONFeature[];
  bbox?: [number, number, number, number];
}

interface PopulationCentreMapProps {
  geojson?: GeoJSON | null;
  width?: number;
}

// Placeholder palette until real character sprites/art exist. Colour is
// picked deterministically from the character id so the same character
// always renders the same way, without persisting anything new.
const CHARACTER_COLOURS = [
  "#e07a5f",
  "#3d5a80",
  "#81b29a",
  "#f2cc8f",
  "#9d8189",
  "#588157",
];

function colourForCharacter(id: number | undefined): string {
  if (!Number.isFinite(id)) return CHARACTER_COLOURS[0];
  return CHARACTER_COLOURS[(id as number) % CHARACTER_COLOURS.length];
}

// Buildings carry full names like "House 2 of (Driftmoor village)" for
// backend bookkeeping; the tooltip only needs the plain building type.
const BUILDING_TYPE_LABELS: Record<string, string> = {
  residential: "House",
  granary: "Granary",
  inn: "Inn",
  mill: "Mill",
  bakery: "Bakery",
  communal: "Communal",
};

function polygonTooltipContent(properties: GeoJSONFeatureProperties | null | undefined): string | undefined {
  if (properties?.feature_type === "building") {
    const buildingType = properties?.building_type as string | undefined;
    return (buildingType && BUILDING_TYPE_LABELS[buildingType]) || "Building";
  }
  return properties?.name;
}

export default function PopulationCentreMap({
  geojson,
  width = 600,
}: PopulationCentreMapProps) {
  const features: GeoJSONFeature[] = geojson?.features || [];

  // Feature coordinates are plotted at their raw GIS values, inside a
  // viewBox derived straight from the bbox. Letting the SVG's own viewBox
  // scaling do the work (rather than pre-computing a pixel transform)
  // means the map always fills its container and scales/zooms correctly,
  // instead of floating at a fixed size inside a mismatched canvas.
  const viewBox = useMemo(() => {
    if (geojson?.bbox) {
      return computeViewBox(geojson.bbox);
    }
    return "0 0 100 100";
  }, [geojson]);

  // Browser page zoom fires a burst of resize events while the SVG's
  // rendered size is being recalculated; some browsers momentarily
  // mis-paint elements mid-resize, which - combined with the wander
  // transition below - reads as characters vanishing and then sliding in
  // from outside the boundary. Suppressing the transition for the
  // duration of any resize (zoom included) avoids that, without affecting
  // the normal slow-drift animation between polls.
  const [suppressTransition, setSuppressTransition] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      setSuppressTransition(true);
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setSuppressTransition(false), 200);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    // Local provider: map tooltips should appear immediately on hover
    // (markers are small and easy to overshoot), independent of the app's
    // default hover delay used elsewhere.
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
    <div
      className={styles.mapWrapper}
      style={{ maxWidth: `${width}px` }}
    >
      <svg
        className={styles.mapSvg}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
      {/* Polygons */}
      {features
        .filter((f) => f.geometry.type === "Polygon")
        .map((f, i) => {
          const coords = (f.geometry.coordinates as number[][][])[0];
          if (!coords?.length) return null;

        const points = coords
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
          .map(([x, y]) => `${x},${y}`)
          .join(" ");

        const isBoundary = f.properties?.feature_type === "boundary";
        const tooltipContent = polygonTooltipContent(f.properties);

        return (
          <Tooltip key={i} content={tooltipContent} disabled={!tooltipContent}>
            <polygon
              tabIndex={0}
              points={points}
              fill={isBoundary ? "none" : "#ddd"}
              stroke={isBoundary ? "#888" : "#333"}
              strokeWidth={isBoundary ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Tooltip>
        );
      })}

      {/* Lines */}
        {features
          .filter((f) => f.geometry.type === "LineString")
          .map((f, i) => {
            const coords = f.geometry.coordinates as number[][];
            if (!coords?.length) return null;

            const points = coords
              .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
              .map(([x, y]) => `${x},${y}`)
              .join(" ");

            const isPath = f.properties?.feature_type === "path";

            return (
              <Tooltip key={`line-${i}`} content={f.properties?.name} disabled={!f.properties?.name}>
                <polyline
                  tabIndex={0}
                  points={points}
                  fill="none"
                  stroke={isPath ? "#8b5a2b" : "#666"}
                  strokeWidth={isPath ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={isPath ? "4 3" : undefined}
                  opacity={isPath ? 0.45 : 1}
                />
              </Tooltip>
            );
          })}

      {/* Characters */}
      {features
        .filter((f) => f.properties?.feature_type === "character")
        .map((f) => {
          const coords = f.geometry.coordinates as number[];
          const [cx, cy] = coords;
          const colour = colourForCharacter(f.properties?.id);
          return (
            <Tooltip
              key={`char-${f.properties?.id}`}
              content={f.properties?.name}
              disabled={!f.properties?.name}
            >
              <g
                tabIndex={0}
                className={
                  suppressTransition
                    ? `${styles.characterMarker} ${styles.noTransition}`
                    : styles.characterMarker
                }
                transform={`translate(${cx}, ${cy})`}
              >
                {/* Placeholder person glyph: head + body, coloured per character.
                    Sized relative to a village ~100-200 GIS units wide, not
                    an arbitrary pixel canvas, so it stays a sensible size
                    (easy to spot and hover) regardless of village scale. */}
                <ellipse cx={0} cy={2.2} rx={2.2} ry={1.4} fill="rgba(0,0,0,0.15)" />
                <rect x={-1.8} y={-1.8} width={3.6} height={4} rx={1.2} fill={colour} stroke="#000" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                <circle cx={0} cy={-3.2} r={1.8} fill={colour} stroke="#000" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              </g>
            </Tooltip>
          );
        })}
      </svg>
    </div>
    </TooltipProvider>
  );
}
