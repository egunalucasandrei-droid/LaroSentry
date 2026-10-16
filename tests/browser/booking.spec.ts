import { test, expect } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { generate } = requireApi('otplib') as { generate: (args: { secret: string }) => Promise<string> };
test('booking, facility operations, public participation and private invitations', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const email = `browser-${randomUUID()}@example.test`,
    password = `Demo-${randomUUID()}-aA7`;
  await page.goto('/register');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Nickname', { exact: true }).fill('Browser demo player');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page
    .getByLabel('Philippine mobile number', { exact: true })
    .fill('+639' + randomInt(100000000, 1000000000));
  await page.getByLabel('I declare that I am at least 18 years old.').check();
  await page.getByLabel('I accept the terms of use.').check();
  await page.getByLabel('I accept the privacy notice.').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('verification email');
  let messageId = '';
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const data = await response.json();
        messageId = data.messages?.[0]?.ID ?? '';
        return !!messageId;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const mail = await (await request.get(`http://127.0.0.1:8025/api/v1/message/${messageId}`)).json();
  const url = (mail.Text as string).match(/http:\/\/127\.0\.0\.1:\d+\/verify-email#token=[\w-]+/)![0];
  await page.goto(url);
  await page.getByRole('button', { name: 'Verify my email' }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/onboarding/sms/send') && r.status() === 201),
    page.getByRole('button', { name: 'Send verification code', exact: true }).click(),
  ]);
  const localCode = await (await page.request.get('/api/onboarding/dev-sms')).json();
  await page.getByLabel('SMS verification code', { exact: true }).fill(localCode.code);
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await page.getByRole('button', { name: 'Player — I want to find courts and play.', exact: true }).click();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await page.goto('/app/bookings');
  await expect(page.getByRole('heading', { name: 'My bookings', exact: true })).toBeVisible();
  const demoMode = process.env.DEMO_E2E === '1';
  const ownerEmail = demoMode
    ? `browser-owner-${randomUUID()}@example.test`
    : 'browser-owner@larosentry.test';
  const demoName = demoMode ? JSON.parse(readFileSync('.local/demo-database.json', 'utf8')).name : 'regular';
  const mfaPath = demoMode ? `.local/browser-mfa-${ownerEmail}` : '.local/browser-mfa-secret';
  if (demoMode) {
    expect(demoName).toMatch(/^larosentry_demo_\d{13}$/);
    expect((await (await request.get('/api/health')).json()).demoInstance).toBe(demoName);
    const database = new URL(
      readFileSync('.env', 'utf8')
        .match(/^DATABASE_URL=(.+)$/m)![1]!
        .trim(),
    );
    database.pathname = `/${demoName}`;
    const bootstrap = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(requireApi.resolve('tsx')).href,
        'src/bootstrap.ts',
        'FACILITY_OWNER',
        ownerEmail,
      ],
      {
        cwd: 'apps/api',
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: database.href },
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    expect(
      bootstrap.status,
      'Create an isolated browser-owned fixture without changing the shared demo owner',
    ).toBe(0);
  }
  const ownerFile = readdirSync('.local')
    .filter((n) => n.startsWith('demo-') && n.endsWith('.txt'))
    .map((n) => readFileSync(`.local/${n}`, 'utf8'))
    .find((t) => t.includes(`Email: ${ownerEmail}`));
  if (!ownerFile)
    throw new Error(
      'Run demo:setup and demo:start, then set DEMO_E2E=1 and BROWSER_BASE_URL=http://127.0.0.1:5176.',
    );
  const ownerPassword = ownerFile.match(/Password: (.+)/)![1]!;
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto('/login?next=/owner');
  await ownerPage.getByLabel('Email address', { exact: true }).fill(ownerEmail);
  await ownerPage.getByLabel('Password', { exact: true }).fill(ownerPassword);
  await ownerPage.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(ownerPage.getByRole('heading', { name: 'Protect your workspace.' })).toBeVisible();
  // Test-owned MFA secret is kept only in ignored local fixture storage for repeatable runs.
  const { existsSync, writeFileSync } = await import('node:fs');
  let secret: string;
  if (await ownerPage.getByRole('button', { name: 'Set up authenticator' }).isVisible()) {
    await ownerPage.getByLabel('Confirm your password').fill(ownerPassword);
    await ownerPage.getByRole('button', { name: 'Set up authenticator' }).click();
    secret = await ownerPage.locator('code').innerText();
    writeFileSync(mfaPath, secret, { mode: 0o600 });
  } else {
    if (!existsSync(mfaPath))
      throw new Error(
        'Browser MFA fixture secret is missing. Create a new test owner instead of resetting this account.',
      );
    secret = readFileSync(mfaPath, 'utf8');
  }
  await ownerPage.getByLabel('Authenticator or recovery code').fill(await generate({ secret }));
  await ownerPage.getByRole('button', { name: 'Verify MFA', exact: true }).click();
  await expect(ownerPage.getByRole('heading', { name: 'The day’s game plan.' })).toBeVisible();
  await ownerPage.getByRole('link', { name: 'My facilities', exact: true }).click();
  const facilityLink = ownerPage.getByRole('link', { name: 'View published details' }).first();
  const href = await facilityLink.getAttribute('href');
  await page.goto(href!);
  const facility = await (await request.get(`/api${href}`)).json();
  const testCourt = facility.courts[0].id;
  // Shared demo history is intentionally preserved. Find a free scenario instead
  // of randomly colliding with bookings left by earlier demonstrations.
  let date = '';
  for (let offset = 15; offset < 85 && !date; offset++) {
    const candidate = new Date(Date.now() + offset * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    const following = new Date(Date.now() + (offset + 1) * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    const [first, second] = await Promise.all(
      [candidate, following].map(async (day) =>
        (await request.get(`/api/courts/${testCourt}/availability?date=${day}&duration=60`)).json(),
      ),
    );
    const free = (data: { slots: { startsAt: string; status: string }[] }, day: string, hour: string) =>
      data.slots.some(
        (s) => s.startsAt === new Date(`${day}T${hour}:00+08:00`).toISOString() && s.status === 'AVAILABLE',
      );
    if (
      free(first, candidate, '09:00') &&
      free(second, following, '10:00') &&
      free(second, following, '13:00')
    )
      date = candidate;
  }
  expect(date, 'A free booking, reschedule and closure scenario must exist').not.toBe('');
  await page.getByLabel('Game day', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Review request' }).click();
  await expect(page.getByText('Total for your court time')).toBeVisible();
  await page.getByRole('button', { name: 'Submit booking request' }).click();
  await expect(page.getByRole('heading', { name: 'Your court time.' })).toBeVisible();
  const reference = (await page.locator('.section-title .muted').innerText()).trim();
  await expect(page.getByText('Request received.', { exact: false })).toBeVisible();
  await ownerPage.goto('/owner/bookings');
  const booking = ownerPage.locator('.panel').filter({ hasText: reference });
  await booking.getByRole('button', { name: 'Confirm request' }).click();
  await expect(ownerPage.getByRole('status')).toContainText('Booking confirmed');
  await booking.getByLabel('Receipt / record reference').fill(`BROWSER-${randomUUID()}`);
  await booking.getByRole('button', { name: 'Record verified full payment' }).click();
  await expect(booking.getByText('Full external payment recorded.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('PAID · recorded by facility staff')).toBeVisible();
  await page.getByRole('button', { name: 'Issue check-in QR' }).click();
  await expect(page.getByRole('img', { name: 'Private booking check-in QR code' })).toBeVisible();
  const newDate = new Date(new Date(`${date}T00:00:00+08:00`).getTime() + 86400000 + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel('New date', { exact: true }).fill(newDate);
  await page.getByLabel('New start time (PHT)').fill('10:00');
  await page.getByLabel('Reason for change').fill('Browser workflow schedule change');
  await page.getByRole('button', { name: 'Request schedule change', exact: true }).click();
  await expect(page.getByText('Pending change:', { exact: false })).toBeVisible();
  await ownerPage.reload();
  await booking.getByRole('button', { name: 'Approve schedule change', exact: true }).click();
  await expect(ownerPage.getByRole('status')).toContainText('Schedule changed');
  await page.reload();
  await expect(page.getByText('Schedule change approved:', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Private booking check-in QR code' })).toHaveCount(0);
  await ownerPage.goto('/owner/calendar');
  const closureStart = `${newDate}T13:00`,
    closureEnd = `${newDate}T14:00`;
  await ownerPage.getByLabel('Closure start').fill(closureStart);
  await ownerPage.getByLabel('Closure end').fill(closureEnd);
  await ownerPage.getByLabel('Reason', { exact: true }).fill(`Browser closure ${reference}`);
  await ownerPage.getByRole('button', { name: 'Create closure', exact: true }).click();
  await expect(ownerPage.getByRole('status').filter({ hasText: 'Closure created' })).toBeVisible();
  await ownerPage
    .locator('.court-row')
    .filter({ hasText: `Browser closure ${reference}` })
    .getByRole('button', { name: 'Reopen', exact: true })
    .click();
  await expect(ownerPage.getByRole('status')).toContainText('Closure removed');
  const gameId = page.url().split('/').pop()!;
  await page.getByLabel('Game visibility', { exact: true }).selectOption('PUBLIC');
  await page.getByLabel('Game rules', { exact: true }).fill('Bring court shoes and water.');
  await page.getByLabel('Publish this game', { exact: false }).check();
  await page.getByRole('button', { name: 'Save game settings' }).click();
  await expect(page.getByRole('status')).toContainText('Game published');
  await ownerPage.goto(`/app/games/${gameId}`);
  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await expect(ownerPage.getByRole('button', { name: 'Request to join', exact: true })).toBeVisible();
  expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const accessibility = await new AxeBuilder({ page: ownerPage }).analyze();
  expect(accessibility.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual(
    [],
  );
  await ownerPage.screenshot({ path: 'test-results/public-game-mobile.png', fullPage: true });
  await ownerPage.getByRole('button', { name: 'Request to join', exact: true }).click();
  await expect(ownerPage.getByRole('status')).toContainText('Request sent');
  await page.reload();
  await page.getByRole('button', { name: /^Approve / }).click();
  await expect(page.getByRole('status')).toContainText('Player approved');
  await ownerPage.reload();
  await expect(ownerPage.getByText('Your participation: APPROVED', { exact: false })).toBeVisible();
  await ownerPage.getByRole('button', { name: 'Leave game', exact: true }).click();
  await expect(ownerPage).toHaveURL(/\/app\/games$/);
  await page.reload();
  await page.getByLabel('Game visibility', { exact: true }).selectOption('PRIVATE');
  await page.getByRole('button', { name: 'Save game settings' }).click();
  await expect(page.getByRole('heading', { name: 'Invite someone you know' })).toBeVisible();
  await page.getByLabel('Player email', { exact: true }).fill(ownerEmail);
  await page.getByRole('button', { name: 'Send private invitation' }).click();
  await expect(page.getByRole('status')).toContainText('eligible player');
  await ownerPage.goto('/app/invitations');
  await ownerPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(ownerPage.getByRole('status')).toContainText('Invitation accepted');
  await ownerPage.goto(`/app/games/${gameId}`);
  await expect(ownerPage.getByText('Your participation: APPROVED', { exact: false })).toBeVisible();
  await page.reload();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cancel booking', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Booking cancelled');
  await expect(page.getByRole('img', { name: 'Private booking check-in QR code' })).toHaveCount(0);
  await ownerPage.reload();
  await expect(ownerPage.locator('.badge').filter({ hasText: 'CANCELLED' })).toBeVisible();
  await ownerContext.close();
});
