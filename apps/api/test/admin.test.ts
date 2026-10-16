import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { generate } from 'otplib';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';
import { db } from '../src/db.js';
import { decrypt } from '../src/crypto.js';
import { collectSecurityAlerts } from '../src/security-alerts.js';
const origin = 'http://127.0.0.1:5173',
  password = 'Only-local-admin-test-passphrase-891';
const phoneNumber = () => '+639' + randomInt(100000000, 1000000000);
let app: INestApplication;
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; id: string; email: string };
let admin: Client, player: Client, owner: Client, staff: Client, noMfa: Client;
const post = (c: Client, path: string, body: object = {}) =>
  c.agent.post(`/api${path}`).set('Origin', origin).set('X-CSRF-Token', c.csrf).send(body);
const csrf = (r: request.Response) =>
  (r.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith('ls_csrf='))!
    .split(';')[0]!
    .slice(8);
async function client(role: string, mfa = false) {
  const agent = request.agent(app.getHttpServer()),
    email = `admin-test-${randomUUID()}@example.test`;
  const registered = await agent
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      email,
      password,
      nickname: `Test ${role}`,
      adult: true,
      acceptedTerms: true,
      policyVersion: '2026-10-16-onboarding-draft-2',
      confirmPassword: password,
      phone: phoneNumber(),
      acceptedPrivacy: true,
      role: 'ADMIN',
    });
  assert.equal(registered.status, 201);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  assert.equal(user.role, 'PLAYER', 'Public registration must ignore attempted role escalation');
  const outbox = await db.outbox.findFirstOrThrow({ where: { recipient: email } });
  const token = decrypt(outbox.encryptedBody).match(/#token=([\w-]+)/)![1]!;
  assert.equal(
    (await agent.post('/api/auth/verify-email').set('Origin', origin).send({ token })).status,
    201,
  );
  await db.user.update({
    where: { id: user.id },
    data: { role, phoneVerifiedAt: new Date(), onboardingCompletedAt: new Date() },
  });
  const login = await agent.post('/api/auth/login').set('Origin', origin).send({ email, password });
  assert.equal(login.status, 201);
  const c = { agent, csrf: csrf(login), id: user.id, email };
  if (mfa) {
    const setup = await post(c, '/auth/mfa/setup', { password });
    assert.equal(setup.status, 201);
    const verified = await post(c, '/auth/mfa/verify', {
      code: await generate({ secret: setup.body.secret }),
    });
    assert.equal(verified.status, 201);
    c.csrf = csrf(verified);
  }
  return c;
}
before(
  async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/larosentry_test_'))
      throw new Error('Isolated test database required.');
    app = await createApp();
    admin = await client('ADMIN', true);
    player = await client('PLAYER', true);
    owner = await client('FACILITY_OWNER', true);
    staff = await client('FACILITY_STAFF', true);
    noMfa = await client('ADMIN');
  },
  { timeout: 30000 },
);
after(async () => {
  await app?.close();
  await db.$disconnect();
});
test('admin namespace denies visitors and every non-admin role, including direct files, exports and mutations', async () => {
  const id = randomUUID();
  const paths = [
    'overview',
    'applications',
    'users',
    'reports',
    'alerts',
    'audit',
    'health',
    `applications/${id}`,
    `users/${id}`,
    `reports/${id}`,
    `alerts/${id}`,
    `audit/${id}`,
    `files/${id}`,
    'exports/users',
  ];
  for (const path of paths) {
    assert.equal((await request(app.getHttpServer()).get(`/api/admin/${path}`)).status, 401);
    for (const c of [player, owner, staff, noMfa])
      assert.equal((await c.agent.get(`/api/admin/${path}`)).status, 403, `${path} denied`);
  }
  for (const c of [player, owner, staff, noMfa])
    for (const path of [
      `applications/${id}/decision`,
      `users/${id}/restriction`,
      `reports/${id}/decision`,
      `alerts/${id}/decision`,
    ])
      assert.equal(
        (await post(c, `/admin/${path}`, { confirmed: true, reason: 'Attempt direct mutation' })).status,
        403,
      );
  assert.equal((await admin.agent.get('/api/admin/overview')).status, 200);
  assert.equal((await admin.agent.get('/api/admin/exports/users')).status, 404);
  assert.equal((await admin.agent.get(`/api/admin/files/${id}`)).status, 404);
});
let applicationId: string, facilityId: string;
test('management hub requires admin or host plus MFA and scopes courts to owner memberships', async () => {
  assert.equal((await request(app.getHttpServer()).get('/api/management')).status, 401);
  for (const c of [player, staff, noMfa]) assert.equal((await c.agent.get('/api/management')).status, 403);
  assert.equal((await admin.agent.get('/api/management')).body.scope, 'ADMIN');
  const hostWithoutMfa = await client('FACILITY_OWNER');
  assert.equal((await hostWithoutMfa.agent.get('/api/management')).status, 403);
  const create = (label: string) =>
    db.facility.create({
      data: {
        name: label,
        slug: randomUUID(),
        area: 'Test',
        address: 'Fictional address',
        description: 'Test only',
        latitude: 14.6,
        longitude: 121,
        amenities: [],
        status: 'PENDING',
        demo: true,
        openHour: 6,
        closeHour: 22,
        cancellationPolicy: 'Test policy only',
        courts: { create: { name: label, sport: 'Tennis', hourlyRate: 50000, capacity: 4 } },
      },
      include: { courts: true },
    });
  const own = await create('Owned test court'),
    other = await create('Other host court');
  const membership = await db.membership.create({
    data: { userId: owner.id, facilityId: own.id, role: 'OWNER', permissions: ['BOOKINGS'] },
  });
  await db.membership.create({
    data: { userId: owner.id, facilityId: other.id, role: 'STAFF', permissions: ['BOOKINGS'] },
  });
  const result = await owner.agent.get('/api/management');
  assert.equal(result.status, 200);
  assert.equal(result.body.scope, 'HOST');
  assert.deepEqual(
    result.body.courts.map((c: { id: string }) => c.id),
    [own.courts[0]!.id],
  );
  assert.equal(result.body.metrics[0].value, 1);
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const endpoint = `/api/operations/courts/${own.courts[0]!.id}/schedule?date=${date}`;
  assert.equal((await request(app.getHttpServer()).get(endpoint)).status, 401);
  for (const c of [player, staff, noMfa, admin, hostWithoutMfa])
    assert.equal((await c.agent.get(endpoint)).status, 403);
  const open = await owner.agent.get(endpoint);
  assert.equal(open.status, 200);
  assert.equal(open.body.slots.length, 31);
  assert.ok(open.body.slots.every((s: { status: string }) => s.status === 'AVAILABLE'));
  const closed = await post(owner, '/operations/closures', {
    courtId: own.courts[0]!.id,
    startsAt: `${date}T08:00:00+08:00`,
    endsAt: `${date}T09:00:00+08:00`,
    reason: 'Test maintenance period',
  });
  assert.equal(closed.status, 201);
  const occupied = await owner.agent.get(endpoint);
  assert.equal(occupied.body.slots.filter((s: { status: string }) => s.status === 'CLOSED').length, 3);
  assert.equal(occupied.body.allocations[0].reason, 'Test maintenance period');
  await post(owner, `/operations/closures/${closed.body.id}/reopen`);
  assert.ok(
    (await owner.agent.get(endpoint)).body.slots.every((s: { status: string }) => s.status === 'AVAILABLE'),
  );
  assert.equal((await owner.agent.get(endpoint.replace(date, 'invalid-date'))).status, 400);
  await db.membership.delete({ where: { id: membership.id } });
  assert.equal((await owner.agent.get(endpoint)).status, 403);
  assert.equal((await owner.agent.get('/api/management')).body.courts.length, 0);
  assert.equal((await owner.agent.get('/api/admin/users')).status, 403);
});
test('local demo shortcut remains unavailable in the ordinary isolated test environment', async () => {
  for (const c of [admin, noMfa, owner, staff, player]) {
    assert.equal((await post(c, '/auth/demo-access', { password })).status, 403);
  }
  assert.equal((await noMfa.agent.get('/api/admin/overview')).status, 403);
});
const applicationData = {
  name: 'Admin test facility',
  area: 'Quezon City',
  address: 'Fictional test address only',
  description: 'A facility for isolated administrator workflow tests.',
  latitude: 14.65,
  longitude: 121.05,
  openHour: 6,
  closeHour: 22,
  cancellationPolicy: 'Cancel before the reserved time for review.',
  courtName: 'Admin test court',
  sport: 'Basketball',
  hourlyRate: 50000,
  capacity: 10,
  confirmed: true,
};
test('application clarification, approval, public visibility and permission audit are transactional', async () => {
  const applicant = await client('PLAYER');
  // Preserve compatibility coverage for pre-verification applications already in the database.
  const facility = await db.facility.create({
    data: {
      name: applicationData.name,
      slug: randomUUID(),
      area: applicationData.area,
      address: applicationData.address,
      description: applicationData.description,
      latitude: applicationData.latitude,
      longitude: applicationData.longitude,
      openHour: 6,
      closeHour: 22,
      cancellationPolicy: applicationData.cancellationPolicy,
      amenities: [],
      courts: {
        create: {
          name: applicationData.courtName,
          sport: applicationData.sport,
          hourlyRate: 50000,
          capacity: 10,
        },
      },
    },
  });
  applicationId = (
    await db.facilityApplication.create({ data: { facilityId: facility.id, applicantId: applicant.id } })
  ).id;
  const searched = await admin.agent.get('/api/admin/applications?q=Admin%20test&state=PENDING&page=1');
  assert.equal(searched.status, 200);
  assert.equal(searched.body.items[0].id, applicationId);
  const detail = await admin.agent.get(`/api/admin/applications/${applicationId}`);
  assert.equal(detail.status, 200);
  facilityId = detail.body.facility.id;
  assert.equal(
    (await request(app.getHttpServer()).get(`/api/facilities/${detail.body.facility.slug}`)).status,
    404,
  );
  assert.equal(
    (
      await post(admin, `/admin/applications/${applicationId}/decision`, {
        action: 'APPROVE',
        reason: 'Review without confirmation',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post(admin, `/admin/applications/${applicationId}/decision`, {
        action: 'CLARIFY',
        reason: 'Please clarify authorized facility management.',
        confirmed: true,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await post(player, `/facility-applications/${applicationId}/reply`, {
        message: 'Unrelated player reply',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await post(applicant, `/facility-applications/${applicationId}/reply`, {
        message: 'I confirm management authorization for this test facility.',
      })
    ).status,
    201,
  );
  const decision = await post(admin, `/admin/applications/${applicationId}/decision`, {
    action: 'APPROVE',
    reason: 'Reviewed submitted details and clarification.',
    confirmed: true,
  });
  assert.equal(decision.status, 201, JSON.stringify(decision.body));
  assert.equal(
    (await request(app.getHttpServer()).get(`/api/facilities/${detail.body.facility.slug}`)).status,
    200,
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: applicant.id } })).role, 'FACILITY_OWNER');
  assert.equal(await db.session.count({ where: { userId: applicant.id } }), 0);
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { userId_facilityId: { userId: applicant.id, facilityId } },
      })
    ).role,
    'OWNER',
  );
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: admin.id, action: 'FACILITY_OWNER_PERMISSION_GRANTED', resourceId: facilityId },
    }),
    1,
  );
  assert.equal(
    (
      await post(admin, `/admin/applications/${applicationId}/decision`, {
        action: 'REJECT',
        reason: 'Cannot decide a finalized application.',
        confirmed: true,
      })
    ).status,
    409,
  );
  // Keep the unrelated discovery suite's fixture independent; this is test-only data.
  await db.facility.update({ where: { id: facilityId }, data: { status: 'PENDING' } });
});
test('reports are account-scoped and decisions have reasons, confirmation and durable history', async () => {
  const submitted = await post(player, '/reports', {
    targetType: 'SECURITY',
    category: 'Security concern',
    details: 'A local test concern to verify fair review and follow-up.',
  });
  assert.equal(submitted.status, 201);
  const id = submitted.body.id;
  assert.equal(
    (await owner.agent.get('/api/reports')).body.items.some((r: { id: string }) => r.id === id),
    false,
  );
  assert.equal(
    (
      await post(admin, `/admin/reports/${id}/decision`, {
        state: 'RESOLVED',
        reason: 'short',
        confirmed: true,
      })
    ).status,
    400,
  );
  for (const state of ['REVIEWING', 'RESOLVED', 'OPEN', 'DISMISSED'])
    assert.equal(
      (
        await post(admin, `/admin/reports/${id}/decision`, {
          state,
          reason: `Fair human review recorded for ${state}.`,
          confirmed: true,
        })
      ).status,
      201,
    );
  const detail = await admin.agent.get(`/api/admin/reports/${id}`);
  assert.equal(detail.body.history.length, 4);
  assert.equal(detail.body.state, 'DISMISSED');
  assert.equal(
    (await player.agent.get('/api/reports')).body.items.find((r: { id: string }) => r.id === id).state,
    'DISMISSED',
  );
  const self = await post(admin, '/reports', {
    targetType: 'SECURITY',
    category: 'Security concern',
    details: 'An administrator report that needs independent review.',
  });
  assert.equal(
    (
      await post(admin, `/admin/reports/${self.body.id}/decision`, {
        state: 'RESOLVED',
        reason: 'Cannot adjudicate own submitted report.',
        confirmed: true,
      })
    ).status,
    409,
  );
});
test('restrictions revoke sessions, deny login, preserve records and can be reversed; self restriction denied', async () => {
  const target = await client('PLAYER');
  assert.equal(
    (
      await post(admin, `/admin/users/${target.id}/restriction`, {
        restricted: true,
        reason: 'Verified local policy concern pending review.',
        confirmed: true,
      })
    ).status,
    201,
  );
  assert.equal((await target.agent.get('/api/bookings')).status, 401);
  assert.equal(
    (await target.agent.post('/api/auth/login').set('Origin', origin).send({ email: target.email, password }))
      .status,
    401,
  );
  assert.equal(
    (
      await post(admin, `/admin/users/${target.id}/restriction`, {
        restricted: false,
        reason: 'Review completed; access may safely resume.',
        confirmed: true,
      })
    ).status,
    201,
  );
  assert.equal(
    (await target.agent.post('/api/auth/login').set('Origin', origin).send({ email: target.email, password }))
      .status,
    201,
  );
  assert.equal(
    (
      await post(admin, `/admin/users/${admin.id}/restriction`, {
        restricted: true,
        reason: 'Attempt accidental self restriction.',
        confirmed: true,
      })
    ).status,
    409,
  );
  const detail = await admin.agent.get(`/api/admin/users/${target.id}`);
  assert.equal(detail.body.history.length, 2);
  for (const secret of ['passwordHash', 'tokenHash', 'mfaSecret', 'lastTotpStep', 'csrfHash'])
    assert.equal(JSON.stringify(detail.body).includes(secret), false);
});
test('security rules create deduplicated human-review alerts with evidence and acknowledgement history', async () => {
  await collectSecurityAlerts();
  await collectSecurityAlerts();
  const alert = await db.securityAlert.findFirstOrThrow({
    where: { actorId: player.id, rule: 'ADMIN_ACCESS_DENIED' },
  });
  assert.ok(alert.eventIds.length >= 3);
  assert.equal(await db.securityAlert.count({ where: { dedupeKey: alert.dedupeKey } }), 1);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: player.id } })).suspendedAt, null);
  const detail = await admin.agent.get(`/api/admin/alerts/${alert.id}`);
  assert.ok(detail.body.events.length >= 3);
  assert.equal(
    (
      await post(admin, `/admin/alerts/${alert.id}/decision`, {
        state: 'RESOLVED',
        reason: 'Cannot resolve without acknowledgement.',
        confirmed: true,
      })
    ).status,
    409,
  );
  for (const state of ['ACKNOWLEDGED', 'RESOLVED'])
    assert.equal(
      (
        await post(admin, `/admin/alerts/${alert.id}/decision`, {
          state,
          reason: 'Local authorization tests caused these events; no abuse established.',
          confirmed: true,
        })
      ).status,
      201,
    );
  assert.equal((await admin.agent.get(`/api/admin/alerts/${alert.id}`)).body.history.length, 2);
});
test('audit pagination is read-only, CSRF is enforced and health only exposes measured state', async () => {
  const result = await admin.agent.get('/api/admin/audit?q=ACCOUNT_RESTRICTED');
  assert.equal(result.status, 200);
  assert.ok(result.body.items.length > 0);
  assert.ok(result.body.items[0].reason);
  assert.equal(result.body.pageSize, 20);
  assert.ok((await admin.agent.get('/api/admin/audit')).body.items.length <= 20);
  assert.equal((await admin.agent.get('/api/admin/audit?page=0')).status, 400);
  assert.equal(
    (
      await admin.agent
        .post(`/api/admin/users/${player.id}/restriction`)
        .set('Origin', origin)
        .send({ restricted: true, reason: 'Missing CSRF must be rejected.', confirmed: true })
    ).status,
    403,
  );
  assert.equal((await post(admin, `/admin/audit/${result.body.items[0].id}`, {})).status, 404);
  const event = await db.adminDecision.findFirstOrThrow();
  await assert.rejects(
    db.adminDecision.update({ where: { id: event.id }, data: { reason: 'Tamper with recorded decision.' } }),
  );
  const health = await admin.agent.get('/api/admin/health');
  assert.equal(health.body.database, 'Query succeeded');
  assert.equal(health.body.exports, 'Disabled');
  assert.ok(health.body.alertWorker.lastSuccessAt);
  assert.equal('securityScore' in health.body, false);
});
test('local bootstrap grants only an exact verified account, revokes sessions and protects last usable admin', async () => {
  const local = await client('PLAYER');
  const run = promisify(execFile);
  await run(
    process.execPath,
    [
      '--import',
      'tsx',
      'src/admin-bootstrap.ts',
      'grant',
      local.email,
      'Explicit local test authorization.',
      '--confirm',
    ],
    { cwd: process.cwd(), windowsHide: true },
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: local.id } })).role, 'ADMIN');
  assert.equal(await db.session.count({ where: { userId: local.id } }), 0);
  // A second MFA-marked account without mobile verification is not usable admin access.
  await db.user.update({ where: { id: local.id }, data: { mfaEnabled: true, phoneVerifiedAt: null } });
  await assert.rejects(
    run(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/admin-bootstrap.ts',
        'revoke',
        admin.email,
        'Do not remove last MFA-ready administrator.',
        '--confirm',
      ],
      { cwd: process.cwd(), windowsHide: true },
    ),
  );
  await db.user.update({ where: { id: local.id }, data: { mfaEnabled: false, phoneVerifiedAt: new Date() } });
  await run(
    process.execPath,
    [
      '--import',
      'tsx',
      'src/admin-bootstrap.ts',
      'revoke',
      local.email,
      'Remove test grant after verification.',
      '--confirm',
    ],
    { cwd: process.cwd(), windowsHide: true },
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: local.id } })).role, 'PLAYER');
});
test('concurrent administrators cannot restrict one another and leave no usable administrator', async () => {
  const setup = await post(noMfa, '/auth/mfa/setup', { password });
  const verified = await post(noMfa, '/auth/mfa/verify', {
    code: await generate({ secret: setup.body.secret }),
  });
  assert.equal(verified.status, 201);
  noMfa.csrf = csrf(verified);
  const results = await Promise.all([
    post(admin, `/admin/users/${noMfa.id}/restriction`, {
      restricted: true,
      reason: 'Concurrent local authorization test.',
      confirmed: true,
    }),
    post(noMfa, `/admin/users/${admin.id}/restriction`, {
      restricted: true,
      reason: 'Concurrent local authorization test.',
      confirmed: true,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => [401, 403].includes(r.status)).length, 1);
  assert.equal(
    await db.user.count({
      where: { role: 'ADMIN', mfaEnabled: true, suspendedAt: null, verifiedAt: { not: null } },
    }),
    1,
  );
  const denied = results.find((r) => r.status !== 201)!;
  assert.equal(
    await db.auditEvent.count({
      where: { action: 'ADMIN_MUTATION_DENIED', correlationId: denied.body.correlationId, outcome: 'DENIED' },
    }),
    1,
  );
});
