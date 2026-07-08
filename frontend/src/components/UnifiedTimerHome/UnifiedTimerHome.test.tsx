import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UnifiedTimerHome from './UnifiedTimerHome';

const mockUseGame = vi.fn();
const mockUseSupportFlow = vi.fn();
const mockUseEntitySearchCache = vi.fn();
const mockUseDefaultActivityEntries = vi.fn();
const fetchPlayerAndCharacter = vi.fn();
const fetchCharacterCurrent = vi.fn();
const fetchActivities = vi.fn();
const clearAutoStopCompletion = vi.fn();
const stop = vi.fn();
const startActivity = vi.fn();
const labelActivity = vi.fn();
const addEntityToCache = vi.fn();

vi.mock('../../hooks/useGame', () => ({
  useGame: () => mockUseGame(),
}));

vi.mock('../../hooks/useSupportFlow', () => ({
  useSupportFlow: (...args: unknown[]) => mockUseSupportFlow(...args),
}));

vi.mock('../../hooks/useEntitySearchCache', () => ({
  useEntitySearchCache: (...args: unknown[]) => mockUseEntitySearchCache(...args),
}));

vi.mock('../../hooks/useDefaultActivityEntries', () => ({
  useDefaultActivityEntries: () => mockUseDefaultActivityEntries(),
}));

vi.mock('../SupportFlow/SupportFlowModal', () => ({
  default: () => null,
}));

vi.mock('../../utils/sounds', () => ({
  playLimitReachedSound: vi.fn(),
  primeAudio: vi.fn(),
}));

// Strip animation-only props so React doesn't warn about unknown DOM attrs,
// and render children synchronously so tests don't need to await exit/enter
// transitions.
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
      const { layout, initial, animate, exit, transition, children, ...rest } = props;
      void layout;
      void initial;
      void animate;
      void exit;
      void transition;
      return (
        <div ref={ref} {...rest}>
          {children as React.ReactNode}
        </div>
      );
    }),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

function mockGame(activityTimerOverrides: Record<string, unknown> = {}) {
  mockUseGame.mockReturnValue({
    activityTimer: {
      currentActivity: null,
      status: 'empty',
      stop,
      startActivity,
      labelActivity,
      elapsed: 0,
      limitSeconds: null,
      limitReached: false,
      autoStopCompletion: null,
      clearAutoStopCompletion,
      ...activityTimerOverrides,
    },
    fetchPlayerAndCharacter,
    fetchCharacterCurrent,
    fetchActivities,
    loginState: 'none',
    loginStreak: 0,
    loginEventAt: null,
    player: { is_premium: false },
    freeTimerLimitSeconds: 15,
  });
}

describe('UnifiedTimerHome', () => {
  beforeEach(() => {
    mockUseSupportFlow.mockReset();
    mockUseEntitySearchCache.mockReset();
    mockUseDefaultActivityEntries.mockReset().mockReturnValue([]);
    fetchPlayerAndCharacter.mockReset().mockResolvedValue(null);
    fetchCharacterCurrent.mockReset().mockResolvedValue(null);
    fetchActivities.mockReset().mockResolvedValue(null);
    clearAutoStopCompletion.mockReset();
    stop.mockReset();
    startActivity.mockReset();
    labelActivity.mockReset();
    addEntityToCache.mockReset();

    mockUseSupportFlow.mockReturnValue({
      openWelcomeMessage: vi.fn(),
      openActivityReward: vi.fn(),
      openSupportMode: vi.fn(),
      flowState: { isOpen: false },
      flowDispatch: vi.fn(),
      handleConfirmActivity: vi.fn(),
    });

    mockUseEntitySearchCache.mockReturnValue({
      entities: [],
      addEntityToCache,
    });

    mockGame();
  });

  it('renders the input state by default with a Blank Start option', () => {
    render(<UnifiedTimerHome />);

    expect(screen.getByRole('combobox', { name: 'Activity name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start blank' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('Blank Start starts a timer and moves to the running-unlabelled state', async () => {
    const user = userEvent.setup();
    startActivity.mockResolvedValue(null);

    const { rerender } = render(<UnifiedTimerHome />);

    await user.click(screen.getByRole('button', { name: 'Start blank' }));

    expect(startActivity).toHaveBeenCalledWith({ text: '', allowBlank: true, limitSeconds: 15 });

    // Reflect the timer now being active with a blank name.
    mockGame({ status: 'active', currentActivity: { name: '' } });
    rerender(<UnifiedTimerHome />);

    expect(screen.getByRole('combobox', { name: 'Activity name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('selecting a suggestion while unlabelled-running labels the timer in place', async () => {
    const user = userEvent.setup();
    mockGame({ status: 'active', currentActivity: { name: '' } });
    mockUseDefaultActivityEntries.mockReturnValue([
      { id: 'activity-1', name: 'Washing dishes', taskId: null, source: 'activity' },
    ]);

    render(<UnifiedTimerHome />);

    await user.click(screen.getByRole('option', { name: 'Washing dishes' }));

    expect(labelActivity).toHaveBeenCalledWith('Washing dishes', null);
    expect(startActivity).not.toHaveBeenCalled();
  });

  it('shows the running-labelled state with a clickable activity name', () => {
    mockGame({ status: 'active', currentActivity: { name: 'Deep work' }, elapsed: 15 });

    render(<UnifiedTimerHome />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deep work/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('clicking the running-labelled name switches to click-to-edit and pre-fills the input', async () => {
    const user = userEvent.setup();
    mockGame({ status: 'active', currentActivity: { name: 'Deep work' } });

    render(<UnifiedTimerHome />);

    await user.click(screen.getByRole('button', { name: /Deep work/ }));

    expect(screen.getByRole('combobox', { name: 'Activity name' })).toHaveValue('Deep work');
    expect(screen.getByRole('combobox', { name: 'Activity name' })).toHaveFocus();
  });

  it('Escape cancels click-to-edit without calling labelActivity', async () => {
    const user = userEvent.setup();
    mockGame({ status: 'active', currentActivity: { name: 'Deep work' } });

    render(<UnifiedTimerHome />);

    await user.click(screen.getByRole('button', { name: /Deep work/ }));
    await user.keyboard('{Escape}');

    expect(labelActivity).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Deep work/ })).toBeInTheDocument();
  });

  it('exposes a status message for screen readers reflecting the running state', () => {
    mockGame({ status: 'active', currentActivity: { name: 'Deep work' } });

    render(<UnifiedTimerHome />);

    expect(screen.getByText('Timer running: Deep work')).toBeInTheDocument();
  });

  it('shows the auto-stop warning near the limit', () => {
    mockGame({
      status: 'active',
      currentActivity: { name: 'Deep work' },
      elapsed: 27,
      limitSeconds: 30,
    });

    render(<UnifiedTimerHome />);

    expect(
      screen.getByText('This timer will stop automatically when it reaches 0:30.')
    ).toBeInTheDocument();
  });
});
