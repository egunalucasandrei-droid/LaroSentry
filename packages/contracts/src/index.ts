import { z } from 'zod';
export * from './scheduling.js';
export const POLICY_VERSION = '2026-10-16-onboarding-draft-2';
export const sports = ['Basketball', 'Badminton', 'Tennis', 'Volleyball', 'Futsal', 'Pickleball'] as const;
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(128);
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, '').replace(/^09/, '+639'))
  .pipe(
    z.string().regex(/^\+639\d{9}$/, 'Use a Philippine mobile number such as +639171234567 or 09171234567'),
  );
export const registerSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    password: passwordSchema,
    confirmPassword: z.string(),
    phone: phoneSchema,
    nickname: z.string().trim().min(2).max(40),
    adult: z.literal(true, { error: 'You must be at least 18 to create an account' }),
    policyVersion: z.literal(POLICY_VERSION, {
      error: 'Review the current terms and privacy notice, then try again',
    }),
    acceptedTerms: z.literal(true, { error: 'Accept the terms and privacy notice to continue' }),
    acceptedPrivacy: z.literal(true, { error: 'Accept the privacy notice to continue' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });
export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});
export const bookingSchema = z.object({
  courtId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  mode: z.enum(['PUBLIC', 'PRIVATE', 'BOOKING_ONLY']),
  expectedGuests: z.number().int().min(1).max(40),
});
export type BookingInput = z.infer<typeof bookingSchema>;
export type User = {
  id: string;
  nickname: string;
  email: string;
  role: 'PLAYER' | 'FACILITY_OWNER' | 'FACILITY_STAFF' | 'ADMIN';
  mfaEnabled: boolean;
  mfaVerified: boolean;
  demoAccessAllowed?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  needsOnboarding?: boolean;
};
export type Court = { id: string; name: string; sport: string; hourlyRate: number; capacity: number };
export type Facility = {
  id: string;
  slug: string;
  name: string;
  area: string;
  address: string;
  description: string;
  latitude: number;
  longitude: number;
  amenities: string[];
  demo: boolean;
  openHour: number;
  closeHour: number;
  cancellationPolicy: string;
  courts: Court[];
};
export type Booking = {
  published: boolean;
  offlineGuests: number;
  rules: string;
  rescheduleRequests?: { id: string; startsAt: string; endsAt: string; state: string; reason: string }[];
  id: string;
  reference: string;
  status: string;
  mode: string;
  startsAt: string;
  endsAt: string;
  totalCentavos: number;
  expectedGuests: number;
  policySnapshot: string;
  expiresAt: string;
  court: Court & { facility: Facility };
  history: { id: string; status: string; createdAt: string; reason: string | null }[];
  paymentRecords?: { id: string; amountCentavos: number; state: string; method: string }[];
};
export const formatMoney = (centavos: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(
    centavos / 100,
  );
export const formatTime = (date: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(new Date(date));
