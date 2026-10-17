# LaroSentry client presentation guide

This is a fictional-data prototype, not a commercial launch. Show implemented workflows, describe limitations plainly, and never use real identity documents, payment credentials or client contact details.

## Prepare before the meeting

- [ ] Choose **local demo** for the complete repeatable walkthrough. Existing Render is a separate fictional test pilot with normal security; it is not a deployment target for local fixtures.
- [ ] Keep passwords in the ignored private account files, never slides, screenshots, source control or the public interface.
- [ ] Use separate browser profiles for Player, Owner, Staff and Admin. Logging into another role in the same profile replaces the active session.
- [ ] Check health and database connectivity. Confirm the selected facility is fictional and each operational account has its existing facility assignment.
- [ ] On Render, enroll each privileged tester's authenticator beforehand. There is no online password-only MFA bypass. Do not display setup keys/recovery codes in the presentation.
- [ ] Run the checks in `testing.md`; do a rehearsal at 390px and a desktop width.

## Start the existing local demo

PowerShell, repository root:

```powershell
.\pnpm.cmd services:up
$env:DEMO_MODE='true'
.\pnpm.cmd demo:scenarios
.\pnpm.cmd demo:start
```

`demo:scenarios` uses the existing recognized local database marker and four named fixture accounts; it refuses production/Render/public-pilot configurations. It is additive and transactional, once per Philippine date. Repeating it on the same date preserves the prepared records and subsequent decisions. A conflict rolls back this scenario batch rather than overwriting another reservation. It creates fictional snapshots, not records of actual customer transactions.

If no local demo has been set up yet, run `.\pnpm.cmd demo:setup` before `demo:scenarios`. For a fresh rehearsal, stop the current demo terminal with Ctrl+C, then run `demo:setup`, `demo:scenarios`, and `demo:start`. This selects a **new** local database, retains the old database/history and reuses the private fixture password file. It is the safe reset process; do not run DROP DATABASE, truncate tables or reuse the NOLTA-only reset to reset the whole platform.

Local login: http://127.0.0.1:5176/login. Mail capture: http://127.0.0.1:8025. Public demo data is not proof of a facility's existence or approval by a real organization. Local verification bypass is explicit and limited to named fixtures; roles, membership, restrictions, sessions, CSRF and booking rules still apply.

## Role map (no credentials)

| Role           | Start    | Demonstrate                                                                       |
| -------------- | -------- | --------------------------------------------------------------------------------- |
| Player         | `/app`   | Account dashboard, discovery, requests, status, QR, games, reports                |
| Facility Owner | `/owner` | Assigned facilities, pending requests, schedules, external payment records, staff |
| Facility Staff | `/staff` | Only assigned booking/payment/attendance permissions; no owner/admin powers       |
| Admin          | `/admin` | Review queue, applications, users, reports, alerts, audit and service health      |

The admin's `/admin/booking-requests` queue is limited to its existing owner assignments. Global booking investigation does not grant authority to confirm another owner's reservations.

## Suggested 15–20 minute walkthrough

### 1. Homepage and discovery — public, 2 minutes

- [ ] Open `/`; explain player booking and facility management using the three introduction cards.
- [ ] Search area/sport, compare facilities and open a venue.
- [ ] Point out original illustrations and fictional listing labels. Images are bundled SVG, not claimed venue photos or external stock dependencies.
- [ ] Explain prices, policies and availability checks. The listed court count is not a claim that all courts are free now.

### 2. Player dashboard and request — player, 3 minutes

- [ ] Open `/app`; counts, recent bookings, saved venues and notifications come from this account's database records.
- [ ] Open preferences and select a sport/area. Return to the explainable recommendations; all facilities remain browsable.
- [ ] Use the prepared `PRESENT-<date>-REQUEST` at the assigned facility, or submit a new request through facility details/scheduler.
- [ ] Show date, duration, compact slots, selected state, price and cancellation terms before submission.
- [ ] Explain **PENDING is not reserved**. Backend confirmation rechecks conflicts, price and policy.

### 3. Owner approval — owner, 2 minutes

- [ ] Use **Review booking requests** from the owner overview.
- [ ] Find the player's reference, review it and confirm it. Use a fictional rejection reason for a different request if demonstrating rejection.
- [ ] Return to the player's booking. The status/history reflects the actual decision.
- [ ] Show that the owner only sees assigned facilities; never grant extra access merely for presentation.

### 4. External payment and booking QR — player/owner/staff, 2 minutes

- [ ] Open `PRESENT-<date>-PAID-BOOKING` to show the seeded fictional cash record.
- [ ] For a newly confirmed unpaid request, authorized owner/payment staff record a fictional receipt/reference using the existing payment form.
- [ ] Show the payment method, amount, actor/time and history where available. Booking status and payment status are separate.
- [ ] Generate the player's check-in QR. It is a private, short-lived credential; do not publish it.
- [ ] Explain that no card is charged, money transferred, online receipt submitted by a player or refund issued automatically. A player-side payment-reference upload and live gateway are not implemented.

### 5. Daily operations and check-in — staff, 2 minutes

- [ ] Open `/staff` and use the permission-filtered schedule/check-in shortcuts.
- [ ] If `demo:scenarios` returned `checkInReady: true`, use `PRESENT-<date>-CHECK-IN` immediately, within its next half-hour session and existing check-in window (30 minutes before start through booking end).
- [ ] Staff may use the booking reference, or validate the supplied player QR token. Built-in camera scanning is not implemented.
- [ ] Show attendance. A repeated check-in is rejected; checking in does not prematurely complete a reservation.

The check-in scenario is skipped if the next half-hour is outside operating rules or already allocated. Do not change the system clock, payment data or booking rules to force it. Explain the legitimate window denial, or rehearse during opening hours. The isolated staff browser tests cover successful check-in regardless of presentation time.

### 6. Facility application review — player/admin, 3 minutes

- [ ] Show the prepared fictional legacy application in the admin application list. Its scenario label explicitly states that it is synthetic; no real identity document is included.
- [ ] For the modern wizard, use fictional facility details and clearly synthetic document images. Named local bypass permits optional evidence, but ownership still needs independent admin approval.
- [ ] Save a draft, show status, request clarification, reply and approve/reject with a reason and confirmation.
- [ ] Approval grants facility-specific access and only then permits publication. It is not external identity/business certification.

### 7. Reports and fair review — player/admin, 2 minutes

- [ ] Open `/app/reports`; choose Published facility or Public game and search/select a named resource.
- [ ] Submit a fictional concern without credentials or unnecessary private information.
- [ ] Admin opens the report, records a reasoned decision; the player's report shows the response.
- [ ] Security/privacy/general concerns need no resource identifier. Private games and other users are not exposed by the selector. Backend authorization is checked again on submission.

### 8. Community and security — player/admin, 2 minutes

- [ ] Show the prepared public game, organizer nickname, rules, capacity and join-request status. Organizer approval is required; capacity and privacy rules remain.
- [ ] For private invitations, use an explicitly named fictional recipient account. Forwarding a token to another account must not grant access.
- [ ] In admin alerts, inspect the synthetic denied-access exercise and its supporting audit reasons. It is an illustration for human review, not evidence that a real user attacked the site.
- [ ] Acknowledge/resolve the exercise with a reason; review the audit trail and verified operational health. Do not claim attack-proof protection or a fabricated security score.

## Final presentation checklist

- [ ] Four distinct role views, correct facility assignments, normal MFA online.
- [ ] Player request and owner decision are reflected in the same booking record.
- [ ] Payments are clearly external records, not a gateway.
- [ ] Check-in is shown only inside its allowed window; camera scanning is described honestly.
- [ ] Admin review decisions, report responses and audit entries are visible.
- [ ] Mobile menus, forms, cards, calendar, tables and dialogs work at tested sizes.
- [ ] No real IDs, bank details, passwords, MFA keys, OTPs or private QR tokens on shared screens.
- [ ] Clearly distinguish delivered features from future integrations.

## Current limitations and next commercial work

Render verification delivery is unavailable; fresh users cannot complete normal live contact verification until providers are configured. Local inboxes and synthetic contact flags are not real delivery. Customer review submission/display, camera capture, player payment-reference upload, online GCash/Maya/card payment/refund integrations, anonymous support and commercial operational approvals remain separate future work. Staff and owner permissions stay facility-specific. Hosting sleep, free database expiration and other pilot limits remain in `render-pilot.md`.

This guide deliberately uses Markdown checkboxes rather than a public guided-mode UI. It supports a presenter without adding routes, persistent client state, credential exposure or production-only navigation exceptions. Completed boxes are the presentation progress indicator, not invented application statistics.

