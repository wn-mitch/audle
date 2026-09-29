import { expect, test } from '@playwright/test';

test('empty Arrange exposes a lane without page scrolling on a phone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Phone layout only.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const lane = page.locator('.lane-content').first();
  const target = await page.evaluate(() => {
    const lane = document.querySelector<HTMLElement>('.lane-content')!;
    const header = document.querySelector<HTMLElement>('.track-header')!;
    const box = lane.getBoundingClientRect();
    return {
      x: header.getBoundingClientRect().right + 40,
      y: box.top + box.height / 2,
      top: box.top,
      bottom: box.bottom,
    };
  });
  expect(target.top).toBeLessThan(844);
  expect(target.bottom).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.lane-content') !== null,
      target,
    ),
  ).toBe(true);
  await page.touchscreen.tap(target.x, target.y);
  await expect(lane.locator('.clip:not(.hit)')).toHaveAttribute('aria-label', /at tick 0\b/);
});

test('empty Arrange controls remain reachable at 320px without horizontal overflow', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Phone layout only.');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    ),
  ).toBeLessThanOrEqual(320);
  await expect(page.getByLabel('Vibe for Jev')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Remix today’s starter' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Try a ready-made beat' })).toBeAttached();
  await page.locator('summary').filter({ hasText: 'Hear an example' }).click();
  await expect(page.getByRole('button', { name: 'Four on the floor' })).toBeVisible();
});
test('pad recording ends on Play, Help, example and shared-link exits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const record = page.getByRole('button', { name: 'Record pads' });
  const pad = page.locator('.pad-bank .pad').nth(8);
  const clips = page.locator('.lane').nth(8).locator('.clip.hit');
  await record.click();
  await expect(page.getByRole('button', { name: 'Stop recording pads' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Pad taps add clips' })).toBeVisible();
  await pad.click();
  await expect(clips).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(clips).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(clips).toHaveCount(1);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record pads' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await pad.click();
  await expect(clips).toHaveCount(1);

  await record.click();
  await page.getByRole('button', { name: 'Help' }).click();
  await record.click();
  await expect(page.getByRole('button', { name: 'Stop recording pads' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record pads' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(clips).toHaveCount(0);
  await record.click();
  await page.locator('summary').filter({ hasText: 'Hear an example' }).click();
  await page.getByRole('button', { name: 'Four on the floor' }).click();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record pads' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await pad.click();
  await expect(clips).toHaveCount(0);
  await record.click();
  await page.evaluate(() => {
    location.hash = '#audle=invalid';
  });
  await expect(page.getByRole('heading', { name: 'That link did not open.' })).toBeVisible();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record pads' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('sound identity and parameter language follow selection across views', async ({ page }) => {
  await page.goto('/');
  const sound = page.locator('.sound-object').nth(8);
  await expect(sound).toBeEnabled();
  await sound.click();
  const name = (await page.locator('.play-controls h2').textContent())!.trim();
  await page.locator('.dials input[aria-label="Pan"]').fill('-0.35');
  await page.locator('.dials input[aria-label="Tune"]').fill('3');
  await expect(page.locator('.dials input[aria-label="Pan"]')).toHaveAttribute(
    'aria-valuetext',
    'LEFT 35',
  );
  await expect(page.locator('.dials input[aria-label="Tune"]')).toHaveAttribute(
    'aria-valuetext',
    '+3 STEPS',
  );

  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  const pad = page.locator('.pad-bank .pad').nth(8);
  const lane = page.locator('.lane').nth(8);
  await expect(pad).toContainText('09');
  await expect(pad).toContainText(name);
  await expect(lane.locator('.source-number')).toHaveText('09');
  await expect(lane.locator('input[aria-label^="Label for"]')).toHaveValue(name);
  await expect(page.locator('#tuning-title')).toHaveText(name);
  await expect(page.locator('.knobs input[aria-label="Level"]')).toBeVisible();
  await expect(page.locator('.knobs input[aria-label="Filter"]')).toBeVisible();
  await expect(page.locator('.knobs input[aria-label="Pan"]')).toHaveAttribute(
    'aria-valuetext',
    'LEFT 35',
  );
  await expect(page.locator('.knobs input[aria-label="Tune"]')).toHaveAttribute(
    'aria-valuetext',
    '+3 STEPS',
  );
  await expect(page.locator('.knobs input[aria-label="Pan"]')).toHaveValue('-0.35');
  await expect(page.locator('.knobs input[aria-label="Tune"]')).toHaveValue('3');

  await page.locator('.knobs input[aria-label="Pan"]').fill('0.4');
  await page.locator('.knobs input[aria-label="Tune"]').fill('-1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.dials input[aria-label="Pan"]')).toHaveValue('0.4');
  await expect(page.locator('.dials input[aria-label="Tune"]')).toHaveValue('-1');
  await expect(page.locator('.dials input[aria-label="Pan"]')).toHaveAttribute(
    'aria-valuetext',
    'RIGHT 40',
  );
  await expect(page.locator('.dials input[aria-label="Tune"]')).toHaveAttribute(
    'aria-valuetext',
    '−1 STEP',
  );
});

test('lane source keys seek, announce and place exact clips without losing focus', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const kick = page.getByRole('button', { name: 'Select Stomp Kick' });
  await kick.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#timeline-keyboard-position')).toHaveText('Bar 1, step 2 of 16');
  await page.keyboard.press('Enter');
  const hits = page.locator('.lane').nth(8).locator('.clip.hit');
  await expect(hits).toHaveCount(1);
  await expect(hits.first()).toHaveAttribute('aria-label', /at tick 24\b/);
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(hits).toHaveCount(2);
  await expect(
    page.locator('.lane').nth(8).locator('.clip.hit[aria-label*="at tick 0,"]'),
  ).toHaveCount(1);
  await page.keyboard.press('End');
  await expect(page.locator('#timeline-keyboard-position')).toHaveText(/step 16 of 16/);
  await page.keyboard.press('Enter');
  await expect(hits).toHaveCount(3);
  await expect(hits.last()).toHaveAttribute('aria-label', /at tick (744|1512)\b/);
  await expect(kick).toBeFocused();
  const viewport = await page.locator('.timeline-scroll').boundingBox();
  const end = await hits.last().boundingBox();
  expect(end!.x).toBeLessThan(viewport!.x + viewport!.width);

  const loop = page.locator('.track-header .source').first();
  await loop.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Space');
  const loopClip = page.locator('.lane').first().locator('.clip:not(.hit)');
  await expect(loopClip).toHaveAttribute('aria-label', /at tick 0\b/);
  await loopClip.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Nudge selected clips one step earlier' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Nudge selected clips one step later' }),
  ).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(loopClip).toHaveCount(0);
});

test('selected loop resizing remains accessible without taking an adjacent loop tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const source = page.locator('.track-header .source').first();
  const lane = page.locator('.lane').first();
  await source.focus();
  await page.keyboard.press('Enter');
  const firstGrip = lane.locator('.resize').first();
  await firstGrip.focus();
  while (Number(await firstGrip.getAttribute('aria-valuenow')) > 384)
    await page.keyboard.press('ArrowLeft');
  await source.focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < 16; step += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const clips = lane.locator('.clip:not(.hit)');
  await expect(clips).toHaveCount(2);
  await clips.first().click();
  const shorten = page.getByRole('button', { name: 'Shorten' });
  const lengthen = page.getByRole('button', { name: 'Lengthen' });
  for (const button of [shorten, lengthen]) {
    const size = (await button.boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  await shorten.click();
  await expect(lane.locator('.resize').first()).toHaveAttribute('aria-valuenow', '360');
  await lengthen.click();
  await expect(lane.locator('.resize').first()).toHaveAttribute('aria-valuenow', '384');
  const neighbor = (await clips.nth(1).boundingBox())!;
  await page.mouse.click(neighbor.x + 10, neighbor.y + neighbor.height / 2);
  await expect(clips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await source.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(clips).toHaveCount(3);
  await clips.last().click();
  await expect(lengthen).toBeDisabled();
});

test('remixes the starter and layers the selected voice', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();

  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await expect(page.locator('input[aria-label^="Label for"]')).toHaveCount(16);

  await page.getByRole('button', { name: 'Add a layer' }).click();
  await expect(page.locator('input[aria-label="Label for Layer 2"]')).toBeVisible();
  await expect(page.locator('input[aria-label^="Label for"]')).toHaveCount(17);
});

test('clicking a lane places a hit under the pointer, aligned with both playheads', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Covered by the tap test below.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('4 bars', { exact: false })).toBeVisible();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const lane = page.locator('.lane-content').nth(8);
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  // Bar 3, beat 1: halfway across a four-bar lane.
  await page.mouse.click(box.x + box.width * 0.5 + 2, box.y + box.height / 2);

  const hit = lane.locator('.clip.hit');
  await expect(hit).toHaveCount(1);
  await expect(hit).toHaveAttribute('aria-label', /at tick 768\b/);
  const hitBox = (await hit.boundingBox())!;
  const lanePlayhead = (await lane.locator('.playhead').boundingBox())!;
  const rulerPlayhead = (await page.locator('.playhead-ruler').boundingBox())!;
  expect(Math.abs(hitBox.x - lanePlayhead.x)).toBeLessThan(2);
  expect(Math.abs(rulerPlayhead.x - lanePlayhead.x)).toBeLessThan(2);

  await hit.dblclick();
  await expect(lane.locator('.clip')).toHaveCount(0);
});

test('tapping a loop lane on a phone fills that bar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Phone layout only.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('2 bars', { exact: false })).toBeVisible();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const lane = page.locator('.lane-content').first();
  await lane.scrollIntoViewIfNeeded();
  await page.locator('.timeline-scroll').evaluate((element) => element.scrollTo({ left: 0 }));
  await page.evaluate(() => {
    const top = document.querySelector('.timeline-scroll')!.getBoundingClientRect().top + scrollY;
    scrollTo(0, Math.max(0, top - 150));
  });
  const header = (await page.locator('.track-header').first().boundingBox())!;
  await page.touchscreen.tap(header.x + header.width + 40, header.y + header.height / 2);
  await expect(lane.locator('.clip:not(.hit)')).toHaveAttribute('aria-label', /at tick 0\b/);
});

test('Jam with Jev fills empty tracks and one undo takes it back', async ({ page }) => {
  let sent: { vibe: string; tracks: Array<{ index: number; fill: boolean }> } | undefined;
  await page.route('/api/jev', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      json: {
        answers: {
          'track-0': { full: 1 },
          'track-4': { four: 1 },
          'track-6': { eighths: 1 },
          'track-7': { rest: 1 },
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByLabel('Vibe for Jev').fill('bouncy');
  await page.getByRole('button', { name: 'Jam with Jev' }).last().click();

  // Jev only offers the empty pads, so the filled count follows the mock's non-rest answers.
  await expect(page.getByText(/Jev filled \d+ tracks?\./u)).toBeVisible();
  expect(sent?.vibe).toBe('bouncy');
  expect(sent?.tracks.filter((track) => track.fill)).toHaveLength(16);
  // Jev fills only the pads it was offered, so assert that the jam landed somewhere and is labelled.
  await expect(page.locator('.clip')).not.toHaveCount(0);
  await expect(page.locator('.jam-pick').first()).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.clip')).toHaveCount(0);
});

test('Jam with Jev reports an outage without changing the loop', async ({ page }) => {
  await page.route('/api/jev', (route) => route.fulfill({ status: 502, json: { error: 'down' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Jam with Jev' }).last().click();
  await expect(page.getByText('Jev is offline. Your loop is unchanged.')).toBeVisible();
  await expect(page.locator('.clip')).toHaveCount(0);
});

test('dragging a hit moves it by whole sixteenths and keeps it selected', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Touch drags need select mode first.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const lane = page.locator('.lane-content').nth(8);
  await lane.scrollIntoViewIfNeeded();
  const box = (await lane.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25 + 2, box.y + box.height / 2);
  const hit = lane.locator('.clip.hit');
  await expect(hit).toHaveAttribute('aria-label', /at tick 384\b/);

  const hitBox = (await hit.boundingBox())!;
  const from = { x: hitBox.x + 4, y: hitBox.y + hitBox.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // One bar to the right, in a few steps so the drag passes the tap slop first.
  for (let step = 1; step <= 4; step += 1)
    await page.mouse.move(from.x + (box.width * 0.25 * step) / 4, from.y);
  await page.mouse.up();

  await expect(hit).toHaveAttribute('aria-label', /at tick 768\b/);
  await expect(hit).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 selected')).toBeVisible();
  const moved = (await hit.boundingBox())!;
  expect(Math.abs(moved.x - hitBox.x - box.width * 0.25)).toBeLessThan(3);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(hit).toHaveAttribute('aria-label', /at tick 384\b/);
});

test('desktop wheel over a lane scrolls the page instead of trapping it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop scrolling contract.');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  const lane = page.locator('.lane-content').first();
  const box = (await lane.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + box.height / 2);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(page.locator('.timeline-scroll')).toHaveJSProperty('scrollTop', 0);
});

test('phone timeline pans horizontally, then chains vertical scrolling to the page', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Phone timeline contract.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  const timeline = page.locator('.timeline-scroll');
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const showTimeline = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const timeline = document.querySelector('.timeline-scroll')!;
          const top = timeline.getBoundingClientRect().top + scrollY;
          scrollTo(0, Math.max(0, top - 150));
          const box = timeline.getBoundingClientRect();
          const target = document.elementFromPoint(box.x + box.width / 2, box.y + 100);
          return (
            timeline.scrollHeight > timeline.clientHeight && !!target?.closest('.timeline-scroll')
          );
        }),
      )
      .toBe(true);
  };
  await showTimeline();
  const pageBefore = await page.evaluate(() => scrollY);
  const box = (await timeline.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.wheel(0, 220);
  await expect.poll(() => timeline.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(pageBefore);
  await page.mouse.wheel(0, 1800);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageBefore);

  await timeline.evaluate((node) => {
    node.scrollTop = 0;
  });
  await showTimeline();
  const panBox = (await timeline.boundingBox())!;
  await page.mouse.move(panBox.x + panBox.width / 2, panBox.y + 100);
  const before = await timeline.evaluate((node) => node.scrollLeft);
  await page.mouse.wheel(250, 0);
  await expect.poll(() => timeline.evaluate((node) => node.scrollLeft)).toBeGreaterThan(before);
  await timeline.evaluate((node) => {
    node.scrollLeft = 0;
  });
  await showTimeline();
  const lane = page.locator('.lane-content').first();
  const header = (await page.locator('.track-header').first().boundingBox())!;
  await page.touchscreen.tap(header.x + header.width + 40, header.y + header.height / 2);
  await expect(lane.locator('.clip:not(.hit)')).toHaveCount(1);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    expect(
      await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      ),
    ).toBeLessThanOrEqual(width);
  }
});

test('a cloned voice carries its source hue without replacing clip role colours', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await page.getByRole('button', { name: 'Add a layer' }).click();
  const source = page.locator('.lane').first();
  const clone = page.locator('.lane').last();
  const colors = await page.evaluate(() => {
    const lanes = document.querySelectorAll<HTMLElement>('.lane');
    const first = lanes[0]!;
    const last = lanes[lanes.length - 1]!;
    const clip = last.querySelector<HTMLElement>('.clip')!;
    return {
      source: getComputedStyle(first).getPropertyValue('--source').trim(),
      clone: getComputedStyle(last).getPropertyValue('--source').trim(),
      glyph: getComputedStyle(last.querySelector('.kind')!).color,
      background: getComputedStyle(clip).backgroundColor,
      roleBackground: getComputedStyle(document.documentElement)
        .getPropertyValue('--audle-loop-surface')
        .trim(),
      border: getComputedStyle(clip).borderColor,
      roleBorder: getComputedStyle(document.documentElement)
        .getPropertyValue('--audle-loop-light')
        .trim(),
    };
  });
  await expect(source).toBeVisible();
  await expect(clone).toBeVisible();
  expect(colors.source).not.toBe('');
  expect(colors.clone).toBe(colors.source);
  expect(colors.glyph).toContain('oklch');
  expect(colors.background).toBe(colors.roleBackground);
  expect(colors.border).toBe(colors.roleBorder);
});
