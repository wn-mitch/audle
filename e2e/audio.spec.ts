import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const audioState = (page: Page) => page.evaluate(() => window.__audleDebug?.audioState());
const activeVoiceCount = (page: Page) =>
  page.evaluate(() => window.__audleDebug?.activeVoiceCount() ?? 0);
const outputRms = (page: Page) => page.evaluate(() => window.__audleDebug?.outputRms() ?? 0);

const selectedSourceFacts = (page: Page) =>
  page.getByRole('region', { name: 'Selected sound controls' }).locator('.source-row p');

type PersistedClip =
  | { kind: 'hit'; startTick: number; ratchet: number }
  | { kind: 'loop'; startTick: number; lengthTicks: number; sourceOffsetTick: number };

type PersistedDraft = {
  tracks: { id: string; clips: PersistedClip[] }[];
};

type PatternFeel = 'steady' | 'sparse' | 'moving' | 'offbeat' | 'dense' | 'halftime';

const oneShotFeelStarts: Record<PatternFeel, readonly number[]> = {
  steady: [0, 96, 192, 288, 384, 480, 576, 672, 768, 864, 960, 1056, 1152, 1248, 1344, 1440],
  sparse: [0, 384, 768, 1152],
  moving: [0, 144, 240, 384, 528, 624, 768, 912, 1008, 1152, 1296, 1392],
  offbeat: [48, 240, 432, 624, 816, 1008, 1200, 1392],
  dense: [
    0, 48, 96, 144, 192, 240, 288, 336, 384, 432, 480, 528, 576, 624, 672, 720, 768, 816, 864, 912,
    960, 1008, 1056, 1104, 1152, 1200, 1248, 1296, 1344, 1392, 1440, 1488,
  ],
  halftime: [0, 192, 384, 576, 768, 960, 1152, 1344],
};

const hitSignature = (startTicks: readonly number[]) =>
  startTicks.map((startTick) => `hit:${startTick}:1`);

const persistedClipSignature = (page: Page, trackId: string) =>
  page.evaluate((trackId) => {
    const key = Object.keys(localStorage).find((item) => item.startsWith('audle:draft:v1:'));
    if (!key) return [];
    const draft = JSON.parse(localStorage.getItem(key)!) as PersistedDraft;
    const track = draft.tracks.find((candidate) => candidate.id === trackId);
    return [...(track?.clips ?? [])]
      .sort((left, right) => left.startTick - right.startTick)
      .map((clip) =>
        clip.kind === 'hit'
          ? `hit:${clip.startTick}:${clip.ratchet}`
          : `loop:${clip.startTick}:${clip.lengthTicks}:${clip.sourceOffsetTick}`,
      );
  }, trackId);

const decodedDurationSeconds = async (page: Page): Promise<number> => {
  const text = await selectedSourceFacts(page).textContent();
  const match = text?.match(
    /· (\d+(?:\.\d+)?) sec(?: · \d+-BAR SOURCE)?\s+· \d+-BAR ARRANGEMENT$/u,
  );
  expect(
    match,
    `Selected sound does not show decoded seconds: ${text ?? 'missing text'}`,
  ).toBeTruthy();
  return Number(match![1]);
};

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
  await expect.poll(() => persistedClipSignature(page, 'track-0')).not.toEqual([]);
});

test('persists a distinct one-shot clip signature for every Play feel', async ({ page }) => {
  await page.goto('/');
  const oneShot = page.locator('.sound-object').nth(8);
  await oneShot.click();
  const trackId = await oneShot.getAttribute('data-track-id');
  if (!trackId) throw new Error('The selected one-shot pad has no track id.');
  const arrangementTicks =
    Number((await selectedSourceFacts(page).textContent())?.match(/(\d+)-BAR ARRANGEMENT/u)?.[1]) *
    384;
  expect(arrangementTicks).toBeGreaterThan(0);

  const feels = page.getByRole('group', { name: 'Pattern feel' }).getByRole('button');
  await expect(feels).toHaveCount(6);

  for (const [feel, startTicks] of Object.entries(oneShotFeelStarts) as [
    PatternFeel,
    readonly number[],
  ][]) {
    await page.getByRole('button', { name: feel, exact: true }).click();
    await expect(page.getByRole('button', { name: feel, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(() => persistedClipSignature(page, trackId))
      .toEqual(hitSignature(startTicks.filter((tick) => tick < arrangementTicks)));
    expect(
      await oneShot
        .locator('.hit-mark')
        .evaluateAll(
          (marks, total) =>
            marks.map((mark) =>
              Math.round((Number.parseFloat((mark as HTMLElement).style.left) * total) / 100),
            ),
          arrangementTicks,
        ),
    ).toEqual(startTicks.filter((tick) => tick < arrangementTicks));
  }
});

test('shows decoded source seconds for selected one-shots and loops regardless of feel', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sound-object').nth(12).click();
  await page.getByRole('button', { name: 'sparse', exact: true }).click();
  await expect(selectedSourceFacts(page)).toContainText(/ONE-SHOT · 0\.\d{2} sec/u);
  const oneShotSeconds = await decodedDurationSeconds(page);

  await page.getByRole('button', { name: 'dense', exact: true }).click();
  expect(await decodedDurationSeconds(page)).toBe(oneShotSeconds);

  await page.locator('.sound-object').first().click();
  await page.getByRole('button', { name: 'halftime', exact: true }).click();
  await expect(selectedSourceFacts(page)).toContainText(/LOOP · \d+\.\d sec/u);
  await expect(selectedSourceFacts(page)).toContainText(/2-BAR SOURCE\s+· \d+-BAR ARRANGEMENT/u);
  const loopSeconds = await decodedDurationSeconds(page);

  expect(oneShotSeconds).toBeLessThan(1);
  expect(loopSeconds).toBeGreaterThan(1);
  expect(oneShotSeconds).toBeLessThan(loopSeconds);
});

test('Hear it auditions the selected sound without adding clips', async ({ page }) => {
  await page.goto('/');
  const selected = page.locator('.sound-object.selected');
  const trackId = await selected.getAttribute('data-track-id');
  if (!trackId) throw new Error('The initially selected pad has no track id.');
  await expect.poll(() => persistedClipSignature(page, trackId)).toEqual([]);

  const hear = page.getByRole('button', { name: 'Hear it', exact: true });
  await expect(hear).toBeEnabled();
  await hear.click();
  await expect.poll(() => audioState(page)).toBe('running');
  await expect.poll(() => activeVoiceCount(page)).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.__audleDebug?.lastHit()?.kind))
    .toBe('audition');

  await page.waitForTimeout(300);
  await expect.poll(() => persistedClipSignature(page, trackId)).toEqual([]);
});

test('Play draws a waveform only on the owning pad while it sounds', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.sound-object').first();
  const other = page.locator('.sound-object').nth(1);
  await expect(first.locator('.pad-waveform')).toHaveCount(0);
  await first.click();
  const canvas = first.locator('.pad-waveform canvas');
  await expect(canvas).toBeVisible();
  await expect(other.locator('.pad-waveform')).toHaveCount(0);

  await page.getByRole('button', { name: 'Stop loop' }).click();
  const still = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.getByRole('button', { name: 'Play loop' }).click();
  await expect
    .poll(
      async () =>
        (await outputRms(page)) > 0.001 &&
        (await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())) !== still,
      { timeout: 10000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Stop loop' }).click();
  await expect
    .poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()))
    .toBe(still);
});

test('the share sheet exports a non-silent WAV from the live loop', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sound-object').first().click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
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

test('Space, Echo, and Fuzz each change the exported sound', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.locator('.sound-object').nth(8).click();
  await page.getByRole('button', { name: 'Stop loop' }).click();

  const exportLoop = async () => {
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download loop WAV' }).click(),
    ]);
    const audio = await readFile(await download.path());
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return audio;
  };

  const dry = await exportLoop();
  for (const name of ['Space', 'Echo', 'Fuzz']) {
    const dial = page.getByRole('slider', { name });
    await dial.focus();
    await dial.press('End');
    await expect(dial).toHaveAttribute('aria-valuenow', '1');
    const processed = await exportLoop();
    expect(processed.subarray(44).equals(dry.subarray(44)), `${name} was inaudible`).toBe(false);
    await dial.press('Home');
    await expect(dial).toHaveAttribute('aria-valuenow', '0');
  }
});

test('Offset persists sparse one-shot hits one sixteenth at a time', async ({ page }) => {
  await page.goto('/');
  const oneShot = page.locator('.sound-object').nth(8);
  await oneShot.click();
  const trackId = await oneShot.getAttribute('data-track-id');
  if (!trackId) throw new Error('The selected one-shot pad has no track id.');
  const arrangementTicks =
    Number((await selectedSourceFacts(page).textContent())?.match(/(\d+)-BAR ARRANGEMENT/u)?.[1]) *
    384;
  expect(arrangementTicks).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'sparse', exact: true }).click();
  await expect
    .poll(() => persistedClipSignature(page, trackId))
    .toEqual(hitSignature(oneShotFeelStarts.sparse.filter((tick) => tick < arrangementTicks)));

  await page.getByRole('button', { name: 'Offset pattern one step later' }).click();
  await expect
    .poll(() => persistedClipSignature(page, trackId))
    .toEqual(hitSignature([24, 408, 792, 1176].filter((tick) => tick < arrangementTicks)));
  expect(
    await oneShot
      .locator('.hit-mark')
      .evaluateAll(
        (marks, total) =>
          marks.map((mark) =>
            Math.round((Number.parseFloat((mark as HTMLElement).style.left) * total) / 100),
          ),
        arrangementTicks,
      ),
  ).toEqual([24, 408, 792, 1176].filter((tick) => tick < arrangementTicks));

  await page.getByRole('button', { name: 'Offset pattern one step earlier' }).click();
  await expect
    .poll(() => persistedClipSignature(page, trackId))
    .toEqual(hitSignature(oneShotFeelStarts.sparse.filter((tick) => tick < arrangementTicks)));

  await page.getByRole('button', { name: 'Offset pattern one step earlier' }).click();
  await expect
    .poll(() => persistedClipSignature(page, trackId))
    .toEqual(hitSignature([360, 744, 1128, 1512].filter((tick) => tick < arrangementTicks)));
});

test('saving a take from Play offers to play and share it', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sound-object').nth(8).click();
  const record = page.getByRole('button', { name: /Record a take/ });
  await expect(record).toBeEnabled();
  await record.click();
  await expect(page.getByRole('button', { name: 'Cancel count-in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save take' })).toBeVisible({ timeout: 6000 });
  await page.locator('.sound-object').nth(12).click();
  await page.getByRole('button', { name: 'Save take' }).click();
  await expect(page.getByText('Take saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Share it' }).click();
  await expect(page.getByRole('button', { name: 'Copy take link' })).toBeVisible();
});
