import { env } from './config.js';

const sessions = new Map<string, number>();
export const localDemoEnabled = () => env.DEMO_MODE === 'true';
// Exact existing fictional accounts only. Roles still come from the database.
// Scoped application/invitation approval may legitimately change a fixture's role.
export function demoModeFor(user: { email: string; role: string }) {
  const roles: Record<string, string[]> = {
    'admin@demo.example.test': ['ADMIN'],
    'facility_owner@demo.example.test': ['FACILITY_OWNER'],
    'facility_staff@demo.example.test': ['FACILITY_STAFF', 'FACILITY_OWNER'],
    'player@demo.example.test': ['PLAYER', 'FACILITY_OWNER', 'FACILITY_STAFF'],
  };
  return localDemoEnabled() && !!roles[user.email]?.includes(user.role);
}
export function demoAccessAllowed(user: { email: string; role: string }) {
  const database = new URL(env.DATABASE_URL);
  const name = database.pathname.slice(1);
  const roles: Record<string, string> = {
    'admin@demo.example.test': 'ADMIN',
    'facility_owner@demo.example.test': 'FACILITY_OWNER',
    'facility_staff@demo.example.test': 'FACILITY_STAFF',
  };
  return (
    env.NODE_ENV !== 'production' &&
    process.env.LOCAL_DEMO_QUICK_ACCESS === '1' &&
    database.hostname === '127.0.0.1' &&
    /^larosentry_demo_\d{13}$/.test(name) &&
    process.env.LOCAL_DEMO_INSTANCE === name &&
    roles[user.email] === user.role
  );
}
export function grantDemoSession(id: string) {
  for (const [key, expires] of sessions) if (expires <= Date.now()) sessions.delete(key);
  if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value!);
  sessions.set(id, Date.now() + 30 * 60000);
}
export function demoSessionVerified(
  session: { id: string } | undefined,
  user: { email: string; role: string },
) {
  return (
    !!session &&
    (demoModeFor(user) || (demoAccessAllowed(user) && (sessions.get(session.id) ?? 0) > Date.now()))
  );
}
