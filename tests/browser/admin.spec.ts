import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { generate } = requireApi('otplib') as { generate: (args: { secret: string }) => Promise<string> };
test.skip(
  process.env.ADMIN_E2E !== '1',
  'Use pnpm test:admin:e2e for isolated admin test identities and database.',
);
const fixtures = () =>
  JSON.parse(readFileSync('.local/admin-browser-fixtures.json', 'utf8')) as Record<
    string,
    { email: string; password: string; id: string }
  >;
async function login(page: Page, role: string, next = '/admin') {
  const f = fixtures()[role]!;
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(f.email);
  await page.getByLabel('Password', { exact: true }).fill(f.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}
for (const role of ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF'])
  test(`${role} is denied admin pages and direct API access`, async ({ page }) => {
    await login(page, role);
    await expect(
      page.getByRole('heading', { name: 'Administrator access required', exact: true }),
    ).toBeVisible();
    for (const path of ['overview', 'users', 'reports'])
      expect((await page.request.get(`/api/admin/${path}`)).status()).toBe(403);
    await page.goto('/admin/alerts');
    await expect(
      page.getByRole('heading', { name: 'Administrator access required', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Security alerts', exact: true })).toHaveCount(0);
    const mainNav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(mainNav.getByRole('link', { name: 'Owner workspace', exact: true })).toHaveCount(
      role === 'FACILITY_OWNER' ? 1 : 0,
    );
    expect((await page.request.get('/api/management')).status()).toBe(403);
    if (role === 'PLAYER') {
      for (const workspace of ['owner', 'staff']) {
        await page.goto(`/${workspace}`);
        await expect(
          page.getByRole('heading', {
            name: workspace === 'owner' ? 'Facility owner access required' : 'Staff access required',
            exact: true,
          }),
        ).toBeVisible();
        expect((await page.request.get(`/api/workspaces/${workspace}/overview`)).status()).toBe(403);
      }
    }
    await page.goto('/manage');
    await expect(
      page.getByRole('heading', {
        name: role === 'FACILITY_OWNER' ? 'Protect your workspace.' : 'Admin or court host access required',
        exact: true,
      }),
    ).toBeVisible();
  });

test('court host management uses real court records and working schedule/courts/activity navigation', async ({
  page,
}) => {
  test.setTimeout(90000);
  await login(page, 'FACILITY_OWNER', '/manage');
  await expect(page.getByRole('heading', { name: 'Protect your workspace.' })).toBeVisible();
  await page.getByLabel('Confirm your password').fill(fixtures().FACILITY_OWNER!.password);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const secret = await page.locator('code').innerText();
  await page.getByLabel('Authenticator or recovery code').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Verify MFA', exact: true }).click();
  await expect(page.getByText('Save these recovery codes privately now.')).toBeVisible();
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your hosting workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Host tennis court' })).toBeVisible();
  expect((await page.request.get('/api/admin/users')).status()).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.screenshot({ path: 'test-results/host-management-mobile.png', fullPage: true });
  for (const [link, heading] of [
    ['Schedule', 'Schedule & closures'],
    ['Courts', 'Your facilities'],
    ['Activity', 'Facility activity'],
  ]) {
    await page
      .getByRole('navigation', { name: 'Management shortcuts' })
      .getByRole('link', { name: link!, exact: true })
      .click();
    await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible();
    if (link === 'Schedule') {
      const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      await page.getByLabel('Calendar date', { exact: true }).fill(date);
      await expect(page.getByRole('heading', { name: 'Available time slots' })).toBeVisible();
      await page.getByRole('button', { name: '8:00 AM–9:00 AM AVAILABLE', exact: true }).click();
      await expect(page.getByLabel('Closure start')).toHaveValue(`${date}T08:00`);
      await page.getByLabel('Reason', { exact: true }).fill('Calendar browser maintenance');
      await page.getByRole('button', { name: 'Create closure', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Closure created');
      await expect(page.getByRole('button', { name: '8:00 AM–9:00 AM CLOSED', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Reopen', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '8:00 AM–9:00 AM AVAILABLE', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Week', exact: true }).click();
      await expect(page.locator('.calendar-days button')).toHaveCount(7);
      await page.getByRole('button', { name: 'Day', exact: true }).click();
      await expect(page.locator('.calendar-days button')).toHaveCount(1);
      await page.getByRole('button', { name: 'Month', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const calendarAxe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(calendarAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
        [],
      );
      await page.screenshot({ path: 'test-results/court-calendar-mobile.png', fullPage: true });
    }
    await page.goto('/manage');
  }
  await page.goto('/owner');
  await page.getByLabel('Switch workspace').selectOption('/app');
  await expect(page.getByRole('heading', { name: 'Recommended for you', exact: true })).toBeVisible();
  await page.getByLabel('Switch workspace').selectOption('/owner');
  await expect(page.getByRole('heading', { name: 'The day’s game plan.', exact: true })).toBeVisible();
  await page.goto('/owner/facilities');
  await page.getByRole('link', { name: 'Edit facility details' }).click();
  await page
    .getByLabel('Description', { exact: true })
    .fill('Updated fictional browser facility description.');
  await page.getByLabel('Amenities (comma separated)', { exact: true }).fill('Parking, changing rooms');
  await page.getByLabel('Reason', { exact: true }).fill('Reviewed facility information with the host.');
  await page.getByLabel('I confirm this change.').check();
  await page.getByRole('button', { name: 'Save facility details' }).click();
  await expect(page.getByRole('status')).toContainText('Facility details updated');
  await page.goto('/owner/staff');
  await page.getByLabel('Staff account email').fill(fixtures().FACILITY_STAFF!.email);
  await page.getByLabel('BOOKINGS', { exact: true }).check();
  await page.getByLabel('PAYMENTS', { exact: true }).check();
  await page.getByLabel('ATTENDANCE', { exact: true }).check();
  await page.getByLabel('Reason', { exact: true }).fill('Reviewed staff duties and authorized permissions.');
  await page.getByLabel('I confirm this change.').check();
  await page.getByRole('button', { name: 'Update staff access' }).click();
  await expect(page.getByRole('status')).toContainText('existing sessions revoked');
  await page.getByLabel('Remove this facility’s staff access').check();
  await page.getByRole('button', { name: 'Update staff access' }).click();
  await expect(page.getByText('No records found.', { exact: true })).toBeVisible();
  await page.getByLabel('Remove this facility’s staff access').uncheck();
  await page.getByRole('button', { name: 'Update staff access' }).click();
  await expect(page.getByRole('heading', { name: 'Browser FACILITY_STAFF', exact: true })).toBeVisible();
});
test('admin MFA, applications, report decisions, restrictions, alerts, audit and health work in the browser', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=/);
  await login(page, 'ADMIN');
  await expect(page.getByRole('heading', { name: 'Protect your workspace.' })).toBeVisible();
  expect((await page.request.get('/api/admin/overview')).status()).toBe(403);
  await page.getByLabel('Confirm your password').fill(fixtures().ADMIN!.password);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const secret = await page.locator('code').innerText();
  await page.getByLabel('Authenticator or recovery code').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Verify MFA', exact: true }).click();
  await expect(page.getByText('Save these recovery codes privately now.')).toBeVisible();
  await page.getByRole('link', { name: 'Open workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Administration overview', exact: true })).toBeVisible();
  await page.goto('/admin/bookings');
  await page.getByLabel('Search booking reference').fill('ROLE-PAID');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('link', { name: 'Review booking history' }).click();
  await expect(page.getByRole('heading', { name: 'Booking history', exact: true })).toBeVisible();
  await expect(page.getByText('ROLE-RECEIPT', { exact: false })).toBeVisible();
  await page.goto('/admin/payments');
  await expect(page.getByText('Verified by Browser FACILITY_OWNER', { exact: false })).toBeVisible();
  await page.goto('/admin/facilities');
  const acceptConfirmation = async (d: import('@playwright/test').Dialog) => {
    await d.accept(d.type() === 'prompt' ? 'Reviewing a fictional facility listing concern.' : undefined);
  };
  page.on('dialog', acceptConfirmation);
  await page.getByRole('button', { name: 'Unpublish facility' }).click();
  await expect(page.getByRole('status')).toContainText('unpublished');
  await page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Host browser fixture', exact: true }) })
    .getByRole('button', { name: 'Publish approved facility' })
    .click();
  await expect(page.getByRole('status')).toContainText('published');
  page.off('dialog', acceptConfirmation);
  await page.goto('/manage');
  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible();
  expect((await page.request.get('/api/management')).status()).toBe(200);
  await page.getByRole('link', { name: 'Open full administration', exact: true }).click();
  const applicantContext = await browser.newContext(),
    applicant = await applicantContext.newPage();
  await login(applicant, 'PLAYER', '/app/applications');
  await expect(
    applicant.getByRole('heading', { name: 'Admin browser test sports hall', exact: true }),
  ).toBeVisible();
  await page.goto('/admin/applications');
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: 'Admin browser test sports hall', exact: true }) })
    .click();
  const applicationUrl = page.url();
  await page.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('CLARIFY');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Please clarify authority to manage this fictional facility.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'CLARIFICATION' })).toBeVisible();
  await applicant.reload();
  await applicant
    .getByLabel('Clarification response')
    .fill('This isolated fixture is managed by the authorized test applicant.');
  await applicant.getByRole('button', { name: 'Send clarification' }).click();
  await expect(applicant.getByRole('status')).toContainText('another review');
  await page.reload();
  await page.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('APPROVE');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Reviewed the submitted facility and applicant clarification.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'APPROVED' })).toBeVisible();
  await login(applicant, 'PLAYER', '/app/applications');
  await applicant.getByRole('link', { name: 'View approved facility' }).click();
  await expect(
    applicant.getByRole('heading', { name: 'Admin browser test sports hall', exact: true }),
  ).toBeVisible();
  await applicant.goto('/app/reports');
  await applicant
    .getByLabel('What happened?', { exact: true })
    .fill('A local security concern for human review. Literal <script>alert(1)</script> must remain text.');
  await applicant.getByRole('button', { name: 'Submit report', exact: true }).click();
  await expect(applicant.getByRole('status')).toContainText('fair human review');
  await page.goto('/admin/reports');
  await page.locator('.admin-record').first().click();
  await expect(page.getByText('Literal <script>', { exact: false })).toBeVisible();
  await page.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('RESOLVED');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Reviewed the local fixture; output is safely displayed as text.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'RESOLVED' })).toBeVisible();
  await applicant.reload();
  await expect(applicant.getByText('Review response:', { exact: false })).toContainText(
    'safely displayed as text',
  );
  await page.goto('/admin/users');
  await page.getByLabel('Search nickname or email', { exact: true }).fill(fixtures().PLAYER!.email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('.admin-record').first().click();
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Restrict isolated test account while reviewing its access.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'RESTRICTED' })).toBeVisible();
  expect((await applicant.request.get('/api/reports')).status()).toBe(401);
  await page.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('false');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('The access review is complete; restore this test account.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'ACTIVE' })).toBeVisible();
  await login(applicant, 'PLAYER', '/app/reports');
  await expect(applicant.getByRole('heading', { name: 'My reports', exact: true })).toBeVisible();
  // The real 30-second maintenance worker derives alerts from the denied requests above.
  await expect
    .poll(
      async () => {
        const r = await page.request.get('/api/admin/alerts');
        return (await r.json()).total;
      },
      { timeout: 40000 },
    )
    .toBeGreaterThan(0);
  await page.goto('/admin/alerts');
  await page.locator('.admin-record').first().click();
  await expect(page.getByRole('heading', { name: 'Supporting events', exact: true })).toBeVisible();
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Acknowledged; comparing denied requests with local test activity.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'ACKNOWLEDGED' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('RESOLVED');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Events came from authorized local tests; no wrongdoing established.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'RESOLVED' })).toBeVisible();
  await page.goto('/admin/audit');
  await page.getByLabel('Search audit', { exact: true }).fill('ACCOUNT_RESTRICTED');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('ACCOUNT_RESTRICTED');
  await page
    .getByRole('link', { name: /View event/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Audit event', exact: true })).toBeVisible();
  await page.goto('/admin/health');
  await expect(page.getByText('Query succeeded', { exact: false })).toBeVisible();
  await expect(page.getByText('Not actively probed', { exact: false })).toBeVisible();
  await page.goto('/admin');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  await page.goto('/security');
  await expect(page.getByRole('heading', { name: 'Security & acceptable use', exact: true })).toBeVisible();
  // Reject a second submitted application through the same working review UI.
  await applicant.goto('/app/applications');
  const secondApplications = await (await applicant.request.get('/api/facility-applications')).json();
  const secondId = secondApplications.items.find(
    (a: { id: string; facility: { name: string } }) => a.facility.name === 'Second admin browser test hall',
  ).id;
  await page.goto(applicationUrl.replace(/[^/]+$/, secondId));
  await page.getByRole('combobox', { name: 'Decision', exact: true }).selectOption('REJECT');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('This duplicate fictional application is not approved for listing.');
  await page.getByLabel('I confirm this action', { exact: false }).check();
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.locator('.badge').filter({ hasText: 'REJECTED' })).toBeVisible();
  await applicantContext.close();
});

test('staff workspace supports permitted payment recording and attendance, and denies owner pages', async ({
  page,
}) => {
  await login(page, 'FACILITY_STAFF', '/staff');
  await page.getByLabel('Confirm your password').fill(fixtures().FACILITY_STAFF!.password);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const secret = await page.locator('code').innerText();
  await page.getByLabel('Authenticator or recovery code').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Verify MFA', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your daily operations', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Workspace navigation' });
  await expect(nav.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'My facilities', exact: true })).toHaveCount(0);
  await page.goto('/owner');
  await expect(
    page.getByRole('heading', { name: 'Facility owner access required', exact: true }),
  ).toBeVisible();
  expect((await page.request.get('/api/workspaces/owner/staff')).status()).toBe(403);
  await page.goto('/staff/payments');
  await page.getByRole('link', { name: 'Record a verified external payment' }).click();
  const booking = page.locator('.panel').filter({ hasText: 'ROLE-UNPAID' });
  await booking.getByLabel('Receipt / record reference').fill('STAFF-BROWSER-RECEIPT');
  await booking.getByRole('button', { name: 'Record verified full payment' }).click();
  await expect(booking.getByText('Full external payment recorded.')).toBeVisible();
  await page.goto('/staff/payments');
  await expect(page.getByRole('heading', { name: 'STAFF-BROWSER-RECEIPT', exact: true })).toBeVisible();
  await page.goto('/staff/check-in');
  await page.getByLabel('Booking reference', { exact: true }).fill('ROLE-CHECKIN');
  await page.getByRole('button', { name: 'Check in by reference', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Checked in.');
  await page.goto('/staff/attendance');
  await expect(page.getByRole('heading', { name: 'ROLE-CHECKIN', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.screenshot({ path: 'test-results/staff-workspace-mobile.png', fullPage: true });
});
