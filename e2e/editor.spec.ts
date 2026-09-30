import { expect, test, type Locator, type Page } from '@playwright/test';

const openArrange = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Focused Arrange editor' })).toBeVisible();
};

const focusedEditor = (page: Page) => page.getByRole('region', { name: 'Focused Arrange editor' });

const soundPicker = (page: Page) => page.getByRole('combobox', { name: 'Sound to arrange' });

const selectSound = async (page: Page, index: number) => {
  const option = soundPicker(page).locator(`option[value="track-${index}"]`);
  await expect(option).toHaveCount(1);
  await soundPicker(page).selectOption(`track-${index}`);
  await expect(soundPicker(page).locator('option:checked')).toHaveAttribute(
    'value',
    `track-${index}`,
  );
};

const position = (page: Page, tick: number) =>
  focusedEditor(page).locator(`.arrange-position[data-tick="${tick}"]`);

const expectOccupied = async (target: Locator) => {
  await expect(target).toHaveAccessibleName(/occupied by/u);
};

const expectEmpty = async (target: Locator) => {
  await expect(target).toHaveAccessibleName(/empty$/u);
};

const editBar = async (page: Page, bar: number) => {
  await focusedEditor(page)
    .getByRole('button', { name: `Edit bar ${bar}`, exact: true })
    .click();
};

test('empty Arrange exposes its focused sound and first placement without page scrolling', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Phone layout only.');
  await page.setViewportSize({ width: 390, height: 844 });
  await openArrange(page);

  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(soundPicker(page).locator('option:checked')).toContainText(/01 .+ · Loop/u);
  const firstPosition = position(page, 0);
  const box = (await firstPosition.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);

  await firstPosition.click();
  await expectOccupied(firstPosition);
  await expect(focusedEditor(page).getByRole('status')).toContainText(/Loop placed.*Bar 1/u);
});

test('Arrange remains navigable at 320px with all assisted starts available', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Phone layout only.');
  await page.setViewportSize({ width: 320, height: 700 });
  await openArrange(page);

  await expect(focusedEditor(page)).toBeVisible();
  await expect(page.getByLabel('Vibe for Jev')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Remix today’s starter' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Try a ready-made beat' })).toBeAttached();
  await page.locator('summary').filter({ hasText: 'Hear an example' }).click();
  await expect(page.getByRole('button', { name: 'Four on the floor' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <=
          window.innerWidth,
      ),
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.sound-object')).toHaveCount(16);
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(focusedEditor(page)).toBeVisible();
});

test('pad recording is undoable and ends on Play, Help, example and shared-link exits', async ({
  page,
}) => {
  await openArrange(page);
  const record = page.getByRole('button', { name: 'Record pads' });
  const pad = page.locator('.pad-bank .pad').nth(8);

  await record.click();
  await expect(page.getByRole('button', { name: 'Stop recording pads' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Pad taps add clips' })).toBeVisible();
  await pad.click();
  await expect(soundPicker(page).locator('option:checked')).toHaveAttribute('value', 'track-8');
  await expectOccupied(position(page, 0));
  await page.getByRole('button', { name: 'Undo' }).click();
  await expectEmpty(position(page, 0));
  await page.getByRole('button', { name: 'Redo' }).click();
  await expectOccupied(position(page, 0));

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record pads' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await pad.click();
  await expectOccupied(position(page, 0));

  await record.click();
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('button', { name: 'Record pads' }).click();
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
  await expectEmpty(position(page, 0));
  await record.click();
  await page.locator('summary').filter({ hasText: 'Hear an example' }).click();
  await page.getByRole('button', { name: 'Four on the floor' }).click();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record pads' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await pad.click();
  await expectEmpty(position(page, 0));

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

test('sound identity and parameter language follow the focused sound across views', async ({
  page,
}) => {
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
  await expect(soundPicker(page).locator('option:checked')).toContainText(`09 ${name} · Hit`);
  const pad = page.locator('.pad-bank .pad').nth(8);
  await expect(pad).toContainText('09');
  await expect(pad).toContainText(name);
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

test('native position buttons place hit and loop clips from the keyboard', async ({ page }) => {
  await openArrange(page);
  await page
    .getByRole('group', { name: 'Arrangement length in bars' })
    .getByRole('button', { name: '4 bars', exact: true })
    .click();
  await selectSound(page, 8);
  await editBar(page, 2);
  const hit = position(page, 408);
  await expect(hit).toHaveAccessibleName(/Bar 2, beat 1, step 2.*empty/u);
  await hit.focus();
  await page.keyboard.press('Enter');
  await expectOccupied(hit);
  await expect(hit).toBeFocused();

  await selectSound(page, 0);
  const loop = position(page, 768);
  await expect(loop).toHaveAccessibleName(/Bar 3.*empty/u);
  await loop.focus();
  await page.keyboard.press('Space');
  await expect(loop).toHaveAccessibleName(/Bar 3, occupied by Loop/u);
  await expect(loop).toBeFocused();
});

test('selecting a clip then tapping a destination moves it once and Undo restores it', async ({
  page,
}) => {
  await openArrange(page);
  await selectSound(page, 8);
  const origin = position(page, 0);
  await origin.click();
  await expectOccupied(origin);
  await origin.click();
  await expect(focusedEditor(page).getByRole('status')).toContainText(/destination.*Cancel move/u);

  await editBar(page, 2);
  const destination = position(page, 408);
  await destination.click();
  await expect(destination).toHaveAccessibleName(/Bar 2, beat 1, step 2.*occupied by Hit/u);
  await expect(focusedEditor(page).locator('.arrange-position.occupied')).toHaveCount(1);
  await editBar(page, 1);
  await expectEmpty(origin);
  await expect(focusedEditor(page).locator('.arrange-position.occupied')).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expectOccupied(origin);
  await editBar(page, 2);
  await expectEmpty(destination);

  await editBar(page, 1);
  await origin.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cancel move' })).toHaveCount(0);
  await expectOccupied(origin);
  await origin.click();
  await page.getByRole('button', { name: 'Cancel move' }).click();
  await expectOccupied(origin);
});

test('colliding and out-of-range destinations retain the clip and pending move', async ({
  page,
}) => {
  await openArrange(page);
  await selectSound(page, 8);
  const firstHit = position(page, 0);
  const secondHit = position(page, 24);
  await firstHit.click();
  await secondHit.click();
  await firstHit.click();
  await secondHit.click();
  await expect(firstHit).toHaveAccessibleName(/Bar 1, beat 1, step 1.*occupied by Hit/u);
  await expect(secondHit).toHaveAccessibleName(/Bar 1, beat 1, step 2.*occupied by Hit/u);
  await expect(focusedEditor(page).getByRole('status')).toContainText(
    /destination is occupied.*move is still ready/u,
  );
  await expect(page.getByRole('button', { name: 'Cancel move' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel move' }).click();

  await selectSound(page, 0);
  const loopOrigin = position(page, 0);
  await loopOrigin.click();
  await expect(loopOrigin).toHaveAccessibleName(/Bar 1.*Loop.*2 bars/u);
  const continuation = position(page, 384);
  await expect(continuation).toHaveAccessibleName(/continuing from Bar 1/u);
  await continuation.click();
  const lastBar = focusedEditor(page).locator('.loop-positions .arrange-position').last();
  await lastBar.click();
  await expect(loopOrigin).toHaveAccessibleName(/Bar 1.*Loop.*2 bars/u);
  await expect(focusedEditor(page).getByRole('status')).toContainText(
    /exceed the arrangement.*move is still ready/u,
  );
  await expect(page.getByRole('button', { name: 'Cancel move' })).toBeVisible();
});

test('sound switching clears ordinary move selection but preserves additive selection', async ({
  page,
}) => {
  await openArrange(page);
  await selectSound(page, 0);
  const loop = position(page, 0);
  await loop.click();
  await loop.click();
  await expect(focusedEditor(page).getByText('1 selected', { exact: true })).toBeVisible();
  await selectSound(page, 8);
  await expect(focusedEditor(page).getByText('0 selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel move' })).toHaveCount(0);
  await selectSound(page, 0);
  await loop.click();
  await page.locator('.pad-bank .pad').nth(8).click();
  await expect(soundPicker(page).locator('option:checked')).toHaveAttribute('value', 'track-8');
  await expect(focusedEditor(page).getByText('0 selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel move' })).toHaveCount(0);

  await selectSound(page, 0);
  await loop.click();
  await page.getByRole('button', { name: 'Select multiple clips' }).click();
  await selectSound(page, 8);
  await expect(focusedEditor(page).getByText('1 selected', { exact: true })).toBeVisible();
  await expect(focusedEditor(page).getByRole('status')).toContainText(
    /Sound changed.*selection is kept/u,
  );
});

test('selected hit clip actions nudge, duplicate and change its roll', async ({ page }) => {
  await openArrange(page);
  await selectSound(page, 8);
  const firstStep = position(page, 0);
  const secondStep = position(page, 24);
  const thirdStep = position(page, 48);
  await firstStep.click();
  await firstStep.click();
  await page.getByRole('button', { name: 'Cancel move' }).click();

  const earlier = page.getByRole('button', {
    name: 'Nudge selected clips one step earlier',
  });
  const later = page.getByRole('button', { name: 'Nudge selected clips one step later' });
  await expect(earlier).toBeVisible();
  await expect(later).toBeVisible();
  await later.click();
  await expectEmpty(firstStep);
  await expectOccupied(secondStep);

  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expectOccupied(secondStep);
  await expectOccupied(thirdStep);
  await page.getByRole('button', { name: 'Roll ×2', exact: true }).click();
  await expect(secondStep).toHaveAccessibleName(/occupied by Hit ×2/u);
  await expect(thirdStep).toHaveAccessibleName(/occupied by Hit$/u);
});

test('selected loop exposes its real span, resizes, deletes and restores with Undo', async ({
  page,
}) => {
  await openArrange(page);
  await selectSound(page, 0);
  const loop = position(page, 0);
  await loop.click();
  await loop.click();
  await page.getByRole('button', { name: 'Cancel move' }).click();

  const shorten = page.getByRole('button', { name: 'Shorten', exact: true });
  const lengthen = page.getByRole('button', { name: 'Lengthen', exact: true });
  for (const button of [shorten, lengthen]) {
    const size = (await button.boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  await expect(loop).toHaveAccessibleName('Bar 1, occupied by Loop · 2 bars');
  await shorten.click();
  await expect(loop).toHaveAccessibleName('Bar 1, occupied by Loop · 1 bar 15 steps');
  await lengthen.click();
  await expect(loop).toHaveAccessibleName('Bar 1, occupied by Loop · 2 bars');

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expectEmpty(loop);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expectOccupied(loop);
});

test('populated arrangement shortening waits for confirmation and Undo restores trimmed clips', async ({
  page,
}) => {
  await openArrange(page);
  const length = page.getByRole('group', { name: 'Arrangement length in bars' });
  await length.getByRole('button', { name: '4 bars', exact: true }).click();
  await selectSound(page, 0);
  const finalBar = position(page, 1152);
  await finalBar.click();
  await expectOccupied(finalBar);

  await length.getByRole('button', { name: '1 bar', exact: true }).click();
  const confirmation = length.getByRole('alert');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(/trims\s+or removes 1\s+clip/u);
  await expect(length.getByRole('button', { name: '4 bars', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectOccupied(finalBar);

  await confirmation.getByRole('button', { name: 'Keep length', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expectOccupied(finalBar);
  await length.getByRole('button', { name: '1 bar', exact: true }).click();
  await confirmation
    .getByRole('button', { name: 'Shorten arrangement to 1 bar', exact: true })
    .click();
  await expect(focusedEditor(page).locator('.loop-positions .arrange-position')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(focusedEditor(page).locator('.loop-positions .arrange-position')).toHaveCount(4);
  await expectOccupied(position(page, 1152));
});

test('remixing the starter keeps focused composing and can add a selected layer', async ({
  page,
}) => {
  await openArrange(page);
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await expect(soundPicker(page).locator('option')).toHaveCount(16);
  await expect(focusedEditor(page).locator('.arrange-position.occupied')).not.toHaveCount(0);
  await expect(
    focusedEditor(page).getByLabel('Other active sounds by bar').locator('span').first(),
  ).not.toContainText('Bar 1: 0 ');

  const selectedBefore = await soundPicker(page).inputValue();
  await page.getByRole('button', { name: 'Add a layer' }).click();
  await expect(soundPicker(page).locator('option')).toHaveCount(17);
  await expect(soundPicker(page).locator('option:checked')).toContainText(/Layer 2 · (Loop|Hit)/u);
  expect(await soundPicker(page).inputValue()).not.toBe(selectedBefore);
});

test('Jam with Jev fills empty sounds and one Undo takes it back', async ({ page }) => {
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
  await openArrange(page);
  await page.getByLabel('Vibe for Jev').fill('bouncy');
  await page.getByRole('button', { name: 'Jam with Jev' }).last().click();

  await expect(page.getByText(/Jev filled \d+ tracks?\./u)).toBeVisible();
  expect(sent?.vibe).toBe('bouncy');
  expect(sent?.tracks.filter((track) => track.fill)).toHaveLength(16);
  await expect(page.locator('.jam-pick').first()).toBeVisible();
  await expect(focusedEditor(page).locator('.arrange-position.occupied')).not.toHaveCount(0);

  await page.getByRole('button', { name: 'Undo' }).click();
  for (const option of await soundPicker(page).locator('option').all()) {
    await soundPicker(page).selectOption((await option.getAttribute('value'))!);
    await expect(focusedEditor(page).locator('.arrange-position.occupied')).toHaveCount(0);
  }
});

test('Jam with Jev reports an outage without changing the focused sound', async ({ page }) => {
  await page.route('/api/jev', (route) => route.fulfill({ status: 502, json: { error: 'down' } }));
  await openArrange(page);
  await page.getByRole('button', { name: 'Jam with Jev' }).last().click();
  await expect(page.getByText('Jev is offline. Your loop is unchanged.')).toBeVisible();
  await expect(focusedEditor(page).locator('.arrange-position.occupied')).toHaveCount(0);
});
