import 'reflect-metadata';
import {
  Catch,
  Controller,
  Get,
  HttpException,
  Module,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AuthController } from './auth.controller.js';
import { FacilitiesController } from './facilities.controller.js';
import { BookingsController, notifyBooking } from './bookings.controller.js';
import { OperationsController } from './operations.controller.js';
import { CommunityController } from './community.controller.js';
import { AdminController } from './admin.controller.js';
import { SubmissionsController } from './submissions.controller.js';
import { collectSecurityAlerts } from './security-alerts.js';
import { db } from './db.js';
import { env, workspaceRoot } from './config.js';
import { administrator, sessionMiddleware, type AuthRequest } from './http.js';
import { deliverMail } from './outbox.js';
import { logger } from './logger.js';
import { audit } from './audit.js';
import { SchedulerController } from './scheduler.controller.js';
import { WorkspacesController } from './workspaces.controller.js';
import { OnboardingController } from './onboarding.controller.js';
import {
  FacilityVerificationController,
  purgeVerificationContent,
} from './facility-verification.controller.js';
import { StaffInvitationsController } from './staff-invitations.controller.js';

@Catch()
class SafeErrors implements ExceptionFilter {
  async catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(),
      response = http.getResponse<Response>(),
      req = http.getRequest<AuthRequest>();
    let status = 503,
      message = 'The service is temporarily unavailable. Please try again.';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const content = error.getResponse();
      message = typeof content === 'string' ? content : String((content as { message: string }).message);
    } else if (error && typeof error === 'object') {
      const err = error as { code?: string; message?: string };
      const bodyError = error as { type?: string };
      if (bodyError.type === 'entity.too.large') {
        status = 413;
        message = 'Request is too large. Verification images must be at most 2 MB.';
      }
      if (bodyError.type === 'entity.parse.failed') {
        status = 400;
        message = 'Send valid JSON.';
      }
      if (
        ['P2002', 'P2004', 'P2034'].includes(err.code ?? '') ||
        /exclusion|23P01|deadlock/i.test(err.message ?? '')
      ) {
        status = 409;
        message = 'This operation conflicts with an existing record. Refresh and try another time.';
      }
      logger.error({
        event: 'request_failed',
        correlationId: req.correlationId,
        code: err.code ?? 'internal',
        status,
      });
    }
    if (
      req.originalUrl?.startsWith('/api/admin/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      status >= 400
    ) {
      await audit(
        db,
        req.account?.id ?? null,
        'ADMIN_MUTATION_DENIED',
        undefined,
        'DENIED',
        req.correlationId,
        `Administrative request rejected (HTTP ${status}).`,
      ).catch(() => undefined);
    }
    response.status(status).json({ message, correlationId: req.correlationId });
  }
}
@Controller('health')
class HealthController {
  @Get() async health() {
    await db.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: 'connected',
      version: '0.1.0',
      pilot: true,
      ...(env.NODE_ENV === 'development' &&
      /^larosentry_demo_\d{13}$/.test(process.env.LOCAL_DEMO_INSTANCE ?? '')
        ? { demoInstance: process.env.LOCAL_DEMO_INSTANCE }
        : {}),
    };
  }
}
@Module({
  controllers: [
    OnboardingController,
    FacilityVerificationController,
    StaffInvitationsController,
    WorkspacesController,
    SchedulerController,
    AuthController,
    FacilitiesController,
    BookingsController,
    OperationsController,
    CommunityController,
    AdminController,
    SubmissionsController,
    HealthController,
  ],
})
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  if (env.NODE_ENV === 'production') app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      referrerPolicy: { policy: 'no-referrer' },
      contentSecurityPolicy: {
        directives: { imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'] },
      },
    }),
  );
  app.use((req: AuthRequest, res: Response, next: () => void) => {
    req.correlationId = randomUUID();
    res.setHeader('X-Request-Id', req.correlationId);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  if (env.NODE_ENV === 'production') {
    const webRoot = join(workspaceRoot, 'apps/web/dist');
    if (!existsSync(join(webRoot, 'index.html')))
      throw new Error('Build the web application before starting.');
    const assets = express.static(webRoot, { index: false, dotfiles: 'deny' });
    app.use((req: Request, res: Response, next: () => void) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (req.path === '/robots.txt') return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.sendStatus(405);
      assets(req, res, () => {
        if (req.path.startsWith('/assets/') || req.path.includes('.')) return res.sendStatus(404);
        res.sendFile(join(webRoot, 'index.html'));
      });
    });
  }
  const smallJson = express.json({ limit: '32kb' }),
    imageJson = express.json({ limit: '3mb' });
  app.use((req: Request, res: Response, next: () => void) =>
    /^\/api\/onboarding\/drafts\/[\w-]+\/documents$/.test(req.path)
      ? imageJson(req, res, next)
      : smallJson(req, res, next),
  );
  app.use(cookieParser());
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      // The isolated integration suite exercises hundreds of role/endpoint combinations.
      limit: env.NODE_ENV === 'test' ? 1000 : 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Too many requests. Please wait a minute.' },
    }),
  );
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 60000,
      limit: env.NODE_ENV === 'test' ? 200 : 20,
      skip: (req: Request) => req.method === 'GET',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: async (_req: Request, res: Response) => {
        await audit(db, null, 'AUTH_RATE_LIMIT', undefined, 'DENIED').catch(() => undefined);
        res.status(429).json({ message: 'Too many account attempts. Please wait a minute.' });
      },
    }),
  );
  app.use(sessionMiddleware);
  // Protect the entire namespace, including nonexistent/future export and file routes.
  app.use('/api/admin', async (req: AuthRequest, _res: Response, next: (error?: unknown) => void) => {
    try {
      await administrator(req);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.useGlobalFilters(new SafeErrors());
  const spec = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('LaroSentry API')
      .setDescription(
        'Local website pilot. Cookie session + CSRF for mutations. See docs/api.md for schemas and authorization.',
      )
      .setVersion('0.1.0')
      .addCookieAuth('ls_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, spec);
  await app.init();
  return app;
}
export async function runMaintenance() {
  await purgeVerificationContent();
  await collectSecurityAlerts();
  const expired = await db.booking.findMany({
    where: { status: 'PENDING', expiresAt: { lte: new Date() } },
    take: 50,
  });
  for (const booking of expired)
    await db.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: booking.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (result.count) {
        await tx.bookingHistory.create({
          data: {
            bookingId: booking.id,
            status: 'EXPIRED',
            actorId: booking.userId,
            reason: 'Request expired without confirmation.',
          },
        });
        await notifyBooking(tx, booking.userId, booking.id, 'EXPIRED');
        await audit(tx, null, 'BOOKING_EXPIRED', booking.id);
      }
    });
  await db.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { lastSeenAt: { lt: new Date(Date.now() - 1800000) } }],
    },
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createApp();
  await app.listen(env.PORT, env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  logger.info({ event: 'api_started', port: env.PORT });
  const mailTimer = setInterval(() => void deliverMail(), 3000);
  const maintenance = setInterval(
    () => void runMaintenance().catch(() => logger.error({ event: 'maintenance_failed' })),
    30000,
  );
  const shutdown = async () => {
    clearInterval(mailTimer);
    clearInterval(maintenance);
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
