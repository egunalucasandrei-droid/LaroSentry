# Registration, onboarding and facility verification — 2026-10-17

This extends the existing LaroSentry stack, authentication, workspaces and branding. It does not replace them. Production startup remains disabled by the existing deployment gate. Email/SMS/document workflows described below were tested locally, not certified for production.

## Signup and contact verification

`/register` requires email, Philippine mobile, nickname, password/confirmation, adult declaration, separate terms/privacy acceptance and current policy version `2026-10-16-onboarding-draft-2`. Existing acceptance versions are preserved. `09171234567` normalizes to `+639171234567`; foreign prefixes, wrong lengths and non-mobile formats are rejected. A keyed hash enforces phone uniqueness; the actual number is encrypted with the existing DATA_KEY. Private numbers are never returned by public facility or user-profile APIs.

Signup always creates PLAYER. Optional body role fields cannot create OWNER/STAFF/ADMIN. Duplicate email/phone registration returns the same generic queued-message response and does not send unsolicited verification mail to an existing account. Registration queues email automatically, but the user chooses which channel to verify first. Sign in after signup to open `/onboarding`.

Unverified users may sign in only to a restricted session for verification/onboarding. They cannot use booking, facility-management or admin APIs. After one channel, they can select PLAYER/HOST and skip/save optional preferences. New accounts need both channels for business operations. Host selection records intent only. Normal privileged access now requires mobile verification as well as the existing email/MFA/session checks.

Migration preserves old accounts without fabricating phone numbers or verification timestamps. Previously email-verified legacy players retain existing player functionality; adding/changing a phone enrolls the account into both-channel requirements. Existing real privileged accounts must add/verify mobile before using privileged APIs. The existing exact named local-demo preview remains available in its isolated loopback demo; it does not prove real phone ownership. Never move that database or simulated verification state into production.

Email reuses the encrypted outbox/Mailpit adapter, 256-bit random hashed tokens, 24-hour expiry and atomic single use. New tokens are bound to the email hash; changing email invalidates old tokens. Authenticated resends wait 60 seconds, cap at six verification tokens per day and invalidate older active verification links. Queued does not mean delivered. Email verification status and significant events are audited without tokens.

SMS uses `SmsAdapter`: unavailable by default, a loopback-only local simulator, or an explicitly configured HTTPS gateway. Codes are cryptographically generated six-digit values, HMAC-hashed with a challenge-specific context, expire after five minutes, allow five attempts and are consumed once. Requests serialize against account/phone/IP budgets: 60-second cooldown, ten per account/day, five per phone/hour and twenty per IP/hour. Failed delivery requests still consume sending budgets. Excessive code attempts and provider failures are audited. Codes are never logged. The local inbox holds only an encrypted short-lived code and exposes it only to that signed-in account; use/expiry clears it. It is explicitly a simulation, not SMS delivery.

Changing email/mobile requires the current password, CSRF and verified MFA when enrolled. Changed channels lose verification, outstanding challenges are invalidated, sessions are revoked, and an account-change notice is queued. The user signs in again to reverify. Contact details are private on `/onboarding` and Account Settings → Verification.

## Player preferences and recommendations

After first verification, select PLAYER. Every question is optional: sports including Others, up to ten broad preferred areas, playing periods, Indoor/Outdoor/Covered/no preference, optional hourly budget, goals, and recommendation opt-in. **Skip for now** works and preferences can be changed at `/app/settings/preferences`. Existing saved-facility functionality remains separate. No precise GPS or identity-document data is used.

`/app` shows Recommended for you; `/app/bookings` remains personal bookings. Rules rank published facilities using matching sport/area/amenity keywords and hourly budget, with short explanations. At most 200 published facilities are considered and 12 are returned. Availability is checked by the existing date/slot engine when booking, never invented by ranking. Preferences never constrain `/facilities` search. Existing users can opt out. There is no AI model or behavioral tracking engine.

## Facility applicant workflow

Both verified contacts are required before `/onboarding/facility` can create/save/upload/submit evidence. Up to three unfinished drafts are stored privately on the server; no identity image is saved in browser storage. Steps are facility information → identity/evidence → review/submit. Up to three new applications per account/day are allowed, preserving the previous submission budget. Clarification resubmission reuses the same application and facility IDs.

Facility fields reuse name/address/area/coordinates, description, initial court/sport/rate/capacity, hours, amenities and cancellation policy; add a facility mobile contact, optional facility email, relationship OWNER/MANAGER/REPRESENTATIVE, supported ID type and optional supporting-evidence explanation. Add further courts after facility approval through existing controls.

One supported government ID image and at least one facility photo are needed. Managers/representatives need supporting authorization evidence. Owners provide suitable facility/business evidence or an explanation for admin review; the system does not require every possible permit. Only metadata such as selected ID type is stored; the system does not OCR/extract ID numbers, birth dates or every document detail. Images say **Submitted for verification**, never automatically genuine/verified.

States: DRAFT → PENDING (submitted) → UNDER_REVIEW → CLARIFICATION (needs more information) → PENDING on resubmission → APPROVED/REJECTED. Approved applications may be SUSPENDED and suspended/rejected applications reopened for review. Suspension unpublishes the listing while preserving existing reservations and operator assignments for ongoing obligations. Reopening does not automatically republish. Progress shows contact checks, evidence submission and admin review independently. Old pre-document applications remain reviewable as legacy records; no identity verification is fabricated for them. New direct `/facility-applications` calls require an evidence draft and cannot bypass this workflow.

## Private document storage and retention

Only PNG/JPEG, up to 2 MB input, are accepted. Byte signatures plus actual decoder metadata are checked; multi-frame and malformed content are rejected. Sharp decodes with a 12-megapixel limit, rotates/limits dimensions and re-encodes a fresh metadata-stripped PNG (maximum 8 MB output). PDFs, SVGs, executables and arbitrary active documents are not supported. This is image sanitization, not a malware-scan certification. See [Sharp input limits](https://sharp.pixelplumbing.com/api-constructor/) and [output/metadata behavior](https://sharp.pixelplumbing.com/api-output/).

Images are AES-GCM encrypted in private PostgreSQL records under random UUIDs. There is no public uploads/static folder, original filename, storage path or direct public object link. Drafts have at most six active images, one active identity image, and an account may upload at most 20 images/day. Submitted evidence is locked until clarification. Applicants can view their own metadata and remove editable draft content, but cannot retrieve images through the admin file endpoint. Players, staff, other owners and unassigned admins are denied.

Only the ADMIN/MFA reviewer who claimed that application may retrieve an unexpired document while reviewing it. Each request checks the application/document relationship and records an access audit. Responses use PNG, randomized download name, no-store and nosniff; the UI revokes temporary browser image URLs on close/unmount. Neither contents nor OTPs/tokens are audited.

Image expiry is 30 days from upload, shortened to at most seven days after approval/rejection. API access denies expired content immediately. The existing 30-second maintenance job clears expired encrypted content and consumed/expired local SMS captures. Minimal document/audit metadata remains. Inactive unsubmitted draft data/images are cleared after 30 days. Encrypted backups can still contain earlier ciphertext: operators must define/enforce backup expiry and protect DATA_KEY separately. Full account erasure, production KMS/object storage, restore-time retention enforcement and production operational/legal review remain deployment work. Do not upload real IDs into a shared development demo.

## Admin review and approval

The existing Admin → Facility applications view adds contact-verification/account status, ID type, relationship, facility contact/evidence details and secure image viewing. **Start review** assigns the reviewer; another admin cannot claim the same active review or retrieve its documents. Self-review/approval is denied. Request information, approve, reject, suspend and reopen require reasons/confirmation. New approvals require explicit identity and facility-authority review acknowledgements plus current contact/evidence checks. This remains manual review, not proof that an ID is authentic or a venue is safe.

Decisions retain actor, time, previous/new application state and reason. Approval publishes only that facility, creates its OWNER membership, promotes PLAYER/STAFF applicants appropriately, preserves other assignments, notifies the applicant and audits the change. Role promotions revoke sessions; owner access retains MFA. No global facility or ADMIN privilege is granted.

## Staff invitations and administrator provisioning

Owner → Staff retains authorized direct assignment (now requiring verified mobile for ordinary target accounts) and adds invitations to existing/new email addresses. Invitations carry only chosen facility permissions, expire in seven days, store only token hashes and can be revoked. Email URLs put the token in a fragment, removed from browser history on opening. At most six invitations/facility/hour are queued, with a one-minute same-address cooldown. An invitation is not access until accepted.

Recipients create/sign into a normal account, verify both contacts and accept at `/staff-invitations` using the invited email. Acceptance is single-use, rechecks inviter ownership, cannot overwrite OWNER/ADMIN membership, grants only the scoped permission set, completes onboarding and revokes sessions. Staff sign in again and complete MFA. Reopen the original email link after navigating away to sign in; the token is not kept in browser storage.

ADMIN still comes only from the explicit local provisioning command for an existing verified unrestricted account, now requiring mobile verification. Signup/purpose/invitation routes cannot create ADMIN. Existing last-admin safeguards remain.

## Environment and exact commands

```powershell
cd C:\larosentry-test
.\pnpm.cmd db:generate
.\pnpm.cmd db:migrate
.\pnpm.cmd demo:start
```

Keep the terminal open; wait for LOCAL FICTIONAL DEMO READY. Existing demo accounts/passwords/database are preserved. The recognized local demo launcher enables simulated SMS automatically. Open `/register`, `/onboarding`, `/onboarding/facility`, `/app/settings/preferences` or `/admin/applications` on `http://127.0.0.1:5176`. Mailpit captures local email at `http://127.0.0.1:8025`. For the ordinary development database run `.\pnpm.cmd dev`; set `SMS_PROVIDER=local` in its ignored `.env` only with a loopback APP_ORIGIN if you need simulated SMS.

| Variable/service                  | Purpose                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATA_KEY                          | Existing 64-hex encryption/HMAC key; protect separately from database/backups. Losing it prevents decrypting existing records.                                                                                                                                                                                             |
| SMTP_HOST / SMTP_PORT / MAIL_FROM | Existing SMTP relay adapter; local Mailpit defaults. A real mail relay, authentication/TLS/deployment review and actual delivery testing are still required for production.                                                                                                                                                |
| SMS_PROVIDER                      | `unavailable` (default), `local` (loopback non-production only), or `webhook`.                                                                                                                                                                                                                                             |
| SMS_WEBHOOK_URL / SMS_API_KEY     | Trusted HTTPS gateway and bearer credential for webhook mode. Gateway accepts JSON `{to,message}`; configure its provider-specific mapping, sender registration/consent/cost controls and test it with the selected Philippine provider. No gateway/provider credentials were configured or real SMS sent in verification. |
| VERIFICATION_ID_TYPES             | Optional comma-separated supported manual-review ID types; defaults to the documented Philippine examples. This is configuration, not a claim that each submission is valid.                                                                                                                                               |
| PostgreSQL / private backups      | Encrypted document records; restrict operator/DB access and enforce backup retention before storing real documents.                                                                                                                                                                                                        |

## Changed files and verification

- Schema/migration: `apps/api/prisma/schema.prisma`, `202610160008_onboarding/migration.sql` (additive).
- New API: `onboarding.controller.ts`, `sms.ts`, `facility-verification.controller.ts`, `staff-invitations.controller.ts`.
- API updates: `auth.controller.ts`, `http.ts`, `crypto.ts`, `main.ts`, `admin.controller.ts`, `admin-access.ts`, `admin-bootstrap.ts`, `submissions.controller.ts`, `workspaces.controller.ts`, `operations.controller.ts`, local test-only `bootstrap.ts`.
- Shared contracts: signup/phone/user metadata and policy version in `packages/contracts/src/index.ts`.
- New UI: `apps/web/src/onboarding.tsx`; updates to `auth.tsx`, `main.tsx`, `workspace.tsx`, `submissions.tsx`, `admin.tsx`, `management.tsx`, `role-workspaces.tsx`, `information.tsx`, `styles.css`.
- Dependencies/tooling: API `package.json`, `sharp`, `pnpm-lock.yaml`, root `package.json`, `.env.example`, `scripts/demo.mjs`, `scripts/test-database.mjs`, `playwright.config.ts`.
- Tests: new `apps/api/test/onboarding.test.ts`, `verification-fixture.ts`, `tests/browser/onboarding.spec.ts`; existing integration/admin/scheduler/workspaces fixtures/tests, booking/admin/information browser and contracts unit fixtures updated for contact requirements. Only guarded local test fixtures simulate verified contacts directly; ordinary registration uses actual challenge flows.
- Docs: README, progress, this file, API/access/security/threat documentation and Privacy Notice UI.

```powershell
.\pnpm.cmd test:integration
.\pnpm.cmd test:onboarding:e2e
.\pnpm.cmd test:admin:e2e
.\pnpm.cmd test:scheduler:e2e
.\pnpm.cmd test
.\pnpm.cmd typecheck
.\pnpm.cmd lint
.\pnpm.cmd build
```

These commands describe verification entry points; actual results and any corrected failures are recorded in [progress](progress.md). Browser suites that use live demo ports run separately to respect normal request limits. No production email/SMS delivery, government database/provider identity check, PDF support or legal/security certification is claimed.

Final local results: **55 API integration tests, 6 unit tests and 23 browser tests passed** across onboarding, admin/owner/staff, scheduler, demo login, booking/payments/community, discovery and footer suites. Lint, typecheck and production build passed. Mobile onboarding/recommendations were checked for overflow and serious/critical accessibility issues. Corrected failures and operational limits are recorded in [progress](progress.md).
