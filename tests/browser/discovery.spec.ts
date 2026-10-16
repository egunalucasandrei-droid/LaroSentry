import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const [name, width, height] of [
  ['mobile', 390, 844],
  ['tablet', 820, 1180],
  ['desktop', 1440, 1000],
] as const) {
  test(`${name}: discovery renders, stays within viewport, and has no serious accessibility violations`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Less searching. More playing.' })).toBeVisible();
    await expect(page.locator('.facility-card')).toHaveCount(3);
    await expect(page.locator('.hero-copy')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
    await page.screenshot({ path: `test-results/home-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Find a court' }).click();
    await expect(page.getByRole('heading', { name: 'Find your next court.' })).toBeVisible();
    await expect(page.locator('.facility-card').first()).toBeVisible();
    await page.getByRole('combobox', { name: 'Sport', exact: true }).selectOption('Basketball');
    await expect(page.locator('.facility-card').first()).toBeVisible();
    await page.locator('.facility-card h3 a').first().click();
    await expect(page.getByRole('heading', { name: 'Choose your court.' })).toBeVisible();
    await page.getByRole('button', { name: 'Review request' }).click();
    await expect(page.getByText('Total for your court time')).toBeVisible();
    await page.getByRole('button', { name: 'Log in to continue' }).click();
    await expect(page.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
test('comparison and offline discovery errors are visible', async ({ page }) => {
  await page.goto('/facilities');
  await page.getByRole('button', { name: 'Compare facility' }).first().click();
  await page.locator('.compare-tray').getByRole('link', { name: 'Compare facilities' }).click();
  await expect(page.locator('.compare-grid .panel')).toHaveCount(1);
  await page.context().setOffline(true);
  await page.getByRole('link', { name: 'Find courts', exact: true }).first().click();
  await expect(page.getByText('You’re offline.', { exact: false })).toBeVisible();
  await page.context().setOffline(false);
});
