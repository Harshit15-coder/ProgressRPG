import { test } from '@playwright/test';
import { checkA11y, expectNoA11yViolations } from './utils/a11y';

test.describe('Authenticated accessibility', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('timer screen has no obvious accessibility violations', async ({ page }) => {
    await page.goto('/timer');
    await page.getByRole('heading', { name: 'Activity timer' }).waitFor();

    const results = await checkA11y(page);
    expectNoA11yViolations(results);
  });
});
