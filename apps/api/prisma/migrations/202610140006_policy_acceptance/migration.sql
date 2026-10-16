ALTER TABLE "User" ADD COLUMN "privacyVersion" TEXT, ADD COLUMN "policyAcceptedAt" TIMESTAMPTZ(3);
-- Legacy acceptance is deliberately preserved; no new acceptance is inferred.
