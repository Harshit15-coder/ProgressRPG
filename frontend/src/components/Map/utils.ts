
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
