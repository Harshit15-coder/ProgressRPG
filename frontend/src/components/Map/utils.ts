
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
