// Non-auth, per-user UI preferences persisted in localStorage. Listed here so
// logout can clear them alongside auth tokens without leaking a previous
// user's preferences to the next person on a shared device.
export const TASKS_HIDE_COMPLETED_KEY = "tasks.hideCompleted";

export function clearUserPreferences(): void {
  localStorage.removeItem(TASKS_HIDE_COMPLETED_KEY);
}
