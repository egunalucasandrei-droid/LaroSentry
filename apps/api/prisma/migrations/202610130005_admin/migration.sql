ALTER TABLE "AuditEvent" ADD COLUMN reason TEXT;
ALTER TABLE "SecurityAlert" ADD COLUMN "eventIds" UUID[] NOT NULL DEFAULT '{}', ADD COLUMN "acknowledgedBy" UUID REFERENCES "User"(id), ADD COLUMN "acknowledgedAt" TIMESTAMPTZ(3), ADD COLUMN "resolvedAt" TIMESTAMPTZ(3);
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "alert_state" CHECK (state IN ('OPEN','ACKNOWLEDGED','RESOLVED'));
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "alert_severity" CHECK (severity IN ('LOW','MEDIUM','HIGH'));
ALTER TABLE "UserReport" ALTER COLUMN "targetId" DROP NOT NULL;
ALTER TABLE "UserReport" DROP CONSTRAINT "UserReport_targetType_check", DROP CONSTRAINT "UserReport_state_check";
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_targetType_check" CHECK ("targetType" IN ('USER','FACILITY','REVIEW','GAME','SECURITY','GENERAL'));
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_state_check" CHECK (state IN ('OPEN','REVIEWING','RESOLVED','DISMISSED'));
CREATE TABLE "FacilityApplication" (
  id UUID PRIMARY KEY, "facilityId" UUID NOT NULL UNIQUE REFERENCES "Facility"(id), "applicantId" UUID NOT NULL REFERENCES "User"(id),
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CLARIFICATION','APPROVED','REJECTED')),
  "applicantMessage" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "FacilityApplication_state_createdAt_idx" ON "FacilityApplication"(state,"createdAt");
CREATE TABLE "AdminDecision" (
  id UUID PRIMARY KEY, "actorId" UUID NOT NULL REFERENCES "User"(id), "targetType" TEXT NOT NULL, "targetId" UUID NOT NULL,
  action TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminDecision_targetType_targetId_createdAt_idx" ON "AdminDecision"("targetType","targetId","createdAt");
GRANT SELECT,INSERT,UPDATE ON "FacilityApplication" TO larosentry_app;
GRANT SELECT,INSERT ON "AdminDecision" TO larosentry_app;
REVOKE DELETE,TRUNCATE ON "SecurityAlert","UserReport","FacilityApplication" FROM larosentry_app;
