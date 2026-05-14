import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import Achievements from "./Achievements";

const nextGoalAchievements = [
  {
    type: "level",
    label: "Level",
    symbol: "⭐",
    tier: 2,
    complete: false,
    color: "green",
    value: 2,
    threshold: 5,
    next_threshold: 10,
  },
  {
    type: "time",
    label: "Total time",
    symbol: "⏱️",
    tier: 2,
    complete: false,
    color: "green",
    value: 1800,
    threshold: 18000,
    next_threshold: 72000,
  },
  {
    type: "activities",
    label: "Activities",
    symbol: "✅",
    tier: 2,
    complete: false,
    color: "green",
    value: 5,
    threshold: 25,
    next_threshold: 100,
  },
];

describe("Achievements", () => {
  it("renders next-goal achievement badges", () => {
    render(<Achievements achievements={nextGoalAchievements} />);

    expect(screen.getByRole("heading", { name: "Achievements" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Level" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Total time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activities" })).toBeInTheDocument();
    expect(screen.getAllByText("Tier 2")).toHaveLength(3);
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("30m / 5h")).toBeInTheDocument();
    expect(screen.getByText("5 / 25")).toBeInTheDocument();
  });

  it("renders completed max-tier achievements", () => {
    render(
      <Achievements
        achievements={[
          {
            type: "level",
            label: "Level",
            symbol: "⭐",
            tier: 5,
            complete: true,
            color: "gold",
            value: 50,
            threshold: 50,
            next_threshold: null,
          },
        ]}
      />
    );

    expect(screen.getByText("Tier 5")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Max tier")).toBeInTheDocument();
  });
});
