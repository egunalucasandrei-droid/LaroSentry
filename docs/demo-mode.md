# Local development verification bypass

`DEMO_MODE=true` is an explicit local-only option for the four existing fictional `@demo.example.test` accounts. It is not enabled on Render and is unrelated to the online `@pilot.example.test` test accounts. Login and all authorization remain. [How the whole system connects](system-framework.md).

## Enable it

From the existing Windows workspace:

```powershell
cd C:\larosentry-test
.\pnpm.cmd services:up
$env:DEMO_MODE='true'
$env:LOCAL_DEMO_QUICK_ACCESS='0'
.\pnpm.cmd demo:start
```

Open **http://127.0.0.1:5176/login**. Use your existing local passwords in ignored `.local/demo-passwords.json` or the private `.local/local-demo-accounts.md` handoff. Do not use the Render password list. Keep the serving terminal open. Do not rerun `demo:setup`: it creates another database, rather than restarting this one. The launcher sets the exact local instance marker and uses your selected existing demo database. Ports remain loopback-only. A healthy server running the other mode is not silently reused: stop it with Ctrl+C and restart.

The flag defaults to false. You may instead add `DEMO_MODE=true` to the ignored local `.env`, but still start through `demo:start`; pointing ordinary `dev` at a regular database with the flag true refuses startup. An explicit terminal environment value takes precedence in the demo launcher. No mode flag, password or private credential table is embedded in the public website.

## Disable it

Stop the local serving terminal with Ctrl+C, then:

```powershell
$env:DEMO_MODE='false'
$env:LOCAL_DEMO_QUICK_ACCESS='0'
.\pnpm.cmd demo:start
```

Restarting is required because server configuration is read at startup. Existing sessions do not carry a stored bypass or an artificial MFA bit: the next request uses the restarted server's normal gates. Real fixture email/phone/MFA states determine what verification is needed. The local demo's older second-password preview remains available only with a separate explicit `LOCAL_DEMO_QUICK_ACCESS=1`; leave it zero when testing verification restoration. Prior fictional approvals or memberships are not undone by switching mode off.

## Account routing

| Exact local account                | Default workspace in Demo Mode        |
| ---------------------------------- | ------------------------------------- |
| `admin@demo.example.test`          | `/admin`                              |
| `facility_owner@demo.example.test` | `/owner` with actual OWNER assignment |
| `facility_staff@demo.example.test` | `/staff` with actual STAFF assignment |
| `player@demo.example.test`         | `/app`                                |

The workspace switcher remains membership-aware. A legitimate scoped application/invitation grant can change a player/staff fixture's role and available workspaces. Bypass does not grant that change. Ordinary registered users, even on the same local server, do not receive bypass. Test normal onboarding with those accounts or mode OFF.

## What is temporarily bypassed

- Email/mobile prerequisites for the named fixtures' authenticated business/onboarding actions.
- Repeated mandatory onboarding redirects for those fixtures.
- MFA prerequisites for existing privileged actions, with the real role and resource checks intact.
- Identity type, government-ID/facility-photo/authority-evidence prerequisites for a named fixture's local facility application. Valid facility/contact/court data, independent assigned ADMIN review and explicit approval are still required.
- Contact prerequisites when an authorized operator selects a named fixture as a booking customer/staff target.

The API reports `verificationBypassed` separately from actual email/mobile/MFA status. It never marks real contacts verified or enrolls MFA just because the flag is on. The UI shows a DEMO MODE indicator derived from API configuration, including before login. Evidence submission/approval is explicitly recorded as `DEMO_BYPASSED`; audits use `LOCAL_DEMO_VERIFICATION_BYPASSED`, `LOCAL_DEMO_APPLICATION_EVIDENCE_BYPASSED` and `LOCAL_DEMO_APPLICATION_REVIEW_BYPASSED`. Actual upload/authentication implementations remain available for testing.

## What is never bypassed

Passwords/Argon2, session cookies/expiry/revocation, suspended-account denial, CSRF/origin checks, validation and rate limits; ADMIN role checks, exact OWNER/STAFF memberships and permissions; own-booking/game/document access; independent reviewer assignment and no self-review; required reasons/confirmations and last-admin protection; approval before publication/ownership; court schedules/price review/idempotency/conflicts; payment amount/duplicate/self-verification rules; attendance windows and QR replay rules; image decoding/encryption/retention/access checks; audit privacy. Administrative restrictions are not simulated away.

## Production and environment safeguards

`validateDeployment` runs during configuration import, before the server is created. It rejects `DEMO_MODE=true` with `NODE_ENV=production`, Render/public-pilot configuration, a non-loopback application origin or DB host, a regular/test/nonrecognized DB name, or a missing/mismatched `LOCAL_DEMO_INSTANCE`. Only the dedicated `larosentry_demo_<13 digits>` environment is accepted. The launcher independently refuses production. There is no HTTP endpoint, query, header, client switch or universal password that enables it. Existing demo seed commands retain their local database guards. Public pilot fixtures are a separate explicitly provisioned dataset, not an automatic production seed.

The automated startup test launches a fresh production config-import process with `DEMO_MODE=true` and confirms a nonzero exit specifically for the demo-mode safety check. This tests startup refusal, rather than trusting a hidden menu. The unit checks also reject remote DB/origin, missing markers and a regular database.

## Verification commands

```powershell
.\pnpm.cmd test:demo-mode
.\pnpm.cmd test:integration
.\pnpm.cmd test
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd build
```

`test:demo-mode` creates a NEW isolated recognized local demo database with private random fixture passwords, runs seven direct-API cases with the mode ON, then starts another test process with it OFF. It never resets your selected demo database. These cases cover all four roles, anonymous/nonfixture/CSRF denials, missing staff permissions, foreign facilities, bookings, evidence/approval/audit and suspension/revocation. Private fixtures are ignored local files.

Against the existing selected local demo server:

```powershell
$env:BROWSER_BASE_URL='http://127.0.0.1:5176'
$env:LOCAL_DEMO_MODE_E2E='on'
.\pnpm.cmd exec playwright test tests/browser/demo-mode.spec.ts
# Restart the server with DEMO_MODE=false first, then:
$env:LOCAL_DEMO_MODE_E2E='off'
.\pnpm.cmd exec playwright test tests/browser/demo-mode.spec.ts
```

The four role browser cases in each mode use the existing local passwords and leave enrollment/passwords unchanged. An additional ON-only wizard case submits one clearly labelled synthetic PENDING application without images, leaves the player role unchanged and preserves it for admin inspection. ON checks redirects/pages, role/API separation and foreign-facility denial. OFF checks that the indicator/bypass disappear and privileged direct API requests are denied. The normal integration suite covers actual email/SMS/MFA and owner-evidence workflows. Final actual results are in [progress](progress.md); do not infer new full-site/production coverage from a diagram.

## Schema and limitations

No schema changes or migrations were required. `DEMO_BYPASSED` uses existing textual review-state fields; no real verification proof is fabricated. Local test application decisions still produce normal database history. The new mode is deliberately limited to the four exact fixture identities/allowed legitimate role transitions. It does not unlock arbitrary new signups, magically authorize another facility, or implement an unbuilt gateway/camera/review feature. Existing PostgreSQL adapter concurrency warnings remain. Render is unchanged and still requires real MFA for its privileged accounts.

## Changed files

- API configuration/policy: `apps/api/src/config.ts`, `deployment-policy.ts`, `demo-access.ts`, `http.ts`, `admin-access.ts`, `auth.controller.ts`, `main.ts`.
- Existing guarded workflows: `apps/api/src/onboarding.controller.ts`, `facility-verification.controller.ts`, `admin.controller.ts`, `workspaces.controller.ts`, `scheduler.controller.ts`.
- Shared user projection: `packages/contracts/src/index.ts`.
- UI: `apps/web/src/main.tsx`, `auth.tsx`, `workspace.tsx`, `management.tsx`, `scheduler.tsx`, `onboarding.tsx`.
- Local tooling/examples: `.env.example`, root `package.json`, `scripts/demo.mjs`, `scripts/test-database.mjs`.
- Tests: new `apps/api/test/demo-mode.test.ts`, new `tests/browser/demo-mode.spec.ts`, updated `tests/unit/deployment.test.ts`.
- Documentation: README, this file, new `system-framework.md`, access-control matrix, architecture, API contract, security controls, threat model and progress.
- Private handoff only: ignored `.local/local-demo-accounts.md`; no passwords were changed or added to source.

Final verification: **55 normal API tests, 14 demo-mode API tests (7 ON + 7 OFF), 11 unit tests and 9 browser tests (5 ON + 4 OFF) passed**. Lint, typecheck and build passed. The production config subprocess rejected ON before startup. The selected local demo was left running with ON and database connected; no schema migration or Render deployment was performed for this task.
