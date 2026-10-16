# Free Render test pilot

The owner selected Render and explicitly requires free services only. The previous Vercel plan is superseded. This is a fictional-data test pilot, not a commercial launch or security certification. Deployment status and the verified live address are recorded in progress after checking the remote service.

## Services and startup

- One Node web service, plan `free`, Singapore, one instance. React assets and `/api` are served by the existing NestJS/Express process under the same HTTPS origin. The service listens on Render's `PORT` and `0.0.0.0`. Trust is restricted to one reverse-proxy hop; cookies remain Secure/HttpOnly/SameSite and origin/CSRF checks remain active.
- One PostgreSQL 17 database, `larosentry_pilot`, plan `free`, Singapore, no replicas, high availability, autoscaling, paid workers or paid disks. Eight existing additive migrations are applied by the operator. Runtime `larosentry_app` is separate from `larosentry_migrate`; the migration credential is never installed in the web service. External database access is disabled after provisioning/checks.
- Pinned Node/pnpm versions and the existing TypeScript/React/Vite/NestJS/Prisma stack are retained. Build: `corepack enable && corepack prepare pnpm@10.32.1 --activate && pnpm install --frozen-lockfile --prod=false && pnpm db:generate && pnpm build`. Start: `pnpm --filter @larosentry/api start`.
- Render environment: `NODE_ENV=production`, `PUBLIC_PILOT=1`, `VITE_PUBLIC_PILOT=1`, `EMAIL_PROVIDER=unavailable`, `SMS_PROVIDER=unavailable`, `LOCAL_DEMO_QUICK_ACCESS=0`. `APP_ORIGIN` defaults to the exact provider-supplied `RENDER_EXTERNAL_URL`. Runtime database URL and random 64-hex `DATA_KEY` are in the private Render secret file `larosentry.env`, loaded from `/etc/secrets/larosentry.env`. Never commit this file or the key. No migration credential is in that file.
- General production startup remains blocked. The new deployment boundary permits only an explicitly enabled Render HTTPS pilot with the least-privilege runtime role and no local verification/MFA shortcuts. Local development behavior is preserved. Helmet protects HTML as well as API responses; SPA routes do not capture `/api` requests. Test pages send `noindex` headers.

## What testers can use

The operator-only `apps/api/src/pilot-fixtures.ts` provisions three labelled fictional facilities, six courts and four named synthetic player/owner/staff/admin accounts in this separate database. It requires explicit flags, the exact pilot database name and a private password file. It is not a web endpoint, never runs on server startup, never replaces existing passwords, and audits fixture creation. Test contact timestamps are synthetic fixtures, not proof of email/SMS delivery. All privileged accounts still require real authenticator MFA; no preview bypass is enabled online. Ownership/staff permissions apply only to the assigned test facility.

The private password handoff is `.local/render-demo-accounts.md`, ignored by Git. Share it only with authorized testers. Do not use real personal details, real government IDs or actual payments. Existing local demo credentials/data are unchanged.

## Known test limits

- Real email/SMS delivery is **unconfigured**, with no provider charges enabled. The outbox does not attempt SMTP and the onboarding UI/API report unavailable verification. Real new registrations cannot finish both-contact verification or use verified-account features. Use the privately provisioned fictional accounts for testing booking/role workflows. Recovery/invitation email delivery is likewise unavailable. Account recovery for the pilot requires the trusted operator.
- Free services sleep after 15 minutes idle and can take about a minute to wake. In-process expiry/alert/mail maintenance does not run while asleep; timestamps and request-time access checks remain in force. This is not continuous background processing. Memory rate limits reset on process restart and do not protect against distributed multi-instance abuse; the pilot uses one instance only.
- The free database expires after **30 days**, has 1 GB storage and no managed backups. Export test data before expiration if it is needed; no paid upgrade is authorized. Private evidence has active-database retention controls, but there is no production backup/KMS or legal/commercial approval. The free web service has ephemeral local storage; application records and encrypted documents stay in PostgreSQL.
- Render free web services block common SMTP ports. Enabling actual email requires a separately configured delivery adapter/provider and testing; do not set `EMAIL_PROVIDER=smtp` simply to bypass the deployment boundary. SMS requires a configured HTTPS gateway. No actual delivery or provider ID authenticity check is claimed.
- Do not add a payment method, upgrade service plans or enable paid resources for this task. Any subsequent migration to Hostinger needs separate deployment and restore testing.

Official references: [Render free limits](https://render.com/docs/free), [web services](https://render.com/docs/web-services), [Render CLI](https://render.com/docs/cli). Host/service secret values and private test credentials must never be copied into public docs or logs.
