import { describe, expect, it } from 'vitest';
import { registerSchema } from '../../packages/contracts/src/index';
import { calculatePrice } from '../../apps/api/src/booking.rules';
import { displayMinute, intervalError, scheduleSlots } from '../../packages/contracts/src/scheduling';

describe('Shared NOLTA scheduling rules', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  const rules = {
    openMinute: 420,
    closeMinute: 1260,
    minDuration: 30,
    defaultDuration: 60,
    maxDuration: 180,
    startInterval: 30,
    active: true,
  };
  it('supports custom whole-minute durations without changing the start grid', () => {
    for (const duration of [30, 45, 75, 105]) {
      const start = new Date('2026-10-16T09:00:00+08:00'),
        end = new Date(start.getTime() + duration * 60000);
      expect(intervalError(start, end, rules, now)).toBeNull();
      expect(scheduleSlots('2026-10-16', duration, rules, [], now)[0]!.endsAt).toBe(
        new Date(new Date('2026-10-16T07:00:00+08:00').getTime() + duration * 60000).toISOString(),
      );
    }
    expect(scheduleSlots('2026-10-16', 15, rules, [], now)).toEqual([]);
    expect(scheduleSlots('2026-10-16', 181, rules, [], now)).toEqual([]);
  });
  it('uses half-open intervals and blocks maintenance while allowing adjacent starts', () => {
    const allocations = [
      { startsAt: '2026-10-16T09:00:00+08:00', endsAt: '2026-10-16T10:00:00+08:00', kind: 'CLOSURE' },
    ];
    const slots = scheduleSlots('2026-10-16', 60, rules, allocations, now);
    expect(slots.find((s) => s.startsAt === '2026-10-16T00:00:00.000Z')!.status).toBe('AVAILABLE');
    expect(slots.find((s) => s.startsAt === '2026-10-16T01:00:00.000Z')!.status).toBe('CLOSED');
    expect(slots.find((s) => s.startsAt === '2026-10-16T02:00:00.000Z')!.status).toBe('AVAILABLE');
  });
  it('formats noon and midnight consistently', () => {
    expect(displayMinute(0)).toBe('12:00 AM');
    expect(displayMinute(720)).toBe('12:00 PM');
    expect(displayMinute(945)).toBe('3:45 PM');
  });
});
describe('Adult account declaration', () => {
  it('rejects minors and missing policy acceptance', () => {
    const data = {
      email: 'adult@example.test',
      password: 'a-long-unique-passphrase',
      confirmPassword: 'a-long-unique-passphrase',
      phone: '09171234567',
      acceptedPrivacy: true,
      nickname: 'Player',
      adult: true,
      acceptedTerms: true,
      policyVersion: '2026-10-16-onboarding-draft-2',
    };
    expect(registerSchema.safeParse(data).success).toBe(true);
    expect(registerSchema.safeParse({ ...data, adult: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...data, acceptedTerms: false }).success).toBe(false);
  });
});
describe('Manila court pricing', () => {
  const now = new Date('2026-10-13T00:00:00Z');
  it('calculates 90 minutes in integer centavos', () => {
    expect(
      calculatePrice(
        new Date('2026-10-14T09:00:00+08:00'),
        new Date('2026-10-14T10:30:00+08:00'),
        35000,
        6,
        22,
        now,
      ),
    ).toBe(52500);
  });
  it('rejects zero duration, past time, off-grid starts, and after-hours', () => {
    for (const [a, b] of [
      ['09:00', '09:00'],
      ['09:05', '10:05'],
      ['21:30', '22:30'],
    ])
      expect(() =>
        calculatePrice(
          new Date(`2026-10-14T${a}:00+08:00`),
          new Date(`2026-10-14T${b}:00+08:00`),
          35000,
          6,
          22,
          now,
        ),
      ).toThrow();
    expect(() =>
      calculatePrice(
        new Date('2026-10-12T09:00:00+08:00'),
        new Date('2026-10-12T10:00:00+08:00'),
        35000,
        6,
        22,
        now,
      ),
    ).toThrow();
  });
});
