import { expect, test } from '@playwright/test';

test('creates a self-contained share link for a layered composition', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await page.getByRole('button', { name: '+ Add a layer' }).click();

  await page.getByRole('button', { name: 'Share' }).click();
  const fallback = page.locator('.share-fallback input');
  const copied = page.getByRole('status').filter({ hasText: 'Link copied. Send the beat.' });
  await expect
    .poll(async () => (await fallback.count()) + (await copied.count()))
    .toBeGreaterThan(0);
  if (await fallback.count()) {
    await expect(fallback).toHaveValue(/#audle=/);
  }
});
