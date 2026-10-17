import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { phoneSchema, sports } from '@larosentry/contracts';
import { db, type Tx } from './db.js';
import { parse, sessionAccount, type AuthRequest } from './http.js';
import { decrypt, encrypt, hash, privateHash, token } from './crypto.js';
import { audit } from './audit.js';
import { queueMail } from './outbox.js';
import { env } from './config.js';
import { demoModeFor } from './demo-access.js';
import { smsAdapter } from './sms.js';

export const contactComplete = (u: { verifiedAt: Date | null; phoneVerifiedAt: Date | null }) =>
  !!u.verifiedAt && !!u.phoneVerifiedAt;
export function firstContact(req: AuthRequest) {
  const u = sessionAccount(req);
  if (!u.verifiedAt && !u.phoneVerifiedAt && !demoModeFor(u))
    throw new ForbiddenException('Verify either email or mobile first.');
  return u;
}
export function bothContacts(req: AuthRequest) {
  const u = sessionAccount(req);
  if (!contactComplete(u) && !demoModeFor(u))
    throw new ForbiddenException(
      'Verify both email and mobile before submitting facility evidence or accepting staff access.',
    );
  return u;
}
export async function verificationMail(tx: Tx, user: { id: string; email: string }) {
  const raw = token();
  await tx.accountToken.create({
    data: {
      userId: user.id,
      kind: 'VERIFY',
      hash: hash(raw),
      subjectHash: privateHash(`email:${user.email}`),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await queueMail(
    tx,
    user.email,
    'Verify your LaroSentry email',
    `Confirm your email within 24 hours:\n${env.APP_ORIGIN}/verify-email#token=${raw}\nIf you did not request this, ignore this email.`,
    `verify:${randomUUID()}`,
  );
}
export const playerPreferences = z
  .object({
    sports: z
      .array(z.enum([...sports, 'Others']))
      .max(7)
      .default([]),
    areas: z.array(z.string().trim().min(2).max(80)).max(10).default([]),
    times: z
      .array(
        z.enum([
          'Weekday mornings',
          'Weekday afternoons',
          'Weekday evenings',
          'Weekend mornings',
          'Weekend afternoons',
          'Weekend evenings',
        ]),
      )
      .max(6)
      .default([]),
    court: z.enum(['Indoor', 'Outdoor', 'Covered', 'No preference']).default('No preference'),
    budgetMin: z.number().int().min(0).max(1000000).nullable().default(null),
    budgetMax: z.number().int().min(0).max(1000000).nullable().default(null),
    goals: z
      .array(
        z.enum([
          'Book a court',
          'Join public games',
          'Play with friends',
          'Discover new facilities',
          'Compare prices',
        ]),
      )
      .max(5)
      .default([]),
    recommendations: z.boolean().default(true),
    skip: z.boolean().default(false),
  })
  .refine(
    (v) => v.budgetMin === null || v.budgetMax === null || v.budgetMin <= v.budgetMax,
    'Minimum budget must not exceed maximum.',
  );
@Controller('onboarding')
export class OnboardingController {
  @Get() async status(@Req() req: AuthRequest) {
    const u = sessionAccount(req);
    return {
      email: u.email,
      phone: u.phoneEncrypted ? decrypt(u.phoneEncrypted) : null,
      emailVerified: !!u.verifiedAt,
      phoneVerified: !!u.phoneVerifiedAt,
      status: contactComplete(u)
        ? 'VERIFIED'
        : u.verifiedAt || u.phoneVerifiedAt
          ? 'PARTIALLY_VERIFIED'
          : 'UNVERIFIED',
      purpose: u.purpose,
      completed: !!u.onboardingCompletedAt,
      required: u.contactRequired,
      smsMode: smsAdapter().mode,
      emailAvailable: env.EMAIL_PROVIDER !== 'unavailable',
      preferences: {
        sports: u.sportsPreferences,
        areas: u.areaPreferences,
        times: u.timePreferences,
        court: u.courtPreference,
        budgetMin: u.budgetMin,
        budgetMax: u.budgetMax,
        goals: u.goalPreferences,
        recommendations: u.recommendationsEnabled,
      },
    };
  }
  @Post('email/resend') async resend(@Req() req: AuthRequest) {
    const u = sessionAccount(req);
    if (u.verifiedAt) return { message: 'Email is already verified.' };
    if (env.EMAIL_PROVIDER === 'unavailable')
      throw new ServiceUnavailableException(
        'Email verification is unavailable in this test pilot. No email was sent.',
      );
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id}::uuid FOR UPDATE`;
      const latest = await tx.accountToken.findFirst({
        where: { userId: u.id, kind: 'VERIFY' },
        orderBy: { createdAt: 'desc' },
      });
      if (latest && latest.createdAt.getTime() > Date.now() - 60000)
        throw new ConflictException('Wait 60 seconds before requesting another verification email.');
      if (
        (await tx.accountToken.count({
          where: { userId: u.id, kind: 'VERIFY', createdAt: { gt: new Date(Date.now() - 86400000) } },
        })) >= 6
      )
        throw new ConflictException('Daily verification email limit reached.');
      await tx.accountToken.updateMany({
        where: { userId: u.id, kind: 'VERIFY', usedAt: null },
        data: { usedAt: new Date() },
      });
      const current = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
      await verificationMail(tx, current);
      await audit(tx, u.id, 'EMAIL_VERIFICATION_QUEUED');
      return {
        message:
          'Verification email queued. Delivery depends on the configured mail service; local mail is captured in Mailpit.',
      };
    });
  }
  @Post('sms/send') async send(@Req() req: AuthRequest) {
    const u = sessionAccount(req),
      adapter = smsAdapter();
    if (!u.phoneEncrypted || !u.phoneHash)
      throw new BadRequestException('Add a Philippine mobile number first.');
    if (u.phoneVerifiedAt) return { message: 'Mobile is already verified.' };
    if (adapter.mode === 'unavailable')
      throw new ServiceUnavailableException('SMS verification is temporarily unavailable. No SMS was sent.');
    const id = randomUUID(),
      code = String(randomInt(100000, 1000000)),
      ipHash = privateHash(`ip:${req.ip}`);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sms:' + u.phoneHash},0))::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sms-ip:' + ipHash},0))::text`;
      const latest = await tx.verificationChallenge.findFirst({
        where: { userId: u.id },
        orderBy: { createdAt: 'desc' },
      });
      if (latest && latest.createdAt.getTime() > Date.now() - 60000)
        throw new ConflictException('Wait 60 seconds before requesting another code.');
      const since = new Date(Date.now() - 3600000);
      const [accountCount, phoneCount, ipCount] = await Promise.all([
        tx.verificationChallenge.count({
          where: { userId: u.id, createdAt: { gt: new Date(Date.now() - 86400000) } },
        }),
        tx.verificationChallenge.count({ where: { phoneHash: u.phoneHash!, createdAt: { gt: since } } }),
        tx.verificationChallenge.count({ where: { ipHash, createdAt: { gt: since } } }),
      ]);
      if (accountCount >= 10 || phoneCount >= 5 || ipCount >= 20)
        throw new ConflictException('Verification sending limit reached. Try again later.');
      await tx.verificationChallenge.updateMany({
        where: { userId: u.id, usedAt: null },
        data: { usedAt: new Date(), localCipher: null },
      });
      await tx.verificationChallenge.create({
        data: {
          id,
          userId: u.id,
          phoneHash: u.phoneHash!,
          ipHash,
          codeHash: privateHash(`otp:${id}:${code}`),
          localCipher: adapter.mode === 'local' ? encrypt(code) : null,
          expiresAt: new Date(Date.now() + 300000),
        },
      });
    });
    try {
      await adapter.send(decrypt(u.phoneEncrypted), code);
      await db.verificationChallenge.update({ where: { id }, data: { deliveryState: 'ACCEPTED' } });
    } catch {
      await db.verificationChallenge.update({
        where: { id },
        data: { deliveryState: 'FAILED', usedAt: new Date(), localCipher: null },
      });
      await audit(db, u.id, 'SMS_DELIVERY_FAILED', id, 'FAILED');
      throw new ServiceUnavailableException('SMS delivery was not accepted. Try again after the cooldown.');
    }
    await audit(db, u.id, adapter.mode === 'local' ? 'LOCAL_SMS_CAPTURED' : 'SMS_PROVIDER_ACCEPTED', id);
    return {
      message:
        adapter.mode === 'local'
          ? 'Local test code captured. No SMS was sent; open the local test inbox.'
          : 'The SMS provider accepted the request. Delivery is not guaranteed.',
    };
  }
  @Get('dev-sms') async local(@Req() req: AuthRequest) {
    const u = sessionAccount(req);
    if (smsAdapter().mode !== 'local') throw new ForbiddenException('Local test inbox is disabled.');
    const c = await db.verificationChallenge.findFirst({
      where: { userId: u.id, usedAt: null, expiresAt: { gt: new Date() }, deliveryState: 'ACCEPTED' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      code: c?.localCipher ? decrypt(c.localCipher) : null,
      message: 'Local simulation only. This code was not sent by SMS.',
    };
  }
  @Post('sms/verify') async verify(@Req() req: AuthRequest, @Body() body: unknown) {
    const u = sessionAccount(req),
      { code } = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), body);
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id}::uuid FOR UPDATE`;
      const c = await tx.verificationChallenge.findFirst({
        where: { userId: u.id },
        orderBy: { createdAt: 'desc' },
      });
      if (
        !c ||
        c.usedAt ||
        c.expiresAt <= new Date() ||
        c.attempts >= 5 ||
        c.phoneHash !== u.phoneHash ||
        c.deliveryState !== 'ACCEPTED'
      )
        return false;
      const valid = c.codeHash === privateHash(`otp:${c.id}:${code}`);
      await tx.verificationChallenge.update({
        where: { id: c.id },
        data: {
          attempts: { increment: 1 },
          ...(!valid && c.attempts < 4 ? {} : { usedAt: new Date(), localCipher: null }),
        },
      });
      if (valid) await tx.user.update({ where: { id: u.id }, data: { phoneVerifiedAt: new Date() } });
      await audit(
        tx,
        u.id,
        valid ? 'PHONE_VERIFIED' : c.attempts === 4 ? 'SMS_ATTEMPTS_EXHAUSTED' : 'SMS_CODE_REJECTED',
        c.id,
        valid ? 'SUCCESS' : 'DENIED',
      );
      return valid;
    });
    if (!result)
      throw new BadRequestException(
        'Code is invalid, expired, used or locked. Request a new code after the cooldown.',
      );
    return { message: 'Mobile number verified.' };
  }
  @Post('contacts') async contacts(@Req() req: AuthRequest, @Body() body: unknown) {
    const u = sessionAccount(req),
      v = parse(
        z.object({
          email: z.email().transform((v) => v.trim().toLowerCase()),
          phone: phoneSchema,
          password: z.string().min(1).max(128),
        }),
        body,
      );
    if (!(await argon2.verify(u.passwordHash, v.password)))
      throw new ForbiddenException('Confirm your current password.');
    if (u.mfaEnabled && !req.session?.mfaVerified && !demoModeFor(u))
      throw new ForbiddenException('Verify your authenticator before changing contact information.');
    const phoneHash = privateHash(`phone:${v.phone}`),
      emailChanged = u.email !== v.email,
      phoneChanged = u.phoneHash !== phoneHash;
    if (!emailChanged && !phoneChanged) return { message: 'Contact information is unchanged.' };
    if (
      await db.user.findFirst({
        where: { id: { not: u.id }, OR: [{ email: v.email }, { phoneHash }] },
        select: { id: true },
      })
    )
      throw new ConflictException('This contact information cannot be used.');
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: u.id },
        data: {
          email: v.email,
          phoneEncrypted: encrypt(v.phone),
          phoneHash,
          contactRequired: true,
          ...(emailChanged ? { verifiedAt: null } : {}),
          ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
        },
      });
      await tx.accountToken.updateMany({
        where: { userId: u.id, kind: 'VERIFY', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.verificationChallenge.updateMany({
        where: { userId: u.id, usedAt: null },
        data: { usedAt: new Date(), localCipher: null },
      });
      if (emailChanged) await verificationMail(tx, { id: u.id, email: v.email });
      await tx.session.deleteMany({ where: { userId: u.id } });
      await audit(tx, u.id, 'CONTACT_INFORMATION_CHANGED', u.id);
      await queueMail(
        tx,
        u.email,
        'LaroSentry contact information changed',
        'Your contact information was changed. Existing sessions were revoked. If this was not you, use account recovery and report the concern.',
        `contact:${randomUUID()}`,
      );
    });
    return {
      message: 'Contact information updated. Sign in again and verify changed channels.',
      signInAgain: true,
    };
  }
  @Post('purpose') async purpose(@Req() req: AuthRequest, @Body() body: unknown) {
    const u = firstContact(req),
      v = parse(z.object({ purpose: z.enum(['PLAYER', 'HOST']) }).strict(), body);
    await db.user.update({ where: { id: u.id }, data: { purpose: v.purpose } });
    await audit(db, u.id, 'ONBOARDING_PURPOSE_SELECTED');
    return {
      message:
        v.purpose === 'HOST'
          ? 'Host intent saved. Facility-specific approval is still required.'
          : 'Player intent saved.',
    };
  }
  @Post('preferences') async preferences(@Req() req: AuthRequest, @Body() body: unknown) {
    const u = firstContact(req),
      v = parse(playerPreferences, body);
    await db.user.update({
      where: { id: u.id },
      data: {
        ...(v.skip
          ? {}
          : {
              sportsPreferences: v.sports,
              areaPreferences: v.areas,
              timePreferences: v.times,
              courtPreference: v.court,
              budgetMin: v.budgetMin,
              budgetMax: v.budgetMax,
              goalPreferences: v.goals,
              recommendationsEnabled: v.recommendations,
            }),
        onboardingCompletedAt: new Date(),
      },
    });
    await audit(db, u.id, v.skip ? 'PLAYER_PREFERENCES_SKIPPED' : 'PLAYER_PREFERENCES_UPDATED');
    return { message: v.skip ? 'Preferences skipped. You can update them later.' : 'Preferences saved.' };
  }
  @Get('recommendations') async recommendations(@Req() req: AuthRequest) {
    const u = firstContact(req);
    const facilities = await db.facility.findMany({
      where: { status: 'PUBLISHED' },
      include: { courts: { where: { active: true } } },
      take: 200,
      orderBy: { name: 'asc' },
    });
    return {
      items: facilities
        .map((f) => {
          const reasons: string[] = [];
          let score = 0;
          if (u.recommendationsEnabled) {
            const matching = f.courts.filter((c) => u.sportsPreferences.includes(c.sport));
            if (matching.length) {
              score += 3;
              reasons.push(`your selected sport: ${matching[0]!.sport}`);
            }
            if (u.areaPreferences.some((a) => f.area.toLowerCase().includes(a.toLowerCase()))) {
              score += 3;
              reasons.push(`your preferred area: ${f.area}`);
            }
            if (
              u.courtPreference !== 'No preference' &&
              f.amenities.some((a) => a.toLowerCase().includes(u.courtPreference.toLowerCase()))
            ) {
              score += 2;
              reasons.push(`your ${u.courtPreference.toLowerCase()} preference`);
            }
            if (
              (u.budgetMin !== null || u.budgetMax !== null) &&
              f.courts.some(
                (c) => c.hourlyRate >= (u.budgetMin ?? 0) && c.hourlyRate <= (u.budgetMax ?? 1000000),
              )
            ) {
              score++;
              reasons.push('your hourly budget');
            }
          }
          return {
            ...f,
            score,
            explanation: reasons.length
              ? 'Recommended because of ' + reasons.join(', ') + '.'
              : 'Published facility. Browse all facilities to compare other options.',
          };
        })
        .filter((f) => f.courts.length)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 12),
      method: 'Rules based; availability is checked when you choose a date, not assumed by ranking.',
    };
  }
}
