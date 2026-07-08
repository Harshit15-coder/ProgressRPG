import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "../../components/Tooltip/Tooltip";
import AchievementBadges from "./AchievementBadges";

const achievements = [
  {
    type: "level",
    label: "Player level",
    symbol: "⭐",
    tier: 2,
    complete: false,
    color: "green",
    value: 2,
    threshold: 5,
    next_threshold: 10,
  },
  {
    type: "activities",
    label: "Activities",
    symbol: "✅",
    tier: 5,
    complete: true,
    color: "gold",
    value: 2000,
    threshold: 2000,
    next_threshold: null,
  },
];

function renderBadges(props: Partial<React.ComponentProps<typeof AchievementBadges>> = {}) {
  return render(
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <AchievementBadges achievements={achievements} {...props} />
    </TooltipProvider>
  );
}

describe("AchievementBadges", () => {
  it("renders nothing when there are no achievements", () => {
    const { container } = renderBadges({ achievements: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an accessible badge per achievement with an aria-label summarizing state", () => {
    renderBadges();

    expect(
      screen.getByRole("button", { name: "Level: 3 to next tier" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Activities: Complete — max tier",
      })
    ).toBeInTheDocument();
  });

  it("shows a tooltip with the renamed label and remaining progress on focus", async () => {
    const user = userEvent.setup();
    renderBadges();

    await user.tab();

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Level");
    expect(tooltip).toHaveTextContent("3 to next tier");
    expect(tooltip).not.toHaveTextContent("Tier");
  });
});
