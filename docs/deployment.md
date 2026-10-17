# Deployment status

## Live free Render pilot — 2026-10-17

**https://larosentry-test.onrender.com** is live on application commit `72d5677d28c7a5123e06cbcace2ff4cf4942f98b`, deployment `dep-db9iht6q1p3s738cnhb0`. HTTPS health returned 200/database connected and seven live browser tests passed. Both services use explicit `free` plans, with external database access disabled. No paid resources were enabled. Private accounts: ignored `.local/render-demo-accounts.md`. Real email/SMS delivery is unavailable; privileged accounts require MFA enrollment. [Setup, limits, expiration and repeat commands](render-pilot.md). This status supersedes the historical preparation statements below; commercial production remains gated.

## Current Render pilot preparation — 2026-10-17

The owner has now chosen **Render, free resources only**, created an account and authorized the official CLI. This supersedes the Vercel direction below. One free Singapore PostgreSQL database has been created and the eight migrations applied with a separate runtime role. A narrowly scoped Render-only public test startup boundary, same-origin static frontend serving, explicit unavailable email/SMS states and operator-only synthetic fixtures have been implemented and locally checked. General commercial production remains gated. Remote web deployment and live checks are in progress; see [free pilot configuration and limitations](render-pilot.md) and [progress](progress.md) for the eventual verified address. Historical deployment statements below describe earlier states.

## Selected hosting direction — 2026-10-17

The owner selected **Vercel for testing, then Hostinger for production**. This supersedes the earlier Render suggestion. No Vercel project has been connected or deployed, and no live application URL exists yet.

Keep React/Vite, NestJS, Prisma and PostgreSQL. Vercel supports NestJS functions, so a framework replacement is unnecessary. The current application is not yet packaged or verified for that runtime: it starts a persistent loopback listener, uses in-process email/maintenance timers and memory-based general rate limits, and deliberately refuses production startup. A Vercel adaptation must preserve same-origin `/api` session/CSRF behavior, replace persistent timers with authenticated scheduled/queued work, verify distributed throttling and pool connections to a separately hosted PostgreSQL database. Merely importing the Vite frontend will not make login, bookings or admin workflows work online. No production guard has been removed as part of recording this decision.

Next account step: sign into Vercel using GitHub and authorize `egunalucasandrei-droid/LaroSentry`. Configure a separate test PostgreSQL database, server-only secrets and real verification delivery services; do not upload `.env` or expose local Mailpit/SMS simulation. A Vercel account/project connection is still required before remote configuration or deployment can be performed here.

For the later move, keep provider configuration separate from business logic and preserve the database schema and encryption key through a verified migration. A Hostinger VPS can run the existing long-lived Node service, PostgreSQL and scheduled worker; choose the eventual plan after confirming its Node/PostgreSQL support. Hostinger migration is not implemented or tested yet.

Official references checked: [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs), [NestJS serverless scheduling guidance](https://vercel.com/kb/guide/ship-a-nestjs-app-on-vercel), [function connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions), [Hostinger PostgreSQL hosting](https://www.hostinger.com/applications/postgresql).

## Client pilot publication request — 2026-10-17

The project owner has requested GitHub publication and live client testing. Source commit `07cee540094580eae6327376e0a381e3ce5c0baf` was pushed successfully to [egunalucasandrei-droid/LaroSentry](https://github.com/egunalucasandrei-droid/LaroSentry), branch `main`, on 2026-10-17 using the repository supplied by the owner and the existing Git authentication. The remote commit was verified with `git ls-remote`. No live deployment has occurred. No hosting destination or authenticated hosting CLI is configured; a hosting account/project is still required. The available Sites publisher accepts static assets/Worker entrypoints and cannot directly run this existing NestJS/Prisma/PostgreSQL application without an architectural migration, which is outside the requested scope.

The existing source passed local verification documented in [progress](progress.md). A limited pre-publication scan of the 129 existing source files found no copies of current local environment credentials or common private-key/token signatures. `.env`, `.env.migrations`, `.local`, `.tools`, generated clients, build output and browser artifacts are ignored. This check is not an exhaustive secret audit. Keep the repository private for the initial handoff and never upload the local database, passwords or real verification documents.

GitHub stores source; this application also needs a Node API, private PostgreSQL and a frontend served with same-origin `/api` routing. GitHub Pages alone cannot run its backend. Use a separate pilot database and key, named test users and actual MFA. The local demo launcher, Mailpit inbox and simulated SMS are not public services.

Before live client testing, resolve and verify the production startup gate described below, select the hosting/proxy topology, configure HTTPS and secure cookies, provide authenticated email and the SMS gateway, apply migrations with the separate migration identity, and exercise signup/verification, scoped access and booking through the actual public origin. Private document backup retention and a monitored reporting channel also need an operator. Do not bypass the gate by publishing with `NODE_ENV=development`. No deployment command or live URL is claimed until the destination and those services have been configured and checked.

No deployment has been performed. This build deliberately refuses NODE_ENV=production even when HTTPS is configured, because the requested hardening and acceptance scope are incomplete. Do not remove that gate merely to make a public demo work.

The intended deployment is Ubuntu with one Node process behind Nginx, `/api` forwarded to a loopback API, static Vite assets, HTTPS, private PostgreSQL, protected file storage and tested backups. PostgreSQL and Mailpit must never be publicly exposed. The current `.tools` directory is Windows development tooling, not a deployable artifact.

Before enabling production: complete remaining workflow/authorization tests; configure explicit CSP for the static website (API Helmet alone does not protect an independently hosted frontend); validate TLS cookie/proxy behavior; remove local bootstrap access; use separate migration/runtime identities; provision authenticated email; document retention, deletion, incident handling and key recovery; implement safe file storage before accepting uploads; resolve known dependency findings; measure performance and restore behavior; and review the threat model with the project team.

`pnpm build` verifies compilation and frontend bundling. It does not constitute deployment acceptance. The API's emitted start path and root environment loading were exercised on a separate local port with a successful database health response. Linux packaging, TLS/proxy behavior and process supervision still need verification on the deployment host.

## Publication preparation update ? 2026-10-14

See [publication review](publication-review.md) for launch blockers and isolated demo setup. Demo seed/bootstrap commands now require recognized loopback demo/test databases; production remains gated. Migration 202610140006_policy_acceptance adds nullable privacyVersion and policyAcceptedAt fields without relabeling legacy acceptance. Registration validates and records the current shared policy bundle. New local demos create four fictional roles in a new database; no existing database is reset. Complete policy approval, retention/erasure, public support and deployment review before launch.
