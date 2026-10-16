import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db.js';
import { account, administrator, parse, privileged, uuid, type AuthRequest } from './http.js';
import { audit } from './audit.js';
import { adminWriter, decision } from './admin-access.js';
import { demoAccessAllowed } from './demo-access.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  q: z.string().trim().max(100).default(''),
  facilityId: z.uuid().optional(),
  status: z.string().max(30).optional(),
});
const change = z.object({ confirmed: z.literal(true), reason: z.string().trim().min(10).max(1000) });
const permissions = ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'] as const;
const bookingSelect = {
  id: true,
  reference: true,
  status: true,
  startsAt: true,
  endsAt: true,
  totalCentavos: true,
  user: { select: { id: true, nickname: true } },
  court: { select: { id: true, name: true, facilityId: true, facility: { select: { name: true } } } },
} as const;
const paymentSelect = {
  id: true,
  amountCentavos: true,
  method: true,
  reference: true,
  state: true,
  actorId: true,
  createdAt: true,
  booking: { select: bookingSelect },
} as const;
export async function workspaceMemberships(req: AuthRequest, mode: string) {
  const user = await privileged(req);
  if (!['owner', 'staff'].includes(mode)) throw new NotFoundException();
  const memberships = await db.membership.findMany({
    where: { userId: user.id, role: mode === 'owner' ? 'OWNER' : 'STAFF' },
    include: { facility: { select: { id: true, name: true, status: true } } },
  });
  if (!memberships.length)
    throw new ForbiddenException(
      `No assigned ${mode} workspace. Apply for a facility or ask its owner for access.`,
    );
  return memberships;
}
@Controller()
export class WorkspacesController {
  @Get('workspaces') async access(@Req() req: AuthRequest) {
    const user = account(req);
    const memberships = await db.membership.findMany({
      where: { userId: user.id },
      select: { role: true, permissions: true },
    });
    return {
      player: true,
      owner:
        ['ADMIN', 'FACILITY_OWNER', 'FACILITY_STAFF'].includes(user.role) &&
        memberships.some((m) => m.role === 'OWNER'),
      staff:
        ['ADMIN', 'FACILITY_OWNER', 'FACILITY_STAFF'].includes(user.role) &&
        memberships.some((m) => m.role === 'STAFF'),
      admin: user.role === 'ADMIN',
      staffPermissions: [
        ...new Set(memberships.filter((m) => m.role === 'STAFF').flatMap((m) => m.permissions)),
      ],
    };
  }
  @Get('workspaces/:mode/:section') async records(
    @Req() req: AuthRequest,
    @Param('mode') mode: string,
    @Param('section') section: string,
    @Query() query: unknown,
  ) {
    const memberships = await workspaceMemberships(req, mode),
      q = parse(pageSchema, query);
    const permission =
      section === 'payments' ? 'PAYMENTS' : section === 'attendance' ? 'ATTENDANCE' : 'BOOKINGS';
    const allowed = memberships.filter((m) => mode === 'owner' || m.permissions.includes(permission));
    if (
      mode === 'staff' &&
      !['overview', 'bookings', 'attendance', 'payments', 'facilities'].includes(section)
    )
      throw new ForbiddenException('Owner access required.');
    if (q.facilityId && !allowed.some((m) => m.facilityId === q.facilityId))
      throw new ForbiddenException('Facility is not assigned for this operation.');
    const ids = allowed
      .filter((m) => !q.facilityId || m.facilityId === q.facilityId)
      .map((m) => m.facilityId);
    if (!ids.length && !['overview', 'facilities'].includes(section))
      throw new ForbiddenException('This staff permission has not been granted.');
    const facility = { facilityId: { in: ids } },
      bookingWhere: Prisma.BookingWhereInput = {
        court: facility,
        demoArchivedAt: null,
        ...(q.q ? { reference: { contains: q.q, mode: 'insensitive' } } : {}),
        ...(q.status
          ? {
              status: parse(
                z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW', 'EXPIRED']),
                q.status,
              ),
            }
          : {}),
      };
    const paging = { skip: (q.page - 1) * 20, take: 20 };
    const result = (items: unknown[], total: number) => ({ items, total, page: q.page, pageSize: 20 });
    if (section === 'overview') {
      const permitted = (p: string) =>
        memberships.filter((m) => mode === 'owner' || m.permissions.includes(p)).map((m) => m.facilityId);
      const today = new Date(
          new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) + 'T00:00:00+08:00',
        ),
        tomorrow = new Date(today.getTime() + 86400000);
      const [pending, todayCount, upcoming, paid] = await Promise.all([
        db.booking.count({
          where: {
            court: { facilityId: { in: permitted('BOOKINGS') } },
            status: 'PENDING',
            demoArchivedAt: null,
          },
        }),
        db.booking.count({
          where: {
            court: { facilityId: { in: permitted('BOOKINGS') } },
            startsAt: { gte: today, lt: tomorrow },
            demoArchivedAt: null,
          },
        }),
        db.booking.count({
          where: {
            court: { facilityId: { in: permitted('BOOKINGS') } },
            startsAt: { gte: new Date() },
            status: 'CONFIRMED',
            demoArchivedAt: null,
          },
        }),
        db.paymentRecord.count({
          where: { booking: { court: { facilityId: { in: permitted('PAYMENTS') } } }, state: 'PAID' },
        }),
      ]);
      return {
        memberships,
        metrics: [
          { label: 'Today’s bookings (PHT, all statuses)', value: todayCount },
          { label: 'Pending requests', value: pending },
          { label: 'Upcoming confirmed reservations', value: upcoming },
          { label: 'Recorded full payments', value: paid },
        ],
        checkedAt: new Date(),
      };
    }
    if (section === 'facilities') {
      const matches = memberships.filter(
        (m) =>
          (!q.facilityId || m.facilityId === q.facilityId) &&
          (!q.q || m.facility.name.toLowerCase().includes(q.q.toLowerCase())) &&
          (!q.status || m.facility.status === q.status),
      );
      return result(
        matches
          .slice(paging.skip, paging.skip + 20)
          .map((m) => ({ ...m.facility, permissions: m.permissions, membershipRole: m.role })),
        matches.length,
      );
    }
    if (section === 'bookings') {
      const [items, total] = await Promise.all([
        db.booking.findMany({
          where: bookingWhere,
          select: bookingSelect,
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          ...paging,
        }),
        db.booking.count({ where: bookingWhere }),
      ]);
      return result(items, total);
    }
    if (section === 'payments') {
      const where = { booking: bookingWhere };
      const [rows, total] = await Promise.all([
        db.paymentRecord.findMany({
          where,
          select: paymentSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...paging,
        }),
        db.paymentRecord.count({ where }),
      ]);
      const actors = await db.user.findMany({
        where: { id: { in: rows.map((p) => p.actorId) } },
        select: { id: true, nickname: true },
      });
      return result(
        rows.map((p) => ({
          ...p,
          verifier: actors.find((a) => a.id === p.actorId)?.nickname ?? 'Former operator',
        })),
        total,
      );
    }
    if (section === 'attendance') {
      const where = { booking: bookingWhere };
      const [items, total] = await Promise.all([
        db.checkIn.findMany({
          where,
          select: {
            id: true,
            method: true,
            createdAt: true,
            actorId: true,
            booking: { select: bookingSelect },
          },
          orderBy: { createdAt: 'desc' },
          ...paging,
        }),
        db.checkIn.count({ where }),
      ]);
      return result(items, total);
    }
    if (section === 'staff') {
      const where: Prisma.MembershipWhereInput = {
        facilityId: { in: ids },
        role: 'STAFF',
        ...(q.q
          ? {
              user: {
                OR: [
                  { nickname: { contains: q.q, mode: 'insensitive' } },
                  { email: { contains: q.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.membership.findMany({
          where,
          select: {
            id: true,
            facilityId: true,
            permissions: true,
            user: { select: { id: true, nickname: true, email: true, suspendedAt: true } },
            facility: { select: { name: true } },
          },
          orderBy: { id: 'asc' },
          ...paging,
        }),
        db.membership.count({ where }),
      ]);
      return result(items, total);
    }
    if (section === 'reviews') {
      const where: Prisma.ReviewWhereInput = {
        booking: { court: facility },
        hidden: false,
        ...(q.q ? { text: { contains: q.q, mode: 'insensitive' } } : {}),
      };
      const [items, total] = await Promise.all([
        db.review.findMany({
          where,
          select: {
            id: true,
            rating: true,
            text: true,
            createdAt: true,
            booking: { select: { reference: true, court: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          ...paging,
        }),
        db.review.count({ where }),
      ]);
      return result(items, total);
    }
    if (section === 'reports') {
      // Report narratives and reporter identities remain in the protected admin review workflow.
      const where: Prisma.UserReportWhereInput = {
        targetType: 'FACILITY',
        targetId: { in: ids },
        ...(q.q ? { category: { contains: q.q, mode: 'insensitive' } } : {}),
      };
      const [items, total] = await Promise.all([
        db.userReport.findMany({
          where,
          select: {
            id: true,
            targetId: true,
            category: true,
            state: true,
            createdAt: true,
            resolvedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          ...paging,
        }),
        db.userReport.count({ where }),
      ]);
      return result(items, total);
    }
    if (section === 'activity') {
      const facilityIds = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
      const scope = Prisma.sql`(a."resourceId" IN (${Prisma.join(ids)}) OR EXISTS (SELECT 1 FROM "Booking" b JOIN "Court" c ON c.id=b."courtId" WHERE b.id::text=a."resourceId" AND c."facilityId" IN (${facilityIds})) OR EXISTS (SELECT 1 FROM "Court" c WHERE c.id::text=a."resourceId" AND c."facilityId" IN (${facilityIds})) OR EXISTS (SELECT 1 FROM "PaymentRecord" p JOIN "Booking" b ON b.id=p."bookingId" JOIN "Court" c ON c.id=b."courtId" WHERE p.id::text=a."resourceId" AND c."facilityId" IN (${facilityIds}))) AND (a.action ILIKE ${'%' + q.q + '%'} OR a.reason ILIKE ${'%' + q.q + '%'})`;
      const items = await db.$queryRaw<
        unknown[]
      >`SELECT a.id,a."actorId",a.action,a.outcome,a.reason,a."resourceId",a."createdAt" FROM "AuditEvent" a WHERE ${scope} ORDER BY a."createdAt" DESC,a.id DESC LIMIT 20 OFFSET ${(q.page - 1) * 20}`;
      const total = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM "AuditEvent" a WHERE ${scope}`;
      return result(items, Number(total[0]!.count));
    }
    throw new NotFoundException('Workspace page not found.');
  }
  @Get('workspaces/owner/facilities/:id') async facility(@Req() req: AuthRequest, @Param('id') id: string) {
    const memberships = await workspaceMemberships(req, 'owner');
    if (!memberships.some((m) => m.facilityId === uuid(id)))
      throw new ForbiddenException('Facility owner access required.');
    return db.facility.findUniqueOrThrow({ where: { id }, include: { courts: true } });
  }
  @Post('workspaces/owner/facilities/:id') async editFacility(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.facility(req, id);
    const data = parse(
      change.extend({
        description: z.string().trim().min(20).max(2000),
        address: z.string().trim().min(10).max(250),
        amenities: z.array(z.string().trim().min(1).max(60)).max(30),
      }),
      body,
    );
    return db.$transaction(async (tx) => {
      // Recheck membership inside the write transaction; ownership cannot be edited here.
      const membership = await tx.membership.findUnique({
        where: { userId_facilityId: { userId: account(req).id, facilityId: id } },
      });
      if (membership?.role !== 'OWNER') throw new ForbiddenException('Facility owner access required.');
      await tx.facility.update({
        where: { id },
        data: { description: data.description, address: data.address, amenities: data.amenities },
      });
      await audit(
        tx,
        account(req).id,
        'FACILITY_DETAILS_UPDATED',
        id,
        'SUCCESS',
        req.correlationId,
        data.reason,
      );
      return { message: 'Facility details updated.' };
    });
  }
  @Post('workspaces/owner/facilities/:id/staff') async staff(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.facility(req, id);
    const data = parse(
      change
        .extend({
          email: z.email().transform((v) => v.trim().toLowerCase()),
          permissions: z.array(z.enum(permissions)).max(3),
          remove: z.boolean().default(false),
        })
        .strict(),
      body,
    );
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Facility" WHERE id=${id}::uuid FOR UPDATE`;
      const owner = await tx.membership.findUnique({
        where: { userId_facilityId: { userId: account(req).id, facilityId: id } },
      });
      if (owner?.role !== 'OWNER') throw new ForbiddenException('Facility owner access required.');
      const target = await tx.user.findUnique({ where: { email: data.email } });
      if (!target || !target.verifiedAt || target.suspendedAt)
        throw new NotFoundException('An active verified account with that exact email is required.');
      if (!data.remove && !target.phoneVerifiedAt && !demoAccessAllowed(target))
        throw new ConflictException('The staff account must verify its mobile number before assignment.');
      const existing = await tx.membership.findUnique({
        where: { userId_facilityId: { userId: target.id, facilityId: id } },
      });
      if (existing?.role === 'OWNER' || target.id === account(req).id || target.role === 'ADMIN')
        throw new ConflictException('This form cannot change owners, yourself or administrators.');
      if (data.remove) {
        if (existing) await tx.membership.delete({ where: { id: existing.id } });
      } else {
        await tx.membership.upsert({
          where: { userId_facilityId: { userId: target.id, facilityId: id } },
          create: { userId: target.id, facilityId: id, role: 'STAFF', permissions: data.permissions },
          update: { permissions: data.permissions },
        });
        if (target.role === 'PLAYER')
          await tx.user.update({ where: { id: target.id }, data: { role: 'FACILITY_STAFF' } });
      }
      await tx.session.deleteMany({ where: { userId: target.id } });
      await audit(
        tx,
        account(req).id,
        data.remove ? 'FACILITY_STAFF_REMOVED' : 'FACILITY_STAFF_PERMISSIONS_UPDATED',
        id,
        'SUCCESS',
        req.correlationId,
        data.reason,
      );
      await tx.notification.create({
        data: {
          userId: target.id,
          title: data.remove ? 'Facility staff access removed' : 'Facility staff permissions updated',
          href: '/staff',
        },
      });
      return {
        message:
          'Staff access updated and existing sessions revoked. The affected account must log in again.',
      };
    });
  }
  @Get('admin/facilities') async adminFacilities(@Req() req: AuthRequest, @Query() query: unknown) {
    await administrator(req);
    const q = parse(pageSchema, query),
      where: Prisma.FacilityWhereInput = {
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
        ...(q.status
          ? { status: parse(z.enum(['PENDING', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED']), q.status) }
          : {}),
      };
    const [items, total] = await Promise.all([
      db.facility.findMany({
        where,
        select: {
          id: true,
          name: true,
          area: true,
          status: true,
          memberships: {
            select: { role: true, permissions: true, user: { select: { id: true, nickname: true } } },
          },
        },
        orderBy: { id: 'asc' },
        skip: (q.page - 1) * 20,
        take: 20,
      }),
      db.facility.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: 20 };
  }
  @Post('admin/facilities/:id/status') async facilityStatus(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await administrator(req);
    uuid(id);
    const data = parse(change.extend({ status: z.enum(['UNPUBLISHED', 'PUBLISHED']) }), body);
    return db.$transaction(async (tx) => {
      const actor = await adminWriter(tx, req);
      await tx.$queryRaw`SELECT id FROM "Facility" WHERE id=${id}::uuid FOR UPDATE`;
      const facility = await tx.facility.findUnique({ where: { id }, include: { application: true } });
      if (!facility) throw new NotFoundException();
      if (data.status === 'PUBLISHED' && facility.application?.state !== 'APPROVED')
        throw new ConflictException('An approved application is required before publication.');
      await tx.facility.update({ where: { id }, data: { status: data.status } });
      await decision(tx, actor.id, 'FACILITY', id, `FACILITY_${data.status}`, data.reason, req.correlationId);
      return { message: `Facility ${data.status.toLowerCase()}. Existing reservations are preserved.` };
    });
  }
  @Get('admin/bookings') async adminBookings(@Req() req: AuthRequest, @Query() query: unknown) {
    const actor = await administrator(req),
      q = parse(pageSchema, query),
      where: Prisma.BookingWhereInput = {
        ...(q.q ? { reference: { contains: q.q, mode: 'insensitive' } } : {}),
        ...(q.facilityId ? { court: { facilityId: q.facilityId } } : {}),
        ...(q.status
          ? {
              status: parse(
                z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW', 'EXPIRED']),
                q.status,
              ),
            }
          : {}),
      };
    const [items, total] = await Promise.all([
      db.booking.findMany({
        where,
        select: bookingSelect,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * 20,
        take: 20,
      }),
      db.booking.count({ where }),
    ]);
    await audit(db, actor.id, 'ADMIN_BOOKINGS_VIEWED', undefined, 'SUCCESS', req.correlationId);
    return { items, total, page: q.page, pageSize: 20 };
  }
  @Get('admin/bookings/:id') async adminBooking(@Req() req: AuthRequest, @Param('id') id: string) {
    const actor = await administrator(req);
    const booking = await db.booking.findUnique({
      where: { id: uuid(id) },
      select: {
        ...bookingSelect,
        history: { orderBy: { createdAt: 'asc' }, take: 100 },
        paymentRecords: {
          select: {
            id: true,
            amountCentavos: true,
            method: true,
            reference: true,
            state: true,
            actorId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!booking) throw new NotFoundException();
    await audit(db, actor.id, 'ADMIN_BOOKING_VIEWED', id, 'SUCCESS', req.correlationId);
    return booking;
  }
  @Get('admin/payments') async adminPayments(@Req() req: AuthRequest, @Query() query: unknown) {
    const actor = await administrator(req),
      q = parse(pageSchema, query),
      where: Prisma.PaymentRecordWhereInput = {
        ...(q.q ? { booking: { reference: { contains: q.q, mode: 'insensitive' } } } : {}),
        ...(q.facilityId
          ? {
              booking: {
                court: { facilityId: q.facilityId },
                ...(q.q ? { reference: { contains: q.q, mode: 'insensitive' } } : {}),
              },
            }
          : {}),
      };
    const [rows, total] = await Promise.all([
      db.paymentRecord.findMany({
        where,
        select: paymentSelect,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * 20,
        take: 20,
      }),
      db.paymentRecord.count({ where }),
    ]);
    const actors = await db.user.findMany({
      where: { id: { in: rows.map((p) => p.actorId) } },
      select: { id: true, nickname: true },
    });
    await audit(db, actor.id, 'ADMIN_PAYMENTS_VIEWED', undefined, 'SUCCESS', req.correlationId);
    return {
      items: rows.map((p) => ({
        ...p,
        verifier: actors.find((a) => a.id === p.actorId)?.nickname ?? 'Former operator',
      })),
      total,
      page: q.page,
      pageSize: 20,
    };
  }
}
