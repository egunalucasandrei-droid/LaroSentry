CREATE TABLE "RescheduleRequest" (
  "id" UUID PRIMARY KEY,
  "bookingId" UUID NOT NULL REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedBy" UUID NOT NULL,
  "decidedBy" UUID,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMPTZ(3),
  CONSTRAINT "reschedule_interval" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "reschedule_state" CHECK (state IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
);
CREATE INDEX "RescheduleRequest_bookingId_state_idx" ON "RescheduleRequest"("bookingId",state);
CREATE UNIQUE INDEX "one_pending_reschedule" ON "RescheduleRequest"("bookingId") WHERE state = 'PENDING';
GRANT SELECT, INSERT, UPDATE ON "RescheduleRequest" TO larosentry_app;
