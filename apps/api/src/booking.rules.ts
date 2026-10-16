import { BadRequestException } from '@nestjs/common';
import { intervalError } from '@larosentry/contracts';
// Compatibility adapter; the scheduling engine owns all interval validation.
export function calculatePrice(
  startsAt: Date,
  endsAt: Date,
  hourlyRate: number,
  openHour: number,
  closeHour: number,
  now = new Date(),
) {
  const error = intervalError(
    startsAt,
    endsAt,
    {
      openMinute: openHour * 60,
      closeMinute: closeHour * 60,
      minDuration: 30,
      defaultDuration: 60,
      maxDuration: null,
      startInterval: 30,
      active: true,
    },
    now,
  );
  if (error) throw new BadRequestException(error);
  return Math.round((hourlyRate * (endsAt.getTime() - startsAt.getTime())) / 3600000);
}
