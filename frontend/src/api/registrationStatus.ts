// src/api/registrationStatus.ts
import { API_BASE_URL } from "../config";
import type { RegistrationStatus } from "../types";

const API_URL = `${API_BASE_URL}/api/v1/registration_status/`;

export async function fetchRegistrationStatus(): Promise<RegistrationStatus> {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error("Unable to fetch registration status");
  }
  return response.json() as Promise<RegistrationStatus>;
}
