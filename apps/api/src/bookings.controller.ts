import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { bookingSchema, intervalError, phtDate, type BookingInput } from '@larosentry/contracts';
import { db, type Tx } from './db.js';
import { account, parse, privileged, type AuthRequest, uuid } from './http.js';
import { hash } from './crypto.js';
import { audit } from './audit.js';
import { rulesFor } from './scheduling.js';
import { queueMail } from './outbox.js';
const include = {
  court: { include: { facility: true } },
  history: { orderBy: { createdAt: 'asc' as const } },
  paymentRecords: true,
  checkIn: true,
  rescheduleRequests: { orderBy: { createdAt: 'desc' as const } },
};
export async function lockBooking(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${id}::uuid FOR UPDATE`;
}
export async function quote(tx: Tx, data: BookingInput, ignoreBookingId?: string) {
  // Serialize court-setting changes against transactional booking/confirmation quotes.
  await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${data.courtId}::uuid FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${data.courtId}::uuid FOR SHARE`;
  const court = await tx.court.findFirst({
    where: { id: data.courtId, active: true, facility: { status: 'PUBLISHED' } },
    include: { facility: true },
  });
  if (!court) throw new NotFoundException('Court is unavailable.');
  if (data.expectedGuests > court.capacity)
    throw new BadRequestException(`This court allows at most ${court.capacity} guests, including you.`);
  const startsAt = new Date(data.startsAt),
    endsAt = new Date(data.endsAt);
  const rules = await rulesFor(tx, court, phtDate(startsAt));
  const error = intervalError(startsAt, endsAt, rules);
  if (error) throw new BadRequestException(error);
  const totalCentavos = Math.round((court.hourlyRate * (endsAt.getTime() - startsAt.getTime())) / 3600000);
  const conflict = await tx.allocation.findFirst({
    where: {
      courtId: court.id,
      active: true,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(ignoreBookingId ? { OR: [{ bookingId: null }, { bookingId: { not: ignoreBookingId } }] } : {}),
    },
  });
  if (conflict) throw new ConflictException('This time is already allocated. Choose another time.');
  return {
    court,
    startsAt,
    endsAt,
    totalCentavos,
    hourlyRate: court.hourlyRate,
    policy: court.facility.cancellationPolicy,
  };
}
function quoteFingerprint(data: BookingInput, price: { totalCentavos: number; policy: string }) {
  return hash(JSON.stringify({ ...data, totalCentavos: price.totalCentavos, policy: price.policy }));
}
export async function notifyBooking(tx: Tx, userId: string, bookingId: string, status: string) {
  const players = await tx.participation.findMany({
    where: { bookingId, state: { in: ['APPROVED', 'REQUESTED'] } },
    select: { userId: true },
  });
  if (players.length)
    await tx.notification.createMany({
      data: players.map((p) => ({
        userId: p.userId,
        title: `Game ${status.toLowerCase().replaceAll('_', ' ')}`,
        href: `/app/games/${bookingId}`,
      })),
    });
  const notice = await tx.notification.create({
    data: {
      userId,
      title: `Booking ${status.toLowerCase().replaceAll('_', ' ')}`,
      href: `/app/bookings/${bookingId}`,
    },
  });
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailNotifications)
    await queueMail(
      tx,
      user.email,
      'LaroSentry booking update',
      'Your booking has an update. Sign in to LaroSentry to view the details.',
      `booking:${notice.id}`,
    );
}
@ApiTags('Bookings')
@Controller()
export class BookingsController {
  @Get('booking-submissions/:key') async recoverSubmission(
    @Req() req: AuthRequest,
    @Param('key') key: string,
  ) {
    const user = account(req);
    uuid(key);
    const record = await db.idempotencyRecord.findUnique({ where: { userId_key: { userId: user.id, key } } });
    if (!record)
      throw new NotFoundException(
        'No completed submission was found for this account. Review and retry your request.',
      );
    return { id: record.resourceId };
  }
  @Post('bookings/quote') async preview(@Body() body: unknown) {
    const data = parse(bookingSchema, body);
    const result = await quote(db, data);
    return {
      totalCentavos: result.totalCentavos,
      hourlyRate: result.hourlyRate,
      policy: result.policy,
      paymentArrangement: 'Pay at facility after confirmation. No payment is collected with a request.',
      quoteFingerprint: quoteFingerprint(data, result),
    };
  }
  @Post('bookings') async create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string,
  ) {
    const user = account(req);
    const data = parse(bookingSchema, body);
    const accepted = parse(z.object({ quoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/) }), body);
    parse(z.uuid(), key);
    const fingerprint = hash(JSON.stringify(data));
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id + ':' + key}, 0))::text`;
      const prior = await tx.idempotencyRecord.findUnique({
        where: { userId_key: { userId: user.id, key } },
      });
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new ConflictException('This submission key was used for different details.');
        return tx.booking.findUniqueOrThrow({ where: { id: prior.resourceId }, include });
      }
      const price = await quote(tx, data);
      if (accepted.quoteFingerprint !== quoteFingerprint(data, price))
        throw new ConflictException(
          'Your reviewed price or policy changed. Review the request again before submitting.',
        );
      const booking = await tx.booking.create({
        data: {
          reference: `LS-${randomBytes(6).toString('hex').toUpperCase()}`,
          userId: user.id,
          courtId: data.courtId,
          startsAt: price.startsAt,
          endsAt: price.endsAt,
          mode: data.mode,
          expectedGuests: data.expectedGuests,
          totalCentavos: price.totalCentavos,
          hourlyRateSnapshot: price.hourlyRate,
          policySnapshot: price.policy,
          expiresAt: new Date(Math.min(Date.now() + 86400000, price.startsAt.getTime())),
          history: {
            create: {
              status: 'PENDING',
              actorId: user.id,
              reason: 'Request submitted; slot is not reserved.',
            },
          },
        },
      });
      await tx.idempotencyRecord.create({
        data: { userId: user.id, key, fingerprint, resourceId: booking.id },
      });
      await notifyBooking(tx, user.id, booking.id, 'PENDING');
      await audit(tx, user.id, 'BOOKING_REQUESTED', booking.id, 'SUCCESS', req.correlationId);
      return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, include });
    });
  }
  @Get('bookings') list(@Req() req: AuthRequest) {
    return db.booking.findMany({
      where: { userId: account(req).id, demoArchivedAt: null },
      include,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
  }
  @Get('bookings/:id') async detail(@Req() req: AuthRequest, @Param('id') id: string) {
    const booking = await db.booking.findFirst({ where: { id: uuid(id), userId: account(req).id }, include });
    if (!booking) {
      await audit(db, account(req).id, 'ACCESS_DENIED', id, 'DENIED', req.correlationId);
      throw new NotFoundException('Booking not found.');
    }
    return booking;
  }
  @Post('bookings/:id/cancel') async cancel(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    uuid(id);
    return db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const booking = await tx.booking.findFirst({ where: { id, userId: user.id } });
      if (!booking) throw new NotFoundException('Booking not found.');
      if (!['PENDING', 'CONFIRMED'].includes(booking.status) || booking.startsAt <= new Date())
        throw new BadRequestException('This booking can no longer be cancelled here.');
      await tx.booking.update({ where: { id }, data: { status: 'CANCELLED', published: false } });
      await tx.gameInvitation.updateMany({
        where: { bookingId: id, state: 'PENDING' },
        data: { state: 'REVOKED' },
      });
      await tx.allocation.updateMany({ where: { bookingId: id }, data: { active: false } });
      await tx.checkInToken.updateMany({ where: { bookingId: id }, data: { revoked: true } });
      await tx.rescheduleRequest.updateMany({
        where: { bookingId: id, state: 'PENDING' },
        data: { state: 'CANCELLED', decidedAt: new Date(), decidedBy: user.id },
      });
      await tx.bookingHistory.create({ data: { bookingId: id, status: 'CANCELLED', actorId: user.id } });
      await notifyBooking(tx, user.id, id, 'CANCELLED');
      await audit(tx, user.id, 'BOOKING_CANCELLED', id);
      return {
        message: 'Booking cancelled. Any external payment requires a separate facility refund review.',
      };
    });
  }
  @Get('operations/facilities') async facilities(@Req() req: AuthRequest) {
    const user = await privileged(req);
    return db.membership.findMany({
      where: { userId: user.id },
      include: { facility: { include: { courts: true } } },
    });
  }
  @Post('bookings/:id/reschedule') async requestReschedule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = account(req);
    uuid(id);
    const data = parse(
      z.object({
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        reason: z.string().trim().min(3).max(300),
      }),
      body,
    );
    return db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const booking = await tx.booking.findFirst({ where: { id, userId: user.id } });
      if (!booking) throw new NotFoundException('Booking not found.');
      if (booking.status !== 'CONFIRMED' || booking.startsAt <= new Date())
        throw new BadRequestException('Only upcoming confirmed bookings can be rescheduled.');
      if (await tx.checkIn.findUnique({ where: { bookingId: id } }))
        throw new BadRequestException('Checked-in bookings cannot be rescheduled.');
      const price = await quote(
        tx,
        {
          courtId: booking.courtId,
          ...data,
          mode: booking.mode as BookingInput['mode'],
          expectedGuests: booking.expectedGuests,
        },
        id,
      );
      if (price.totalCentavos !== booking.totalCentavos || price.policy !== booking.policySnapshot)
        throw new BadRequestException('This pilot permits same-price, same-policy changes only.');
      const pending = await tx.rescheduleRequest.create({
        data: {
          bookingId: id,
          startsAt: price.startsAt,
          endsAt: price.endsAt,
          requestedBy: user.id,
          reason: data.reason,
        },
      });
      await audit(tx, user.id, 'RESCHEDULE_REQUESTED', pending.id);
      return {
        message: 'Change requested. Your original court time stays reserved until staff approve.',
        id: pending.id,
      };
    });
  }
  @Post('operations/reschedules/:id/decision') async decideReschedule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { approve, reason } = parse(
      z.object({ approve: z.boolean(), reason: z.string().trim().min(3).max(300) }),
      body,
    );
    const change = await db.rescheduleRequest.findUnique({
      where: { id: uuid(id) },
      include: { booking: { include: { court: true } } },
    });
    if (!change) throw new NotFoundException('Change request not found.');
    const user = await privileged(req, change.booking.court.facilityId, 'BOOKINGS');
    return db.$transaction(async (tx) => {
      await lockBooking(tx, change.bookingId);
      const current = await tx.rescheduleRequest.findUniqueOrThrow({ where: { id } });
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: change.bookingId } });
      if (current.state !== 'PENDING' || booking.status !== 'CONFIRMED' || booking.startsAt <= new Date())
        throw new ConflictException('This change is no longer available for a decision.');
      if (await tx.checkIn.findUnique({ where: { bookingId: booking.id } }))
        throw new ConflictException('This booking has checked in.');
      if (approve) {
        const price = await quote(
          tx,
          {
            courtId: booking.courtId,
            startsAt: current.startsAt.toISOString(),
            endsAt: current.endsAt.toISOString(),
            mode: booking.mode as BookingInput['mode'],
            expectedGuests: booking.expectedGuests,
          },
          booking.id,
        );
        if (price.totalCentavos !== booking.totalCentavos || price.policy !== booking.policySnapshot)
          throw new ConflictException('Price or policy changed; rescheduling cannot proceed.');
        // The one allocation row is atomically moved. A failed exclusion check rolls back to its original range.
        await tx.allocation.update({
          where: { bookingId: booking.id },
          data: { startsAt: current.startsAt, endsAt: current.endsAt },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: { startsAt: current.startsAt, endsAt: current.endsAt },
        });
        await tx.checkInToken.updateMany({ where: { bookingId: booking.id }, data: { revoked: true } });
        await tx.bookingHistory.create({
          data: {
            bookingId: booking.id,
            status: 'CONFIRMED',
            actorId: user.id,
            reason: `Schedule change approved: ${reason}`,
          },
        });
      }
      await tx.rescheduleRequest.update({
        where: { id },
        data: { state: approve ? 'APPROVED' : 'REJECTED', decidedBy: user.id, decidedAt: new Date() },
      });
      await notifyBooking(tx, booking.userId, booking.id, approve ? 'RESCHEDULED' : 'RESCHEDULE_REJECTED');
      await audit(tx, user.id, approve ? 'RESCHEDULE_APPROVED' : 'RESCHEDULE_REJECTED', id);
      return {
        message: approve
          ? 'Schedule changed. Previous QR codes are revoked.'
          : 'Change rejected. The original reservation is unchanged.',
      };
    });
  }
  @Get('operations/bookings') async operations(@Req() req: AuthRequest, @Query('status') status?: string) {
    const user = await privileged(req);
    const pending = status === undefined ? undefined : parse(z.literal('PENDING'), status);
    const memberships = await db.membership.findMany({ where: { userId: user.id } });
    const rows = await db.booking.findMany({
      where: {
        ...(pending ? { status: pending } : {}),
        court: {
          facility: {
            memberships: {
              some: {
                userId: user.id,
                OR: [{ role: 'OWNER' }, { permissions: { hasSome: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'] } }],
              },
            },
          },
        },
      },
      include,
      orderBy: { startsAt: 'asc' },
      take: 100,
    });
    return rows.map((row) => {
      const m = memberships.find((m) => m.facilityId === row.court.facilityId)!;
      return {
        ...row,
        paymentRecords: m.role === 'OWNER' || m.permissions.includes('PAYMENTS') ? row.paymentRecords : [],
        history: m.role === 'OWNER' || m.permissions.includes('BOOKINGS') ? row.history : [],
        rescheduleRequests:
          m.role === 'OWNER' || m.permissions.includes('BOOKINGS') ? row.rescheduleRequests : [],
      };
    });
  }
  @Post('operations/bookings/:id/decision') async decide(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const data = parse(
      z.object({
        status: z.enum(['CONFIRMED', 'REJECTED', 'COMPLETED', 'NO_SHOW']),
        reason: z.string().trim().min(3).max(300),
      }),
      body,
    );
    const booking = await db.booking.findUnique({ where: { id: uuid(id) }, include: { court: true } });
    if (!booking) throw new NotFoundException('Booking not found.');
    const user = await privileged(req, booking.court.facilityId, 'BOOKINGS');
    return db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const current = await tx.booking.findUniqueOrThrow({ where: { id } });
      if (['CONFIRMED', 'REJECTED'].includes(data.status)) {
        if (current.status !== 'PENDING' || current.expiresAt <= new Date())
          throw new ConflictException('This request is no longer pending or has expired.');
      } else if (current.status !== 'CONFIRMED' || current.endsAt > new Date())
        throw new BadRequestException(
          'Only confirmed bookings after their end time can be completed or marked no-show.',
        );
      if (data.status === 'CONFIRMED') {
        const price = await quote(tx, {
          ...current,
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt.toISOString(),
          mode: current.mode as BookingInput['mode'],
        });
        if (price.totalCentavos !== current.totalCentavos || price.policy !== current.policySnapshot)
          throw new ConflictException(
            'Price or policies changed. Reject this request and ask the player to submit a new one.',
          );
        await tx.allocation.create({
          data: {
            courtId: current.courtId,
            bookingId: id,
            startsAt: current.startsAt,
            endsAt: current.endsAt,
            kind: 'BOOKING',
          },
        });
        const affected = await tx.booking.findMany({
          where: {
            id: { not: id },
            courtId: current.courtId,
            status: 'PENDING',
            startsAt: { lt: current.endsAt },
            endsAt: { gt: current.startsAt },
          },
        });
        for (const other of affected) {
          await tx.booking.update({ where: { id: other.id }, data: { status: 'REJECTED' } });
          await tx.bookingHistory.create({
            data: {
              bookingId: other.id,
              status: 'REJECTED',
              actorId: user.id,
              reason: 'Another request was confirmed for this time.',
            },
          });
          await notifyBooking(tx, other.userId, other.id, 'REJECTED');
        }
      }
      await tx.booking.update({ where: { id }, data: { status: data.status } });
      await tx.bookingHistory.create({
        data: { bookingId: id, status: data.status, actorId: user.id, reason: data.reason },
      });
      await notifyBooking(tx, current.userId, id, data.status);
      await audit(tx, user.id, `BOOKING_${data.status}`, id);
      return { message: `Booking ${data.status.toLowerCase()}.` };
    });
  }
  @Post('operations/closures') async closure(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = parse(
      z.object({
        courtId: z.uuid(),
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        reason: z.string().trim().min(3).max(300),
      }),
      body,
    );
    const court = await db.court.findUnique({ where: { id: data.courtId } });
    if (!court) throw new NotFoundException();
    const user = await privileged(req, court.facilityId, 'BOOKINGS');
    const startsAt = new Date(data.startsAt),
      endsAt = new Date(data.endsAt);
    if (startsAt >= endsAt || startsAt < new Date() || endsAt.getTime() - startsAt.getTime() > 31 * 86400000)
      throw new BadRequestException('Choose a future closure of up to 31 days.');
    return db.$transaction(async (tx) => {
      const allocation = await tx.allocation.create({ data: { ...data, startsAt, endsAt, kind: 'CLOSURE' } });
      await audit(tx, user.id, 'COURT_CLOSED', allocation.id);
      return { message: 'Closure created.', id: allocation.id };
    });
  }
  @Get('operations/allocations') async allocations(@Req() req: AuthRequest) {
    const user = await privileged(req);
    return db.allocation.findMany({
      where: {
        active: true,
        endsAt: { gt: new Date() },
        court: {
          facility: {
            memberships: {
              some: { userId: user.id, OR: [{ role: 'OWNER' }, { permissions: { has: 'BOOKINGS' } }] },
            },
          },
        },
      },
      include: { court: { select: { name: true, facilityId: true } } },
      orderBy: { startsAt: 'asc' },
      take: 100,
    });
  }
  @Post('operations/closures/:id/reopen') async reopen(@Req() req: AuthRequest, @Param('id') id: string) {
    const allocation = await db.allocation.findUnique({ where: { id: uuid(id) }, include: { court: true } });
    if (!allocation || allocation.kind !== 'CLOSURE') throw new NotFoundException('Closure not found.');
    const user = await privileged(req, allocation.court.facilityId, 'BOOKINGS');
    await db.$transaction(async (tx) => {
      await tx.allocation.update({ where: { id }, data: { active: false } });
      await audit(tx, user.id, 'COURT_REOPENED', id);
    });
    return { message: 'Closure removed. New requests can use this time.' };
  }
}
