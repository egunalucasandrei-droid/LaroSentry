import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { POLICY_VERSION } from '../../packages/contracts/src/index';
const routes = [
  ['/how-it-works', 'How booking works', 'Pending is not confirmed'],
  ['/help', 'Help & contact', 'Contact channel pending setup'],
  ['/privacy', 'Privacy notice', 'Retention and deletion'],
  ['/terms', 'Terms of use', 'Cancellations, changes and refunds'],
  ['/security', 'Security & acceptable use', 'Fair review'],
];
for (const width of [390, 1440])
  test(`footer pages work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    for (const [path, title, section] of routes) {
      await page.locator('footer').getByRole('link', { name: title!, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { name: title!, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: section!, exact: true })).toBeVisible();
      await expect(page).toHaveTitle(`${title} | LaroSentry`);
      expect(await page.locator('main').innerText()).not.toMatch(
        /academic|capstone|thesis|FEU Diliman|Technical Difficulties|course channel/i,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations.filter((v) => ['serious', 'critical'].includes(v.impact!))).toEqual([]);
      await page.reload();
      await expect(page.getByRole('heading', { name: title!, exact: true })).toBeVisible();
      if (path === '/privacy' || path === '/terms')
        await expect(page.getByText(/Publication draft/)).toContainText(POLICY_VERSION);
    }
    await page.getByRole('link', { name: 'Submit or track a report', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.goto('/register');
    await expect(
      page.locator('form').getByRole('link', { name: 'terms of use', exact: true }),
    ).toHaveAttribute('href', '/terms');
    await expect(
      page.locator('form').getByRole('link', { name: 'privacy notice', exact: true }),
    ).toHaveAttribute('href', '/privacy');
  });
