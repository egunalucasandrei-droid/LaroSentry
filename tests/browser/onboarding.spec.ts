import { test, expect, type Page } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
import { POLICY_VERSION } from '../../packages/contracts/src/index';
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { generate } = requireApi('otplib') as { generate: (v: { secret: string }) => Promise<string> };
const sharp = requireApi('sharp');
test.skip(process.env.ONBOARDING_E2E !== '1', 'Use test:onboarding:e2e with isolated fixtures.');
const fixtures = () =>
  JSON.parse(readFileSync('.local/admin-browser-fixtures.json', 'utf8')) as Record<
    string,
    { email: string; password: string }
  >;
const newPlayer = {
  email: `onboarding-browser-${randomUUID()}@example.test`,
  password: `Signup-${randomUUID()}-aA7`,
  phone: '+639' + randomInt(100000000, 1000000000),
};
async function login(page: Page, email: string, password: string, next = '/onboarding') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}
async function mailLink(page: Page, email: string, path = 'verify-email') {
  let link = '';
  await expect
    .poll(
      async () => {
        const search = await (
          await page.request.get(
            `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent('to:' + email)}`,
          )
        ).json();
        for (const item of search.messages ?? []) {
          const mail = await (
            await page.request.get(`http://127.0.0.1:8025/api/v1/message/${item.ID}`)
          ).json();
          const match = String(mail.Text).match(
            new RegExp(`http://127\\.0\\.0\\.1:5175/${path}#token=[\\w-]+`),
          );
          if (match) {
            link = match[0];
            return true;
          }
        }
        return false;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  return link;
}
async function mfa(page: Page, password: string) {
  await page.getByLabel('Confirm your password').fill(password);
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  const secret = await page.locator('code').innerText();
  await page.getByLabel('Authenticator or recovery code').fill(await generate({ secret }));
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/auth/mfa/verify') && r.status() === 201),
    page.getByRole('button', { name: 'Verify MFA', exact: true }).click(),
  ]);
  if (new URL(page.url()).pathname === '/mfa')
    await page.getByRole('link', { name: 'Open workspace', exact: true }).click();
}
test('signup, SMS first, email verification, optional preferences and recommendations work on mobile', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.getByLabel('Email address', { exact: true }).fill(newPlayer.email);
  await page.getByLabel('Nickname', { exact: true }).fill('Onboarding browser player');
  await page.getByLabel('Philippine mobile number', { exact: true }).fill(newPlayer.phone);
  await page.getByLabel('Password', { exact: true }).fill(newPlayer.password);
  await page.getByLabel('Confirm password', { exact: true }).fill(newPlayer.password);
  await page.getByLabel('I declare that I am at least 18 years old.').check();
  await page.getByLabel('I accept the terms of use.').check();
  await page.getByLabel('I accept the privacy notice.').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('queued');
  await login(page, newPlayer.email, newPlayer.password);
  await expect(page.getByRole('heading', { name: 'Verify contact information', exact: true })).toBeVisible();
  expect((await page.request.get('/api/bookings')).status()).toBe(403);
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  await page.getByRole('button', { name: 'Open local test inbox', exact: true }).click();
  const code = (await page.getByText('Local test code:', { exact: false }).innerText()).match(/\d{6}/)![0];
  await page.getByLabel('SMS verification code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await expect(page.getByText('PARTIALLY VERIFIED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Player — I want to find courts and play.', exact: true }).click();
  await page.getByLabel('Tennis', { exact: true }).check();
  await page.getByLabel('Preferred cities or areas (comma separated)').fill('Test area');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page).toHaveURL(/\/facilities$/);
  await page.goto(await mailLink(page, newPlayer.email));
  await page.getByRole('button', { name: 'Verify my email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  await page.getByRole('link', { name: 'Continue account verification', exact: true }).click();
  await page.getByRole('link', { name: 'Enter player workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recommended for you', exact: true })).toBeVisible();
  await expect(page.getByText('Recommended because of', { exact: false }).first()).toContainText('Tennis');
  await page.goto('/app/settings/preferences');
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.facility-card').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.screenshot({ path: 'test-results/onboarding-player-mobile.png', fullPage: true });
});
test('facility wizard, private reviewer images, clarification and approval lead to scoped owner access', async ({
  page,
  browser,
}) => {
  test.setTimeout(150000);
  const player = fixtures().PLAYER!,
    admin = fixtures().ADMIN!;
  const recipient = {
    email: `invitee-${randomUUID()}@example.test`,
    password: `Invitee-${randomUUID()}-aA7`,
    phone: '+639' + randomInt(100000000, 1000000000),
  };
  await login(page, player.email, player.password, '/onboarding/facility');
  await page.getByRole('button', { name: 'Start facility draft', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/facility\/[\w-]+$/);
  const draftUrl = page.url();
  await page.getByLabel('Facility name', { exact: true }).fill('Partial saved facility');
  await page.getByRole('button', { name: 'Save facility information', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Identity & supporting evidence', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '1. Facility information', exact: true }).click();
  await expect(page.getByLabel('Facility name', { exact: true })).toHaveValue('Partial saved facility');
  for (const [label, value] of [
    ['Facility name', 'Onboarding browser verified hall'],
    ['City or area', 'Quezon City'],
    ['Facility address', 'Fictional browser verification address'],
    ['Facility description', 'An entirely fictional sports facility for testing private evidence review.'],
    ['Facility contact mobile (+63)', '+639171234567'],
    ['Court name', 'Browser verification court'],
    ['Cancellation policy', 'Cancel before the reservation start for manual review.'],
  ])
    await page.getByLabel(label!, { exact: true }).fill(value!);
  await page.getByRole('combobox', { name: 'Relationship to facility', exact: true }).selectOption('MANAGER');
  await page.getByRole('button', { name: 'Save facility information', exact: true }).click();
  await page.getByRole('combobox', { name: 'Government ID type', exact: true }).selectOption('Passport');
  await page.getByRole('button', { name: 'Save ID type', exact: true }).click();
  const image = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#e5eee5' } })
    .png()
    .toBuffer();
  for (const kind of ['IDENTITY', 'SUPPORT', 'PHOTO']) {
    await page.getByRole('combobox', { name: 'Evidence category', exact: true }).selectOption(kind);
    await page
      .getByLabel('Evidence image', { exact: true })
      .setInputFiles({ name: 'synthetic-fixture.png', mimeType: 'image/png', buffer: image });
    await page.getByRole('button', { name: 'Upload private image', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('submitted for verification');
  }
  await page.getByRole('button', { name: 'Review application', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'I am authorized to represent this facility', exact: false })
    .check();
  await page.getByRole('button', { name: 'Submit facility for verification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submitted for admin review', exact: true })).toBeVisible();
  const draft = await (await page.request.get('/api/onboarding/drafts/' + draftUrl.split('/').pop())).json();
  const appId = draft.application.id,
    docId = draft.documents.find((d: { kind: string }) => d.kind === 'IDENTITY').id;
  expect((await page.request.get(`/api/admin/applications/${appId}/documents/${docId}`)).status()).toBe(403);
  const context = await browser.newContext(),
    review = await context.newPage();
  await login(review, admin.email, admin.password, '/admin');
  await mfa(review, admin.password);
  await review.goto('/admin/applications/' + appId);
  async function decision(action: string) {
    await review.getByRole('combobox', { name: 'Decision', exact: true }).selectOption(action);
    await review
      .getByLabel('Reason', { exact: true })
      .fill('Reviewed synthetic evidence for this authorized local browser test.');
    await review.getByLabel('I confirm this action', { exact: false }).check();
    await review.getByRole('button', { name: 'Record decision', exact: true }).click();
  }
  await decision('START_REVIEW');
  await expect(review.locator('.badge').filter({ hasText: 'UNDER_REVIEW' })).toBeVisible();
  await review.getByRole('button', { name: 'View private identity image', exact: true }).click();
  await expect(
    review.getByRole('img', { name: 'Private identity evidence for manual review', exact: true }),
  ).toBeVisible();
  await decision('CLARIFY');
  await expect(review.locator('.badge').filter({ hasText: 'CLARIFICATION' })).toBeVisible();
  await page.goto(draftUrl);
  await page
    .getByLabel('Facility description', { exact: true })
    .fill('Updated fictional facility description with the requested manager clarification.');
  await page.getByRole('button', { name: 'Save facility information', exact: true }).click();
  await page.getByRole('button', { name: '3. Review & submit', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'I am authorized to represent this facility', exact: false })
    .check();
  await page.getByRole('button', { name: 'Submit facility for verification', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submitted for admin review', exact: true })).toBeVisible();
  await review.reload();
  await decision('START_REVIEW');
  await expect(review.getByLabel('I reviewed the submitted identity evidence.')).toBeVisible();
  await review.getByLabel('I reviewed the submitted identity evidence.').check();
  await review.getByLabel('I reviewed facility existence and representation authority.').check();
  await decision('APPROVE');
  await expect(review.locator('.badge').filter({ hasText: 'APPROVED' })).toBeVisible();
  expect((await page.request.get('/api/workspaces')).status()).toBe(401);
  await login(page, player.email, player.password, '/owner');
  await mfa(page, player.password);
  await expect(page.getByRole('heading', { name: 'The day’s game plan.', exact: true })).toBeVisible();
  expect((await page.request.get('/api/admin/applications')).status()).toBe(403);
  await page.goto('/owner/staff');
  await page.getByLabel('Invitation email', { exact: true }).fill(recipient.email);
  await page.getByLabel('Invite ATTENDANCE', { exact: true }).check();
  await page
    .getByLabel('Invitation reason', { exact: true })
    .fill('Invite the synthetic verified player for attendance duties.');
  await page.getByLabel('I confirm this staff invitation.').check();
  await page.getByRole('button', { name: 'Queue staff invitation', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Invitation queued');
  const accepted = await browser.newPage();
  await accepted.request.post('/api/auth/register', {
    headers: { Origin: 'http://127.0.0.1:5175' },
    data: {
      ...recipient,
      confirmPassword: recipient.password,
      nickname: 'Invited browser staff',
      adult: true,
      acceptedTerms: true,
      acceptedPrivacy: true,
      policyVersion: POLICY_VERSION,
    },
  });
  await accepted.goto(await mailLink(accepted, recipient.email));
  await accepted.getByRole('button', { name: 'Verify my email', exact: true }).click();
  await expect(accepted.getByRole('status')).toContainText('Email verified');
  await login(accepted, recipient.email, recipient.password);
  await accepted.getByRole('button', { name: 'Send verification code', exact: true }).click();
  const sms = await (await accepted.request.get('/api/onboarding/dev-sms')).json();
  await accepted.getByLabel('SMS verification code', { exact: true }).fill(sms.code);
  await accepted.getByRole('button', { name: 'Verify mobile', exact: true }).click();
  await expect(accepted.getByText('VERIFIED', { exact: true })).toBeVisible();
  await accepted.goto(await mailLink(accepted, recipient.email, 'staff-invitations'));
  await accepted.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(accepted.getByRole('status')).toContainText('Invitation accepted');
  await accepted.getByRole('link', { name: 'Sign in to staff workspace', exact: true }).click();
  await accepted.getByLabel('Email address', { exact: true }).fill(recipient.email);
  await accepted.getByLabel('Password', { exact: true }).fill(recipient.password);
  await accepted.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(accepted.getByRole('heading', { name: 'Protect your workspace.', exact: true })).toBeVisible();
  await mfa(accepted, recipient.password);
  await expect(accepted.getByRole('heading', { name: 'Your daily operations', exact: true })).toBeVisible();
  await expect(
    accepted
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('link', { name: 'Payments', exact: true }),
  ).toHaveCount(0);
  expect((await accepted.request.get('/api/workspaces/staff/payments')).status()).toBe(403);
  await accepted.close();
  await context.close();
});
