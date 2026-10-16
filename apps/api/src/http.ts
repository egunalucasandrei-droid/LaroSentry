import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import type { Session, User } from '@prisma/client';
import { z } from 'zod';
import { db } from './db.js';
import { hash } from './crypto.js';
import { env } from './config.js';
import { audit } from './audit.js';
import { demoSessionVerified } from './demo-access.js';
export type AuthRequest = Request & { account?: User; session?: Session; correlationId: string };
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
  return result.data;
}
export function sessionAccount(req: AuthRequest) {
  if (!req.account || !req.session) throw new UnauthorizedException('Please sign in again.');
  return req.account;
}
export function account(req: AuthRequest) {
  const user = sessionAccount(req);
  if (!user.verifiedAt || (user.contactRequired && !user.phoneVerifiedAt))
    throw new ForbiddenException(
      'Complete email and mobile verification in Account verification before using this feature.',
    );
  return user;
}
export async function privileged(req: AuthRequest, facilityId?: string, permission?: string) {
  const user = account(req);
  if (!user.phoneVerifiedAt && !demoSessionVerified(req.session, user))
    throw new ForbiddenException(
      'Verify your mobile number in Account verification before privileged access.',
    );
  if (!['FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'].includes(user.role))
    throw new ForbiddenException('Facility workspace access required.');
  if ((!user.mfaEnabled || !req.session?.mfaVerified) && !demoSessionVerified(req.session, user))
    throw new ForbiddenException('Set up and verify MFA to access the facility workspace.');
  const membership = facilityId
    ? await db.membership.findUnique({ where: { userId_facilityId: { userId: user.id, facilityId } } })
    : null;
  if (
    facilityId
      ? !membership ||
        (membership.role !== 'OWNER' && !membership.permissions.includes(permission ?? 'BOOKINGS'))
      : !['FACILITY_OWNER', 'FACILITY_STAFF', 'ADMIN'].includes(user.role)
  ) {
    await audit(db, user.id, 'ACCESS_DENIED', facilityId, 'DENIED', req.correlationId);
    throw new ForbiddenException('You do not have permission for this facility.');
  }
  return user;
}
export async function administrator(req: AuthRequest) {
  const user = account(req);
  if (
    user.role !== 'ADMIN' ||
    !user.verifiedAt ||
    (!user.phoneVerifiedAt && !demoSessionVerified(req.session, user)) ||
    ((!user.mfaEnabled || !req.session?.mfaVerified) && !demoSessionVerified(req.session, user))
  ) {
    await audit(db, user.id, 'ADMIN_ACCESS_DENIED', undefined, 'DENIED', req.correlationId);
    throw new ForbiddenException(
      user.role !== 'ADMIN'
        ? 'Administrator access required.'
        : 'Verify administrator MFA before accessing this workspace.',
    );
  }
  return user;
}
export async function sessionMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (req.cookies?.ls_session) {
      const session = await db.session.findUnique({
        where: { tokenHash: hash(String(req.cookies.ls_session)) },
        include: { user: true },
      });
      if (
        session &&
        !session.user.suspendedAt &&
        session.expiresAt > new Date() &&
        session.lastSeenAt.getTime() > Date.now() - 30 * 60 * 1000
      ) {
        req.account = session.user;
        req.session = session;
        if (session.lastSeenAt.getTime() < Date.now() - 60000)
          await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
      }
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin !== env.APP_ORIGIN)
        throw new ForbiddenException('Request origin is not allowed.');
      if (!req.is('application/json')) throw new BadRequestException('Send application/json.');
      if (
        req.session &&
        (typeof req.headers['x-csrf-token'] !== 'string' ||
          hash(req.headers['x-csrf-token']) !== req.session.csrfHash)
      )
        throw new ForbiddenException('CSRF validation failed. Refresh this page and try again.');
    }
    next();
  } catch (error) {
    next(error);
  }
}
export const uuid = (value: string) => parse(z.uuid(), value);
