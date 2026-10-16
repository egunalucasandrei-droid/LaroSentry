import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { generate } from 'otplib';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';
import { db } from '../src/db.js';
import { passwordHash } from '../src/auth.controller.js';
import { verificationFixture } from './verification-fixture.js';
let app: INestApplication;
const origin = 'http://127.0.0.1:5173',
  password = 'Workspace-local-test-password-777';
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; id: string; email: string };
let admin: Client,
  owner: Client,
  other: Client,
  staff: Client,
  player: Client,
  cold: Client,
  candidate: Client;
let facilityId: string, otherId: string, bookingId: string, ownBooking: string, courtId: string;
const csrf = (r: request.Response) =>
  (r.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith('ls_csrf='))!
    .split(';')[0]!
    .slice(8);
const post = (c: Client, path: string, data: object = {}) =>
  c.agent.post(`/api${path}`).set('Origin', origin).set('X-CSRF-Token', c.csrf).send(data);
async function client(role: string, mfa = true) {
  const u = await db.user.create({
    data: {
      email: `workspace-${randomUUID()}@example.test`,
      nickname: role,
      role,
      passwordHash: await passwordHash(password),
      verifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    },
  });
  const agent = request.agent(app.getHttpServer());
  const r = await agent.post('/api/auth/login').set('Origin', origin).send({ email: u.email, password });
  assert.equal(r.status, 201);
  const c = { agent, csrf: csrf(r), id: u.id, email: u.email };
  if (mfa) {
    const setup = await post(c, '/auth/mfa/setup', { password });
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
      throw new Error('Isolated test database required');
    app = await createApp();
    admin = await client('ADMIN');
    owner = await client('FACILITY_OWNER');
    other = await client('FACILITY_OWNER');
    staff = await client('FACILITY_STAFF');
    player = await client('PLAYER');
    cold = await client('FACILITY_OWNER', false);
    candidate = await client('PLAYER');
    async function facility(id: string) {
      return db.facility.create({
        data: {
          name: `Workspace ${randomUUID()}`,
          slug: randomUUID(),
          area: 'Fixture area',
          address: 'Fictional test address',
          description: 'A fictional test facility for role access.',
          latitude: 14.6,
          longitude: 121,
          amenities: [],
          status: 'PUBLISHED',
          openHour: 6,
          closeHour: 22,
          cancellationPolicy: 'Test policy only.',
          courts: { create: { name: 'Court one', sport: 'Tennis', hourlyRate: 50000, capacity: 4 } },
          memberships: {
            create: { userId: id, role: 'OWNER', permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'] },
          },
        },
        include: { courts: true },
      });
    }
    const f = await facility(owner.id),
      o = await facility(other.id);
    facilityId = f.id;
    otherId = o.id;
    courtId = f.courts[0]!.id;
    await db.membership.createMany({
      data: [
        { userId: staff.id, facilityId, role: 'STAFF', permissions: ['BOOKINGS'] },
        { userId: cold.id, facilityId, role: 'OWNER', permissions: [] },
      ],
    });
    const startsAt = new Date(Date.now() + 3 * 86400000),
      endsAt = new Date(startsAt.getTime() + 3600000);
    async function booking(userId: string) {
      return db.booking.create({
        data: {
          reference: `WS-${randomUUID()}`,
          userId,
          courtId,
          startsAt,
          endsAt,
          status: 'CONFIRMED',
          mode: 'BOOKING_ONLY',
          expectedGuests: 1,
          totalCentavos: 50000,
          hourlyRateSnapshot: 50000,
          policySnapshot: 'Test policy only.',
          expiresAt: startsAt,
        },
      });
    }
    bookingId = (await booking(player.id)).id;
    ownBooking = (await booking(owner.id)).id;
    await db.userReport.create({
      data: {
        reporterId: player.id,
        targetType: 'FACILITY',
        targetId: facilityId,
        category: 'Facility concern',
        details: 'Private narrative must never be disclosed to a facility owner.',
      },
    });
  },
  { timeout: 90000 },
);
after(async () => {
  await app.close();
  await db.$disconnect();
});
test('workspace discovery, MFA and direct owner/staff/admin API separation', async () => {
  const p = await player.agent.get('/api/workspaces');
  assert.equal(p.body.owner, false);
  assert.equal(p.body.staff, false);
  assert.equal(p.body.player, true);
  for (const c of [player, staff, other])
    assert.equal((await c.agent.get('/api/workspaces/owner/facilities/' + facilityId)).status, 403);
  for (const c of [player, owner])
    assert.equal((await c.agent.get('/api/workspaces/staff/bookings')).status, 403);
  for (const c of [player, owner, staff])
    for (const route of ['facilities', 'bookings', 'payments', 'bookings/' + bookingId])
      assert.equal((await c.agent.get('/api/admin/' + route)).status, 403);
  assert.equal((await cold.agent.get('/api/workspaces/owner/overview')).status, 403);
  assert.equal(
    (
      await post(player, '/workspaces/owner/facilities/' + facilityId, {
        confirmed: true,
        reason: 'Unauthorized update attempt',
        description: 'Should never change this facility.',
        address: 'Wrong address',
        amenities: [],
      })
    ).status,
    403,
  );
  assert.equal((await player.agent.get('/api/bookings/' + bookingId)).status, 200);
  assert.equal((await other.agent.get('/api/bookings/' + bookingId)).status, 404);
});
test('owner updates only their facility; report privacy and scoped activity work', async () => {
  const edited = await post(owner, '/workspaces/owner/facilities/' + facilityId, {
    confirmed: true,
    reason: 'Updated facility information',
    description: 'An updated fictional facility description.',
    address: 'Updated fictional test address',
    amenities: ['Parking'],
  });
  assert.equal(edited.status, 201);
  assert.equal(
    (
      await post(owner, '/workspaces/owner/facilities/' + otherId, {
        confirmed: true,
        reason: 'Attempt unrelated edit',
        description: 'Not permitted to change this facility.',
        address: 'Wrong address',
        amenities: [],
      })
    ).status,
    403,
  );
  assert.equal((await owner.agent.get('/api/workspaces/owner/bookings?facilityId=' + otherId)).status, 403);
  const reports = await owner.agent.get('/api/workspaces/owner/reports');
  assert.equal(reports.status, 200);
  assert.equal(reports.body.items.length, 1);
  assert.equal(reports.body.items[0].details, undefined);
  assert.equal(reports.body.items[0].reporterId, undefined);
  const activity = await owner.agent.get('/api/workspaces/owner/activity');
  assert.equal(activity.status, 200);
  assert.ok(activity.body.items.some((r: { action: string }) => r.action === 'FACILITY_DETAILS_UPDATED'));
  assert.equal((await owner.agent.get('/api/workspaces/owner/activity?q=unrelated-search')).body.total, 0);
  assert.equal((await owner.agent.get('/api/workspaces/owner/facilities?page=2')).body.items.length, 0);
  assert.equal(
    (await owner.agent.post(`/api/workspaces/owner/facilities/${facilityId}`).set('Origin', origin).send({}))
      .status,
    403,
  );
  const overview = await owner.agent.get('/api/workspaces/owner/overview');
  assert.equal(overview.status, 200);
  assert.ok(overview.body.metrics.some((m: { value: number }) => m.value > 0));
  assert.equal((await owner.agent.get('/api/workspaces/owner/facilities?q=not-a-match')).body.total, 0);
});
test('staff permission limits apply to list, mutations and direct cross-facility requests', async () => {
  assert.equal((await staff.agent.get('/api/workspaces/staff/bookings')).status, 200);
  assert.equal((await staff.agent.get('/api/workspaces/staff/payments')).status, 403);
  assert.equal((await staff.agent.get('/api/workspaces/staff/attendance')).status, 403);
  assert.equal((await staff.agent.get('/api/workspaces/staff/bookings?facilityId=' + otherId)).status, 403);
  assert.equal(
    (
      await post(staff, '/operations/bookings/' + bookingId + '/payment', {
        amountCentavos: 50000,
        method: 'CASH',
        reference: 'not-authorized',
      })
    ).status,
    403,
  );
  assert.equal(
    (await post(staff, '/operations/check-in', { facilityId: otherId, reference: 'unknown' })).status,
    403,
  );
  for (const section of ['staff', 'reviews', 'reports', 'activity'])
    assert.equal((await staff.agent.get('/api/workspaces/staff/' + section)).status, 403);
});
test('payments are scoped, redacted for booking-only staff, self-verification denied and oversight audited', async () => {
  assert.equal(
    (
      await post(owner, '/operations/bookings/' + ownBooking + '/payment', {
        amountCentavos: 50000,
        method: 'CASH',
        reference: 'self-payment',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(player, '/operations/bookings/' + bookingId + '/payment', {
        amountCentavos: 50000,
        method: 'CASH',
        reference: 'player-payment',
      })
    ).status,
    403,
  );
  const payment = await post(owner, '/operations/bookings/' + bookingId + '/payment', {
    amountCentavos: 50000,
    method: 'CASH',
    reference: 'authorized-receipt',
  });
  assert.equal(payment.status, 201);
  const legacy = await staff.agent.get('/api/operations/bookings');
  assert.equal(legacy.status, 200);
  assert.deepEqual(legacy.body.find((r: { id: string }) => r.id === bookingId).paymentRecords, []);
  const records = await owner.agent.get('/api/workspaces/owner/payments');
  assert.equal(records.body.total, 1);
  assert.equal(records.body.items[0].verifier, 'FACILITY_OWNER');
  const all = await admin.agent.get('/api/admin/payments');
  assert.equal(all.status, 200);
  assert.ok(all.body.items.some((r: { reference: string }) => r.reference === 'authorized-receipt'));
  assert.ok(!JSON.stringify(all.body).includes('passwordHash'));
  const detail = await admin.agent.get('/api/admin/bookings/' + bookingId);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.paymentRecords.length, 1);
  assert.ok(
    await db.auditEvent.findFirst({
      where: { actorId: owner.id, action: 'PAYMENT_RECORDED', reason: { contains: 'PAID' } },
    }),
  );
  assert.ok(await db.auditEvent.findFirst({ where: { actorId: admin.id, action: 'ADMIN_PAYMENTS_VIEWED' } }));
  assert.equal((await owner.agent.get('/api/workspaces/owner/activity?q=PAYMENT_RECORDED')).body.total, 1);
});
test('staff grants are facility-bound, reversible, cannot change ADMIN/owners and revoke sessions', async () => {
  const grant = {
    email: candidate.email,
    permissions: ['PAYMENTS', 'ATTENDANCE'],
    confirmed: true,
    reason: 'Authorized pilot staff member',
  };
  assert.equal(
    (await post(owner, '/workspaces/owner/facilities/' + facilityId + '/staff', { ...grant, role: 'ADMIN' }))
      .status,
    400,
  );
  assert.equal(
    (await post(staff, '/workspaces/owner/facilities/' + facilityId + '/staff', grant)).status,
    403,
  );
  assert.equal((await post(owner, '/workspaces/owner/facilities/' + otherId + '/staff', grant)).status, 403);
  assert.equal(
    (
      await post(owner, '/workspaces/owner/facilities/' + facilityId + '/staff', {
        ...grant,
        email: admin.email,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post(owner, '/workspaces/owner/facilities/' + facilityId + '/staff', {
        ...grant,
        email: owner.email,
      })
    ).status,
    409,
  );
  assert.equal(
    (await post(owner, '/workspaces/owner/facilities/' + facilityId + '/staff', grant)).status,
    201,
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: candidate.id } })).role, 'FACILITY_STAFF');
  assert.equal((await candidate.agent.get('/api/workspaces')).status, 401);
  const login = await candidate.agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: candidate.email, password });
  candidate.csrf = csrf(login);
  const access = await candidate.agent.get('/api/workspaces');
  assert.equal(access.body.staff, true);
  assert.equal(access.body.admin, false);
  assert.equal(
    (await candidate.agent.get('/api/workspaces/staff/payments')).status,
    403,
    'MFA still required after role grant',
  );
  assert.equal(
    (await post(owner, '/workspaces/owner/facilities/' + facilityId + '/staff', { ...grant, remove: true }))
      .status,
    201,
  );
  assert.equal(await db.membership.count({ where: { userId: candidate.id } }), 0);
  assert.ok(
    await db.auditEvent.findFirst({ where: { resourceId: facilityId, action: 'FACILITY_STAFF_REMOVED' } }),
  );
});
test('admin facility publication is reasoned, approval-gated and preserves booking history', async () => {
  const beforeCount = await db.booking.count({ where: { courtId } });
  assert.equal(
    (
      await post(owner, '/admin/facilities/' + facilityId + '/status', {
        status: 'UNPUBLISHED',
        confirmed: true,
        reason: 'Owner cannot moderate platform',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(admin, '/admin/facilities/' + facilityId + '/status', {
        status: 'UNPUBLISHED',
        confirmed: true,
        reason: 'Investigation into facility issues',
      })
    ).status,
    201,
  );
  assert.equal((await db.facility.findUniqueOrThrow({ where: { id: facilityId } })).status, 'UNPUBLISHED');
  assert.equal(await db.booking.count({ where: { courtId } }), beforeCount);
  assert.equal(
    (
      await post(admin, '/admin/facilities/' + facilityId + '/status', {
        status: 'PUBLISHED',
        confirmed: true,
        reason: 'Cannot bypass application approval',
      })
    ).status,
    409,
  );
  await db.facilityApplication.create({ data: { facilityId, applicantId: owner.id, state: 'APPROVED' } });
  assert.equal(
    (
      await post(admin, '/admin/facilities/' + facilityId + '/status', {
        status: 'PUBLISHED',
        confirmed: true,
        reason: 'Issue reviewed and listing restored',
      })
    ).status,
    201,
  );
  assert.equal((await admin.agent.get('/api/admin/facilities?page=1')).status, 200);
  assert.ok(
    await db.adminDecision.findFirst({ where: { targetId: facilityId, action: 'FACILITY_UNPUBLISHED' } }),
  );
});
test('application approval grants facility ownership to staff while preserving their staff assignment', async () => {
  const application = await verificationFixture((path, body) => post(staff, path, body), {
    name: 'Approved staff facility',
    area: 'Test district',
    address: 'Fictional approved test address',
    description: 'A test facility submitted through the application process.',
    latitude: 14.6,
    longitude: 121,
    openHour: 6,
    closeHour: 22,
    cancellationPolicy: 'Cancellation policy for fictional test only.',
    courtName: 'Test court',
    sport: 'Tennis',
    hourlyRate: 50000,
    capacity: 4,
    confirmed: true,
  });
  assert.equal(application.status, 201);
  assert.equal(
    (
      await post(admin, '/admin/applications/' + application.body.id + '/decision', {
        action: 'START_REVIEW',
        confirmed: true,
        reason: 'Starting the local fixture evidence review',
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await post(admin, '/admin/applications/' + application.body.id + '/decision', {
        action: 'APPROVE',
        confirmed: true,
        reason: 'Application information reviewed for pilot',
        identityReviewed: true,
        facilityReviewed: true,
      })
    ).status,
    201,
  );
  const updated = await db.user.findUniqueOrThrow({ where: { id: staff.id } });
  assert.equal(updated.role, 'FACILITY_OWNER');
  assert.equal(await db.membership.count({ where: { userId: staff.id, role: 'STAFF' } }), 1);
  assert.equal(await db.membership.count({ where: { userId: staff.id, role: 'OWNER' } }), 1);
  assert.equal((await staff.agent.get('/api/workspaces')).status, 401);
});
