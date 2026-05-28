# Quest System Ideas

This note preserves the ideas behind the current Quest-related code before the unused implementation is removed. It is a design snapshot, not a recommendation to keep the existing code as-is.

## What The Quest Code Was Trying To Be

The Quest system was a second timer-backed gameplay loop alongside activities. Activities record what the player did; quests were meant to add an authored prompt, a chosen duration, narrative framing, stage progress, and rewards on top of timed focus.

The core split was:

- `Quest`: a reusable template authored by the app/admin.
- `CharacterQuest`: a per-character copy of a quest template.
- `QuestTimer`: the active timer binding a character to one `CharacterQuest`.
- `QuestResults`: reward metadata for XP, coins, and flexible dynamic rewards.
- `QuestRequirement` and `QuestCompletion`: gating and repeat/frequency tracking.

That split is still the most useful idea in the current design. Templates can change without rewriting a character's historical quest records, while copied character quests can store the exact prompt, stages, duration, and rewards used at the time.

## Intended Player Flow

The original flow appears to have been:

1. The frontend fetches available quest templates.
2. The player chooses a quest and a duration.
3. The backend copies the template into a `CharacterQuest`.
4. The `QuestTimer` enters `waiting`, then starts with the activity timer.
5. When time finishes or the player completes the quest, the character receives rewards.
6. A server message notifies the player of completion and level-ups.

There was also a tutorial/onboarding path: when a recent player was assigned a character, the app tried to attach `[TUTORIAL] Getting started` as that character's initial quest.

## Template Metadata Worth Remembering

Quest templates included several useful content and scheduling concepts:

- `name` and `description` for list/detail display.
- `intro_text` and `outro_text` for narrative framing before and after a timed session.
- `duration_choices`, defaulting to five-minute increments from 5 to 30 minutes.
- `stages`, plus `stages_fixed`, for either ordered or flexible progression steps.
- `category`, with early ideas for trade, recurring, and event quests.
- `is_task_support`, suggesting special quests for task-starting help.
- `levelMin`, `levelMax`, `is_premium`, `canRepeat`, and `frequency` for eligibility.

The frontend Quest modal reflected the simple version of this: choose a quest, inspect its description, choose one of its duration choices, then start it.

## Timer And Reward Ideas

The timer idea was that a quest should behave like a first-class timed session:

- `QuestTimer.change_quest()` reset the old timer, copied a template to `CharacterQuest`, stored the chosen duration, and moved to `waiting`.
- `QuestTimer.get_remaining_time()` calculated the countdown from stored duration and elapsed time.
- `QuestTimer.time_finished()` treated zero remaining time as completion-ready.
- `QuestTimer.complete()` delegated reward application to the character, then emitted a WebSocket/server notification.

The reward model was intentionally flexible:

- XP was intended to be duration based: `xp_rate * quest.duration`.
- Coins could be earned through a character currency account.
- `dynamic_rewards` could call character methods like `apply_<key>` or directly update numeric character fields.
- Level-up notifications were sent as separate server messages.

If this returns later, a clearer reward contract would help: one object shape for results, one spelling for `level_ups` or `levelups`, and an explicit link between template results and copied character quest results.

## Task Support Quest Idea

The Task Support UI was an interesting branch of the Quest concept. Instead of presenting authored quests first, it asked what was blocking the player:

- "Don't know where to start"
- "Feel anxious"
- "Too tired"
- "Fear of failure"

It then suggested a tiny action and offered short durations such as 1, 3, or 5 minutes. This is probably the strongest product idea in the Quest code: use quests as small guided interventions, not only RPG-flavoured todos.

If rebuilt, this could become a separate "guided start" feature backed by ordinary activities, or a lighter quest-like layer that does not need the full template/timer/reward system.

## Eligibility And Progression Ideas

The backend contains early ideas for quest availability:

- Level ranges.
- Premium-only content.
- Repeat prevention.
- Daily, weekly, or monthly frequency limits.
- Prerequisite quests with required completion counts.

The `/eligible/` endpoint currently returns an empty list and leaves the real eligibility call commented out, so this remained mostly design scaffolding. If revived, eligibility should be centralized and tested before being exposed to the UI.

## Admin And Operations Ideas

Quest admin classes were present but commented out. They suggest an intended admin workflow:

- Author quest content and stages.
- Edit duration choices and level gates.
- Add inline rewards.
- Inspect completions.
- Pause or reset quest timers.

There was also a management command that paused both activity and quest timers during maintenance.

## Current Rough Edges To Avoid Recreating

The existing code has several signs of drift:

- The frontend `GameContext` no longer appears to provide `quests` or `questTimer`, while Quest UI components still expect them.
- `Character.complete_quest()` is called with a `CharacterQuest` object from `QuestTimer.complete()`, but the method name/argument suggests XP or a different contract.
- Template `QuestResults` are stored in a one-to-one model, while `copy_quest()` tries to copy reward fields from the template object directly.
- Reward summaries use both `levelups` and `level_ups`.
- `QuestCompletion` and requirement/frequency checks exist, but completion counts do not appear to be updated in the main completion path.
- Some admin registrations are commented out, suggesting the feature was intentionally withdrawn or never fully enabled.

These are good reasons to delete the implementation for now while keeping the concept notes.

## If Quests Return Later

Keep the smaller idea first:

- Treat quests as authored timed prompts, not a parallel task system.
- Keep a template/instance split.
- Store historical quest instances immutably enough that old completions still make sense.
- Make task support a first-class use case.
- Reuse the modern activity timer where possible instead of maintaining two timer paths.
- Define rewards with a single typed schema before wiring UI or WebSockets.
- Add tests for eligibility, copying, completion, rewards, and repeat/frequency limits before exposing the feature.
