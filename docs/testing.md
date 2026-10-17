# Verification evidence

Updated 14 October 2026. Commands run from `C:\larosentry-test` through `.\pnpm.cmd`. Results describe the local pilot, not a production certification.

## Automated checks

- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test`: 3 unit tests passed, covering adult/terms validation and price/time boundaries.
- `pnpm test:integration`: 28 tests passed against a newly created PostgreSQL database, including all six migrations. Existing demo/test databases are retained, never reset.
- `pnpm test:e2e`: browser suite covers the complete booking workflow plus mobile/tablet/desktop discovery and comparison/offline behavior. The final expanded suite result is recorded in progress.md.
- `pnpm test:admin:e2e`: four isolated browser tests passed: one denial case for each non-admin role plus the complete admin/submission workflow. No ADMIN test account is granted in the regular demo database.
- `pnpm build`: API compilation and Vite production bundles passed. The largest initial JavaScript bundle is approximately 304 kB (96 kB gzip); maps, authentication, discovery and workspace code are split.

## Integration coverage

Actual registration/email verification, origin and CSRF enforcement, session revocation, password recovery, suspension, encrypted TOTP and replay protection; organizer ownership and facility/MFA permissions; scoped idempotency recovery; exactly one winner from concurrent overlapping confirmations; adjacent intervals; closure conflicts and reopening; state transitions; payment ownership and duplicate prevention; QR hashing/reissue/cancellation and concurrent one-use attendance; failed/successful rescheduling; stale-price rejection; immutable runtime audit/payment grants; real date/time discovery filters.

Community cases cover explicit publication, adult-account access, minimal responses, private roster denial, concurrent last-place approval, offline capacity, safe mode-change rejection, unpublishing, private recipient checks even with a valid forwarded token, invalid/expired/replayed/revoked invitations, concurrent invitation capacity, blocking in both interaction directions, leaving/unblocking and cancellation notification/revocation.

## Browser coverage and fixtures

The end-to-end test registers a unique player in the website, consumes the real Mailpit verification email, logs in, submits a booking, signs a separate owner in with MFA, approves the booking, records external payment, displays QR, requests/approves rescheduling, creates/reopens a closure, publishes a public game, requests/approves/leaves a place, changes to private mode, sends/accepts an invitation and cancels the booking. A participating account sees the cancellation.

Discovery is checked at 390x844, 820x1180 and 1440x1000. Checks include horizontal overflow, homepage serious/critical axe violations, quote/login draft restoration, comparison and offline errors. The community detail also receives a mobile overflow and axe check. These checks do not replace keyboard/screen-reader testing or cover every possible UI state.

Browser tests require running local services. Use the new isolated demo and set `DEMO_E2E=1` with `BROWSER_BASE_URL=http://127.0.0.1:5176` for the booking test; it creates a browser-owned owner fixture and keeps MFA enrollment separate from the shared demo owner. The old regular-database fixture remains supported for existing installations, but its bootstrap is now guarded. Its random password and test MFA secret stay in ignored `.local` files. TOTP replay protection is real: avoid repeatedly signing in with the same code within one 30-second step. Tests may leave fictional accounts/bookings if interrupted; no production data is involved. Traces/screenshots may contain private fixture data and stay ignored.

## Operational verification

- Compiled API start was exercised on a separate port and returned a successful database health response.
- `pnpm db:backup` and `pnpm db:restore:test` passed after the admin migration (five). The restored, newly created database contained 20 fictional facilities. Backup/key handling remains an operator responsibility.
- Full and production dependency audits returned zero known advisories after targeted dependency upgrades. This does not establish absence of vulnerabilities.
- `pnpm exec node scripts/measure.mjs`: 30 warm sequential loopback discovery requests previously measured p50 2.67 ms, p95 4.85 ms, maximum 7.26 ms. No production load, network-latency or Lighthouse score is claimed.

## Known limits

Prisma's PostgreSQL adapter emits a pg concurrent-query deprecation warning during relation queries; the tested operations pass, but this must be investigated before a pg major upgrade. Expected exclusion/deadlock conflicts may appear as sanitized 409 log events during concurrency tests. Reviews, staff onboarding and uploads are not implemented or tested. The suite does not constitute a penetration test, cross-browser certification or disaster-recovery exercise.

## Admin-specific verification

Eight additional integration tests cover the complete admin namespace, visitors and PLAYER/FACILITY_OWNER/FACILITY_STAFF with actual enrolled MFA, an ADMIN without verified MFA, direct list/detail/mutation/file/export requests, successful admin access, public registration role-injection rejection, exact-account local grant/revoke and last-admin protection, application clarification/approval/publication and ownership audit, own-record boundaries, report decisions/reopening/history, reason/confirmation/CSRF validation, restriction/session revocation/login denial/restoration, minimized user projections, rule-derived deduplicated alerts and evidence, acknowledgement/resolution, audit pagination/read-only grants and measured health. Concurrent cross-restriction leaves exactly one usable admin and records the denied mutation.

The isolated admin browser test verifies login/MFA before access; recovery-code visibility; all three non-admin UI/API denials; applicant submission and clarification; admin approval and public facility detail; rejection; report submission, safe text rendering and response; account restriction/restoration; real maintenance-worker alert generation, acknowledgement and resolution; audit search/event detail; health; security/acceptable-use page; and mobile overview overflow/serious-critical axe checks. It uses only local test services and fixture identities. Run separately with `pnpm test:admin:e2e`.

## Presentation refresh verification - 2026-10-17

Current-task runs (not historical totals):

| Check | Result |
| --- | --- |
| `typecheck`, `lint`, `build` | Passed after correcting a Date/string formatting mismatch caught by TypeScript |
| `test` | 11 unit tests passed |
| `test:integration` | 57 PostgreSQL integration tests passed (146.8s), including own-account overview, resource selector visibility and forged-target denial |
| `test:demo-mode` | 14 API cases passed: 7 ON and 7 OFF |
| `test:responsive:e2e` | 9 browser cases passed (1.6m): three presentation workflows plus six responsive/role/calendar cases; fixture preparation runs twice to verify idempotence |
| `test:admin:e2e` | 6 passed (56.4s): non-admin direct denials, real MFA, booking queue, review decisions, restrictions, alerts/audit/health, staff payments/check-in |
| `test:scheduler:e2e` | 2 passed (18.8s): real calendar booking/approval/reschedule/closures/cancellation |
| `test:onboarding:e2e` | 2 passed (30.0s): signup/contact/preferences and private evidence/clarification/approval |
| Discovery + information browser files | 6 passed (32.0s) against existing local demo; axe serious/critical checks included |
| Existing local four-account smoke | All four logins and distinct default workspaces passed; credentials and MFA state preserved |
| Production fixture refusal | `NODE_ENV=production demo:scenarios` rejected before mutation |

Total local browser cases in the suites above: **25**, plus four explicit existing-account login checks. The responsive run covers public/calendar widths 320/360/375/390/412/430/768/820/1024/1280/1440/1920 and role pages at 320/360/390/430/768/1440. ADMIN route coverage now includes booking requests. Screenshots inspected: mobile homepage, desktop player dashboard and admin overview; role/slot evidence retained privately under `.local/presentation-evidence`.

An initial browser run found ambiguous report labels and a same-page mobile-navigation test race. Added an explicit accessible select name, and waited for the first navigation to settle before testing the next click; meaningful assertions remain. The final run passed all nine. No physical mobile-device, external-provider, live gateway or camera-scanner verification is claimed. Existing pg concurrent-query deprecation warnings remain.

Reproduce from PowerShell:

```powershell
.\pnpm.cmd test
.\pnpm.cmd test:integration
.\pnpm.cmd test:demo-mode
.\pnpm.cmd test:responsive:e2e
.\pnpm.cmd test:admin:e2e
.\pnpm.cmd test:scheduler:e2e
.\pnpm.cmd test:onboarding:e2e
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd build
$env:BROWSER_BASE_URL='http://127.0.0.1:5176'
.\pnpm.cmd exec playwright test tests/browser/discovery.spec.ts tests/browser/information.spec.ts
```

Database/browser workflow runners use isolated local databases. Discovery/information require the local demo running. Do not run general mutation suites against Render. Opt-in `responsive-live.spec.ts` is read-only except login/logout and is the appropriate deployed-pilot smoke check.

Presentation deployment verification: application commit `7f676df`, Render deploy `dep-db9nuvijnfac73d0fh50`, status live; **5 read-only live tests passed (27.0s)**. Extended the PLAYER case to verify the new dashboard's four real count cards/own API and named report-resource selector without submitting anything. HTTPS/CSP, health/database, all role logins/security/MFA denial, calendar selection, responsive bounds and logout passed. No live data seeding, approval, MFA enrollment or migration occurred.

```powershell
$env:BROWSER_BASE_URL='https://larosentry-test.onrender.com'
$env:RENDER_RESPONSIVE_E2E='1'
.\pnpm.cmd exec playwright test tests/browser/responsive-live.spec.ts
```
