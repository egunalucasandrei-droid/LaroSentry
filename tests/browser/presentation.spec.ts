import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
test.skip(process.env.RESPONSIVE_E2E !== '1', 'Use the isolated responsive presentation runner.');
test.setTimeout(120000);
async function login(page: Page, role: string, next: string) {
  const passwords = JSON.parse(readFileSync(process.env.RESPONSIVE_PASSWORD_FILE!, 'utf8'));
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(`${role.toLowerCase()}@demo.example.test`);
  await page.getByLabel('Password', { exact: true }).fill(passwords[role]);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
}
test('player presentation dashboard, friendly report targets and persisted submission', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'PLAYER', '/app');
  await expect(page.getByRole('heading', { name: 'Your playing plan.' })).toBeVisible();
  const overview = await (await page.request.get('/api/player/overview')).json();
  expect(overview.pending).toBeGreaterThan(0);
  expect(overview.upcoming).toBeGreaterThan(0);
  expect(overview.saved).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Recent booking activity' })).toBeVisible();
  await expect(page.locator('.presentation-record').first()).toBeVisible();
  await page.goto('/app/reports');
  await page.getByLabel('Report about', { exact: true }).selectOption('FACILITY');
  await page.getByLabel('Search reportable resources', { exact: true }).fill('Caloocan');
  const facility = page.getByLabel('Facility to report', { exact: true });
  await expect(facility.locator('option')).toHaveCount(2);
  const id = await facility.locator('option').nth(1).getAttribute('value');
  await facility.selectOption(id!);
  await page
    .getByLabel('What happened?', { exact: true })
    .fill('Fictional presentation concern: clarify the posted cancellation information.');
  await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('fair human review');
  await expect(
    page.getByText('Fictional presentation concern: clarify the posted cancellation information.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Report about', { exact: true }).selectOption('GAME');
  await expect(page.getByLabel('Game to report', { exact: true }).locator('option')).toHaveCount(2);
  await expect(page.getByPlaceholder('UUID reference')).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
test('owner approval updates player history; manual payment, QR and community demonstrations are truthful', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, 'FACILITY_OWNER', '/owner');
  await page
    .getByRole('navigation', { name: 'Daily workspace actions' })
    .getByRole('link', { name: 'Review booking requests', exact: true })
    .click();
  const card = page.locator('.panel').filter({ hasText: /PRESENT-.*-REQUEST/ });
  await card.getByRole('button', { name: 'Confirm request', exact: true }).click();
  await expect(card.getByText('CONFIRMED', { exact: true })).toBeVisible();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const player = await context.newPage();
  await login(player, 'PLAYER', '/app/bookings');
  await player
    .getByRole('link')
    .filter({ hasText: /PRESENT-.*-PAID-BOOKING/ })
    .click();
  await expect(player.getByText('PAID · recorded by facility staff', { exact: true })).toBeVisible();
  await expect(
    player.getByText('this prototype does not charge a card or transfer money.', { exact: false }),
  ).toBeVisible();
  await player.getByRole('button', { name: 'Issue check-in QR', exact: true }).click();
  await expect(player.locator('.qr-panel img')).toBeVisible();
  await player.goto('/app/games');
  await expect(player.locator('.game-card')).toHaveCount(1);
  await expect(player.locator('.game-card')).toContainText('organizer approval required');
  await context.close();
});
test('admin control center has real review counts and no secret data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'ADMIN', '/admin');
  const data = await (await page.request.get('/api/admin/overview')).json();
  expect(data.pendingApplications).toBeGreaterThan(0);
  expect(data.openReports).toBeGreaterThan(0);
  expect(data.unresolvedAlerts).toBeGreaterThan(0);
  expect(data.publishedFacilities).toBe(20);
  expect(data.registeredUsers).toBe(4);
  expect(JSON.stringify(data)).not.toMatch(/passwordHash|mfaSecret|tokenHash/);
  await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Check operational status', exact: true })).toBeVisible();
});
