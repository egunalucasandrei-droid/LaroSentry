export function validateDeployment(
  env: {
    NODE_ENV: string;
    APP_ORIGIN: string;
    DATABASE_URL: string;
    PUBLIC_PILOT: string;
    EMAIL_PROVIDER: string;
    DEMO_MODE?: string;
  },
  platform: {
    RENDER?: string;
    RENDER_EXTERNAL_URL?: string;
    SMS_PROVIDER?: string;
    LOCAL_DEMO_QUICK_ACCESS?: string;
    LOCAL_DEMO_INSTANCE?: string;
  },
) {
  if (env.DEMO_MODE === 'true') {
    const database = new URL(env.DATABASE_URL),
      origin = new URL(env.APP_ORIGIN);
    const loopback = (host: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(host);
    if (
      env.NODE_ENV === 'production' ||
      platform.RENDER === 'true' ||
      env.PUBLIC_PILOT === '1' ||
      !loopback(database.hostname) ||
      !loopback(origin.hostname) ||
      origin.origin !== env.APP_ORIGIN ||
      !/^\/larosentry_demo_\d{13}$/.test(database.pathname) ||
      platform.LOCAL_DEMO_INSTANCE !== database.pathname.slice(1)
    )
      throw new Error(
        'DEMO_MODE requires a matching dedicated loopback demo database and local origin; production/public hosting is forbidden.',
      );
  }
  if (env.NODE_ENV !== 'production') return;
  const origin = new URL(env.APP_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN)
    throw new Error('Production requires an exact HTTPS origin.');
  if (new URL(env.DATABASE_URL).username !== 'larosentry_app')
    throw new Error('Production requires the least-privilege runtime database role.');
  if (
    env.PUBLIC_PILOT !== '1' ||
    platform.RENDER !== 'true' ||
    platform.RENDER_EXTERNAL_URL !== origin.origin ||
    !origin.hostname.endsWith('.onrender.com')
  )
    throw new Error('Only the explicitly configured Render test pilot is enabled; see docs/deployment.md.');
  if (platform.SMS_PROVIDER === 'local' || platform.LOCAL_DEMO_QUICK_ACCESS === '1')
    throw new Error('Public hosting cannot use local verification or demo MFA shortcuts.');
  if (env.EMAIL_PROVIDER !== 'unavailable')
    throw new Error('This free pilot has no configured production email provider.');
}
