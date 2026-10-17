import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

test.skip(process.env.RESPONSIVE_E2E !== '1', 'Use the isolated browser-responsive runner.');
const widths = [320, 360, 375, 390, 412, 430, 768, 820, 1024, 1280, 1440, 1920];
async function fits(page: Page, label: string, sizes = widths) {
  for (const width of sizes) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('main *, header *, footer *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width &&
            (rect.right > innerWidth + 1 || rect.left < -1) &&
            !element.closest('.table-scroll, .leaflet-container, .sr-only')
          );
        })
        .slice(0, 5)
        .map((element) => `${element.tagName}.${element.className}`),
    }));
    expect(overflow.width, `${label} at ${width}: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(
      width,
    );
  }
}
async function login(page: Page, role: string, next: string) {
  const passwords = JSON.parse(readFileSync(process.env.RESPONSIVE_PASSWORD_FILE!, 'utf8'));
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(`${role.toLowerCase()}@demo.example.test`);
  await page.getByLabel('Password', { exact: true }).fill(passwords[role]);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
}

test('public routes across all widths; mobile menu keyboard and map', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const facilities = await (await page.request.get('/api/facilities')).json();
  const slug = facilities.items[0].slug;
  for (const path of [
    '/',
    '/facilities',
    `/facilities/${slug}`,
    '/compare',
    '/how-it-works',
    '/list-your-facility',
    '/help',
    '/privacy',
    '/terms',
    '/security',
    '/login',
    '/register',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/mfa',
  ]) {
    await page.goto(path);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('.loading')).toHaveCount(0);
    await fits(page, path);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  await menu.click();
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Find courts', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Find courts', exact: true })
    .click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Find courts', exact: true })
    .click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: 'test-results/responsive-discovery-360.png', fullPage: true });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.getByRole('button', { name: 'Map view', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await fits(page, 'map', [320, 360, 390, 768, 1440]);
  expect(errors).toEqual([]);
});

const routes: Record<string, string[]> = {
  PLAYER: [
    '/app',
    '/app/bookings',
    '/app/saved',
    '/app/games',
    '/app/invitations',
    '/app/notifications',
    '/app/reports',
    '/app/applications',
    '/app/settings/profile',
    '/app/settings/security',
    '/onboarding',
    '/app/settings/preferences',
    '/app/settings/verification',
  ],
  FACILITY_OWNER: [
    '/owner',
    '/owner/facilities',
    '/owner/courts',
    '/owner/bookings',
    '/owner/calendar',
    '/owner/reservations',
    '/owner/payments',
    '/owner/check-in',
    '/owner/attendance',
    '/owner/staff',
    '/owner/reviews',
    '/owner/reports',
    '/owner/activity',
    '/owner/notifications',
    '/owner/settings',
  ],
  FACILITY_STAFF: [
    '/staff',
    '/staff/calendar',
    '/staff/bookings',
    '/staff/check-in',
    '/staff/payments',
    '/staff/attendance',
    '/staff/notifications',
  ],
  ADMIN: [
    '/admin',
    '/admin/applications',
    '/admin/facilities',
    '/admin/users',
    '/admin/bookings',
    '/admin/payments',
    '/admin/reports',
    '/admin/alerts',
    '/admin/audit',
    '/admin/health',
    '/admin/settings',
  ],
};
for (const [role, paths] of Object.entries(routes))
  test(`${role}: all workspace pages, navigation, permissions and logout`, async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, role, paths[0]!);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('main h1:visible, main h2:visible').first()).toBeVisible();
      await expect(page.locator('.loading')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await fits(page, `${role} ${path}`, [320, 360, 390, 430, 768, 1440]);
    }
    await page.goto(paths[0]!);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const summary = page.locator('.workspace-toggle');
    await expect(summary).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).not.toBeVisible();
    await summary.click();
    await expect(page.getByLabel('Workspace navigation')).toBeVisible();
    await page.screenshot({ path: `test-results/responsive-${role}-390.png`, fullPage: true });
    await summary.focus();
    await page.keyboard.press('Escape');
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect((await page.request.get('/api/admin/overview')).status()).toBe(role === 'ADMIN' ? 200 : 403);
    if (role === 'PLAYER') {
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect(errors).toEqual([]);
  });

test('shared slots retain server order/data, compact columns, touch/keyboard selection and booking review', async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page, 'PLAYER', '/scheduler/book');
  await expect(page.locator('.nolta-slot').first()).toBeVisible();
  const labels = await page.locator('.nolta-slot strong').allTextContents();
  expect(labels.length).toBeGreaterThan(5);
  for (const width of widths) {
    await fits(page, 'booking slots', [width]);
    const dimensions = await page.locator('.nolta-slots').evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
      cards: [...element.querySelectorAll('button')].map((button) => ({
        width: button.clientWidth,
        height: button.clientHeight,
        overflow: button.scrollWidth > button.clientWidth,
      })),
    }));
    expect(dimensions.columns).toBeGreaterThanOrEqual(width === 320 ? 1 : 2);
    if (width === 320) expect(dimensions.columns).toBe(1);
    if (width >= 360 && width <= 430) expect(dimensions.columns).toBe(2);
    if (width === 768 || width === 820) expect(dimensions.columns).toBeLessThanOrEqual(3);
    expect(dimensions.cards.every((card) => card.height >= 44 && !card.overflow)).toBe(true);
    expect(await page.locator('.nolta-slot strong').allTextContents()).toEqual(labels);
    if ([320, 360, 390, 768, 1440].includes(width))
      await page.screenshot({ path: `test-results/responsive-slots-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 360, height: 800 });
  const slot = page.locator('.nolta-slot:enabled').first();
  const time = await slot.locator('strong').textContent();
  await slot.focus();
  await page.keyboard.press('Space');
  await expect(slot).toHaveAttribute('aria-pressed', 'true');
  await expect(slot).toContainText('Selected');
  await page.getByRole('button', { name: 'Review reservation', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(time!.split('\u2013')[0]!.trim());
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/responsive-booking-dialog-360.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
