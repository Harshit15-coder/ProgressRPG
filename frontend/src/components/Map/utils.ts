
/**
 * Build an SVG viewBox string directly from a GeoJSON bbox, with a little
 * breathing room around the edges. Plotting features at their raw
 * coordinates inside this viewBox (rather than pre-scaling to a fixed pixel
 * canvas) lets the browser's native viewBox scaling handle resizing/zoom
 * correctly, and keeps the map filling its container instead of floating
 * small inside a much bigger, mismatched canvas.
 */
export function computeViewBox(
  bbox: [number, number, number, number],
  paddingRatio = 0.08
): string {
  const [minX, minY, maxX, maxY] = bbox;

  const geomWidth = maxX - minX || 1;
  const geomHeight = maxY - minY || 1;

  const padX = geomWidth * paddingRatio;
  const padY = geomHeight * paddingRatio;

  return `${minX - padX} ${minY - padY} ${geomWidth + padX * 2} ${geomHeight + padY * 2}`;
}
