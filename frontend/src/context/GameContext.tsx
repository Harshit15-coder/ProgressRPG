/* eslint-disable react-hooks/set-state-in-effect */
// GameContext.tsx
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from 'react';

import { useBootstrapGameData } from '../hooks/useBootstrapGameData';
import { apiFetch } from "../utils/api";
import useActivityTimer from '../hooks/useActivityTimer';
import { useAuth } from './AuthContext';
import type {
  Player,
  Character,
  XpModifier,
  PlayerActivity,
  CharacterActivity,
  PopulationCentre,
  GameSettings,
  LoginState,
  ActivityTimerReturn,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of the /character-activities/current/ response.
 * The `current` field is a CharacterActivity or null.
 */
interface CharacterCurrentResponse {
  current: CharacterActivity | null;
}

export interface GameContextValue {
  player: Player | null;
  setPlayer: Dispatch<SetStateAction<Player | null>>;
  character: Character | null;
  setCharacter: Dispatch<SetStateAction<Character | null>>;
  xpMods: XpModifier[];
  setXpMods: Dispatch<SetStateAction<XpModifier[]>>;
  fetchPlayerAndCharacter: () => Promise<void>;
  activityTimer: ActivityTimerReturn;
  playerActivities: PlayerActivity[];
  characterActivities: CharacterActivity[];
  fetchActivities: () => Promise<void>;
  fetchCharacterCurrent: () => Promise<CharacterActivity | null>;
  characterCurrentActivity: CharacterActivity | null;
  setCharacterCurrentActivity: Dispatch<SetStateAction<CharacterActivity | null>>;
  populationCentre: PopulationCentre | null;
  fetchPopulationCentre: (pcId: number) => Promise<PopulationCentre>;
  loginState: LoginState;
  loginStreak: number;
  loginEventAt: string | null;
  loginRewardXp: number;
  loading: boolean;
  buildNumber: string | boolean;
  freeTimerLimitSeconds: number;
  gameSettings: GameSettings | null;
  onlinePlayerCount: number;
  setOnlinePlayerCount: Dispatch<SetStateAction<number>>;
}

interface ProviderProps {
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GameContext = createContext<GameContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getActivityWindow = (): { start: string } => {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    start: since.toISOString(),
  };
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export const useGame = (): GameContextValue => {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const GameProvider = ({ children }: ProviderProps): ReactElement => {
  const {
    player: playerOnload,
    character: characterOnload,
    activityTimerInfo,
    populationCentreInfo,
    xpMods: xpModsOnload,
    loginState,
    loginStreak,
    loginEventAt,
    loginRewardXp,
    loading,
    error,
    buildNumber,
    freeTimerLimitSeconds,
    gameSettings,
  } = useBootstrapGameData();


  const [player, setPlayer] = useState<Player | null>(playerOnload);
  const [character, setCharacter] = useState<Character | null>(characterOnload);
  const [xpMods, setXpMods] = useState<XpModifier[]>(xpModsOnload);
  const [playerActivities, setPlayerActivities] = useState<PlayerActivity[]>([]);
  const [characterActivities, setCharacterActivities] = useState<CharacterActivity[]>([]);
  const [characterCurrentActivity, setCharacterCurrentActivity] = useState<CharacterActivity | null>(null);
  const [populationCentre, setPopulationCentre] = useState<PopulationCentre | null>(populationCentreInfo);
  const [onlinePlayerCount, setOnlinePlayerCount] = useState<number>(0);

  const activityTimer = useActivityTimer();
  const { loadFromServer } = activityTimer;


  // ----------------------------------------
  //  STABLE CALLBACKS
  // ----------------------------------------


  const fetchPlayerAndCharacter = useCallback(async (): Promise<void> => {
    const freshPlayer = await apiFetch<Player>(`/me/player/`);
    setPlayer(freshPlayer);
    setCharacter(null);
  }, []);

  const fetchActivities = useCallback(async (): Promise<void> => {
    const activityWindow = getActivityWindow();
    const [playerData, charData] = await Promise.all([
      apiFetch<{ results: PlayerActivity[] }>(
        `/player-activities/?is_complete=true&completed_at_after=${activityWindow.start}`
      ),
      apiFetch<{ results: CharacterActivity[] }>(
        `/character-activities/?is_complete=true&completed_at_after=${activityWindow.start}`
      ),
    ]);
    setPlayerActivities(playerData?.results ?? []);
    setCharacterActivities(charData?.results ?? []);
  }, []);

  const fetchCharacterCurrent = useCallback(async (): Promise<CharacterActivity | null> => {
    const data = await apiFetch<CharacterCurrentResponse>(`/character-activities/current/`);
    //console.log("/current, data:", data);
    setCharacterCurrentActivity(data.current);
    return data.current;
  }, []);

  const fetchPopulationCentre = useCallback(async (pcId: number): Promise<PopulationCentre> => {
    const data = await apiFetch<PopulationCentre>(`/population-centres/${pcId}/`);
    setPopulationCentre(data);
    return data;
  }, []);

  // ----------------------------------------
  //  EFFECTS
  // ----------------------------------------

  const { isAuthenticated, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchPlayerAndCharacter();
    }
  }, [fetchPlayerAndCharacter, isAuthenticated, authLoading]);

  useEffect(() => {
    if (activityTimerInfo) {
      loadFromServer(activityTimerInfo, {
        limitSeconds: player?.is_premium ? null : freeTimerLimitSeconds,
      });
    }
  }, [
    loadFromServer,
    activityTimerInfo,
    freeTimerLimitSeconds,
    player?.is_premium,
  ]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchActivities();
    }
  }, [fetchActivities, isAuthenticated, authLoading]);

  useEffect(() => {
    if (xpModsOnload) {
      setXpMods(xpModsOnload);
    }
  }, [xpModsOnload]);


  // ----------------------------------------
  //  STABLE PROVIDER VALUE
  // ----------------------------------------


  const value = useMemo<GameContextValue>(
    () => ({
      player,
      setPlayer,
      character,
      setCharacter,
      xpMods,
      setXpMods,
      fetchPlayerAndCharacter,
      activityTimer,
      playerActivities,
      characterActivities,
      fetchActivities,
      fetchCharacterCurrent,
      characterCurrentActivity,
      setCharacterCurrentActivity,
      populationCentre,
      fetchPopulationCentre,
      loginState,
      loginStreak,
      loginEventAt,
      loginRewardXp,
      loading,
      buildNumber,
      freeTimerLimitSeconds,
      gameSettings,
      onlinePlayerCount,
      setOnlinePlayerCount,
    }),
    [
      player,
      character,
      xpMods,
      playerActivities,
      characterActivities,
      characterCurrentActivity,
      activityTimer,
      fetchPlayerAndCharacter,
      fetchActivities,
      fetchCharacterCurrent,
      loading,
      buildNumber,
      freeTimerLimitSeconds,
      gameSettings,
      onlinePlayerCount,
      populationCentre,
      fetchPopulationCentre,
      loginState,
      loginStreak,
      loginEventAt,
      loginRewardXp,
    ]
  );


  // Don't render children until data is loaded
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading game data...</div>;
  }

  if (error) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Error loading game: {error}</div>;
  }

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};
