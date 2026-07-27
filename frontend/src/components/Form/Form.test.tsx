import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Form from "./Form";

describe("Form", () => {
  it("shows required validation after blur", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());

    render(
      <Form
        title="Test form"
        onSubmit={onSubmit}
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            value: "",
            onChange: vi.fn(),
            required: true,
          },
        ]}
      />
    );

    const input = screen.getByLabelText(/email/i);
    await user.click(input);
    await user.tab();

    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("prefers server field errors over local validation messages", () => {
    render(
      <Form
        title="Test form"
        onSubmit={(event) => event.preventDefault()}
        fieldErrors={{ email: ["Email already exists"] }}
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            value: "",
            onChange: vi.fn(),
            required: true,
          },
        ]}
      />
    );

    expect(screen.getByText("Email already exists")).toBeInTheDocument();
    expect(screen.queryByText("This field is required")).not.toBeInTheDocument();
  });

  it("validates required checkboxes against their checked state", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <Form
        title="Terms form"
        onSubmit={(event) => event.preventDefault()}
        fields={[
          {
            name: "agree_to_terms",
            label: "I agree",
            type: "checkbox",
            checked: false,
            onChange: vi.fn(),
            required: true,
          },
        ]}
      />
    );

    await user.click(screen.getByRole("checkbox"));
    await user.tab();

    expect(screen.getByText("This field is required")).toBeInTheDocument();

    rerender(
      <Form
        title="Terms form"
        onSubmit={(event) => event.preventDefault()}
        fields={[
          {
            name: "agree_to_terms",
            label: "I agree",
            type: "checkbox",
            checked: true,
            onChange: vi.fn(),
            required: true,
          },
        ]}
      />
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByText("This field is required")).not.toBeInTheDocument();
  });

  it("disables the submit button while submitting", () => {
    render(
      <Form
        title="Submitting form"
        onSubmit={(event) => event.preventDefault()}
        isSubmitting
      />
    );

    expect(screen.getByRole("button", { name: "Submitting form" })).toBeDisabled();
    expect(screen.getByText("Submitting…")).toBeInTheDocument();
  });
});
