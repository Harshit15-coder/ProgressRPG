export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
export const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8000/api/v1';
export const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? 'playwright@example.com';
export const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'correcthorsebatterystaple';
export const TEST_USER_STORAGE_STATE_PATH = 'playwright/.auth/user.json';
