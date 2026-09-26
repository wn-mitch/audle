import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Entrances and view transitions blend opacity for well under a second; the audit measures the
 * settled page. Svelte transitions run as Web Animations and attach a frame after the view
 * changes, so the wait lets two frames pass, then waits for every animation to stop and for the
 * entrance actions to clear their inline opacity. */
const settled = async (page: Page) => {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForFunction(
    () =>
      !document.querySelector('[style*="opacity"]') &&
      document.getAnimations().every((animation) => animation.playState !== 'running'),
    undefined,
    { timeout: 5000 },
  );
};

const expectNoSeriousViolations = async (page: Page) => {
  await settled(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);
};

test('keeps Play, Arrange, the share sheet, and Help free of serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Share' })).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Help' }).click();
  await expectNoSeriousViolations(page);
});
