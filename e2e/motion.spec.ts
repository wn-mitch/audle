import { expect, test, type Page } from '@playwright/test';

const hitCount = (page: Page) => page.evaluate(() => window.__audleDebug?.hitCount() ?? 0);
const transportTick = (page: Page) =>
  page.evaluate(() => window.__audleDebug?.transportTick() ?? 0);
const steadyKickHits = async (page: Page) => {
  const facts = await page.locator('.source-row p').textContent();
  const bars = Number(facts?.match(/(\d+)-BAR ARRANGEMENT/u)?.[1]);
  expect(bars).toBeGreaterThan(0);
  return bars * 4;
};

test('hit events land on the frame the sound plays', async ({ page }) => {
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  await expect(sound).toBeEnabled();
  const totalTicks = (await steadyKickHits(page)) * 96;
  const nextHitDistance = page.evaluate(
    (total) =>
      new Promise<number>((resolve) => {
        const debug = window.__audleDebug!;
        const initial = debug.hitCount();
        const sample = () => {
          if (debug.hitCount() === initial) {
            requestAnimationFrame(sample);
            return;
          }
          const hit = debug.lastHit()!.tick;
          const tick = debug.transportTick();
          const distance = (((tick - hit) % total) + total) % total;
          resolve(Math.min(distance, total - distance));
        };
        requestAnimationFrame(sample);
      }),
    totalTicks,
  );
  await sound.click();
  // Read transport on the first frame that observes a hit, not at an arbitrary later poll.
  expect(await nextHitDistance).toBeLessThanOrEqual(48);
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

test('pad timelines move with transport and reset on stop', async ({ page }) => {
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  const progress = () =>
    page
      .locator('.stage-frame')
      .evaluate((stage) =>
        Number.parseFloat((stage as HTMLElement).style.getPropertyValue('--play-progress')),
      );
  await expect(sound.locator('.hit-mark')).toHaveCount(0);
  await sound.click();
  await expect(sound.locator('.hit-mark')).toHaveCount(await steadyKickHits(page));
  await expect.poll(progress).toBeGreaterThan(0);
  const first = await progress();
  await expect.poll(progress).not.toBe(first);
  await page.getByRole('button', { name: 'Stop loop' }).click();
  await expect.poll(progress).toBe(0);
  await expect(sound.locator('.hit-mark')).toHaveCount(await steadyKickHits(page));
  const other = page.locator('.sound-object').first();
  const height = (pad: typeof sound) =>
    pad.locator('.hit-timeline').evaluate((element) => element.getBoundingClientRect().height);
  expect(await height(sound)).toBeGreaterThan(await height(other));
  await other.click();
  expect(await height(other)).toBeGreaterThan(await height(sound));
});
test('under reduced motion, selected, pressed, queued, and focused pads keep static cues', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  await expect(sound).toBeEnabled();
  await sound.click();
  await expect.poll(() => hitCount(page)).toBeGreaterThan(0);
  const idleWaveform = await sound
    .locator('.pad-waveform canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(150);
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect(sound.locator('.hit-mark')).toHaveCount(await steadyKickHits(page));
  expect(
    await page
      .locator('.stage-frame')
      .evaluate((stage) => (stage as HTMLElement).style.getPropertyValue('--play-progress')),
  ).toBe('0');
  expect(
    await sound
      .locator('.pad-waveform canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(idleWaveform);

  await sound.hover();
  await page.mouse.down();
  await expect(sound).toHaveAttribute('data-pressed', 'true');
  const pressedTransform = await sound.evaluate((pad) => getComputedStyle(pad).transform);
  expect(pressedTransform).toBe('none');
  await page.mouse.up();
  await expect(sound).toHaveAttribute('aria-label', /queued for next bar/);

  await sound.focus();
  await page.keyboard.press('Tab');
  const keyboardFocusedPad = page.locator('.sound-object').nth(9);
  // Safari on macOS skips buttons when Full Keyboard Access is off; focus the target directly
  // there, then use the keyboard to exercise its actual button interaction.
  if (testInfo.project.name === 'webkit') await keyboardFocusedPad.focus();
  await expect
    .poll(() =>
      keyboardFocusedPad.evaluate((pad) => ({
        focused: document.activeElement === pad,
        outline: getComputedStyle(pad).outlineStyle,
      })),
    )
    .toEqual({ focused: true, outline: 'solid' });
  await keyboardFocusedPad.press('Space');
  await expect(keyboardFocusedPad).toHaveAttribute(
    'aria-label',
    /queued for next bar|on, turn off/u,
  );

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

test('an audible hit flashes and meters only its owning pad', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  await expect(sound).toBeEnabled();

  // Watch before the gesture: a hit flash is deliberately shorter than a polling interval.
  const observedMotion = page.evaluate(
    () =>
      new Promise<{ hitTracks: string[]; meteredTracks: string[] }>((resolve) => {
        const hitTracks = new Set<string>();
        const meteredTracks = new Set<string>();
        const bank = document.querySelector('.objects')!;
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            const target = record.target as HTMLElement;
            const pad = target.matches('.sound-object')
              ? target
              : target.closest<HTMLElement>('.sound-object');
            if (!pad?.dataset.trackId) continue;
            if (target.matches('.sound-object') && target.hasAttribute('data-hit'))
              hitTracks.add(pad.dataset.trackId);
            if (target.matches('.object-meter') && target.style.getPropertyValue('--level'))
              meteredTracks.add(pad.dataset.trackId);
          }
        });
        observer.observe(bank, {
          attributes: true,
          attributeFilter: ['data-hit', 'style'],
          subtree: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve({ hitTracks: [...hitTracks], meteredTracks: [...meteredTracks] });
        }, 1500);
      }),
  );

  await sound.click();
  await expect.poll(() => hitCount(page)).toBeGreaterThan(0);
  const tapped = await sound.getAttribute('data-track-id');
  const motion = await observedMotion;

  expect(motion.hitTracks).toEqual([tapped]);
  expect(motion.meteredTracks).toEqual([tapped]);
});

test('a hovered pad lifts about four pixels while a connected feel segment tints and presses in place', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Touch devices have no hover contract.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const pad = page.locator('.sound-object').nth(8);
  await expect(pad).toBeEnabled();
  await expect
    .poll(() => pad.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none');
  const rest = (await pad.boundingBox())!;
  await pad.hover();
  await expect
    .poll(async () => {
      const lifted = (await pad.boundingBox())!;
      return rest.y + rest.height / 2 - (lifted.y + lifted.height / 2);
    })
    .toBeGreaterThan(3);
  const lifted = (await pad.boundingBox())!;
  expect(rest.y + rest.height / 2 - (lifted.y + lifted.height / 2)).toBeLessThan(5);

  await pad.click();
  const feel = page.getByRole('button', { name: 'sparse', exact: true });
  const neighbor = page.getByRole('button', { name: 'moving', exact: true });
  const faceBefore = await feel.evaluate((button) => getComputedStyle(button).backgroundColor);
  await feel.hover();
  await expect
    .poll(() => feel.evaluate((button) => getComputedStyle(button).backgroundColor))
    .not.toBe(faceBefore);

  const [feelBox, neighborBox] = await Promise.all([feel.boundingBox(), neighbor.boundingBox()]);
  expect(Math.abs(feelBox!.x + feelBox!.width - neighborBox!.x)).toBeLessThanOrEqual(1);
  await page.mouse.down();
  await expect(feel).toHaveAttribute('data-pressed', 'true');
  await expect
    .poll(() => feel.evaluate((button) => getComputedStyle(button).transform))
    .not.toBe('none');
  await page.mouse.up();
  await expect(feel).not.toHaveAttribute('data-pressed', 'true');
  await expect(feel).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => {
      const settled = (await feel.boundingBox())!;
      return Math.abs(settled.x - feelBox!.x) < 1 && Math.abs(settled.y - feelBox!.y) < 1;
    })
    .toBe(true);
});

test('the transport icon receives beat pulses only during composition playback', async ({
  page,
}) => {
  await page.goto('/');
  const pad = page.locator('.sound-object').nth(8);
  await expect(pad).toBeEnabled();

  const observeIconTransforms = (duration: number) =>
    page.evaluate(
      (timeout) =>
        new Promise<number>((resolve) => {
          const icon = document.querySelector<HTMLElement>('.play-footer .transport .icon')!;
          let transforms = 0;
          const observer = new MutationObserver((records) => {
            transforms += records.filter((record) => record.attributeName === 'style').length;
          });
          observer.observe(icon, { attributes: true, attributeFilter: ['style'] });
          setTimeout(() => {
            observer.disconnect();
            resolve(transforms);
          }, timeout);
        }),
      duration,
    );

  expect(await observeIconTransforms(500)).toBe(0);
  await pad.click();
  await expect(page.getByRole('button', { name: 'Stop loop' })).toBeVisible();
  await expect.poll(() => hitCount(page)).toBeGreaterThan(0);
  expect(await observeIconTransforms(900)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop loop' }).click();
  await expect(page.getByRole('button', { name: 'Play loop' })).toBeVisible();
});

test('dial gestures persist independently and a pointer drag is undone as one control gesture', async ({
  page,
}) => {
  await page.goto('/');
  const firstSound = page.locator('.sound-object').nth(8);
  const otherSound = page.locator('.sound-object').nth(9);
  await expect(firstSound).toBeEnabled();
  await firstSound.click();

  const level = page.getByRole('slider', { name: 'Level' });
  await level.focus();
  await level.press('ArrowRight');
  await expect(level).toHaveAttribute('aria-valuenow', '0.5');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((item) => item.startsWith('audle:draft:v1:'));
        return key ? JSON.parse(localStorage.getItem(key)!).tracks[8].controls.gainDb : undefined;
      }),
    )
    .toBe(0.5);

  await otherSound.click();
  await expect(level).toHaveAttribute('aria-valuenow', '0');
  await firstSound.click();
  await expect(level).toHaveAttribute('aria-valuenow', '0.5');
  // Stop queued pad changes so they cannot land on a bar boundary after the dial drag.
  await page.getByRole('button', { name: 'Stop loop' }).click();
  await level.scrollIntoViewIfNeeded();

  const box = (await level.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.up();
  await expect(level).not.toHaveAttribute('aria-valuenow', '0.5');

  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(level).toHaveAttribute('aria-valuenow', '0.5');
  const space = page.getByRole('slider', { name: 'Space' });
  const echo = page.getByRole('slider', { name: 'Echo' });
  const fuzz = page.getByRole('slider', { name: 'Fuzz' });
  for (const [slider, presses] of [
    [space, 1],
    [echo, 2],
    [fuzz, 3],
  ] as const) {
    await slider.focus();
    for (let index = 0; index < presses; index += 1) await slider.press('ArrowRight');
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((item) => item.startsWith('audle:draft:v1:'));
        if (!key) return undefined;
        const { space, echo, fuzz } = JSON.parse(localStorage.getItem(key)!).tracks[8].controls;
        return [space, echo, fuzz];
      }),
    )
    .toEqual([0.05, 0.1, 0.15]);
});

test('the Arrange playhead sweeps between transport snapshots', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  const play = page.getByRole('button', { name: 'Play composition' });
  await expect(play).toBeEnabled();
  await play.click();
  await expect.poll(() => transportTick(page)).toBeGreaterThan(0);
  // A sixteenth at 140 BPM lasts about 107ms, so six frames of stepping show at most two
  // positions; a frame-rate sweep shows a new one nearly every frame.
  const distinct = await page.evaluate(async () => {
    const grid = document.querySelector<HTMLElement>('.timeline .grid')!;
    const seen = new Set<string>();
    for (let frame = 0; frame < 6; frame += 1) {
      seen.add(grid.style.getPropertyValue('--playhead-ratio'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return seen.size;
  });
  expect(distinct).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Stop playback' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .querySelector<HTMLElement>('.timeline .grid')!
          .style.getPropertyValue('--playhead-ratio'),
      ),
    )
    .toBe('0');
});

test('under reduced motion the Arrange playhead steps with the transport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await page.getByRole('button', { name: 'Play composition' }).click();
  await expect.poll(() => transportTick(page)).toBeGreaterThan(0);
  const distinct = await page.evaluate(async () => {
    const grid = document.querySelector<HTMLElement>('.timeline .grid')!;
    const seen = new Set<string>();
    for (let frame = 0; frame < 4; frame += 1) {
      seen.add(grid.style.getPropertyValue('--playhead-ratio'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return seen.size;
  });
  expect(distinct).toBeLessThanOrEqual(2);
});
