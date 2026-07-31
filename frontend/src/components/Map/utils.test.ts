import { describe, it, expect } from 'vitest';
import {
  MAP_COORD_SCALE,
  toLngLat,
  fromLngLat,
  coordsToLngLat,
  coordsFromLngLat,
} from './utils';

describe('coordinate transform (3857 metres <-> synthetic lng/lat)', () => {
  it('scales a point down to lng/lat and back losslessly', () => {
    const point: [number, number] = [123456.789, -987654.321];
    const lngLat = toLngLat(point);
    expect(lngLat).toEqual([123456.789 / MAP_COORD_SCALE, -987654.321 / MAP_COORD_SCALE]);
    expect(fromLngLat(lngLat)).toEqual(point);
  });

  it('keeps the origin at the origin', () => {
    expect(toLngLat([0, 0])).toEqual([0, 0]);
  });

  it('stays within MapLibre-valid lat range for realistic world extents', () => {
    // Villages sit 1-2km apart (spawn_villages.py); even a world 100km
    // across in either direction should stay far inside +-85 degrees.
    const worldEdge: [number, number] = [100_000, 100_000];
    const [lng, lat] = toLngLat(worldEdge);
    expect(Math.abs(lng)).toBeLessThan(85);
    expect(Math.abs(lat)).toBeLessThan(85);
  });

  it('round-trips a Polygon coordinates tree (nested rings)', () => {
    const polygon = [
      [
        [0, 0],
        [0, 100],
        [100, 100],
        [100, 0],
        [0, 0],
      ],
    ];
    const transformed = coordsToLngLat(polygon as never);
    const restored = coordsFromLngLat(transformed);
    expect(restored).toEqual(polygon);
  });

  it('round-trips a LineString coordinates tree', () => {
    const line = [
      [0, 0],
      [50, 50],
    ];
    const transformed = coordsToLngLat(line as never);
    const restored = coordsFromLngLat(transformed);
    expect(restored).toEqual(line);
  });

  it('round-trips a bare Point coordinates tree', () => {
    const point = [42, -17];
    const transformed = coordsToLngLat(point as never);
    const restored = coordsFromLngLat(transformed);
    expect(restored).toEqual(point);
  });
});
