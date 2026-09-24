import { expect, test } from '@playwright/test';

test('remixes the starter and layers the selected voice', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();

  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await expect(page.locator('input[aria-label^="Label for"]')).toHaveCount(8);

  await page.getByRole('button', { name: '+ Add a layer' }).click();
  await expect(page.locator('input[aria-label="Label for Layer 2"]')).toBeVisible();
  await expect(page.locator('input[aria-label^="Label for"]')).toHaveCount(9);
});

test('clicking a lane places a hit under the pointer, aligned with both playheads', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Covered by the tap test below.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByText('4 bars', { exact: false })).toBeVisible();
  await expect(page.getByText('Decoding sounds')).toHaveCount(0);
  const lane = page.locator('.lane-content').nth(4);
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

  await expect(page.getByText('Jev filled 3 tracks')).toBeVisible();
  expect(sent?.vibe).toBe('bouncy');
  expect(sent?.tracks.filter((track) => track.fill)).toHaveLength(8);
  await expect(page.locator('.lane-content').nth(4).locator('.clip')).not.toHaveCount(0);
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
