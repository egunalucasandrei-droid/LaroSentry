# Admin task handoff — 13 October 2026

The existing booking/community implementation was inspected and extended. No project rebuild, public deployment, remote scanning or automatic punishment was introduced.

## Requirement checklist

| Requested capability                | Implemented and verified behavior                                                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated admin workspace           | `/admin`, `/admin/applications`, `/admin/users`, `/admin/reports`, `/admin/alerts`, `/admin/audit`, `/admin/health`, with working details and actions.                                                                           |
| Explicit team authorization         | Existing ADMIN role; exact-account local grant/revoke command for verified accounts, reason and `--confirm`. No guessed team accounts, shared password or school-domain allowlist. Public registration cannot grant roles.       |
| Login and MFA                       | API namespace and each controller enforce ADMIN plus active verified-MFA session. Non-admin website routes show denial. Dedicated MFA page preserves first-enrollment recovery codes.                                            |
| Lists/details/actions/files/exports | Whole namespace guarded before route dispatch; each implemented record is looked up and authorized. Files/exports are disabled; attempted access is tested, not described as a completed download feature.                       |
| Overview                            | Real counts with explicit definitions: pending/clarification applications; open/reviewing reports; open/acknowledged alerts.                                                                                                     |
| Facility applications               | Actual applicant form, private pending record, clarification/reply, independent admin approval/publication and owner permission grant, rejection and immutable reasons/history. No attachments or facility editing in this task. |
| Users/restrictions                  | Search nickname/email; safe fields only; restriction/restoration, reason, confirmation, history and session revocation. Existing bookings/payment records preserved. Restrictions require manual review/restoration.             |
| Reports                             | Authenticated concern form, account-scoped tracking, admin review/resolve/dismiss/reopen and shared reviewer response. Own reports require another admin. No anonymous intake.                                                   |
| Security alerts                     | Explainable local rules, severity, supporting audit IDs, acknowledgement and resolution notes/history. Bounded scan and limitations disclosed; no automated bans or proof-of-attack claim.                                       |
| Audit history                       | Searchable, 20-row pagination, event detail, actor/action/outcome/time/resource/correlation/reason; read-only UI and runtime append-only database grants.                                                                        |
| Operational health                  | Actual DB query/latency, process uptime, mail queue/delivery history and observed alert scans. SMTP explicitly unprobed; no invented score.                                                                                      |
| Security & acceptable use           | `/security` linked from footer/admin; responsible use, privacy, prohibited abuse, reporting and fair review. No personal contact information published.                                                                          |
| Contact/reporting workflow          | Signed-in users submit security/privacy/conduct concerns and receive in-app review responses. Users unable to sign in need the existing team/course channel; no public mailbox or anonymous endpoint is configured.              |
| Existing safeguards                 | Reuses Argon2id, opaque cookie sessions, CSRF/origin checks, MFA, rate limits, Zod validation, Prisma parameterization, React text rendering and append-only audit. Adds bounded per-account application/report intake.          |
| Consequential actions               | Explicit confirmation and reason; fresh transactional actor/session checks; immutable decisions. Self-restriction, own-report/application adjudication and last-admin loss are prevented. Concurrent cross-restriction tested.   |
| Data minimization                   | Safe user projections, paginated lists, bounded decision/evidence detail, no credentials/tokens in admin views and no full request-body logging. Exports/files disabled.                                                         |
| Ethical testing                     | Local PostgreSQL, Mailpit and Chromium only. Admin browser identities live in a separate test database, never the regular demo database.                                                                                         |

## Actual verification

- `pnpm test:integration`: 27 passing tests, including eight admin-specific tests and all existing booking/community cases.
- `pnpm test:admin:e2e`: four passing isolated browser tests, including denial for PLAYER/FACILITY_OWNER/FACILITY_STAFF and the full admin workflow with MFA.
- `pnpm test:e2e`: five existing booking/community/discovery workflows passed after the changes.
- `pnpm test`: three unit tests passed.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`: passed.
- `pnpm db:backup`, `pnpm db:restore:test`: migration-five database restored to a new database with 20 fictional facilities; no existing database was overwritten.
- Mobile admin overview overflow and serious/critical axe checks passed in the tested state. Browser coverage also exercises safe rendering of submitted markup as text.

The first isolated test runner launch exposed a Windows `--import` path issue; it was fixed by using a file URL and the runner subsequently passed. Services were restarted when PostgreSQL was stopped. No outstanding application test failure remains. The existing pg adapter concurrent-query deprecation warning remains and should be investigated before upgrading pg. No penetration-test certification, production readiness or complete threat detection is claimed.

## Files added or changed for this task

Backend:

- `apps/api/src/admin.controller.ts` — seven admin sections, record decisions, search and health.
- `apps/api/src/admin-access.ts` — transactional reauthorization, shared lock, last-admin protection and immutable decisions.
- `apps/api/src/admin-bootstrap.ts` — exact-account local grants/revocation.
- `apps/api/src/submissions.controller.ts` — real applicant/report intake, own records and clarification replies.
- `apps/api/src/security-alerts.ts` — bounded, deduplicated rules and observed worker state.
- `apps/api/src/http.ts`, `main.ts` — admin checks, namespace guard, denial audit and maintenance worker integration.
- `apps/api/src/audit.ts`, `bootstrap.ts`, `operations.controller.ts` — reason support, removal of demo ADMIN shortcut, replacement of old admin placeholders.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/202610130005_admin/migration.sql` — review/history/evidence schema and grants.
- `apps/api/package.json` — local admin and combined integration commands.

Website:

- `apps/web/src/admin.tsx` — working admin pages, pagination, confirmations/reasons, evidence/history.
- `apps/web/src/submissions.tsx` — applications, reports and readable security/acceptable-use page.
- `apps/web/src/workspace.tsx`, `main.tsx`, `public.tsx`, `styles.css` — role/MFA route gating, navigation, footer, application copy and responsive styling.
- `apps/web/vite.config.ts` — configurable local API proxy for isolated browser tests; default unchanged.

Tests/tooling:

- `apps/api/test/admin.test.ts`, `apps/api/test/admin-browser-fixtures.ts` — authorization/workflow tests and isolated fixture identities.
- `tests/browser/admin.spec.ts` — complete UI/backend admin acceptance workflows and non-admin denials.
- `scripts/test-database.mjs`, `playwright.config.ts`, `package.json` — isolated admin browser servers/database and root command.

Documentation: `README.md`, `docs/access-control-matrix.md`, `threat-model.md`, `security-controls.md`, `progress.md`, `testing.md`, `api.md`, `database.md`, `architecture.md`, `decisions.md`, and this handoff.

## Group setup

1. In the workspace, run `pnpm services:up`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm dev` using `.\pnpm.cmd` in PowerShell. Migration five is already applied here. Existing data stays intact.
2. Each authorized teammate registers and verifies email via local Mailpit at http://127.0.0.1:8025.
3. An authorized local operator runs `.\pnpm.cmd admin:access grant exact-email "Team authorization reason" --confirm` once per agreed account. No actual team address has been assumed or granted by this task.
4. Sign in again at http://127.0.0.1:5173/admin, enroll/verify MFA, privately save recovery codes, then open the workspace. Prefer at least two independently controlled MFA-ready admins before relying on the system.
5. Keep `.env`, `.env.migrations`, `.local`, backups, test traces and recovery codes private. `pnpm test:admin:e2e` provisions only isolated test identities; do not use their credentials as team accounts.

No external paid service, mail provider or public deployment is required for local use. Production needs a configured operational security/appeal contact, HTTPS/proxy verification, retention/deletion processes, monitoring, authenticated mail and a separate hardening review. Those are not represented as finished here.
