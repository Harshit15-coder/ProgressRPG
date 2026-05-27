import { expect, test } from '@playwright/test';

test.describe('Public page smoke tests', () => {
  test('Home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Turn effort into momentum' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeVisible();
  });

  test('Login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /log in/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log In', exact: true }).last()).toBeVisible();
  });

  test('Register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /waiting list/i })).toBeVisible();
  });

  test('Forgot password page loads', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /forgot password/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  });

  test('Privacy policy page loads', async ({ page }) => {
    await page.goto('/privacy-policy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  });

  test('Terms of service page loads', async ({ page }) => {
    await page.goto('/terms-of-service');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });

  test('Support page loads', async ({ page }) => {
    await page.goto('/support');
    await expect(page.getByRole('heading', { name: 'Support', exact: true })).toBeVisible();
  });

  test('404 page loads for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
  });
});

test.describe('Authenticated page smoke tests', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('Timer page loads', async ({ page }) => {
    await page.goto('/timer');
    await expect(page.getByRole('heading', { name: /timer/i })).toBeVisible();
  });

  test('Account page loads', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Player' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  });

  test('Edit account page loads', async ({ page }) => {
    await page.goto('/edit-account');
    await expect(page.getByRole('heading', { name: /edit account/i })).toBeVisible();
  });

  test('Upgrade page loads', async ({ page }) => {
    await page.goto('/upgrade');
    await expect(page.getByRole('heading', { name: /upgrade to premium/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /premium membership/i })).toBeVisible();
  });

  test('Payment success page loads', async ({ page }) => {
    await page.goto('/payment-success');
    await expect(page.getByRole('heading', { name: /payment successful/i })).toBeVisible();
  });

  test('Payment cancelled page loads', async ({ page }) => {
    await page.goto('/payment-cancelled');
    await expect(page.getByRole('heading', { name: /payment cancelled/i })).toBeVisible();
  });

  test('Tasks page loads', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /add task/i })).toBeVisible();
  });

  test('Projects page loads', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /add project/i })).toBeVisible();
  });

  test('Activities page loads', async ({ page }) => {
    await page.goto('/activities');
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible();
  });

  test('Onboarding page loads', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
