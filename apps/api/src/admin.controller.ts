import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db, type Tx } from './db.js';
import { administrator, parse, uuid, type AuthRequest } from './http.js';
import { adminWriter, decision, preserveAdminAccess } from './admin-access.js';
import { alertRules, alertWorker } from './security-alerts.js';
import { audit } from './audit.js';
import { demoModeFor } from './demo-access.js';

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  q: z.string().trim().max(100).default(''),
  state: z.string().max(30).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
const actionSchema = z.object({ reason: z.string().trim().min(10).max(1000), confirmed: z.literal(true) });
const safeUser = {
  id: true,
  nickname: true,
  email: true,
  role: true,
  verifiedAt: true,
  suspendedAt: true,
  mfaEnabled: true,
  createdAt: true,
} as const;
const size = 20;
const paging = (page: number) => ({ skip: (page - 1) * size, take: size });
const pageResult = <T>(items: T[], total: number, page: number) => ({ items, total, page, pageSize: size });
async function history(type: string, id: string) {
  return db.adminDecision.findMany({
    where: { targetType: type, targetId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
async function inform(tx: Tx, userId: string, title: string, href: string) {
  await tx.notification.create({ data: { userId, title, href } });
}

@ApiTags('Administration')
@Controller('admin')
export class AdminController {
  @Get('overview') async overview(@Req() req: AuthRequest) {
    await administrator(req);
    const [pendingApplications, openReports, unresolvedAlerts] = await Promise.all([
      db.facilityApplication.count({
        where: { state: { in: ['PENDING', 'UNDER_REVIEW', 'CLARIFICATION'] } },
      }),
      db.userReport.count({ where: { state: { in: ['OPEN', 'REVIEWING'] } } }),
      db.securityAlert.count({ where: { state: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
    ]);
    return { pendingApplications, openReports, unresolvedAlerts, checkedAt: new Date() };
  }
  @Get('applications') async applications(@Req() req: AuthRequest, @Query() query: unknown) {
    await administrator(req);
    const q = parse(pageSchema, query);
    const where: Prisma.FacilityApplicationWhereInput = {
      ...(q.state
        ? {
            state: parse(
              z.enum(['PENDING', 'UNDER_REVIEW', 'CLARIFICATION', 'APPROVED', 'REJECTED', 'SUSPENDED']),
              q.state,
            ),
          }
        : {}),
    };
    if (q.q) {
      where.facility = { name: { contains: q.q, mode: 'insensitive' } };
    }
    const [rows, total] = await Promise.all([
      db.facilityApplication.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...paging(q.page),
      }),
      db.facilityApplication.count({ where }),
    ]);
    const facilities = await db.facility.findMany({
      where: { id: { in: rows.map((r) => r.facilityId) } },
      select: { id: true, name: true, area: true },
    });
    return pageResult(
      rows.map((r) => ({
        id: r.id,
        state: r.state,
        createdAt: r.createdAt,
        facility: facilities.find((f) => f.id === r.facilityId),
      })),
      total,
      q.page,
    );
  }
  @Get('applications/:id') async application(@Req() req: AuthRequest, @Param('id') id: string) {
    const actor = await administrator(req);
    const application = await db.facilityApplication.findUnique({ where: { id: uuid(id) } });
    if (!application) throw new NotFoundException('Application not found.');
    const facility = await db.facility.findUniqueOrThrow({
      where: { id: application.facilityId },
      include: { courts: true },
    });
    const applicant = await db.user.findUnique({
      where: { id: application.applicantId },
      select: { id: true, nickname: true, verifiedAt: true, phoneVerifiedAt: true, suspendedAt: true },
    });
    await audit(db, actor.id, 'ADMIN_APPLICATION_VIEWED', id, 'SUCCESS', req.correlationId);
    const draft = application.draftId
      ? await db.facilityDraft.findUnique({
          where: { id: application.draftId },
          select: { data: true, relationship: true, idType: true },
        })
      : null;
    const documents = application.draftId
      ? await db.verificationDocument.findMany({
          where: { draftId: application.draftId },
          select: { id: true, kind: true, createdAt: true, expiresAt: true, deletedAt: true, bytes: true },
        })
      : [];
    return {
      ...application,
      facility,
      applicant,
      draft,
      documents,
      history: await history('APPLICATION', id),
    };
  }
  @Post('applications/:id/decision') async applicationDecision(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await administrator(req);
    uuid(id);
    const data = parse(
      actionSchema.extend({
        action: z.enum(['START_REVIEW', 'CLARIFY', 'APPROVE', 'REJECT', 'SUSPEND', 'REOPEN']),
        identityReviewed: z.boolean().default(false),
        facilityReviewed: z.boolean().default(false),
      }),
      body,
    );
    return db.$transaction(async (tx) => {
      const actor = await adminWriter(tx, req);
      await tx.$queryRaw`SELECT id FROM "FacilityApplication" WHERE id=${id}::uuid FOR UPDATE`;
      const application = await tx.facilityApplication.findUnique({ where: { id } });
      if (!application) throw new NotFoundException('Application not found.');
      if (application.applicantId === actor.id)
        throw new ConflictException('Another administrator must review your own application.');
      if (['START_REVIEW', 'SUSPEND', 'REOPEN'].includes(data.action)) {
        if (data.action === 'START_REVIEW' && !['PENDING', 'UNDER_REVIEW'].includes(application.state))
          throw new ConflictException('This application cannot enter review now.');
        if (data.action === 'START_REVIEW' && application.reviewerId && application.reviewerId !== actor.id)
          throw new ConflictException('This application is assigned to another reviewer.');
        if (data.action === 'SUSPEND' && application.state !== 'APPROVED')
          throw new ConflictException('Only an approved application can be suspended.');
        if (data.action === 'REOPEN' && !['SUSPENDED', 'REJECTED'].includes(application.state))
          throw new ConflictException('Only suspended or rejected applications can be reopened.');
        const state = data.action === 'SUSPEND' ? 'SUSPENDED' : 'UNDER_REVIEW';
        await tx.facilityApplication.update({ where: { id }, data: { state, reviewerId: actor.id } });
        if (data.action !== 'START_REVIEW')
          await tx.facility.update({
            where: { id: application.facilityId },
            data: { status: 'UNPUBLISHED' },
          });
        await decision(
          tx,
          actor.id,
          'APPLICATION',
          id,
          `APPLICATION_${data.action}`,
          data.reason,
          req.correlationId,
          application.state,
          state,
        );
        await inform(tx, application.applicantId, `Application ${state.toLowerCase()}`, '/app/applications');
        return { message: `Application ${state.toLowerCase()} recorded.`, state };
      }
      if (
        !['PENDING', 'UNDER_REVIEW', 'CLARIFICATION'].includes(application.state) ||
        (data.action !== 'REJECT' && !['PENDING', 'UNDER_REVIEW'].includes(application.state))
      )
        throw new ConflictException('This decision is not available in the current application state.');
      const applicant = await tx.user.findUniqueOrThrow({ where: { id: application.applicantId } });
      const demoReview = demoModeFor(actor) && demoModeFor(applicant);
      if (application.draftId) {
        if (
          application.reviewerId !== actor.id ||
          (application.state !== 'UNDER_REVIEW' &&
            !(application.state === 'CLARIFICATION' && data.action === 'REJECT'))
        )
          throw new ConflictException('Start this review before recording a decision.');
        if (data.action === 'APPROVE' && !demoReview) {
          if (!data.identityReviewed || !data.facilityReviewed || !applicant.phoneVerifiedAt)
            throw new ConflictException(
              'Review identity/authority evidence and verify both applicant contacts before approval.',
            );
          const active = await tx.verificationDocument.count({
            where: {
              draftId: application.draftId,
              kind: 'IDENTITY',
              deletedAt: null,
              expiresAt: { gt: new Date() },
            },
          });
          if (active !== 1)
            throw new ConflictException(
              'Identity evidence is unavailable or expired. Request more information.',
            );
          const evidence = await tx.verificationDocument.findMany({
            where: { draftId: application.draftId, deletedAt: null, expiresAt: { gt: new Date() } },
            select: { kind: true },
          });
          const draft = await tx.facilityDraft.findUniqueOrThrow({ where: { id: application.draftId } });
          const explanation = (draft.data as Record<string, unknown>).evidenceExplanation;
          if (
            !evidence.some((d) => d.kind === 'PHOTO') ||
            (!evidence.some((d) => d.kind === 'SUPPORT') &&
              (draft.relationship !== 'OWNER' || typeof explanation !== 'string' || explanation.length < 20))
          )
            throw new ConflictException(
              'Facility/authority evidence is missing or expired. Request more information.',
            );
        }
      }
      if (data.action === 'APPROVE' && (applicant.suspendedAt || (!applicant.verifiedAt && !demoReview)))
        throw new ConflictException('The applicant must be verified and unrestricted before approval.');
      const state =
        data.action === 'APPROVE' ? 'APPROVED' : data.action === 'REJECT' ? 'REJECTED' : 'CLARIFICATION';
      await tx.facilityApplication.update({
        where: { id },
        data: {
          state,
          ...(data.action === 'APPROVE' && application.draftId
            ? {
                identityState: demoReview ? 'DEMO_BYPASSED' : 'MANUALLY_REVIEWED',
                facilityState: demoReview ? 'DEMO_BYPASSED' : 'MANUALLY_REVIEWED',
              }
            : {}),
        },
      });
      if (demoReview && data.action === 'APPROVE')
        await audit(
          tx,
          actor.id,
          'LOCAL_DEMO_APPLICATION_REVIEW_BYPASSED',
          id,
          'SUCCESS',
          req.correlationId,
          data.reason,
        );
      if (application.draftId) {
        if (data.action === 'CLARIFY')
          await tx.facilityDraft.update({ where: { id: application.draftId }, data: { stage: 'DRAFT' } });
        if (['APPROVE', 'REJECT'].includes(data.action))
          await tx.verificationDocument.updateMany({
            where: { draftId: application.draftId, expiresAt: { gt: new Date(Date.now() + 7 * 86400000) } },
            data: { expiresAt: new Date(Date.now() + 7 * 86400000) },
          });
      }
      await tx.facility.update({
        where: { id: application.facilityId },
        data: {
          status: data.action === 'APPROVE' ? 'PUBLISHED' : data.action === 'REJECT' ? 'REJECTED' : 'PENDING',
        },
      });
      if (data.action === 'APPROVE') {
        await tx.membership.upsert({
          where: {
            userId_facilityId: { userId: application.applicantId, facilityId: application.facilityId },
          },
          create: {
            userId: application.applicantId,
            facilityId: application.facilityId,
            role: 'OWNER',
            permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'],
          },
          update: { role: 'OWNER', permissions: ['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'] },
        });
        await audit(
          tx,
          actor.id,
          'FACILITY_OWNER_PERMISSION_GRANTED',
          application.facilityId,
          'SUCCESS',
          req.correlationId,
          data.reason,
        );
        if (['PLAYER', 'FACILITY_STAFF'].includes(applicant.role)) {
          await tx.user.update({ where: { id: applicant.id }, data: { role: 'FACILITY_OWNER' } });
          await tx.session.deleteMany({ where: { userId: applicant.id } });
        }
      }
      await decision(
        tx,
        actor.id,
        'APPLICATION',
        id,
        `APPLICATION_${state}`,
        data.reason,
        req.correlationId,
        application.state,
        state,
      );
      await inform(
        tx,
        application.applicantId,
        `Facility application ${state.toLowerCase()}`,
        '/app/applications',
      );
      return {
        message:
          data.action === 'APPROVE'
            ? 'Application approved and facility published. Owner access requires MFA.'
            : `Application ${state.toLowerCase()} recorded.`,
        state,
      };
    });
  }
  @Get('users') async users(@Req() req: AuthRequest, @Query() query: unknown) {
    await administrator(req);
    const q = parse(pageSchema, query);
    const where: Prisma.UserWhereInput = {
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { nickname: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.user.findMany({
        where,
        select: safeUser,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...paging(q.page),
      }),
      db.user.count({ where }),
    ]);
    return pageResult(items, total, q.page);
  }
  @Get('users/:id') async user(@Req() req: AuthRequest, @Param('id') id: string) {
    const actor = await administrator(req);
    const user = await db.user.findUnique({ where: { id: uuid(id) }, select: safeUser });
    if (!user) throw new NotFoundException('User not found.');
    await audit(db, actor.id, 'ADMIN_USER_VIEWED', id, 'SUCCESS', req.correlationId);
    return { ...user, history: await history('USER', id) };
  }
  @Post('users/:id/restriction') async restrict(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await administrator(req);
    uuid(id);
    const data = parse(actionSchema.extend({ restricted: z.boolean() }), body);
    return db.$transaction(async (tx) => {
      const actor = await adminWriter(tx, req);
      if (id === actor.id) throw new ConflictException('You cannot restrict your own administrator account.');
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('User not found.');
      if (!!user.suspendedAt === data.restricted)
        throw new ConflictException('The account already has this restriction state.');
      if (data.restricted) await preserveAdminAccess(tx, id);
      await tx.user.update({ where: { id }, data: { suspendedAt: data.restricted ? new Date() : null } });
      await tx.session.deleteMany({ where: { userId: id } });
      await decision(
        tx,
        actor.id,
        'USER',
        id,
        data.restricted ? 'ACCOUNT_RESTRICTED' : 'ACCOUNT_RESTORED',
        data.reason,
        req.correlationId,
      );
      await inform(
        tx,
        id,
        data.restricted
          ? 'Your account access has been restricted pending review.'
          : 'Your account access has been restored. Sign in again.',
        '/app/settings/profile',
      );
      return {
        message: data.restricted
          ? 'Account restricted and sessions revoked. Existing bookings and payment records are preserved.'
          : 'Restriction removed. The user can sign in again.',
      };
    });
  }
  @Get('reports') async reports(@Req() req: AuthRequest, @Query() query: unknown) {
    await administrator(req);
    const q = parse(pageSchema, query);
    const where: Prisma.UserReportWhereInput = {
      ...(q.state ? { state: parse(z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']), q.state) } : {}),
      ...(q.q ? { category: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      db.userReport.findMany({
        where,
        select: { id: true, targetType: true, category: true, state: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...paging(q.page),
      }),
      db.userReport.count({ where }),
    ]);
    return pageResult(items, total, q.page);
  }
  @Get('reports/:id') async report(@Req() req: AuthRequest, @Param('id') id: string) {
    const actor = await administrator(req);
    const report = await db.userReport.findUnique({ where: { id: uuid(id) } });
    if (!report) throw new NotFoundException('Report not found.');
    const reporter = await db.user.findUnique({
      where: { id: report.reporterId },
      select: { id: true, nickname: true },
    });
    await audit(db, actor.id, 'ADMIN_REPORT_VIEWED', id, 'SUCCESS', req.correlationId);
    return { ...report, reporter, history: await history('REPORT', id) };
  }
  @Post('reports/:id/decision') async reportDecision(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await administrator(req);
    uuid(id);
    const data = parse(
      actionSchema.extend({ state: z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']) }),
      body,
    );
    return db.$transaction(async (tx) => {
      const actor = await adminWriter(tx, req);
      const report = await tx.userReport.findUnique({ where: { id } });
      if (!report) throw new NotFoundException('Report not found.');
      if (report.reporterId === actor.id)
        throw new ConflictException('Another administrator must decide your own report.');
      if (report.state === data.state) throw new ConflictException('Report already has this status.');
      const closed = ['RESOLVED', 'DISMISSED'].includes(data.state);
      if (['RESOLVED', 'DISMISSED'].includes(report.state) && data.state !== 'OPEN')
        throw new ConflictException('Reopen this report before recording a new decision.');
      await tx.userReport.update({
        where: { id },
        data: {
          state: data.state,
          resolution: data.reason,
          resolvedBy: closed ? actor.id : null,
          resolvedAt: closed ? new Date() : null,
        },
      });
      await decision(tx, actor.id, 'REPORT', id, `REPORT_${data.state}`, data.reason, req.correlationId);
      await inform(tx, report.reporterId, 'Your report has a review update.', '/app/reports');
      return { message: 'Report decision recorded. No account restriction was applied automatically.' };
    });
  }
  @Get('alerts') async alerts(@Req() req: AuthRequest, @Query() query: unknown) {
    await administrator(req);
    const q = parse(pageSchema, query);
    const where: Prisma.SecurityAlertWhereInput = {
      ...(q.state ? { state: parse(z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']), q.state) } : {}),
      ...(q.q ? { rule: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      db.securityAlert.findMany({
        where,
        select: { id: true, rule: true, severity: true, state: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...paging(q.page),
      }),
      db.securityAlert.count({ where }),
    ]);
    return pageResult(items, total, q.page);
  }
  @Get('alerts/:id') async alert(@Req() req: AuthRequest, @Param('id') id: string) {
    await administrator(req);
    const alert = await db.securityAlert.findUnique({ where: { id: uuid(id) } });
    if (!alert) throw new NotFoundException('Alert not found.');
    const events = await db.auditEvent.findMany({
      where: { id: { in: alert.eventIds } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return {
      ...alert,
      explanation:
        alertRules.find((r) => r.action === alert.rule)?.description ??
        'Legacy rule: inspect supporting events.',
      events,
      history: await history('ALERT', id),
    };
  }
  @Post('alerts/:id/decision') async alertDecision(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await administrator(req);
    uuid(id);
    const data = parse(actionSchema.extend({ state: z.enum(['ACKNOWLEDGED', 'RESOLVED']) }), body);
    return db.$transaction(async (tx) => {
      const actor = await adminWriter(tx, req);
      const alert = await tx.securityAlert.findUnique({ where: { id } });
      if (!alert) throw new NotFoundException('Alert not found.');
      if (alert.state === 'RESOLVED' || alert.state === data.state)
        throw new ConflictException('Alert is already in this state or resolved.');
      if (data.state === 'RESOLVED' && alert.state !== 'ACKNOWLEDGED')
        throw new ConflictException('Acknowledge this alert before resolving it.');
      await tx.securityAlert.update({
        where: { id },
        data: {
          state: data.state,
          note: data.reason,
          ...(data.state === 'ACKNOWLEDGED'
            ? { acknowledgedBy: actor.id, acknowledgedAt: new Date() }
            : { resolvedBy: actor.id, resolvedAt: new Date() }),
        },
      });
      await decision(tx, actor.id, 'ALERT', id, `ALERT_${data.state}`, data.reason, req.correlationId);
      return {
        message: 'Alert review recorded. This does not establish wrongdoing or restrict any account.',
      };
    });
  }
  @Get('audit') async auditList(@Req() req: AuthRequest, @Query() query: unknown) {
    await administrator(req);
    const q = parse(pageSchema, query);
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('Start date must precede end date.');
    const where: Prisma.AuditEventWhereInput = {
      ...(q.q
        ? {
            OR: [
              { action: { contains: q.q, mode: 'insensitive' } },
              { outcome: { contains: q.q, mode: 'insensitive' } },
              { resourceId: { contains: q.q, mode: 'insensitive' } },
              ...(z.uuid().safeParse(q.q).success ? [{ actorId: q.q }, { id: q.q }] : []),
            ],
          }
        : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00+08:00`) } : {}),
              ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00+08:00`).getTime() + 86400000) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.auditEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...paging(q.page) }),
      db.auditEvent.count({ where }),
    ]);
    const actors = await db.user.findMany({
      where: { id: { in: items.flatMap((i) => (i.actorId ? [i.actorId] : [])) } },
      select: { id: true, nickname: true },
    });
    return pageResult(
      items.map((i) => ({
        ...i,
        actor: actors.find((a) => a.id === i.actorId)?.nickname ?? 'System / local operator',
      })),
      total,
      q.page,
    );
  }
  @Get('audit/:id') async auditDetail(@Req() req: AuthRequest, @Param('id') id: string) {
    await administrator(req);
    const event = await db.auditEvent.findUnique({ where: { id: uuid(id) } });
    if (!event) throw new NotFoundException('Audit event not found.');
    return event;
  }
  @Get('health') async health(@Req() req: AuthRequest) {
    await administrator(req);
    const start = performance.now();
    await db.$queryRaw`SELECT 1`;
    const queryMilliseconds = Math.round((performance.now() - start) * 100) / 100;
    const [pendingMail, failedMail, lastDelivery, oldestPending] = await Promise.all([
      db.outbox.count({ where: { deliveredAt: null } }),
      db.outbox.count({ where: { deliveredAt: null, attempts: { gte: 10 } } }),
      db.outbox.findFirst({
        where: { deliveredAt: { not: null } },
        orderBy: { deliveredAt: 'desc' },
        select: { deliveredAt: true },
      }),
      db.outbox.findFirst({
        where: { deliveredAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      checkedAt: new Date(),
      api: 'Responding',
      database: 'Query succeeded',
      queryMilliseconds,
      uptimeSeconds: Math.floor(process.uptime()),
      pendingMail,
      failedMail,
      lastMailDeliveredAt: lastDelivery?.deliveredAt ?? null,
      oldestPendingMailAt: oldestPending?.createdAt ?? null,
      alertWorker,
      smtp: 'Not actively probed; delivery history is shown, not a guarantee of current SMTP availability.',
      exports: 'Disabled',
      files: 'No admin file service enabled',
    };
  }
}
