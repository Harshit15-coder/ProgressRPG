import { expect, test } from '@playwright/test';
import { stabilizeAuthenticatedPlayer } from '../utils/authenticatedPage';

/**
 * End-to-end coverage for the tasks core loop (issue #469):
 * - starting an activity linked to a task via the row play button
 * - the show/hide-complete filter and its persisted preference
 */

async function createTask(page: import('@playwright/test').Page, taskName: string) {
  await page.getByPlaceholder('New task name').fill(taskName);
  const [postResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/tasks/') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /add task/i }).click(),
  ]);
  expect(postResponse.status()).toBeLessThan(300);
  await page.waitForResponse(
    (r) => r.url().includes('/tasks/') && r.request().method() === 'GET',
  );
}

test.describe('Tasks core loop', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('starts a linked activity from the task play button', async ({ page }) => {
    const taskName = `Play task ${Date.now()}`;

    await stabilizeAuthenticatedPlayer(page);

    try {
      await page.goto('/tasks');
      await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();

      await createTask(page, taskName);

      // The play button lives in a hover-revealed row; hover the row first.
      const rowButton = page.getByRole('button', { name: `Edit task ${taskName}` }).first();
      await expect(rowButton).toBeVisible({ timeout: 10000 });
      await rowButton.hover();

      await page.getByRole('button', { name: `Start working on ${taskName}` }).click();

      // Play starts a linked activity and routes to the timer.
      await expect(page).toHaveURL(/\/timer/);
      await expect(page.getByRole('heading', { name: 'Timer', exact: true })).toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });

  test('hides completed tasks and remembers the show/hide preference', async ({ page }) => {
    const taskName = `Filter task ${Date.now()}`;

    await stabilizeAuthenticatedPlayer(page);

    try {
      await page.goto('/tasks');
      await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();

      await createTask(page, taskName);

      const checkbox = page.getByRole('checkbox', { name: `Mark ${taskName} as complete` });
      await expect(checkbox).toBeVisible({ timeout: 10000 });

      // Completing the task hides it under the default "hide complete" filter.
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/tasks/') && r.request().method() === 'PATCH',
        ),
        checkbox.check(),
      ]);
      await expect(
        page.getByRole('checkbox', { name: `Mark ${taskName} as complete` }),
      ).toHaveCount(0);

      // Revealing complete tasks brings it back.
      await page.getByRole('button', { name: 'Show complete' }).click();
      await expect(page.getByText(taskName)).toBeVisible();

      // The preference survives a reload (persisted to localStorage).
      await page.reload();
      await expect(page.getByRole('button', { name: 'Hide complete' })).toBeVisible();
      await expect(page.getByText(taskName)).toBeVisible();

      // Clean up so repeated runs stay deterministic.
      await page.getByRole('button', { name: `Edit task ${taskName}` }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByText(taskName)).not.toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
});
