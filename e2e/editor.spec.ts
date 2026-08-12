import { expect, test } from '@playwright/test';

test('remixes the starter and layers the selected voice', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await expect(page.locator('input[aria-label^="Label for"]')).toHaveCount(8);

  await page.getByRole('button', { name: '+ Add a layer' }).click();
  await expect(page.locator('input[aria-label="Label for Layer 2"]')).toBeVisible();
  await expect(page.locator('input[aria-label^="Label for"]')).toHaveCount(9);
});
