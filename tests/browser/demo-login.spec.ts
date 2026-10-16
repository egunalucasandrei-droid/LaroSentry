import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const role of ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN']) {
  test(`demo ${role}: login, reload, permission gate and logout`, async ({ page }) => {
    const marker = JSON.parse(readFileSync('.local/demo-database.json', 'utf8'));
    const health = await (await page.request.get('/api/health')).json();
    expect(health.demoInstance).toBe(marker.name);
    const passwords = JSON.parse(readFileSync('.local/demo-passwords.json', 'utf8'));
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(`${role.toLowerCase()}@demo.example.test`);
    await page.getByLabel('Password', { exact: true }).fill(passwords[role]);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    const heading = role === 'PLAYER' ? 'My bookings' : 'Protect your workspace.';
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.user.role).toBe(role);
    expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (role === 'FACILITY_OWNER' || role === 'FACILITY_STAFF') {
      await page.getByLabel('Demo account password').fill(passwords[role]);
      await page.getByRole('button', { name: 'Open demo workspace', exact: true }).click();
      await expect(page).toHaveURL(role === 'FACILITY_OWNER' ? /\/owner$/ : /\/staff$/);
      await expect(
        page.getByRole('heading', {
          name: role === 'FACILITY_OWNER' ? 'The day’s game plan.' : 'Your daily operations',
        }),
      ).toBeVisible();
      expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
      await page.goto(role === 'FACILITY_OWNER' ? '/owner/calendar' : '/staff/calendar');
      await expect(page.getByRole('heading', { name: 'Available time slots' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
    expect((await (await page.request.get('/api/auth/me')).json()).user).toBeNull();
  });
}
test('wrong password shows a useful error and permits a corrected retry', async ({ page }) => {
  const passwords = JSON.parse(readFileSync('.local/demo-passwords.json', 'utf8'));
  await page.goto('/login?next=%2Fapp%2Freports');
  await page.getByLabel('Email address', { exact: true }).fill('player@demo.example.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong-demo-password-only');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await page.getByLabel('Password', { exact: true }).fill(passwords.PLAYER);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My reports', exact: true })).toBeVisible();
});

test('demo admin unlocks assigned calendar and admin controls with password confirmation', async ({
  page,
}) => {
  const passwords = JSON.parse(readFileSync('.local/demo-passwords.json', 'utf8'));
  await page.goto('/login?next=%2Fmanage');
  await page.getByLabel('Email address', { exact: true }).fill('admin@demo.example.test');
  await page.getByLabel('Password', { exact: true }).fill(passwords.ADMIN);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Demo account password').fill('wrong-demo-confirmation-password');
  await page.getByRole('button', { name: 'Open demo workspace', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
  await page.getByLabel('Demo account password').fill(passwords.ADMIN);
  await page.getByRole('button', { name: 'Open demo workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/manage$/);
  expect((await page.request.get('/api/admin/overview')).status()).toBe(200);
  await page.getByRole('link', { name: 'Court calendar & controls' }).click();
  await expect(page.getByRole('heading', { name: 'Available time slots' })).toBeVisible();
  // Shared demo scenarios may have expired or been edited; deterministic reserved slots
  // are covered by the isolated scheduler suite instead of assuming yesterday's data.
  await expect(page.locator('.calendar-slot').first()).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
});
