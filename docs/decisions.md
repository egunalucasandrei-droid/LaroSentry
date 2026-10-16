# Implementation decisions

## Runtime and dependency selection

The empty Windows workspace had Git only. Official Node release metadata identified Node 24.21.0 LTS; the portable download was verified against its official SHA-256 manifest. Pin Node 24.21.0 and pnpm 10.32.1. Use React 19.3, Vite 8.3, NestJS 12.1, Prisma 7.10, TypeScript 6.0 and PostgreSQL 17.11. Exact package versions and transitive resolutions are in package.json and pnpm-lock.yaml. Do not replace Prisma with the registry's 8.0 release candidate. Dependencies were selected and compiled together, not indiscriminately upgraded to latest.

Official references consulted: [Node releases](https://nodejs.org/en/about/previous-releases), [Vite requirements](https://vite.dev/guide/), [Nest migration guide](https://docs.nestjs.com/migration-guide), [Prisma 7 migration](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [PostgreSQL Windows distribution](https://www.postgresql.org/download/windows/), [Mailpit installation](https://mailpit.axllent.org/docs/install/).

The initial audit identified advisories in Nodemailer, ip-address and Prisma CLI transitive deepmerge-ts/mysql2. Nodemailer is now 10.1.0 with bundled types; targeted overrides pin ip-address 10.7.1, mysql2 3.23.1 and deepmerge-ts 8.0.2. [Nodemailer 10 documentation](https://nodemailer.com/) confirms Node >=20 and removal of @types/nodemailer. Re-run generation, migrations, compilation, mail delivery and audits after dependency changes. No advisory list establishes absence of vulnerabilities.

## Local infrastructure

No Docker is installed. The application uses real native PostgreSQL with SCRAM passwords, loopback listening, a migration owner and a separate runtime role. No SQLite fallback. Portable tools avoid administrator installation and changes to machine-wide execution policy. PostgreSQL's EDB binary archive was downloaded over HTTPS from the vendor; unlike Node, no independent vendor checksum was verified for that archive.

## Scope gates

Implement complete vertical workflows first. The website offers BOOKING_ONLY, PUBLIC and PRIVATE. Public games need explicit publication after confirmation; private invitations are recipient-bound. Mode changes are rejected while participants or active invitations remain, preventing accidental disclosure. No fake ratings, testimonials or business verification. No file-upload endpoint is exposed before safe storage and validation exist. Production startup deliberately fails while deployment hardening remains incomplete.

## Time, money and concurrency

UTC timestamptz storage, Asia/Manila display, integer centavos. Court slots are half-open intervals. A PostgreSQL GiST exclusion constraint prevents overlaps for both confirmed bookings and closures. Pending requests are not allocations. An advisory transaction lock serializes identical booking idempotency keys. Row locks protect booking state changes. Exact interval adjacency is valid.

## Email and payment

Outbox records are created in the same database transaction as business changes. Verification/reset message bodies are encrypted with AES-256-GCM, cleared after delivery, and never logged. The single-process worker retries delivery with backoff and stable message IDs. SMTP is at-least-once; rare crash-window duplicate deliveries remain possible. Payment records only represent a staff-recorded external full payment; no gateway, deposits, fund movement or refund execution is implemented.

## Administrator access and ethical review

Keep the existing ADMIN role and security controls. Public registration never grants it; local grant/revoke requires an existing verified account, exact email, reason and explicit confirmation. Do not use school-domain allowlisting. Admin UI redirects to a dedicated MFA page so recovery codes remain visible at first enrollment. Test admin identities belong only to isolated test databases.

Use a shared database advisory lock for admin mutations and local role changes, with a fresh actor/session check inside each transaction. This prioritizes correctness and reviewability over administrative write throughput. Restricting access is reversible; self-restriction and last-admin loss are prevented. Use immutable AdminDecision records plus minimal audit events instead of modifying history.

Application approval grants scoped facility ownership and publishes; it is not a safety certification. Reports and alerts require human review, with no automatic punishment. Disable exports and files until their access/minimization rules are implemented. Expose real health observations, bounded-rule limitations and a security/acceptable-use page rather than invented scores.
