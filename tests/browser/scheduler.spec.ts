import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
test.skip(process.env.SCHEDULER_E2E !== '1', 'Use the isolated scheduler test runner.');
const fixtures = () =>
  JSON.parse(readFileSync('.local/scheduler-browser-fixtures.json', 'utf8')) as Record<
    string,
    { email: string; password: string }
  >;
async function login(page: Page, role: string, next: string) {
  const user = fixtures()[role]!;
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  if (role !== 'PLAYER') {
    await page.getByLabel('Demo account password').fill(user.password);
    await page.getByRole('button', { name: 'Open demo workspace', exact: true }).click();
  }
  await expect(page).toHaveURL(new RegExp(next + '$'));
}
const date = () => new Date(Date.now() + 4 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
test('court management, manual reservations, reschedule, maintenance, exceptions, activity and isolated reset', async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page, 'ADMIN', '/scheduler/admin/courts');
  await page.getByRole('button', { name: 'Add Court', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Court name', { exact: true }).fill('New tennis court');
  await modal.getByLabel('Minimum duration (minutes)').fill('30');
  await modal.getByLabel('Default duration (minutes)').fill('75');
  await modal.getByLabel('Maximum duration (optional)').fill('180');
  await modal.getByLabel('Reason', { exact: true }).fill('Add browser demonstration court');
  await modal.getByLabel('I confirm these changes.').check();
  await modal.getByRole('button', { name: 'Save court' }).click();
  await expect(modal).not.toBeVisible();
  const card = page.locator('article').filter({ hasText: 'New tennis court' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit court / activation' }).click();
  await modal.getByLabel('Court status', { exact: true }).selectOption('UNAVAILABLE');
  await modal.getByLabel('Reason', { exact: true }).fill('Test reversible deactivation');
  await modal.getByLabel('I confirm these changes.').check();
  await modal.getByRole('button', { name: 'Save court' }).click();
  await expect(card).toContainText('Unavailable');
  await card.getByRole('button', { name: 'Edit court / activation' }).click();
  await modal.getByLabel('Court status', { exact: true }).selectOption('AVAILABLE');
  await modal.getByLabel('Reason', { exact: true }).fill('Restore active court');
  await modal.getByLabel('I confirm these changes.').check();
  await modal.getByRole('button', { name: 'Save court' }).click();
  await page
    .getByRole('navigation', { name: 'NOLTA navigation' })
    .getByRole('link', { name: 'Schedule', exact: true })
    .click();
  await page
    .getByLabel('Court', { exact: true })
    .selectOption({ label: 'NOLTA Test Club · New tennis court' });
  await page.getByLabel('Booking date', { exact: true }).fill(date());
  await page.getByLabel('Duration (minutes)', { exact: true }).fill('45');
  await page.getByRole('button', { name: '9:00 AM – 9:45 AM Available', exact: true }).click();
  await page.getByRole('button', { name: 'Review manual reservation' }).click();
  await modal.getByLabel('Customer account email (optional)').fill(fixtures().PLAYER!.email);
  await modal.getByLabel('Reason', { exact: true }).fill('Player requested manual reservation');
  await modal.getByLabel('I have reviewed the court, times, price and policy.').check();
  await modal.getByRole('button', { name: 'Create reservation', exact: true }).click();
  await expect(modal).toContainText('The session is reserved.');
  await modal.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: '9:00 AM – 9:45 AM Reserved', exact: true })).toBeDisabled();
  await page.getByText('Maintenance & blocked time', { exact: true }).click();
  const maintenance = page
    .locator('details')
    .filter({ has: page.getByText('Maintenance & blocked time', { exact: true }) });
  await maintenance.getByLabel('From (AM/PM)').fill('2:00 PM');
  await maintenance.getByLabel('To (AM/PM)').fill('3:00 PM');
  await maintenance.getByLabel('Reason', { exact: true }).fill('Court maintenance');
  await maintenance.getByLabel('I confirm these changes.').check();
  await maintenance.getByRole('button', { name: 'Add maintenance' }).click();
  await expect(maintenance.getByRole('status')).toContainText('Maintenance saved');
  await page.getByText('Date-specific schedule exceptions', { exact: true }).click();
  const exception = page
    .locator('details')
    .filter({ has: page.getByText('Date-specific schedule exceptions', { exact: true }) });
  await exception.getByLabel('Exception opens (AM/PM)').fill('7:00 AM');
  await exception.getByLabel('Exception closes (AM/PM)').fill('8:00 PM');
  await exception.getByLabel('Reason', { exact: true }).fill('Special operating hours');
  await exception.getByLabel('I confirm these changes.').check();
  await exception.getByRole('button', { name: 'Save date exception' }).click();
  await expect(exception.getByRole('status')).toContainText('Date exception saved');
  await page.goto('/scheduler/admin/activity');
  const row = page.locator('.nolta-reservation').filter({ hasText: 'New tennis court' });
  await row.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await modal.getByLabel('Booking date', { exact: true }).fill(date());
  await modal.getByLabel('Duration (minutes)', { exact: true }).fill('105');
  await modal.getByRole('button', { name: '10:00 AM – 11:45 AM Available', exact: true }).click();
  await modal.getByLabel('Reason', { exact: true }).fill('Move to longer session');
  await modal.getByLabel('I confirm this reservation change.').check();
  await modal.getByRole('button', { name: 'Save reservation change' }).click();
  await expect(modal).not.toBeVisible();
  await expect(row).toContainText('105 minutes');
  await page.getByLabel('Search reservations').fill('No match');
  await expect(page.getByRole('heading', { name: 'No reservations found' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset Filters', exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Cancel', exact: true }).click();
  await modal.getByLabel('Reason', { exact: true }).fill('Cancel test booking');
  await modal.getByLabel('I confirm this reservation change.').check();
  await modal.getByRole('button', { name: 'Save reservation change' }).click();
  await expect(row).toContainText('CANCELLED');
  await page.getByRole('button', { name: 'Reset Demo Reservations', exact: true }).click();
  await expect(modal).toContainText('1 NOLTA demo reservations');
  await modal.getByLabel('Reason', { exact: true }).fill('Reset isolated demonstration only');
  await modal.getByLabel('I explicitly confirm this demo reservation reset.').check();
  await modal.getByRole('button', { name: 'Confirm demo reset' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Demo reservations reset');
  await expect(page.getByRole('heading', { name: 'No reservations found' })).toBeVisible();
  await page.goto('/scheduler/admin/schedule');
  await page
    .getByLabel('Court', { exact: true })
    .selectOption({ label: 'NOLTA Test Club · New tennis court' });
  await page.getByLabel('Booking date', { exact: true }).fill(date());
  await page.getByLabel('Duration (minutes)', { exact: true }).fill('45');
  await expect(
    page.getByRole('button', { name: '10:00 AM – 10:45 AM Available', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: '2:00 PM – 2:45 PM Maintenance / unavailable', exact: true }),
  ).toBeDisabled();
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `admin overflow at ${width}`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 844 });
  const axe = await new AxeBuilder({ page })
    .include('.nolta')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
test('user booking, private reservations, profile, cancellation and responsive shared calendar', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, 'PLAYER', '/scheduler/book');
  await page.getByLabel('Court', { exact: true }).selectOption({ label: 'NOLTA Test Club · Original court' });
  await page.getByLabel('Booking date', { exact: true }).fill(date());
  await page.getByLabel('Duration (minutes)', { exact: true }).fill('75');
  await page.getByRole('button', { name: '11:00 AM – 12:15 PM Available', exact: true }).click();
  await page.getByRole('button', { name: 'Review reservation', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Reason', { exact: true }).fill('Request court session');
  await modal.getByLabel('I have reviewed the court, times, price and policy.').check();
  await modal.getByRole('button', { name: 'Submit request' }).click();
  await expect(modal).toContainText('Request pending host approval');
  await modal.getByRole('button', { name: 'Done', exact: true }).click();
  await page.goto('/scheduler/reservations');
  const ownRow = page.locator('.nolta-reservation').filter({ hasText: 'Original court' });
  await expect(ownRow).toContainText('75 minutes');
  await ownRow.getByRole('button', { name: 'Cancel', exact: true }).click();
  await modal.getByLabel('Reason', { exact: true }).fill('Cancel own request');
  await modal.getByLabel('I confirm this reservation change.').check();
  await modal.getByRole('button', { name: 'Save reservation change' }).click();
  await expect(ownRow).toContainText('CANCELLED');
  expect((await page.request.get('/api/scheduler/reservations?manage=1')).status()).toBe(403);
  await page.goto('/scheduler/admin/activity');
  await expect(page.getByRole('heading', { name: 'Admin or court host access required' })).toBeVisible();
  await page.goto('/scheduler/profile');
  await expect(page).toHaveURL(/\/app\/settings\/profile$/);
  await expect(page.getByRole('heading', { name: 'Account settings', exact: true })).toBeVisible();
  await page.goto('/scheduler/book');
  await expect(page.getByRole('heading', { name: 'Available time slots' })).toBeVisible();
  for (const width of [320, 375, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `no overflow at ${width}`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 375, height: 844 });
  const axe = await new AxeBuilder({ page })
    .include('.nolta')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: 'test-results/nolta-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/nolta-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect((await (await page.request.get('/api/auth/me')).json()).user).toBeNull();
});

test('theme persists, three-tab navigation stays scoped and court archival is usable', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'ADMIN', '/scheduler/admin/courts');
  await expect(page.locator('.nolta-top')).toContainText('ADMIN MODE');
  const toggle = page.getByRole('button', { name: 'Dark mode', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Add Court', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel('Surface', { exact: true })).toHaveCount(0);
  await modal.getByLabel('Facility', { exact: true }).selectOption({ label: 'Z Different Hours Club' });
  await expect(modal.getByLabel('Opens (AM/PM)', { exact: true })).toHaveValue('8:00 AM');
  await expect(modal.getByLabel('Closes (AM/PM)', { exact: true })).toHaveValue('6:00 PM');
  await modal.getByLabel('Facility', { exact: true }).selectOption({ label: 'NOLTA Test Club' });
  await modal.getByLabel('Court name', { exact: true }).fill('Archive browser court');
  await modal.getByLabel('Court status', { exact: true }).selectOption('MAINTENANCE');
  await modal.getByLabel('Reason', { exact: true }).fill('Create isolated maintenance court');
  await modal.getByLabel('I confirm these changes.').check();
  await modal.getByRole('button', { name: 'Save court', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const card = page.locator('article').filter({ hasText: 'Archive browser court' });
  await expect(card).toContainText('Maintenance');
  await card.getByRole('button', { name: 'Remove court', exact: true }).click();
  await modal.getByLabel('Reason', { exact: true }).fill('Archive unused browser fixture');
  await modal.getByLabel('I confirm court archival and understand that history is preserved.').check();
  await modal.getByRole('button', { name: 'Archive court', exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByRole('link', { name: 'Open user mode', exact: true }).click();
  await expect(page.locator('.nolta-top')).toContainText('USER MODE');
  const nav = page.getByRole('navigation', { name: 'NOLTA navigation' });
  await expect(nav.getByRole('link')).toHaveCount(3);
  await expect(nav.getByRole('link', { name: 'Profile', exact: true })).toHaveCount(0);
  await expect(page.locator('.nolta').getByText('Account / Logout', { exact: true })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Book a Court', exact: true }).click();
  await expect(page.locator('.nolta-slot').first()).toBeVisible();
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  const axe = await new AxeBuilder({ page })
    .include('.nolta')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: '.local/nolta-theme-dark.png', fullPage: true });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
