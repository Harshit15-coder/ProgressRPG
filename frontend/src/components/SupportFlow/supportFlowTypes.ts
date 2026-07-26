// SupportFlow/supportFlowTypes.ts
// Shared types describing supportFlowReducer's state/action shape. The
// reducer itself stays loosely typed (see its own comment) since it handles
// many action shapes destructured dynamically; this is the single typed view
// of that shape shared by useSupportFlow (the state owner) and
// SupportFlowModal (the renderer), so they can't drift apart from each other.

/** Loose action type — the reducer handles all narrowing internally. */
export type FlowAction = { type: string; [key: string]: unknown };

export interface FlowCtx {
  activityText?: string;
  durationSeconds?: number | null;
  activityPresetId?: string | null;
  supportMenuOrigin?: string | null;
  supportActionId?: string | null;
  welcomeMessageLoginState?: string;
  welcomeMessageLoginStreak?: number;
  welcomeMessageRewardXp?: number;
  xpGained?: number | null;
  rewardBaseXp?: number | null;
  rewardXpMultiplier?: number | null;
  rewardTaskXpMultiplier?: number | null;
  rewardLevelUps?: number[];
  rewardIsAutoStopped?: boolean;
  rewardShowUpgradePrompt?: boolean;
  completedActivityName?: string | null;
  completedActivityElapsedSeconds?: number | null;
  completedActivityTaskId?: number | null;
  [key: string]: unknown;
}

export type FlowState =
  | { isOpen: false }
  | { isOpen: true; screen: string; ctx: FlowCtx };
