import { test, expect } from '@playwright/test';
import { checkA11y, expectNoA11yViolations } from '../utils/a11y';
import { stabilizeAuthenticatedPlayer } from '../utils/authenticatedPage';

/**
 * Accessibility coverage for the tasks core loop (issue #469): the tasks page,
 * its add-task autocomplete input, and the task edit dialog.
 */

test.describe('Tasks page accessibility', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('tasks page and add-task input have no detectable violations', async ({ page }) => {
    await stabilizeAuthenticatedPlayer(page);
    await page.goto('/tasks');
    await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor();

    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });

  test('task edit dialog is accessible', async ({ page }) => {
    const taskName = `A11y task ${Date.now()}`;

    await stabilizeAuthenticatedPlayer(page);
    await page.goto('/tasks');
    await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor();

    await page.getByPlaceholder('New task name').fill(taskName);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/tasks/') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: /add task/i }).click(),
    ]);
    await page.waitForResponse(
      (r) => r.url().includes('/tasks/') && r.request().method() === 'GET',
    );

    await page.getByRole('button', { name: `Edit task ${taskName}` }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const results = await checkA11y(page, { include: ['[role="dialog"]'] });
    expectNoA11yViolations(results);

    // Clean up the task created for this scan.
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await dialog.getByRole('button', { name: 'Delete' }).click();
  });
});
