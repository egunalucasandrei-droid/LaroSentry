export type ScheduleRules = {
  openMinute: number;
  closeMinute: number;
  minDuration: number;
  defaultDuration: number;
  maxDuration: number | null;
  startInterval: number;
  active: boolean;
  closed?: boolean;
};
export const phtDate = (value: Date = new Date()) =>
  new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const minuteTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const displayMinute = (minute: number) =>
  `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${minute % 1440 >= 720 ? 'PM' : 'AM'}`;
export const displayClock = (value: string | Date) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
export const overlaps = (start: Date, end: Date, otherStart: Date, otherEnd: Date) =>
  start < otherEnd && end > otherStart;
export function durationError(duration: number, rules: ScheduleRules) {
  return !Number.isInteger(duration) || duration < rules.minDuration || duration > (rules.maxDuration ?? 1440)
    ? `Choose a whole-minute duration from ${rules.minDuration} to ${rules.maxDuration ?? 1440} minutes.`
    : null;
}
export function intervalError(start: Date, end: Date, rules: ScheduleRules, now = new Date()) {
  const duration = (end.getTime() - start.getTime()) / 60000;
  const error = durationError(duration, rules);
  if (error) return error;
  if (!rules.active || rules.closed) return 'This court is unavailable on this date.';
  if (start <= now || start.getTime() > now.getTime() + 90 * 86400000)
    return 'Choose a future time within 90 days.';
  const midnight = new Date(`${phtDate(start)}T00:00:00+08:00`).getTime();
  const from = (start.getTime() - midnight) / 60000,
    to = (end.getTime() - midnight) / 60000;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < rules.openMinute || to > rules.closeMinute)
    return 'Selected time is outside court operating hours.';
  if ((from - rules.openMinute) % rules.startInterval !== 0)
    return `Start times must follow the ${rules.startInterval}-minute interval from opening.`;
  return null;
}
export function scheduleSlots(
  date: string,
  duration: number,
  rules: ScheduleRules,
  allocations: { startsAt: string | Date; endsAt: string | Date; kind: string }[],
  now = new Date(),
) {
  if (durationError(duration, rules)) return [];
  const midnight = new Date(`${date}T00:00:00+08:00`).getTime();
  const slots = [];
  for (let minute = rules.openMinute; minute + duration <= rules.closeMinute; minute += rules.startInterval) {
    const startsAt = new Date(midnight + minute * 60000),
      endsAt = new Date(startsAt.getTime() + duration * 60000);
    const conflict = allocations.find((a) =>
      overlaps(startsAt, endsAt, new Date(a.startsAt), new Date(a.endsAt)),
    );
    const status = !rules.active
      ? 'INACTIVE'
      : rules.closed
        ? 'CLOSED'
        : conflict
          ? conflict.kind === 'CLOSURE'
            ? 'CLOSED'
            : 'BOOKED'
          : startsAt <= now
            ? 'PAST'
            : startsAt.getTime() > now.getTime() + 90 * 86400000
              ? 'OUTSIDE_WINDOW'
              : 'AVAILABLE';
    slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), status });
  }
  return slots;
}
