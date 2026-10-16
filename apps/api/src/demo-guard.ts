import { env } from './config.js';
export function assertDemoDatabase() {
  const url = new URL(env.DATABASE_URL);
  if (
    env.NODE_ENV === 'production' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !(
      /^\/larosentry_demo_\d{13}$/.test(url.pathname) ||
      (env.NODE_ENV === 'test' && /^\/larosentry_test_\d{13}$/.test(url.pathname))
    )
  ) {
    throw new Error(
      'Demo data requires a recognized, dedicated loopback demo/test database. Use pnpm demo:setup.',
    );
  }
}
