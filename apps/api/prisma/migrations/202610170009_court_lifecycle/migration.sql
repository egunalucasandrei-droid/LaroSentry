ALTER TABLE "Court" ADD COLUMN "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
UPDATE "Court" SET "availabilityStatus" = 'UNAVAILABLE' WHERE "active" = false;
ALTER TABLE "Court" ADD CONSTRAINT "Court_availabilityStatus_check" CHECK ("availabilityStatus" IN ('AVAILABLE','UNAVAILABLE','MAINTENANCE'));
