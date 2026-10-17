import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { generate } from 'otplib';
import { createApp } from '../src/main.js';
import { db } from '../src/db.js';
import { passwordHash } from '../src/auth.controller.js';
import { phtDate } from '@larosentry/contracts';
import type { INestApplication } from '@nestjs/common';
let app: INestApplication;
const origin = 'http://127.0.0.1:5173',
  password = 'Scheduler-local-test-password-872';
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; id: string; email: string };
let owner: Client, player: Client, outsider: Client, staff: Client, admin: Client, unverified: Client;
let facilityId: string, courtId: string, otherCourt: string, bookingId: string;
const date = phtDate(new Date(Date.now() + 3 * 86400000));
const settings = {
  name: 'NOLTA court',
  surface: 'Hard',
  sport: 'Tennis',
  hourlyRate: 60000,
  capacity: 4,
  active: true,
  openMinute: 420,
  closeMinute: 1260,
  minDuration: 30,
  defaultDuration: 60,
  maxDuration: 180,
  startInterval: 30,
  confirmed: true,
  reason: 'Test scheduling setup',
};
const post = (c: Client, path: string, data: object = {}) =>
  c.agent.post(`/api${path}`).set('Origin', origin).set('X-CSRF-Token', c.csrf).send(data);
const csrf = (r: request.Response) =>
  (r.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith('ls_csrf='))!
    .split(';')[0]!
    .slice(8);
function input(hour = 9, duration = 45, id = courtId) {
  const startsAt = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+08:00`);
  return {
    courtId: id,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + duration * 60000).toISOString(),
    mode: 'BOOKING_ONLY',
    expectedGuests: 1,
    manual: true,
    reviewedTotal: duration * 1000,
    reviewedPolicy: 'Test cancellation policy',
    confirmed: true,
    reason: 'Test manual booking',
  };
}
async function client(role: string, mfa = true) {
  const email = `scheduler-${randomUUID()}@example.test`,
    user = await db.user.create({
      data: {
        email,
        nickname: role,
        passwordHash: await passwordHash(password),
        role,
        verifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        onboardingCompletedAt: new Date(),
      },
    });
  const agent = request.agent(app.getHttpServer());
  const login = await agent.post('/api/auth/login').set('Origin', origin).send({ email, password });
  assert.equal(login.status, 201);
  const c = { agent, csrf: csrf(login), id: user.id, email };
  if (mfa) {
    const setup = await post(c, '/auth/mfa/setup', { password });
    const verify = await post(c, '/auth/mfa/verify', { code: await generate({ secret: setup.body.secret }) });
    assert.equal(verify.status, 201);
    c.csrf = csrf(verify);
  }
  return c;
}
before(
  async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/larosentry_test_'))
      throw new Error('Isolated test database required');
    app = await createApp();
    owner = await client('FACILITY_OWNER');
    player = await client('PLAYER');
    outsider = await client('FACILITY_OWNER');
    staff = await client('FACILITY_STAFF');
    admin = await client('ADMIN');
    unverified = await client('FACILITY_OWNER', false);
    const f = await db.facility.create({
      data: {
        name: 'Scheduler fixture',
        slug: randomUUID(),
        area: 'Test',
        address: 'Fictional',
        description: 'Testing',
        latitude: 14,
        longitude: 121,
        amenities: [],
        status: 'PUBLISHED',
        demo: true,
        cancellationPolicy: 'Test cancellation policy',
        memberships: { create: { userId: owner.id, role: 'OWNER', permissions: ['BOOKINGS'] } },
      },
    });
    facilityId = f.id;
  },
  { timeout: 30000 },
);
after(async () => {
  await app?.close();
  await db.$disconnect();
});
test('scheduler court CRUD checks role, MFA, owner membership and CSRF; history survives deactivation', async () => {
  const body = { ...settings, facilityId };
  assert.equal(
    (await request(app.getHttpServer()).post('/api/scheduler/courts').set('Origin', origin).send(body))
      .status,
    401,
  );
  for (const c of [player, outsider, staff, admin, unverified])
    assert.equal((await post(c, '/scheduler/courts', body)).status, 403);
  assert.equal(
    (await owner.agent.post('/api/scheduler/courts').set('Origin', origin).send(body)).status,
    403,
  );
  const created = await post(owner, '/scheduler/courts', body);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  courtId = created.body.id;
  const second = await post(owner, '/scheduler/courts', { ...body, name: 'Court 2' });
  otherCourt = second.body.id;
  assert.equal(
    (await post(owner, `/scheduler/courts/${courtId}`, { ...settings, defaultDuration: 75 })).status,
    201,
  );
  assert.equal(
    (await post(owner, `/scheduler/courts/${courtId}`, { ...settings, minDuration: 90, defaultDuration: 60 }))
      .status,
    400,
  );
});
test('one shared schedule handles custom durations and same-day past slots without exposing customer data', async () => {
  for (const duration of [45, 75, 105]) {
    const result = await player.agent.get(
      `/api/scheduler/courts/${courtId}/schedule?date=${date}&duration=${duration}`,
    );
    assert.equal(result.status, 200);
    assert.equal(
      (new Date(result.body.slots[0].endsAt).getTime() - new Date(result.body.slots[0].startsAt).getTime()) /
        60000,
      duration,
    );
    const publicResult = await request(app.getHttpServer()).get(
      `/api/courts/${courtId}/availability?date=${date}&duration=${duration}`,
    );
    assert.deepEqual(publicResult.body.slots, result.body.slots);
  }
  assert.equal(
    (await player.agent.get(`/api/scheduler/courts/${courtId}/schedule?date=${date}&duration=15`)).status,
    400,
  );
  assert.equal(
    (await player.agent.get(`/api/scheduler/courts/${courtId}/schedule?date=${date}&manage=1`)).status,
    403,
  );
  assert.equal(
    (await outsider.agent.get(`/api/scheduler/courts/${courtId}/schedule?date=${date}&manage=1`)).status,
    403,
  );
  const today = await player.agent.get(`/api/scheduler/courts/${courtId}/schedule?date=${phtDate()}`);
  for (const slot of today.body.slots)
    if (new Date(slot.startsAt) <= new Date()) assert.equal(slot.status, 'PAST');
});
test('manual reservations are idempotent, concurrent overlaps are rejected and other courts remain available', async () => {
  const body = input();
  const key = randomUUID();
  const result = await post(owner, '/scheduler/reservations', body).set('Idempotency-Key', key);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  bookingId = result.body.id;
  assert.equal(
    (await post(owner, '/scheduler/reservations', body).set('Idempotency-Key', key)).body.id,
    bookingId,
  );
  assert.equal(
    (await post(player, '/scheduler/reservations', body).set('Idempotency-Key', randomUUID())).status,
    403,
  );
  assert.equal(
    (await post(player, '/scheduler/reservations', input(10)).set('Idempotency-Key', randomUUID())).status,
    403,
  );
  assert.equal(
    (
      await post(owner, '/scheduler/reservations', input(9, 45, otherCourt)).set(
        'Idempotency-Key',
        randomUUID(),
      )
    ).status,
    201,
  );
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      post(owner, '/scheduler/reservations', input(12, 75)).set('Idempotency-Key', randomUUID()),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  const userSchedule = await player.agent.get(
    `/api/scheduler/courts/${courtId}/schedule?date=${date}&duration=45`,
  );
  assert.equal(
    userSchedule.body.slots.find((s: { startsAt: string }) => s.startsAt === body.startsAt).status,
    'BOOKED',
  );
  assert.equal(userSchedule.body.allocations, undefined);
});
test('maintenance and date exceptions block bookings, reject displacement and can be reversed', async () => {
  const body = {
    date,
    openMinute: 420,
    closeMinute: 1260,
    closed: true,
    confirmed: true,
    reason: 'Full date closed',
  };
  assert.equal((await post(owner, `/scheduler/courts/${courtId}/exceptions`, body)).status, 409);
  const later = phtDate(new Date(Date.now() + 4 * 86400000));
  assert.equal(
    (await post(owner, `/scheduler/courts/${courtId}/exceptions`, { ...body, date: later })).status,
    201,
  );
  const closed = await player.agent.get(`/api/scheduler/courts/${courtId}/schedule?date=${later}`);
  assert(closed.body.slots.every((s: { status: string }) => s.status === 'CLOSED'));
  assert.equal(
    (await post(owner, `/scheduler/courts/${courtId}/exceptions`, { ...body, date: later, remove: true }))
      .status,
    201,
  );
  const time = input(15, 60);
  const closure = await post(owner, '/operations/closures', {
    courtId,
    startsAt: time.startsAt,
    endsAt: time.endsAt,
    reason: 'Maintenance',
  });
  assert.equal(closure.status, 201);
  assert.equal(
    (await post(owner, '/scheduler/reservations', time).set('Idempotency-Key', randomUUID())).status,
    409,
  );
  assert.equal((await post(owner, `/operations/closures/${closure.body.id}/reopen`)).status, 201);
  assert.equal(
    (await post(owner, '/scheduler/reservations', input(6)).set('Idempotency-Key', randomUUID())).status,
    400,
  );
});
test('rescheduling updates one reservation, failure preserves original allocation, cancellation releases it', async () => {
  const collision = await post(owner, `/scheduler/reservations/${bookingId}/change`, {
    ...input(12, 75),
    action: 'RESCHEDULE',
  });
  assert.equal(collision.status, 409);
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).startsAt.toISOString(),
    input().startsAt,
  );
  const move = await post(owner, `/scheduler/reservations/${bookingId}/change`, {
    ...input(10, 105, otherCourt),
    action: 'RESCHEDULE',
  });
  assert.equal(move.status, 201, JSON.stringify(move.body));
  const row = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
  assert.equal(row.courtId, otherCourt);
  assert.equal(row.endsAt.getTime() - row.startsAt.getTime(), 105 * 60000);
  assert.equal(
    (
      await post(owner, `/scheduler/courts/${otherCourt}`, {
        ...settings,
        name: 'Court 2',
        defaultDuration: 90,
        active: false,
      })
    ).status,
    409,
  );
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).endsAt.getTime(),
    row.endsAt.getTime(),
  );
  assert.equal(
    (await post(owner, `/scheduler/courts/${otherCourt}`, { ...settings, name: 'Court 2' })).status,
    201,
  );
  assert.equal(
    (
      await post(owner, `/scheduler/reservations/${bookingId}/change`, {
        confirmed: true,
        reason: 'Customer requested cancellation',
        action: 'CANCEL',
      })
    ).status,
    201,
  );
  assert.equal((await db.allocation.findUniqueOrThrow({ where: { bookingId } })).active, false);
});
test('player requests, private lists, filtering, profile updates and reset denials are enforced', async () => {
  const data = { ...input(17, 75), manual: false };
  const created = await post(player, '/scheduler/reservations', data).set('Idempotency-Key', randomUUID());
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'PENDING');
  assert.equal((await outsider.agent.get('/api/scheduler/reservations?manage=1')).body.total, 0);
  const own = await player.agent.get('/api/scheduler/reservations');
  assert.equal(own.body.total, 1);
  assert.equal(own.body.items[0].user.id, player.id);
  const filtered = await owner.agent.get(
    `/api/scheduler/reservations?manage=1&q=${created.body.reference}&status=PENDING`,
  );
  assert.equal(filtered.body.total, 1);
  assert.equal(
    (
      await post(owner, `/operations/bookings/${created.body.id}/decision`, {
        status: 'CONFIRMED',
        reason: 'Approved request',
      })
    ).status,
    201,
  );
  assert.equal((await post(player, `/bookings/${created.body.id}/cancel`)).status, 201);
  assert.equal(
    (await post(player, '/scheduler/profile', { nickname: 'Updated player', role: 'ADMIN' })).status,
    201,
  );
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: player.id } })).role, 'PLAYER');
  for (const c of [owner, player, staff, admin]) {
    assert.equal((await c.agent.get('/api/scheduler/demo-reset')).status, 403);
    assert.equal(
      (
        await post(c, '/scheduler/demo-reset', {
          confirmed: true,
          reason: 'Attempt reset',
          fingerprint: 'a'.repeat(64),
        })
      ).status,
      403,
    );
  }
  assert((await db.auditEvent.count({ where: { action: { startsWith: 'SCHEDULER_' } } })) >= 8);
});

test('court names, status and archival preserve scope and history without a surface requirement', async () => {
  const { surface: ignoredSurface, ...fields } = settings;
  void ignoredSurface;
  const created = await post(owner, '/scheduler/courts', {
    ...fields,
    name: '  Lifecycle   Court  ',
    facilityId,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal(created.body.name, 'Lifecycle Court');
  assert.equal(
    (await post(owner, '/scheduler/courts', { ...fields, name: ' lifecycle   court ', facilityId })).status,
    409,
  );
  for (const availabilityStatus of ['MAINTENANCE', 'UNAVAILABLE', 'AVAILABLE']) {
    const changed = await post(owner, `/scheduler/courts/${id}`, {
      ...fields,
      name: 'Lifecycle Court',
      availabilityStatus,
    });
    assert.equal(changed.status, 201, JSON.stringify(changed.body));
    assert.equal(changed.body.active, availabilityStatus === 'AVAILABLE');
    const schedule = await player.agent.get(`/api/scheduler/courts/${id}/schedule?date=${date}`);
    assert.equal(schedule.status, 200);
    assert.equal(schedule.body.rules.active, availabilityStatus === 'AVAILABLE');
    if (availabilityStatus !== 'AVAILABLE')
      assert(schedule.body.slots.every((s: { status: string }) => s.status !== 'AVAILABLE'));
  }
  for (const c of [player, staff, outsider, admin, unverified])
    assert.equal(
      (
        await post(c, `/scheduler/courts/${id}/archive`, {
          confirmed: true,
          reason: 'Unauthorized archive attempt',
        })
      ).status,
      403,
    );
  assert.equal(
    (
      await owner.agent
        .post(`/api/scheduler/courts/${id}/archive`)
        .set('Origin', origin)
        .send({ confirmed: true, reason: 'Missing CSRF' })
    ).status,
    403,
  );
  assert.equal(
    (await post(owner, `/scheduler/courts/${id}/archive`, { confirmed: false, reason: 'Not confirmed' }))
      .status,
    400,
  );
  assert.equal(
    (
      await post(owner, `/scheduler/courts/${id}/archive`, {
        confirmed: true,
        reason: 'Archive unused fictional court',
      })
    ).status,
    201,
  );
  const retained = await db.court.findUniqueOrThrow({ where: { id } });
  assert(retained.archivedAt);
  assert.equal(retained.active, false);
  assert(!(await player.agent.get('/api/scheduler/courts')).body.some((c: { id: string }) => c.id === id));
  assert.equal((await player.agent.get(`/api/scheduler/courts/${id}/schedule?date=${date}`)).status, 404);
  assert.equal(
    await db.auditEvent.count({
      where: { action: 'SCHEDULER_COURT_ARCHIVED', resourceId: id, actorId: owner.id },
    }),
    1,
  );
});

test('court changes reject displaced reservations and removal preserves financial and reservation history', async () => {
  const created = await post(owner, '/scheduler/courts', {
    ...settings,
    name: 'Protected history court',
    facilityId,
  });
  const id = created.body.id;
  const reservation = await post(owner, '/scheduler/reservations', input(10, 60, id)).set(
    'Idempotency-Key',
    randomUUID(),
  );
  assert.equal(reservation.status, 201, JSON.stringify(reservation.body));
  for (const update of [
    { active: false },
    { availabilityStatus: 'MAINTENANCE' },
    { openMinute: 720 },
    { minDuration: 90, defaultDuration: 90 },
  ]) {
    const changed = await post(owner, `/scheduler/courts/${id}`, {
      ...settings,
      name: 'Protected history court',
      ...update,
    });
    assert.equal(changed.status, 409, JSON.stringify(changed.body));
    assert(changed.body.message.includes(reservation.body.reference));
  }
  assert.equal(
    (
      await post(owner, `/scheduler/courts/${id}/archive`, {
        confirmed: true,
        reason: 'Must reject active reservation',
      })
    ).status,
    409,
  );
  const cancel = await post(owner, `/scheduler/reservations/${reservation.body.id}/change`, {
    action: 'CANCEL',
    confirmed: true,
    reason: 'Resolve fixture reservation first',
  });
  assert.equal(cancel.status, 201, JSON.stringify(cancel.body));
  const archived = await post(owner, `/scheduler/courts/${id}/archive`, {
    confirmed: true,
    reason: 'Retain cancelled history during archive',
  });
  assert.equal(archived.status, 201, JSON.stringify(archived.body));
  assert.equal(
    (await db.booking.findUniqueOrThrow({ where: { id: reservation.body.id } })).status,
    'CANCELLED',
  );
  assert((await db.bookingHistory.count({ where: { bookingId: reservation.body.id } })) >= 2);
  const filtered = await owner.agent.get(
    `/api/scheduler/reservations?manage=1&q=${reservation.body.id}&facilityId=${facilityId}`,
  );
  assert.equal(filtered.body.total, 1);
  assert(filtered.body.items[0].createdAt);
});
