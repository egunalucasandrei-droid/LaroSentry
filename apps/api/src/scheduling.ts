import { BadRequestException } from '@nestjs/common';
import { durationError, scheduleSlots, type ScheduleRules } from '@larosentry/contracts';
import type { Court, Facility } from '@prisma/client';
import { db, type Tx } from './db.js';
export async function rulesFor(
  tx: Tx,
  court: Court & { facility: Facility },
  date: string,
): Promise<ScheduleRules> {
  const exception = await tx.scheduleException.findUnique({
    where: { courtId_date: { courtId: court.id, date } },
  });
  return {
    openMinute: exception?.openMinute ?? court.openMinute ?? court.facility.openHour * 60,
    closeMinute: exception?.closeMinute ?? court.closeMinute ?? court.facility.closeHour * 60,
    minDuration: court.minDuration,
    defaultDuration: court.defaultDuration,
    maxDuration: court.maxDuration,
    startInterval: court.startInterval,
    active: court.active && !court.archivedAt && court.availabilityStatus === 'AVAILABLE',
    closed: exception?.closed ?? false,
  };
}
export async function courtSchedule(
  court: Court & { facility: Facility },
  date: string,
  duration?: number,
  privateView = false,
  ignoreBookingId?: string,
) {
  const rules = await rulesFor(db, court, date);
  const selectedDuration = duration ?? rules.defaultDuration;
  const error = durationError(selectedDuration, rules);
  if (error) throw new BadRequestException(error);
  const start = new Date(`${date}T00:00:00+08:00`),
    end = new Date(start.getTime() + 86400000);
  const allocations = await db.allocation.findMany({
    where: {
      courtId: court.id,
      active: true,
      startsAt: { lt: end },
      endsAt: { gt: start },
      ...(ignoreBookingId ? { OR: [{ bookingId: null }, { bookingId: { not: ignoreBookingId } }] } : {}),
    },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true, kind: true, reason: true },
  });
  return {
    court: {
      id: court.id,
      name: court.name,
      surface: court.surface,
      hourlyRate: court.hourlyRate,
      active: court.active,
      facilityName: court.facility.name,
      openHour: rules.openMinute / 60,
      closeHour: rules.closeMinute / 60,
    },
    rules,
    date,
    duration: selectedDuration,
    slots: scheduleSlots(date, selectedDuration, rules, allocations),
    occupied: allocations.map(({ startsAt, endsAt, kind }) => ({ startsAt, endsAt, kind })),
    ...(privateView
      ? {
          allocations,
          pending: await db.booking.count({
            where: { courtId: court.id, status: 'PENDING', startsAt: { lt: end }, endsAt: { gt: start } },
          }),
        }
      : {}),
    refreshedAt: new Date(),
    notice: 'Pending requests do not reserve time. Availability is checked again at confirmation.',
  };
}
