import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.skip(process.env.RENDER_RESPONSIVE_E2E !== '1', 'Explicit read-only live verification opt-in.');
const widths = [360, 390, 430, 768, 1440];
async function fits(page: Page) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${page.url()} at ${width}`,
    ).toBeLessThanOrEqual(width);
  }
}
test('live responsive public pages, booking availability, API/database and production flags', async ({
  page,
}) => {
  test.setTimeout(180000);
  expect(test.info().project.use.baseURL).toBe('https://larosentry-test.onrender.com');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/');
  expect(response!.status()).toBe(200);
  expect(response!.url()).toMatch(/^https:\/\//);
  expect(response!.headers()['content-security-policy']).toContain("script-src 'self'");
  const health = await (await page.request.get('/api/health')).json();
  expect(health.database).toBe('connected');
  expect(health.demoMode).not.toBe(true);
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.demoMode).not.toBe(true);
  for (const path of ['/', '/login', '/register', '/facilities', '/facilities/pilot-courts-1', '/security']) {
    await page.goto(path);
    await expect(page.locator('main h1:visible, main h2:visible').first()).toBeVisible();
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await fits(page);
    if (path === '/facilities') {
      await page.setViewportSize({ width: 360, height: 800 });
      for (const selector of ['.save-button', '.round-arrow', '.compare-button']) {
        const bounds = await page.locator(selector).first().boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(page.getByText('DEMO MODE', { exact: false })).toHaveCount(0);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
  expect(errors).toEqual([]);
});
for (const role of ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'])
  test(`live ${role}: responsive login, workspace or MFA gate, permissions, logout`, async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const next =
      role === 'ADMIN'
        ? '/admin'
        : role === 'FACILITY_OWNER'
          ? '/owner'
          : role === 'FACILITY_STAFF'
            ? '/staff'
            : '/app/bookings';
    const passwords = JSON.parse(readFileSync('.local/render-pilot-passwords.json', 'utf8'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel('Email address', { exact: true }).fill(`${role.toLowerCase()}@pilot.example.test`);
    await page.getByLabel('Password', { exact: true }).fill(passwords[role]);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    if (role === 'PLAYER') {
      await expect(page).toHaveURL(/\/app\/bookings$/);
      await expect(page.locator('.workspace-toggle')).toBeVisible();
      await page.locator('.workspace-toggle').click();
      await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
      await page.locator('.workspace-toggle').click();
    } else
      await expect(page.getByRole('heading', { name: 'Protect your workspace.', exact: true })).toBeVisible();
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.user.role).toBe(role);
    expect(me.demoMode).not.toBe(true);
    expect(me.user.verificationBypassed).not.toBe(true);
    expect(me.user.mfaVerified).toBe(false);
    expect(me.user.demoAccessAllowed).toBe(false);
    await expect(page.getByRole('button', { name: 'Open demo workspace', exact: true })).toHaveCount(0);
    const cookie = (await page.context().cookies()).find((item) => item.name === 'ls_session')!;
    expect(cookie.secure && cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
    await fits(page);
    if (role === 'PLAYER') {
      await page.goto('/scheduler/book');
      await expect(page.locator('.nolta-slot').first()).toBeVisible();
      await fits(page);
      await page.setViewportSize({ width: 360, height: 800 });
      expect(
        await page
          .locator('.nolta-slots')
          .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
      ).toBe(2);
      const slot = page.locator('.nolta-slot:enabled').first();
      await slot.click();
      await expect(slot).toHaveAttribute('aria-pressed', 'true');
      await expect(slot).toContainText('Selected');
      await page.screenshot({ path: '.local/responsive-evidence/live-slots-360.png', fullPage: true });
      await page.goto('/app/bookings');
      await expect(page.locator('.workspace-toggle')).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `.local/responsive-evidence/live-${role}-390.png`, fullPage: true });
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect((await (await page.request.get('/api/auth/me')).json()).user).toBeNull();
    expect(errors).toEqual([]);
  });
