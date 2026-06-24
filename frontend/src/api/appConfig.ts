// src/api/appConfig.ts
import type { AppConfig } from "../types";
import { apiFetch } from "../utils/api";

export async function fetchAppConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>("/app_config/");
}
