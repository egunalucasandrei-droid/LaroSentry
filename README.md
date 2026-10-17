# LaroSentry

### Local DEMO MODE and system guide (2026-10-17)

For the existing four local accounts, opt into verification bypass while retaining password login, real roles/memberships, CSRF and business rules:

```powershell
cd C:\larosentry-test
$env:DEMO_MODE='true'
$env:LOCAL_DEMO_QUICK_ACCESS='0'
.\pnpm.cmd demo:start
```

Open **http://127.0.0.1:5176/login** with your local `@demo.example.test` credentials. Admin/owner/staff/player open `/admin`, `/owner`, `/staff`, `/app`; the existing switcher remains. The UI displays DEMO MODE. Stop the terminal, set `$env:DEMO_MODE='false'`, and restart to restore normal verification. Production/public hosting refuses this flag. No local passwords, roles, verification timestamps or MFA enrollment are rewritten. Render remains separate and unchanged. [Setup, scope, tests and disable steps](docs/demo-mode.md). [How the whole system connects](docs/system-framework.md).

### Free Render testing pilot (2026-10-17)

**Live test site:** https://larosentry-test.onrender.com ([login](https://larosentry-test.onrender.com/login)). Private accounts: ignored `.local/render-demo-accounts.md`. Seven live browser tests passed. The free service may take about a minute to wake; the free database expires on 2026-11-16 (Asia/Shanghai). Automatic Git deploys are disabled; use Manual Deploy on the existing service for later reviewed changes.

Render is the selected test host, using free services only and a separate fictional-data database. The existing stack is retained. Real email/SMS delivery remains unconfigured; privileged test accounts require actual MFA. See [pilot setup and limitations](docs/render-pilot.md) and [current deployment results](docs/progress.md). This does not approve a commercial production launch.

### Registration and verification (2026-10-17)

Signup now collects email/mobile with separate policy acceptance. `/onboarding` supports email-first or SMS-first verification, optional player preferences and host intent; `/onboarding/facility` saves private evidence drafts for assigned admin review. Owner staff invitations require verified contacts before acceptance. Existing workspaces remain. The local demo enables a clearly labelled SMS simulator and Mailpit captures email; real delivery is not configured/tested. [Setup, privacy/retention, migrations, changed files and limitations](docs/onboarding-verification.md).

### Role workspaces (2026-10-16)

Open `/app` for player bookings, `/owner` for assigned facility ownership, `/staff` for assigned staff duties, or `/admin` for explicitly authorized administration. The workspace selector uses actual memberships; privileged access retains MFA. Added facility editing/staff management, permission-based staff navigation, and platform facility/booking/payment oversight. Existing demo accounts work with `.\pnpm.cmd demo:start`. [Setup, changes, access matrix and limits](docs/role-workspaces.md).

### NOLTA scheduling module (2026-10-16)

Open [NOLTA user mode](http://127.0.0.1:5176/scheduler) or [court management](http://127.0.0.1:5176/scheduler/admin/schedule) after running `.\pnpm.cmd demo:start`. Existing demo accounts/passwords still work. This module adds court editing, court-specific hours and custom durations, shared availability calendars, manual reservations, date exceptions, activity filters and same-facility rescheduling. The launcher applies the additive migration before starting. [Requirements, setup, changed files and boundaries](docs/nolta-scheduler.md) include the deliberately restricted **archive-based** demo reset.

### Calendar and local demo access (2026-10-15)

Run `.\pnpm.cmd demo:start`, then open http://127.0.0.1:5176/manage. Sign in with your existing demo account. On **Protect your workspace**, enter the same password under **Demo account password**, then choose **Open demo workspace**. Admins can select **Court calendar & controls**; hosts select **Schedule**. This local preview lasts up to 30 minutes; it is not MFA verification. Ordinary accounts still require authenticator MFA.

The calendar has month/week/day date navigation, court selection, live one-hour availability, closure creation/reopening and links to booking decisions. The named demo admin has an explicit membership in the shared demo facility. Startup adds one fictional confirmed and one pending reservation once, without replacing existing decisions or passwords. Full platform administration is still exclusive to ADMIN. See [demo and calendar details](docs/nolta-integration.md).

The header now opens the authorized **Admin workspace**, **Owner workspace** or **Staff workspace**. The legacy `/manage` shortcuts remain available to ADMIN and FACILITY_OWNER with MFA; players and staff cannot enter that hub. Hosts get Schedule / Courts / Activity shortcuts and owner-scoped court summaries. Platform administration remains ADMIN-only. See [the NOLTA adaptation](docs/nolta-integration.md) for earlier integration details.

LaroSentry helps players request court time and facilities manage approvals and attendance. This local build is not approved for public launch. Read [publication review and demo setup](docs/publication-review.md) for draft policies, required business decisions and role checklists. Internal historical requirements remain in docs/requirements.md.

## Run in this workspace (Windows PowerShell)

Portable Node 24.21.0, pnpm 10.32.1, PostgreSQL 17.11 and Mailpit 1.31.5 are installed under the ignored `.tools` directory. The `pnpm.cmd` wrapper makes them available without changing system PATH or PowerShell execution policy.

```powershell
cd C:\larosentry-test
.\pnpm.cmd install --frozen-lockfile
.\pnpm.cmd setup:check
.\pnpm.cmd services:up
.\pnpm.cmd db:generate
.\pnpm.cmd db:migrate
.\pnpm.cmd dev
```

Use **http://127.0.0.1:5173**, consistently (not `localhost`, because mutation origin checks are exact). API: http://127.0.0.1:4000/api. OpenAPI: http://127.0.0.1:4000/api/docs. Local email inbox: http://127.0.0.1:8025. These services bind only to loopback. Stop web/API with Ctrl+C, then `.\pnpm.cmd services:down` for PostgreSQL/Mailpit. Data survives restart. Demo seeding requires a separate recognized demo database; use `demo:setup` once and `demo:start` (port 5176). `demo:start` starts local dependencies automatically, waits for database/API/web readiness, and safely reuses an already healthy demo instead of failing on a duplicate port. Keep the original serving terminal open. Do not rerun setup just to restart.

If Node and pnpm are already installed with the pinned versions, the same root commands work as `pnpm ...` on other platforms. Native tool bootstrap and the current isolated database test runner target this Windows workspace; see [database setup](docs/database.md) for alternatives.

## Try the booking flow

1. Browse facilities without signing in. Select a court, date and time; review the server-calculated price.
2. Register with a unique email, a password of at least 12 characters, nickname, adult declaration and terms acceptance. Open the verification message in Mailpit and verify before logging in. Selection resumes after authentication and requires a fresh price/availability review.
3. Submit a booking request. It is PENDING, not a reserved slot.
4. For a role demonstration use `demo:setup` and `demo:start`, which create the player, owner, staff and admin only in a dedicated database. Enroll MFA for privileged roles.
5. Request a booking for that assigned facility using the player account. Approve using the owner account (use a second browser profile). Record an external full payment if appropriate. Generate a QR in the player's booking detail. Manual check-in is restricted to the assigned facility and 30 minutes before start through end.
6. In a confirmed booking, use **Manage your game** to publish a public game or switch to private mode and invite a known player's verified email. Use a separate player account to request a place or accept the invitation. The organizer, offline guests and approved players all count toward capacity. Resolve active participation before changing modes.

See [the isolated demo instructions](docs/publication-review.md#local-role-demonstration) for account emails and local password setup. The legacy `demo:account` helper now refuses the regular database.

## Checks

```powershell
.\pnpm.cmd lint
.\pnpm.cmd typecheck
.\pnpm.cmd test
.\pnpm.cmd test:integration
.\pnpm.cmd exec playwright install chromium
.\pnpm.cmd test:e2e
.\pnpm.cmd test:admin:e2e
.\pnpm.cmd build
.\pnpm.cmd audit --prod
```

Integration tests create a NEW timestamped PostgreSQL test database and migrate it from empty; they never reset the demo database. Test databases are retained for inspection. Browser tests require the running website, API and Mailpit. For the booking browser test on a running isolated demo, set `BROWSER_BASE_URL=http://127.0.0.1:5176` and `DEMO_E2E=1`; it creates its own owner fixture so testing does not enroll MFA on your shared demo owner. It creates uniquely named player accounts and cancelled demo bookings. Browser artifacts and MFA fixtures remain ignored local files; they can contain private test data and must not be published.

## Layout

- `apps/web`: React, Vite, React Router, TanStack Query, accessible forms, maps and QR display.
- `apps/api`: NestJS REST controllers, Prisma, PostgreSQL transactions, sessions, MFA and mail worker.
- `packages/contracts`: browser/API validation contracts and display helpers. The API validates requests independently.
- `packages/config`: shared strict TypeScript settings.
- `scripts`: local services and verification tooling.
- `docs`: architecture, permissions, business rules, test evidence and remaining work.

Never commit `.env`, `.local`, `.tools`, passwords, session cookies or database backups. The browser receives no database credentials. GitHub publication and live client testing were requested on 2026-10-17; no public deployment has been performed. See [deployment status and required connections](docs/deployment.md).

## Authorize your four-person admin team locally

No school email domain grants ADMIN and no team account is guessed or pre-authorized. Each intended teammate must register normally and verify their email using the local Mailpit inbox. An authorized workspace operator then grants access to each exact, agreed account:

```powershell
.\pnpm.cmd admin:access grant teammate@example.test "Team-approved admin access for this named member" --confirm
```

Replace the example email with that teammate's verified account; repeat only for your explicitly approved team members. This local-only command requires a reason and confirmation, creates no password, records a local-operator audit event and revokes old sessions. Protect access to the workspace/database credentials, since the local operator is trusted. Do not use shared admin accounts.

Sign in again at **http://127.0.0.1:5173/admin**. Complete MFA at the dedicated setup page, privately save the one-use recovery codes, and choose **Open workspace**. Until MFA is verified, the API denies admin access. Enroll at least two independently controlled admin accounts to avoid a single-person recovery dependency.

To remove a grant, the operator can run:

```powershell
.\pnpm.cmd admin:access revoke teammate@example.test "Team-approved removal of this member's admin access" --confirm
```

Revocation returns the platform role to PLAYER and ends sessions; existing facility memberships are preserved. It refuses to remove access unless another verified, unrestricted admin has enrolled MFA. The web UI cannot restrict its own admin account. There is no public registration, role-change or domain-based shortcut to ADMIN.

The seven database-backed admin pages cover overview, applications, users/restrictions, reports, security alerts, audit and health. Lists have 20 rows per page. Decisions require a reason and explicit confirmation; alerts never cause automatic punishment. Exports and files are disabled. Read [admin handoff and checklist](docs/admin-handoff.md), [access rules](docs/access-control-matrix.md) and [security limits](docs/security-controls.md).

Applicants submit under `/app/applications`; pending facilities stay private until approval. Users submit and track concerns under `/app/reports`. `/security`, linked from the footer and admin area, explains acceptable use and fair reporting. No personal contact details are published; the contact channel for users unable to sign in is pending setup.

`pnpm test:admin:e2e` creates a separate test database and temporary localhost servers on ports 5175/4010, generates isolated test identities, exercises real MFA and admin workflows, then stops its servers. It requires local PostgreSQL and installed Playwright Chromium. It never grants ADMIN in the regular demo database. It retains the test database and ignored fixtures for inspection. Run browser suites sequentially because they share Playwright output directories.

## Responsive interface

Mobile navigation, role workspaces and compact court time slots are documented in [responsive verification](docs/responsive.md). Run `.\pnpm.cmd test:responsive:e2e` from the repository root for the isolated width/role audit. Current deployment evidence and free-service limits are in [Render pilot](docs/render-pilot.md).
