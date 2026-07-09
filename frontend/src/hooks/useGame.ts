// hooks/useGame.ts
import { useContext } from 'react';
import { GameContext, type GameContextValue } from '../context/gameContext';

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}
