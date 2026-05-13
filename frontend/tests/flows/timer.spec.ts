import { expect, test } from '@playwright/test';

test.describe('Timer flow', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('can start and stop an activity', async ({ page }) => {
    await page.goto('/timer');
    await expect(page.getByRole('heading', { name: 'Activity timer' })).toBeVisible();

    // Dismiss welcome-back modal if it appears
    const dialog = page.getByRole('dialog');
    try {
      await dialog.waitFor({ state: 'visible', timeout: 3000 });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    } catch { /* no modal */ }

    const timerSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Activity timer' }),
    });
    const activityInput = timerSection.getByPlaceholder(/what are you working on/i);
    await activityInput.fill('Flow test activity');

    await timerSection.getByRole('button', { name: 'Start' }).click();
    await expect(timerSection.getByRole('button', { name: 'Stop' })).toBeVisible();

    await timerSection.getByRole('button', { name: 'Stop' }).click();
    await expect(timerSection.getByRole('button', { name: 'Start' })).toBeVisible();
  });
});
