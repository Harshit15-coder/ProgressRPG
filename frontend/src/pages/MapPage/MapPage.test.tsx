import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MapPage from './MapPage';

const mockFetchFirstPopulationCentreId = vi.fn();
const mockFetchPopulationCentreMap = vi.fn();

vi.mock('../../api/map', () => ({
  fetchFirstPopulationCentreId: (...args: unknown[]) =>
    mockFetchFirstPopulationCentreId(...args),
  fetchPopulationCentreMap: (...args: unknown[]) => mockFetchPopulationCentreMap(...args),
}));

vi.mock('../../components/Map/Map', () => ({
  default: ({ geojson }: { geojson: { meta?: { population_centre_name?: string } } | null }) => (
    <div data-testid="map-stub">{geojson?.meta?.population_centre_name}</div>
  ),
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
    mockFetchFirstPopulationCentreId.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the map once the population centre and its map data have loaded', async () => {
    mockFetchPopulationCentreMap.mockResolvedValue({
      meta: { population_centre_name: 'Driftmoor' },
    });

    renderMapPage();

    expect(await screen.findByTestId('map-stub')).toHaveTextContent('Driftmoor');
  });

  it('does not issue a second request while the previous poll is still in flight (#624)', async () => {
    vi.useFakeTimers();
    const pending: { resolve: (value: unknown) => void }[] = [];
    mockFetchPopulationCentreMap.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push({ resolve });
        })
    );

    renderMapPage();

    // Flush the population-centre lookup so pcId resolves and the first
    // map fetch fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockFetchPopulationCentreMap).toHaveBeenCalledTimes(1);

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
    expect(mockFetchPopulationCentreMap).toHaveBeenCalledTimes(1);

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
    expect(mockFetchPopulationCentreMap).toHaveBeenCalledTimes(2);
  });
});
