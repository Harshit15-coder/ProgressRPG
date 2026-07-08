import { expect, test } from '@playwright/test';
import { stabilizeTimerPage } from '../utils/authenticatedPage';

test.describe('Unified timer homepage (flag on)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('blank start, label, click-to-edit, and stop happy path', async ({ page }) => {
    await stabilizeTimerPage(page, { unifiedHomepage: true });

    try {
      await page.goto('/timer');
      await expect(page.getByRole('heading', { name: 'Activity timer' })).toBeAttached();

      const section = page.locator('section').filter({
        has: page.getByRole('heading', { name: 'Activity timer' }),
      });

      // Legacy "Recent activities" feed is not rendered under the flag.
      await expect(page.getByRole('heading', { name: 'Recent activities' })).toHaveCount(0);

      await section.getByRole('button', { name: 'Start blank' }).click();
      await expect(section.getByRole('button', { name: 'Stop' })).toBeVisible();

      const input = section.getByRole('combobox', { name: 'Activity name' });
      await expect(input).toBeVisible();
      await input.fill('Flow test activity');
      await input.press('Enter');

      const labelButton = section.getByRole('button', { name: /Flow test activity/ });
      await expect(labelButton).toBeVisible();
      await expect(section.getByRole('combobox')).toHaveCount(0);

      // Click-to-edit: re-opens the input pre-filled with the current label.
      await labelButton.click();
      const editInput = section.getByRole('combobox', { name: 'Activity name' });
      await expect(editInput).toHaveValue('Flow test activity');

      // Escape cancels — no request, label unchanged.
      await editInput.press('Escape');
      await expect(section.getByRole('button', { name: /Flow test activity/ })).toBeVisible();

      await section.getByRole('button', { name: 'Stop' }).click();

      // Stopping opens the activity-complete reward dialog (shared with the
      // legacy flow via useSupportFlow) — dismiss it to get back to the input state.
      await page.getByRole('button', { name: 'Back to timer' }).click();

      await expect(section.getByRole('button', { name: 'Start blank' })).toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
});

test.describe('Unified timer homepage (flag off regression guard)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('renders the legacy timer + activity feed unchanged', async ({ page }) => {
    await stabilizeTimerPage(page, { unifiedHomepage: false });

    try {
      await page.goto('/timer');
      await expect(page.getByRole('heading', { name: 'Activity timer' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Recent activities' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start blank' })).toHaveCount(0);
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
});
