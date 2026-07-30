import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LibraryPage from "./LibraryPage";

const mockUseFeatureFlag = vi.fn();

vi.mock("../../hooks/useFeatureFlag", () => ({
  useFeatureFlag: (flag: string) => mockUseFeatureFlag(flag),
}));

vi.mock("../../components/TasksPanel/TasksPanel", () => ({
  default: () => <div data-testid="tasks-panel">Tasks panel</div>,
}));

vi.mock("../../components/ActivitiesPanel/ActivitiesPanel", () => ({
  default: () => <div data-testid="activities-panel">Activities panel</div>,
}));

vi.mock("../../components/SkillsPanel/SkillsPanel", () => ({
  default: () => <div data-testid="skills-panel">Skills panel</div>,
}));

vi.mock("../../components/ComingSoonPanel/ComingSoonPanel", () => ({
  default: ({ itemLabelPlural }: { itemLabelPlural: string }) => (
    <div data-testid="coming-soon-panel">{itemLabelPlural} coming soon</div>
  ),
}));

describe("LibraryPage", () => {
  describe("when all feature flags are enabled", () => {
    beforeEach(() => {
      mockUseFeatureFlag.mockReturnValue(true);
    });

    it("defaults to the Activities tab, rendering ActivitiesPanel", () => {
      render(<LibraryPage />);

      expect(screen.getByRole("heading", { name: "Your library" })).toBeInTheDocument();
      expect(screen.getByTestId("activities-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("tasks-panel")).not.toBeInTheDocument();
    });

    it("switches to the Tasks tab, rendering TasksPanel", async () => {
      const user = userEvent.setup();
      render(<LibraryPage />);

      await user.click(screen.getByRole("tab", { name: "Tasks" }));

      expect(screen.getByTestId("tasks-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("activities-panel")).not.toBeInTheDocument();
    });

    it("switches to the Skills tab, rendering SkillsPanel", async () => {
      const user = userEvent.setup();
      render(<LibraryPage />);

      await user.click(screen.getByRole("tab", { name: "Skills" }));

      expect(screen.getByTestId("skills-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("coming-soon-panel")).not.toBeInTheDocument();
    });

    it("does not render Projects or Categories tabs", () => {
      render(<LibraryPage />);

      expect(screen.queryByRole("tab", { name: "Projects" })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Categories" })).not.toBeInTheDocument();
    });
  });

  describe("when a tab's feature flag is disabled", () => {
    beforeEach(() => {
      mockUseFeatureFlag.mockReturnValue(false);
    });

    it("still shows the Tasks tab but renders a coming-soon notice", async () => {
      const user = userEvent.setup();
      render(<LibraryPage />);

      await user.click(screen.getByRole("tab", { name: "Tasks" }));

      expect(screen.queryByTestId("tasks-panel")).not.toBeInTheDocument();
      expect(screen.getByTestId("coming-soon-panel")).toHaveTextContent("tasks coming soon");
    });

    it("still shows the Skills tab but renders a coming-soon notice", async () => {
      const user = userEvent.setup();
      render(<LibraryPage />);

      await user.click(screen.getByRole("tab", { name: "Skills" }));

      expect(screen.queryByTestId("skills-panel")).not.toBeInTheDocument();
      expect(screen.getByTestId("coming-soon-panel")).toHaveTextContent("skills coming soon");
    });

    it("always renders the Activities tab regardless of flags", async () => {
      const user = userEvent.setup();
      render(<LibraryPage />);

      await user.click(screen.getByRole("tab", { name: "Activities" }));

      expect(screen.getByTestId("activities-panel")).toBeInTheDocument();
    });
  });
});
