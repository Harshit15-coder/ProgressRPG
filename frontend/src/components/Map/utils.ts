
/**
 * Build an SVG viewBox string directly from a GeoJSON bbox, with a little
 * breathing room around the edges. Plotting features at their raw
 * coordinates inside this viewBox (rather than pre-scaling to a fixed pixel
 * canvas) lets the browser's native viewBox scaling handle resizing/zoom
 * correctly, and keeps the map filling its container instead of floating
 * small inside a much bigger, mismatched canvas.
 */
export interface ViewBoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Same padded box as computeViewBox, as a rect rather than a string - used
 * as the base/fully-zoomed-out extent for pan/zoom clamping.
 */
export function computeBaseRect(
  bbox: [number, number, number, number],
  paddingRatio = 0.08
): ViewBoxRect {
  const [minX, minY, maxX, maxY] = bbox;

  const geomWidth = maxX - minX || 1;
  const geomHeight = maxY - minY || 1;

  const padX = geomWidth * paddingRatio;
  const padY = geomHeight * paddingRatio;

  return {
    x: minX - padX,
    y: minY - padY,
    w: geomWidth + padX * 2,
    h: geomHeight + padY * 2,
  };
}

export function computeViewBox(
  bbox: [number, number, number, number],
  paddingRatio = 0.08
): string {
  const { x, y, w, h } = computeBaseRect(bbox, paddingRatio);
  return `${x} ${y} ${w} ${h}`;
}

/**
 * MapLibre's rendering pipeline is Mercator-projection-based: it expects
 * source coordinates as [lng, lat] and internally clamps/wraps latitude to
 * roughly +-85 degrees (the standard Web Mercator-valid range - much
 * tighter than longitude's +-180). Feeding it raw EPSG:3857 metres directly
 * (which range into the millions) is far outside that domain.
 *
 * Since this map has no basemap/tile layer, nothing visually depends on
 * these being real-world coordinates - MAP_COORD_SCALE is a synthetic,
 * reversible unit conversion that keeps the game world's expected extent
 * comfortably inside MapLibre's valid lat range, not a real projection.
 *
 * Villages are seeded 1-2km apart (see spawn_villages.py); a scale of
 * 10,000 keeps the world addressable out to roughly +-850km (lat = +-85)
 * before hitting MapLibre's clamp, several orders of magnitude beyond any
 * currently seeded world size.
 */
export const MAP_COORD_SCALE = 10_000;

export function toLngLat([x, y]: [number, number]): [number, number] {
  return [x / MAP_COORD_SCALE, y / MAP_COORD_SCALE];
}

export function fromLngLat([lng, lat]: [number, number]): [number, number] {
  return [lng * MAP_COORD_SCALE, lat * MAP_COORD_SCALE];
}

// A GeoJSON `coordinates` array is arbitrarily nested depending on geometry
// type (Point: [x, y]; LineString: [[x, y], ...]; Polygon: [[[x, y], ...]]).
// This recurses down to the leaf [x, y] pairs regardless of nesting depth.
type CoordTree = [number, number] | CoordTree[];

function mapCoordTree(
  coords: CoordTree,
  fn: (pt: [number, number]) => [number, number]
): CoordTree {
  if (typeof coords[0] === "number") {
    return fn(coords as [number, number]);
  }
  return (coords as CoordTree[]).map((c) => mapCoordTree(c, fn));
}

/** Converts a whole GeoJSON `coordinates` tree from 3857 metres to synthetic lng/lat. */
export function coordsToLngLat(coords: CoordTree): CoordTree {
  return mapCoordTree(coords, toLngLat);
}

/** Converts a whole GeoJSON `coordinates` tree from synthetic lng/lat back to 3857 metres. */
export function coordsFromLngLat(coords: CoordTree): CoordTree {
  return mapCoordTree(coords, fromLngLat);
}

// Bare soil - a crop subzone with no field planted yet, or fallow.
const FIELD_FILL_FALLOW = "#c2a878";
// Wheat gold - a mature, ready-to-harvest field. Same value the map used
// unconditionally for every crop subzone before stage-aware colouring.
const FIELD_FILL_READY = "#E4C158";
// Growing fields interpolate between these two HSL lightness values as
// growth_progress goes 0 -> 1: pale/sparse green just after sowing, deepening
// to a lush green as the crop nears maturity.
const GROWING_HUE = 100;
const GROWING_SATURATION = 45;
const GROWING_LIGHTNESS_START = 75;
const GROWING_LIGHTNESS_END = 35;

/**
 * Field fill colour for a crop subzone, derived from its FieldCrop stage
 * and (while growing) its growth_progress fraction - presentation only,
 * doesn't affect simulation.
 */
export function fieldFillFor(
  stage: string | null | undefined,
  progress: number | null | undefined
): string {
  if (stage === "ready") return FIELD_FILL_READY;
  if (stage === "growing") {
    const t = Math.min(1, Math.max(0, progress ?? 0));
    const lightness =
      GROWING_LIGHTNESS_START + (GROWING_LIGHTNESS_END - GROWING_LIGHTNESS_START) * t;
    return `hsl(${GROWING_HUE}, ${GROWING_SATURATION}%, ${lightness}%)`;
  }
  return FIELD_FILL_FALLOW;
}
