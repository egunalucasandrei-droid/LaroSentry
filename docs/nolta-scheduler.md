# NOLTA scheduling module — 2026-10-16

The supplied master requirements and the local `Downloads/NOLTA` HTML, CSS and JavaScript were reviewed against LaroSentry's existing routes, authentication, Prisma models, booking transactions and tests. NOLTA is integrated at `/scheduler`, not a replacement site. The implementation retains TypeScript, React/Vite, React Router, TanStack Query, NestJS, Prisma and PostgreSQL. No dependency or alternative storage/authentication system was added.

## Open and use it

Run `./pnpm.cmd demo:start` in PowerShell, then open `http://127.0.0.1:5176/scheduler`. Existing demo credentials remain unchanged. For management, use `http://127.0.0.1:5176/scheduler/admin/schedule`; the named privileged demo accounts may password-confirm **Open demo workspace**, while ordinary privileged accounts use MFA. The global **NOLTA scheduler** link and management hub shortcut open the module.

Demo startup now deploys pending migrations before serving the app. For the normal development database, run `./pnpm.cmd db:generate` and `./pnpm.cmd db:migrate` before `./pnpm.cmd dev`. Migration `202610160007_scheduler` adds nullable court hour overrides, duration/surface settings, date exceptions, booking source, update time and demo archive marker. Existing records retain their IDs and start/end times. Null court hours inherit facility hours. New defaults are minimum 30 minutes, default 60 minutes, interval 30 minutes, and no configured maximum beyond fitting within one operating day.

## Requirements and working routes

| Requirement            | Implementation                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin Schedule         | `/scheduler/admin/schedule`: court/date selectors, month/week/day calendars, selectable slots, manual reservation review, operating-hour settings, maintenance and date exceptions.                                                                    |
| Admin Courts           | `/scheduler/admin/courts`: add/edit, surface, sport, price, capacity, activation, per-court hours and duration settings. Deactivation preserves existing reservations/history.                                                                         |
| Admin Activity         | `/scheduler/admin/activity`: paginated reservation cards with reference/customer/court/time/duration/status; search, court/date/status/period filters, reset filters, confirm/cancel/reschedule and local demo reset.                                  |
| User Home              | `/scheduler`: account welcome, active court count, upcoming reservation count/preview and booking shortcut.                                                                                                                                            |
| User booking           | `/scheduler/book`: same calendar/slot component as management; custom whole-minute duration; AM/PM time cards; explicit price/policy/session review.                                                                                                   |
| My Reservations        | `/scheduler/reservations`: account-scoped upcoming/past/cancelled filters, details and eligible cancellation.                                                                                                                                          |
| Profile                | `/scheduler/profile`: nickname editing, private email, current role, account/security links and logout through existing authentication.                                                                                                                |
| Shared engine          | `packages/contracts/src/scheduling.ts`, used by public availability, discovery date filtering, management schedules and all backend booking quote/confirmation/rescheduling validation.                                                                |
| Custom duration        | 45, 75 and 105 minute sessions work when allowed by the court. Starts follow the configured interval relative to opening. Defaults never rewrite existing reservations.                                                                                |
| Maintenance            | Interval and whole-date closure through existing allocation transactions; reopening restores slots. Date exceptions can alter hours or close a date, with protection against displacing confirmed bookings.                                            |
| Conflicts              | Half-open overlap semantics and PostgreSQL GiST exclusion; concurrent competing confirmations cannot both allocate the same court. Adjacent sessions and different courts are allowed.                                                                 |
| Reservation management | Idempotent submissions, pending player requests, immediate authorized manual bookings, confirmation, reasoned cancellation and same-facility court/date/time/duration rescheduling. Existing QR tokens are revoked when changed.                       |
| Time display           | Central AM/PM formatting. New setting forms explicitly accept AM/PM text; internal storage remains UTC timestamps/PHT scheduling minutes.                                                                                                              |
| Session categories     | No Singles/Doubles/Practice/Lesson categories. Occupied slot label is Reserved; internal statuses and existing public/private game features are preserved.                                                                                             |
| Responsive design      | Module-scoped NOLTA palette, supplied SVG logo, rounded panels, wider desktop grid and readable typography. Available font fallback avoids new remote font dependencies. Forms stack, dialogs scroll and calendar controls remain keyboard accessible. |
| Persistence            | Existing database and opaque-cookie sessions; no browser-local account or reservation store. Availability/activity refresh every 30 seconds and after writes; normal query refetch also runs on window focus.                                          |
| Navigation             | Separate admin and user routes with active nav states; changing modes never grants a role. Mobile navigation uses a sticky compact grid, rather than importing the prototype's fixed phone shell.                                                      |
| Tests and setup        | Dedicated API and browser suites below, migration, documentation and normal demo launcher.                                                                                                                                                             |

## Deliberate integration boundaries

- **Reset is an archive reset, not physical deletion.** It only affects NOLTA-origin reservations in the named local demo administrator's explicitly assigned fictional facilities. It cancels/releases those allocations, revokes tokens/invitations, and removes records from active scheduler and personal booking lists. Courts, rules, maintenance, accounts, unrelated LaroSentry reservations, immutable histories, audit and financial evidence remain. A preview count/fingerprint, explicit confirmation and reason are required. This adapts the prototype's destructive reset to the existing immutable-history safeguards; literal deletion of every reservation is not implemented.
- Existing player approval behavior remains: player submissions are pending and do not occupy time until a host confirms. Authorized manual reservations are confirmed immediately. The UI explains the difference.
- Platform ADMIN is not an automatic facility bypass. Scheduler management requires ADMIN or FACILITY_OWNER plus an OWNER membership in the relevant facility and privileged session verification. Staff retain existing assigned operational tools, but cannot enter this management module. Ordinary accounts cannot use the demo shortcut.
- Manual bookings use an existing verified account's exact email, or the acting account when omitted. There is no anonymous customer identity store or account-directory search for hosts.
- Rescheduling is restricted to courts in the same authorized facility. Paid records may only move to equal-price sessions. Cross-facility transfers and automatic refunds are not implemented.
- Month/week/day modes select dates; slot cards show the selected day's sessions. No drag-and-drop event timeline is claimed. The facility timezone remains the existing Asia/Manila convention.
- Court/date-exception lists are capped at 500 courts / 100 exceptions; activity is paginated at 20 rows. The bounds fit the current local pilot; larger deployment needs additional pagination.
- The prototype's external font request is not copied. Manrope is used if available locally, otherwise the existing Segoe UI/sans-serif stack. No production deployment or security certification is claimed.

## Changed files

- Database: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/202610160007_scheduler/migration.sql`.
- Shared contracts: `packages/contracts/src/scheduling.ts` (new), `packages/contracts/src/index.ts`.
- API: `apps/api/src/scheduling.ts` and `scheduler.controller.ts` (new); `main.ts`, `bookings.controller.ts`, `operations.controller.ts`, `facilities.controller.ts`, `booking.rules.ts`.
- Web: `apps/web/src/scheduler.tsx`, `scheduler.css` (new); `main.tsx`, `management.tsx`, `court-calendar.tsx`.
- Tests/tooling: `apps/api/test/scheduler.test.ts`, `scheduler-browser-fixtures.ts`, `tests/browser/scheduler.spec.ts` (new); `tests/unit/contracts.test.ts`, `tests/browser/admin.spec.ts`, `demo-login.spec.ts`, `booking.spec.ts`; `scripts/demo.mjs`, `scripts/test-database.mjs`, `playwright.config.ts`, root/API `package.json`.
- Docs: this file, README, NOLTA integration note, progress, API contract, access-control matrix, threat model and security controls.

## Verification

`./pnpm.cmd test:integration` creates a separate database and runs the existing and new authorization/booking tests. `./pnpm.cmd test:scheduler:e2e` creates a separate recognized demo database solely for testing reset, runs local ports 5175/4010, and never changes the selected demo marker/passwords. `./pnpm.cmd test:admin:e2e` retains real MFA coverage in an ordinary isolated test database. See `progress.md` for actual final results and regression checks.

No existing demo reservation was reset to perform verification. Initial UI checks caught an ambiguous court label and unnecessary management forms inside the rescheduling dialog; both were corrected before successful browser reruns.
