import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MapPage from './MapPage';

const mockFetchFirstPopulationCentreId = vi.fn();
const mockFetchPopulationCentreMap = vi.fn();
const mockFetchMapViewport = vi.fn();
const mockFetchMapWorldBounds = vi.fn();
const mockFetchPopulationCentres = vi.fn();

vi.mock('../../api/map', () => ({
  fetchFirstPopulationCentreId: (...args: unknown[]) =>
    mockFetchFirstPopulationCentreId(...args),
  fetchPopulationCentreMap: (...args: unknown[]) => mockFetchPopulationCentreMap(...args),
  fetchMapViewport: (...args: unknown[]) => mockFetchMapViewport(...args),
  fetchMapWorldBounds: (...args: unknown[]) => mockFetchMapWorldBounds(...args),
  fetchPopulationCentres: (...args: unknown[]) => mockFetchPopulationCentres(...args),
}));

// Map.tsx owns a real MapLibre instance, which needs a WebGL context jsdom
// doesn't provide - out of scope for MapPage's own tests (Map.test.tsx
// covers MapLibre wiring with maplibre-gl mocked). This stub simulates the
// one behaviour MapPage depends on: once "mounted" (its camera has fitted
// an initial view), it reports a settled viewport bbox back up.
function MapStub({
  geojson,
  onViewportChange,
}: {
  geojson: { meta?: { population_centre_name?: string } } | null;
  onViewportChange?: (bbox: string) => void;
}) {
  useEffect(() => {
    onViewportChange?.('0,0,100,100');
    // Only fire once, mirroring the real component's one-time initial fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div data-testid="map-stub">{geojson?.meta?.population_centre_name}</div>;
}

vi.mock('../../components/Map/Map', () => ({
  default: MapStub,
}));

function renderMapPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MapPage />
    </QueryClientProvider>
  );
}

describe('MapPage', () => {
  beforeEach(() => {
    mockFetchFirstPopulationCentreId.mockReset();
    mockFetchPopulationCentreMap.mockReset();
    mockFetchMapViewport.mockReset();
    mockFetchMapWorldBounds.mockReset();
    mockFetchPopulationCentres.mockReset();
    mockFetchFirstPopulationCentreId.mockResolvedValue(1);
    mockFetchMapViewport.mockResolvedValue({ meta: { population_centre_name: 'Driftmoor' } });
    mockFetchMapWorldBounds.mockResolvedValue({ bbox: [-1000, -1000, 1000, 1000] });
    mockFetchPopulationCentres.mockResolvedValue([
      { id: 1, name: 'Driftmoor village', location: [0, 0] },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the map once the population centre and its initial map data have loaded', async () => {
    mockFetchPopulationCentreMap.mockResolvedValue({
      meta: { population_centre_name: 'Driftmoor' },
      bbox: [0, 0, 100, 100],
    });

    renderMapPage();

    expect(await screen.findByTestId('map-stub')).toHaveTextContent('Driftmoor');
  });

  it('does not issue a second viewport request while the previous poll is still in flight (#624)', async () => {
    mockFetchPopulationCentreMap.mockResolvedValue({
      meta: { population_centre_name: 'Driftmoor' },
      bbox: [0, 0, 100, 100],
    });

    vi.useFakeTimers();
    const pending: { resolve: (value: unknown) => void }[] = [];
    mockFetchMapViewport.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push({ resolve });
        })
    );

    renderMapPage();

    // Flush the population-centre lookup and initial-centre fetch, then the
    // stub's onViewportChange call, so the first viewport fetch fires. This
    // is a chain of several dependent async hops (pcId -> initial centre ->
    // Map mounts -> onViewportChange -> viewport query starts), each of
    // which may need its own microtask turn under fake timers, so flush
    // repeatedly rather than assuming one pass covers it.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(mockFetchMapViewport).toHaveBeenCalledTimes(1);

    // Advance past when a poll would normally re-fire. TanStack Query
    // deduplicates fetches for the same query key while one is already in
    // flight, so no second network call should go out until this one
    // settles - this is what makes the old manual-polling race (#624),
    // where a stale response could land after and overwrite a newer one,
    // structurally impossible here rather than something to guard against
    // after the fact.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockFetchMapViewport).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending[0].resolve({ meta: { population_centre_name: 'Driftmoor' } });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('map-stub').textContent).toBe('Driftmoor');

    // Now that the in-flight fetch has settled, the next interval tick is
    // free to fire a new one.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockFetchMapViewport).toHaveBeenCalledTimes(2);
  });
});
