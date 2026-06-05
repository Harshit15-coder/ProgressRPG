import { expect, test } from '@playwright/test';
import {
  mockSuccessfulSubscriptionSync,
  stabilizeTimerPage,
  visitAuthenticatedPage,
} from '../utils/authenticatedPage';

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
    await stabilizeTimerPage(page);

    try {
      await page.goto('/timer');
      await expect(page.getByRole('heading', { name: 'Timer', exact: true })).toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });

  test('Account page loads', async ({ page }) => {
    await visitAuthenticatedPage(page, '/account');
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Player', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
  });

  test('Edit account page loads', async ({ page }) => {
    await visitAuthenticatedPage(page, '/edit-account');
    await expect(page.getByRole('heading', { name: /edit account/i })).toBeVisible();
  });

  test('Upgrade page loads', async ({ page }) => {
    await visitAuthenticatedPage(page, '/upgrade');
    await expect(page.getByRole('heading', { name: /upgrade to premium/i })).toBeVisible();
    await expect(
      page.getByText(/you are already subscribed!|premium membership for focused progress\./i)
    ).toBeVisible();
  });

  test('Payment success page loads', async ({ page }) => {
    await mockSuccessfulSubscriptionSync(page);

    try {
      await visitAuthenticatedPage(page, '/payment-success');
      await expect(page.getByRole('heading', { name: /you're premium/i })).toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });

  test('Payment cancelled page loads', async ({ page }) => {
    await visitAuthenticatedPage(page, '/payment-cancelled');
    await expect(page.getByRole('heading', { name: /payment cancelled/i })).toBeVisible();
  });

  test('Tasks page loads', async ({ page }) => {
    await visitAuthenticatedPage(page, '/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /add task/i })).toBeVisible();
  });

  test('Projects page loads', async ({ page }) => {
    await visitAuthenticatedPage(page, '/projects');
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /add project/i })).toBeVisible();
  });

  test('Activities page loads', async ({ page }) => {
    await visitAuthenticatedPage(page, '/activities');
    await expect(page.getByRole('heading', { name: 'Activities', exact: true })).toBeVisible();
  });

  test('Tutorial modal opens from the navbar', async ({ page }) => {
    await stabilizeTimerPage(page);

    try {
      await page.goto('/timer');
      await expect(page.getByRole('heading', { name: 'Timer', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Open tutorial' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
});
