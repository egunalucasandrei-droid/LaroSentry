import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { bothContacts } from './onboarding.controller.js';
import { workspaceMemberships } from './workspaces.controller.js';
import { parse, uuid, type AuthRequest } from './http.js';
import { hash, token } from './crypto.js';
import { queueMail } from './outbox.js';
import { audit } from './audit.js';
import { env } from './config.js';
const schema = z
  .object({
    email: z.email().transform((v) => v.trim().toLowerCase()),
    permissions: z
      .array(z.enum(['BOOKINGS', 'PAYMENTS', 'ATTENDANCE']))
      .min(1)
      .max(3),
    confirmed: z.literal(true),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
async function owner(req: AuthRequest, id: string) {
  const memberships = await workspaceMemberships(req, 'owner');
  if (!memberships.some((m) => m.facilityId === uuid(id)))
    throw new ForbiddenException('Facility owner access required.');
  return req.account!;
}
@Controller()
export class StaffInvitationsController {
  @Get('workspaces/owner/facilities/:id/invitations') async list(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    await owner(req, id);
    return {
      items: await db.staffInvitation.findMany({
        where: { facilityId: id },
        select: { id: true, email: true, permissions: true, state: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    };
  }
  @Post('workspaces/owner/facilities/:id/invitations') async invite(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const u = await owner(req, id),
      v = parse(schema, body),
      raw = token();
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Facility" WHERE id=${id}::uuid FOR UPDATE`;
      const member = await tx.membership.findUnique({
        where: { userId_facilityId: { userId: u.id, facilityId: id } },
      });
      if (member?.role !== 'OWNER') throw new ForbiddenException();
      const f = await tx.facility.findUniqueOrThrow({ where: { id } });
      if (f.status !== 'PUBLISHED')
        throw new ConflictException('Staff invitations require an approved, published facility.');
      if (
        (await tx.staffInvitation.count({
          where: { facilityId: id, createdAt: { gt: new Date(Date.now() - 3600000) } },
        })) >= 6
      )
        throw new ConflictException('Facility invitation limit reached.');
      const last = await tx.staffInvitation.findFirst({
        where: { facilityId: id, email: v.email, createdAt: { gt: new Date(Date.now() - 60000) } },
      });
      if (last) throw new ConflictException('Wait a minute before inviting that address again.');
      await tx.staffInvitation.updateMany({
        where: { facilityId: id, email: v.email, state: 'PENDING' },
        data: { state: 'REVOKED' },
      });
      const invite = await tx.staffInvitation.create({
        data: {
          facilityId: id,
          invitedBy: u.id,
          email: v.email,
          tokenHash: hash(raw),
          permissions: v.permissions,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      await queueMail(
        tx,
        v.email,
        'LaroSentry facility staff invitation',
        `You were invited to work at ${f.name}. Sign in or create an account, verify email and mobile, then accept within 7 days:\n${env.APP_ORIGIN}/staff-invitations#token=${raw}\nPermissions: ${v.permissions.join(', ')}. Ignore this if unexpected.`,
        `staff-invite:${randomUUID()}`,
      );
      await audit(tx, u.id, 'STAFF_INVITATION_QUEUED', id, 'SUCCESS', req.correlationId, v.reason);
      return {
        id: invite.id,
        message:
          'Invitation queued for email delivery. Acceptance and contact verification are required; access has not been granted.',
      };
    });
  }
  @Post('workspaces/owner/facilities/:id/invitations/:inviteId/revoke') async revoke(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @Body() body: unknown,
  ) {
    const u = await owner(req, id),
      v = parse(z.object({ confirmed: z.literal(true), reason: z.string().trim().min(10).max(1000) }), body);
    const updated = await db.staffInvitation.updateMany({
      where: { id: uuid(inviteId), facilityId: id, state: 'PENDING' },
      data: { state: 'REVOKED' },
    });
    if (!updated.count) throw new NotFoundException('Pending invitation not found.');
    await audit(db, u.id, 'STAFF_INVITATION_REVOKED', id, 'SUCCESS', req.correlationId, v.reason);
    return { message: 'Invitation revoked.' };
  }
  @Post('onboarding/staff-invitations/accept') async accept(@Req() req: AuthRequest, @Body() body: unknown) {
    const u = bothContacts(req),
      v = parse(z.object({ token: z.string().min(20).max(200) }).strict(), body);
    return db.$transaction(async (tx) => {
      const invite = await tx.staffInvitation.findUnique({ where: { tokenHash: hash(v.token) } });
      if (!invite) throw new NotFoundException('Invitation unavailable.');
      await tx.$queryRaw`SELECT id FROM "StaffInvitation" WHERE id=${invite.id}::uuid FOR UPDATE`;
      const current = await tx.staffInvitation.findUniqueOrThrow({ where: { id: invite.id } });
      if (current.state !== 'PENDING' || current.expiresAt <= new Date() || current.email !== u.email)
        throw new ForbiddenException(
          'Invitation is expired, unavailable or belongs to another email address.',
        );
      const inviter = await tx.membership.findUnique({
        where: { userId_facilityId: { userId: current.invitedBy, facilityId: current.facilityId } },
      });
      if (inviter?.role !== 'OWNER')
        throw new ForbiddenException('The inviter no longer has owner authority.');
      const existing = await tx.membership.findUnique({
        where: { userId_facilityId: { userId: u.id, facilityId: current.facilityId } },
      });
      if (existing?.role === 'OWNER' || u.role === 'ADMIN')
        throw new ConflictException('This invitation cannot change owners or administrator access.');
      await tx.membership.upsert({
        where: { userId_facilityId: { userId: u.id, facilityId: current.facilityId } },
        create: {
          userId: u.id,
          facilityId: current.facilityId,
          role: 'STAFF',
          permissions: current.permissions,
        },
        update: { permissions: current.permissions },
      });
      await tx.user.update({
        where: { id: u.id },
        data: {
          ...(u.role === 'PLAYER' ? { role: 'FACILITY_STAFF' } : {}),
          onboardingCompletedAt: u.onboardingCompletedAt ?? new Date(),
          purpose: u.purpose ?? 'PLAYER',
        },
      });
      await tx.staffInvitation.update({
        where: { id: current.id },
        data: { state: 'ACCEPTED', acceptedBy: u.id },
      });
      await tx.session.deleteMany({ where: { userId: u.id } });
      await audit(tx, u.id, 'STAFF_INVITATION_ACCEPTED', current.facilityId);
      return {
        message:
          'Invitation accepted for this facility only. Sign in again and verify MFA to enter the staff workspace.',
      };
    });
  }
}
