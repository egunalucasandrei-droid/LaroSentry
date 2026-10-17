import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';

test.skip(process.env.RENDER_PILOT_E2E !== '1', 'Explicit opt-in for the separate fictional Render pilot.');
test.setTimeout(90000);
const passwords = () =>
  JSON.parse(readFileSync('.local/render-pilot-passwords.json', 'utf8')) as Record<string, string>;
async function login(page: Page, role: string, next = '/app') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(`${role.toLowerCase()}@pilot.example.test`);
  await page.getByLabel('Password', { exact: true }).fill(passwords()[role]!);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}
async function mutation(page: Page, path: string, body = {}, extra: Record<string, string> = {}) {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'ls_csrf')!.value;
  return page.request.post(`/api${path}`, {
    data: body,
    headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': decodeURIComponent(csrf), ...extra },
  });
}

test('live HTTPS serves mobile pages, real database records, protected APIs and security headers', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto('/');
  expect(response!.status()).toBe(200);
  expect(response!.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(response!.headers()['x-content-type-options']).toBe('nosniff');
  expect(response!.headers()['x-robots-tag']).toBe('noindex, nofollow');
  await expect(page.locator('.pilot-strip')).toContainText('Test pilot only');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await (await page.request.get('/api/health')).json()).database).toBe('connected');
  const facilities = await (await page.request.get('/api/facilities')).json();
  expect(facilities.total).toBeGreaterThanOrEqual(3);
  await page.goto('/facilities/pilot-courts-1');
  await expect(page.getByRole('heading', { name: 'Fictional Test Courts 1', exact: true })).toBeVisible();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
  for (const path of ['/.env', '/.local/render-demo-accounts.md', '/assets/missing.js'])
    expect((await page.request.get(path)).status()).toBe(404);
  const missing = await page.request.get('/api/no-such-endpoint');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.local/render-live-mobile.png', fullPage: true });
});

for (const role of ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN']) {
  test(`live ${role} login preserves secure sessions, permission checks and MFA`, async ({ page }) => {
    const next =
      role === 'PLAYER'
        ? '/app'
        : role === 'ADMIN'
          ? '/admin'
          : role === 'FACILITY_OWNER'
            ? '/owner'
            : '/staff';
    await login(page, role, next);
    if (role === 'PLAYER')
      await expect(page.getByRole('heading', { name: 'Recommended for you', exact: true })).toBeVisible();
    else
      await expect(page.getByRole('heading', { name: 'Protect your workspace.', exact: true })).toBeVisible();
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.user.role).toBe(role);
    expect(me.user.demoAccessAllowed).toBe(false);
    expect(me.user.mfaVerified).toBe(false);
    const session = (await page.context().cookies()).find((cookie) => cookie.name === 'ls_session')!;
    expect(session.secure).toBe(true);
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe('Lax');
    expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.get('/api/admin/files/not-permitted')).status()).toBe(403);
    await expect(page.getByRole('button', { name: 'Open demo workspace', exact: true })).toHaveCount(0);
    await page.reload();
    expect((await (await page.request.get('/api/auth/me')).json()).user.role).toBe(role);
    expect((await mutation(page, '/auth/logout')).status()).toBe(201);
    expect((await page.request.get('/api/admin/overview')).status()).toBe(401);
  });
}

test('live player can quote, request, view and cancel a fictional booking', async ({ page }) => {
  await login(page, 'PLAYER');
  await expect(page.getByRole('heading', { name: 'Recommended for you', exact: true })).toBeVisible();
  const facility = await (await page.request.get('/api/facilities/pilot-courts-1')).json();
  const date = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const input = {
    courtId: facility.courts[0].id,
    startsAt: `${date}T07:00:00+08:00`,
    endsAt: `${date}T08:00:00+08:00`,
    mode: 'BOOKING_ONLY',
    expectedGuests: 2,
  };
  const quote = await mutation(page, '/bookings/quote', input);
  expect(quote.status()).toBe(201);
  const reviewed = await quote.json();
  const created = await mutation(
    page,
    '/bookings',
    { ...input, quoteFingerprint: reviewed.quoteFingerprint },
    { 'Idempotency-Key': randomUUID() },
  );
  expect(created.status()).toBe(201);
  const booking = await created.json();
  try {
    expect(booking.status).toBe('PENDING');
    await page.goto('/app/bookings');
    await expect(page.getByText(booking.reference, { exact: true })).toBeVisible();
    expect((await mutation(page, `/bookings/${booking.id}/cancel`)).status()).toBe(201);
    const detail = await (await page.request.get(`/api/bookings/${booking.id}`)).json();
    expect(detail.status).toBe('CANCELLED');
  } finally {
    await mutation(page, `/bookings/${booking.id}/cancel`);
  }
});

test('live signup honestly reports unavailable delivery and cannot bypass verification', async ({ page }) => {
  const email = `render-smoke-${randomUUID()}@example.test`,
    password = `Test-${randomUUID()}-aA7`;
  await page.goto('/register');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Nickname', { exact: true }).fill('Fictional delivery test');
  await page
    .getByLabel('Philippine mobile number', { exact: true })
    .fill(`+639${randomInt(100000000, 1000000000)}`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByLabel('I declare that I am at least 18 years old.').check();
  await page.getByLabel('I accept the terms of use.').check();
  await page.getByLabel('I accept the privacy notice.').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('unavailable');
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify contact information', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend verification email', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Send verification code', exact: true })).toBeDisabled();
  expect((await page.request.get('/api/bookings')).status()).toBe(403);
  expect((await page.request.get('/api/onboarding/dev-sms')).status()).toBe(403);
  expect((await mutation(page, '/onboarding/email/resend')).status()).toBe(503);
});
