import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSupportFlow } from "./useSupportFlow";

describe("useSupportFlow", () => {
  it("keeps the support flow open when starting an activity is cancelled", async () => {
    const onStartActivity = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useSupportFlow({ onStartActivity }));

    act(() => {
      result.current.openSupportMode();
    });
    act(() => {
      result.current.flowDispatch({ type: "READY_START" });
    });
    act(() => {
      result.current.flowDispatch({ type: "PICK_ACTIVITY_PRESET", preset: "other" });
    });
    act(() => {
      result.current.flowDispatch({ type: "SET_ACTIVITY_TEXT", text: "New support task" });
    });

    await act(async () => {
      await result.current.handleConfirmActivity();
    });

    expect(onStartActivity).toHaveBeenCalledWith({
      activityText: "New support task",
      durationSeconds: null,
    });
    expect(result.current.flowState).toMatchObject({
      isOpen: true,
      screen: "ACTIVITY_INPUT",
    });
  });
});
