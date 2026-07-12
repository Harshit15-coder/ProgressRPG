import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityTimer } from './ActivityTimer';

const mockUseGame = vi.fn();
const showToast = vi.fn();
const fetchActivities = vi.fn();
const setPlayer = vi.fn();
const stop = vi.fn();
const startActivity = vi.fn();
const clearAutoStopCompletion = vi.fn();
const mutateAsync = vi.fn();

vi.mock('../../hooks/useGame', () => ({
  useGame: () => mockUseGame(),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ showToast, toasts: [] }),
}));

vi.mock('../../hooks/useActivities', () => ({
  useUpdateActivity: () => ({ mutateAsync }),
}));

function baseActivityTimer(overrides = {}) {
  return {
    currentActivity: { id: 1, name: 'Write docs', text: 'Write docs', taskId: null },
    status: 'active',
    elapsed: 30,
    startActivity,
    stop,
    autoStopCompletion: null,
    clearAutoStopCompletion,
    ...overrides,
  };
}

describe('ActivityTimer', () => {
  beforeEach(() => {
    showToast.mockReset();
    fetchActivities.mockReset();
    setPlayer.mockReset();
    stop.mockReset();
    startActivity.mockReset();
    clearAutoStopCompletion.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(undefined);

    mockUseGame.mockReturnValue({
      fetchActivities,
      setPlayer,
      activityTimer: baseActivityTimer(),
    });
  });

  it('shows an XP toast after a manual submit with no level-up', async () => {
    stop.mockResolvedValue({ xp_gained: 15, level_ups: [], duration_seconds: 30 });

    render(<ActivityTimer />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit Activity' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('You got 15 XP!'));
  });

  it('summarizes to the highest level reached when multiple level-ups occur', async () => {
    stop.mockResolvedValue({ xp_gained: 40, level_ups: [3, 4, 5], duration_seconds: 90 });

    render(<ActivityTimer />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit Activity' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('You got 40 XP! Now level 5.')
    );
  });

  it('suppresses the toast for a zero-XP completion', async () => {
    stop.mockResolvedValue({ xp_gained: 0, level_ups: [], duration_seconds: 1 });

    render(<ActivityTimer />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit Activity' }));

    await waitFor(() => expect(fetchActivities).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows an error toast when stop() fails', async () => {
    stop.mockRejectedValue(new Error('network down'));

    render(<ActivityTimer />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit Activity' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Something went wrong. Please try again.')
    );
  });

  it('shows a toast and clears state after an auto-stop completion', async () => {
    mockUseGame.mockReturnValue({
      fetchActivities,
      setPlayer,
      activityTimer: baseActivityTimer({
        autoStopCompletion: { xpGained: 8, levelUps: [2], activityName: 'Write docs', elapsedSeconds: 60 },
      }),
    });

    render(<ActivityTimer />);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('You got 8 XP! Now level 2.'));
    expect(clearAutoStopCompletion).toHaveBeenCalledTimes(1);
  });

  it('does not toast for a zero-XP auto-stop completion, but still clears it', async () => {
    mockUseGame.mockReturnValue({
      fetchActivities,
      setPlayer,
      activityTimer: baseActivityTimer({
        autoStopCompletion: { xpGained: 0, levelUps: [], activityName: 'Write docs', elapsedSeconds: 5 },
      }),
    });

    render(<ActivityTimer />);

    await waitFor(() => expect(clearAutoStopCompletion).toHaveBeenCalledTimes(1));
    expect(showToast).not.toHaveBeenCalled();
  });
});
