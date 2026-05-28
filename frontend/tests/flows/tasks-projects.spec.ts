import { expect, test } from '@playwright/test';

test.describe('Task flow', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('can create and delete a task', async ({ page }) => {
    const taskName = `Flow test task ${Date.now()}`;

    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();

    await page.getByPlaceholder('New task name').fill(taskName);
    const [taskPostResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/tasks/') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /add task/i }).click(),
    ]);
    expect(taskPostResponse.status()).toBeLessThan(300);
    await page.waitForResponse(r => r.url().includes('/tasks/') && r.request().method() === 'GET');

    const taskItem = page.locator('button', { hasText: taskName });
    await expect(taskItem).toBeVisible({ timeout: 10000 });

    // Open modal and delete
    await taskItem.click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete' }).last().click(); // confirm
    await expect(taskItem).not.toBeVisible();
  });
});

test.describe('Project flow', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('can create and delete a project', async ({ page }) => {
    const projectName = `Flow test project ${Date.now()}`;

    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();

    await page.getByPlaceholder('New project name').fill(projectName);
    const [projectPostResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/projects/') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /add project/i }).click(),
    ]);
    expect(projectPostResponse.status()).toBeLessThan(300);
    await page.waitForResponse(r => r.url().includes('/projects/') && r.request().method() === 'GET');

    const projectItem = page.locator('button', { hasText: projectName });
    await expect(projectItem).toBeVisible({ timeout: 10000 });

    await projectItem.click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await expect(projectItem).not.toBeVisible();
  });
});
