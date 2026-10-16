# Deployment status

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
