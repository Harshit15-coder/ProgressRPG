import React from "react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "@testing-library/react";

import RegisterPage from "./RegisterPage";

const mockUseRegistrationStatus = vi.fn();

vi.mock("../../hooks/useRegistrationStatus", () => ({
  useRegistrationStatus: () => mockUseRegistrationStatus(),
}));

vi.mock("../../hooks/useRegister", () => ({
  default: () => ({ register: vi.fn(), characterAvailable: true }),
}));

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

describe("RegisterPage", () => {
  it("renders the kill-switch fallback when registration_enabled is false", () => {
    mockUseRegistrationStatus.mockReturnValue({
      data: {
        registration_open: true,
        registration_enabled: false,
        self_serve_registration: false,
      },
      isLoading: false,
    });

    renderRegisterPage();

    expect(
      screen.getByRole("heading", { name: "Registration is currently unavailable" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Account" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Registration is temporarily full/i)).not.toBeInTheDocument();
  });

  it("renders the kill-switch fallback even for invited users", () => {
    mockUseRegistrationStatus.mockReturnValue({
      data: {
        registration_open: true,
        registration_enabled: false,
        self_serve_registration: false,
      },
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={["/waitlist/redeem/some-invite-token"]}>
        <Routes>
          <Route path="/waitlist/redeem/:token" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Registration is currently unavailable" })
    ).toBeInTheDocument();
  });

  it("renders the registration form when registration is enabled and cap not reached", () => {
    mockUseRegistrationStatus.mockReturnValue({
      data: {
        registration_open: true,
        registration_enabled: true,
        self_serve_registration: false,
      },
      isLoading: false,
    });

    renderRegisterPage();

    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
  });

  it("requires an invite code when self-serve registration is off", () => {
    mockUseRegistrationStatus.mockReturnValue({
      data: {
        registration_open: true,
        registration_enabled: true,
        self_serve_registration: false,
      },
      isLoading: false,
    });

    renderRegisterPage();

    expect(screen.getByLabelText(/invite code/i)).toBeRequired();
  });

  it("makes the invite code optional when self-serve registration is on", () => {
    mockUseRegistrationStatus.mockReturnValue({
      data: {
        registration_open: true,
        registration_enabled: true,
        self_serve_registration: true,
      },
      isLoading: false,
    });

    renderRegisterPage();

    expect(screen.getByLabelText(/invite code \(optional\)/i)).not.toBeRequired();
  });
});
