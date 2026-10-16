import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { db } from './db.js';
import { account, administrator, parse, privileged, type AuthRequest, uuid } from './http.js';
import { lockBooking, notifyBooking } from './bookings.controller.js';
import { hash, token } from './crypto.js';
import { audit } from './audit.js';
import { courtSchedule } from './scheduling.js';
@ApiTags('Facility operations and audit')
@Controller()
export class OperationsController {
  @Get('operations/courts/:id/schedule') async schedule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('duration') duration?: string,
  ) {
    parse(z.iso.date(), date);
    const court = await db.court.findUnique({ where: { id: uuid(id) }, include: { facility: true } });
    if (!court) throw new NotFoundException('Court not found.');
    await privileged(req, court.facilityId, 'BOOKINGS');
    return courtSchedule(
      court,
      date,
      duration ? parse(z.coerce.number().int().min(1).max(1440), duration) : undefined,
      true,
    );
  }
  @Get('management') async management(@Req() req: AuthRequest) {
    const user = account(req);
    if (!['ADMIN', 'FACILITY_OWNER'].includes(user.role)) {
      await audit(db, user.id, 'MANAGEMENT_ACCESS_DENIED', undefined, 'DENIED', req.correlationId);
      throw new ForbiddenException('Admin or court host access required.');
    }
    if (user.role === 'ADMIN') {
      await administrator(req);
      const [applications, reports, alerts] = await Promise.all([
        db.facilityApplication.count({
          where: { state: { in: ['PENDING', 'UNDER_REVIEW', 'CLARIFICATION'] } },
        }),
        db.userReport.count({ where: { state: { in: ['OPEN', 'REVIEWING'] } } }),
        db.securityAlert.count({ where: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
      ]);
      return {
        scope: 'ADMIN',
        metrics: [
          { label: 'Applications awaiting a decision', value: applications },
          { label: 'Reports open or under review', value: reports },
          { label: 'Security alerts not resolved', value: alerts },
        ],
        courts: [],
      };
    }
    await privileged(req);
    const owned = { memberships: { some: { userId: user.id, role: 'OWNER' } } };
    const [courtCount, pending, confirmed, courts] = await Promise.all([
      db.court.count({ where: { facility: owned } }),
      db.booking.count({ where: { court: { facility: owned }, status: 'PENDING' } }),
      db.booking.count({ where: { court: { facility: owned }, status: 'CONFIRMED' } }),
      db.court.findMany({
        where: { facility: owned },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 12,
        select: {
          id: true,
          name: true,
          sport: true,
          hourlyRate: true,
          facility: { select: { name: true, status: true } },
        },
      }),
    ]);
    return {
      scope: 'HOST',
      metrics: [
        { label: 'Courts at facilities you own', value: courtCount },
        { label: 'Pending booking requests', value: pending },
        { label: 'Confirmed reservations', value: confirmed },
      ],
      courts,
    };
  }
  @Post('operations/bookings/:id/payment') async payment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const data = parse(
      z.object({
        amountCentavos: z.number().int().positive().max(100000000),
        method: z.enum(['CASH', 'BANK', 'EWALLET']),
        reference: z.string().trim().min(3).max(80),
      }),
      body,
    );
    const booking = await db.booking.findUnique({ where: { id: uuid(id) }, include: { court: true } });
    if (!booking) throw new NotFoundException();
    const user = await privileged(req, booking.court.facilityId, 'PAYMENTS');
    if (booking.userId === user.id)
      throw new ForbiddenException('Another authorized operator must verify your own payment.');
    return db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const current = await tx.booking.findUniqueOrThrow({ where: { id } });
      if (!['CONFIRMED', 'COMPLETED'].includes(current.status))
        throw new BadRequestException('Only confirmed or completed bookings can have payment recorded.');
      if (data.amountCentavos !== current.totalCentavos)
        throw new BadRequestException('This pilot supports one full payment only.');
      if (await tx.paymentRecord.findFirst({ where: { bookingId: id, state: 'PAID' } }))
        throw new ConflictException('A verified payment is already recorded.');
      const payment = await tx.paymentRecord.create({
        data: { ...data, bookingId: id, actorId: user.id, state: 'PAID' },
      });
      await audit(
        tx,
        user.id,
        'PAYMENT_RECORDED',
        payment.id,
        'SUCCESS',
        req.correlationId,
        'No verified full payment → PAID. External payment verified and recorded.',
      );
      await notifyBooking(tx, current.userId, id, 'PAYMENT_RECORDED');
      return { message: 'External payment recorded. LaroSentry did not transfer any money.' };
    });
  }
  @Post('bookings/:id/qr') async qr(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    uuid(id);
    return db.$transaction(async (tx) => {
      await lockBooking(tx, id);
      const booking = await tx.booking.findFirst({ where: { id, userId: user.id } });
      if (!booking) throw new NotFoundException();
      if (booking.status !== 'CONFIRMED' || booking.endsAt <= new Date())
        throw new BadRequestException('QR is available only for an upcoming confirmed booking.');
      if (await tx.checkIn.findUnique({ where: { bookingId: id } }))
        throw new ConflictException('Already checked in.');
      await tx.checkInToken.updateMany({ where: { bookingId: id }, data: { revoked: true } });
      const raw = token();
      await tx.checkInToken.create({ data: { bookingId: id, hash: hash(raw), expiresAt: booking.endsAt } });
      await audit(tx, user.id, 'QR_REISSUED', id);
      return { token: raw, expiresAt: booking.endsAt };
    });
  }
  @Post('operations/check-in') async checkIn(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = parse(
      z
        .object({
          facilityId: z.uuid(),
          token: z.string().min(20).max(100).optional(),
          reference: z.string().min(3).max(40).optional(),
        })
        .refine((v) => Boolean(v.token) !== Boolean(v.reference), 'Provide a QR token or reference.'),
      body,
    );
    const user = await privileged(req, data.facilityId, 'ATTENDANCE');
    const qr = data.token ? await db.checkInToken.findUnique({ where: { hash: hash(data.token) } }) : null;
    if (data.token && !qr) {
      await audit(db, user.id, 'QR_INVALID', undefined, 'DENIED');
      throw new NotFoundException('Invalid QR token.');
    }
    const booking = await db.booking.findUnique({
      where: qr ? { id: qr.bookingId } : { reference: data.reference! },
      include: { court: true },
    });
    if (!booking || booking.court.facilityId !== data.facilityId)
      throw new NotFoundException('Booking not found at this facility.');
    return db.$transaction(async (tx) => {
      await lockBooking(tx, booking.id);
      const current = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
      if (await tx.checkIn.findUnique({ where: { bookingId: booking.id } }))
        throw new ConflictException('Already checked in.');
      if (current.status !== 'CONFIRMED')
        throw new BadRequestException('Booking is cancelled, expired, or not confirmed.');
      if (Date.now() < current.startsAt.getTime() - 30 * 60000 || Date.now() >= current.endsAt.getTime())
        throw new BadRequestException('Outside check-in window: 30 minutes before start until booking end.');
      if (qr) {
        const valid = await tx.checkInToken.updateMany({
          where: { id: qr.id, revoked: false, expiresAt: { gt: new Date() } },
          data: { revoked: true },
        });
        if (!valid.count) throw new BadRequestException('QR token has expired or been replaced.');
      }
      await tx.checkIn.create({
        data: { bookingId: booking.id, actorId: user.id, method: qr ? 'QR' : 'MANUAL' },
      });
      await tx.checkInToken.updateMany({ where: { bookingId: booking.id }, data: { revoked: true } });
      await audit(tx, user.id, qr ? 'QR_CHECK_IN' : 'MANUAL_CHECK_IN', booking.id);
      return { message: 'Checked in. Booking remains confirmed until staff complete it after the end time.' };
    });
  }
  @Get('operations/audit') async activity(@Req() req: AuthRequest) {
    const user = await privileged(req);
    return db.auditEvent.findMany({ where: { actorId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
