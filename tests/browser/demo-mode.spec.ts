import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
test.skip(
  !['on', 'off'].includes(process.env.LOCAL_DEMO_MODE_E2E ?? ''),
  'Explicit opt-in for the existing loopback demo.',
);
const enabled = process.env.LOCAL_DEMO_MODE_E2E === 'on';
test('local demo ON: facility wizard submits synthetic information without identity uploads', async ({
  page,
}) => {
  test.skip(!enabled, 'Evidence bypass is tested only with explicit local mode ON.');
  const password = JSON.parse(readFileSync('.local/demo-passwords.json', 'utf8')).PLAYER;
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill('player@demo.example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/onboarding/facility');
  await page.getByRole('button', { name: 'Start facility draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Facility information', exact: true })).toBeVisible();
  const draftUrl = page.url();
  for (const [label, value] of [
    ['Facility name', `Synthetic demo bypass UI ${randomUUID().slice(0, 8)}`],
    ['City or area', 'Quezon City'],
    ['Facility address', '20 Fictional Local Demo Avenue'],
    ['Facility description', 'Synthetic local browser test; no real facility or identity evidence.'],
    ['Facility contact mobile (+63)', '+639171234567'],
    ['Court name', 'Synthetic Court'],
    ['Cancellation policy', 'Fictional test cancellation policy only.'],
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!);
  await page.getByRole('combobox', { name: 'Relationship to facility', exact: true }).selectOption('MANAGER');
  await page.getByRole('button', { name: 'Save facility information', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Identity & supporting evidence', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('LOCAL DEMO: uploads and ID type are optional', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review application', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'I am authorized to represent this facility', exact: false })
    .check();
  await page.getByRole('button', { name: 'Submit facility for verification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submitted for admin review', exact: true })).toBeVisible();
  const draft = await (await page.request.get('/api/onboarding/drafts/' + draftUrl.split('/').pop())).json();
  expect(draft.application.state).toBe('PENDING');
  expect(draft.application.identityState).toBe('DEMO_BYPASSED');
  expect(draft.documents).toHaveLength(0);
  expect((await (await page.request.get('/api/auth/me')).json()).user.role).toBe('PLAYER');
});
const paths: Record<string, string[]> = {
  ADMIN: [
    '/admin',
    '/admin/applications',
    '/admin/users',
    '/admin/reports',
    '/admin/alerts',
    '/admin/audit',
    '/admin/health',
  ],
  FACILITY_OWNER: ['/owner', '/owner/facilities', '/owner/bookings', '/owner/payments', '/owner/staff'],
  FACILITY_STAFF: ['/staff', '/staff/bookings', '/staff/attendance', '/staff/payments'],
  PLAYER: ['/app', '/app/bookings', '/app/reports', '/app/notifications'],
};
for (const role of Object.keys(paths))
  test(`local demo ${enabled ? 'ON' : 'OFF'}: ${role} login, workspace and API gates`, async ({ page }) => {
    test.setTimeout(90000);
    const health = await (await page.request.get('/api/health')).json();
    expect(health.demoMode).toBe(enabled);
    expect(health.demoInstance).toBe(JSON.parse(readFileSync('.local/demo-database.json', 'utf8')).name);
    const password = JSON.parse(readFileSync('.local/demo-passwords.json', 'utf8'))[role];
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(`${role.toLowerCase()}@demo.example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    if (enabled) await expect(page).toHaveURL(new RegExp(`${paths[role]![0]}$`));
    else await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.user.role).toBe(role);
    expect(me.user.verificationBypassed).toBe(enabled);
    expect(me.user.mfaVerified).toBe(false);
    if (enabled) {
      await expect(page.getByText('DEMO MODE — Verification bypassed', { exact: false })).toBeVisible();
      for (const path of paths[role]!) {
        await page.goto(path);
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Protect your workspace.', exact: true })).toHaveCount(
          0,
        );
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
    } else await expect(page.getByText('DEMO MODE — Verification bypassed', { exact: false })).toHaveCount(0);
    expect((await page.request.get('/api/admin/overview')).status()).toBe(
      enabled && role === 'ADMIN' ? 200 : 403,
    );
    if (role === 'PLAYER')
      for (const path of ['/admin', '/owner', '/staff']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { name: /access required/i })).toBeVisible();
      }
    if (enabled && role === 'FACILITY_OWNER') {
      const owned = (await (await page.request.get('/api/workspaces/owner/facilities')).json()).items.map(
        (f: { id: string }) => f.id,
      );
      const other = (await (await page.request.get('/api/facilities')).json()).items.find(
        (f: { id: string }) => !owned.includes(f.id),
      );
      expect(other).toBeTruthy();
      expect((await page.request.get(`/api/workspaces/owner/courts?facilityId=${other.id}`)).status()).toBe(
        403,
      );
    }
    if (enabled && role === 'ADMIN')
      await page.screenshot({ path: '.local/demo-mode-admin.png', fullPage: true });
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
    expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
  });
