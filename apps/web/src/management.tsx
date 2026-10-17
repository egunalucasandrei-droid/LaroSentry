import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, LayoutDashboard, Clock3, ArrowUpRight } from 'lucide-react';
import { formatMoney } from '@larosentry/contracts';
import { api } from './api';
import { ErrorState, Loading, useUser } from './main';

type Summary = {
  scope: 'ADMIN' | 'HOST';
  metrics: { label: string; value: number }[];
  courts: {
    id: string;
    name: string;
    sport: string;
    hourlyRate: number;
    facility: { name: string; status: string };
  }[];
};
export default function Management() {
  const me = useUser();
  const allowed = ['ADMIN', 'FACILITY_OWNER'].includes(me.data?.user?.role ?? '');
  const summary = useQuery({
    queryKey: ['management'],
    queryFn: () => api<Summary>('/management'),
    enabled: allowed && !!(me.data?.user?.mfaVerified || me.data?.user?.verificationBypassed),
  });
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorState error={me.error} />;
  if (!me.data.user) return <Navigate to="/login?next=%2Fmanage" replace />;
  if (!allowed)
    return (
      <section className="container section">
        <h1>Admin or court host access required</h1>
        <p>This workspace is reserved for administrators and authorized facility owners.</p>
        <Link className="btn" to="/app/bookings">
          Return to my bookings
        </Link>
      </section>
    );
  if (!me.data.user.mfaVerified && !me.data.user.verificationBypassed)
    return <Navigate to="/mfa?next=%2Fmanage" replace />;
  if (summary.isPending) return <Loading />;
  if (summary.error) return <ErrorState error={summary.error} retry={() => void summary.refetch()} />;
  const admin = summary.data.scope === 'ADMIN';
  const cards = admin
    ? [
        {
          title: 'Applications',
          href: '/admin/applications',
          detail: 'Review listings, request clarification and record decisions.',
          Icon: LayoutDashboard,
        },
        {
          title: 'Reports',
          href: '/admin/reports',
          detail: 'Review user concerns and record a fair response.',
          Icon: CalendarDays,
        },
        {
          title: 'Audit history',
          href: '/admin/audit',
          detail: 'Search recorded actions, actors and outcomes.',
          Icon: Clock3,
        },
      ]
    : [
        {
          title: 'Schedule',
          href: '/owner/calendar',
          detail: 'Review court closures and manage unavailable periods.',
          Icon: CalendarDays,
        },
        {
          title: 'Courts',
          href: '/owner/facilities',
          detail: 'Inspect your assigned facilities, sports and hourly prices.',
          Icon: LayoutDashboard,
        },
        {
          title: 'Activity',
          href: '/owner/activity',
          detail: 'Review the recorded actions performed by your account.',
          Icon: Clock3,
        },
      ];
  return (
    <section className="container section management-home">
      <div className="section-title">
        <div>
          <span className="eyebrow dark">{admin ? 'PLATFORM ADMINISTRATION' : 'COURT MANAGEMENT'}</span>
          <h1>{admin ? 'Administration' : 'Your hosting workspace'}</h1>
          <p>
            Welcome, {me.data.user.nickname}.{' '}
            {admin
              ? 'Review platform matters and track decisions.'
              : 'Keep court schedules and booking requests in one place.'}
          </p>
        </div>
        <span className="badge">{admin ? 'ADMIN' : 'COURT HOST'}</span>
      </div>
      <nav className="management-tabs" aria-label="Management shortcuts">
        {cards.map((c) => (
          <Link key={c.href} to={c.href}>
            {c.title}
          </Link>
        ))}
      </nav>
      <div className="stats-grid">
        {summary.data.metrics.map((m) => (
          <div className="panel" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </div>
      <p className="small muted">
        {admin
          ? 'Applications include pending, under-review and clarification states. Counts include all currently unresolved items.'
          : 'Counts cover all records at facilities where you have an owner membership. Confirmed counts include past reservations still marked confirmed.'}
      </p>
      <div className="management-cards">
        {cards.map(({ title, href, detail, Icon }) => (
          <Link className="management-card" key={href} to={href}>
            <Icon aria-hidden="true" />
            <h2>{title}</h2>
            <p>{detail}</p>
            <span>
              Open {title.toLowerCase()} <ArrowUpRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      {!admin && (
        <>
          <h2>Your courts at a glance</h2>
          <p className="small muted">
            First 12 courts by name. Open Courts for your facility records. Listing status does not indicate
            time-slot availability.
          </p>
          <div className="management-courts">
            {summary.data.courts.map((c) => (
              <article className="panel" key={c.id}>
                <span className="badge">{c.facility.status}</span>
                <h3>{c.name}</h3>
                <p>{c.facility.name}</p>
                <p>
                  {c.sport} · {formatMoney(c.hourlyRate)} / hour
                </p>
              </article>
            ))}
          </div>
          {!summary.data.courts.length && (
            <p>No owner-assigned courts yet. An approved facility application establishes owner access.</p>
          )}
        </>
      )}
      <div className="button-row">
        <Link className="btn" to="/scheduler/admin/schedule">
          Open NOLTA scheduling
        </Link>
        {admin && (
          <Link className="btn secondary" to="/owner/calendar">
            Court calendar & controls
          </Link>
        )}
        <Link className="btn" to={admin ? '/admin' : '/owner/bookings'}>
          {admin ? 'Open full administration' : 'Review booking requests'}
        </Link>
        <Link className="btn secondary" to="/app/bookings">
          My player bookings
        </Link>
      </div>
    </section>
  );
}
