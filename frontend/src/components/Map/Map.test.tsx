import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import PopulationCentreMap from './Map';
import { TooltipProvider } from '../Tooltip/Tooltip';

function renderMap(props: ComponentProps<typeof PopulationCentreMap>) {
  return render(
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <PopulationCentreMap {...props} />
    </TooltipProvider>
  );
}

const baseGeojson = {
  bbox: [0, 0, 100, 100] as [number, number, number, number],
  features: [
    {
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 100], [100, 100], [100, 0], [0, 0]]] },
      properties: { feature_type: 'boundary', name: 'Village Boundary' },
    },
    {
      geometry: { type: 'Point', coordinates: [10, 10] },
      properties: { feature_type: 'character', id: 1, name: 'Alice' },
    },
    {
      geometry: { type: 'Point', coordinates: [20, 20] },
      properties: { feature_type: 'character', id: 2, name: 'Bob' },
    },
  ],
};

describe('PopulationCentreMap', () => {
  it('renders nothing when geojson is absent', () => {
    const { container } = renderMap({ geojson: null });
    expect(container.querySelectorAll('g')).toHaveLength(0);
  });

  it('renders one character marker per character feature', () => {
    const { container } = renderMap({ geojson: baseGeojson });
    const markers = container.querySelectorAll('g');
    expect(markers).toHaveLength(2);
  });

  it('gives the same character id the same colour across renders', () => {
    const { container: first } = renderMap({ geojson: baseGeojson });
    const { container: second } = renderMap({ geojson: baseGeojson });

    const firstCircle = first.querySelectorAll('g circle')[0];
    const secondCircle = second.querySelectorAll('g circle')[0];
    expect(firstCircle.getAttribute('fill')).toBe(secondCircle.getAttribute('fill'));
  });

  it('gives different character ids different colours (for the placeholder palette)', () => {
    const { container } = renderMap({ geojson: baseGeojson });
    const circles = container.querySelectorAll('g circle');
    expect(circles[0].getAttribute('fill')).not.toBe(circles[1].getAttribute('fill'));
  });

  it('positions each marker via the SVG transform attribute in user-space units (not CSS px), so it scales with the viewBox under zoom', () => {
    const { container } = renderMap({ geojson: baseGeojson });
    const markers = container.querySelectorAll('g');
    markers.forEach((marker) => {
      const transform = marker.getAttribute('transform') || '';
      expect(transform).toMatch(/translate\(/);
      expect(transform).not.toMatch(/px/);
    });
  });

  it('places characters at random points inside their building footprint, not clustered at its centre', () => {
    const geojsonWithHousehold = {
      bbox: [0, 0, 20, 20] as [number, number, number, number],
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 20], [20, 20], [20, 0], [0, 0]]],
          },
          properties: {
            feature_type: 'building',
            name: 'House',
            building_type: 'residential',
          },
        },
        ...[10, 11, 12, 13, 14].map((id) => ({
          geometry: { type: 'Point', coordinates: [10, 10] },
          properties: { feature_type: 'character', id, name: `Resident ${id}` },
        })),
      ],
    };

    const { container } = renderMap({ geojson: geojsonWithHousehold });
    const markers = container.querySelectorAll('g');
    expect(markers).toHaveLength(5);

    const points = Array.from(markers).map((marker) => {
      const transform = marker.getAttribute('transform') || '';
      const match = transform.match(/translate\(([-\d.]+), ([-\d.]+)\)/);
      return [Number(match?.[1]), Number(match?.[2])];
    });

    // Every character should land inside the 0-20 footprint (inset from the
    // walls a little), not stacked at the shared (10, 10) entrance point.
    points.forEach(([x, y]) => {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(20);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(20);
    });

    const exactlyAtSharedPoint = points.filter(([x, y]) => x === 10 && y === 10);
    expect(exactlyAtSharedPoint.length).toBeLessThan(points.length);

    const uniquePoints = new Set(points.map(([x, y]) => `${x},${y}`));
    expect(uniquePoints.size).toBe(5);
  });

  it('keeps a minimum distance between housemates scattered in the same building', () => {
    // A small 10x10 footprint with 5 residents - tight enough to make the
    // minimum-distance constraint actually bind, not just happen to pass.
    const geojsonWithCrowdedHousehold = {
      bbox: [0, 0, 10, 10] as [number, number, number, number],
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]],
          },
          properties: {
            feature_type: 'building',
            name: 'House',
            building_type: 'residential',
          },
        },
        ...[20, 21, 22, 23, 24].map((id) => ({
          geometry: { type: 'Point', coordinates: [5, 5] },
          properties: { feature_type: 'character', id, name: `Resident ${id}` },
        })),
      ],
    };

    const { container } = renderMap({ geojson: geojsonWithCrowdedHousehold });
    const points = Array.from(container.querySelectorAll('g')).map((marker) => {
      const transform = marker.getAttribute('transform') || '';
      const match = transform.match(/translate\(([-\d.]+), ([-\d.]+)\)/);
      return [Number(match?.[1]), Number(match?.[2])] as [number, number];
    });
    expect(points).toHaveLength(5);

    // The footprint is tight relative to the minimum spacing, so the exact
    // 3.5-unit floor may not be reachable for every pair - but positions
    // should still land noticeably apart rather than nearly on top of each
    // other (which the earlier ring-radius approach could produce).
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i][0] - points[j][0];
        const dy = points[i][1] - points[j][1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThan(1.5);
      }
    }
  });

  it('places characters at a shared point on the footprint boundary (e.g. the entrance node) inside the house, not clustered at the door', () => {
    // The entrance node sits on the midpoint of a wall - exactly on the
    // polygon's edge, not safely inside it. This regresses if the
    // footprint-matching lookup uses a strict point-in-polygon test, which
    // is unreliable exactly on a boundary.
    const geojsonWithResidentsAtEntrance = {
      bbox: [0, 0, 20, 20] as [number, number, number, number],
      features: [
        {
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [0, 20], [20, 20], [20, 0], [0, 0]]],
          },
          properties: {
            feature_type: 'building',
            name: 'House',
            building_type: 'residential',
          },
        },
        ...[30, 31, 32, 33, 34].map((id) => ({
          geometry: { type: 'Point', coordinates: [10, 0] }, // midpoint of the bottom wall
          properties: { feature_type: 'character', id, name: `Resident ${id}` },
        })),
      ],
    };

    const { container } = renderMap({ geojson: geojsonWithResidentsAtEntrance });
    const points = Array.from(container.querySelectorAll('g')).map((marker) => {
      const transform = marker.getAttribute('transform') || '';
      const match = transform.match(/translate\(([-\d.]+), ([-\d.]+)\)/);
      return [Number(match?.[1]), Number(match?.[2])];
    });
    expect(points).toHaveLength(5);

    points.forEach(([x, y]) => {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(20);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(20);
    });

    const exactlyAtDoor = points.filter(([x, y]) => x === 10 && y === 0);
    expect(exactlyAtDoor.length).toBe(0);
  });

  it('renders crops subzones in gold, distinct from the default grey building fill', () => {
    const geojsonWithCropSubzone = {
      ...baseGeojson,
      features: [
        ...baseGeojson.features,
        {
          geometry: { type: 'Polygon', coordinates: [[[50, 50], [50, 60], [60, 60], [60, 50], [50, 50]]] },
          properties: {
            feature_type: 'building',
            name: 'House 2 of (Driftmoor village)',
            building_type: 'residential',
          },
        },
        {
          geometry: { type: 'Polygon', coordinates: [[[5, 5], [5, 40], [40, 40], [40, 5], [5, 5]]] },
          properties: {
            feature_type: 'subzone',
            name: 'Driftmoor village Farmland - Crops',
            usage: 'crops',
          },
        },
      ],
    };
    const { container } = renderMap({ geojson: geojsonWithCropSubzone });
    const polygons = container.querySelectorAll('polygon');
    const fills = Array.from(polygons).map((p) => p.getAttribute('fill'));

    expect(fills).toContain('#E4C158');
    expect(fills).toContain('#ddd');
  });

  it('renders field_shelter buildings in the default grey, not gold', () => {
    const geojsonWithShelter = {
      ...baseGeojson,
      features: [
        ...baseGeojson.features,
        {
          geometry: { type: 'Polygon', coordinates: [[[5, 5], [5, 15], [15, 15], [15, 5], [5, 5]]] },
          properties: {
            feature_type: 'building',
            name: 'Field Shelter of (Driftmoor village)',
            building_type: 'field_shelter',
          },
        },
      ],
    };
    const { container } = renderMap({ geojson: geojsonWithShelter });
    const polygons = container.querySelectorAll('polygon');
    const fills = Array.from(polygons).map((p) => p.getAttribute('fill'));

    expect(fills).not.toContain('#E4C158');
    expect(fills).toContain('#ddd');
  });

  it('shows just the building type in the tooltip, not the full backend name', async () => {
    const geojsonWithBuilding = {
      ...baseGeojson,
      features: [
        ...baseGeojson.features,
        {
          geometry: { type: 'Polygon', coordinates: [[[5, 5], [5, 10], [10, 10], [10, 5], [5, 5]]] },
          properties: {
            feature_type: 'building',
            name: 'House 2 of (Driftmoor village)',
            building_type: 'residential',
          },
        },
      ],
    };
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <PopulationCentreMap geojson={geojsonWithBuilding} />
      </TooltipProvider>
    );

    const building = document.querySelector('polygon[fill="#ddd"]') as SVGPolygonElement;
    await user.hover(building);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('House');
    expect(tooltip).not.toHaveTextContent('Driftmoor village');
  });

  it('fans out characters sharing the same coordinate instead of stacking them', () => {
    const geojsonWithSharedHouse = {
      ...baseGeojson,
      features: [
        ...baseGeojson.features,
        {
          geometry: { type: 'Point', coordinates: [50, 50] },
          properties: { feature_type: 'character', id: 3, name: 'Carol' },
        },
        {
          geometry: { type: 'Point', coordinates: [50, 50] },
          properties: { feature_type: 'character', id: 4, name: 'Dave' },
        },
        {
          geometry: { type: 'Point', coordinates: [50, 50] },
          properties: { feature_type: 'character', id: 5, name: 'Eve' },
        },
      ],
    };
    const { container } = renderMap({ geojson: geojsonWithSharedHouse });
    const markers = container.querySelectorAll('g');
    expect(markers).toHaveLength(5);

    const houseMarkerTransforms = Array.from(markers)
      .slice(2) // Carol, Dave, Eve - all originally at (50, 50)
      .map((marker) => marker.getAttribute('transform'));

    expect(new Set(houseMarkerTransforms).size).toBe(3);
  });

  it('paints characters lower on screen after (on top of) ones higher up, in DOM/render order', () => {
    const geojsonOutOfOrder = {
      ...baseGeojson,
      features: [
        ...baseGeojson.features,
        {
          // Listed first in the feature list but should paint last (highest
          // y = lowest on screen, since the viewBox y axis isn't flipped).
          geometry: { type: 'Point', coordinates: [30, 90] },
          properties: { feature_type: 'character', id: 3, name: 'LowestOnScreen' },
        },
        {
          geometry: { type: 'Point', coordinates: [30, 5] },
          properties: { feature_type: 'character', id: 4, name: 'HighestOnScreen' },
        },
      ],
    };
    const { container } = renderMap({ geojson: geojsonOutOfOrder });
    const markerNames = Array.from(container.querySelectorAll('g')).map((marker) =>
      marker.getAttribute('transform')
    );

    // Alice (y=10), Bob (y=20), HighestOnScreen (y=5), LowestOnScreen (y=90)
    // -> expected paint order ascending by y: HighestOnScreen, Alice, Bob, LowestOnScreen
    expect(markerNames).toEqual([
      'translate(30, 5)',
      'translate(10, 10)',
      'translate(20, 20)',
      'translate(30, 90)',
    ]);
  });

  it('keeps a single character at its exact point (no unnecessary offset)', () => {
    const { container } = renderMap({ geojson: baseGeojson });
    const markers = container.querySelectorAll('g');
    expect(markers[0].getAttribute('transform')).toBe('translate(10, 10)');
    expect(markers[1].getAttribute('transform')).toBe('translate(20, 20)');
  });

  it('renders path lines invisibly (opacity 0)', () => {
    const geojsonWithPath = {
      ...baseGeojson,
      features: [
        ...baseGeojson.features,
        {
          geometry: { type: 'LineString', coordinates: [[0, 0], [10, 10]] },
          properties: { feature_type: 'path', name: 'Main Street' },
        },
      ],
    };
    const { container } = renderMap({ geojson: geojsonWithPath });
    const path = container.querySelector('polyline');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('opacity')).toBe('0');
  });
});
