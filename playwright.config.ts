import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testIgnore: [
    ...(process.env.ONBOARDING_E2E === '1' ? [] : ['**/onboarding.spec.ts']),
    ...(process.env.SCHEDULER_E2E === '1' ? [] : ['**/scheduler.spec.ts']),
    ...(process.env.ADMIN_E2E === '1' ? [] : ['**/admin.spec.ts']),
    ...(process.env.DEMO_E2E === '1' ? [] : ['**/demo-login.spec.ts']),
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.BROWSER_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
