import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MapPage from './MapPage';

const mockApiFetch = vi.fn();

vi.mock('../../utils/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('../../components/Map/Map', () => ({
  default: ({ geojson }: { geojson: { meta?: { population_centre_name?: string } } | null }) => (
    <div data-testid="map-stub">{geojson?.meta?.population_centre_name}</div>
  ),
}));

describe('MapPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it('ignores an out-of-order poll response that resolves after a newer one (#624)', async () => {
    const mapCalls: { resolve: (value: unknown) => void }[] = [];

    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/population-centres/') {
        return Promise.resolve([{ id: 1 }]);
      }
      // Each poll to the map endpoint gets its own promise that this test
      // resolves manually, in whatever order it chooses - simulating
      // ordinary network jitter where responses needn't arrive in the
      // order the requests were sent.
      return new Promise((resolve) => {
        mapCalls.push({ resolve });
      });
    });

    render(<MapPage />);

    // Flush the population-centre lookup (mount effect) so pcId is set and
    // the first map poll fires.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mapCalls).toHaveLength(1);

    // Advance to the next scheduled poll - a second, newer request goes out
    // while the first is still pending.
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(mapCalls).toHaveLength(2);

    // The newer (second) request resolves first...
    await act(async () => {
      mapCalls[1].resolve({ meta: { population_centre_name: 'Newer village' } });
      await Promise.resolve();
    });
    expect(screen.getByTestId('map-stub').textContent).toBe('Newer village');

    // ...then the older (first) request finally resolves late. It must not
    // overwrite the newer data that already rendered.
    await act(async () => {
      mapCalls[0].resolve({ meta: { population_centre_name: 'Stale village' } });
      await Promise.resolve();
    });
    expect(screen.getByTestId('map-stub').textContent).toBe('Newer village');
  });
});
