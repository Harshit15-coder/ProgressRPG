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

  it('does not hide path lines with opacity 0', () => {
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
    expect(path?.getAttribute('opacity')).not.toBe('0');
  });
});
