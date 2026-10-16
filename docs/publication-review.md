# Public website and launch review — 2026-10-14

This is a client-review document. The website is not approved for public launch. Internal historical requirements and development notes remain in the repository but are not served as public pages.

## Delivered

- Public academic/group/member branding removed from the shell, footer, authentication copy, map copy, information pages and fictional facility descriptions. LaroSentry is retained. No company identity, testimonials, certification or verification claims were invented.
- Five footer destinations have substantial product-specific content, shared navigation, section links, page titles and responsive layout. `/list-your-facility` was also updated.
- Help and security link to the working authenticated `/app/reports` workflow; reports are reviewed in `/admin/reports`. Success means an in-app record was saved, not that an email was delivered. Unauthenticated support, public contact information and response targets are explicitly pending setup.
- Privacy and terms are publication drafts, bundle `2026-10-14-draft-1`. `POLICY_EFFECTIVE_DATE` in `apps/web/src/information.tsx` is null pending approval. Do not set it merely to remove the draft banner.
- Registration must submit the exact current bundle version. It records `termsVersion`, `privacyVersion` and `policyAcceptedAt`; existing legacy records are not rewritten. The migration adds nullable fields, preserving historical uncertainty. Admin/demo fixture creation is not represented as real user acceptance. Approval requires a new version and a plan for existing users; automated renewed acceptance is not implemented.
- Separate local demo creation and launch commands provide four fictional role accounts, local mail capture and 20 labeled fictional facilities. Existing databases are not reset or dropped. New demo creation is repeatable and switches the local marker only after successful seeding.

## Philippine sources checked for review

Reviewed official sources on 2026-10-14. This is a focused draft review, not an exhaustive legal opinion or compliance certification.

- [National Privacy Commission: Republic Act 10173](https://privacy.gov.ph/data-privacy-act-/), particularly sections 11, 12, 16, 20 and 21: review transparency, purpose/proportionality, lawful processing, rights, security and accountability. Select a documented basis for each processing purpose; a general terms checkbox is not blanket consent to every use.
- [NPC: Data Privacy Act implementing rules](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/): review notice content, retention, organizational safeguards and processor responsibilities. Decide retention and erasure procedures for records and backups; do not invent a universal period.
- [NPC: Data subject rights](https://privacy.gov.ph/data-subject-rights/): review accessible channels and handling of rights requests and complaints. The current signed-in report workflow does not solve contact for locked-out users.
- [DTI: Internet Transactions Act of 2023](https://ecommerce.dti.gov.ph/internet-transactions-act-of-2023/) and [DTI: implementing rules](https://ecommerce.dti.gov.ph/implementing-rules-and-regulations/): have Philippine counsel assess the platform's actual classification, merchant information, disclosures, consumer redress and allocation of responsibilities before commercial launch. The official IRR index was available in search, but opening that index returned a tool error; do not treat this as a completed clause-by-clause IRR assessment.

## Decisions required before approval

| Owner decision      | What must be supplied or implemented                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legal operator      | Legal/business name, appropriate business contact/address, authority to operate, platform/facility contractual roles and applicable registrations.                                                 |
| Support and privacy | Monitored public contact and privacy channel, access for users unable to sign in, responsible reviewers, hours, escalation and realistic response targets.                                         |
| Data handling       | Purpose and legal basis inventory, retention by record type, erasure/correction/export procedures, backup expiry, documented exceptions and identity checks.                                       |
| Providers           | Production hosting/email/map providers, locations, processor agreements, transfer assessment and revised disclosures.                                                                              |
| Commercial rules    | Facility identity checks and responsibilities, taxes/receipts, deposits/fees, cancellations, refunds, disputes and applicable consumer remedies. The application currently has no payment gateway. |
| Approved policies   | Philippine legal review, final text, effective date, new policy version, notification and renewed-acceptance plan.                                                                                 |
| Operations          | Production security/deployment checklist, monitoring, incident response, secrets/ACLs, TLS, authenticated mail, backup restore and service recovery. See `deployment.md`.                          |

No retention or erasure automation, anonymous support service, full facility editor, self-service staff invitations or review/rating feature was added. Production startup remains gated. Demo accounts must never become universal production credentials.

## Local role demonstration

Run from `C:\larosentry-test`:

```powershell
.\pnpm.cmd services:up
.\pnpm.cmd db:generate
.\pnpm.cmd demo:setup
.\pnpm.cmd demo:start
```

Open **http://127.0.0.1:5176/login**. For later restarts, use only `demo:start`: it starts dependencies, checks readiness, and reuses an already healthy demo. Keep the serving terminal open. Duplicate starts do not kill or replace an existing server. The demo API uses port 4011. Use separate browser profiles for roles: cookies on `127.0.0.1` are shared across ports, so avoid mixing the regular site and demo in one profile. Mailpit at http://127.0.0.1:8025 captures local mail and must remain private.

`demo:setup` creates a new `larosentry_demo_<13-digit timestamp>` database every time. It does not destroy or reset the previous database. Stop `demo:start` before preparing another demo. `.local/demo-database.json` selects the latest completed demo. The regular `.env` is unchanged. Both the setup and seed entry points refuse production/remote or unrecognized targets; `db:seed` against the regular `larosentry` database now intentionally fails.

Passwords are generated separately for each role and saved only in ignored `.local/demo-passwords.json`. To set your own passwords, run `& .\scripts\demo-passwords.ps1` before `demo:setup` if your existing execution policy permits scripts. It prompts without echoing input. Otherwise, edit that ignored JSON privately in VS Code; each value must contain 12–128 characters. Do not weaken execution policy. Never place passwords on a command line or public page. The default password file is restricted to the current Windows account using an explicit NTFS ACL; keep the rest of `.local` private as well. A custom `DEMO_PASSWORD_FILE` path is supported for setup; protect its permissions yourself and keep it outside source control.

| Role   | Fictional email                    | Test checklist                                                                                                                                                                                                                                          |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player | `player@demo.example.test`         | Log in; browse a labeled demo facility; review price/policy; request court time; verify PENDING; observe CONFIRMED after owner approval; issue QR; cancel a separate booking; submit and track a concern.                                               |
| Owner  | `facility_owner@demo.example.test` | Enroll MFA and privately save recovery codes; open `/owner`; inspect assigned Caloocan Community Courts; approve the player's request; review history; record only fictional external payment; exercise a closure.                                      |
| Staff  | `facility_staff@demo.example.test` | Enroll MFA; open `/staff`; verify access to the same assigned facility; check in the player's confirmed booking within the permitted arrival window; confirm duplicate/foreign-facility check-in is denied. Do not weaken time checks to force a demo.  |
| Admin  | `admin@demo.example.test`          | Enroll MFA; open `/admin`; inspect overview/health; clarify then approve or reject a test application; review a report with reason/confirmation; acknowledge an alert when present; inspect audit history; verify other roles cannot access admin URLs. |

The four fixtures start email-verified solely in the dedicated demo. Real registration still verifies email. Owner/staff permissions cover bookings, payments and attendance for the assigned facility. MFA is not bypassed or pre-shared. No admin is added to the regular database. Automated booking tests now create their own owner fixture, so they do not take over MFA enrollment on the shared demonstration owner.

## Changed files

- Public UI: `apps/web/src/information.tsx` (new), `main.tsx`, `public.tsx`, `submissions.tsx`, `auth.tsx`, `map.tsx`, `styles.css`, `apps/web/index.html`.
- Policy contract/storage: `packages/contracts/src/index.ts`, `apps/api/src/auth.controller.ts`, `apps/api/prisma/schema.prisma`, migration `202610140006_policy_acceptance/migration.sql`.
- Demo isolation: `apps/api/src/demo-guard.ts`, `demo-seed.ts` (new), `seed.ts`, `bootstrap.ts`, `scripts/demo.mjs`, `scripts/demo-passwords.ps1` (new), root `package.json`.
- Verification: `tests/browser/information.spec.ts` (new), `booking.spec.ts`, `apps/api/test/integration.test.ts`, `admin.test.ts`, `tests/unit/contracts.test.ts`.
- Documentation: README, this review, progress, testing, API, database, deployment and security-controls documentation. Existing historical requirements remain internal.
- Local data: the old academic phrase was replaced only in the 20 `demo=true` facility descriptions in the existing local database. No accounts, bookings or non-demo facility descriptions were removed.

## Verification evidence

See the dated entry in `progress.md` for actual commands and results. Do not interpret passing local tests as public deployment approval.
