import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import LibraryPage from "./LibraryPage";

vi.mock("../TasksPage/TasksPage", () => ({
  default: ({ showHeading }: { showHeading?: boolean }) => (
    <div data-testid="tasks-panel" data-show-heading={String(showHeading)}>
      Tasks panel
    </div>
  ),
}));

vi.mock("../ActivitiesPage", () => ({
  default: ({ showHeading }: { showHeading?: boolean }) => (
    <div data-testid="activities-panel" data-show-heading={String(showHeading)}>
      Activities panel
    </div>
  ),
}));

vi.mock("../../components/ComingSoonPanel/ComingSoonPanel", () => ({
  default: ({ itemLabelPlural }: { itemLabelPlural: string }) => (
    <div data-testid="coming-soon-panel">{itemLabelPlural} coming soon</div>
  ),
}));

describe("LibraryPage", () => {
  it("defaults to the Tasks tab, rendering TasksPage without its own heading", () => {
    render(<LibraryPage />);

    expect(screen.getByRole("heading", { name: "Your library" })).toBeInTheDocument();
    const tasksPanel = screen.getByTestId("tasks-panel");
    expect(tasksPanel).toBeInTheDocument();
    expect(tasksPanel).toHaveAttribute("data-show-heading", "false");
    expect(screen.queryByTestId("coming-soon-panel")).not.toBeInTheDocument();
  });

  it("switches to the Activities tab, rendering ActivitiesPage without its own heading", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    await user.click(screen.getByRole("tab", { name: "Activities" }));

    const activitiesPanel = screen.getByTestId("activities-panel");
    expect(activitiesPanel).toBeInTheDocument();
    expect(activitiesPanel).toHaveAttribute("data-show-heading", "false");
    expect(screen.queryByTestId("tasks-panel")).not.toBeInTheDocument();
  });

  it("switches to the Skills tab, showing the coming-soon placeholder", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    await user.click(screen.getByRole("tab", { name: "Skills" }));

    expect(screen.getByTestId("coming-soon-panel")).toHaveTextContent("skills coming soon");
    expect(screen.queryByTestId("tasks-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("activities-panel")).not.toBeInTheDocument();
  });
});
