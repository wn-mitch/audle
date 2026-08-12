import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const expectNoSeriousViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);
};

test('keeps maker and tutorial free of serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Remix today’s starter' }).click();
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Help' }).click();
  await expectNoSeriousViolations(page);
});
