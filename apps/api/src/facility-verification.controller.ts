import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import sharp from 'sharp';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { phoneSchema, sports } from '@larosentry/contracts';
import { db } from './db.js';
import { administrator, parse, uuid, type AuthRequest } from './http.js';
import { bothContacts } from './onboarding.controller.js';
import { demoModeFor } from './demo-access.js';
import { decrypt, encrypt } from './crypto.js';
import { audit } from './audit.js';

export const idTypes = () =>
  (process.env.VERIFICATION_ID_TYPES ?? 'Philippine National ID,Passport,Driver’s License,UMID,PRC ID')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);
const fields = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  area: z.string().trim().min(3).max(80).optional(),
  address: z.string().trim().min(10).max(250).optional(),
  description: z.string().trim().min(20).max(2000).optional(),
  amenities: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  openHour: z.number().int().min(0).max(23).optional(),
  closeHour: z.number().int().min(1).max(24).optional(),
  cancellationPolicy: z.string().trim().min(20).max(1500).optional(),
  courtName: z.string().trim().min(2).max(80).optional(),
  sport: z.enum(sports).optional(),
  hourlyRate: z.number().int().min(0).max(10000000).optional(),
  capacity: z.number().int().min(1).max(40).optional(),
  facilityPhone: phoneSchema.optional(),
  facilityEmail: z.union([z.email(), z.literal('')]).optional(),
  evidenceExplanation: z.string().trim().max(1000).optional(),
});
export const completeFacility = fields
  .required({
    name: true,
    area: true,
    address: true,
    description: true,
    latitude: true,
    longitude: true,
    openHour: true,
    closeHour: true,
    cancellationPolicy: true,
    courtName: true,
    sport: true,
    hourlyRate: true,
    capacity: true,
    facilityPhone: true,
  })
  .refine((v) => v.openHour < v.closeHour, 'Opening hour must precede closing hour.');
export async function ownDraft(req: AuthRequest, id: string) {
  const u = bothContacts(req);
  const draft = await db.facilityDraft.findFirst({ where: { id: uuid(id), userId: u.id } });
  if (!draft) throw new NotFoundException('Draft not found.');
  return draft;
}
const documentMetadata = {
  id: true,
  kind: true,
  bytes: true,
  createdAt: true,
  expiresAt: true,
  deletedAt: true,
} as const;
export async function submitFacility(req: AuthRequest, id: string) {
  const u = bothContacts(req);
  uuid(id);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id}::uuid FOR UPDATE`;
    const currentUser = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!demoModeFor(currentUser) && (!currentUser.verifiedAt || !currentUser.phoneVerifiedAt))
      throw new ForbiddenException('Verify both contacts before submitting.');
    await tx.$queryRaw`SELECT id FROM "FacilityDraft" WHERE id=${id}::uuid FOR UPDATE`;
    const draft = await tx.facilityDraft.findFirst({ where: { id, userId: u.id } });
    if (!draft) throw new NotFoundException('Draft not found.');
    if (draft.stage !== 'DRAFT') throw new ConflictException('This draft is already submitted.');
    const data = parse(completeFacility, draft.data),
      docs = await tx.verificationDocument.findMany({
        where: { draftId: id, deletedAt: null, expiresAt: { gt: new Date() } },
      });
    if (
      !demoModeFor(currentUser) &&
      (!draft.idType ||
        !idTypes().includes(draft.idType) ||
        docs.filter((d) => d.kind === 'IDENTITY').length !== 1)
    )
      throw new BadRequestException('Submit one supported identity image.');
    if (!demoModeFor(currentUser) && !docs.some((d) => d.kind === 'PHOTO'))
      throw new BadRequestException('Submit at least one facility photo.');
    if (
      !demoModeFor(currentUser) &&
      !docs.some((d) => d.kind === 'SUPPORT') &&
      (draft.relationship !== 'OWNER' || (data.evidenceExplanation?.length ?? 0) < 20)
    )
      throw new BadRequestException(
        'Managers/representatives need authorization evidence. Owners need supporting evidence or an explanation for admin review.',
      );
    const facilityData = {
      name: data.name,
      area: data.area,
      address: data.address,
      description: data.description,
      latitude: data.latitude,
      longitude: data.longitude,
      openHour: data.openHour,
      closeHour: data.closeHour,
      cancellationPolicy: data.cancellationPolicy,
      amenities: data.amenities ?? [],
      status: 'PENDING',
    };
    const prior = await tx.facilityApplication.findUnique({ where: { draftId: id } });
    if (
      !prior &&
      (await tx.facilityApplication.count({
        where: { applicantId: u.id, createdAt: { gt: new Date(Date.now() - 86400000) } },
      })) >= 3
    )
      throw new ConflictException('Limit of three new facility applications per account per day reached.');
    let facilityId: string;
    if (prior) {
      if (prior.state !== 'CLARIFICATION')
        throw new ConflictException('This application is not awaiting more information.');
      facilityId = prior.facilityId;
      await tx.facility.update({ where: { id: facilityId }, data: facilityData });
      const court = await tx.court.findFirstOrThrow({ where: { facilityId }, orderBy: { id: 'asc' } });
      await tx.court.update({
        where: { id: court.id },
        data: {
          name: data.courtName,
          sport: data.sport,
          hourlyRate: data.hourlyRate,
          capacity: data.capacity,
        },
      });
    } else {
      const facility = await tx.facility.create({
        data: {
          ...facilityData,
          slug: `application-${randomUUID()}`,
          courts: {
            create: {
              name: data.courtName,
              sport: data.sport,
              hourlyRate: data.hourlyRate,
              capacity: data.capacity,
            },
          },
        },
      });
      facilityId = facility.id;
    }
    const application = prior
      ? await tx.facilityApplication.update({
          where: { id: prior.id },
          data: {
            state: 'PENDING',
            identityState: 'SUBMITTED',
            facilityState: 'SUBMITTED',
            reviewerId: null,
          },
        })
      : await tx.facilityApplication.create({
          data: {
            facilityId,
            applicantId: u.id,
            draftId: id,
            identityState: 'SUBMITTED',
            facilityState: 'SUBMITTED',
          },
        });
    await tx.facilityDraft.update({ where: { id }, data: { stage: 'SUBMITTED' } });
    if (demoModeFor(currentUser)) {
      await tx.facilityApplication.update({
        where: { id: application.id },
        data: { identityState: 'DEMO_BYPASSED' },
      });
      await audit(
        tx,
        u.id,
        'LOCAL_DEMO_APPLICATION_EVIDENCE_BYPASSED',
        application.id,
        'SUCCESS',
        req.correlationId,
        'Local fixture evidence requirements bypassed; application still requires independent admin approval.',
      );
    }
    await tx.user.update({
      where: { id: u.id },
      data: { onboardingCompletedAt: new Date(), purpose: 'HOST' },
    });
    await audit(tx, u.id, prior ? 'APPLICATION_RESUBMITTED' : 'APPLICATION_SUBMITTED', application.id);
    return {
      id: application.id,
      message:
        'Application submitted for review. The facility is not publicly listed. Documents are submitted, not verified.',
    };
  });
}
@Controller()
export class FacilityVerificationController {
  @Get('onboarding/drafts') async drafts(@Req() req: AuthRequest) {
    const u = bothContacts(req);
    return {
      items: await db.facilityDraft.findMany({
        where: { userId: u.id },
        select: { id: true, stage: true, updatedAt: true, relationship: true },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      idTypes: idTypes(),
    };
  }
  @Post('onboarding/drafts') async create(@Req() req: AuthRequest) {
    const u = bothContacts(req);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id}::uuid FOR UPDATE`;
      if ((await tx.facilityDraft.count({ where: { userId: u.id, stage: 'DRAFT' } })) >= 3)
        throw new ConflictException('Complete one of your three existing drafts first.');
      return tx.facilityDraft.create({ data: { userId: u.id } });
    });
  }
  @Get('onboarding/drafts/:id') async detail(@Req() req: AuthRequest, @Param('id') id: string) {
    const draft = await ownDraft(req, id);
    return {
      ...draft,
      documents: await db.verificationDocument.findMany({
        where: { draftId: id },
        select: documentMetadata,
        orderBy: { createdAt: 'desc' },
      }),
      application: await db.facilityApplication.findUnique({
        where: { draftId: id },
        select: { id: true, state: true, identityState: true, facilityState: true, createdAt: true },
      }),
      idTypes: idTypes(),
    };
  }
  @Post('onboarding/drafts/:id') async save(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await ownDraft(req, id);
    const v = parse(
      z.object({
        data: fields,
        relationship: z.enum(['OWNER', 'MANAGER', 'REPRESENTATIVE']),
        idType: z.string().max(80).nullable(),
      }),
      body,
    );
    if (v.idType && !idTypes().includes(v.idType))
      throw new BadRequestException('Choose a supported ID type.');
    const changed = await db.facilityDraft.updateMany({
      where: { id, userId: req.account!.id, stage: 'DRAFT' },
      data: { data: v.data, relationship: v.relationship, idType: v.idType },
    });
    if (!changed.count)
      throw new ConflictException('Submitted drafts cannot be edited until clarification is requested.');
    return { message: 'Draft saved privately.' };
  }
  @Post('onboarding/drafts/:id/documents') async upload(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const draft = await ownDraft(req, id);
    if (draft.stage !== 'DRAFT') throw new ConflictException('Submitted documents are locked.');
    const v = parse(
        z
          .object({
            kind: z.enum(['IDENTITY', 'SUPPORT', 'PHOTO']),
            base64: z
              .string()
              .min(16)
              .max(2796204)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
        body,
      ),
      input = Buffer.from(v.base64, 'base64');
    if (
      input.length > 2 * 1024 * 1024 ||
      !(
        input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        input.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      )
    )
      throw new BadRequestException(
        'Only PNG or JPEG images up to 2 MB are accepted. PDFs, SVG and executable content are not accepted.',
      );
    const owned = await db.facilityDraft.findMany({ where: { userId: draft.userId }, select: { id: true } });
    if (
      (await db.verificationDocument.count({
        where: {
          draftId: { in: owned.map((d) => d.id) },
          createdAt: { gt: new Date(Date.now() - 86400000) },
        },
      })) >= 20
    )
      throw new ConflictException('Daily document upload limit reached.');
    let image: Buffer;
    try {
      const img = sharp(input, { limitInputPixels: 12000000, failOn: 'warning' });
      const meta = await img.metadata();
      if (!['png', 'jpeg'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
        throw new Error('Unsupported image');
      image = await img
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      if (image.length > 8 * 1024 * 1024) throw new Error('Image too large');
    } catch {
      throw new BadRequestException(
        'Image could not be safely decoded. Use a clear, single-frame PNG/JPEG photo.',
      );
    }
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${draft.userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "FacilityDraft" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.facilityDraft.findUniqueOrThrow({ where: { id } });
      if (current.stage !== 'DRAFT') throw new ConflictException('Submitted documents are locked.');
      const active = await tx.verificationDocument.count({
        where: { draftId: id, deletedAt: null, expiresAt: { gt: new Date() } },
      });
      if (active >= 6) throw new ConflictException('Maximum six active images per draft.');
      if (
        v.kind === 'IDENTITY' &&
        (await tx.verificationDocument.count({
          where: { draftId: id, kind: 'IDENTITY', deletedAt: null, expiresAt: { gt: new Date() } },
        }))
      )
        throw new ConflictException('Remove the existing identity image before replacing it.');
      if (
        (await tx.verificationDocument.count({
          where: {
            draftId: { in: owned.map((d) => d.id) },
            createdAt: { gt: new Date(Date.now() - 86400000) },
          },
        })) >= 20
      )
        throw new ConflictException('Daily document upload limit reached.');
      const doc = await tx.verificationDocument.create({
        data: {
          draftId: id,
          kind: v.kind,
          encryptedContent: encrypt(image.toString('base64')),
          bytes: image.length,
          expiresAt: new Date(Date.now() + 30 * 86400000),
        },
        select: documentMetadata,
      });
      await audit(tx, draft.userId, 'VERIFICATION_DOCUMENT_SUBMITTED', doc.id);
      return {
        ...doc,
        message: 'Submitted for verification. Upload does not establish identity or facility approval.',
      };
    });
  }
  @Post('onboarding/drafts/:id/documents/:documentId/remove') async remove(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    const d = await ownDraft(req, id);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "FacilityDraft" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.facilityDraft.findUniqueOrThrow({ where: { id } });
      if (current.stage !== 'DRAFT') throw new ConflictException('Submitted documents are locked.');
      const changed = await tx.verificationDocument.updateMany({
        where: { id: uuid(documentId), draftId: id, deletedAt: null },
        data: { encryptedContent: null, deletedAt: new Date() },
      });
      if (!changed.count) throw new NotFoundException();
      await audit(tx, d.userId, 'VERIFICATION_DOCUMENT_REMOVED', documentId);
      return { message: 'Document content removed. Minimal audit metadata remains.' };
    });
  }
  @Post('onboarding/drafts/:id/submit') async submit(@Req() req: AuthRequest, @Param('id') id: string) {
    return submitFacility(req, id);
  }
  @Get('admin/applications/:id/documents/:documentId') async file(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const actor = await administrator(req);
    const application = await db.facilityApplication.findUnique({ where: { id: uuid(id) } });
    if (
      !application ||
      application.reviewerId !== actor.id ||
      !application.draftId ||
      !['UNDER_REVIEW', 'CLARIFICATION'].includes(application.state)
    )
      throw new ForbiddenException('Claim this application review before accessing its documents.');
    const doc = await db.verificationDocument.findFirst({
      where: {
        id: uuid(documentId),
        draftId: application.draftId,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!doc?.encryptedContent)
      throw new NotFoundException('Document is unavailable or expired. Request new evidence if needed.');
    await audit(db, actor.id, 'ADMIN_VERIFICATION_DOCUMENT_VIEWED', doc.id, 'SUCCESS', req.correlationId);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="verification-${doc.id}.png"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(decrypt(doc.encryptedContent), 'base64'));
  }
}
export async function purgeVerificationContent() {
  const now = new Date();
  await db.verificationDocument.updateMany({
    where: { expiresAt: { lte: now }, deletedAt: null },
    data: { encryptedContent: null, deletedAt: now },
  });
  await db.verificationChallenge.updateMany({
    where: { localCipher: { not: null }, OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] },
    data: { localCipher: null },
  });
  const old = await db.facilityDraft.findMany({
    where: { stage: 'DRAFT', updatedAt: { lt: new Date(Date.now() - 30 * 86400000) } },
    select: { id: true },
    take: 100,
  });
  if (old.length) {
    await db.verificationDocument.updateMany({
      where: { draftId: { in: old.map((d) => d.id) }, deletedAt: null },
      data: { encryptedContent: null, deletedAt: now },
    });
    await db.facilityDraft.updateMany({
      where: { id: { in: old.map((d) => d.id) } },
      data: { data: {}, idType: null },
    });
  }
}
