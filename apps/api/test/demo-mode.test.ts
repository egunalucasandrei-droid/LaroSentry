import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';
import { db } from '../src/db.js';
import { passwordHash } from '../src/auth.controller.js';

const enabled = process.env.DEMO_MODE === 'true',
  origin = 'http://127.0.0.1:5173';
const roles = ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'];
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; id: string };
let app: INestApplication, facility: string, otherFacility: string;
const clients: Record<string, Client> = {};
const post = (c: Client, path: string, data: object = {}) =>
  c.agent.post(`/api${path}`).set('Origin', origin).set('X-CSRF-Token', c.csrf).send(data);
before(async () => {
  if (
    process.env.DEMO_VERIFICATION_TEST !== '1' ||
    !/^\/larosentry_demo_\d{13}$/.test(new URL(process.env.DATABASE_URL!).pathname)
  )
    throw new Error('Use test:demo-mode with its new isolated database.');
  const passwords = JSON.parse(readFileSync(process.env.DEMO_PASSWORD_FILE!, 'utf8'));
  app = await createApp();
  for (const role of roles) {
    const email = `${role.toLowerCase()}@demo.example.test`;
    const user = await db.user.update({
      where: { email },
      data: {
        role,
        verifiedAt: null,
        phoneVerifiedAt: null,
        mfaEnabled: false,
        mfaSecret: null,
        contactRequired: true,
        onboardingCompletedAt: null,
        suspendedAt: null,
      },
    });
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email, password: passwords[role] });
    assert.equal(login.status, 201);
    assert.equal(login.body.user.verificationBypassed, enabled);
    assert.equal(login.body.user.mfaVerified, false, 'Bypass must not claim real MFA verification');
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('ls_csrf='),
    )!;
    clients[role] = { agent, id: user.id, csrf: cookie.split(';')[0]!.slice(8) };
  }
  const owner = await db.membership.findFirstOrThrow({
    where: { userId: clients.FACILITY_OWNER!.id, role: 'OWNER' },
  });
  facility = owner.facilityId;
  otherFacility = (await db.facility.findFirstOrThrow({ where: { id: { not: facility } } })).id;
  await db.membership.update({
    where: { userId_facilityId: { userId: clients.FACILITY_STAFF!.id, facilityId: facility } },
    data: { permissions: ['BOOKINGS'] },
  });
});
after(async () => {
  await app?.close();
  await db.$disconnect();
});

test('named demo users authenticate but contact/MFA records are never rewritten', async () => {
  for (const role of roles) {
    const user = await db.user.findUniqueOrThrow({ where: { id: clients[role]!.id } });
    assert.equal(user.verifiedAt, null);
    assert.equal(user.phoneVerifiedAt, null);
    assert.equal(user.mfaEnabled, false);
    assert.equal((await clients[role]!.agent.get('/api/auth/me')).body.demoMode, enabled);
    const wrong = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password: 'incorrect-demo-password' });
    assert.equal(wrong.status, 401);
  }
});
test('direct workspace/admin/files requests preserve roles and deny anonymous callers', async () => {
  assert.equal((await request(app.getHttpServer()).get('/api/admin/overview')).status, 401);
  for (const role of roles) {
    const c = clients[role]!;
    assert.equal((await c.agent.get('/api/workspaces')).status, enabled ? 200 : 403);
    assert.equal((await c.agent.get('/api/admin/overview')).status, enabled && role === 'ADMIN' ? 200 : 403);
    assert.equal(
      (await c.agent.get('/api/admin/files/not-a-file')).status,
      enabled && role === 'ADMIN' ? 404 : 403,
    );
    assert.equal(
      (await c.agent.get('/api/workspaces/owner/overview')).status,
      enabled && ['ADMIN', 'FACILITY_OWNER'].includes(role) ? 200 : 403,
    );
    assert.equal(
      (await c.agent.get('/api/workspaces/staff/bookings')).status,
      enabled && role === 'FACILITY_STAFF' ? 200 : 403,
    );
  }
});
test('cross-facility access and missing staff permissions remain denied', async () => {
  const owner = clients.FACILITY_OWNER!,
    staff = clients.FACILITY_STAFF!;
  assert.equal(
    (await owner.agent.get(`/api/workspaces/owner/courts?facilityId=${otherFacility}`)).status,
    403,
  );
  assert.equal((await staff.agent.get(`/api/workspaces/staff/payments?facilityId=${facility}`)).status, 403);
  assert.equal(
    (await staff.agent.get(`/api/workspaces/staff/bookings?facilityId=${facility}`)).status,
    enabled ? 200 : 403,
  );
  assert.equal(
    (await staff.agent.get(`/api/workspaces/staff/bookings?facilityId=${otherFacility}`)).status,
    403,
  );
});
test('unlisted users and URL/header switches cannot activate bypass; CSRF stays required', async () => {
  const password = 'Isolated-normal-account-passphrase';
  const user = await db.user.create({
    data: {
      email: `ordinary-${randomUUID()}@example.test`,
      nickname: 'Ordinary test account',
      passwordHash: await passwordHash(password),
      contactRequired: true,
    },
  });
  const agent = request.agent(app.getHttpServer());
  const login = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: user.email, password });
  assert.equal(login.body.user.verificationBypassed, false);
  assert.equal((await agent.get('/api/workspaces?DEMO_MODE=true').set('X-Demo-Mode', 'true')).status, 403);
  assert.equal((await agent.get('/api/onboarding/drafts')).status, 403);
  assert.equal(
    (await clients.PLAYER!.agent.post('/api/auth/logout').set('Origin', origin).send({})).status,
    403,
  );
});
test('verification bypass permits booking requests but preserves price review and own-object checks', async () => {
  const c = clients.PLAYER!;
  if (!enabled) {
    assert.equal((await c.agent.get('/api/bookings')).status, 403);
    return;
  }
  const court = await db.court.findFirstOrThrow({ where: { facilityId: facility } });
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const body = {
    courtId: court.id,
    startsAt: `${date}T09:00:00+08:00`,
    endsAt: `${date}T10:00:00+08:00`,
    mode: 'BOOKING_ONLY',
    expectedGuests: 2,
  };
  const quote = await post(c, '/bookings/quote', body);
  assert.equal(quote.status, 201);
  const booking = await c.agent
    .post('/api/bookings')
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .set('Idempotency-Key', randomUUID())
    .send({ ...body, quoteFingerprint: quote.body.quoteFingerprint });
  assert.equal(booking.status, 201);
  assert.equal(booking.body.status, 'PENDING');
  assert.equal((await clients.FACILITY_OWNER!.agent.get(`/api/bookings/${booking.body.id}`)).status, 404);
  assert.equal((await post(c, `/bookings/${booking.body.id}/cancel`)).status, 201);
});
test('evidence bypass still requires valid facility information and independent assigned admin approval', async () => {
  const c = clients.PLAYER!,
    admin = clients.ADMIN!;
  if (!enabled) {
    assert.equal((await post(c, '/onboarding/drafts')).status, 403);
    await db.user.update({
      where: { id: c.id },
      data: { verifiedAt: new Date(), phoneVerifiedAt: new Date() },
    });
    await db.user.update({
      where: { id: admin.id },
      data: { verifiedAt: new Date(), phoneVerifiedAt: new Date() },
    });
    assert.equal(
      (await admin.agent.get('/api/admin/overview')).status,
      403,
      'MFA returns when demo mode is OFF',
    );
  }
  const draft = await post(c, '/onboarding/drafts');
  assert.equal(draft.status, 201);
  assert.equal(
    (await post(c, `/onboarding/drafts/${draft.body.id}/submit`)).status,
    400,
    'Data validation is not bypassed',
  );
  const saved = await post(c, `/onboarding/drafts/${draft.body.id}`, {
    relationship: 'MANAGER',
    idType: null,
    data: {
      name: 'Fictional demo-mode application',
      area: 'Quezon City',
      address: '20 Fictional Demo Avenue',
      description: 'Synthetic local facility application for permission testing only.',
      latitude: 14.65,
      longitude: 121.05,
      openHour: 6,
      closeHour: 22,
      cancellationPolicy: 'Fictional test cancellation policy only.',
      courtName: 'Court one',
      sport: 'Tennis',
      hourlyRate: 30000,
      capacity: 6,
      facilityPhone: '+639171234567',
    },
  });
  assert.equal(saved.status, 201);
  const submitted = await post(c, `/onboarding/drafts/${draft.body.id}/submit`);
  assert.equal(submitted.status, enabled ? 201 : 400);
  if (!enabled) return;
  const application = await db.facilityApplication.findUniqueOrThrow({ where: { id: submitted.body.id } });
  assert.equal(application.state, 'PENDING');
  assert.equal(application.identityState, 'DEMO_BYPASSED');
  assert.equal(
    (await db.facility.findUniqueOrThrow({ where: { id: application.facilityId } })).status,
    'PENDING',
  );
  assert.equal(
    await db.membership.findUnique({
      where: { userId_facilityId: { userId: c.id, facilityId: application.facilityId } },
    }),
    null,
  );
  const reason = { reason: 'Independent local demo application review', confirmed: true };
  assert.equal(
    (await post(admin, `/admin/applications/${application.id}/decision`, { ...reason, action: 'APPROVE' }))
      .status,
    409,
    'Must claim the review first',
  );
  assert.equal(
    (
      await post(admin, `/admin/applications/${application.id}/decision`, {
        ...reason,
        action: 'START_REVIEW',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await post(admin, `/admin/applications/${application.id}/decision`, {
        ...reason,
        action: 'APPROVE',
        confirmed: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (await post(admin, `/admin/applications/${application.id}/decision`, { ...reason, action: 'APPROVE' }))
      .status,
    201,
  );
  const approved = await db.facilityApplication.findUniqueOrThrow({ where: { id: application.id } });
  assert.equal(approved.identityState, 'DEMO_BYPASSED');
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { userId_facilityId: { userId: c.id, facilityId: application.facilityId } },
      })
    ).role,
    'OWNER',
  );
  assert.equal(
    (await db.auditEvent.count({
      where: { action: 'LOCAL_DEMO_APPLICATION_REVIEW_BYPASSED', resourceId: application.id },
    })) > 0,
    true,
  );
});
test('suspension and revoked sessions remain effective in either mode', async () => {
  const c = clients.FACILITY_STAFF!;
  await db.user.update({ where: { id: c.id }, data: { suspendedAt: new Date() } });
  assert.equal((await c.agent.get('/api/auth/me')).body.user, null);
  assert.equal((await c.agent.get('/api/workspaces/staff/bookings')).status, 401);
  await db.session.deleteMany({ where: { userId: clients.FACILITY_OWNER!.id } });
  assert.equal((await clients.FACILITY_OWNER!.agent.get('/api/auth/me')).body.user, null);
});
