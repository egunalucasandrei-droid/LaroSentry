import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import request from 'supertest';
import { generate } from 'otplib';
import type { INestApplication } from '@nestjs/common';
import { POLICY_VERSION, phoneSchema } from '@larosentry/contracts';
import { createApp } from '../src/main.js';
import { db } from '../src/db.js';
import { decrypt, hash } from '../src/crypto.js';
import { purgeVerificationContent } from '../src/facility-verification.controller.js';
import { verificationFixture } from './verification-fixture.js';
const origin = 'http://127.0.0.1:5173',
  password = 'Onboarding-test-only-passphrase-55';
let app: INestApplication;
type Client = {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  id: string;
  email: string;
  phone: string;
};
let player: Client, owner: Client, admin: Client, otherAdmin: Client, staff: Client, unverified: Client;
let applicationId: string, draftId: string, documentId: string, facilityId: string;
const phone = () => '+639' + randomInt(100000000, 1000000000);
const csrf = (r: request.Response) =>
  (r.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith('ls_csrf='))!
    .split(';')[0]!
    .slice(8);
const post = (c: Client, path: string, data: object = {}) =>
  c.agent
    .post('/api' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(data);
function registration(email: string, mobile = phone()) {
  return {
    email,
    phone: mobile,
    password,
    confirmPassword: password,
    nickname: 'Onboarding tester',
    adult: true,
    acceptedTerms: true,
    acceptedPrivacy: true,
    policyVersion: POLICY_VERSION,
  };
}
async function emailToken(c: Client) {
  const mail = await db.outbox.findFirstOrThrow({
    where: { recipient: c.email, subject: 'Verify your LaroSentry email' },
    orderBy: { createdAt: 'desc' },
  });
  return decrypt(mail.encryptedBody).match(/#token=([\w-]+)/)![1]!;
}
async function verifyEmail(c: Client) {
  return post(c, '/auth/verify-email', { token: await emailToken(c) });
}
async function verifyPhone(c: Client) {
  const sent = await post(c, '/onboarding/sms/send');
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const inbox = await c.agent.get('/api/onboarding/dev-sms');
  const checked = await post(c, '/onboarding/sms/verify', { code: inbox.body.code });
  assert.equal(checked.status, 201);
}
async function client(verified = true, role = 'PLAYER') {
  const email = `onboard-${randomUUID()}@example.test`,
    data = registration(email);
  const agent = request.agent(app.getHttpServer());
  const r = await agent
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ ...data, role: 'ADMIN' });
  assert.equal(r.status, 201);
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  assert.equal(u.role, 'PLAYER');
  const login = await agent.post('/api/auth/login').set('Origin', origin).send({ email, password });
  assert.equal(login.status, 201);
  const c = { agent, csrf: csrf(login), id: u.id, email, phone: data.phone };
  if (verified) {
    assert.equal((await verifyEmail(c)).status, 201);
    await verifyPhone(c);
  }
  if (role !== 'PLAYER') {
    await db.user.update({ where: { id: u.id }, data: { role } });
    const setup = await post(c, '/auth/mfa/setup', { password });
    assert.equal(setup.status, 201);
    const checked = await post(c, '/auth/mfa/verify', {
      code: await generate({ secret: setup.body.secret }),
    });
    assert.equal(checked.status, 201);
    c.csrf = csrf(checked);
  }
  return c;
}
before(
  async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/larosentry_test_'))
      throw new Error('Isolated database required');
    app = await createApp();
    player = await client();
    owner = await client();
    admin = await client(true, 'ADMIN');
    otherAdmin = await client(true, 'ADMIN');
    staff = await client(true, 'FACILITY_STAFF');
    unverified = await client(false);
  },
  { timeout: 90000 },
);
after(async () => {
  await app.close();
  await db.$disconnect();
});
test('registration normalizes PH mobiles and rejects invalid formats, confirmation and privacy omissions', async () => {
  assert.equal(phoneSchema.parse('09171234567'), '+639171234567');
  assert.equal(phoneSchema.parse('+63 917 123 4567'), '+639171234567');
  for (const value of ['+12025550123', '08171234567', '+639123', '+6391712345678', 'phone'])
    assert.equal(phoneSchema.safeParse(value).success, false);
  for (const extra of [
    { phone: 'not-a-phone' },
    { confirmPassword: 'different' },
    { acceptedPrivacy: false },
    { acceptedTerms: false },
    { password: 'short', confirmPassword: 'short' },
  ])
    assert.equal(
      (
        await request(app.getHttpServer())
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({ ...registration(`invalid-${randomUUID()}@example.test`), ...extra })
      ).status,
      400,
    );
  const original = await db.user.findUniqueOrThrow({ where: { id: player.id } });
  assert.ok(original.phoneEncrypted && !original.phoneEncrypted.includes(player.phone));
  assert.equal(decrypt(original.phoneEncrypted!), player.phone);
  for (const data of [
    registration(player.email),
    registration(`duplicate-${randomUUID()}@example.test`, player.phone),
  ]) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send(data);
    assert.equal(response.status, 201);
    assert.match(response.body.message, /If these details/);
  }
});
test('SMS-first onboarding is confined to safe APIs until both channels are verified', async () => {
  assert.equal((await unverified.agent.get('/api/bookings')).status, 403);
  assert.equal((await post(unverified, '/onboarding/purpose', { purpose: 'HOST' })).status, 403);
  await verifyPhone(unverified);
  assert.equal((await unverified.agent.get('/api/onboarding')).body.status, 'PARTIALLY_VERIFIED');
  assert.equal((await post(unverified, '/onboarding/purpose', { purpose: 'HOST' })).status, 201);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: unverified.id } })).role, 'PLAYER');
  assert.equal((await post(unverified, '/onboarding/drafts')).status, 403);
  assert.equal((await post(unverified, '/onboarding/purpose', { purpose: 'ADMIN' })).status, 400);
  assert.equal((await verifyEmail(unverified)).status, 201);
  assert.equal((await unverified.agent.get('/api/onboarding')).body.status, 'VERIFIED');
});
test('email tokens are single use, expire and resends are throttled without public enumeration', async () => {
  const c = await client(false),
    raw = await emailToken(c);
  assert.equal((await post(c, '/onboarding/email/resend')).status, 409);
  await db.accountToken.updateMany({
    where: { userId: c.id },
    data: { createdAt: new Date(Date.now() - 120000) },
  });
  assert.equal((await post(c, '/onboarding/email/resend')).status, 201);
  assert.equal((await post(c, '/auth/verify-email', { token: raw })).status, 400);
  const latest = await emailToken(c);
  await db.accountToken.updateMany({
    where: { hash: hash(latest) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await post(c, '/auth/verify-email', { token: latest })).status, 400);
  const token = await db.accountToken.create({
    data: {
      userId: c.id,
      kind: 'VERIFY',
      hash: hash('one-time-test-token-long-enough'),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  assert.ok(token.id);
  assert.equal(
    (await post(c, '/auth/verify-email', { token: 'one-time-test-token-long-enough' })).status,
    201,
  );
  assert.equal(
    (await post(c, '/auth/verify-email', { token: 'one-time-test-token-long-enough' })).status,
    400,
  );
});
test('SMS cooldown, bad codes, expiry, replay and attempt exhaustion are enforced', async () => {
  const c = await client(false);
  assert.equal((await post(c, '/onboarding/sms/send')).status, 201);
  assert.equal((await post(c, '/onboarding/sms/send')).status, 409);
  const inbox = await c.agent.get('/api/onboarding/dev-sms');
  const invalid = inbox.body.code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++)
    assert.equal((await post(c, '/onboarding/sms/verify', { code: invalid })).status, 400);
  assert.equal((await post(c, '/onboarding/sms/verify', { code: inbox.body.code })).status, 400);
  assert.ok(await db.auditEvent.findFirst({ where: { actorId: c.id, action: 'SMS_ATTEMPTS_EXHAUSTED' } }));
  assert.equal((await c.agent.get('/api/onboarding/dev-sms')).body.code, null);
  await db.verificationChallenge.updateMany({
    where: { userId: c.id },
    data: { createdAt: new Date(Date.now() - 120000) },
  });
  assert.equal((await post(c, '/onboarding/sms/send')).status, 201);
  const second = await c.agent.get('/api/onboarding/dev-sms');
  await db.verificationChallenge.updateMany({
    where: { userId: c.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal((await post(c, '/onboarding/sms/verify', { code: second.body.code })).status, 400);
  await db.verificationChallenge.updateMany({
    where: { userId: c.id },
    data: { createdAt: new Date(Date.now() - 120000) },
  });
  await verifyPhone(c);
  const recent = await db.verificationChallenge.findFirstOrThrow({
    where: { userId: c.id },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(recent.localCipher, null);
  assert.equal((await post(c, '/onboarding/sms/verify', { code: '123456' })).status, 400);
});
test('missing SMS provider reports unavailable and does not create a challenge', async () => {
  const c = await client(false),
    previous = process.env.SMS_PROVIDER;
  process.env.SMS_PROVIDER = 'unavailable';
  try {
    assert.equal((await post(c, '/onboarding/sms/send')).status, 503);
    assert.equal(await db.verificationChallenge.count({ where: { userId: c.id } }), 0);
    assert.equal((await c.agent.get('/api/onboarding/dev-sms')).status, 403);
  } finally {
    process.env.SMS_PROVIDER = previous;
  }
});
test('preferences are skippable, editable and rank actual published facilities with explanations', async () => {
  assert.equal((await post(player, '/onboarding/preferences', { skip: true })).status, 201);
  assert.ok((await db.user.findUniqueOrThrow({ where: { id: player.id } })).onboardingCompletedAt);
  const f = await db.facility.create({
    data: {
      name: 'Preference match',
      slug: randomUUID(),
      area: 'Quezon City',
      address: 'Fictional test address',
      description: 'Fictional recommendation test facility.',
      latitude: 14.6,
      longitude: 121,
      amenities: ['Indoor'],
      status: 'PUBLISHED',
      cancellationPolicy: 'Test cancellation policy.',
      courts: { create: { name: 'Badminton court', sport: 'Badminton', hourlyRate: 30000, capacity: 4 } },
    },
  });
  assert.equal(
    (
      await post(player, '/onboarding/preferences', {
        sports: ['Badminton'],
        areas: ['Quezon City'],
        court: 'Indoor',
        budgetMax: 40000,
      })
    ).status,
    201,
  );
  const recommendations = await player.agent.get('/api/onboarding/recommendations');
  assert.equal(recommendations.status, 200);
  assert.equal(recommendations.body.items[0].id, f.id);
  assert.match(recommendations.body.items[0].explanation, /Badminton/);
  assert.match(recommendations.body.items[0].explanation, /Quezon City/);
  assert.equal((await post(player, '/onboarding/preferences', { recommendations: false })).status, 201);
  assert.equal((await player.agent.get('/api/onboarding')).body.preferences.recommendations, false);
});
const facilityData = {
  name: 'Verification test hall',
  area: 'Quezon City',
  address: 'Fictional verification facility address',
  description: 'An isolated fixture for facility and identity review.',
  latitude: 14.6,
  longitude: 121,
  openHour: 6,
  closeHour: 22,
  cancellationPolicy: 'Cancel before the reserved time for review.',
  courtName: 'Verification court',
  sport: 'Tennis',
  hourlyRate: 50000,
  capacity: 4,
};
test('facility drafts require contacts and evidence; selecting host never grants ownership', async () => {
  assert.equal((await post(owner, '/onboarding/purpose', { purpose: 'HOST' })).status, 201);
  assert.equal((await owner.agent.get('/api/workspaces')).body.owner, false);
  assert.equal((await post(owner, '/facility-applications', facilityData)).status, 400);
  const empty = await post(owner, '/onboarding/drafts');
  assert.equal(empty.status, 201);
  assert.equal(
    (
      await post(owner, `/onboarding/drafts/${empty.body.id}`, {
        data: { name: 'Partial saved facility' },
        relationship: 'OWNER',
        idType: null,
      })
    ).status,
    201,
  );
  assert.equal(
    (await owner.agent.get(`/api/onboarding/drafts/${empty.body.id}`)).body.data.name,
    'Partial saved facility',
  );
  assert.equal((await post(owner, `/onboarding/drafts/${empty.body.id}/submit`)).status, 400);
  const submitted = await verificationFixture((path, data) => post(owner, path, data), facilityData);
  assert.equal(submitted.status, 201);
  applicationId = submitted.body.id;
  const a = await db.facilityApplication.findUniqueOrThrow({ where: { id: applicationId } });
  draftId = a.draftId!;
  facilityId = a.facilityId;
  documentId = (await db.verificationDocument.findFirstOrThrow({ where: { draftId, kind: 'IDENTITY' } })).id;
  assert.equal(
    (
      await post(owner, `/onboarding/drafts/${draftId}`, {
        data: facilityData,
        relationship: 'OWNER',
        idType: 'Passport',
      })
    ).status,
    409,
  );
  assert.equal((await db.facility.findUniqueOrThrow({ where: { id: facilityId } })).status, 'PENDING');
});
test('document reads require assigned admin review; players, other owners, staff and unassigned admins are denied', async () => {
  const path = `/api/admin/applications/${applicationId}/documents/${documentId}`;
  for (const c of [owner, player, staff, admin, otherAdmin])
    assert.equal((await c.agent.get(path)).status, 403);
  assert.equal((await player.agent.get(`/api/onboarding/drafts/${draftId}`)).status, 404);
  const beforeReview = (await admin.agent.get('/api/admin/overview')).body.pendingApplications;
  assert.equal(
    (
      await post(admin, `/admin/applications/${applicationId}/decision`, {
        action: 'START_REVIEW',
        reason: 'Starting the assigned verification review.',
        confirmed: true,
      })
    ).status,
    201,
  );
  assert.equal((await admin.agent.get('/api/admin/overview')).body.pendingApplications, beforeReview);
  const doc = await admin.agent.get(path);
  assert.equal(doc.status, 200);
  assert.match(doc.headers['content-type']!, /image\/png/);
  assert.match(doc.headers['cache-control']!, /no-store/);
  assert.equal((await otherAdmin.agent.get(path)).status, 403);
  assert.ok(
    await db.auditEvent.findFirst({
      where: { actorId: admin.id, action: 'ADMIN_VERIFICATION_DOCUMENT_VIEWED', resourceId: documentId },
    }),
  );
  const stored = await db.verificationDocument.findUniqueOrThrow({ where: { id: documentId } });
  assert.ok(stored.encryptedContent && !stored.encryptedContent.startsWith('iVBOR'));
});
test('clarification reopens drafts; resubmission and explicit reviewed approval grant exactly one membership', async () => {
  const decision = `/admin/applications/${applicationId}/decision`,
    base = { confirmed: true, reason: 'Reviewed fictional evidence and facility authority.' };
  assert.equal((await post(admin, decision, { ...base, action: 'APPROVE' })).status, 409);
  assert.equal((await post(admin, decision, { ...base, action: 'CLARIFY' })).status, 201);
  assert.equal((await owner.agent.get(`/api/onboarding/drafts/${draftId}`)).body.stage, 'DRAFT');
  assert.equal((await post(owner, `/onboarding/drafts/${draftId}/submit`)).status, 201);
  assert.equal((await post(admin, decision, { ...base, action: 'START_REVIEW' })).status, 201);
  assert.equal(
    (
      await post(admin, decision, {
        ...base,
        action: 'APPROVE',
        identityReviewed: true,
        facilityReviewed: true,
      })
    ).status,
    201,
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).role, 'FACILITY_OWNER');
  assert.equal(await db.membership.count({ where: { userId: owner.id, facilityId, role: 'OWNER' } }), 1);
  assert.equal((await owner.agent.get('/api/workspaces')).status, 401);
  const history = await db.adminDecision.findMany({ where: { targetId: applicationId } });
  assert.ok(history.some((d) => d.previousState === 'UNDER_REVIEW' && d.newState === 'APPROVED'));
  assert.ok(
    (await db.verificationDocument.findUniqueOrThrow({ where: { id: documentId } })).expiresAt.getTime() <
      Date.now() + 8 * 86400000,
  );
});
test('unsupported uploads and expired content are denied; retention removes ciphertext', async () => {
  const draft = await post(player, '/onboarding/drafts');
  assert.equal(draft.status, 201);
  for (const base64 of [
    Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
    Buffer.from('%PDF active content').toString('base64'),
  ])
    assert.equal(
      (await post(player, `/onboarding/drafts/${draft.body.id}/documents`, { kind: 'IDENTITY', base64 }))
        .status,
      400,
    );
  await db.verificationDocument.update({
    where: { id: documentId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await purgeVerificationContent();
  const d = await db.verificationDocument.findUniqueOrThrow({ where: { id: documentId } });
  assert.equal(d.encryptedContent, null);
  assert.ok(d.deletedAt);
  assert.equal(
    (await admin.agent.get(`/api/admin/applications/${applicationId}/documents/${documentId}`)).status,
    403,
  );
});
test('changing contacts requires password, resets verification and revokes sessions', async () => {
  const c = await client();
  assert.equal(
    (await post(c, '/onboarding/contacts', { email: c.email, phone: phone(), password: 'wrong' })).status,
    403,
  );
  const changed = await post(c, '/onboarding/contacts', { email: c.email, phone: phone(), password });
  assert.equal(changed.status, 201);
  assert.equal((await c.agent.get('/api/onboarding')).status, 401);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: c.id } })).phoneVerifiedAt, null);
});
test('staff invitation is email-bound, single-use, facility-specific and cannot grant ADMIN', async () => {
  // Reauthenticate the approved owner, then enroll MFA; invitation does not bypass it.
  const login = await owner.agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: owner.email, password });
  owner.csrf = csrf(login);
  const setup = await post(owner, '/auth/mfa/setup', { password });
  const checked = await post(owner, '/auth/mfa/verify', {
    code: await generate({ secret: setup.body.secret }),
  });
  owner.csrf = csrf(checked);
  const invitation = await post(owner, `/workspaces/owner/facilities/${facilityId}/invitations`, {
    email: player.email,
    permissions: ['ATTENDANCE'],
    confirmed: true,
    reason: 'Invite a fictional attendance assistant.',
  });
  assert.equal(invitation.status, 201);
  const mail = await db.outbox.findFirstOrThrow({
    where: { recipient: player.email, subject: 'LaroSentry facility staff invitation' },
  });
  const raw = decrypt(mail.encryptedBody).match(/#token=([\w-]+)/)![1]!;
  assert.equal((await post(staff, '/onboarding/staff-invitations/accept', { token: raw })).status, 403);
  assert.equal(
    (
      await post(player, '/onboarding/staff-invitations/accept', {
        token: raw,
        permissions: ['PAYMENTS'],
        role: 'ADMIN',
      })
    ).status,
    400,
  );
  assert.equal((await post(player, '/onboarding/staff-invitations/accept', { token: raw })).status, 201);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: player.id } })).role, 'FACILITY_STAFF');
  assert.deepEqual(
    (
      await db.membership.findUniqueOrThrow({
        where: { userId_facilityId: { userId: player.id, facilityId } },
      })
    ).permissions,
    ['ATTENDANCE'],
  );
  assert.equal((await player.agent.get('/api/workspaces')).status, 401);
});
