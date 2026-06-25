import { useMemo } from "react";
import { computeTransformFromBBox } from "./utils";
import styles from "./Map.module.scss";

interface GeoJSONFeatureProperties {
  feature_type?: string;
  name?: string;
  icon?: string;
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
  height?: number;
}

export default function PopulationCentreMap({
  geojson,
  width = 600,
  height = 600,
}: PopulationCentreMapProps) {
  const features: GeoJSONFeature[] = geojson?.features || [];

  // ---- 1. Compute bounds from pc boundary ----
  // useMemo may return undefined if bbox is absent — destructure with defaults
  const transform = useMemo(() => {
    if (geojson?.bbox) {
      return computeTransformFromBBox(geojson.bbox, width, height);
    }
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }, [geojson, width, height]);

  const { scale, offsetX, offsetY } = transform;

  // ---- 2. Transform coordinates ----
  const transformPoint = (x: number, y: number): [number, number] => [
    x * scale + offsetX,
    y * scale + offsetY,
  ];

  // ---- 3. Render ----
  return (
    <div
      className={styles.mapWrapper}
      style={{ maxWidth: `${width}px`, height: `${height}px` }}
    >
      <svg
        className={styles.mapSvg}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid meet"
      >
      {/* Polygons */}
      {features
        .filter((f) => f.geometry.type === "Polygon")
        .map((f, i) => {
          const coords = (f.geometry.coordinates as number[][][])[0];
          if (!coords?.length) return null;

        const transformed = coords
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
          .map(([x, y]) => transformPoint(x, y).join(","))
          .join(" ");

        const isBoundary = f.properties?.feature_type === "boundary";

        return (
          <polygon
            key={i}
            points={transformed}
            fill={isBoundary ? "none" : "#ddd"}
            stroke={isBoundary ? "#888" : "#333"}
            strokeWidth={isBoundary ? 2.5 : 1}
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <title>{f.properties?.name}</title>
          </polygon>
        );
      })}

      {/* Lines */}
        {features
          .filter((f) => f.geometry.type === "LineString")
          .map((f, i) => {
            const coords = f.geometry.coordinates as number[][];
            if (!coords?.length) return null;

            const transformed = coords
              .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
              .map(([x, y]) => transformPoint(x, y).join(","))
              .join(" ");

            const isPath = f.properties?.feature_type === "path";

            return (
              <polyline
                key={`line-${i}`}
                points={transformed}
                fill="none"
                stroke={isPath ? "#8b5a2b" : "#666"}
                strokeWidth={isPath ? 3 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0} // hide paths for now
              >
                <title>{f.properties?.name}</title>
              </polyline>
            );
          })}

      {/* Points */}
      {features
        .filter((f) => f.geometry.type === "Point")
        .map((f, i) => {
          const coords = f.geometry.coordinates as number[];
          const [cx, cy] = transformPoint(coords[0], coords[1]);
          return (
            <circle
              key={`pt-${i}`}
              cx={cx}
              cy={cy}
              r={7}
              fill={f.properties?.icon || "red"}
              stroke="#000"
              strokeWidth={1}
            >
              <title>{f.properties?.name}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
