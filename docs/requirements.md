You are my senior full-stack development partner, UI/UX designer, and cybersecurity implementation reviewer.

Build LaroSentry in my current VS Code workspace. Produce a working, database-backed website with complete user flows, not just static pages or a frontend mockup.

We are building the WEBSITE FIRST. Prepare the shared API for a future mobile application, but do not build the mobile app or install Android/Expo tooling yet.

Aim for dependable, thoroughly tested software. Never claim that the application is 100% error-free or production-ready without evidence. Fix discovered issues and report remaining limitations honestly.

==================================================
1. PROJECT INFORMATION
==================================================

Project:
LaroSentry: A Secure Sports Facility Discovery and Booking Platform for Players and Facility Operators in Metro Manila with Availability and Security Activity Monitoring.

Institution:
FEU Diliman

Program:
BSIT with specialization in Cybersecurity

Group:
Technical Difficulties

Members:
- Biglang-awa, Jade Patrick B.
- Eguna, Lucas Andrei M.
- Leano, Marcus Ynaki S.
- Novilla, Kyel Velemir G.

Purpose:
Help adults discover sports facilities, compare information, check court availability, request bookings, coordinate permitted participation, and manage reservations securely.

Provide facility owners and staff with operational tools, and administrators with moderation, audit logging, and application-security monitoring.

Pilot:
Approximately 20 participating facilities or clearly labeled fictional demonstration facilities in selected Metro Manila areas, with Quezon City as the starting area.

Do not fabricate research findings, survey results, testimonials, client commitments, verified businesses, or security-test results.

==================================================
2. WORKSPACE AND AUTONOMY
==================================================

Start by inspecting:
- Operating system and shell.
- Current directory and repository.
- Existing source code and package files.
- AGENTS.md or other applicable instructions.
- Installed Node.js, package managers, Git, Docker, and database tools.
- Available ports and relevant existing services.

Preserve unrelated work and existing configuration.
Do not overwrite a working project or create unnecessary nested folders.
If the directory is empty, initialize the project directly here.
If useful code already exists, adapt it.

You may:
- Install necessary project dependencies.
- Download required development tools from official sources.
- Create and edit project files.
- Run local services.
- Create development migrations.
- Execute authorized local tests.
- Diagnose and fix implementation errors.

Do not:
- Delete unrelated files.
- Reset existing databases without explicit authorization.
- Disable antivirus, firewall, TLS verification, or security controls.
- Read unrelated credentials or personal files.
- Print or commit secrets.
- Purchase services.
- Publish the repository, deploy publicly, or expose services through a public tunnel without permission.
- Run security tests against third-party services.

If a system installation requires administrator approval, a restart, account login, license acceptance, or payment, explain the exact action needed. Continue independent work where possible.

Do not stop after producing a plan. Start implementing after the initial inspection.

==================================================
3. TECHNOLOGY STACK AND DOWNLOADS
==================================================

Use mutually compatible stable versions, verified through official documentation at implementation time.

Pin the chosen runtime and package-manager versions.
Maintain a lockfile.
Do not indiscriminately upgrade everything to latest.

Languages:
- TypeScript.
- HTML and CSS through React.
- SQL for database migrations and constraints.

Workspace:
- pnpm workspaces.

Frontend:
- React.
- Vite.
- TypeScript.
- React Router.
- Tailwind CSS.
- Accessible components using shadcn/ui and/or Radix where useful.
- Lucide icons.
- TanStack Query.
- React Hook Form.
- Zod for frontend validation.
- Motion for restrained interface animations.
- Recharts for operational/security charts.
- Leaflet with a compatible React integration for maps.
- Maintained QR-generation and browser-scanning libraries.

Backend:
- Node.js supported LTS release.
- NestJS.
- REST API.
- OpenAPI/Swagger documentation.
- Prisma ORM.
- Independent server-side request validation.
- Argon2id password hashing.
- Maintained TOTP library for privileged-account MFA.
- Secure cookie/session support.
- Security headers.
- Rate limiting.
- Structured logging with sensitive-field redaction.

Database:
- PostgreSQL.
- Prisma migrations.
- Custom SQL migrations for exclusion constraints and other features the ORM cannot express.

Development services:
- Docker Compose when available.
- PostgreSQL container.
- Mailpit for local email testing.
- Local private file-storage adapter.

Testing:
- Vitest and React Testing Library for relevant frontend tests.
- Jest or a compatible NestJS test setup.
- Supertest for API tests.
- Playwright for browser workflows.
- Accessibility checks using axe where appropriate.

Quality:
- ESLint.
- Prettier.
- TypeScript strict mode.
- Dependency auditing.
- Production build verification.

Later deployment target:
- Ubuntu.
- Nginx reverse proxy.
- HTTPS.
- Private PostgreSQL.
- Protected file storage and backups.

Do not install unnecessary:
- PHP/Laravel.
- Flutter/Dart.
- XAMPP.
- Android Studio.
- Expo/mobile dependencies.
- Kubernetes.
- Microservice infrastructure.

Do not require Redis, a queue service, or cloud hosting for the initial working website. Add infrastructure only when there is a demonstrated need.

If Docker cannot run, document a native PostgreSQL alternative. Do not silently switch the project to SQLite, because booking-concurrency tests must exercise PostgreSQL.

Provide scripts for Windows PowerShell and platform-neutral pnpm commands wherever possible.

==================================================
4. ARCHITECTURE
==================================================

Use a modular monolith with one shared database.

Suggested structure:
- apps/web
- apps/api
- packages/contracts
- packages/config
- docs
- infra
- scripts

Create backend modules for:
- Authentication and sessions.
- Users and profiles.
- Facilities and memberships.
- Courts and pricing.
- Availability and allocations.
- Bookings.
- Participation and invitations.
- Payment records.
- QR/check-in.
- Reviews and moderation.
- Notifications.
- Audit logging.
- Security alerts.

Both the website and future mobile app must use the API.
Never expose database credentials to the browser.

Use same-origin /api routing in development through a Vite proxy and later through a reverse proxy where practical.

Document interfaces so the mobile client can be added later without duplicating booking rules.

==================================================
5. SCOPE AND EXCLUSIONS
==================================================

Include:
- Facility discovery and comparison.
- Maps and manual location search.
- Optional one-time device location for nearby facilities.
- Court-specific availability.
- Staff-approved reservations.
- Public, private, and booking-only modes.
- Invitations and organizer-approved join requests.
- Privacy-controlled profiles.
- Payment records.
- QR booking verification.
- Reviews.
- User reporting and blocking.
- Owner/staff dashboards.
- Administrator moderation.
- Audit logs and rules-based security monitoring.

Exclude:
- Player-matching engine.
- Compatibility scoring.
- Player ranking.
- Personalized player recommendations.
- Searching for matching players.
- Minor accounts.
- Continuous location tracking.
- Unrestricted direct messaging.
- Facial recognition.
- Government-ID storage.
- Blockchain.
- Escrow.
- In-app cost splitting.
- Organizer-collected participation payments.
- Arbitrary organizer payment links.
- Direct card processing.
- Production payment gateways initially.
- Full SIEM/SOC/IDS functionality.

Public-game browsing is allowed, but it must not become a player-matching feature.

==================================================
6. ROLES AND ACCESS CONTROL
==================================================

Support:
- PLAYER.
- FACILITY_OWNER.
- FACILITY_STAFF.
- ADMIN.

A facility owner can also book as a player.

Use facility-specific memberships and permissions:
- Owners manage only their facilities.
- Staff manage only assigned facilities and permitted operations.
- Players access only their private records and authorized shared content.
- Administrators perform explicitly permitted platform operations.

Staff cannot promote themselves.
Owners cannot grant platform administrator access.

Enforce authorization on the backend for:
- Detail and list endpoints.
- Nested resources.
- File downloads.
- QR scanning.
- Invitations.
- Exports.
- Notifications.
- Administrative actions.

Test direct API requests. Hidden buttons are not an access-control mechanism.

==================================================
7. VISUAL DESIGN
==================================================

Create a polished sports-booking product with:
- Deep navy.
- White and soft-gray surfaces.
- Restrained green accents.
- Consistent typography and spacing.
- Strong court photography.
- Clear visual hierarchy.
- Responsive layouts.
- Accessible forms and dialogs.
- Clear status badges with text, not color alone.

Use licensed or user-provided images. Record image sources when applicable.
If suitable assets are unavailable, use clearly labeled demo placeholders.
Do not present stock images as verified photos of real businesses.

Use:
- Subtle homepage entrance animations.
- Card hover states.
- Loading skeletons.
- Smooth filter and calendar transitions.
- Swipeable photo galleries.
- Clear booking progress.
- Small notification indicators.
- Brief success feedback after actual server success.

Respect prefers-reduced-motion.
Avoid scroll hijacking, autoplay audio, heavy background video, and animations that block interactions.

Use a coherent design system instead of unrelated component styles.
Avoid a generic dashboard-only appearance for the customer website.

All important screens need:
- Loading.
- Empty.
- Error.
- Permission-denied.
- Expired-session.
- Offline/reconnection behavior where relevant.

No fake success messages or nonfunctional primary buttons.

==================================================
8. PUBLIC WEBSITE FLOW
==================================================

Homepage:
1. Navigation:
   Logo, Find Courts, Public Games, List Your Facility, Log In, Sign Up.
2. Hero with location, sport, date, and optional time search.
3. Sport categories.
4. Published facility cards.
5. How booking works.
6. Explanation of public-game participation.
7. Facility-owner onboarding section.
8. Help, privacy, terms, and footer.

Do not invent usage statistics, testimonials, or verified badges.

Facility browsing should work without login.
Individual public-game listings/details require a registered adult account.

Visitor flow:
Homepage -> search -> filter/compare -> facility details -> court and time selection -> sign in -> resume booking.

Preserve the selected court and schedule after authentication, then revalidate them.

==================================================
9. DISCOVERY AND FACILITY DETAILS
==================================================

Discovery:
- Search by facility name and area.
- Filter by sport, price, amenities, date, and time.
- List/map toggle.
- Sort by price, distance when available, or actual rating.
- Pagination.
- Saved facilities for registered users.
- Compare up to three facilities.

Location:
- Ask permission before one-time device location access.
- Provide manual location input.
- Keep list browsing functional when maps fail.
- Do not require location permission to use the website.
- Use provider adapters and required attribution.
- Check map-tile/geocoding terms.
- Do not treat public OpenStreetMap services as unlimited.

Facility details:
- Gallery.
- Description.
- Address and directions.
- Published verification status with its actual meaning.
- Individual courts.
- Sports and amenities.
- Hours and policies.
- Prices and charges.
- Court availability.
- Reviews.
- Sticky booking panel on suitable screen sizes.

Label starting prices separately from final calculated prices.
Show when availability was last refreshed.

Only publish approved facility information.
Availability responses must never expose private booking identities or participants.

==================================================
10. AUTHENTICATION AND ACCOUNT FLOW
==================================================

Registration:
Email -> password -> nickname -> adult eligibility declaration -> terms/privacy acceptance -> email verification.

Collect only necessary information.
Self-declared age eligibility is not verified identity.
Do not retain unnecessary date-of-birth information.

Implement:
- Login/logout.
- Email verification.
- Password recovery.
- Password change.
- Active session listing and revocation.
- Notification preferences.
- Privacy settings.
- Account-deletion request workflow.

Public profiles:
Nickname and optional avatar.
No public email, phone number, date of birth, or security history.

Use accountable internal user IDs.
Do not promise complete anonymity.

Web authentication:
- Opaque server-managed sessions.
- Store session-token hashes server-side.
- HttpOnly cookies.
- Secure cookies under HTTPS.
- Deliberate SameSite configuration.
- CSRF protection for state-changing requests.
- Session rotation at authentication and privilege changes.
- Idle and absolute expiration.
- Revocation after password reset or account suspension.
- No session secrets in localStorage.

Use local Mailpit for email flows.
Do not bypass verification simply because production email is unconfigured.

Require MFA for owner/admin privileged access.
Document staff MFA policy.
Protect recovery codes and TOTP secrets appropriately.

==================================================
11. BOOKING ENGINE
==================================================

Separate a facility from its individual bookable courts.

Booking flow:
Select court -> choose date/time -> choose reservation mode -> review server-calculated price and policies -> submit -> receive reference -> await facility decision.

Display:
- Facility/court.
- Start/end time and duration.
- Price breakdown.
- Reservation mode.
- Capacity/expected guests.
- Cancellation policy.
- Payment arrangement.
- Clear approval requirement.

Use staff-approved bookings initially.

Booking states:
PENDING -> CONFIRMED / REJECTED / EXPIRED / CANCELLED.
CONFIRMED -> COMPLETED / NO_SHOW / CANCELLED.

Document allowed transitions, permissions, and time conditions.
Check-in is a separate attendance event.
Do not automatically label a checked-in booking completed.

Pending requests:
- Do not reserve or guarantee a slot.
- May overlap other pending requests.
- Expire on a configurable schedule.
- Must be visibly labeled as requests.
- Must not collect payment before confirmation in the initial workflow.

Confirmation:
- Recheck policies, hours, price validity, and availability.
- Atomically acquire the court/time allocation.
- Only one overlapping booking can succeed.
- Handle affected pending requests consistently and notify users.

Database integrity:
- Use PostgreSQL timestamptz.
- Store UTC; display Asia/Manila.
- Use half-open time intervals [start, end).
- Adjacent bookings are allowed.
- Reject zero/negative duration.
- Use integer Philippine centavos for money.
- Snapshot price and policy terms.
- Use transactions and idempotency keys.

Maintain a shared court-allocation model for confirmed bookings and closure blocks.
Use a PostgreSQL exclusion constraint on court ID and active time range.
Use btree_gist where appropriate.
Create and test custom SQL migrations.

Do not rely on:
Check availability -> unprotected insert.

Rescheduling:
For the initial version, the owner/staff may approve a player-requested change.
The original slot remains reserved until the new slot is acquired atomically.
If the change fails, preserve the original reservation.
Revoke obsolete QR tokens after successful schedule changes.

Closures:
Do not silently displace confirmed bookings.
Show conflicts and require an explicit cancellation/rescheduling workflow.

==================================================
12. RESERVATION MODES
==================================================

PUBLIC:
- Only confirmed bookings can be published.
- Visible to signed-in adults.
- Show sport, facility, time, nickname, capacity, spaces, and rules.
- Users request to join.
- Organizer approves or rejects.
- Use transactions to prevent over-capacity approvals.
- Enforce one active participation/request per user per booking.
- Clearly define whether organizer and offline guests consume capacity.
- Do not publish participant contact details or a full public roster.

PRIVATE:
- Not listed publicly.
- Organizer invites registered adults.
- Invitations are expiring and revocable.
- Invitation token possession must not bypass recipient/account checks.
- No searchable directory of private user contact details.
- Only authorized people see booking/participant information.

BOOKING_ONLY:
- No in-app participant roster.
- Expected guest count where required.
- Offline minors are under the responsible adult and facility rules.
- Do not collect minor identities.

Visibility changes:
Use explicit transitions.
Never silently expose private participants by changing a game to public.
Require an appropriate confirmation and participant-handling policy.

Blocking:
Prevent new invitations/join interactions where applicable.
Document how existing shared reservations are handled.
Do not automatically cancel paid bookings or reveal hidden identities.

==================================================
13. PAYMENT RECORDS
==================================================

Keep payment state independent of booking state.

Initial methods:
- Pay at facility.
- Facility-approved manual bank/e-wallet instructions after confirmation.

Suggested states:
UNPAID, PENDING_VERIFICATION, PARTIALLY_PAID if deposits are supported, PAID, REFUND_PENDING, REFUNDED.

A user may submit an allowed payment reference.
This does not verify payment.
Only authorized facility staff can verify it in the initial build.

Track:
- Amount in centavos.
- Method.
- Reference where needed.
- Recorded/verified timestamps.
- Authorized actor.
- Correction/refund history.

Prevent duplicate payment recording and invalid transitions.
Do not silently overwrite verified financial records.

Changes to facility payment instructions require reauthentication and audit logging.

Do not store wallet credentials, OTPs, PINs, or card data.
Do not accept organizer payment links.
Do not claim the platform transfers or refunds money when staff only record an external transaction.

A future payment sandbox must use authenticated, idempotent webhooks.

==================================================
14. MY BOOKINGS AND QR CHECK-IN
==================================================

My Bookings:
- Upcoming.
- Pending.
- Past.
- Cancelled.

Booking details:
- Reference.
- Court/schedule.
- Booking and payment status.
- Status timeline.
- Rules.
- Participation controls.
- Eligible QR code.
- Cancellation/rescheduling requests.
- Facility contact information.

QR:
- Generate a cryptographically random opaque token.
- Store a token hash.
- Do not encode personal details or predictable booking IDs.
- Validate booking status, time window, staff permission, and facility.
- Revoke on cancellation/rescheduling.
- Atomically consume/check in to prevent replay.

Decide how QR display/reissue works without storing recoverable plaintext tokens. For example, authenticated reissue replaces the previous active token.

Scan outcomes:
- Valid.
- Already checked in.
- Wrong facility.
- Cancelled/expired.
- Outside permitted time.
- Invalid.

Provide a controlled booking-reference lookup fallback for authorized staff if camera access fails. Apply the same permission checks and record manual check-in.

==================================================
15. REVIEWS, REPORTS, AND NOTIFICATIONS
==================================================

Reviews:
- Only eligible users with a completed booking may review.
- Define one review per eligible booking/user.
- Owners cannot edit customer reviews.
- Moderation actions require reasons and history.

Reports:
- Report users, facilities, reviews, or games.
- Categorize reason.
- Restrict access to report details.
- Track review/action/outcome.

Notifications:
- Booking decisions and changes.
- Reminders.
- Invitations and participation.
- Payment verification.
- Important account/security events.

Use database-backed in-app notifications and local email first.
Persist notification events reliably, preferably with a simple PostgreSQL outbox/job mechanism.
Retry safely and deduplicate.
Do not let email failures undo a successful booking.
Do not send false confirmation notifications for rolled-back transactions.
Avoid unnecessary sensitive content in previews.

Use authenticated polling initially.
Stop polling appropriately when tabs are inactive.
Show last-updated information where relevant.

==================================================
16. OWNER AND STAFF WORKFLOWS
==================================================

Owner onboarding:
Register -> apply -> provide facility details -> administrator review -> clarification/approval/rejection -> publish approved facility.

No public facility listing merely because a form was submitted.
Define verification as an administrative review, not a guarantee of safety or legitimacy.
Do not collect government IDs.

Owner dashboard pages:
- Overview.
- Facilities/courts.
- Schedule calendar.
- Booking requests.
- Reservations.
- Payments.
- Attendance.
- Staff permissions.
- Reviews.
- Activity history.
- Policies and settings.

Overview:
Today's bookings, pending requests, occupancy, and recorded payments.
Clearly define each metric.
Do not call recorded payment totals audited revenue.

Staff workspace:
Assigned facilities -> today's schedule -> permitted booking/payment actions -> QR check-in -> attendance/no-show.

Staff invitations:
Expiring and revocable.
Server-side role restrictions.
No self-promotion.

==================================================
17. ADMINISTRATION AND SECURITY MONITORING
==================================================

Admin pages:
- Facility applications.
- Users/restrictions.
- Moderation reports.
- Facility oversight.
- Security alerts.
- Audit history.
- Operational health.
- Administrative settings.

Audit events:
Authentication/recovery, role changes, staff invitations, facility decisions, payment-instruction changes, booking/payment transitions, QR scans, reports, restrictions, access denials, administrative actions.

Record:
- Event ID.
- UTC timestamp.
- Actor ID where known.
- Action and outcome.
- Resource ID.
- Correlation ID.
- Minimal relevant metadata.

Never log passwords, tokens, OTPs, full private request bodies, or payment secrets.
Do not provide an arbitrary "delete audit history" control.

Separate migration database credentials from runtime credentials.
Use least-privilege runtime database grants.
Protect audit records from ordinary application mutation.
Document administrator/database-owner capabilities honestly.

Rules:
- Failed-login bursts.
- Successful login after a failure burst.
- Repeated forbidden-resource access.
- Repeated invalid QR scans.
- Privileged-role changes.
- Request-rate-limit triggers.

Implement documented thresholds, time windows, severity, alert deduplication, acknowledgement, and resolution notes.

Alerts are signals for human review, not proof of wrongdoing.
Do not auto-permanently-ban users based on a simple threshold.
Ordinary booking/payment changes are audited but not automatically malicious.

==================================================
18. DATA MODEL
==================================================

Design an ERD and normalized schema covering:

Identity:
users, profiles, sessions, verification/reset tokens,
MFA credentials, recovery codes, terms/privacy acceptance.

Facilities:
facilities, facility_memberships, courts, sports,
court_sports, amenities, facility_amenities,
facility_media, operating_hours, pricing_rules,
facility_review_history.

Bookings:
bookings, booking_status_history, court_allocations,
reschedule_requests, booking_participants,
join_requests, invitations, payment_records,
payment_history, check_in_tokens, check_ins.

Community:
saved_facilities, reviews, user_reports, user_blocks.

Operations:
notifications, notification_preferences,
outbox/jobs, audit_events, security_rules,
security_alerts, security_alert_actions,
idempotency_records.

Consolidate tables where appropriate; do not blindly create redundant entities.
Use foreign keys, indexes, uniqueness/check constraints, and suitable archival/deletion policies.

Seed approximately 20 fictional facilities with courts, schedules, and varied prices.
Use clearly labeled demo users/bookings.
Use future-relative dates so the demo remains usable.
Never automatically reseed or erase existing data at startup.

==================================================
19. SECURITY AND PRIVACY
==================================================

Implement:
- Strong password hashing.
- Secure session lifecycle.
- MFA for privileged roles.
- Server validation.
- Output encoding.
- Parameterized queries.
- Explicit CORS rules.
- CSRF defenses.
- Appropriate security headers/CSP.
- Rate limits.
- Secure file handling.
- Object-level and facility-level authorization.
- Data minimization.
- Protected secrets.
- Backups and restore procedure.

File uploads:
- Allowlist file types.
- Validate actual content, not only extension.
- Enforce size/dimension limits.
- Randomize filenames.
- Reject executable/active content.
- Keep private files outside public static directories.
- Create sanitized public image derivatives.
- Strip unnecessary public image metadata.
- Add scanning/quarantine if supported; document actual coverage.

Document data retention and account deletion behavior.
Preserve required historical records with minimized identifiers according to the chosen policy.
Do not claim legal compliance or certification automatically.

Local HTTP exceptions must be development-only.
Production startup should reject insecure required configuration.
Never globally weaken cookie/security settings to fix localhost.

==================================================
20. ROUTES AND NAVIGATION
==================================================

Plan routes such as:

Public:
/
/facilities
/facilities/:slug
/compare
/how-it-works
/list-your-facility
/help
/privacy
/terms

Authentication:
/login
/register
/verify-email
/forgot-password
/reset-password
/mfa

Player:
/app
/app/bookings
/app/bookings/:id
/app/games
/app/games/:id
/app/invitations
/app/saved
/app/notifications
/app/settings/profile
/app/settings/privacy
/app/settings/security

Owner:
/owner
/owner/facilities
/owner/facilities/:id
/owner/calendar
/owner/bookings
/owner/payments
/owner/staff
/owner/activity
/owner/settings

Staff:
/staff
/staff/bookings
/staff/check-in

Administrator:
/admin
/admin/facility-applications
/admin/users
/admin/reports
/admin/security-alerts
/admin/audit
/admin/health

Adapt names if needed, keeping navigation coherent.
Use separate layouts with shared components.
Route guards are supplemental to backend authorization.

==================================================
21. FAILURE HANDLING AND PERFORMANCE
==================================================

Handle:
- API unavailable.
- Database unavailable.
- Email delivery failure.
- Map failure.
- Session expiry.
- Permission denial.
- Invalid form input.
- Duplicate submission.
- Stale availability.
- Lost connectivity during a mutation.
- QR camera failure.
- Notification retry.
- Upload rejection.

Use idempotency keys to recover safely when the browser cannot determine whether a booking submission succeeded.

Never show offline booking success.
Preserve safe form input.
Do not persist passwords or sensitive payment data in browser storage.

Use:
- Route-level code splitting.
- Optimized responsive images.
- Pagination.
- Indexed queries.
- Bounded API responses.
- Debounced search.
- Lazy map/chart loading where useful.
- Accessible loading indicators.

Measure performance under documented conditions.
Do not invent Lighthouse scores or response-time results.

==================================================
22. TESTING AND ACCEPTANCE CRITERIA
==================================================

Meaningful tests must cover:

Authentication:
Registration, verification, login, logout, recovery,
session revocation, MFA, suspension.

Authorization:
Cross-user booking access.
Cross-facility staff access.
Unauthorized role changes.
Private-game access.
Private-file access.
List/export endpoint leakage.

Bookings:
Two concurrent confirmations for one court/time:
exactly one succeeds.
Adjacent intervals succeed.
Closures prevent conflicting confirmation.
Invalid time intervals fail.
Repeated submissions are idempotent.
Invalid status transitions fail.
Failed rescheduling preserves the original slot.
Cancellation revokes QR access.

Participation:
Duplicate join requests.
Concurrent approvals and capacity.
Invitation expiration/revocation.
Private-to-public transitions.
Blocking behavior.

Payments:
A player reference cannot self-verify.
Unauthorized staff cannot edit records.
Duplicate recording is prevented.
Refund history remains attributable.

QR:
Wrong facility.
Expired/revoked token.
Repeated scan.
Concurrent replay.
Manual fallback authorization.

Monitoring:
Real events produce expected alerts.
Deduplication works.
Sensitive values do not appear in logs.
Alert actions are attributable.

Recovery:
Backup restoration into a separate test database.
Migration execution on an empty database.

Browser:
Visitor discovery.
Player booking.
Owner approval.
Payment recording.
QR/manual check-in.
Review submission.
Administrator report/alert review.

Validate representative mobile, tablet, and desktop viewport sizes.
Check keyboard navigation, focus handling, labels, contrast, and reduced motion.

Run actual tests and fix failures.
Do not remove meaningful assertions to make tests pass.
Do not test third-party map/payment infrastructure.

==================================================
23. IMPLEMENTATION STAGES
==================================================

Stage 1:
Inspect environment.
Create tracked implementation plan.
Set up workspace, database, local email, and scripts.
Implement secure login and a real database-backed facility list.
Create shared layouts and core design tokens.

Stage 2:
Complete discovery, facility details, filters, map fallback,
saved facilities, and comparison.

Stage 3:
Implement court schedules, pricing, booking requests,
owner approval, allocation constraints, and booking history.

Stage 4:
Implement owner/staff dashboards, closures, rescheduling,
payment records, and staff permissions.

Stage 5:
Implement reservation modes, invitations, join requests,
capacity rules, and privacy controls.

Stage 6:
Implement QR/manual check-in, reviews, reporting,
blocking, and reliable notifications.

Stage 7:
Complete security rules, alert dashboard, protected audit views,
and account-security management.

Stage 8:
Polish motion, responsiveness, accessibility, error handling,
performance, tests, and setup documentation.

Build security into every stage.
Do not postpone authorization until Stage 7.

Keep each stage runnable.
Do not build every screen as a disconnected mockup first.
Do not mark a stage complete until its actual workflow works.

==================================================
24. PROJECT COMMANDS AND DOCUMENTATION
==================================================

Provide documented root commands for:
- Installing dependencies.
- Checking prerequisites.
- Starting local services.
- Running migrations.
- Generating the Prisma client.
- Seeding demo data explicitly.
- Starting web/API.
- Running lint and type checks.
- Running unit/integration/browser tests.
- Building production bundles.
- Backing up and restoring a test database.

Suggested scripts:
pnpm setup:check
pnpm services:up
pnpm db:migrate
pnpm db:generate
pnpm db:seed
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build

Use safe migration commands and clearly distinguish local development from deployment.

Maintain:
README.md
.env.example files
docs/requirements.md
docs/architecture.md
docs/database.md
docs/access-control-matrix.md
docs/booking-state-machine.md
docs/api.md
docs/threat-model.md
docs/security-controls.md
docs/testing.md
docs/deployment.md
docs/backup-restore.md
docs/asset-sources.md
docs/decisions.md
docs/progress.md

Explain architecture and business rules in beginner-friendly language.

Provide a secure local demo-account bootstrap command.
Do not hard-code or commit a universal administrator password.
Do not expose credentials in the website.

==================================================
25. EXECUTION AND HANDOFF
==================================================

Start now:
1. Inspect the workspace and prerequisites.
2. State relevant findings briefly.
3. Create the implementation plan.
4. Install compatible dependencies.
5. Implement Stage 1.
6. Run it and test the first complete workflow.
7. Continue through the remaining stages as the session allows.

If context becomes limited, update docs/progress.md with:
- Completed work.
- Files and commands involved.
- Tests actually run.
- Current failures/blockers.
- Exact next steps.

Do not restart or overwrite completed work on continuation.

At each handoff provide:
- What works.
- Local URLs.
- Exact startup commands.
- Actual test results.
- Known limitations.
- Any external setup I must perform.
- The next incomplete milestone.

The final result should be a polished, functional, secure-by-design website whose implementation and limitations our four-member group can understand, demonstrate, and defend.