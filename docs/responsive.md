# Responsive interface verification - 2026-10-17

This extends the existing React/Vite interface. It does not alter booking calculations, API authorization, database schema, providers or production data.

## Layout and controls

The header uses its existing 850px mobile breakpoint, with a scrollable navigation panel, 44px controls, account links, initial link focus and Escape returning focus to the menu button. Workspace navigation collapses on small screens and preserves the existing permission-filtered links and workspace switcher. Desktop retains sidebar plus content. Closing navigation does not change permission checks.

Shared forms use one column below 600px; inputs retain 16px text, buttons wrap, long identifiers wrap, and tables scroll inside their own bounded container. Maps fit their container with larger zoom controls. Dialogs fit the viewport and retain native focus/Escape behavior. Reviews follow the booking panel in the mobile facility flow. Route splitting and lazy map loading remain; no new dependency was added.

## Selectable time slots

Between 768px and 1023px, the slot minimum width increases to 190px so the full-width tablet selector uses two or three readable columns. At 1024px the existing calendar/availability split resumes and the grid adapts to that narrower container.

`Availability` in `apps/web/src/scheduler.tsx` is shared by player booking, manual reservations and rescheduling. Previously mobile forced one full-width column, with 16px padding. The new CSS grid uses `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, an 8px gap and 64px minimum card height, with 10px/9px padding. At 320px it can use one column; 360px+ uses two when the content area supports it. Larger containers naturally gain columns. Narrow dialogs adapt to their own available width.

Time and status remain visible. Selection has a stronger outline and "Selected" text/check indicator; unavailable buttons remain disabled with their existing status labels. Keyboard activation uses native buttons. Backend order is preserved as row-major CSS grid order; no times, durations, prices or pending/conflict rules were changed. The separate owner/staff closure selector in `court-calendar.tsx` uses the same compact sizing and explicit selected text.

## Repeatable verification

Run commands from the repository root in PowerShell:

```powershell
.\pnpm.cmd lint
.\pnpm.cmd typecheck
.\pnpm.cmd test
.\pnpm.cmd test:integration
.\pnpm.cmd test:demo-mode
.\pnpm.cmd test:responsive:e2e
.\pnpm.cmd test:scheduler:e2e
.\pnpm.cmd test:admin:e2e
.\pnpm.cmd test:onboarding:e2e
.\pnpm.cmd build
```

The responsive runner creates its own recognized local demo database, synthetic facilities and four random-password accounts; it never resets an existing database. Local verification bypass is limited to those fixtures. The normal MFA and permission workflows are tested separately with bypass disabled. Never enable DEMO_MODE on Render.

Public route and scheduler matrices include 320, 360, 375, 390, 412, 430, 768, 820, 1024, 1280, 1440 and 1920px. Every role workspace route is checked at 320, 360, 390, 430, 768 and 1440px. Tests include whole-page horizontal overflow, main content, menu keyboard behavior, workspace navigation, denied admin API access, logout, slot label/order preservation, touch size, selection and booking review. Existing scheduler tests submit/cancel/reschedule real requests only in an isolated local database.

Screenshots and traces are private ignored artifacts under `test-results`; selected evidence is retained under `.local/responsive-evidence`. Browser emulation is not physical iOS/Android or camera testing. Camera capture is not implemented; existing QR/reference workflows remain.

## Results and deployment

Files for this responsive task:

- Interface: `apps/web/src/main.tsx`, `workspace.tsx`, `public.tsx`, `court-calendar.tsx`, `scheduler.tsx`, `styles.css`, `scheduler.css`.
- Runner: `package.json`, `scripts/test-database.mjs`.
- Browser coverage: `tests/browser/responsive.spec.ts`, `responsive-live.spec.ts`, `admin.spec.ts`, `scheduler.spec.ts`, `onboarding.spec.ts`. The onboarding test now waits for SMS-send completion before reading its local inbox, avoiding a race without relaxing verification.
- Documentation: `README.md`, `docs/responsive.md`, `progress.md`, `render-pilot.md`, `deployment.md`.

The deployment also preserves the already-completed local demo/system-framework checkpoint `5f69337`. Its bypass remains default OFF and is rejected in production; no demo seed is part of the deployment command.

Final actual counts and deployment results are recorded in `progress.md` and `render-pilot.md`. Use the existing free Render service only. No migration, seed, environment replacement, paid service or production record reset is needed for these changes. Live verification is read-only apart from authentication/session audit events; privileged pilot accounts must still pass MFA.
