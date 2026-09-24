import { expect, test } from '@playwright/test';

test('creates a self-contained share link for a layered composition', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Clipboard unavailable')) },
      configurable: true,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await page.getByRole('button', { name: '+ Add a layer' }).click();

  await page.getByRole('button', { name: 'Share' }).click();
  const fallback = page.locator('.share-fallback input');
  await expect(fallback).toHaveValue(/#audle=/);
  await page.goto(await fallback.inputValue());
  await expect(page.getByRole('heading', { name: 'Made for this moment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play shared Audle' })).toBeVisible();
});
