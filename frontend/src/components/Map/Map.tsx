import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Tooltip, { TooltipProvider } from "../Tooltip/Tooltip";
import { computeBaseRect, fieldFillFor, ViewBoxRect } from "./utils";
import { BuildingTooltipContent, CharacterTooltipContent } from "./MapTooltips";
import styles from "./Map.module.scss";

interface GeoJSONFeatureProperties {
  feature_type?: string;
  name?: string;
  id?: number;
  // Remaining waypoints (capped server-side, see JOURNEY_PATH_PREVIEW_LIMIT
  // in locations/serializers.py) for a character with an active journey;
  // null/absent for an idle character.
  path?: [number, number][] | null;
  effective_speed?: number;
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
  isWalking?: boolean;
}

interface WalkerState {
  pos: [number, number];
  path: [number, number][];
  speed: number;
}

// If the authoritative polled position lands further than this from where
// the client has locally walked a character to, snap straight to the poll
// instead of gliding - a drift this big means a reroute (e.g. a schedule-
// driven commute reversal) or a missed poll, not just normal interpolation
// lag, and trying to glide across it would read as the character cutting
// through walls/buildings to get there.
const WALKER_RESYNC_DRIFT_THRESHOLD = 3;

// Advances a walker's position along its remaining path by `distance` units,
// consuming as many waypoints as it reaches in one call rather than stopping
// at the first one short of the full distance - the same carry-over-leftover-
// budget approach as the backend's step_toward (locations/services/
// movement.py), so a character crossing several short segments in one frame
// doesn't visibly slow down at each waypoint.
function advanceWalker(walker: WalkerState, distance: number): void {
  let remaining = distance;
  while (remaining > 0 && walker.path.length > 0) {
    const [nx, ny] = walker.path[0];
    const dx = nx - walker.pos[0];
    const dy = ny - walker.pos[1];
    const segmentDistance = Math.hypot(dx, dy);

    if (segmentDistance <= remaining) {
      walker.pos = [nx, ny];
      walker.path = walker.path.slice(1);
      remaining -= segmentDistance;
    } else {
      const factor = segmentDistance === 0 ? 0 : remaining / segmentDistance;
      walker.pos = [walker.pos[0] + dx * factor, walker.pos[1] + dy * factor];
      remaining = 0;
    }
  }
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

// Pan/zoom scale is relative to the base (fully-zoomed-out) rect: 1 shows
// the whole padded bbox, smaller values zoom in. Clamped rather than
// unbounded so the map can't be zoomed out past its own content or zoomed
// in so far the view loses all context.
const MIN_ZOOM_SCALE = 0.08;
const MAX_ZOOM_SCALE = 1;
const WHEEL_ZOOM_FACTOR = 1.2;
const ZOOM_BUTTON_FACTOR = 1.4;

// A plain click (no movement) shouldn't be treated as the start of a pan -
// capturing the pointer immediately on every pointerdown meant even a
// stationary click briefly entered "dragging" state. Panning only kicks in
// once the pointer has actually moved past this threshold.
const DRAG_START_THRESHOLD_PX = 4;

interface PanZoomState {
  scale: number;
  // Centre of the current view, in the same coordinate space as feature
  // geometry (GIS units), not screen pixels.
  cx: number;
  cy: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function panZoomToRect(base: ViewBoxRect, view: PanZoomState): ViewBoxRect {
  const w = base.w * view.scale;
  const h = base.h * view.scale;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

// Panning is clamped to the base content bounds themselves (which already
// include everything - village, fields, paths - via the bbox), so a user
// can't drag the view off into empty space with nothing rendered.
function clampCentre(base: ViewBoxRect, cx: number, cy: number): [number, number] {
  return [
    clamp(cx, base.x, base.x + base.w),
    clamp(cy, base.y, base.y + base.h),
  ];
}

function polygonTooltipContent(
  properties: GeoJSONFeatureProperties | null | undefined
): React.ReactNode | undefined {
  if (properties?.feature_type === "building") {
    const buildingType = properties?.building_type as string | undefined;
    const label = (buildingType && BUILDING_TYPE_LABELS[buildingType]) || "Building";
    return (
      <BuildingTooltipContent
        label={label}
        buildingType={buildingType}
        workers={properties?.workers as number | null | undefined}
        residents={properties?.residents as number | null | undefined}
        goods={properties?.goods as { good_type?: string; display?: string }[] | null | undefined}
      />
    );
  }
  if (properties?.feature_type === "subzone") {
    if (properties?.usage !== "crops") return properties?.name;

    const stage = properties?.crop_stage as string | null | undefined;
    if (stage === "ready") return "Crops - Ready to harvest";
    if (stage === "growing") {
      const progress = properties?.crop_progress as number | null | undefined;
      const percent = Number.isFinite(progress) ? Math.round((progress as number) * 100) : null;
      return percent === null ? "Crops - Growing" : `Crops - Growing (${percent}%)`;
    }
    return "Crops - Fallow";
  }
  return properties?.name;
}

export default function PopulationCentreMap({
  geojson,
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
  const baseRect = useMemo<ViewBoxRect>(() => {
    if (geojson?.bbox) {
      return computeBaseRect(geojson.bbox);
    }
    return { x: 0, y: 0, w: 100, h: 100 };
  }, [geojson]);

  // Fields can sit far outside the village itself, so the base (fully
  // zoomed-out) view that fits everything renders the village tiny. Pan/zoom
  // lets the user zoom into the village (or the field) instead of forcing
  // one fixed view to fit both. Kept as separate state from baseRect so
  // panning/zooming persists across polls (baseRect is only reset when the
  // underlying bbox itself actually changes, e.g. switching villages).
  const [view, setView] = useState<PanZoomState>({
    scale: 1,
    cx: baseRect.x + baseRect.w / 2,
    cy: baseRect.y + baseRect.h / 2,
  });
  const lastBaseKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${baseRect.x},${baseRect.y},${baseRect.w},${baseRect.h}`;
    if (lastBaseKeyRef.current === key) return;
    lastBaseKeyRef.current = key;
    setView({
      scale: 1,
      cx: baseRect.x + baseRect.w / 2,
      cy: baseRect.y + baseRect.h / 2,
    });
  }, [baseRect]);

  const currentRect = useMemo(() => panZoomToRect(baseRect, view), [baseRect, view]);
  const viewBox = `${currentRect.x} ${currentRect.y} ${currentRect.w} ${currentRect.h}`;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startCx: number;
    startCy: number;
    captured: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const zoomAt = (
    clientX: number,
    clientY: number,
    factor: number
  ) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    setView((prev) => {
      const prevViewRect = panZoomToRect(baseRect, prev);
      // Point under the cursor, in GIS coordinates, before zooming.
      const focusX = prevViewRect.x + ((clientX - rect.left) / rect.width) * prevViewRect.w;
      const focusY = prevViewRect.y + ((clientY - rect.top) / rect.height) * prevViewRect.h;

      const nextScale = clamp(prev.scale / factor, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
      const nextW = baseRect.w * nextScale;
      const nextH = baseRect.h * nextScale;

      // Keep the same GIS point under the cursor after the zoom, not the
      // view centre - otherwise zooming in always drifts toward the middle
      // of the map instead of toward whatever the user pointed at.
      const nextX = focusX - ((clientX - rect.left) / rect.width) * nextW;
      const nextY = focusY - ((clientY - rect.top) / rect.height) * nextH;
      const [cx, cy] = clampCentre(baseRect, nextX + nextW / 2, nextY + nextH / 2);

      return { scale: nextScale, cx, cy };
    });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Wheel must be a non-passive native listener to preventDefault (stop
    // the page itself from scrolling while zooming the map) - React's
    // synthetic onWheel is attached passively and can't reliably do this.
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR;
      zoomAt(e.clientX, e.clientY, factor);
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRect]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Only the primary button/touch starts a drag - avoids hijacking
    // right-click and other pointer interactions.
    if (e.button !== 0) return;
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCx: view.cx,
      startCy: view.cy,
      captured: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    const svg = svgRef.current;
    if (!drag || !svg || drag.pointerId !== e.pointerId) return;

    if (!drag.captured) {
      const movedX = Math.abs(e.clientX - drag.startClientX);
      const movedY = Math.abs(e.clientY - drag.startClientY);
      if (Math.hypot(movedX, movedY) < DRAG_START_THRESHOLD_PX) return;
      drag.captured = true;
      setIsDragging(true);
      svg.setPointerCapture(e.pointerId);
    }

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const viewRect = panZoomToRect(baseRect, view);
    const dxSvg = -((e.clientX - drag.startClientX) / rect.width) * viewRect.w;
    const dySvg = -((e.clientY - drag.startClientY) / rect.height) * viewRect.h;
    const [cx, cy] = clampCentre(baseRect, drag.startCx + dxSvg, drag.startCy + dySvg);
    setView((prev) => ({ ...prev, cx, cy }));
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current?.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const handleZoomButton = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  const handleResetView = () => {
    setView({
      scale: 1,
      cx: baseRect.x + baseRect.w / 2,
      cy: baseRect.y + baseRect.h / 2,
    });
  };

  const buildingFootprints = useMemo(
    () => buildingFootprintRings(features),
    [features]
  );

  const characterFeatures = useMemo(
    () => features.filter((f) => f.properties?.feature_type === "character"),
    [features]
  );

  // Characters with an active journey (a non-empty `path` from the backend,
  // see CharacterPointFeatureSerializer) are animated by the walker loop
  // below instead of the idle scatter-inside-building placement, which only
  // makes sense for characters standing still.
  const walkingFeatures = useMemo(
    () => characterFeatures.filter((f) => (f.properties?.path?.length ?? 0) > 0),
    [characterFeatures]
  );
  const idleFeatures = useMemo(
    () => characterFeatures.filter((f) => (f.properties?.path?.length ?? 0) === 0),
    [characterFeatures]
  );

  // Per-character walker state (current interpolated position, remaining
  // path, speed), keyed by character id. Lives in a ref rather than state -
  // it's updated up to 60x/sec by the animation loop below, and driving that
  // through setState would re-render the whole map every frame.
  const walkersRef = useRef<Map<string, WalkerState>>(new Map());
  const walkerNodeRefs = useRef<Map<string, SVGGElement | null>>(new Map());

  // Resyncs each walking character's stored path/speed to the latest poll
  // whenever the underlying geojson changes. Only snaps the tracked position
  // itself if it's drifted far from the authoritative one (a reroute or a
  // missed poll) - otherwise the animation loop keeps walking smoothly from
  // wherever it currently has the character, picking up the fresh path.
  useEffect(() => {
    const activeIds = new Set<string>();

    for (const feature of walkingFeatures) {
      const id = String(feature.properties?.id);
      activeIds.add(id);
      const [x, y] = feature.geometry.coordinates as [number, number];
      const path = feature.properties?.path ?? [];
      const speed = Number(feature.properties?.effective_speed) || 0;

      const existing = walkersRef.current.get(id);
      if (!existing) {
        walkersRef.current.set(id, { pos: [x, y], path, speed });
        continue;
      }

      if (distanceBetween(existing.pos, [x, y]) > WALKER_RESYNC_DRIFT_THRESHOLD) {
        existing.pos = [x, y];
      }
      existing.path = path;
      existing.speed = speed;
    }

    // Characters no longer walking (arrived, or gone from the map) fall back
    // to idle placement next render - drop their stale walker state so a
    // later journey starts clean instead of resuming from wherever this one
    // left off.
    for (const id of walkersRef.current.keys()) {
      if (!activeIds.has(id)) walkersRef.current.delete(id);
    }
  }, [walkingFeatures]);

  // Drives smooth per-frame movement for walking characters between polls.
  // Writes positions straight to the DOM node (bypassing React state) so a
  // full re-render isn't needed every frame; positionedCharacters below also
  // reads the same walker ref for its initial/poll-driven render, so both
  // stay consistent with whatever the loop has most recently written.
  useEffect(() => {
    let frameId: number;
    let lastTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (lastTimestamp !== null) {
        const deltaSeconds = (timestamp - lastTimestamp) / 1000;
        walkersRef.current.forEach((walker, id) => {
          advanceWalker(walker, walker.speed * deltaSeconds);
          const node = walkerNodeRefs.current.get(id);
          if (node) {
            node.setAttribute(
              "transform",
              `translate(${walker.pos[0]}, ${walker.pos[1]})`
            );
          }
        });
      }
      lastTimestamp = timestamp;
      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const positionedCharacters = useMemo(() => {
    const idlePositioned = scatterCharacters(idleFeatures, buildingFootprints);
    const walkingPositioned: PositionedCharacter[] = walkingFeatures.map((feature) => {
      const id = String(feature.properties?.id);
      const [x, y] = feature.geometry.coordinates as [number, number];
      const pos = walkersRef.current.get(id)?.pos ?? [x, y];
      return { feature, cx: pos[0], cy: pos[1], isWalking: true };
    });

    // Same painter's-algorithm ordering as before: lower on screen (larger
    // cy) paints last so it sits above characters "behind" it.
    return [...idlePositioned, ...walkingPositioned].sort((a, b) => a.cy - b.cy);
  }, [idleFeatures, walkingFeatures, buildingFootprints]);

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
    <TooltipProvider>
    <div className={styles.mapWrapper}>
      <svg
        ref={svgRef}
        className={isDragging ? `${styles.mapSvg} ${styles.dragging}` : styles.mapSvg}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
              className={styles.focusableShape}
              points={points}
              fill={
                isBoundary
                  ? "none"
                  : isCropSubzone
                  ? fieldFillFor(
                      f.properties?.crop_stage as string | null | undefined,
                      f.properties?.crop_progress as number | null | undefined
                    )
                  : "#ddd"
              }
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
                  // Paths (roads) are rendered invisible (opacity 0, no
                  // tooltip content) but were still hit-testable, sitting on
                  // top of buildings/subzones wherever a road runs near them
                  // - a mouse jittering by a couple of pixels would flip the
                  // topmost hit target between the road and the shape
                  // beneath it, flickering that shape's tooltip open/closed.
                  // Since an invisible line has nothing worth hovering,
                  // taking it out of hit-testing entirely fixes that.
                  tabIndex={isPath ? undefined : 0}
                  className={isPath ? undefined : styles.focusableShape}
                  style={isPath ? { pointerEvents: "none" } : undefined}
                  points={points}
                  fill="none"
                  stroke={isPath ? "#8b5a2b" : "#666"}
                  strokeWidth={isPath ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={isPath ? "4 3" : undefined}
                  opacity={isPath ? 0 : 1}
                />
              </Tooltip>
            );
          })}

      {/* Characters */}
      {positionedCharacters.map(({ feature: f, cx, cy, isWalking }) => {
          const colour = colourForCharacter(f.properties?.id);
          const id = String(f.properties?.id);
          return (
            <Tooltip
              key={`char-${f.properties?.id}`}
              content={
                <CharacterTooltipContent
                  name={f.properties?.name as string | undefined}
                  home={f.properties?.home as string | null | undefined}
                  work={f.properties?.work as string | null | undefined}
                  hungerLabel={f.properties?.hunger_label as string | null | undefined}
                />
              }
              disabled={!f.properties?.name}
            >
              <g
                tabIndex={0}
                // Walking characters are driven by the rAF loop writing
                // straight to the DOM node every frame - a CSS transition
                // would fight those per-frame updates, so it's suppressed
                // for them the same way it already is during a resize.
                // Idle characters keep the transition so decorative
                // wandering between polls still reads as a drift, not a
                // teleport.
                className={
                  suppressTransition || isWalking
                    ? `${styles.characterMarker} ${styles.noTransition}`
                    : styles.characterMarker
                }
                transform={`translate(${cx}, ${cy})`}
                ref={
                  isWalking
                    ? (node) => {
                        if (node) {
                          walkerNodeRefs.current.set(id, node);
                        } else {
                          walkerNodeRefs.current.delete(id);
                        }
                      }
                    : undefined
                }
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
      <div className={styles.zoomControls}>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => handleZoomButton(ZOOM_BUTTON_FACTOR)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => handleZoomButton(1 / ZOOM_BUTTON_FACTOR)}
        >
          −
        </button>
        <button type="button" aria-label="Reset view" onClick={handleResetView}>
          reset
        </button>
      </div>
    </div>
    </TooltipProvider>
  );
}
