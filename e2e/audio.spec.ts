import { expect, test, type Page } from '@playwright/test';

const audioState = (page: Page) => page.evaluate(() => window.__audleDebug?.audioState());
const activeVoiceCount = (page: Page) =>
  page.evaluate(() => window.__audleDebug?.activeVoiceCount() ?? 0);
const outputRms = (page: Page) => page.evaluate(() => window.__audleDebug?.outputRms() ?? 0);

test('starts and advances the transport after an explicit play gesture', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();

  const play = page.getByRole('button', { name: 'Play' });
  await expect(play).toBeEnabled();
  await play.click();

  await expect.poll(() => audioState(page)).toBe('running');
  await expect.poll(() => activeVoiceCount(page)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => outputRms(page)).toBeGreaterThan(0.000001);
  const initialTick = await page.evaluate(() => window.__audleDebug?.transportTick() ?? 0);
  await expect
    .poll(() => page.evaluate(() => window.__audleDebug?.transportTick() ?? 0))
    .not.toBe(initialTick);

  await page.getByRole('button', { name: 'Stop playback' }).click();
  await expect(page.getByRole('button', { name: 'Play composition' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__audleDebug?.transportTick() ?? 0)).toBe(0);
});
