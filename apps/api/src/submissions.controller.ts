import {
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
import { submitFacility } from './facility-verification.controller.js';

import { db } from './db.js';
import { account, parse, uuid, type AuthRequest } from './http.js';
import { audit } from './audit.js';
import { CommunityController } from './community.controller.js';
const pagingSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) });
@ApiTags('Applications and reporting')
@Controller()
export class SubmissionsController {
  @Post('facility-applications') async apply(@Req() req: AuthRequest, @Body() body: unknown) {
    const { draftId } = parse(z.object({ draftId: z.uuid() }).strict(), body);
    return submitFacility(req, draftId);
  }
  @Get('facility-applications') async applications(@Req() req: AuthRequest, @Query() query: unknown) {
    const user = account(req),
      { page } = parse(pagingSchema, query),
      where = { applicantId: user.id };
    const [rows, total] = await Promise.all([
      db.facilityApplication.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.facilityApplication.count({ where }),
    ]);
    const items = [];
    for (const row of rows) {
      const facility = await db.facility.findUniqueOrThrow({
        where: { id: row.facilityId },
        select: { name: true, slug: true, status: true },
      });
      const latest = await db.adminDecision.findFirst({
        where: { targetType: 'APPLICATION', targetId: row.id },
        orderBy: { createdAt: 'desc' },
        select: { action: true, reason: true, createdAt: true },
      });
      items.push({ ...row, facility, latest });
    }
    return { items, total, page, pageSize: 20 };
  }
  @Post('facility-applications/:id/reply') async reply(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = account(req);
    uuid(id);
    const { message } = parse(z.object({ message: z.string().trim().min(10).max(2000) }), body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "FacilityApplication" WHERE id=${id}::uuid FOR UPDATE`;
      const application = await tx.facilityApplication.findFirst({ where: { id, applicantId: user.id } });
      if (!application) throw new NotFoundException('Application not found.');
      if (application.state !== 'CLARIFICATION')
        throw new ConflictException('This application is not awaiting clarification.');
      if (application.draftId)
        throw new ConflictException(
          'Update the facility verification draft and resubmit its evidence for review.',
        );
      await tx.facilityApplication.update({
        where: { id },
        data: { applicantMessage: message, state: 'PENDING' },
      });
      await audit(tx, user.id, 'APPLICATION_CLARIFICATION_REPLIED', id, 'SUCCESS', req.correlationId);
      return { message: 'Clarification submitted for another review.' };
    });
  }
  @Post('reports') async submitReport(@Req() req: AuthRequest, @Body() body: unknown) {
    const user = account(req);
    const data = parse(
      z
        .object({
          targetType: z.enum(['SECURITY', 'GENERAL', 'FACILITY', 'GAME']),
          targetId: z.uuid().optional(),
          category: z.enum([
            'Security concern',
            'Privacy concern',
            'Conduct or abuse',
            'Facility concern',
            'Other',
          ]),
          details: z.string().trim().min(20).max(3000),
        })
        .refine(
          (v) => (['SECURITY', 'GENERAL'].includes(v.targetType) ? !v.targetId : !!v.targetId),
          'Provide a target ID only for a facility or game.',
        ),
      body,
    );
    if (
      data.targetType === 'FACILITY' &&
      !(await db.facility.findFirst({
        where: { id: data.targetId!, status: 'PUBLISHED' },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Facility not found.');
    if (data.targetType === 'GAME') await new CommunityController().detail(req, data.targetId!);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'reports:' + user.id},0))::text`;
      if (
        (await tx.userReport.count({
          where: { reporterId: user.id, createdAt: { gt: new Date(Date.now() - 86400000) } },
        })) >= 10
      )
        throw new ConflictException('Limit of ten reports per account per day reached.');
      const report = await tx.userReport.create({ data: { ...data, reporterId: user.id } });
      await audit(tx, user.id, 'REPORT_SUBMITTED', report.id, 'SUCCESS', req.correlationId);
      return {
        id: report.id,
        message:
          'Report received for fair human review. Track the response under My reports. No account is punished automatically.',
      };
    });
  }
  @Get('reports') async reports(@Req() req: AuthRequest, @Query() query: unknown) {
    const user = account(req),
      { page } = parse(pagingSchema, query),
      where = { reporterId: user.id };
    const [items, total] = await Promise.all([
      db.userReport.findMany({
        where,
        select: {
          id: true,
          targetType: true,
          category: true,
          details: true,
          state: true,
          resolution: true,
          createdAt: true,
          resolvedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      db.userReport.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  }
}
