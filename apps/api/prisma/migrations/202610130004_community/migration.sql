ALTER TABLE "Booking" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "offlineGuests" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "rules" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Booking" ADD CONSTRAINT "offline_guest_capacity" CHECK ("offlineGuests" >= 0 AND "offlineGuests" < "expectedGuests");
CREATE TABLE "Participation" (
  id UUID PRIMARY KEY, "bookingId" UUID NOT NULL REFERENCES "Booking"(id), "userId" UUID NOT NULL REFERENCES "User"(id),
  state TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED','APPROVED','REJECTED','LEFT')),
  source TEXT NOT NULL DEFAULT 'JOIN' CHECK(source IN ('JOIN','INVITE')), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE("bookingId","userId")
);
CREATE INDEX "Participation_userId_state_idx" ON "Participation"("userId",state);
CREATE TABLE "GameInvitation" (
  id UUID PRIMARY KEY, "bookingId" UUID NOT NULL REFERENCES "Booking"(id), "recipientId" UUID NOT NULL REFERENCES "User"(id),
  "tokenHash" TEXT NOT NULL UNIQUE, state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACCEPTED','DECLINED','REVOKED')),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GameInvitation_recipientId_state_idx" ON "GameInvitation"("recipientId",state);
CREATE UNIQUE INDEX "one_pending_game_invitation" ON "GameInvitation"("bookingId","recipientId") WHERE state='PENDING';
CREATE TABLE "UserBlock" (
  "blockerId" UUID NOT NULL REFERENCES "User"(id), "blockedId" UUID NOT NULL REFERENCES "User"(id), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY("blockerId","blockedId"), CHECK("blockerId" <> "blockedId")
);
CREATE TABLE "Review" (
  id UUID PRIMARY KEY, "bookingId" UUID NOT NULL REFERENCES "Booking"(id), "userId" UUID NOT NULL REFERENCES "User"(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), text TEXT NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("bookingId","userId")
);
CREATE TABLE "UserReport" (
  id UUID PRIMARY KEY, "reporterId" UUID NOT NULL REFERENCES "User"(id), "targetType" TEXT NOT NULL CHECK("targetType" IN ('USER','FACILITY','REVIEW','GAME')), "targetId" UUID NOT NULL,
  category TEXT NOT NULL, details TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','RESOLVED')), resolution TEXT, "resolvedBy" UUID REFERENCES "User"(id),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMPTZ(3)
);
GRANT SELECT,INSERT,UPDATE ON "Participation","GameInvitation","Review","UserReport" TO larosentry_app;
GRANT SELECT,INSERT,DELETE ON "UserBlock" TO larosentry_app;
