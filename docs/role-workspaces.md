# Role workspaces — 2026-10-16

This extends the existing TypeScript/React/Vite/NestJS/Prisma/PostgreSQL application and LaroSentry branding. Authentication, cookies, MFA, scheduling, payments, applications and admin review tools are reused. This task adds no dependencies, schema changes or migrations. Existing accounts, reservations and immutable history are preserved.

## Player workspace

`/app` and `/app/bookings` show personal bookings. Navigation includes discovery, saved places, games, invitations, notifications, reports, facility applications and profile/security settings. Existing facility maps, prices, availability, booking modes, payment instructions, QR and eligible cancellation remain. Past filtering now includes ended reservations even before operators complete attendance review. Booking and payment status remain separate.

Every authenticated role retains player access for their own records. The workspace switcher uses server-reported memberships and the explicit ADMIN role; switching pages grants no permissions. Login chooses ADMIN, then assigned OWNER, then assigned STAFF, otherwise personal bookings. Safe explicit return URLs remain supported.

## Owner workspace

`/owner` shows database counts for PHT today's bookings (all statuses), pending requests, upcoming confirmed reservations and recorded full payments. Counts use actual OWNER memberships. `/owner/facilities` links to an editor for description, address and amenities; ownership/publication cannot be edited there. `/owner/courts` opens existing NOLTA court/pricing/settings controls. `/owner/calendar` reuses court schedules and closures. Booking requests retain transactional confirmation/rejection/rescheduling; reservations have searchable paginated records. Payments, attendance, staff, reviews, report status, notifications, activity and settings have separate pages.

Staff management takes an existing verified unrestricted account's exact email, an owned facility and explicit BOOKINGS/PAYMENTS/ATTENDANCE permissions. Owners cannot modify OWNER memberships, themselves or ADMIN accounts through this form. Grant/update/removal requires a reason and confirmation, audits/notifies and revokes the target's sessions. Removal preserves unrelated assignments. A global role alone grants no workspace.

## Staff workspace

`/staff` is distinct from `/owner`. STAFF memberships and permission sets control navigation and API access. BOOKINGS enables schedules/booking actions; PAYMENTS enables payment records/recording; ATTENDANCE enables check-in/history. Owner and staff assignments may coexist on an account. Staff cannot access owner staff-management/reviews/reports/activity or platform administration.

Check-in accepts a reference or supplied QR token, validates facility/time/status/replay protections on the server, and displays attendance without tokens. Built-in camera capture is not implemented.

## Admin workspace

Existing applications, users/restrictions, reports, security alerts, read-only audit and measured health remain. Added `/admin/facilities`, `/admin/bookings`, `/admin/bookings/:id` and `/admin/payments`. Lists have search/pagination; facilities/bookings support status filters and facility investigation links scope bookings. Booking details show status/payment history. Payment oversight shows external amount/method/reference/state, time and verifier without credentials, sessions or MFA secrets. Booking/payment reads are audited.

Unpublication/publication requires confirmation/reason, transactional admin-session revalidation and a recorded admin decision. Publication requires an APPROVED application. Unpublication hides public discovery/new booking availability while preserving reservations. Approval is not a safety certification. ADMIN does not automatically receive facility operator permissions.

## Applications and payments

Registration still creates PLAYER only. Applications accept existing facility/court/location/hours/pricing/policy fields plus amenities. Existing PENDING → CLARIFICATION → PENDING → APPROVED/REJECTED remains; CLARIFICATION is the existing needs-information state. Approval grants an OWNER membership, promotes PLAYER or FACILITY_STAFF to FACILITY_OWNER and revokes sessions. Existing STAFF memberships remain. Decisions retain actor/time/reason. No draft/contact-information store was added.

Payments remain external full-payment records. Assigned owners/permitted staff cannot verify their own booking's payment. The immutable record stores actor/time/state; audit records the transition from no verified full payment to PAID. Booking-only staff no longer receive payments through the legacy operations booking list. No online transfer, customer reference-submission queue, partial-payment ledger, refund execution or financial-history correction UI is claimed.

## Final access matrix

| Action                                                         | Player               | Owner                                | Staff                                     | ADMIN                                       |
| -------------------------------------------------------------- | -------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------------------- |
| Discovery / own bookings, payment status, QR, reports, profile | Own account          | Own account                          | Own account                               | Own account                                 |
| Apply to host                                                  | Yes                  | Yes                                  | Yes                                       | Yes; another admin reviews                  |
| Owner workspace, facility details, courts, staff               | Denied               | OWNER membership + MFA               | Only if also OWNER                        | Explicit OWNER membership + MFA             |
| Staff workspace                                                | Denied               | Only with STAFF assignment           | STAFF assignment + MFA                    | Only with STAFF assignment                  |
| Booking decisions / closures                                   | Denied               | Own facility                         | Assigned BOOKINGS                         | Assigned operator membership                |
| External payment recording                                     | Denied               | Own facility; another user's booking | Assigned PAYMENTS; another user's booking | Assigned operator; another user's booking   |
| Check-in / attendance                                          | Own eligible QR only | Own facility                         | Assigned ATTENDANCE                       | Assigned operator membership                |
| Reviews / report status / facility activity                    | Own player workflows | Own facility; minimized data         | Denied                                    | Operator view only if assigned OWNER        |
| Platform applications/users/facilities/bookings/payments       | Denied               | Denied                               | Denied                                    | Explicit ADMIN + MFA                        |
| Platform reports/alerts/audit/health                           | Denied               | Denied                               | Denied                                    | Explicit ADMIN + MFA                        |
| Grant ADMIN                                                    | Denied               | Denied                               | Denied                                    | Existing explicit local access command only |

Normal privileged access requires MFA. The existing narrow local demo password-confirmed preview applies only to recognized fictional accounts/database. Origin/CSRF, session expiration/revocation, rate limits, password hashing and log redaction remain. New queries use Prisma/parameterized SQL; strings render as React text. New record pages use 20-row pagination. Legacy operations remain limited to 100 records. Owner reports show category/status without narratives or reporter identities. Review/status/activity lists are read-only.

## Changed files

- New API: `apps/api/src/workspaces.controller.ts`; registered in `main.ts`.
- API updates: `http.ts`, `bookings.controller.ts`, `operations.controller.ts`, `admin.controller.ts`, `submissions.controller.ts`.
- New UI: `apps/web/src/role-workspaces.tsx`.
- UI updates: `main.tsx`, `workspace.tsx`, `admin.tsx`, `auth.tsx`, `submissions.tsx`.
- Tests: new `apps/api/test/workspaces.test.ts`; API `package.json`, admin browser fixtures, `tests/browser/admin.spec.ts`, `tests/browser/demo-login.spec.ts`.
- Docs: README, this file, API contract, access-control matrix, threat model, security controls, NOLTA integration notes and progress.

## Exact commands

```powershell
# Existing local demo; keep terminal open and wait for DEMO READY
.\pnpm.cmd demo:start
# Open http://127.0.0.1:5176/login

# Separate test databases and verification
.\pnpm.cmd test:integration
.\pnpm.cmd test:admin:e2e
.\pnpm.cmd test:scheduler:e2e
.\pnpm.cmd test
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd build
```

Existing demo credentials are unchanged and are never displayed publicly. Use MFA or the existing local demo password-confirmed preview for exact fixture accounts. This task needs no extra migration/setup. See [progress](progress.md) for actual results; listing a command here does not claim it ran.

Final verification: 43 API integration tests, 6 unit tests and 21 browser tests passed across the admin/owner/staff, scheduler, booking, demo-login, discovery and footer suites. Typecheck, lint and production build passed. The live demo health check confirmed the existing selected database is connected.

Existing live-demo browser regressions can be run from another terminal using the following commands. Run batches separately, allowing a minute between them because ordinary demo rate limits remain active.

```powershell
$env:BROWSER_BASE_URL='http://127.0.0.1:5176'
$env:DEMO_E2E='1'
.\pnpm.cmd exec playwright test tests/browser/booking.spec.ts
# Wait a minute before the next batch
.\pnpm.cmd exec playwright test tests/browser/demo-login.spec.ts
# Wait a minute before the next batch
.\pnpm.cmd exec playwright test tests/browser/discovery.spec.ts tests/browser/information.spec.ts
```
