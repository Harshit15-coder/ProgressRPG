import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ComingSoonPanel from "./ComingSoonPanel";

describe("ComingSoonPanel", () => {
  it("renders the capitalized label and a coming-soon message", () => {
    render(<ComingSoonPanel itemLabelPlural="skills" />);

    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("renders no interactive CRUD controls", () => {
    render(<ComingSoonPanel itemLabelPlural="skills" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
