# API contract

Local-only demo extension (2026-10-17): `/auth/me` and successful `/auth/login` include server-derived `demoMode`; their user projection adds `verificationBypassed`. Actual email/mobile/MFA status remains separate. Only startup configuration can enable the mode, for four named loopback demo fixtures; no endpoint/header/query can activate it. `/health` reports `demoMode` only outside production so the launcher refuses to reuse a server running the wrong mode. Local evidence decisions use `DEMO_BYPASSED` and explicit audit actions; all permission/resource/CSRF/data/state checks remain. [Scope and production refusal](demo-mode.md).

## Registration/onboarding verification

Signup additionally requires normalized Philippine mobile, confirmPassword, acceptedPrivacy and the current policyVersion. Login can create a restricted unverified session; normal `account()` operations deny it until required contacts are complete. `GET /onboarding` returns only the current user's private contact state/preferences. `POST /onboarding/email/resend`, `/sms/send`, `/sms/verify` (six-digit code), `/contacts` (password/email/phone), `/purpose` (PLAYER/HOST only) and `/preferences` implement the onboarding flow. `GET /onboarding/dev-sms` is enabled only for explicitly configured loopback simulation and only returns that account's active test code. Recommendations are read from `/onboarding/recommendations`.

`GET/POST /onboarding/drafts`, `GET/POST /onboarding/drafts/:id`, `POST .../:id/documents` (kind + base64 PNG/JPEG), `POST .../:id/documents/:documentId/remove` and `POST .../:id/submit` require both contacts and the applicant's own draft. Legacy `POST /facility-applications` now takes only draftId and uses the same required-evidence submission; existing pre-document application reads/replies remain compatible. All writes retain JSON/origin/CSRF enforcement. Image requests alone allow a 3 MB JSON envelope; actual images are limited to 2 MB input. No image/OTP plaintext is logged.

Admin application decisions additionally support START_REVIEW/SUSPEND/REOPEN, with reasons/confirmation and previous/new status history. New approvals require identityReviewed/facilityReviewed acknowledgements. Private `GET /admin/applications/:id/documents/:documentId` checks assigned reviewer, scope, MFA and expiry and returns sanitized PNG with no-store headers. No other role may fetch the file. Owner invitations use `GET/POST /workspaces/owner/facilities/:id/invitations`, `POST .../invitations/:inviteId/revoke` and `POST /onboarding/staff-invitations/accept` (token, invited verified account only). [Limits and setup](onboarding-verification.md).

## Role workspaces

`GET /workspaces` requires login and reports player/owner/staff/admin workspace availability plus assigned staff permission names; it grants no access. `GET /workspaces/:mode/:section?page=1&q=&facilityId=&status=` requires privileged verification and the mode's actual OWNER/STAFF membership. Sections: overview, facilities, bookings, payments, attendance; owner-only staff, reviews, reports and activity. New lists paginate at 20 rows. Bookings/payment/attendance search booking references; staff searches nickname/email; reviews search text; report status searches category; activity searches action/reason. Cross-facility filters are denied. Staff permission requirements are BOOKINGS/PAYMENTS/ATTENDANCE as applicable; owner-only sections are denied to staff.

`GET/POST /workspaces/owner/facilities/:id` reads an owned facility or edits only description/address/amenities. Writes require confirmation/reason. `POST /workspaces/owner/facilities/:id/staff` accepts exact verified account email, permissions drawn only from BOOKINGS/PAYMENTS/ATTENDANCE, optional remove, confirmation/reason. Unknown fields are rejected. OWNER/ADMIN/self targets cannot be edited; sessions are revoked and changes audited/notified. There is no HTTP ADMIN grant.

`GET /admin/facilities`, `/admin/bookings`, `/admin/payments` add ADMIN/MFA-only paginated oversight with search and optional facility/status filters where applicable. `GET /admin/bookings/:id` includes up to 100 history entries and payment records, excluding credentials/tokens. Payment/booking reads are audited. `POST /admin/facilities/:id/status` accepts PUBLISHED/UNPUBLISHED with confirmation/reason, revalidates the admin session transactionally and records a decision; publication requires an approved application. All mutation routes retain origin/JSON/CSRF checks.

Existing external payment recording now denies the booking's own organizer, audits the transition to PAID and keeps immutable records. Booking-only staff receive no payment records in legacy operations booking responses. Facility applications additionally accept optional amenities; approval promotes STAFF applicants to OWNER while preserving STAFF memberships and revoking sessions. No database migration was added.

## NOLTA scheduling

All `/scheduler` routes require verified login. `GET /scheduler/courts?manage=0|1`, `/scheduler/facilities` (management), `/scheduler/courts/:id/schedule?date=YYYY-MM-DD&duration=75&manage=0|1`, and `/scheduler/reservations?manage=0|1&q=&status=&courtId=&date=&period=&page=1` return DB-backed data. Management requires ADMIN/FACILITY_OWNER plus OWNER membership and privileged verification. Slot status BOOKED is presented as Reserved; CLOSED represents maintenance/date closure. Availability includes effective rules, duration and refreshed timestamp. Customer information is excluded from public slots.

`POST /scheduler/courts` and `/scheduler/courts/:id` accept court name, surface, sport, integer centavo hourly price, capacity, active, minute-of-day opening/closing, minimum/default/optional maximum duration and start interval, plus `confirmed: true` and reason. Creation also requires facilityId. `GET/POST /scheduler/courts/:id/exceptions` manage dated opening/closing/closed overrides; `remove: true` restores normal hours. Maintenance reuses `/operations/closures` and reopening.

`POST /scheduler/reservations` uses the existing booking interval schema plus manual, optional exact customerEmail, reviewedTotal, reviewedPolicy, confirmation and reason; it requires an Idempotency-Key UUID. Player requests remain pending; authorized manual reservations allocate immediately. `/scheduler/reservations/:id/change` accepts CANCEL or RESCHEDULE with confirmation/reason and (for reschedule) the destination court/times. Confirmation of pending requests reuses `/operations/bookings/:id/decision`. Management schedules may exclude the authorized current reservation with `ignoreBookingId` when rescheduling; public callers cannot use that parameter.

`POST /scheduler/profile` edits only the signed-in account nickname. `GET /scheduler/demo-reset` returns scoped count/fingerprint and an archive explanation; POST requires that fingerprint, explicit confirmation and reason. Only the exact named local demo administrator can reset NOLTA-source reservations at explicitly assigned fictional facilities; immutable history and unrelated bookings are retained. See nolta-scheduler.md for complete limits.

Calendar: `GET /operations/courts/:id/schedule?date=YYYY-MM-DD` returns the authorized court's operating hours, one-hour slots (30-minute start increments), active day allocations without customer identities, pending request count and refresh time. It uses PHT and requires facility BOOKINGS access plus privileged verification. Existing closure create/reopen endpoints perform mutations and audit them.

Local preview only: `POST /auth/demo-access` accepts `{ password }` with authenticated origin/CSRF protection, rotates the session and grants up to 30 minutes of in-memory demo access. Eligibility requires the exact privileged demo email/role and explicitly enabled matching loopback demo database. `/auth/me.user.demoAccessAllowed` indicates eligibility; its effective `mfaVerified` UI gate includes granted demo access, while persisted MFA enrollment/session verification is unchanged. See security-controls.md for this deliberate demonstration exception.

Base path `/api`. Interactive route documentation is at `/api/docs`, JSON at `/api/docs-json`. Swagger currently enumerates routes but does not yet fully describe Zod request/response schemas; this is a documented gap for the future mobile handoff.

Web requests use same-origin cookies. Mutations require `Origin` equal to APP_ORIGIN and `Content-Type: application/json`; authenticated mutations additionally require `X-CSRF-Token` from the separate `ls_csrf` cookie. Never send `ls_session` into JavaScript storage. API errors return `{ message, correlationId }` with 400/401/403/404/409/429/503 as appropriate. Private record lookup hides unauthorized records behind 404.

## Authentication

GET `/management`: ADMIN or FACILITY_OWNER plus verified session/MFA. Returns role-specific summary metrics and up to 12 host-owned court summaries, ordered by name/id. Host aggregates cover all owner-membership records; staff memberships do not qualify. Admin response contains application/report/alert counts and no court records. No mutation or role-switch endpoint is introduced. Unauthorized role denials are audited.

POST `/auth/register`: email, password, nickname, adult=true, acceptedTerms=true, policyVersion equal to the current POLICY_VERSION from shared contracts (currently 2026-10-14-draft-1). Missing/stale versions fail validation; successful registration records termsVersion, privacyVersion and policyAcceptedAt. POST `/auth/verify-email`: token. POST `/auth/login`: email/password. POST `/auth/logout`: empty object. GET `/auth/me`: safe account summary or null. POST `/auth/forgot-password`: email. POST `/auth/reset-password`: token/password. POST `/auth/change-password`: currentPassword/password.

GET `/auth/sessions`, DELETE `/auth/sessions/:id` operate only on the current account. POST `/auth/mfa/setup` requires password and returns one-time setup material. POST `/auth/mfa/verify` accepts a current TOTP or one-use recovery code and rotates the session; initial enrollment returns recovery codes once. GET/POST `/auth/preferences` handles boolean publicProfile/emailNotifications. POST `/auth/deletion-request` records manual review intention.

## Discovery

GET `/facilities`: q (name/area), sport, amenity, maxPrice (centavos), date (YYYY-MM-DD), time (HH:mm), page, sort=name|price. Date/time filters check for an available one-hour interval within facility hours. Nine results per page with total/page/pageSize. GET `/facilities/:slug`: published detail with active courts. GET `/courts/:id/availability?date=YYYY-MM-DD`: allocated intervals only, no booking IDs or people. Refresh timestamp is returned. GET `/saved`, POST/DELETE `/saved/:id` use the signed-in user's bookmarks.

## Booking

POST `/bookings/quote`: courtId UUID, ISO startsAt/endsAt with timezone, mode, expectedGuests integer. Returns totalCentavos, hourlyRate, policy, paymentArrangement and quoteFingerprint. POST `/bookings` accepts those booking fields plus quoteFingerprint with `Idempotency-Key: <UUID>`; changed pricing/terms require fresh review. GET `/booking-submissions/:key` recovers only the current user's completed submission. GET `/bookings` and GET `/bookings/:id` are organizer-only. POST `/bookings/:id/cancel` cancels eligible future bookings. POST `/bookings/:id/qr` replaces the active token and returns new opaque display material once. POST `/bookings/:id/reschedule`: startsAt, endsAt, reason; preserves the original allocation pending decision.

## Community

All endpoints require a signed-in verified adult account. GET `/games` lists up to 60 upcoming published public games; GET `/my-games` lists the caller's requested/approved participation. GET `/games/:id` returns a minimal authorized game summary, without rosters, emails, payment records or invitation tokens.

Organizer only: POST `/games/:id/settings` accepts mode, published, offlineGuests and rules (maximum 1,000 characters). GET `/games/:id/roster` returns nicknames and request/invitation states. POST `/games/:id/participants/:participantId` accepts approve boolean. POST `/games/:id/invite` accepts a known email and returns a generic eligibility response. POST `/game-invitations/:id/revoke` revokes pending invitations.

Players: POST `/games/:id/join`, POST `/games/:id/leave`. GET `/game-invitations` lists the intended recipient's unexpired pending invitations. POST `/game-invitations/:id/respond` accepts accept boolean and optional token; recipient checks always apply. POST `/games/:id/block` blocks that game's organizer. GET `/blocks` lists the caller's blocked organizers; POST `/blocks/:id/remove` removes only their own block. Capacity and interaction changes serialize under database transaction locks.

## Operations

GET `/operations/facilities`, GET `/operations/bookings`: assigned memberships/booking-permitted facility records. POST `/operations/bookings/:id/decision`: status (CONFIRMED, REJECTED, COMPLETED, NO_SHOW), reason. POST `/operations/closures`: courtId, startsAt, endsAt, reason. POST `/operations/bookings/:id/payment`: amountCentavos equal to full total, method=CASH|BANK|EWALLET, unique receipt/reference. Only a full external payment is currently supported.

POST `/operations/check-in`: facilityId plus exactly one of token/reference. Validates permission, facility, status, window, revocation and unique attendance. GET `/operations/audit`: own actor's recent events. GET `/admin/audit` and `/admin/health`: platform ADMIN + MFA. GET `/health` exposes only basic database connectivity/version.

GET `/operations/allocations` lists assigned upcoming allocations. POST `/operations/closures/:id/reopen` deactivates a closure. POST `/operations/reschedules/:id/decision` accepts approve and reason, and atomically applies an eligible schedule change or preserves the original.

GET `/notifications` and POST `/notifications/read` (id) are account-scoped. Poll at 30-second intervals and stop background polling. There are no exported rosters, private file downloads, arbitrary messaging, payment gateways or mobile-specific authentication endpoints yet.

## Administration

Every `/admin` API path requires login, ADMIN and verified MFA, including nonexistent export/file paths. Individual handlers repeat the check and look up the addressed record. Mutations revalidate the current actor/session under a common database lock. All decisions require `confirmed: true` and a reason of 10–1,000 trimmed characters.

- GET `/admin/overview`: pendingApplications (PENDING + CLARIFICATION), openReports (OPEN + REVIEWING), unresolvedAlerts (OPEN + ACKNOWLEDGED), checkedAt.
- GET `/admin/applications`, `/admin/users`, `/admin/reports`, `/admin/alerts`: page (20 rows), q; applications/reports/alerts also accept validated state. Results contain items, total, page and pageSize. Searches match facility name, nickname/email, report category or alert rule respectively.
- GET `/admin/applications/:id`, `/admin/users/:id`, `/admin/reports/:id`, `/admin/alerts/:id`: safe record detail and latest 50 decisions. Alert detail includes up to 100 supporting audit events. User detail never contains credentials or token material.
- POST `/admin/applications/:id/decision`: action=CLARIFY|APPROVE|REJECT plus reason/confirmation. Only PENDING can be clarified or approved; CLARIFICATION may be rejected or await applicant response. Final decisions cannot be overwritten. Own application decisions are denied.
- POST `/admin/users/:id/restriction`: restricted boolean plus reason/confirmation. Self-restriction and last-admin loss are denied; changing state revokes sessions. No automatic booking cancellation/refund occurs.
- POST `/admin/reports/:id/decision`: state=OPEN|REVIEWING|RESOLVED|DISMISSED plus reason/confirmation. Closed reports must be reopened before a new decision; own-report decisions are denied.
- POST `/admin/alerts/:id/decision`: state=ACKNOWLEDGED|RESOLVED plus reason/confirmation. Acknowledge before resolving; no automatic user restriction.
- GET `/admin/audit`: page, q (action/outcome/resource/actor UUID/event UUID), from/to PHT dates. GET `/admin/audit/:id`: read-only event detail. No update/delete/export route.
- GET `/admin/health`: verified DB query/latency, process uptime, mail queue/history, observed alert-worker status and scan cap. SMTP is explicitly not actively probed. Exports/files are disabled.

## Applicant and report intake

POST `/facility-applications` accepts facility name/area/address/description, numeric coordinates and daily opening/closing hours, cancellationPolicy, courtName, sport, hourlyRate in integer centavos, capacity and confirmed=true. Three per account per day; new facilities remain PENDING. GET `/facility-applications?page=1` lists only the applicant's records and latest reviewer response. POST `/facility-applications/:id/reply` accepts message (10–2,000 characters) only for that applicant's CLARIFICATION state, returning it to PENDING.

POST `/reports` accepts targetType=SECURITY|GENERAL|FACILITY|GAME, category (Security concern, Privacy concern, Conduct or abuse, Facility concern, Other), details (20–3,000 characters), and targetId only for a published facility or an accessible game. Ten per account per day. GET `/reports?page=1` lists only the reporter's records and review responses. No anonymous report intake, attachments or personal contact directory is exposed.
