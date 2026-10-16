import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { db, type Tx } from './db.js';
import { account, parse, uuid, type AuthRequest } from './http.js';
import { lockBooking } from './bookings.controller.js';
import { audit } from './audit.js';
import { hash, token } from './crypto.js';
import { queueMail } from './outbox.js';
import { env } from './config.js';

const gameInclude = { court: { include: { facility: true } }, user: { select: { nickname: true } } };
async function blocked(tx: Tx, a: string, b: string) {
  return !!(await tx.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  }));
}
async function pairLock(tx: Tx, a: string, b: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${[a, b].sort().join(':')},0))::text`;
}
async function activeGame(tx: Tx, id: string, organizer?: string) {
  await lockBooking(tx, id);
  const game = await tx.booking.findFirst({ where: { id, ...(organizer ? { userId: organizer } : {}) } });
  if (!game) throw new NotFoundException('Game not found.');
  if (game.status !== 'CONFIRMED' || game.startsAt <= new Date())
    throw new ConflictException('Participation is available only before a confirmed game starts.');
  return game;
}
async function space(tx: Tx, game: { id: string; offlineGuests: number; expectedGuests: number }) {
  const approved = await tx.participation.count({ where: { bookingId: game.id, state: 'APPROVED' } });
  if (approved + game.offlineGuests + 1 >= game.expectedGuests)
    throw new ConflictException('This game is full. No place was added.');
}
async function acceptingPlayers(tx: Tx, id: string) {
  if (
    !(await tx.booking.findFirst({
      where: {
        id,
        user: { suspendedAt: null, verifiedAt: { not: null } },
        court: { active: true, facility: { status: 'PUBLISHED' } },
      },
      select: { id: true },
    }))
  )
    throw new ConflictException('This game is not accepting new players.');
}
async function notice(tx: Tx, userId: string, bookingId: string, title: string, organizer = false) {
  await tx.notification.create({
    data: { userId, title, href: organizer ? `/app/bookings/${bookingId}` : `/app/games/${bookingId}` },
  });
}
async function summary(
  game: Awaited<ReturnType<typeof db.booking.findUniqueOrThrow>> & {
    court: { name: string; sport: string; facility: { name: string; area: string } };
    user: { nickname: string };
  },
  viewer: string,
) {
  const approved = await db.participation.count({ where: { bookingId: game.id, state: 'APPROVED' } });
  const mine = await db.participation.findUnique({
    where: { bookingId_userId: { bookingId: game.id, userId: viewer } },
  });
  return {
    id: game.id,
    mode: game.mode,
    status: game.status,
    published: game.published,
    startsAt: game.startsAt,
    endsAt: game.endsAt,
    rules: game.rules,
    capacity: game.expectedGuests,
    spaces: Math.max(0, game.expectedGuests - 1 - game.offlineGuests - approved),
    offlineGuests: game.offlineGuests,
    organizer: game.user.nickname,
    isOrganizer: game.userId === viewer,
    participation: mine?.state ?? null,
    facility: game.court.facility.name,
    area: game.court.facility.area,
    court: game.court.name,
    sport: game.court.sport,
  };
}
@ApiTags('Community')
@Controller()
export class CommunityController {
  @Get('games') async list(@Req() req: AuthRequest) {
    const user = account(req);
    const blocks = await db.userBlock.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    });
    const excluded = blocks.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId));
    const games = await db.booking.findMany({
      where: {
        mode: 'PUBLIC',
        published: true,
        status: 'CONFIRMED',
        startsAt: { gt: new Date() },
        userId: { notIn: excluded },
        user: { suspendedAt: null },
        court: { active: true, facility: { status: 'PUBLISHED' } },
      },
      include: gameInclude,
      orderBy: { startsAt: 'asc' },
      take: 60,
    });
    return Promise.all(games.map((g) => summary(g, user.id)));
  }
  @Get('my-games') async mine(@Req() req: AuthRequest) {
    const user = account(req);
    const games = await db.booking.findMany({
      where: { participants: { some: { userId: user.id, state: { in: ['APPROVED', 'REQUESTED'] } } } },
      include: gameInclude,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    return Promise.all(games.map((g) => summary(g, user.id)));
  }
  @Get('games/:id') async detail(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    const game = await db.booking.findUnique({ where: { id: uuid(id) }, include: gameInclude });
    if (!game) throw new NotFoundException('Game not found.');
    const participation = await db.participation.findUnique({
      where: { bookingId_userId: { bookingId: id, userId: user.id } },
    });
    const invitation = await db.gameInvitation.findFirst({
      where: { bookingId: id, recipientId: user.id, state: 'PENDING', expiresAt: { gt: new Date() } },
    });
    const publicAccess =
      game.mode === 'PUBLIC' &&
      game.published &&
      game.status === 'CONFIRMED' &&
      game.startsAt > new Date() &&
      !(await blocked(db, user.id, game.userId));
    if (
      game.userId !== user.id &&
      !['REQUESTED', 'APPROVED'].includes(participation?.state ?? '') &&
      !(invitation && !(await blocked(db, user.id, game.userId))) &&
      !publicAccess
    )
      throw new NotFoundException('Game not found.');
    return summary(game, user.id);
  }
  @Post('games/:id/settings') async settings(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = account(req);
    uuid(id);
    const data = parse(
      z.object({
        mode: z.enum(['PUBLIC', 'PRIVATE', 'BOOKING_ONLY']),
        published: z.boolean(),
        offlineGuests: z.number().int().min(0).max(39),
        rules: z.string().trim().max(1000),
      }),
      body,
    );
    if (data.published && data.mode !== 'PUBLIC')
      throw new BadRequestException('Only public games can be published.');
    return db.$transaction(async (tx) => {
      const game = await activeGame(tx, id, user.id);
      if (
        data.mode !== game.mode &&
        ((await tx.participation.count({
          where: { bookingId: id, state: { in: ['REQUESTED', 'APPROVED'] } },
        })) ||
          (await tx.gameInvitation.count({
            where: { bookingId: id, state: 'PENDING', expiresAt: { gt: new Date() } },
          })))
      )
        throw new ConflictException(
          'Resolve active requests, participants and invitations before changing the reservation mode.',
        );
      const approved = await tx.participation.count({ where: { bookingId: id, state: 'APPROVED' } });
      if (1 + approved + data.offlineGuests > game.expectedGuests)
        throw new ConflictException('Organizer, offline guests and approved players exceed capacity.');
      await tx.booking.update({ where: { id }, data });
      await audit(tx, user.id, 'GAME_SETTINGS_CHANGED', id);
      return {
        message: data.published
          ? 'Game published for signed-in adult players.'
          : 'Game settings saved. This game is not publicly listed.',
      };
    });
  }
  @Get('games/:id/roster') async roster(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    if (!(await db.booking.findFirst({ where: { id: uuid(id), userId: user.id } })))
      throw new NotFoundException('Game not found.');
    const rows = await db.participation.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const people = await db.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, nickname: true },
    });
    const invitations = await db.gameInvitation.findMany({
      where: { bookingId: id },
      select: { id: true, state: true, expiresAt: true, recipientId: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const recipients = await db.user.findMany({
      where: { id: { in: invitations.map((i) => i.recipientId) } },
      select: { id: true, nickname: true },
    });
    return {
      participants: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        nickname: people.find((p) => p.id === r.userId)?.nickname ?? 'Player',
        state: r.state,
      })),
      invitations: invitations.map((i) => ({
        id: i.id,
        state: i.state,
        expiresAt: i.expiresAt,
        nickname: recipients.find((p) => p.id === i.recipientId)?.nickname ?? 'Player',
      })),
    };
  }
  @Post('games/:id/join') async join(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    uuid(id);
    return db.$transaction(async (tx) => {
      const game = await activeGame(tx, id);
      await acceptingPlayers(tx, id);
      await pairLock(tx, user.id, game.userId);
      if (
        game.mode !== 'PUBLIC' ||
        !game.published ||
        user.id === game.userId ||
        (await blocked(tx, user.id, game.userId))
      )
        throw new NotFoundException('This game is not available for joining.');
      const existing = await tx.participation.findUnique({
        where: { bookingId_userId: { bookingId: id, userId: user.id } },
      });
      if (existing && existing.state !== 'LEFT')
        throw new ConflictException('Your previous request has already been recorded.');
      await space(tx, game);
      await tx.participation.upsert({
        where: { bookingId_userId: { bookingId: id, userId: user.id } },
        create: { bookingId: id, userId: user.id },
        update: { state: 'REQUESTED', source: 'JOIN' },
      });
      await notice(tx, game.userId, id, 'A player requested to join your game.', true);
      await audit(tx, user.id, 'GAME_JOIN_REQUESTED', id);
      return { message: 'Request sent. Your place is confirmed only after organizer approval.' };
    });
  }
  @Post('games/:id/participants/:participantId') async decide(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() body: unknown,
  ) {
    const user = account(req);
    uuid(id);
    uuid(participantId);
    const { approve } = parse(z.object({ approve: z.boolean() }), body);
    return db.$transaction(async (tx) => {
      const game = await activeGame(tx, id, user.id);
      const p = await tx.participation.findFirst({
        where: { id: participantId, bookingId: id, state: { in: ['REQUESTED', 'APPROVED'] } },
      });
      if (!p) throw new NotFoundException('Active participant not found.');
      if (approve) {
        await acceptingPlayers(tx, id);
        if (
          !(await tx.user.findFirst({
            where: { id: p.userId, suspendedAt: null, verifiedAt: { not: null } },
            select: { id: true },
          }))
        )
          throw new ConflictException('This player is not eligible to join.');
        if (p.state === 'APPROVED') return { message: 'Player is already approved.' };
        await pairLock(tx, user.id, p.userId);
        if (await blocked(tx, user.id, p.userId)) throw new ConflictException('This interaction is blocked.');
        await space(tx, game);
      }
      await tx.participation.update({
        where: { id: p.id },
        data: { state: approve ? 'APPROVED' : 'REJECTED' },
      });
      await notice(
        tx,
        p.userId,
        id,
        approve ? 'Your game place was approved.' : 'Your game request or place was declined.',
      );
      await audit(tx, user.id, approve ? 'PARTICIPANT_APPROVED' : 'PARTICIPANT_REJECTED', p.id);
      return { message: approve ? 'Player approved.' : 'Request or place declined.' };
    });
  }
  @Post('games/:id/leave') async leave(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    uuid(id);
    return db.$transaction(async (tx) => {
      const game = await activeGame(tx, id);
      const changed = await tx.participation.updateMany({
        where: { bookingId: id, userId: user.id, state: { in: ['REQUESTED', 'APPROVED'] } },
        data: { state: 'LEFT' },
      });
      if (!changed.count) throw new NotFoundException('Active participation not found.');
      await notice(tx, game.userId, id, 'A player left or withdrew their game request.', true);
      await audit(tx, user.id, 'GAME_LEFT', id);
      return { message: 'You have left this game.' };
    });
  }
  @Post('games/:id/invite') async invite(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = account(req);
    uuid(id);
    const { email } = parse(
      z.object({
        email: z
          .email()
          .max(254)
          .transform((v) => v.trim().toLowerCase()),
      }),
      body,
    );
    return db.$transaction(async (tx) => {
      const game = await activeGame(tx, id, user.id);
      if (game.mode !== 'PRIVATE') throw new BadRequestException('Private invitations require private mode.');
      const recipient = await tx.user.findUnique({ where: { email } });
      const response = {
        message:
          'If this address belongs to an eligible player, they will receive an invitation. Invitations do not reserve a place.',
      };
      if (!recipient || !recipient.verifiedAt || recipient.suspendedAt || recipient.id === user.id)
        return response;
      await pairLock(tx, user.id, recipient.id);
      if (await blocked(tx, user.id, recipient.id)) return response;
      const existing = await tx.participation.findUnique({
        where: { bookingId_userId: { bookingId: id, userId: recipient.id } },
      });
      if (existing && ['REQUESTED', 'APPROVED'].includes(existing.state)) return response;
      const pending = await tx.gameInvitation.findFirst({
        where: { bookingId: id, recipientId: recipient.id, state: 'PENDING', expiresAt: { gt: new Date() } },
      });
      if (pending) return response;
      await tx.gameInvitation.updateMany({
        where: { bookingId: id, recipientId: recipient.id, state: 'PENDING' },
        data: { state: 'REVOKED' },
      });
      const raw = token();
      const invitation = await tx.gameInvitation.create({
        data: {
          bookingId: id,
          recipientId: recipient.id,
          tokenHash: hash(raw),
          expiresAt: new Date(Math.min(Date.now() + 48 * 3600000, game.startsAt.getTime())),
        },
      });
      await tx.notification.create({
        data: {
          userId: recipient.id,
          title: 'You have a private game invitation.',
          href: '/app/invitations',
        },
      });
      if (recipient.emailNotifications)
        await queueMail(
          tx,
          recipient.email,
          'LaroSentry game invitation',
          `Sign in with the invited account to review your invitation: ${env.APP_ORIGIN}/app/invitations#token=${raw}`,
          `game-invitation:${invitation.id}`,
        );
      await audit(tx, user.id, 'GAME_INVITATION_CREATED', invitation.id);
      return response;
    });
  }
  @Get('game-invitations') async invitations(@Req() req: AuthRequest) {
    const user = account(req);
    const invitations = await db.gameInvitation.findMany({
      where: {
        recipientId: user.id,
        state: 'PENDING',
        expiresAt: { gt: new Date() },
        booking: { status: 'CONFIRMED', startsAt: { gt: new Date() } },
      },
      select: {
        id: true,
        bookingId: true,
        expiresAt: true,
        booking: {
          select: {
            userId: true,
            startsAt: true,
            court: { select: { facility: { select: { name: true } } } },
          },
        },
      },
      take: 100,
    });
    const visible = [];
    for (const i of invitations)
      if (!(await blocked(db, user.id, i.booking.userId)))
        visible.push({
          id: i.id,
          bookingId: i.bookingId,
          expiresAt: i.expiresAt,
          startsAt: i.booking.startsAt,
          facility: i.booking.court.facility.name,
        });
    return visible;
  }
  @Post('game-invitations/:id/respond') async respond(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const user = account(req);
    uuid(id);
    const data = parse(
      z.object({ accept: z.boolean(), token: z.string().min(32).max(128).optional() }),
      body,
    );
    const invitation = await db.gameInvitation.findFirst({ where: { id, recipientId: user.id } });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    return db.$transaction(async (tx) => {
      const game = await activeGame(tx, invitation.bookingId);
      const current = await tx.gameInvitation.findUniqueOrThrow({ where: { id } });
      if (
        current.state !== 'PENDING' ||
        current.expiresAt <= new Date() ||
        (data.token && hash(data.token) !== current.tokenHash)
      )
        throw new ConflictException('This invitation is no longer available.');
      await pairLock(tx, user.id, game.userId);
      if ((await blocked(tx, user.id, game.userId)) || game.mode !== 'PRIVATE')
        throw new NotFoundException('Invitation not available.');
      if (data.accept) {
        await acceptingPlayers(tx, game.id);
        await space(tx, game);
        await tx.participation.upsert({
          where: { bookingId_userId: { bookingId: game.id, userId: user.id } },
          create: { bookingId: game.id, userId: user.id, source: 'INVITE', state: 'APPROVED' },
          update: { source: 'INVITE', state: 'APPROVED' },
        });
      }
      await tx.gameInvitation.update({
        where: { id },
        data: { state: data.accept ? 'ACCEPTED' : 'DECLINED' },
      });
      await notice(
        tx,
        game.userId,
        game.id,
        data.accept ? 'A player accepted your invitation.' : 'A player declined your invitation.',
        true,
      );
      await audit(tx, user.id, data.accept ? 'GAME_INVITATION_ACCEPTED' : 'GAME_INVITATION_DECLINED', id);
      return {
        message: data.accept ? 'Invitation accepted. Your place is confirmed.' : 'Invitation declined.',
      };
    });
  }
  @Post('game-invitations/:id/revoke') async revoke(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    uuid(id);
    const invitation = await db.gameInvitation.findFirst({ where: { id, booking: { userId: user.id } } });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    return db.$transaction(async (tx) => {
      await lockBooking(tx, invitation.bookingId);
      await tx.gameInvitation.updateMany({ where: { id, state: 'PENDING' }, data: { state: 'REVOKED' } });
      await audit(tx, user.id, 'GAME_INVITATION_REVOKED', id);
      return { message: 'Pending invitation revoked.' };
    });
  }
  @Post('games/:id/block') async block(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    await this.detail(req, id);
    const game = await db.booking.findUniqueOrThrow({ where: { id } });
    if (game.userId === user.id) throw new BadRequestException('You cannot block yourself.');
    return db.$transaction(async (tx) => {
      await pairLock(tx, user.id, game.userId);
      await tx.userBlock.createMany({
        data: [{ blockerId: user.id, blockedId: game.userId }],
        skipDuplicates: true,
      });
      await audit(tx, user.id, 'USER_BLOCKED', game.userId);
      return {
        message:
          'Organizer blocked. New interactions are prevented. Existing participation remains until you leave.',
      };
    });
  }
  @Get('blocks') async blocks(@Req() req: AuthRequest) {
    const rows = await db.userBlock.findMany({ where: { blockerId: account(req).id }, take: 100 });
    return db.user.findMany({
      where: { id: { in: rows.map((r) => r.blockedId) } },
      select: { id: true, nickname: true },
    });
  }
  @Post('blocks/:id/remove') async unblock(@Req() req: AuthRequest, @Param('id') id: string) {
    const user = account(req);
    uuid(id);
    return db.$transaction(async (tx) => {
      await pairLock(tx, user.id, id);
      await tx.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: id } });
      await audit(tx, user.id, 'USER_UNBLOCKED', id);
      return { message: 'Your block was removed.' };
    });
  }
}
