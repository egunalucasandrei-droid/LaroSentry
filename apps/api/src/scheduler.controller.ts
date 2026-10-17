import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { bookingSchema, intervalError, phtDate } from '@larosentry/contracts';
import { db, type Tx } from './db.js';
import { account, administrator, parse, privileged, uuid, type AuthRequest } from './http.js';
import { audit } from './audit.js';
import { lockBooking, notifyBooking, quote } from './bookings.controller.js';
import { courtSchedule, rulesFor } from './scheduling.js';
import { demoAccessAllowed, demoModeFor } from './demo-access.js';
import { hash } from './crypto.js';

const confirmation = z.object({ confirmed: z.literal(true), reason: z.string().trim().min(3).max(300) });
const courtFields = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .transform((v) => v.replace(/\s+/g, ' ')),
    sport: z
      .enum(['Tennis', 'Basketball', 'Badminton', 'Volleyball', 'Futsal', 'Pickleball'])
      .default('Tennis'),
    hourlyRate: z.number().int().min(0).max(10000000),
    capacity: z.number().int().min(1).max(40),
    active: z.boolean(),
    availabilityStatus: z.enum(['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE']).optional(),
    openMinute: z.number().int().min(0).max(1439),
    closeMinute: z.number().int().min(1).max(1440),
    minDuration: z.number().int().min(1).max(1440),
    defaultDuration: z.number().int().min(1).max(1440),
    maxDuration: z.number().int().min(1).max(1440).nullable(),
    startInterval: z.number().int().min(1).max(1440),
  })
  .refine(
    (v) =>
      v.openMinute < v.closeMinute &&
      v.minDuration <= v.defaultDuration &&
      v.defaultDuration <= (v.maxDuration ?? 1440) &&
      v.defaultDuration <= v.closeMinute - v.openMinute,
    'Check opening hours and duration limits.',
  );
async function host(req: AuthRequest, facilityId?: string, tx: Tx = db) {
  const user = await privileged(req, facilityId, 'BOOKINGS');
  if (!['ADMIN', 'FACILITY_OWNER'].includes(user.role))
    throw new ForbiddenException('Admin or court host access required.');
  if (facilityId) {
    const member = await tx.membership.findUnique({
      where: { userId_facilityId: { userId: user.id, facilityId } },
    });
    if (member?.role !== 'OWNER')
      throw new ForbiddenException('Owner membership required for scheduler controls.');
  }
  return user;
}
const owned = (id: string) => ({ memberships: { some: { userId: id, role: 'OWNER' } } });
async function uniqueCourtName(tx: Tx, facilityId: string, name: string, except?: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${facilityId}, 0))::text`;
  const courts = await tx.court.findMany({
    where: { facilityId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (
    courts.some(
      (c) => c.id !== except && c.name.trim().replace(/\s+/g, ' ').toLowerCase() === name.toLowerCase(),
    )
  )
    throw new ConflictException('A court with this name already exists at this facility.');
}
function courtData(input: z.infer<typeof courtFields>) {
  const availabilityStatus = input.availabilityStatus ?? (input.active ? 'AVAILABLE' : 'UNAVAILABLE');
  return { ...input, availabilityStatus, active: availabilityStatus === 'AVAILABLE' };
}
const courtInclude = { facility: true };
const bookingInclude = {
  court: { include: { facility: true } },
  user: { select: { id: true, nickname: true } },
};
async function release(tx: Tx, id: string, actorId: string) {
  await tx.allocation.updateMany({ where: { bookingId: id }, data: { active: false } });
  await tx.checkInToken.updateMany({ where: { bookingId: id }, data: { revoked: true } });
  await tx.gameInvitation.updateMany({
    where: { bookingId: id, state: 'PENDING' },
    data: { state: 'REVOKED' },
  });
  await tx.rescheduleRequest.updateMany({
    where: { bookingId: id, state: 'PENDING' },
    data: { state: 'CANCELLED', decidedAt: new Date(), decidedBy: actorId },
  });
}
@Controller('scheduler')
export class SchedulerController {
  @Post('profile') async profile(@Req() req: AuthRequest, @Body() body: unknown) {
    const user = account(req);
    const { nickname } = parse(z.object({ nickname: z.string().trim().min(2).max(40) }), body);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { nickname } });
      await audit(tx, user.id, 'PROFILE_UPDATED', user.id);
    });
    return { message: 'Profile saved.' };
  }
  @Get('courts') async courts(@Req() req: AuthRequest, @Query('manage') manage?: string) {
    const user = account(req);
    if (manage === '1') await host(req);
    return db.court.findMany({
      where:
        manage === '1'
          ? { archivedAt: null, facility: owned(user.id) }
          : { archivedAt: null, facility: { status: 'PUBLISHED' } },
      include: courtInclude,
      orderBy: [{ facility: { name: 'asc' } }, { name: 'asc' }],
      take: 500,
    });
  }
  @Get('facilities') async facilities(@Req() req: AuthRequest) {
    const user = await host(req);
    return db.facility.findMany({
      where: owned(user.id),
      select: { id: true, name: true, openHour: true, closeHour: true },
      take: 100,
    });
  }
  @Get('courts/:id/schedule') async schedule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query() raw: Record<string, string>,
  ) {
    account(req);
    const q = parse(
      z.object({
        date: z.iso.date(),
        duration: z.coerce.number().int().min(1).max(1440).optional(),
        manage: z.enum(['0', '1']).default('0'),
        ignoreBookingId: z.uuid().optional(),
      }),
      raw,
    );
    const court = await db.court.findUnique({ where: { id: uuid(id) }, include: courtInclude });
    if (!court) throw new NotFoundException();
    if (q.manage === '1') await host(req, court.facilityId);
    else if (court.archivedAt || court.facility.status !== 'PUBLISHED') throw new NotFoundException();
    if (q.ignoreBookingId) {
      if (q.manage !== '1') throw new ForbiddenException();
      const booking = await db.booking.findUnique({
        where: { id: q.ignoreBookingId },
        include: { court: true },
      });
      if (!booking || booking.court.facilityId !== court.facilityId) throw new ForbiddenException();
      await host(req, booking.court.facilityId);
    }
    return courtSchedule(court, q.date, q.duration, q.manage === '1', q.ignoreBookingId);
  }
  @Post('courts') async addCourt(@Req() req: AuthRequest, @Body() body: unknown) {
    const { facilityId } = parse(z.object({ facilityId: z.uuid() }), body);
    const input = parse(courtFields, body),
      decision = parse(confirmation, body);
    const user = await host(req, facilityId);
    return db.$transaction(async (tx) => {
      await uniqueCourtName(tx, facilityId, input.name);
      const court = await tx.court.create({ data: { ...courtData(input), facilityId } });
      await audit(
        tx,
        user.id,
        'SCHEDULER_COURT_CREATED',
        court.id,
        'SUCCESS',
        req.correlationId,
        decision.reason,
      );
      return court;
    });
  }
  @Post('courts/:id') async editCourt(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    uuid(id);
    const input = parse(courtFields, body),
      decision = parse(confirmation, body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${id}::uuid FOR UPDATE`;
      const court = await tx.court.findUnique({ where: { id }, include: courtInclude });
      if (!court || court.archivedAt) throw new NotFoundException();
      const user = await host(req, court.facilityId, tx);
      await uniqueCourtName(tx, court.facilityId, input.name, id);
      const data = courtData(input);
      const upcoming = await tx.booking.findMany({
        where: { courtId: id, status: 'CONFIRMED', endsAt: { gt: new Date() } },
        select: { reference: true, startsAt: true, endsAt: true },
      });
      for (const booking of upcoming) {
        const rules = await rulesFor(tx, { ...court, ...data }, phtDate(booking.startsAt));
        if (intervalError(booking.startsAt, booking.endsAt, rules))
          throw new ConflictException(
            `Resolve upcoming reservation ${booking.reference} before changing court availability or scheduling rules. Existing reservations were not changed.`,
          );
      }
      const updated = await tx.court.update({ where: { id }, data });
      await audit(tx, user.id, 'SCHEDULER_COURT_UPDATED', id, 'SUCCESS', req.correlationId, decision.reason);
      return {
        ...updated,
        message:
          'Court settings saved. Existing reservations keep their original times; review them before closing the court.',
      };
    });
  }
  @Post('courts/:id/archive') async archiveCourt(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    uuid(id);
    const decision = parse(confirmation, body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${id}::uuid FOR UPDATE`;
      const court = await tx.court.findUnique({ where: { id } });
      if (!court || court.archivedAt) throw new NotFoundException();
      const user = await host(req, court.facilityId, tx);
      const upcoming = await tx.booking.count({
        where: {
          courtId: id,
          status: { in: ['PENDING', 'CONFIRMED'] },
          endsAt: { gt: new Date() },
          demoArchivedAt: null,
        },
      });
      const blocks = await tx.allocation.count({
        where: { courtId: id, active: true, endsAt: { gt: new Date() } },
      });
      if (upcoming || blocks)
        throw new ConflictException(
          `Resolve ${upcoming} upcoming reservations and ${blocks} active schedule blocks before archiving. Nothing was deleted.`,
        );
      await tx.court.update({
        where: { id },
        data: { active: false, availabilityStatus: 'UNAVAILABLE', archivedAt: new Date() },
      });
      await audit(tx, user.id, 'SCHEDULER_COURT_ARCHIVED', id, 'SUCCESS', req.correlationId, decision.reason);
      return { message: 'Court archived. All reservation history, maintenance and settings are preserved.' };
    });
  }
  @Get('courts/:id/exceptions') async exceptions(@Req() req: AuthRequest, @Param('id') id: string) {
    const court = await db.court.findUnique({ where: { id: uuid(id) } });
    if (!court) throw new NotFoundException();
    await host(req, court.facilityId);
    return db.scheduleException.findMany({ where: { courtId: id }, orderBy: { date: 'desc' }, take: 100 });
  }
  @Post('courts/:id/exceptions') async exception(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    uuid(id);
    const input = parse(
      z
        .object({
          date: z.iso.date(),
          openMinute: z.number().int().min(0).max(1439),
          closeMinute: z.number().int().min(1).max(1440),
          closed: z.boolean(),
          remove: z.boolean().default(false),
        })
        .refine((v) => v.openMinute < v.closeMinute),
      body,
    );
    const decision = parse(confirmation, body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${id}::uuid FOR UPDATE`;
      const court = await tx.court.findUnique({ where: { id }, include: courtInclude });
      if (!court) throw new NotFoundException();
      const user = await host(req, court.facilityId, tx);
      const { remove, ...values } = input;
      const midnight = new Date(`${input.date}T00:00:00+08:00`).getTime();
      const bookings = await tx.booking.findMany({
        where: {
          courtId: id,
          status: 'CONFIRMED',
          startsAt: { gte: new Date(midnight), lt: new Date(midnight + 86400000) },
        },
      });
      const open = remove ? (court.openMinute ?? court.facility.openHour * 60) : input.openMinute;
      const close = remove ? (court.closeMinute ?? court.facility.closeHour * 60) : input.closeMinute;
      if (
        bookings.some(
          (b) =>
            (!remove && input.closed) ||
            b.startsAt.getTime() < midnight + open * 60000 ||
            b.endsAt.getTime() > midnight + close * 60000,
        )
      )
        throw new ConflictException(
          'This rule would displace a confirmed reservation. Reschedule or cancel it explicitly first.',
        );
      if (remove) await tx.scheduleException.deleteMany({ where: { courtId: id, date: input.date } });
      else
        await tx.scheduleException.upsert({
          where: { courtId_date: { courtId: id, date: input.date } },
          create: { ...values, courtId: id, reason: decision.reason },
          update: { ...values, reason: decision.reason },
        });
      await audit(
        tx,
        user.id,
        remove ? 'SCHEDULE_EXCEPTION_REMOVED' : 'SCHEDULE_EXCEPTION_SAVED',
        id,
        'SUCCESS',
        req.correlationId,
        decision.reason,
      );
      return { message: 'Schedule exception saved.' };
    });
  }
  @Get('reservations') async reservations(@Req() req: AuthRequest, @Query() raw: Record<string, string>) {
    const user = account(req);
    const q = parse(
      z.object({
        manage: z.enum(['0', '1']).default('0'),
        q: z.string().max(100).default(''),
        status: z
          .enum(['', 'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'REJECTED', 'NO_SHOW'])
          .default(''),
        date: z.iso.date().optional(),
        courtId: z.uuid().optional(),
        facilityId: z.uuid().optional(),
        period: z.enum(['', 'upcoming', 'past', 'cancelled']).default(''),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      }),
      raw,
    );
    if (q.manage === '1') await host(req);
    const where = {
      demoArchivedAt: null,
      ...(q.manage === '1' ? { court: { facility: owned(user.id) } } : { userId: user.id }),
      ...(q.courtId ? { courtId: q.courtId } : {}),
      ...(q.facilityId
        ? { court: { facilityId: q.facilityId, ...(q.manage === '1' ? { facility: owned(user.id) } : {}) } }
        : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.period === 'upcoming'
        ? { startsAt: { gt: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } }
        : q.period === 'past'
          ? { endsAt: { lte: new Date() } }
          : q.period === 'cancelled'
            ? { status: 'CANCELLED' }
            : {}),
      ...(q.date
        ? {
            startsAt: {
              gte: new Date(`${q.date}T00:00:00+08:00`),
              lt: new Date(new Date(`${q.date}T00:00:00+08:00`).getTime() + 86400000),
            },
          }
        : {}),
      OR: [
        ...(z.uuid().safeParse(q.q).success ? [{ id: q.q }] : []),
        { reference: { contains: q.q, mode: 'insensitive' as const } },
        { user: { nickname: { contains: q.q, mode: 'insensitive' as const } } },
        { court: { name: { contains: q.q, mode: 'insensitive' as const } } },
      ],
    };
    const [items, total] = await Promise.all([
      db.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * 20,
        take: 20,
      }),
      db.booking.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: 20 };
  }
  @Post('reservations') async reserve(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const user = account(req);
    const data = parse(bookingSchema, body);
    const extra = parse(
      z.object({
        manual: z.boolean().default(false),
        customerEmail: z.email().max(254).optional(),
        reviewedTotal: z.number().int().min(0),
        reviewedPolicy: z.string().max(5000),
      }),
      body,
    );
    const decision = parse(confirmation, body);
    uuid(key);
    // Replays must still satisfy the current resource authorization.
    if (extra.manual) {
      const court = await db.court.findUnique({ where: { id: data.courtId } });
      if (!court) throw new NotFoundException();
      await host(req, court.facilityId);
    }
    const fingerprint = hash(JSON.stringify({ data, extra }));
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id + ':' + key},0))::text`;
      const prior = await tx.idempotencyRecord.findUnique({
        where: { userId_key: { userId: user.id, key } },
      });
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new ConflictException('Submission key already used for different details.');
        return tx.booking.findUniqueOrThrow({ where: { id: prior.resourceId } });
      }
      const price = await quote(tx, data);
      if (price.totalCentavos !== extra.reviewedTotal || price.policy !== extra.reviewedPolicy)
        throw new ConflictException('Price or policy changed. Refresh and review this reservation again.');
      if (extra.manual) await host(req, price.court.facilityId, tx);
      let customerId = user.id;
      if (extra.manual && extra.customerEmail) {
        const customer = await tx.user.findUnique({ where: { email: extra.customerEmail.toLowerCase() } });
        if (!customer || (!customer.verifiedAt && !demoModeFor(customer)) || customer.suspendedAt)
          throw new BadRequestException('Use the exact email of an active verified account.');
        customerId = customer.id;
      }
      const status = extra.manual ? 'CONFIRMED' : 'PENDING';
      const booking = await tx.booking.create({
        data: {
          reference: `LS-${randomBytes(6).toString('hex').toUpperCase()}`,
          userId: customerId,
          courtId: data.courtId,
          startsAt: price.startsAt,
          endsAt: price.endsAt,
          mode: 'BOOKING_ONLY',
          expectedGuests: 1,
          totalCentavos: price.totalCentavos,
          hourlyRateSnapshot: price.hourlyRate,
          policySnapshot: price.policy,
          status,
          source: 'NOLTA',
          expiresAt: new Date(Math.min(Date.now() + 86400000, price.startsAt.getTime())),
          history: { create: { status, actorId: user.id, reason: decision.reason } },
          ...(extra.manual
            ? {
                allocation: {
                  create: {
                    courtId: data.courtId,
                    startsAt: price.startsAt,
                    endsAt: price.endsAt,
                    kind: 'BOOKING',
                  },
                },
              }
            : {}),
        },
      });
      await tx.idempotencyRecord.create({
        data: { userId: user.id, key, fingerprint, resourceId: booking.id },
      });
      await notifyBooking(tx, customerId, booking.id, status);
      await audit(
        tx,
        user.id,
        extra.manual ? 'SCHEDULER_MANUAL_RESERVATION' : 'SCHEDULER_REQUESTED',
        booking.id,
        'SUCCESS',
        req.correlationId,
        decision.reason,
      );
      return booking;
    });
  }
  @Post('reservations/:id/change') async change(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    uuid(id);
    const decision = parse(confirmation, body);
    const action = parse(z.object({ action: z.enum(['CANCEL', 'RESCHEDULE']) }), body);
    return db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const booking = await tx.booking.findUnique({
        where: { id },
        include: { court: true, checkIn: true, paymentRecords: true },
      });
      if (!booking || booking.demoArchivedAt) throw new NotFoundException();
      const user = await host(req, booking.court.facilityId, tx);
      if (
        !['PENDING', 'CONFIRMED'].includes(booking.status) ||
        booking.startsAt <= new Date() ||
        booking.checkIn
      )
        throw new ConflictException('Only upcoming unchecked reservations can be changed.');
      if (action.action === 'CANCEL') {
        await release(tx, id, user.id);
        await tx.booking.update({ where: { id }, data: { status: 'CANCELLED', published: false } });
      } else {
        const input = parse(bookingSchema, body);
        const destination = await tx.court.findUnique({ where: { id: input.courtId } });
        if (!destination || destination.facilityId !== booking.court.facilityId)
          throw new ForbiddenException('Reschedule within the same authorized facility.');
        await host(req, destination.facilityId, tx);
        const price = await quote(tx, { ...input, expectedGuests: booking.expectedGuests }, id);
        if (booking.paymentRecords.length && price.totalCentavos !== booking.totalCentavos)
          throw new ConflictException('A paid reservation can only move to an equal-price slot.');
        if (booking.status === 'CONFIRMED')
          await tx.allocation.update({
            where: { bookingId: id },
            data: { courtId: input.courtId, startsAt: price.startsAt, endsAt: price.endsAt },
          });
        await tx.booking.update({
          where: { id },
          data: {
            courtId: input.courtId,
            startsAt: price.startsAt,
            endsAt: price.endsAt,
            totalCentavos: price.totalCentavos,
            hourlyRateSnapshot: price.hourlyRate,
            policySnapshot: price.policy,
            expiresAt: new Date(Math.min(Date.now() + 86400000, price.startsAt.getTime())),
          },
        });
        await tx.checkInToken.updateMany({ where: { bookingId: id }, data: { revoked: true } });
        await tx.rescheduleRequest.updateMany({
          where: { bookingId: id, state: 'PENDING' },
          data: { state: 'CANCELLED', decidedAt: new Date(), decidedBy: user.id },
        });
      }
      await tx.bookingHistory.create({
        data: {
          bookingId: id,
          status: action.action === 'CANCEL' ? 'CANCELLED' : booking.status,
          actorId: user.id,
          reason: decision.reason,
        },
      });
      await notifyBooking(tx, booking.userId, id, action.action === 'CANCEL' ? 'CANCELLED' : 'RESCHEDULED');
      await audit(
        tx,
        user.id,
        `SCHEDULER_${action.action}`,
        id,
        'SUCCESS',
        req.correlationId,
        decision.reason,
      );
      return { message: 'Reservation updated. Previous QR codes are revoked.' };
    });
  }
  @Get('demo-reset') async resetPreview(@Req() req: AuthRequest) {
    const user = await administrator(req);
    if (!demoAccessAllowed(user))
      throw new ForbiddenException('Reset is available only to the named local demo administrator.');
    const rows = await db.booking.findMany({
      where: {
        source: 'NOLTA',
        demoArchivedAt: null,
        court: { facility: { demo: true, ...owned(user.id) } },
      },
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    return {
      count: rows.length,
      fingerprint: hash(JSON.stringify(rows)),
      message:
        'Archives NOLTA demo reservations in your assigned fictional facilities, releases booking slots and removes them from active user/activity lists. Immutable history and financial records are preserved. Courts, maintenance, accounts and settings are retained.',
    };
  }
  @Post('demo-reset') async reset(@Req() req: AuthRequest, @Body() body: unknown) {
    const user = await administrator(req);
    if (!demoAccessAllowed(user)) throw new ForbiddenException('Local demo administrator required.');
    const decision = parse(confirmation, body),
      { fingerprint } = parse(z.object({ fingerprint: z.string().length(64) }), body);
    return db.$transaction(async (tx) => {
      const courts = await tx.court.findMany({
        where: { facility: { demo: true, ...owned(user.id) } },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      for (const court of courts)
        await tx.$queryRaw`SELECT id FROM "Court" WHERE id=${court.id}::uuid FOR UPDATE`;
      const rows = await tx.booking.findMany({
        where: { source: 'NOLTA', demoArchivedAt: null, courtId: { in: courts.map((c) => c.id) } },
        orderBy: { id: 'asc' },
        select: { id: true, updatedAt: true },
      });
      if (hash(JSON.stringify(rows)) !== fingerprint)
        throw new ConflictException('Reservations changed. Review the reset again.');
      for (const row of rows) {
        await lockBooking(tx, row.id);
        await release(tx, row.id, user.id);
        await tx.booking.update({
          where: { id: row.id },
          data: { demoArchivedAt: new Date(), status: 'CANCELLED', published: false },
        });
        await tx.bookingHistory.create({
          data: {
            bookingId: row.id,
            status: 'CANCELLED',
            actorId: user.id,
            reason: `Local demo reset: ${decision.reason}`,
          },
        });
      }
      await audit(
        tx,
        user.id,
        'SCHEDULER_DEMO_RESET',
        undefined,
        'SUCCESS',
        req.correlationId,
        decision.reason,
      );
      return {
        message: `${rows.length} demo reservations archived. Courts, maintenance and history preserved.`,
      };
    });
  }
}
