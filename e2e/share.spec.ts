import { expect, test, type Page } from '@playwright/test';

/** Removes the platform share sheet and clipboard so sharing reveals its own copy-link panel. */
const withoutPlatformSharing = async (page: Page) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Clipboard unavailable')) },
      configurable: true,
    });
  });
};

const shareLayeredComposition = async (page: Page): Promise<string> => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await page.getByRole('button', { name: 'Add a layer' }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Share link' }).click();
  const fallback = page.locator('.fallback input');
  await expect(fallback).toHaveValue(/\S/u);
  return fallback.inputValue();
};

test('shares a short link that opens the shared player', async ({ page }) => {
  await withoutPlatformSharing(page);
  const link = await shareLayeredComposition(page);

  expect(link).toMatch(/\/s\/[A-Za-z0-9_-]{12}$/u);

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Made for this moment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play shared Audle' })).toBeVisible();
});

test('shares a self-contained link when short links are unavailable', async ({ page }) => {
  await withoutPlatformSharing(page);
  await page.route('**/api/share', (route) => route.fulfill({ status: 503, body: '{}' }));
  const link = await shareLayeredComposition(page);

  expect(link).toContain('#audle=');

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Made for this moment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play shared Audle' })).toBeVisible();
});

test('reports a short link that has gone missing', async ({ page }) => {
  await page.goto('/s/AAAAAAAAAAAA');
  await expect(page.getByRole('heading', { name: 'That link did not open.' })).toBeVisible();
});

test('a shared loop can be remixed into the maker’s own draft', async ({ page }) => {
  await withoutPlatformSharing(page);
  const link = await shareLayeredComposition(page);
  await page.goto(link);
  await page.getByRole('button', { name: 'Remix this' }).click();
  await expect(page.getByRole('button', { name: 'Arrange', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page
      .getByRole('region', { name: 'Focused Arrange editor' })
      .locator('.arrange-position.occupied'),
  ).not.toHaveCount(0);
});
