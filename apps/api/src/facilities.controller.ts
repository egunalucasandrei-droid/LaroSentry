import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { db } from './db.js';
import { account, parse, type AuthRequest, uuid } from './http.js';
import { courtSchedule, rulesFor } from './scheduling.js';
import { scheduleSlots } from '@larosentry/contracts';
@ApiTags('Public facility discovery')
@Controller()
export class FacilitiesController {
  @Get('facilities') async list(@Query() query: Record<string, string>) {
    const q = parse(
      z.object({
        q: z.string().max(100).default(''),
        sport: z.string().max(30).optional(),
        amenity: z.string().max(40).optional(),
        maxPrice: z.coerce.number().int().min(0).max(1000000).optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        sort: z.enum(['name', 'price']).default('name'),
        date: z.iso.date().optional(),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):(00|30)$/)
          .optional(),
      }),
      query,
    );
    const where = {
      status: 'PUBLISHED',
      OR: ['name', 'area'].map((field) => ({ [field]: { contains: q.q, mode: 'insensitive' as const } })),
      ...(q.amenity ? { amenities: { has: q.amenity } } : {}),
      courts: {
        some: {
          active: true,
          ...(q.sport ? { sport: q.sport } : {}),
          ...(q.maxPrice !== undefined ? { hourlyRate: { lte: q.maxPrice } } : {}),
        },
      },
    };
    // Pilot is explicitly bounded to 20 demo facilities; price sort precedes pagination.
    let rows = await db.facility.findMany({
      where,
      include: {
        courts: {
          where: {
            active: true,
            ...(q.sport ? { sport: q.sport } : {}),
            ...(q.maxPrice !== undefined ? { hourlyRate: { lte: q.maxPrice } } : {}),
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
    if (q.date) {
      const start = new Date(`${q.date}T00:00:00+08:00`),
        end = new Date(start.getTime() + 86400000);
      const occupied = await db.allocation.findMany({
        where: {
          active: true,
          courtId: { in: rows.flatMap((f) => f.courts.map((c) => c.id)) },
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        select: { courtId: true, startsAt: true, endsAt: true },
      });
      const matches = await Promise.all(
        rows.map(async (f) => {
          const available = await Promise.all(
            f.courts.map(async (c) => {
              const rules = await rulesFor(db, { ...c, facility: f }, q.date!);
              return scheduleSlots(
                q.date!,
                rules.defaultDuration,
                rules,
                occupied.filter((a) => a.courtId === c.id).map((a) => ({ ...a, kind: 'BOOKING' })),
              ).some(
                (slot) =>
                  slot.status === 'AVAILABLE' &&
                  (!q.time ||
                    new Date(new Date(slot.startsAt).getTime() + 8 * 3600000).toISOString().slice(11, 16) ===
                      q.time),
              );
            }),
          );
          return available.some(Boolean);
        }),
      );
      rows = rows.filter((_, i) => matches[i]);
    }
    if (q.sort === 'price')
      rows.sort(
        (a, b) =>
          Math.min(...a.courts.map((c) => c.hourlyRate)) - Math.min(...b.courts.map((c) => c.hourlyRate)),
      );
    return { items: rows.slice((q.page - 1) * 9, q.page * 9), total: rows.length, page: q.page, pageSize: 9 };
  }
  @Get('facilities/:slug') async detail(@Param('slug') slug: string) {
    const facility = await db.facility.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: { courts: { where: { active: true }, orderBy: { name: 'asc' } } },
    });
    if (!facility) throw new NotFoundException('Facility not found.');
    return facility;
  }
  @Get('courts/:id/availability') async availability(
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('duration') duration?: string,
  ) {
    parse(z.iso.date(), date);
    const court = await db.court.findFirst({
      where: { id: uuid(id), active: true, facility: { status: 'PUBLISHED' } },
      include: { facility: true },
    });
    if (!court) throw new NotFoundException('Court not found.');
    return courtSchedule(
      court,
      date,
      duration ? parse(z.coerce.number().int().min(1).max(1440), duration) : undefined,
    );
  }
  @Get('saved') async saved(@Req() req: AuthRequest) {
    return db.savedFacility.findMany({
      where: { userId: account(req).id, facility: { status: 'PUBLISHED' } },
      include: { facility: { include: { courts: { where: { active: true } } } } },
      take: 100,
    });
  }
  @Post('saved/:id') async save(@Req() req: AuthRequest, @Param('id') id: string) {
    const facility = await db.facility.findFirst({ where: { id: uuid(id), status: 'PUBLISHED' } });
    if (!facility) throw new NotFoundException('Facility not found.');
    await db.savedFacility.upsert({
      where: { userId_facilityId: { userId: account(req).id, facilityId: id } },
      update: {},
      create: { userId: account(req).id, facilityId: id },
    });
    return { message: 'Facility saved.' };
  }
  @Delete('saved/:id') async unsave(@Req() req: AuthRequest, @Param('id') id: string) {
    await db.savedFacility.deleteMany({ where: { userId: account(req).id, facilityId: uuid(id) } });
    return { message: 'Facility removed.' };
  }
  @Get('notifications') async notifications(@Req() req: AuthRequest) {
    return db.notification.findMany({
      where: { userId: account(req).id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  @Post('notifications/read') async read(@Req() req: AuthRequest, @Body() body: unknown) {
    const { id } = parse(z.object({ id: z.uuid() }), body);
    await db.notification.updateMany({
      where: { id, userId: account(req).id },
      data: { readAt: new Date() },
    });
    return { message: 'Notification marked as read.' };
  }
}
