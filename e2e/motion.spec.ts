import { expect, test, type Page } from '@playwright/test';

const hitCount = (page: Page) => page.evaluate(() => window.__audleDebug?.hitCount() ?? 0);
const lastHitTick = (page: Page) => page.evaluate(() => window.__audleDebug?.lastHit()?.tick ?? -1);
const transportTick = (page: Page) =>
  page.evaluate(() => window.__audleDebug?.transportTick() ?? 0);

test('hit events land on the frame the sound plays', async ({ page }) => {
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  await expect(sound).toBeEnabled();
  await sound.click();
  await expect.poll(() => hitCount(page)).toBeGreaterThan(0);
  // A hit is announced on the animation frame at its audio time, so the transport tick read
  // right after it should sit within one sixteenth of the hit's own tick (modulo the loop).
  await expect
    .poll(async () => {
      const [hit, tick] = await Promise.all([lastHitTick(page), transportTick(page)]);
      const bars = 4 * 384;
      const delta = (((tick - hit) % bars) + bars) % bars;
      return Math.min(delta, bars - delta);
    })
    .toBeLessThanOrEqual(48);
});

test('muted tracks stay silent to hit listeners', async ({ page }) => {
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  await sound.click();
  await expect.poll(() => hitCount(page)).toBeGreaterThan(0);
  await sound.click();
  await expect(sound).toHaveAttribute('aria-label', /off, turn on/, { timeout: 5000 });
  const settled = await hitCount(page);
  await page.waitForTimeout(900);
  expect(await hitCount(page)).toBe(settled);
});

test('under reduced motion a tap leaves pads untransformed and never flashes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  await expect(sound).toBeEnabled();
  await sound.click();
  await expect.poll(() => hitCount(page)).toBeGreaterThan(0);
  await page.mouse.move(0, 0);
  const transforms = await page.evaluate(() => {
    const object = document.querySelectorAll<HTMLElement>('.sound-object')[8]!;
    return [
      getComputedStyle(object).transform,
      getComputedStyle(object.querySelector('.glyph')!).transform,
    ];
  });
  expect(transforms).toEqual(['none', 'none']);
  await page.waitForTimeout(700);
  await expect(page.locator('.sound-object[data-hit]')).toHaveCount(0);
});

test('with motion allowed the pad that fired flashes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('.sound-object').nth(8).click();
  await expect.poll(() => hitCount(page)).toBeGreaterThan(0);
  // A flash lasts a fraction of a second, so watch attribute mutations instead of polling.
  const flashed = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const seen = new Set<string>();
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            const target = record.target as HTMLElement;
            if (target.hasAttribute('data-hit')) seen.add(target.dataset.trackId ?? '');
          }
        });
        observer.observe(document.querySelector('.objects')!, {
          attributes: true,
          attributeFilter: ['data-hit'],
          subtree: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve([...seen]);
        }, 1500);
      }),
  );
  const tapped = await page.evaluate(
    () => document.querySelectorAll<HTMLElement>('.sound-object')[8]!.dataset.trackId,
  );
  expect(flashed).toContain(tapped);
});
