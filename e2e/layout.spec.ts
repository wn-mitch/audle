import { expect, test, type Page } from '@playwright/test';

const waitForPlayDeck = async (page: Page) => {
  const pads = page.locator('.sound-object');
  await expect(pads).toHaveCount(16);
  await expect(pads.first()).toBeEnabled();
  await expect.poll(() => pads.last().evaluate((pad) => getComputedStyle(pad).opacity)).toBe('1');
};

const compactDeckFitsViewport = (page: Page) =>
  page.evaluate(() => {
    const selectors = [
      '.sound-object',
      '.play-controls',
      '[aria-label="Pattern feel"]',
      '.dials',
      '.play-footer',
    ];
    const elements = selectors.flatMap((selector) => [
      ...document.querySelectorAll<HTMLElement>(selector),
    ]);
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

    return {
      fits:
        pageHeight <= viewport.height + 1 &&
        elements.every((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.top >= -1 &&
            rect.left >= -1 &&
            rect.right <= viewport.width + 1 &&
            rect.bottom <= viewport.height + 1
          );
        }),
      pageHeight,
      viewport,
    };
  });

const expectCompactDeckToFit = async (page: Page) => {
  await expect.poll(() => compactDeckFitsViewport(page)).toMatchObject({ fits: true });
};

test('phone Arrange compact controls and Play dials meet their target sizes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForPlayDeck(page);
  const dialSize = (await page.locator('.dial-face').first().boundingBox())!;
  expect(dialSize.width).toBeGreaterThanOrEqual(48);
  expect(dialSize.height).toBeGreaterThanOrEqual(48);
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  for (const selector of ['.segments button', '.knobs input[type="range"]']) {
    for (const size of await page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    )) {
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test('the compact Play deck stays fully usable at laptop height through a saved take', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-chromium',
    'Phone layout intentionally stacks and may scroll vertically.',
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await waitForPlayDeck(page);

  await expect(page.locator('.play-controls')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Pattern feel' }).getByRole('button')).toHaveCount(
    6,
  );
  await expect(page.locator('.dials input')).toHaveCount(6);
  await expect(page.locator('.play-footer')).toBeVisible();
  const [hearBox, soloBox] = await Promise.all([
    page.getByRole('button', { name: 'Hear it' }).boundingBox(),
    page.getByRole('button', { name: /^Solo/u }).boundingBox(),
  ]);
  expect(Math.abs(hearBox!.y - soloBox!.y)).toBeLessThan(2);
  const [grooveBox, offsetBox] = await Promise.all([
    page.getByRole('heading', { name: 'Groove' }).boundingBox(),
    page.getByRole('group', { name: 'Pattern offset' }).boundingBox(),
  ]);
  expect(Math.abs(grooveBox!.y - offsetBox!.y)).toBeLessThan(12);
  expect(offsetBox!.x).toBeGreaterThan(grooveBox!.x);
  await expectCompactDeckToFit(page);

  await page.locator('.sound-object').first().click();
  await expectCompactDeckToFit(page);

  await page.getByRole('button', { name: /Record a take/ }).click();
  await expect(page.getByRole('button', { name: 'Cancel count-in' })).toBeVisible();
  await expectCompactDeckToFit(page);

  await expect(page.getByRole('button', { name: 'Save take' })).toBeVisible({ timeout: 6000 });
  await page.getByRole('button', { name: 'Save take' }).click();
  await expect(page.getByText('Take saved.', { exact: true })).toBeVisible();
  await expectCompactDeckToFit(page);
});

test('Play presents graphite structure, source-colored pads, cobalt first beat, and mint transport', async ({
  page,
}) => {
  await page.goto('/');
  await waitForPlayDeck(page);

  const before = await page.evaluate(() => {
    const pads = [...document.querySelectorAll<HTMLElement>('.sound-object')];
    return {
      page: getComputedStyle(document.body).backgroundColor,
      deck: getComputedStyle(document.querySelector<HTMLElement>('.stage-frame')!).backgroundColor,
      firstGlyph: getComputedStyle(pads[0]!.querySelector('.glyph')!).color,
      inactiveFaces: pads.slice(0, 2).map((pad) => getComputedStyle(pad).backgroundColor),
      selectedDial: getComputedStyle(document.querySelector<HTMLElement>('.dial-value')!).stroke,
      transportFace: getComputedStyle(
        document.querySelector<HTMLElement>('.play-footer .transport')!,
      ).backgroundColor,
    };
  });
  const graphite = (value: string) => {
    const channels = value.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/u);
    if (!channels) throw new Error(`Expected OKLCH structural color, received ${value}`);
    return { lightness: Number(channels[1]), chroma: Number(channels[2]) };
  };
  expect(graphite(before.page).chroma).toBeLessThan(0.02);
  expect(graphite(before.deck).chroma).toBeLessThan(0.02);
  expect(graphite(before.deck).lightness).toBeGreaterThan(graphite(before.page).lightness);
  const firstHue = Number(before.firstGlyph.match(/oklch\([\d.]+ [\d.]+ ([\d.]+)\)/u)?.[1]);
  expect(firstHue).toBeGreaterThan(240);
  expect(firstHue).toBeLessThan(290);
  expect(before.inactiveFaces[0]).not.toBe(before.inactiveFaces[1]);

  const firstPad = page.locator('.sound-object').first();
  await firstPad.click();
  await expect(firstPad).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => firstPad.evaluate((pad) => getComputedStyle(pad).backgroundColor))
    .not.toBe(before.inactiveFaces[0]);

  const chord = page.locator('.sound-object').nth(8);
  const chordName = await chord.locator('.object-bottom strong').textContent();
  await chord.click();
  await expect(page.locator('.play-controls h2')).toHaveText(chordName!);
  await expect
    .poll(() =>
      page
        .locator('.dial-value')
        .first()
        .evaluate((dial) => getComputedStyle(dial).stroke),
    )
    .not.toBe(before.selectedDial);
  await expect(page.getByRole('button', { name: 'Stop loop' })).toBeVisible();
  const colors = await page.evaluate(() => ({
    led: getComputedStyle(document.querySelector<HTMLElement>('.stage-topline i')!).backgroundColor,
    transport: getComputedStyle(document.querySelector<HTMLElement>('.play-footer .transport')!)
      .backgroundColor,
  }));
  expect(colors.led).toBe(colors.transport);
  expect(colors.transport).toBe(before.transportFace);
  await expect(
    page.locator('.pattern-strip, .pattern-mark, .steps, .fine-tune, .waveform'),
  ).toHaveCount(0);
  await expect(page.getByText('Fine-tune', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /ensemble/i })).toHaveCount(0);
});

test('the phone Play field never overflows horizontally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'This is the phone viewport contract.');
  await page.goto('/');
  await waitForPlayDeck(page);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <=
          window.innerWidth,
      ),
    )
    .toBe(true);
});

test('Play grows into a centered widescreen deck without losing laptop fit', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await waitForPlayDeck(page);
  await expectCompactDeckToFit(page);
  const laptopBank = (await page.locator('.objects').boundingBox())!.width;

  await page.setViewportSize({ width: 1568, height: 1174 });
  const frame = (await page.locator('.stage-frame').boundingBox())!;
  const bank = (await page.locator('.objects').boundingBox())!;
  expect(bank.width).toBeGreaterThan(laptopBank);
  expect(bank.width).toBeLessThanOrEqual(600);
  expect(Math.abs(frame.y - (64 + (1174 - 64 - frame.height) / 2))).toBeLessThan(3);
});

test('phone Play keeps the 4 by 4 field, footer, and family labels ahead of controls', async ({
  page,
}) => {
  await page.goto('/');
  await waitForPlayDeck(page);
  await expect(page.locator('.stage-topline')).toContainText('Tap a pad to build a loop');
  for (const [width, height] of [
    [390, 844],
    [320, 700],
  ]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const pads = [...document.querySelectorAll<HTMLElement>('.sound-object')];
      const texture = pads.find((pad) => pad.textContent?.toLowerCase().includes('texture'))!;
      const role = [...texture.querySelectorAll('span')].find(
        (span) => span.textContent === 'texture',
      )!;
      return {
        bank: box('.objects').toJSON(),
        footer: box('.play-footer').toJSON(),
        controls: box('.play-controls').toJSON(),
        lastPad: pads.at(-1)!.getBoundingClientRect().toJSON(),
        role: role.getBoundingClientRect().toJSON(),
        texture: texture.getBoundingClientRect().toJSON(),
        widths: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      };
    });
    expect(geometry.bank.width / geometry.bank.height).toBeCloseTo(1, 1);
    expect(geometry.footer.y).toBeGreaterThanOrEqual(geometry.bank.bottom);
    expect(geometry.controls.y).toBeGreaterThanOrEqual(geometry.footer.bottom);
    expect(geometry.footer.y - geometry.lastPad.bottom).toBeGreaterThanOrEqual(22);
    expect(geometry.role.right).toBeLessThanOrEqual(geometry.texture.right - 3);
    expect(geometry.widths).toBeLessThanOrEqual(width);
    await expect(page.locator('.hit-timeline .barline')).toHaveCount(0);
  }
});

test('one dial reset preserves another dial and can be undone from Arrange', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await waitForPlayDeck(page);
  const level = page.getByRole('slider', { name: 'Level' });
  const pan = page.getByRole('slider', { name: 'Pan' });
  const reset = page.getByRole('button', { name: 'Reset Level' });
  await expect(reset).toBeDisabled();
  await level.focus();
  await level.press('ArrowRight');
  await pan.focus();
  await pan.press('ArrowRight');
  await expect(reset).toBeEnabled();
  const changedLevel = await level.inputValue();
  const changedPan = await pan.inputValue();
  await reset.click();
  await expect(level).toHaveValue('0');
  await expect(pan).toHaveValue(changedPan);
  await expect(reset).toBeDisabled();

  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(level).toHaveValue(changedLevel);
  await expect(pan).toHaveValue(changedPan);

  await page.locator('.sound-object').first().click();
  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(level).toBeDisabled();
  await expect(reset).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel count-in' }).click();
  expect((await reset.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await level.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});
