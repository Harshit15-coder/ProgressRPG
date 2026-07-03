import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OnlineCountBadge from './OnlineCountBadge';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

const mockUseGame = vi.fn(() => ({ onlinePlayerCount: 12 }));

vi.mock('../../context/GameContext', () => ({
  useGame: () => mockUseGame(),
}));

describe('OnlineCountBadge', () => {
  it('shows the current online player count', () => {
    mockUseGame.mockReturnValue({ onlinePlayerCount: 12 });

    render(<OnlineCountBadge />);

    expect(screen.getByText('12 players online')).toBeInTheDocument();
  });

  it('updates displayed count from shared state', () => {
    mockUseGame.mockReturnValue({ onlinePlayerCount: 3 });

    render(<OnlineCountBadge />);

    expect(screen.getByText('3 players online')).toBeInTheDocument();
  });
});
