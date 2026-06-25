// SupportFlow/supportFlowReducer.ts
// State machine for the support / activity modal flow.

// ---------------------------------------------------------------------------
// Configuration objects – extend these to add new options without touching
// reducer or screen logic.
// ---------------------------------------------------------------------------

export const SUPPORT_ACTIONS = {
  breathing: {
    id: "breathing",
    label: "Breathing exercise",
    videoEmbedUrl: "https://www.youtube-nocookie.com/embed/aXItOY0sLRY",
    steps: [
      "Breathe in slowly for 4 counts.",
      "Hold for 4 counts.",
      "Breathe out slowly for 6 counts.",
      "Repeat 3 times.",
    ],
  },
  eat_drink: {
    id: "eat_drink",
    label: "Eat or drink something",
    steps: [
      "Get a glass of water.",
      "Take 5 slow sips.",
      "Optional: grab a small snack.",
    ],
  },
  toilet: {
    id: "toilet",
    label: "Get moving",
    steps: [
      "Stand up.",
      "Swing your arms around.",
      "Walk up and down a bit.",
      "Come back ready.",
    ],
  },
};

export const ACTIVITY_PRESETS = {
  tiniest_step: {
    id: "tiniest_step",
    label: "Write down the tiniest first step",
    defaultActivityText: "Write down first step on phone or paper",
    durationSeconds: 180,
    placeholder: "Write your next tiny step",
    hint: "This timer will complete after 3 minutes, but you can finish early if you want.",
  },
  priority_three: {
    id: "priority_three",
    label: "Help me choose a task",
    durationSeconds: null,
    placeholder: "What should you start with first?",
    hint: "When you have written down some tasks, pick the one that feels most important or most urgent to start with. Alternatively, I'll pick one at random for you.",
  },
  other: {
    id: "other",
    label: "Something else",
    durationSeconds: null,
    placeholder: "What are you going to do?",
    hint: null,
  },
};

// ---------------------------------------------------------------------------
// Initial context
// ---------------------------------------------------------------------------

const initialCtx = (entrypoint: string | null = null) => ({
  entrypoint,
  supportMenuOrigin: null,
  welcomeMessageLoginState: "none",
  welcomeMessageLoginStreak: 0,
  welcomeMessageRewardXp: 0,
  xpGained: null,
  rewardBaseXp: null,
  rewardXpMultiplier: null,
  rewardLevelUps: [],
  rewardIsAutoStopped: false,
  rewardShowUpgradePrompt: false,
  completedActivityName: null,
  completedActivityElapsedSeconds: null,
  supportActionId: null,
  activityPresetId: null,
  activityText: "",
  durationSeconds: null,
});

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Flow state shape:
 *   { isOpen: false }
 *   | { isOpen: true, screen: Screen, ctx: FlowContext }
 */
// Using loose types here because this reducer handles many action shapes from callers
// that destructure actions dynamically. The typed wrapper in useSupportFlow.ts casts it.
type LooseFlowState =
  | { isOpen: false }
  | { isOpen: true; screen: string; ctx: Record<string, unknown> };

export function supportFlowReducer(state: LooseFlowState, event: Record<string, unknown>): LooseFlowState {
  // Global events that work regardless of current screen
  switch (event.type) {
    case "OPEN_WELCOME_MESSAGE":
      {
        const parsedStreak = Number(event.loginStreak);
        const normalizedStreak = Number.isFinite(parsedStreak) ? parsedStreak : 0;
        const parsedRewardXp = Number(event.loginRewardXp);
        const normalizedRewardXp =
          Number.isFinite(parsedRewardXp) && parsedRewardXp > 0 ? parsedRewardXp : 0;

      return {
        isOpen: true,
        screen: "WELCOME_MESSAGE",
        ctx: {
          ...initialCtx("welcomeMessage"),
          welcomeMessageLoginState:
            typeof event.loginState === "string" && event.loginState.trim()
              ? event.loginState.trim()
              : "none",
          welcomeMessageLoginStreak: normalizedStreak,
          welcomeMessageRewardXp: normalizedRewardXp,
        },
      };
      }

    case "OPEN_SUPPORT_MODE":
      return {
        isOpen: true,
        screen: "SUPPORT_MENU",
        ctx: initialCtx("manualSupport"),
      };

    case "OPEN_ACTIVITY_REWARD":
      {
        const parsedXp = Number(event.xpGained);
        const normalizedXp = Number.isFinite(parsedXp) ? parsedXp : null;
        const parsedElapsedSeconds = Number(event.elapsedSeconds);
        const normalizedElapsedSeconds =
          Number.isFinite(parsedElapsedSeconds) && parsedElapsedSeconds >= 0
            ? parsedElapsedSeconds
            : null;
        const parsedBaseXp = Number(event.baseXp);
        const normalizedBaseXp =
          Number.isFinite(parsedBaseXp) && parsedBaseXp >= 0 ? parsedBaseXp : null;
        const parsedXpMultiplier = Number(event.xpMultiplier);
        const normalizedXpMultiplier =
          Number.isFinite(parsedXpMultiplier) && parsedXpMultiplier > 0
            ? parsedXpMultiplier
            : null;
        const normalizedLevelUps = Array.isArray(event.levelUps)
          ? event.levelUps
              .map((level) => Number(level))
              .filter((level) => Number.isInteger(level) && level > 0)
          : [];
        const normalizedIsAutoStopped = Boolean(event.isAutoStopped);
        const normalizedShowUpgradePrompt = Boolean(event.showUpgradePrompt);

      return {
        isOpen: true,
        screen: "ACTIVITY_REWARD",
        ctx: {
          ...initialCtx("postActivity"),
          xpGained: normalizedXp,
          rewardBaseXp: normalizedBaseXp,
          rewardXpMultiplier: normalizedXpMultiplier,
          rewardLevelUps: normalizedLevelUps,
          rewardIsAutoStopped: normalizedIsAutoStopped,
          rewardShowUpgradePrompt: normalizedShowUpgradePrompt,
          completedActivityName:
            typeof event.activityName === "string" && event.activityName.trim()
              ? event.activityName.trim()
              : null,
          completedActivityElapsedSeconds: normalizedElapsedSeconds,
        },
      };
      }

    case "CLOSE":
      return { isOpen: false };

    default:
      break;
  }

  // Remaining events require the modal to be open
  if (!state.isOpen) return state;

  // Narrow to open state — TypeScript can't narrow through the !state.isOpen guard
  // when using spread in return values, so we cast explicitly.
  const openState = state as { isOpen: true; screen: string; ctx: Record<string, unknown> };

  switch (event.type) {
    case "GO_SUPPORT_MENU":
      return {
        ...openState,
        screen: "SUPPORT_MENU",
        ctx: {
          ...openState.ctx,
          supportMenuOrigin: event.origin ?? openState.ctx.supportMenuOrigin,
        },
      };

    case "BACK_FROM_SUPPORT_MENU":
      if (openState.ctx.entrypoint === "welcomeMessage") {
        return { ...openState, screen: "WELCOME_MESSAGE" };
      }
      if (openState.ctx.entrypoint === "postActivity") {
        return { ...openState, screen: "ACTIVITY_REWARD" };
      }
      return openState;

    case "READY_START":
      return {
        ...openState,
        screen: "READY_ACTIVITY_MENU",
        ctx: { ...openState.ctx, activityPresetId: null },
      };

    case "NOT_READY":
      return {
        ...openState,
        screen: "NOT_READY_MENU",
        ctx: { ...openState.ctx, supportActionId: null },
      };

    case "PICK_ACTIVITY_PRESET": {
      const preset = ACTIVITY_PRESETS[event.preset as keyof typeof ACTIVITY_PRESETS] as
        | (typeof ACTIVITY_PRESETS[keyof typeof ACTIVITY_PRESETS] & { defaultActivityText?: string })
        | undefined;
      const newCtx = {
        ...openState.ctx,
        activityPresetId: event.preset,
        durationSeconds: preset?.durationSeconds ?? null,
        activityText: preset?.defaultActivityText ?? "",
      };
      return { ...openState, screen: "ACTIVITY_INPUT", ctx: newCtx };
    }

    case "SET_ACTIVITY_TEXT":
      return { ...openState, ctx: { ...openState.ctx, activityText: event.text } };

    case "SET_DURATION_SECONDS":
      return {
        ...openState,
        ctx: { ...openState.ctx, durationSeconds: event.seconds },
      };

    case "PICK_SUPPORT_ACTION":
      return {
        ...openState,
        screen: "SUPPORT_DETAIL",
        ctx: { ...openState.ctx, supportActionId: event.id },
      };

    case "POST_SUPPORT_TRY_TASK":
      return {
        ...openState,
        screen: "READY_ACTIVITY_MENU",
        ctx: { ...openState.ctx, activityPresetId: null },
      };

    case "POST_SUPPORT_MORE_SUPPORT":
      return {
        ...openState,
        screen: "NOT_READY_MENU",
        ctx: { ...openState.ctx, supportActionId: null },
      };

    case "SHOW_POST_SUPPORT_MENU":
      return { ...openState, screen: "POST_SUPPORT_MENU" };

    default:
      return openState;
  }
}
