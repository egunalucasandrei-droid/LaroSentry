# Access control

Local DEMO_MODE extension (2026-10-17): only the four exact named local fixtures in a matching dedicated loopback demo database may bypass contact/onboarding/MFA and application-evidence prerequisites. Password sessions, restrictions, all roles/memberships/permissions, own-resource/file rules, review assignment/self-review prevention, independent approval, confirmation/reasons and last-admin protection remain. Default is OFF; production/Render/public configuration rejects ON. Actual verification/enrollment is not rewritten; APIs report a separate `verificationBypassed` flag. The operation matrix below remains authoritative for authorization. [Mode boundaries/tests](demo-mode.md) and [current beginner-friendly matrix/flows](system-framework.md#21-rolepermission-matrix).

## Onboarding and verification (2026-10-16)

Authenticated restricted sessions may read only their own contact status, request/consume their own SMS challenge and manage contact onboarding. First verified contact enables purpose/preferences; new accounts require both contacts for normal account/business APIs. Both contacts are mandatory for new facility drafts/evidence/submission and staff invitation acceptance. Normal privileged owner/staff/ADMIN access now also requires verified mobile; the existing exact local demo preview remains limited to its fictional loopback environment. Legacy player access is preserved without inventing verified phones.

Private document retrieval under `/admin/applications/:id/documents/:documentId` requires ADMIN/MFA, that application's assigned reviewer, a matching document, review state and unexpired content. Applicants, players, staff, other owners and other admins receive denial; only metadata is available to the applicant. No public file/export route exists. Owner invitations require the specific OWNER membership; acceptance requires the invited verified account and grants only stored facility permissions. Public purpose and signup never grant ADMIN/STAFF/OWNER roles. [Full workflow and limits](onboarding-verification.md).

## Role workspaces (2026-10-16)

The [current role matrix](role-workspaces.md#final-access-matrix) adds capability discovery at `/api/workspaces`, membership/MFA-guarded `/api/workspaces/owner/*` and `/api/workspaces/staff/*`, and ADMIN/MFA-only facility/booking/payment oversight. Owner editing/staff grants require the exact facility OWNER membership. Staff access follows BOOKINGS/PAYMENTS/ATTENDANCE. Unassigned global roles grant no workspace. Booking-only legacy responses redact payment records. Operators cannot verify their own payments. New record pages paginate at 20 rows. Existing demo exceptions remain narrowly scoped.

## NOLTA scheduler (2026-10-16)

| Endpoint / action                                                          | Player           | Assigned owner                                           | Assigned staff   | ADMIN                                                                                  |
| -------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| Scheduler public court/schedule and own reservations                       | Verified account | Verified account                                         | Verified account | Verified account                                                                       |
| Player reservation / own cancellation / profile                            | Own only         | Own only                                                 | Own only         | Own only                                                                               |
| Management court/schedule/activity lists                                   | Denied           | OWNER membership + privileged verification               | Denied           | OWNER membership + privileged verification                                             |
| Add/edit court, date exception, manual reservation, host reschedule/cancel | Denied           | Same facility OWNER membership + privileged verification | Denied           | Same facility OWNER membership + privileged verification                               |
| Demo reset preview / mutation                                              | Denied           | Denied                                                   | Denied           | Exact named local demo admin only; assigned fictional facilities and NOLTA source only |

All mutations retain origin/CSRF validation. Important settings/booking changes require a reason and explicit confirmation. Public slot responses omit allocation IDs, notes and customer identities. Host activity exposes customer nickname/ID, not email, credentials, sessions or MFA data. Manual booking targets require an exact verified account email rather than a host-visible directory. An idempotency retry still rechecks current manual-booking authorization.

Local demo exception: only the three exact privileged `@demo.example.test` fixture accounts can password-confirm temporary access when the launcher enables it against the matching loopback `larosentry_demo_<timestamp>` database. It expires within 30 minutes and is lost at server restart. This is not enrolled/verified MFA; all role, account, session and resource checks still apply. The demo ADMIN receives an explicit OWNER membership in one shared fictional facility. No other admin gains facility access implicitly. Normal accounts and production cannot use this exception.

`GET /api/operations/courts/:id/schedule?date=YYYY-MM-DD` requires assigned facility access with BOOKINGS permission and MFA (or the narrowly scoped local preview above). Visitors receive 401; players, unassigned users and accounts without verification receive 403. Results omit customer identities. Closure mutations retain CSRF, reason validation, audit records and allocation-conflict checks.

All accounts must declare adulthood; verification proves control of email, not identity. Owners and staff can use player routes for their own bookings.

The legacy `/manage` hub remains restricted to ADMIN and FACILITY_OWNER. `/api/management` independently enforces that role allowlist, verified login and MFA. Visitors receive 401; players/staff and privileged accounts without MFA receive 403. Hosts receive only counts and court summaries for OWNER memberships, with no access to platform-admin data. Admins receive platform review counts and links to their existing admin workflows. The header and switcher now open separate authorized workspaces. Navigation never changes a role or grants an owner platform ADMIN access.

| Operation                                              | Visitor             | Player         | Assigned owner   | Assigned staff                | Admin              |
| ------------------------------------------------------ | ------------------- | -------------- | ---------------- | ----------------------------- | ------------------ |
| Published discovery/details/anonymous availability     | Yes                 | Yes            | Yes              | Yes                           | Yes                |
| Quote                                                  | Yes, origin checked | Yes            | Yes              | Yes                           | Yes                |
| Create/list/detail/cancel personal booking             | No                  | Own only       | Own only         | Own only                      | Own only           |
| Saved facilities, preferences, sessions, notifications | No                  | Own only       | Own only         | Own only                      | Own only           |
| Facility booking list/decision/closure                 | No                  | No             | Membership + MFA | Membership + BOOKINGS + MFA   | No implicit bypass |
| Record full external payment                           | No                  | No             | Membership + MFA | Membership + PAYMENTS + MFA   | No implicit bypass |
| QR/manual check-in                                     | No                  | No             | Membership + MFA | Membership + ATTENDANCE + MFA | No implicit bypass |
| Issue booking QR                                       | No                  | Organizer only | Own only         | Own only                      | Own only           |
| Own actor audit view                                   | No                  | No             | MFA              | MFA                           | MFA                |
| Platform audit and health                              | No                  | No             | No               | No                            | ADMIN + MFA        |

Public registration always creates PLAYER accounts, ignoring submitted roles and email domains. Only the explicit local `admin:access` operator command grants/revokes ADMIN for an existing verified, unrestricted account. It requires the exact email, a reason and `--confirm`, revokes sessions and audits the change. It is limited to a local development database. Facility approval creates scoped OWNER membership and upgrades PLAYER to FACILITY_OWNER; it never grants ADMIN. Staff cannot self-promote. Browser route guards are convenience; controllers make the decisions. Cross-user private detail reads return 404. Owner/staff lists filter by facility membership.

## Administration and submissions

| Resource/action                                                       | Access rule                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/*` website                                                    | Login, ADMIN role, enrolled MFA and MFA-verified session. Non-admin roles see an explicit denial; unverified admins go to the dedicated MFA screen.                                                     |
| Entire `/api/admin` namespace                                         | Session middleware plus ADMIN/MFA guard before routing, including unknown/future export and file paths. Every implemented controller also checks authorization.                                         |
| Admin overview, application/user/report/alert lists, audit and health | ADMIN + MFA; list pages contain at most 20 records and totals. No export endpoint exists.                                                                                                               |
| Admin details/evidence                                                | ADMIN + MFA and lookup of the specific record; missing records return 404. Sensitive user fields are explicitly excluded.                                                                               |
| Application/report decisions                                          | ADMIN + MFA; own submitted applications/reports cannot be decided by that admin. State checked; confirmation and 10–1,000-character reason required.                                                    |
| Account restriction/restoration                                       | ADMIN + MFA; self-restriction denied. Shared transaction lock and fresh session/role checks prevent concurrent admins eliminating each other's access. Restrictions revoke sessions and are reversible. |
| Local ADMIN revocation                                                | Refused unless another verified, unrestricted administrator has enrolled MFA. School affiliation grants no access.                                                                                      |
| Alert acknowledgement/resolution                                      | ADMIN + MFA, valid record/state, confirmation and reason; acknowledge before resolving. No automatic punishment.                                                                                        |
| Audit/decision history                                                | Read-only UI; runtime database grants allow SELECT/INSERT, not UPDATE/DELETE. System/database operators remain a separate trust boundary.                                                               |
| Facility applications                                                 | Signed-in accounts may submit and list only their own; only the applicant may reply to requested clarification. Pending/rejected applications are not public listings.                                  |
| Reports                                                               | Signed-in users submit/track their own. Facility targets must be published; game targets must be accessible to that caller. Admins can review reports but cannot self-adjudicate.                       |

## Community access

Visitors cannot browse individual game listings. Signed-in accounts can browse published public games, request a place, manage their own participation and block an organizer they can access. A blocked pair cannot start new participation or invitations in either direction. Existing participation remains until explicitly withdrawn or removed.

Only the booking organizer can publish, edit game rules/offline counts, read the roster, approve/remove players or send/revoke invitations. Facility membership and ADMIN do not bypass these checks. Private game summaries require organizer ownership, active participation or an unexpired intended invitation. Invitation acceptance always checks the signed-in recipient, including when an email token is supplied. Roster and invitation lists omit contact details and secret hashes.

Uploads/downloads, exports and staff-invitation management remain disabled/unimplemented. Namespace denial tests cover attempted admin file/export access; this does not certify a file or export workflow that does not exist.
