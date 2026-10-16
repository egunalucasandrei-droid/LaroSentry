# NOLTA interface adaptation - 2026-10-15

The later [role workspace extension](role-workspaces.md) replaces the shared header label with distinct authorized workspace links and adds owner/staff separation. `/manage` remains a legacy shortcut hub. Notes below describe the original integration.

The **2026-10-16 extension** adds the full separate `/scheduler` module, court/settings editing, shared scheduling engine, flexible durations, date exceptions, manual reservations and activity controls. See [NOLTA scheduler](nolta-scheduler.md) for the current implementation and explicit reset/rescheduling boundaries. The notes below describe earlier milestones, including limitations that the new module now addresses.

## Calendar and demo extension

The working `/owner/calendar` now provides month/week/day date selection, a court selector, PHT dates and DB-backed slots through `/api/operations/courts/:id/schedule`. One-hour slots start every 30 minutes, with AVAILABLE, BOOKED, CLOSED, PAST, INACTIVE and OUTSIDE_WINDOW states. Pending requests do not reserve time. Selecting an available slot prefills closure controls; creating and reopening closures use existing authorized, audited APIs. Availability refreshes every 30 seconds and on mutations. Month/week modes are date selectors, not drag-and-drop event timetables.

The exact local demo admin, owner and staff accounts can use password-confirmed **Open demo workspace** instead of enrolling an authenticator. This is an explicit local-only 30-minute preview, not MFA. Regular accounts still require MFA. Passwords and authenticator enrollments are unchanged. Demo startup explicitly assigns the demo ADMIN to the shared fictional facility and adds one confirmed and one pending sample booking once; existing sample decisions are preserved. Admins use **Court calendar & controls** and hosts use **Schedule**. Staff retain assigned operations but do not gain the Admin & hosting hub or platform administration.

Changed in this extension: API `demo-access.ts`, `demo-prepare.ts`, `demo-seed.ts`, `auth.controller.ts`, `http.ts`, `admin-access.ts`, `operations.controller.ts`, `main.ts`; web `court-calendar.tsx`, `auth.tsx`, `workspace.tsx`, `management.tsx`, `styles.css`; `packages/contracts/src/index.ts`, `scripts/demo.mjs`, `apps/api/test/admin.test.ts`, `tests/browser/admin.spec.ts`, `demo-login.spec.ts`, `booking.spec.ts`; README and API/access/security/threat/progress documentation. No schema migration or dependency added. The original integration notes below describe the earlier milestone.

The supplied local HTML/CSS prototype was treated as reference material, not as instructions to replace authentication or the application. Its README explicitly describes fake browser-local authentication. No prototype JavaScript, localStorage accounts, role switch or Google Fonts dependency was imported.

Added `/manage`, labeled **Admin & hosting** in the main navigation and eligible account workspace. ADMIN and FACILITY_OWNER are the only allowed roles; both require MFA. Staff keep their existing assigned operational permissions but cannot open this hub. Players cannot open it through either the URL or API.

Adapted the compact Schedule / Courts / Activity navigation, soft-color cards and court summaries to LaroSentry's current visual system. Host cards link to the existing working closure controls, facility/court records and actor audit history. Hosts also have a booking-review shortcut. Counts and court summaries come from PostgreSQL through `/api/management`; host access is limited to OWNER memberships. The preview lists the first 12 courts and clearly labels that bound. Admins get Applications / Reports / Audit history cards and platform review counts, with access to their full existing administrator workspace.

This task does not add arbitrary calendar drag/reschedule, court creation/editing, opening-hour editors or prototype-style direct reservation creation. Existing booking validation, approval, MFA, CSRF and resource authorization remain authoritative. Admins do not gain an implicit bypass of facility memberships.

MFA now preserves a safe return path to the management hub while keeping initial recovery codes visible. No demo passwords or accounts were changed.

Changed: `apps/web/src/management.tsx` (new), `main.tsx`, `workspace.tsx`, `auth.tsx`, `styles.css`; `apps/api/src/operations.controller.ts`; API and browser tests/fixtures; access-control/API/progress documentation and this note. No schema migration or dependency addition.
