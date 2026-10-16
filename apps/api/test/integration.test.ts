import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import request from 'supertest';
import { generate } from 'otplib';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';
import { db } from '../src/db.js';
import { decrypt } from '../src/crypto.js';
const origin = 'http://127.0.0.1:5173';
const password = 'test-only-long-passphrase-875';
const phoneNumber = () => '+639' + randomInt(100000000, 1000000000);
let app: INestApplication, facilityId: string, courtId: string;
type Client = { agent: ReturnType<typeof request.agent>; csrf: string; userId: string; email: string };
let player: Client, other: Client, owner: Client;
function mutation(client: Client, path: string, body: object = {}) {
  return client.agent.post(`/api${path}`).set('Origin', origin).set('X-CSRF-Token', client.csrf).send(body);
}
function cookie(response: request.Response) {
  return (response.headers['set-cookie'] as unknown as string[])
    .find((v) => v.startsWith('ls_csrf='))!
    .split(';')[0]!
    .slice(8);
}
async function newPlayer(prefix: string): Promise<Client> {
  const agent = request.agent(app.getHttpServer());
  const email = `${prefix}-${randomUUID()}@example.test`.toLowerCase();
  const registered = await agent.post('/api/auth/register').set('Origin', origin).send({
    email,
    password,
    nickname: prefix,
    adult: true,
    acceptedTerms: true,
    policyVersion: '2026-10-16-onboarding-draft-2',
    confirmPassword: password,
    phone: phoneNumber(),
    acceptedPrivacy: true,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const mail = await db.outbox.findFirstOrThrow({ where: { recipient: email } });
  const raw = decrypt(mail.encryptedBody).match(/#token=([\w-]+)/)![1]!;
  const verified = await agent.post('/api/auth/verify-email').set('Origin', origin).send({ token: raw });
  assert.equal(verified.status, 201);
  await db.user.update({
    where: { email },
    data: { phoneVerifiedAt: new Date(), onboardingCompletedAt: new Date() },
  });
  const login = await agent.post('/api/auth/login').set('Origin', origin).send({ email, password });
  assert.equal(login.status, 201, JSON.stringify(login.body));
  return { agent, csrf: cookie(login), userId: login.body.user.id, email };
}
function interval(day = 2, hour = 10) {
  const date = new Date(Date.now() + day * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  return {
    startsAt: new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+08:00`).toISOString(),
    endsAt: new Date(`${date}T${String(hour + 1).padStart(2, '0')}:00:00+08:00`).toISOString(),
  };
}
async function booking(client: Client, day = 2, hour = 10, key = randomUUID()) {
  const data = {
    courtId,
    ...interval(day, hour),
    mode: 'BOOKING_ONLY',
    expectedGuests: 2,
  };
  const quoted = await mutation(client, '/bookings/quote', data);
  if (quoted.status !== 201) return quoted;
  return mutation(client, '/bookings', { ...data, quoteFingerprint: quoted.body.quoteFingerprint }).set(
    'Idempotency-Key',
    key,
  );
}
before(
  async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/larosentry_test_'))
      throw new Error('Tests require a separate larosentry_test_* database.');
    app = await createApp();
    const facility = await db.facility.create({
      data: {
        slug: 'integration-court',
        name: 'Integration Demo',
        area: 'Quezon City',
        address: 'Fictional',
        description: 'Test fixture',
        latitude: 14.6,
        longitude: 121,
        amenities: ['Parking'],
        demo: true,
        status: 'PUBLISHED',
        cancellationPolicy: 'Cancel before start.',
        courts: { create: { name: 'Court 1', sport: 'Basketball', hourlyRate: 50000, capacity: 12 } },
      },
      include: { courts: true },
    });
    facilityId = facility.id;
    courtId = facility.courts[0]!.id;
    player = await newPlayer('Player');
    other = await newPlayer('Other');
    owner = await newPlayer('Owner');
    await db.user.update({ where: { id: owner.userId }, data: { role: 'FACILITY_OWNER' } });
    await db.membership.create({
      data: {
        userId: owner.userId,
        facilityId,
        role: 'OWNER',
        permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
      },
    });
  },
  { timeout: 30000 },
);
after(async () => {
  await app?.close();
  await db.$disconnect();
});
test('public discovery only lists published facilities and availability excludes identity', async () => {
  const result = await request(app.getHttpServer()).get('/api/facilities');
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].demo, true);
  const availability = await request(app.getHttpServer()).get(
    `/api/courts/${courtId}/availability?date=${interval().startsAt.slice(0, 10)}`,
  );
  assert.equal(availability.status, 200);
  assert.equal(JSON.stringify(availability.body).includes('userId'), false);
});
test('authentication requires adult declaration, verification, correct origin and CSRF', async () => {
  const agent = request.agent(app.getHttpServer());
  const email = `unverified-${randomUUID()}@example.test`;
  assert.equal(
    (
      await agent.post('/api/auth/register').set('Origin', origin).send({
        email,
        password,
        nickname: 'Adult',
        adult: false,
        acceptedTerms: true,
        policyVersion: '2026-10-16-onboarding-draft-2',
        confirmPassword: password,
        phone: phoneNumber(),
        acceptedPrivacy: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await agent.post('/api/auth/register').set('Origin', 'https://untrusted.example').send({
        email,
        password,
        nickname: 'Adult',
        adult: true,
        acceptedTerms: true,
        policyVersion: '2026-10-16-onboarding-draft-2',
        confirmPassword: password,
        phone: phoneNumber(),
        acceptedPrivacy: true,
      })
    ).status,
    403,
  );
  await agent.post('/api/auth/register').set('Origin', origin).send({
    email,
    password,
    nickname: 'Adult',
    adult: true,
    acceptedTerms: true,
    policyVersion: '2026-10-16-onboarding-draft-2',
    confirmPassword: password,
    phone: phoneNumber(),
    acceptedPrivacy: true,
  });
  assert.equal(
    (await agent.post('/api/auth/login').set('Origin', origin).send({ email, password })).status,
    201,
  );
  assert.equal((await agent.get('/api/bookings')).status, 403, 'Unverified sessions cannot use booking APIs');
  assert.equal(
    (
      await player.agent
        .post('/api/auth/preferences')
        .set('Origin', origin)
        .send({ publicProfile: false, emailNotifications: false })
    ).status,
    403,
  );
  const rows = await db.session.findMany({ where: { userId: player.userId } });
  assert.equal(rows[0]!.tokenHash.length, 64);
  assert.equal(rows[0]!.csrfHash.length, 64);
});
test('owner operations require actual TOTP and rotate the session', async () => {
  assert.equal((await owner.agent.get('/api/operations/bookings')).status, 403);
  const setup = await mutation(owner, '/auth/mfa/setup', { password });
  assert.equal(setup.status, 201, JSON.stringify(setup.body));
  const secret = setup.body.secret;
  const stored = await db.user.findUniqueOrThrow({ where: { id: owner.userId } });
  assert.notEqual(stored.mfaSecret, secret);
  const code = await generate({ secret });
  const verify = await mutation(owner, '/auth/mfa/verify', { code });
  assert.equal(verify.status, 201, JSON.stringify(verify.body));
  owner.csrf = cookie(verify);
  assert.equal(verify.body.recoveryCodes.length, 8);
  assert.equal((await owner.agent.get('/api/operations/bookings')).status, 200);
  assert.equal((await mutation(owner, '/auth/mfa/verify', { code })).status, 401);
});
test('booking idempotency survives retry; private objects and operation lists enforce ownership', async () => {
  const key = randomUUID();
  const first = await booking(player, 2, 10, key);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await booking(player, 2, 10, key);
  assert.equal(second.body.id, first.body.id);
  const different = await booking(player, 2, 11, key);
  assert.equal(different.status, 409);
  assert.equal((await other.agent.get(`/api/bookings/${first.body.id}`)).status, 404);
  const list = await other.agent.get('/api/bookings');
  assert.equal(list.body.length, 0);
  assert.equal((await player.agent.get('/api/operations/bookings')).status, 403);
  const hashes = await db.idempotencyRecord.findMany({ where: { userId: player.userId, key } });
  assert.equal(hashes.length, 1);
  const recovered = await player.agent.get(`/api/booking-submissions/${key}`);
  assert.equal(recovered.body.id, first.body.id);
  assert.equal((await other.agent.get(`/api/booking-submissions/${key}`)).status, 404);
});
test('PostgreSQL concurrent confirmation: exactly one succeeds; adjacent time succeeds', async () => {
  const a = await booking(player, 3, 10),
    b = await booking(other, 3, 10);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const results = await Promise.all(
    [a, b].map((r) =>
      mutation(owner, `/operations/bookings/${r.body.id}/decision`, {
        status: 'CONFIRMED',
        reason: 'Test approval',
      }),
    ),
  );
  assert.equal(
    results.filter((r) => r.status === 201).length,
    1,
    JSON.stringify(results.map((r) => ({ status: r.status, body: r.body }))),
  );
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  assert.equal(
    await db.allocation.count({
      where: { courtId, active: true, startsAt: new Date(interval(3, 10).startsAt) },
    }),
    1,
  );
  const adjacent = await booking(player, 3, 11);
  assert.equal(adjacent.status, 201);
  assert.equal(
    (
      await mutation(owner, `/operations/bookings/${adjacent.body.id}/decision`, {
        status: 'CONFIRMED',
        reason: 'Adjacent approval',
      })
    ).status,
    201,
  );
});
test('closures conflict atomically, invalid intervals fail, and status transitions are checked', async () => {
  assert.equal(
    (
      await mutation(owner, '/operations/closures', {
        courtId,
        ...interval(3, 10),
        reason: 'Conflicting maintenance',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await mutation(owner, '/operations/closures', {
        courtId,
        ...interval(4, 10),
        reason: 'Court maintenance',
      })
    ).status,
    201,
  );
  assert.equal((await booking(player, 4, 10)).status, 409);
  assert.equal(
    (
      await mutation(player, '/bookings/quote', {
        courtId,
        ...interval(4, 11),
        endsAt: interval(4, 11).startsAt,
        mode: 'BOOKING_ONLY',
        expectedGuests: 2,
      })
    ).status,
    400,
  );
  const pending = await booking(player, 5, 10);
  assert.equal(
    (
      await mutation(owner, `/operations/bookings/${pending.body.id}/decision`, {
        status: 'COMPLETED',
        reason: 'Too early completion',
      })
    ).status,
    400,
  );
});
test('payment records cannot self-verify, double-record, or bypass assigned facility permissions', async () => {
  const item = await booking(player, 6, 10);
  const id = item.body.id;
  const data = { amountCentavos: 50000, method: 'CASH', reference: 'TEST-RECEIPT-1' };
  assert.equal((await mutation(player, `/operations/bookings/${id}/payment`, data)).status, 403);
  assert.equal((await mutation(owner, `/operations/bookings/${id}/payment`, data)).status, 400);
  await mutation(owner, `/operations/bookings/${id}/decision`, {
    status: 'CONFIRMED',
    reason: 'Confirm for payment',
  });
  assert.equal((await mutation(owner, `/operations/bookings/${id}/payment`, data)).status, 201);
  assert.equal((await mutation(owner, `/operations/bookings/${id}/payment`, data)).status, 409);
  const unrelated = await db.facility.create({
    data: {
      slug: 'other-test',
      name: 'Other',
      area: 'Pasig',
      address: 'Demo',
      description: 'Demo',
      latitude: 14,
      longitude: 121,
      amenities: [],
      status: 'PUBLISHED',
      cancellationPolicy: 'Demo',
      courts: { create: { name: 'Other Court', sport: 'Tennis', hourlyRate: 50000, capacity: 4 } },
    },
    include: { courts: true },
  });
  assert.equal(
    (
      await mutation(owner, '/operations/closures', {
        courtId: unrelated.courts[0]!.id,
        ...interval(5, 15),
        reason: 'Cross facility',
      })
    ).status,
    403,
  );
});
test('QR hashes, replacement, cancellation and manual check-in restrictions', async () => {
  const item = await booking(player, 7, 10);
  const id = item.body.id;
  await mutation(owner, `/operations/bookings/${id}/decision`, {
    status: 'CONFIRMED',
    reason: 'QR approval',
  });
  const first = await mutation(player, `/bookings/${id}/qr`),
    second = await mutation(player, `/bookings/${id}/qr`);
  assert.equal(first.status, 201);
  assert.notEqual(first.body.token, second.body.token);
  assert.equal(await db.checkInToken.count({ where: { bookingId: id, revoked: false } }), 1);
  assert.equal(
    (await mutation(owner, '/operations/check-in', { facilityId, token: second.body.token })).status,
    400,
  );
  assert.equal((await mutation(other, `/bookings/${id}/qr`)).status, 404);
  assert.equal(
    (await mutation(player, '/operations/check-in', { facilityId, reference: item.body.reference })).status,
    403,
  );
  assert.equal((await mutation(player, `/bookings/${id}/cancel`)).status, 201);
  assert.equal(await db.checkInToken.count({ where: { bookingId: id, revoked: false } }), 0);
  assert.equal(await db.allocation.count({ where: { bookingId: id, active: true } }), 0);
});
test('a failed reschedule preserves the original allocation; an approved change revokes QR', async () => {
  const item = await booking(player, 8, 10);
  assert.equal(item.status, 201);
  const id = item.body.id;
  await mutation(owner, `/operations/bookings/${id}/decision`, {
    status: 'CONFIRMED',
    reason: 'Rescheduling test',
  });
  await mutation(player, `/bookings/${id}/qr`);
  const change = await mutation(player, `/bookings/${id}/reschedule`, {
    ...interval(9, 10),
    reason: 'Move to another day',
  });
  assert.equal(change.status, 201, JSON.stringify(change.body));
  assert.equal(
    (await mutation(other, `/bookings/${id}/reschedule`, { ...interval(9, 11), reason: 'Wrong user' }))
      .status,
    404,
  );
  await mutation(owner, '/operations/closures', {
    courtId,
    ...interval(9, 10),
    reason: 'A later maintenance block',
  });
  const failed = await mutation(owner, `/operations/reschedules/${change.body.id}/decision`, {
    approve: true,
    reason: 'Try conflicted time',
  });
  assert.equal(failed.status, 409);
  const preserved = await db.allocation.findUniqueOrThrow({ where: { bookingId: id } });
  assert.equal(preserved.startsAt.toISOString(), interval(8, 10).startsAt);
  assert.equal(preserved.active, true);
  assert.equal(await db.checkInToken.count({ where: { bookingId: id, revoked: false } }), 1);
  assert.equal(
    (
      await mutation(owner, `/operations/reschedules/${change.body.id}/decision`, {
        approve: false,
        reason: 'Choose another time',
      })
    ).status,
    201,
  );
  const next = await mutation(player, `/bookings/${id}/reschedule`, {
    ...interval(10, 10),
    reason: 'Available replacement',
  });
  assert.equal(
    (
      await mutation(owner, `/operations/reschedules/${next.body.id}/decision`, {
        approve: true,
        reason: 'Approve available time',
      })
    ).status,
    201,
  );
  const moved = await db.allocation.findUniqueOrThrow({ where: { bookingId: id } });
  assert.equal(moved.startsAt.toISOString(), interval(10, 10).startsAt);
  assert.equal(await db.checkInToken.count({ where: { bookingId: id, revoked: false } }), 0);
});
test('concurrent QR replay creates exactly one attendance event and does not complete booking', async () => {
  const item = await booking(player, 12, 10);
  const id = item.body.id;
  await mutation(owner, `/operations/bookings/${id}/decision`, {
    status: 'CONFIRMED',
    reason: 'Attendance test',
  });
  // Time fixture only: move an otherwise valid reservation into the current check-in window.
  const startsAt = new Date(Math.ceil(Date.now() / 1800000) * 1800000),
    endsAt = new Date(startsAt.getTime() + 3600000);
  await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id }, data: { startsAt, endsAt } });
    await tx.allocation.update({ where: { bookingId: id }, data: { startsAt, endsAt } });
  });
  const qr = await mutation(player, `/bookings/${id}/qr`);
  assert.equal(qr.status, 201);
  const results = await Promise.all(
    [1, 2].map(() => mutation(owner, '/operations/check-in', { facilityId, token: qr.body.token })),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  assert.equal(await db.checkIn.count({ where: { bookingId: id } }), 1);
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id } })).status, 'CONFIRMED');
});
test('changed price or policy requires a fresh review before a request can be committed', async () => {
  const data = { courtId, ...interval(14, 10), mode: 'BOOKING_ONLY', expectedGuests: 2 };
  const quoted = await mutation(player, '/bookings/quote', data);
  assert.equal(quoted.status, 201);
  await db.court.update({ where: { id: courtId }, data: { hourlyRate: 51000 } });
  const submitted = await mutation(player, '/bookings', {
    ...data,
    quoteFingerprint: quoted.body.quoteFingerprint,
  }).set('Idempotency-Key', randomUUID());
  assert.equal(submitted.status, 409);
  await db.court.update({ where: { id: courtId }, data: { hourlyRate: 50000 } });
});
test('runtime role cannot alter audit or verified financial history', async () => {
  const event = await db.auditEvent.findFirstOrThrow();
  await assert.rejects(db.auditEvent.delete({ where: { id: event.id } }));
  const payment = await db.paymentRecord.findFirstOrThrow();
  await assert.rejects(db.paymentRecord.update({ where: { id: payment.id }, data: { amountCentavos: 1 } }));
  const text = JSON.stringify(await db.auditEvent.findMany());
  assert.equal(text.includes(password), false);
  assert.equal(text.includes(player.csrf), false);
});
test('date/time discovery excludes closed intervals and reopening restores the result', async () => {
  const input = { courtId, ...interval(16, 10), reason: 'Availability filter fixture' };
  const closed = await mutation(owner, '/operations/closures', input);
  assert.equal(closed.status, 201);
  const day = new Date(new Date(input.startsAt).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const unavailable = await request(app.getHttpServer()).get(
    `/api/facilities?q=Integration&date=${day}&time=10:00`,
  );
  assert.equal(unavailable.body.total, 0);
  const adjacent = await request(app.getHttpServer()).get(
    `/api/facilities?q=Integration&date=${day}&time=11:00`,
  );
  assert.equal(adjacent.body.total, 1);
  assert.equal((await mutation(owner, `/operations/closures/${closed.body.id}/reopen`)).status, 201);
  const reopened = await request(app.getHttpServer()).get(
    `/api/facilities?q=Integration&date=${day}&time=10:00`,
  );
  assert.equal(reopened.body.total, 1);
});
test('recovery consumes a one-use token, revokes sessions, and suspension denies authentication', async () => {
  const recovery = await newPlayer('Recovery');
  await mutation(recovery, '/auth/forgot-password', { email: recovery.email });
  const mail = await db.outbox.findFirstOrThrow({
    where: { recipient: recovery.email, subject: 'Reset your LaroSentry password' },
  });
  const raw = decrypt(mail.encryptedBody).match(/#token=([\w-]+)/)![1]!;
  const reset = await mutation(recovery, '/auth/reset-password', {
    token: raw,
    password: 'a-new-long-test-passphrase',
  });
  assert.equal(reset.status, 201);
  assert.equal((await recovery.agent.get('/api/auth/me')).body.user, null);
  assert.equal(
    (await mutation(recovery, '/auth/reset-password', { token: raw, password: 'a-new-long-test-passphrase' }))
      .status,
    400,
  );
  await db.user.update({ where: { id: recovery.userId }, data: { suspendedAt: new Date() } });
  assert.equal(
    (
      await recovery.agent
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ email: recovery.email, password: 'a-new-long-test-passphrase' })
    ).status,
    401,
  );
});
test('session revocation and logout prevent continued API access', async () => {
  const fresh = await newPlayer('Revoke');
  const sessions = await fresh.agent.get('/api/auth/sessions');
  assert.equal(
    (
      await fresh.agent
        .delete(`/api/auth/sessions/${sessions.body[0].id}`)
        .set('Origin', origin)
        .set('X-CSRF-Token', fresh.csrf)
        .send({})
    ).status,
    200,
  );
  assert.equal((await fresh.agent.get('/api/bookings')).status, 401);
  const login = await fresh.agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: fresh.email, password });
  fresh.csrf = cookie(login);
  assert.equal((await mutation(fresh, '/auth/logout')).status, 201);
  assert.equal((await fresh.agent.get('/api/bookings')).status, 401);
});

async function confirmedGame(day: number, mode = 'PUBLIC') {
  const data = { courtId, ...interval(day, 10), mode, expectedGuests: 3 };
  const quote = await mutation(player, '/bookings/quote', data);
  assert.equal(quote.status, 201, JSON.stringify(quote.body));
  const created = await mutation(player, '/bookings', {
    ...data,
    quoteFingerprint: quote.body.quoteFingerprint,
  }).set('Idempotency-Key', randomUUID());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id: string = created.body.id;
  assert.equal(
    (
      await mutation(owner, `/operations/bookings/${id}/decision`, {
        status: 'CONFIRMED',
        reason: 'Community test fixture',
      })
    ).status,
    201,
  );
  return id;
}
test('public games require explicit publication and concurrent approvals cannot exceed capacity', async () => {
  const id = await confirmedGame(22),
    second = await newPlayer('Joiner');
  assert.equal((await request(app.getHttpServer()).get('/api/games')).status, 401);
  assert.equal((await other.agent.get(`/api/games/${id}`)).status, 404);
  const settings = { mode: 'PUBLIC', published: true, offlineGuests: 1, rules: 'Bring court shoes.' };
  assert.equal((await mutation(other, `/games/${id}/settings`, settings)).status, 404);
  assert.equal((await mutation(player, `/games/${id}/settings`, settings)).status, 201);
  const listed = await other.agent.get('/api/games');
  assert.equal(listed.body.find((g: { id: string }) => g.id === id).spaces, 1);
  const publicText = JSON.stringify(listed.body);
  assert.equal(publicText.includes(player.email), false);
  assert.equal(publicText.includes('participants'), false);
  assert.equal(publicText.includes('tokenHash'), false);
  assert.equal((await mutation(other, `/games/${id}/join`)).status, 201);
  assert.equal((await mutation(second, `/games/${id}/join`)).status, 201);
  assert.equal((await mutation(other, `/games/${id}/join`)).status, 409);
  assert.equal((await other.agent.get(`/api/games/${id}/roster`)).status, 404);
  const roster = (await player.agent.get(`/api/games/${id}/roster`)).body;
  const approvals = await Promise.all(
    roster.participants.map((p: { id: string }) =>
      mutation(player, `/games/${id}/participants/${p.id}`, { approve: true }),
    ),
  );
  assert.equal(approvals.filter((r: request.Response) => r.status === 201).length, 1);
  assert.equal(approvals.filter((r: request.Response) => r.status === 409).length, 1);
  assert.equal(await db.participation.count({ where: { bookingId: id, state: 'APPROVED' } }), 1);
  assert.equal(
    (await mutation(player, `/games/${id}/settings`, { ...settings, offlineGuests: 2 })).status,
    409,
  );
  assert.equal(
    (await mutation(player, `/games/${id}/settings`, { ...settings, published: false, mode: 'PRIVATE' }))
      .status,
    409,
  );
  assert.equal(
    (await mutation(player, `/games/${id}/settings`, { ...settings, published: false })).status,
    201,
  );
  assert.equal(
    (await other.agent.get('/api/games')).body.some((g: { id: string }) => g.id === id),
    false,
  );
  assert.equal((await other.agent.get(`/api/games/${id}`)).status, 200);
});
test('private invitations are recipient-bound, revocable, expiring and capacity-safe', async () => {
  const id = await confirmedGame(24, 'PRIVATE'),
    invited = await newPlayer('Invited');
  assert.equal(
    (
      await mutation(player, `/games/${id}/settings`, {
        mode: 'PRIVATE',
        published: false,
        offlineGuests: 1,
        rules: 'Private group',
      })
    ).status,
    201,
  );
  assert.equal((await other.agent.get(`/api/games/${id}`)).status, 404);
  assert.equal(
    (await other.agent.get('/api/games')).body.some((g: { id: string }) => g.id === id),
    false,
  );
  const unknown = await mutation(player, `/games/${id}/invite`, { email: 'unknown@example.test' });
  const known = await mutation(player, `/games/${id}/invite`, { email: other.email });
  assert.deepEqual(unknown.body, known.body);
  await mutation(player, `/games/${id}/invite`, { email: invited.email });
  const invitation = await db.gameInvitation.findFirstOrThrow({
    where: { bookingId: id, recipientId: other.userId },
  });
  const mail = await db.outbox.findFirstOrThrow({ where: { dedupeKey: `game-invitation:${invitation.id}` } });
  const raw = decrypt(mail.encryptedBody).match(/#token=([\w-]+)/)![1]!;
  assert.notEqual(invitation.tokenHash, raw);
  assert.equal(
    (await mutation(invited, `/game-invitations/${invitation.id}/respond`, { accept: true, token: raw }))
      .status,
    404,
  );
  assert.equal(
    (
      await mutation(other, `/game-invitations/${invitation.id}/respond`, {
        accept: true,
        token: 'x'.repeat(43),
      })
    ).status,
    409,
  );
  assert.equal((await other.agent.get(`/api/games/${id}`)).status, 200);
  const next = await db.gameInvitation.findFirstOrThrow({
    where: { bookingId: id, recipientId: invited.userId },
  });
  const accepted = await Promise.all([
    mutation(other, `/game-invitations/${invitation.id}/respond`, { accept: true, token: raw }),
    mutation(invited, `/game-invitations/${next.id}/respond`, { accept: true }),
  ]);
  assert.deepEqual(accepted.map((r) => r.status).sort(), [201, 409]);
  const used = accepted[0]!.status === 201 ? invitation : next,
    usedClient = accepted[0]!.status === 201 ? other : invited;
  assert.equal(
    (await mutation(usedClient, `/game-invitations/${used.id}/respond`, { accept: true })).status,
    409,
  );
  const unused = used.id === invitation.id ? next : invitation,
    unusedClient = used.id === invitation.id ? invited : other;
  await db.gameInvitation.update({
    where: { id: unused.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await mutation(unusedClient, `/game-invitations/${unused.id}/respond`, { accept: true })).status,
    409,
  );
  await mutation(player, `/games/${id}/invite`, { email: unusedClient.email });
  const replacement = await db.gameInvitation.findFirstOrThrow({
    where: { bookingId: id, recipientId: unusedClient.userId, state: 'PENDING' },
  });
  assert.equal((await mutation(player, `/game-invitations/${replacement.id}/revoke`)).status, 201);
  assert.equal(
    (await mutation(unusedClient, `/game-invitations/${replacement.id}/respond`, { accept: true })).status,
    409,
  );
});
test('blocking prevents new joins and invitations without removing existing participation', async () => {
  const id = await confirmedGame(26),
    joiner = await newPlayer('Blocking');
  await mutation(player, `/games/${id}/settings`, {
    mode: 'PUBLIC',
    published: true,
    offlineGuests: 0,
    rules: '',
  });
  assert.equal((await mutation(joiner, `/games/${id}/join`)).status, 201);
  assert.equal((await mutation(joiner, `/games/${id}/block`)).status, 201);
  assert.equal((await mutation(joiner, `/games/${id}/block`)).status, 201);
  const p = await db.participation.findUniqueOrThrow({
    where: { bookingId_userId: { bookingId: id, userId: joiner.userId } },
  });
  assert.equal(p.state, 'REQUESTED');
  assert.equal((await mutation(player, `/games/${id}/participants/${p.id}`, { approve: true })).status, 409);
  const privateId = await confirmedGame(27, 'PRIVATE');
  await mutation(player, `/games/${privateId}/invite`, { email: joiner.email });
  assert.equal(
    await db.gameInvitation.count({ where: { bookingId: privateId, recipientId: joiner.userId } }),
    0,
  );
  assert.equal((await mutation(joiner, `/games/${id}/leave`)).status, 201);
  assert.equal((await mutation(joiner, `/games/${id}/join`)).status, 404);
  assert.equal((await mutation(joiner, `/blocks/${player.userId}/remove`)).status, 201);
  assert.equal((await mutation(joiner, `/games/${id}/join`)).status, 201);
});
test('cancellation unpublishes games, revokes invitations and notifies participants', async () => {
  const id = await confirmedGame(29, 'PRIVATE');
  await mutation(player, `/games/${id}/invite`, { email: other.email });
  const invitation = await db.gameInvitation.findFirstOrThrow({
    where: { bookingId: id, recipientId: other.userId },
  });
  await mutation(other, `/game-invitations/${invitation.id}/respond`, { accept: true });
  await mutation(player, `/games/${id}/invite`, { email: owner.email });
  assert.equal((await mutation(player, `/bookings/${id}/cancel`)).status, 201);
  assert.equal(await db.gameInvitation.count({ where: { bookingId: id, state: 'PENDING' } }), 0);
  assert.equal((await other.agent.get(`/api/games/${id}`)).body.status, 'CANCELLED');
  assert.equal(
    await db.notification.count({
      where: { userId: other.userId, title: 'Game cancelled', href: `/app/games/${id}` },
    }),
    1,
  );
  assert.equal((await mutation(other, `/games/${id}/join`)).status, 409);
});

test('registration records the displayed policy version and rejects stale or missing acceptance', async () => {
  const policyApp = await createApp();
  const email = 'policy-' + randomUUID() + '@example.test';
  const data = {
    email,
    password,
    confirmPassword: password,
    phone: phoneNumber(),
    acceptedPrivacy: true,
    nickname: 'Policy test',
    adult: true,
    acceptedTerms: true,
  };
  for (const extra of [{}, { policyVersion: 'outdated' }]) {
    const response = await request(policyApp.getHttpServer())
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ ...data, ...extra });
    assert.equal(response.status, 400);
  }
  const response = await request(policyApp.getHttpServer())
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ ...data, policyVersion: '2026-10-16-onboarding-draft-2' });
  assert.equal(response.status, 201);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  assert.equal(user.termsVersion, '2026-10-16-onboarding-draft-2');
  assert.equal(user.privacyVersion, user.termsVersion);
  assert.ok(user.policyAcceptedAt);
  await policyApp.close();
});
