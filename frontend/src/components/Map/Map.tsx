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

type Ring = number[][];

// Several residents can be idle at the exact same point (e.g. everyone
// "home" shares their building's entrance/central node), which would
// otherwise render as one marker stacked on another - or, with a small ring
// around that point, as everyone standing in a tight formation. Instead,
// place each one at a random spot inside their building's actual footprint,
// so they read as scattered around the house rather than clustered at its
// door.
const BUILDING_INSET_RATIO = 0.18; // keep a little clear of the walls
const MAX_RANDOM_POINT_ATTEMPTS = 20;
// Markers are ~3.6 GIS units wide (see the person glyph below); keep
// housemates at least that far apart centre-to-centre so they don't overlap.
const MIN_CHARACTER_DISTANCE = 3.5;

// Fallback for characters whose point doesn't fall inside any building
// footprint (e.g. mid-journey, standing on a path) - a small ring-with-
// jitter around their shared point, same idea as before building-aware
// placement existed.
const CHARACTER_SCATTER_RADIUS = 2.4;
const CHARACTER_SCATTER_JITTER = 0.9;

// Small deterministic PRNG (mulberry32-ish) so the same character id always
// lands on the same-looking spot, instead of jumping around every poll.
function seededRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pointInPolygon(point: [number, number], ring: Ring): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonBounds(ring: Ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function distanceBetween(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Characters idling at a building's entrance node sit exactly on its
// footprint's boundary (the entrance is the midpoint of the building's
// longest wall) - not safely inside it. Ray-casting point-in-polygon tests
// like pointInPolygon are unreliable exactly on an edge (float precision can
// flip the parity either way), which was leaving some households matched to
// no footprint at all and falling back to the door-side scatter. Building
// footprints are currently always axis-aligned rectangles (see
// create_building_footprint in spawn_villages.py), so their bounding box
// *is* their shape - matching against the box with a small epsilon sidesteps
// the boundary-precision problem entirely.
function pointNearFootprint(
  point: [number, number],
  ring: Ring,
  epsilon = 0.05
): boolean {
  const { minX, minY, maxX, maxY } = polygonBounds(ring);
  const [x, y] = point;
  return (
    x >= minX - epsilon &&
    x <= maxX + epsilon &&
    y >= minY - epsilon &&
    y <= maxY + epsilon
  );
}

// Rejection-samples a deterministic point inside the polygon's bounding box
// (inset slightly so nobody renders flush against a wall) that's also at
// least MIN_CHARACTER_DISTANCE from every already-placed housemate. If
// nothing clears both within a few tries (small house, many residents),
// falls back to the best-spaced interior point it found rather than giving
// up - still inside the footprint, just as far from its housemates as
// possible. Returns null only if no point inside the polygon was found at
// all (odd/thin footprint shapes).
function randomPointInPolygon(
  ring: Ring,
  seed: number,
  existingPoints: [number, number][]
): [number, number] | null {
  const { minX, minY, maxX, maxY } = polygonBounds(ring);
  const insetX = (maxX - minX) * BUILDING_INSET_RATIO;
  const insetY = (maxY - minY) * BUILDING_INSET_RATIO;
  const loX = minX + insetX;
  const loY = minY + insetY;
  const hiX = maxX - insetX;
  const hiY = maxY - insetY;

  let bestCandidate: [number, number] | null = null;
  let bestCandidateDistance = -Infinity;

  for (let attempt = 0; attempt < MAX_RANDOM_POINT_ATTEMPTS; attempt++) {
    const point: [number, number] = [
      loX + seededRandom(seed + attempt * 2) * (hiX - loX),
      loY + seededRandom(seed + attempt * 2 + 1) * (hiY - loY),
    ];
    if (!pointInPolygon(point, ring)) continue;

    const nearestDistance = existingPoints.length
      ? Math.min(...existingPoints.map((p) => distanceBetween(point, p)))
      : Infinity;

    if (nearestDistance >= MIN_CHARACTER_DISTANCE) {
      return point;
    }
    if (nearestDistance > bestCandidateDistance) {
      bestCandidateDistance = nearestDistance;
      bestCandidate = point;
    }
  }
  return bestCandidate;
}

function scatterOffset(
  id: number | undefined,
  index: number,
  groupSize: number
): [number, number] {
  if (groupSize <= 1) return [0, 0];

  const seed = Number.isFinite(id) ? (id as number) : index;
  const baseAngle = (2 * Math.PI * index) / groupSize;
  const angleJitter = (seededRandom(seed * 2) - 0.5) * (Math.PI / groupSize);
  const radius =
    CHARACTER_SCATTER_RADIUS +
    (seededRandom(seed * 2 + 1) - 0.5) * CHARACTER_SCATTER_JITTER;
  const angle = baseAngle + angleJitter;

  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

interface PositionedCharacter {
  feature: GeoJSONFeature;
  cx: number;
  cy: number;
}

function buildingFootprintRings(features: GeoJSONFeature[]): Ring[] {
  return features
    .filter(
      (f) => f.properties?.feature_type === "building" && f.geometry.type === "Polygon"
    )
    .map((f) => (f.geometry.coordinates as number[][][])[0])
    .filter((ring): ring is Ring => Boolean(ring?.length));
}

// Groups characters by (rounded) coordinate - several residents idle in the
// same house share one point - then places each one at a random spot inside
// that house's footprint. Falls back to a small scatter around the shared
// point for characters not inside any building (e.g. mid-journey). Sorting
// each group by id keeps every character's spot stable from one poll to the
// next instead of jumping around.
function scatterCharacters(
  characterFeatures: GeoJSONFeature[],
  buildingFootprints: Ring[]
): PositionedCharacter[] {
  const groups = new Map<string, GeoJSONFeature[]>();
  for (const feature of characterFeatures) {
    const [x, y] = feature.geometry.coordinates as number[];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const key = `${x.toFixed(2)},${y.toFixed(2)}`;
    const group = groups.get(key);
    if (group) {
      group.push(feature);
    } else {
      groups.set(key, [feature]);
    }
  }

  const positioned: PositionedCharacter[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) => (Number(a.properties?.id) || 0) - (Number(b.properties?.id) || 0)
    );
    const [baseX, baseY] = group[0].geometry.coordinates as number[];
    const footprint = buildingFootprints.find((ring) =>
      pointNearFootprint([baseX, baseY], ring)
    );
    const placedInGroup: [number, number][] = [];

    group.forEach((feature, index) => {
      const id = Number(feature.properties?.id);
      const seed = Number.isFinite(id) ? id : index;
      const randomPoint = footprint
        ? randomPointInPolygon(footprint, seed, placedInGroup)
        : null;

      if (randomPoint) {
        placedInGroup.push(randomPoint);
        positioned.push({ feature, cx: randomPoint[0], cy: randomPoint[1] });
      } else {
        const [dx, dy] = scatterOffset(id, index, group.length);
        positioned.push({ feature, cx: baseX + dx, cy: baseY + dy });
      }
    });
  }

  // SVG paints later elements on top of earlier ones, and this viewBox's y
  // axis runs top-to-bottom same as screen space (no flip applied) - so
  // sorting ascending by cy means characters lower on screen paint last and
  // sit above the ones "behind" them, like a simple painter's algorithm.
  positioned.sort((a, b) => a.cy - b.cy);
  return positioned;
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
  field_shelter: "Field Shelter",
};

// Wheat gold, to read as farmland at a glance against the neutral grey used
// for every other building type.
const FIELD_FILL = "#E4C158";

function polygonTooltipContent(properties: GeoJSONFeatureProperties | null | undefined): string | undefined {
  if (properties?.feature_type === "building") {
    const buildingType = properties?.building_type as string | undefined;
    return (buildingType && BUILDING_TYPE_LABELS[buildingType]) || "Building";
  }
  if (properties?.feature_type === "subzone") {
    return properties?.usage === "crops" ? "Crops" : properties?.name;
  }
  return properties?.name;
}

export default function PopulationCentreMap({
  geojson,
  width = 600,
}: PopulationCentreMapProps) {
  const features: GeoJSONFeature[] = useMemo(
    () => geojson?.features || [],
    [geojson]
  );

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

  const buildingFootprints = useMemo(
    () => buildingFootprintRings(features),
    [features]
  );

  const positionedCharacters = useMemo(
    () =>
      scatterCharacters(
        features.filter((f) => f.properties?.feature_type === "character"),
        buildingFootprints
      ),
    [features, buildingFootprints]
  );

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
        const isCropSubzone =
          f.properties?.feature_type === "subzone" && f.properties?.usage === "crops";
        const tooltipContent = polygonTooltipContent(f.properties);

        return (
          <Tooltip key={i} content={tooltipContent} disabled={!tooltipContent}>
            <polygon
              tabIndex={0}
              points={points}
              fill={isBoundary ? "none" : isCropSubzone ? FIELD_FILL : "#ddd"}
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
      {positionedCharacters.map(({ feature: f, cx, cy }) => {
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
