import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const audioState = (page: Page) => page.evaluate(() => window.__audleDebug?.audioState());
const activeVoiceCount = (page: Page) =>
  page.evaluate(() => window.__audleDebug?.activeVoiceCount() ?? 0);
const outputRms = (page: Page) => page.evaluate(() => window.__audleDebug?.outputRms() ?? 0);

test('starts and advances the transport after an explicit play gesture', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();

  const play = page.getByRole('button', { name: 'Play composition' });
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

test('a Play tap starts audible music and a second tap switches it off on a bar', async ({
  page,
}) => {
  await page.goto('/');
  const sound = page.locator('.sound-object').first();
  await expect(sound).toBeEnabled();
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => activeVoiceCount(page)).toBeGreaterThan(0);
  await expect.poll(() => outputRms(page)).toBeGreaterThan(0.000001);

  await sound.click();
  await expect(sound).toHaveAttribute('aria-label', /queued for next bar/);
  await expect(sound).toHaveAttribute('aria-label', /off, turn on/, { timeout: 5000 });
  const clips = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('audle:draft:v1:'));
    return key ? JSON.parse(localStorage.getItem(key)!).tracks[0].clips.length : 0;
  });
  expect(clips).toBeGreaterThan(0);
});

test('offers every pattern feel beneath the play field and applies the one you tap', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sound-object').first().click();

  const feels = page.getByRole('group', { name: 'Pattern feel' }).getByRole('button');
  await expect(feels).toHaveCount(6);

  const steps = page.locator('.pattern-strip .steps span');
  await expect(steps).toHaveCount(16);

  for (const feel of ['sparse', 'offbeat', 'dense', 'halftime', 'moving', 'steady']) {
    await page.getByRole('button', { name: feel, exact: true }).click();
    // The strip lights the feel you tapped, so a collision between two feels shows up here.
    await expect(page.getByRole('button', { name: feel, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // A feel has to change what you hear, not only which button is lit.
    await expect(page.locator('.pattern-strip .steps .hit')).toHaveCount(
      feel === 'sparse' ? 8 : 16,
    );
  }
});

test('Finish exports a non-silent WAV from the live loop', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sound-object').first().click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download loop WAV' }).click(),
  ]);
  const wav = await readFile(await download.path());
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
  expect(wav.length).toBeGreaterThan(44);
  expect(wav.subarray(44).some((byte) => byte !== 0)).toBe(true);
});
