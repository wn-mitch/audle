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
  await expect(page.locator('.dials input')).toHaveCount(3);
  await expect(page.locator('.play-footer')).toBeVisible();
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
