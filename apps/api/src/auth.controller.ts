import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { generateSecret, generateURI, verify } from 'otplib';
import { z } from 'zod';
import { loginSchema, passwordSchema, registerSchema } from '@larosentry/contracts';
import { db, type Tx } from './db.js';
import { decrypt, encrypt, hash, privateHash, token } from './crypto.js';
import { account, parse, type AuthRequest, uuid } from './http.js';
import { env } from './config.js';
import { queueMail } from './outbox.js';
import { audit } from './audit.js';
import {
  demoAccessAllowed,
  demoModeFor,
  demoSessionVerified,
  grantDemoSession,
  localDemoEnabled,
} from './demo-access.js';
const options = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 12 * 3600000,
};
const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
export const passwordHash = (value: string) => argon2.hash(value, passwordOptions);
const publicUser = (
  user: {
    id: string;
    email: string;
    nickname: string;
    role: string;
    mfaEnabled: boolean;
    verifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    contactRequired: boolean;
    onboardingCompletedAt: Date | null;
  },
  mfaVerified: boolean,
) => ({
  id: user.id,
  email: user.email,
  nickname: user.nickname,
  role: user.role,
  mfaEnabled: user.mfaEnabled,
  mfaVerified,
  verificationBypassed: demoModeFor(user),
  demoAccessAllowed: demoAccessAllowed(user),
  emailVerified: !!user.verifiedAt,
  phoneVerified: !!user.phoneVerifiedAt,
  needsOnboarding:
    user.contactRequired && (!user.verifiedAt || !user.phoneVerifiedAt || !user.onboardingCompletedAt),
});
async function createSession(tx: Tx, userId: string, mfaVerified = false) {
  const sessionToken = token(),
    csrf = token();
  const session = await tx.session.create({
    data: {
      userId,
      tokenHash: hash(sessionToken),
      csrfHash: hash(csrf),
      expiresAt: new Date(Date.now() + 12 * 3600000),
      mfaVerified,
    },
  });
  return { sessionToken, csrf, sessionId: session.id };
}
function setSession(res: Response, credentials: { sessionToken: string; csrf: string }) {
  res.cookie('ls_session', credentials.sessionToken, options);
  res.cookie('ls_csrf', credentials.csrf, { ...options, httpOnly: false });
}
@ApiTags('Authentication and account security')
@Controller('auth')
export class AuthController {
  @Get('me') me(@Req() req: AuthRequest) {
    return {
      user: req.account
        ? publicUser(
            req.account,
            !!req.session?.mfaVerified ||
              (!demoModeFor(req.account) && demoSessionVerified(req.session, req.account)),
          )
        : null,
      demoMode: localDemoEnabled(),
    };
  }

  @Post('demo-access') async demoAccess(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = account(req);
    if (!demoAccessAllowed(user))
      throw new ForbiddenException('Demo access is unavailable for this account or environment.');
    const { password } = parse(z.object({ password: z.string().min(1).max(128) }), body);
    if (!(await argon2.verify(user.passwordHash, password)))
      throw new UnauthorizedException('Password is incorrect.');
    const credentials = await db.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { id: req.session!.id } });
      const result = await createSession(tx, user.id);
      await audit(
        tx,
        user.id,
        'LOCAL_DEMO_ACCESS',
        user.id,
        'SUCCESS',
        req.correlationId,
        'Password-confirmed local demonstration access; not MFA verification.',
      );
      return result;
    });
    grantDemoSession(credentials.sessionId);
    setSession(res, credentials);
    return {
      message:
        'Local demo workspace unlocked for up to 30 minutes. This is demonstration access, not MFA verification.',
    };
  }

  @Post('register') async register(@Body() body: unknown, @Req() req: AuthRequest) {
    const data = parse(registerSchema, body);
    const hashed = await passwordHash(data.password);
    const phoneHash = privateHash(`phone:${data.phone}`);
    const existing = await db.user.findFirst({
      where: { OR: [{ email: data.email }, { phoneHash }] },
      select: { id: true },
    });
    if (!existing) {
      await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: data.email,
            passwordHash: hashed,
            nickname: data.nickname,
            phoneEncrypted: encrypt(data.phone),
            phoneHash,
            contactRequired: true,
            termsVersion: data.policyVersion,
            privacyVersion: data.policyVersion,
            policyAcceptedAt: new Date(),
          },
        });
        const raw = token();
        await tx.accountToken.create({
          data: {
            userId: user.id,
            hash: hash(raw),
            subjectHash: privateHash(`email:${data.email}`),
            kind: 'VERIFY',
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await queueMail(
          tx,
          user.email,
          'Verify your LaroSentry email',
          `Welcome to LaroSentry. Confirm your email within 24 hours:\n${env.APP_ORIGIN}/verify-email#token=${raw}\nIf you did not register, ignore this message.`,
          `verify:${user.id}`,
        );
        await audit(tx, user.id, 'REGISTER', user.id, 'SUCCESS', req.correlationId);
      });
    }
    return {
      message:
        env.EMAIL_PROVIDER === 'unavailable'
          ? 'If these details can be registered, an account has been created. Email and SMS delivery are unavailable in this test pilot. Use an authorized fictional test account to test verified-account features.'
          : 'If these details can be registered, a verification email has been queued. Sign in to choose email or mobile verification first. Local email is captured by Mailpit; delivery is not guaranteed.',
    };
  }

  @Post('verify-email') async verifyEmail(@Body() body: unknown) {
    const { token: raw } = parse(z.object({ token: z.string().min(20).max(200) }), body);
    await db.$transaction(async (tx) => {
      const record = await tx.accountToken.findUnique({ where: { hash: hash(raw) } });
      if (!record || record.kind !== 'VERIFY' || record.usedAt || record.expiresAt < new Date())
        throw new BadRequestException('Verification link is invalid or expired.');
      const subject = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
      if (record.subjectHash && record.subjectHash !== privateHash(`email:${subject.email}`))
        throw new BadRequestException('This link no longer matches your email.');
      const used = await tx.accountToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw new BadRequestException('This link was already used.');
      await tx.user.update({ where: { id: record.userId }, data: { verifiedAt: new Date() } });
      await audit(tx, record.userId, 'EMAIL_VERIFIED');
    });
    return { message: 'Email verified. You can now log in.' };
  }

  @Post('login') async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = parse(loginSchema, body);
    const user = await db.user.findUnique({ where: { email: data.email } });
    const valid = user
      ? await argon2.verify(user.passwordHash, data.password)
      : (await passwordHash(data.password), false);
    if (!user || !valid || user.suspendedAt) {
      await audit(db, user?.id ?? null, 'LOGIN_FAILED', undefined, 'DENIED', req.correlationId);
      throw new UnauthorizedException('Email or password is incorrect, or the account is unavailable.');
    }
    // Unverified sessions are confined to contact verification/onboarding by account().
    const credentials = await db.$transaction(async (tx) => {
      if (req.session) await tx.session.deleteMany({ where: { id: req.session.id } });
      const credentials = await createSession(tx, user.id);
      await audit(tx, user.id, 'LOGIN', undefined, 'SUCCESS', req.correlationId);
      if (demoModeFor(user))
        await audit(
          tx,
          user.id,
          'LOCAL_DEMO_VERIFICATION_BYPASSED',
          user.id,
          'SUCCESS',
          req.correlationId,
          'Named local demo fixture: verification checks bypassed; password, session, role and resource checks retained.',
        );
      return credentials;
    });
    setSession(res, credentials);
    return { user: publicUser(user, false), demoMode: localDemoEnabled() };
  }

  @Post('logout') async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    if (req.session) {
      await db.session.deleteMany({ where: { id: req.session.id } });
      await audit(db, req.account!.id, 'LOGOUT');
    }
    res.clearCookie('ls_session', options);
    res.clearCookie('ls_csrf', { ...options, httpOnly: false });
    return { message: 'Logged out.' };
  }

  @Post('forgot-password') async forgot(@Body() body: unknown) {
    const { email } = parse(z.object({ email: z.email().transform((v) => v.toLowerCase()) }), body);
    const user = await db.user.findUnique({ where: { email } });
    if (user && !user.suspendedAt)
      await db.$transaction(async (tx) => {
        const raw = token();
        await tx.accountToken.create({
          data: {
            userId: user.id,
            hash: hash(raw),
            kind: 'RESET',
            expiresAt: new Date(Date.now() + 1800000),
          },
        });
        await queueMail(
          tx,
          user.email,
          'Reset your LaroSentry password',
          `Reset your password within 30 minutes:\n${env.APP_ORIGIN}/reset-password#token=${raw}\nIf you did not request this, ignore this message.`,
          `reset:${randomUUID()}`,
        );
        await audit(tx, user.id, 'PASSWORD_RESET_REQUESTED');
      });
    return { message: 'If an eligible account exists, a recovery email is on its way.' };
  }

  @Post('reset-password') async reset(@Body() body: unknown) {
    const data = parse(z.object({ token: z.string().min(20).max(200), password: passwordSchema }), body);
    const hashed = await passwordHash(data.password);
    await db.$transaction(async (tx) => {
      const record = await tx.accountToken.findUnique({ where: { hash: hash(data.token) } });
      if (!record || record.kind !== 'RESET' || record.usedAt || record.expiresAt < new Date())
        throw new BadRequestException('Recovery link is invalid or expired.');
      const changed = await tx.accountToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!changed.count) throw new BadRequestException('Recovery link already used.');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash: hashed } });
      await tx.accountToken.updateMany({
        where: { userId: record.userId, kind: 'RESET', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: record.userId } });
      await audit(tx, record.userId, 'PASSWORD_RESET');
    });
    return { message: 'Password changed. All sessions have been revoked.' };
  }

  @Get('sessions') async sessions(@Req() req: AuthRequest) {
    return db.session.findMany({
      where: {
        userId: account(req).id,
        expiresAt: { gt: new Date() },
        lastSeenAt: { gt: new Date(Date.now() - 1800000) },
      },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Delete('sessions/:id') async revoke(@Req() req: AuthRequest, @Param('id') id: string) {
    await db.session.deleteMany({ where: { id: uuid(id), userId: account(req).id } });
    await audit(db, account(req).id, 'SESSION_REVOKED', id);
    return { message: 'Session revoked.' };
  }
  @Post('change-password') async changePassword(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = account(req);
    const data = parse(z.object({ currentPassword: z.string().max(128), password: passwordSchema }), body);
    if (!(await argon2.verify(user.passwordHash, data.currentPassword)))
      throw new UnauthorizedException('Current password is incorrect.');
    const hashed = await passwordHash(data.password);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashed } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, user.id, 'PASSWORD_CHANGED');
    });
    res.clearCookie('ls_session', options);
    res.clearCookie('ls_csrf', { ...options, httpOnly: false });
    return { message: 'Password changed. Please log in again.' };
  }

  @Post('mfa/setup') async setupMfa(@Req() req: AuthRequest, @Body() body: unknown) {
    const user = account(req);
    const { password } = parse(z.object({ password: z.string().max(128) }), body);
    if (!(await argon2.verify(user.passwordHash, password)))
      throw new UnauthorizedException('Password is incorrect.');
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled.');
    const secret = generateSecret();
    await db.user.update({ where: { id: user.id }, data: { mfaSecret: encrypt(secret) } });
    return { secret, uri: generateURI({ issuer: 'LaroSentry', label: user.email, secret }) };
  }
  @Post('mfa/verify') async verifyMfa(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = account(req);
    const { code } = parse(z.object({ code: z.string().min(6).max(100) }), body);
    if (!user.mfaSecret) throw new BadRequestException('Set up MFA first.');
    const recovery = user.mfaEnabled
      ? await db.recoveryCode.findUnique({ where: { hash: hash(code) } })
      : null;
    const verified =
      recovery?.userId === user.id
        ? true
        : /^\d{6}$/.test(code) && (await verify({ secret: decrypt(user.mfaSecret), token: code })).valid;
    if (!verified) throw new UnauthorizedException('MFA code is invalid.');
    const recoveryCodes = user.mfaEnabled ? [] : Array.from({ length: 8 }, () => token());
    const credentials = await db.$transaction(async (tx) => {
      if (recovery?.userId === user.id) {
        const used = await tx.recoveryCode.deleteMany({ where: { id: recovery.id, userId: user.id } });
        if (!used.count) throw new UnauthorizedException('Recovery code already used.');
      } else {
        const step = BigInt(Math.floor(Date.now() / 30000));
        const changed = await tx.user.updateMany({
          where: { id: user.id, lastTotpStep: { lt: step } },
          data: { lastTotpStep: step, mfaEnabled: true },
        });
        if (!changed.count) throw new UnauthorizedException('Code already used. Wait for the next code.');
      }
      if (recoveryCodes.length)
        await tx.recoveryCode.createMany({
          data: recoveryCodes.map((raw) => ({ userId: user.id, hash: hash(raw) })),
        });
      await tx.session.deleteMany({ where: user.mfaEnabled ? { id: req.session!.id } : { userId: user.id } });
      await audit(tx, user.id, user.mfaEnabled ? 'MFA_VERIFIED' : 'MFA_ENABLED');
      return createSession(tx, user.id, true);
    });
    setSession(res, credentials);
    return { message: 'MFA verified.', recoveryCodes };
  }
  @Get('preferences') preferences(@Req() req: AuthRequest) {
    const user = account(req);
    return {
      publicProfile: user.publicProfile,
      emailNotifications: user.emailNotifications,
      deletionRequestedAt: user.deletionRequestedAt,
    };
  }
  @Post('preferences') async preferencesUpdate(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = parse(z.object({ publicProfile: z.boolean(), emailNotifications: z.boolean() }), body);
    await db.user.update({ where: { id: account(req).id }, data });
    return { message: 'Preferences saved.' };
  }
  @Post('deletion-request') async deletion(@Req() req: AuthRequest) {
    const user = account(req);
    await db.user.update({ where: { id: user.id }, data: { deletionRequestedAt: new Date() } });
    await audit(db, user.id, 'ACCOUNT_DELETION_REQUESTED');
    return {
      message:
        'Deletion request recorded for manual review. Existing reservations are not automatically cancelled.',
    };
  }
}
