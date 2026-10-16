ALTER TABLE "Court"
  ADD COLUMN "surface" TEXT NOT NULL DEFAULT 'Hard',
  ADD COLUMN "openMinute" INTEGER,
  ADD COLUMN "closeMinute" INTEGER,
  ADD COLUMN "minDuration" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "defaultDuration" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "maxDuration" INTEGER,
  ADD COLUMN "startInterval" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Court" ADD CONSTRAINT court_schedule CHECK (
  ("openMinute" IS NULL OR "openMinute" BETWEEN 0 AND 1439) AND
  ("closeMinute" IS NULL OR "closeMinute" BETWEEN 1 AND 1440) AND
  ("openMinute" IS NULL OR "closeMinute" IS NULL OR "openMinute" < "closeMinute") AND
  "minDuration" BETWEEN 1 AND 1440 AND "defaultDuration" BETWEEN "minDuration" AND 1440 AND
  ("maxDuration" IS NULL OR ("maxDuration" BETWEEN "defaultDuration" AND 1440)) AND
  "startInterval" BETWEEN 1 AND 1440);
ALTER TABLE "Booking" ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'LAROSENTRY', ADD COLUMN "demoArchivedAt" TIMESTAMPTZ(3);
CREATE TABLE "ScheduleException" (
  "id" UUID PRIMARY KEY, "courtId" UUID NOT NULL REFERENCES "Court"("id"),
  "date" TEXT NOT NULL, "openMinute" INTEGER NOT NULL, "closeMinute" INTEGER NOT NULL,
  "closed" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT NOT NULL,
  UNIQUE("courtId", "date"),
  CHECK ("openMinute" >= 0 AND "closeMinute" <= 1440 AND "openMinute" < "closeMinute")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "ScheduleException" TO larosentry_app;
