import { test } from '@playwright/test';
import { checkA11y, expectNoA11yViolations } from '../utils/a11y';

test.describe('Page Accessibility', () => {
  test('Home page is accessible', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: 'Turn effort into momentum' }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Login page is accessible', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('heading', { name: /log in/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Register page is accessible', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('heading', { name: /waiting list/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Privacy policy page is accessible', async ({ page }) => {
    await page.goto('/privacy-policy');
    await page.getByRole('heading', { name: 'Privacy Policy' }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Terms of service page is accessible', async ({ page }) => {
    await page.goto('/terms-of-service');
    await page.getByRole('heading', { name: 'Terms of Service' }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('404 page should be accessible', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await page.getByRole('heading', { name: /page not found/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Forgot password page is accessible', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('heading', { name: /forgot password/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Support page is accessible', async ({ page }) => {
    await page.goto('/support');
    await page.getByRole('heading', { name: 'Support', exact: true }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });
});

test.describe('Authenticated Page Accessibility', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });


  test('Timer page is accessible', async ({ page }) => {
    await page.goto('/timer');
    await page.getByRole('heading', { name: /timer/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });


  test('Account page is accessible', async ({ page }) => {
    await page.goto('/account');
    await page.getByRole('heading', { name: 'Account', exact: true }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Onboarding page is accessible', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('dialog').waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Upgrade page is accessible', async ({ page }) => {
    await page.goto('/upgrade');
    await page.getByRole('heading', { name: /upgrade to premium/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Payment success page is accessible', async ({ page }) => {
    await page.goto('/payment-success');
    await page.getByRole('heading', { name: /payment successful/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Payment cancelled page is accessible', async ({ page }) => {
    await page.goto('/payment-cancelled');
    await page.getByRole('heading', { name: /payment cancelled/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Edit account page is accessible', async ({ page }) => {
    await page.goto('/edit-account');
    await page.getByRole('heading', { name: /edit account/i }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Tasks page is accessible', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Projects page is accessible', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('Activities page is accessible', async ({ page }) => {
    await page.goto('/activities');
    await page.getByRole('heading', { name: 'Activities', exact: true }).waitFor();
    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });
});
