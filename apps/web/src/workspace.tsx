import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  Heart,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Bell,
  Clock3,
  CheckCircle2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { formatMoney, formatTime, type Booking, type Facility } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading, useUser } from './main';
import { FacilityCard } from './public';
import { MfaPanel } from './auth';
import { Community, GameOrganizer } from './community';
import Admin from './admin';
import { Applications, Reports } from './submissions';
import CourtCalendar from './court-calendar';
import PlayerHome from './player-home';
import {
  useWorkspaces,
  WorkspaceSwitcher,
  RoleRecords,
  RoleOverview,
  FacilityEditor,
  AccountWorkspaceSettings,
} from './role-workspaces';
type Notice = { id: string; title: string; href: string; createdAt: string; readAt: string | null };
export default function Workspace() {
  const me = useUser(),
    { pathname } = useLocation();
  const access = useWorkspaces(!!me.data?.user);
  const workspaceMenu = useRef<HTMLButtonElement>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  useEffect(() => {
    setWorkspaceOpen(false);
  }, [pathname]);
  if (me.isPending) return <Loading />;
  if (me.error)
    return (
      <section className="container section">
        <ErrorState error={me.error} retry={() => void me.refetch()} />
      </section>
    );
  if (!me.data.user) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  if (me.data.user.needsOnboarding && !me.data.user.verificationBypassed)
    return <Navigate to="/onboarding" replace />;
  const operations = pathname.startsWith('/owner') || pathname.startsWith('/staff'),
    admin = pathname.startsWith('/admin');
  const staff = pathname.startsWith('/staff');
  if (admin && me.data.user.role !== 'ADMIN')
    return (
      <section className="container section">
        <h1>Administrator access required</h1>
        <p>Your account is not authorized for the admin workspace.</p>
        <Link className="btn" to="/app/bookings">
          Return to my bookings
        </Link>
      </section>
    );
  if (admin && !me.data.user.mfaVerified && !me.data.user.verificationBypassed)
    return <Navigate to="/mfa?next=%2Fadmin" replace />;
  if (access.isPending) return <Loading />;
  if (access.error) return <ErrorState error={access.error} />;
  if (operations && !(staff ? access.data.staff : access.data.owner))
    return (
      <section className="container section">
        <h1>{staff ? 'Staff' : 'Facility owner'} access required</h1>
        <p>Your account has no authorized assignment for this workspace.</p>
        <Link className="btn" to="/app">
          Return to player workspace
        </Link>
      </section>
    );
  const staffSection = pathname.split('/')[2] ?? '';
  const requiredPermission = ['calendar', 'bookings'].includes(staffSection)
    ? 'BOOKINGS'
    : ['check-in', 'attendance'].includes(staffSection)
      ? 'ATTENDANCE'
      : ['payments', 'payment-entry'].includes(staffSection)
        ? 'PAYMENTS'
        : null;
  if (
    staff &&
    (![
      '',
      'calendar',
      'bookings',
      'check-in',
      'attendance',
      'payments',
      'payment-entry',
      'notifications',
    ].includes(staffSection) ||
      (requiredPermission && !access.data.staffPermissions.includes(requiredPermission)))
  )
    return (
      <section className="container section">
        <h1>Staff permission required</h1>
        <p>This page is not included in your facility permissions.</p>
        <Link to="/staff">Return to staff overview</Link>
      </section>
    );
  const links = staff
    ? ([
        ['/staff', 'Overview', LayoutDashboard],
        ...(access.data.staffPermissions.includes('BOOKINGS')
          ? ([
              ['/staff/calendar', 'Today’s schedule', CalendarDays],
              ['/staff/bookings', 'Bookings', CalendarDays],
            ] as const)
          : []),
        ...(access.data.staffPermissions.includes('ATTENDANCE')
          ? ([
              ['/staff/check-in', 'QR check-in', ShieldCheck],
              ['/staff/attendance', 'Attendance', CheckCircle2],
            ] as const)
          : []),
        ...(access.data.staffPermissions.includes('PAYMENTS')
          ? ([['/staff/payments', 'Payments', CheckCircle2]] as const)
          : []),
        ['/staff/notifications', 'Notifications', Bell],
      ] as const)
    : operations
      ? ([
          ['/owner', 'Overview', LayoutDashboard],
          ['/owner/bookings', 'Booking requests', CalendarDays],
          ['/owner/calendar', 'Schedule & closures', CalendarDays],
          ['/owner/facilities', 'My facilities', LayoutDashboard],
          ['/owner/courts', 'Courts', CalendarDays],
          ['/owner/reservations', 'Reservations', CalendarDays],
          ['/owner/payments', 'Payments', CheckCircle2],
          ['/owner/check-in', 'QR check-in', ShieldCheck],
          ['/owner/attendance', 'Attendance', CheckCircle2],
          ['/owner/staff', 'Staff', ShieldCheck],
          ['/owner/reviews', 'Reviews', Heart],
          ['/owner/reports', 'Reports', Bell],
          ['/owner/notifications', 'Notifications', Bell],
          ['/owner/activity', 'Activity', Clock3],
          ['/owner/settings', 'Settings', Settings],
        ] as const)
      : admin
        ? ([
            ['/admin', 'Overview', LayoutDashboard],
            ['/admin/booking-requests', 'Booking requests', CalendarDays],
            ['/admin/applications', 'Facility applications', CalendarDays],
            ['/admin/facilities', 'Facilities', LayoutDashboard],
            ['/admin/users', 'Users', Settings],
            ['/admin/bookings', 'Bookings', CalendarDays],
            ['/admin/payments', 'Payments', CheckCircle2],
            ['/admin/reports', 'Reports', Bell],
            ['/admin/alerts', 'Security alerts', ShieldCheck],
            ['/admin/audit', 'Audit history', ShieldCheck],
            ['/admin/health', 'Operational health', Clock3],
            ['/admin/settings', 'Settings', Settings],
          ] as const)
        : ([
            ['/app', 'Overview', LayoutDashboard],
            ['/facilities', 'Find courts', CalendarDays],
            ['/app/bookings', 'My bookings', CalendarDays],
            ['/app/saved', 'Saved places', Heart],
            ['/app/games', 'Public games', CalendarDays],
            ['/app/invitations', 'Invitations', Bell],
            ['/app/notifications', 'Notifications', Bell],
            ['/app/reports', 'My reports', ShieldCheck],
            ['/app/applications', 'Facility applications', LayoutDashboard],
            ['/app/settings/profile', 'Account settings', Settings],
            ['/app/settings/verification', 'Account verification', ShieldCheck],
            ['/app/settings/preferences', 'Preferences', Heart],
          ] as const);
  return (
    <div className="container workspace">
      <aside className="workspace-nav">
        <div
          className={`workspace-menu${workspaceOpen ? ' open' : ''}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setWorkspaceOpen(false);
              workspaceMenu.current?.focus();
            }
          }}
        >
          <button
            type="button"
            className="workspace-toggle"
            ref={workspaceMenu}
            aria-expanded={workspaceOpen}
            aria-controls="workspace-links"
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
          >
            Workspace menu <span>{links.find(([href]) => href === pathname)?.[1] ?? 'Navigation'}</span>
          </button>
          <div className="workspace-menu-content" id="workspace-links">
            <WorkspaceSwitcher access={access.data} />
            <span className="eyebrow dark">YOUR CORNER</span>
            <h2>Hello, {me.data.user.nickname}.</h2>
            <p className="muted small">
              {operations
                ? staff
                  ? 'Staff workspace'
                  : 'Facility owner workspace'
                : admin
                  ? 'Platform administration'
                  : 'A little more room for play.'}
            </p>
            <nav aria-label="Workspace navigation">
              {links.map(([href, label, Icon]) => (
                <NavLink key={href} to={href} end>
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>
            <Link className="workspace-extra" to="/facilities">
              Find your next court <ArrowRight size={16} />
            </Link>
            {(access.data.admin || access.data.owner || access.data.staff) && (
              <Link
                className="workspace-extra"
                to={access.data.admin || access.data.owner ? '/manage' : '/staff'}
              >
                {access.data.admin
                  ? 'Administration shortcuts'
                  : access.data.owner
                    ? 'Hosting shortcuts'
                    : 'Staff overview'}{' '}
                <ShieldCheck size={16} />
              </Link>
            )}
            <Link className="workspace-extra" to="/app/settings/security">
              Account security <ShieldCheck size={16} />
            </Link>
          </div>
        </div>
      </aside>
      <div className="workspace-content">
        {operations || admin ? (
          !me.data.user.mfaVerified && !me.data.user.verificationBypassed ? (
            <MfaPanel />
          ) : admin ? (
            pathname === '/admin/booking-requests' ? (
              <Operations />
            ) : (
              <Admin />
            )
          ) : pathname.endsWith('/notifications') ? (
            <Notifications />
          ) : pathname.endsWith('/settings') ? (
            <AccountWorkspaceSettings />
          ) : pathname === '/owner' || pathname === '/staff' ? (
            <RoleOverview mode={staff ? 'staff' : 'owner'} />
          ) : /^\/owner\/facilities\/.+/.test(pathname) ? (
            <FacilityEditor id={pathname.split('/')[3]!} />
          ) : [
              'facilities',
              'courts',
              'reservations',
              'payments',
              'attendance',
              'staff',
              'reviews',
              'reports',
              'activity',
            ].includes(pathname.split('/')[2] ?? '') ? (
            <RoleRecords key={pathname} mode={staff ? 'staff' : 'owner'} section={pathname.split('/')[2]!} />
          ) : (
            <Operations />
          )
        ) : pathname.startsWith('/app/settings') ? (
          <SettingsPanel />
        ) : pathname === '/app' ? (
          <PlayerHome />
        ) : pathname === '/app/notifications' ? (
          <Notifications />
        ) : pathname === '/app/saved' ? (
          <Saved />
        ) : pathname === '/app/reports' ? (
          <Reports />
        ) : pathname === '/app/applications' ? (
          <Applications />
        ) : pathname.startsWith('/app/games') || pathname === '/app/invitations' ? (
          <Community />
        ) : (
          <Bookings />
        )}
      </div>
    </div>
  );
}
function Bookings() {
  const { pathname } = useLocation();
  const id = pathname.match(/^\/app\/bookings\/([^/]+)$/)?.[1];
  const [tab, setTab] = useState('All');
  const result = useQuery<Booking | Booking[]>({
    queryKey: ['bookings', id],
    queryFn: async () => (id ? await api<Booking>(`/bookings/${id}`) : await api<Booking[]>('/bookings')),
  });
  if (result.isPending) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={() => void result.refetch()} />;
  if (id) return <BookingDetail booking={result.data as Booking} refresh={() => void result.refetch()} />;
  const rows = result.data as Booking[];
  const statuses: Record<string, string[]> = {
    All: [],
    Upcoming: ['CONFIRMED'],
    Pending: ['PENDING'],
    Past: ['COMPLETED', 'NO_SHOW'],
    Cancelled: ['CANCELLED', 'REJECTED', 'EXPIRED'],
  };
  const filtered = rows.filter((b) =>
    tab === 'Past'
      ? new Date(b.endsAt) <= new Date() || statuses.Past!.includes(b.status)
      : tab === 'Upcoming'
        ? b.status === 'CONFIRMED' && new Date(b.endsAt) > new Date()
        : !statuses[tab]!.length || statuses[tab]!.includes(b.status),
  );
  return (
    <>
      <div className="section-title">
        <div>
          <div className="eyebrow dark">YOUR TIME ON COURT</div>
          <h1>My bookings</h1>
        </div>
        <Link className="btn compact" to="/facilities">
          Find a court <ArrowRight size={16} />
        </Link>
      </div>
      <div className="tabs" role="group" aria-label="Filter bookings">
        {Object.keys(statuses).map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </div>
      {filtered.length ? (
        filtered.map((b) => (
          <Link className="booking-row" key={b.id} to={`/app/bookings/${b.id}`}>
            <div className="booking-date">
              <CalendarDays />
              <span>
                {new Date(b.startsAt).toLocaleDateString('en-PH', {
                  timeZone: 'Asia/Manila',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <div>
              <span className={`badge ${b.status.toLowerCase()}`}>{b.status}</span>
              <h3>{b.court.facility.name}</h3>
              <p>
                {b.court.name} · {formatTime(b.startsAt)}
              </p>
              <small>{b.reference}</small>
            </div>
            <div>
              <strong>{formatMoney(b.totalCentavos)}</strong>
              <ArrowRight size={18} />
            </div>
          </Link>
        ))
      ) : (
        <div className="empty">
          <CalendarDays size={38} />
          <h2>Your calendar has room for play.</h2>
          <p>No bookings in this category yet.</p>
          <Link className="btn" to="/facilities">
            Explore courts
          </Link>
        </div>
      )}
    </>
  );
}
function BookingDetail({ booking: b, refresh }: { booking: Booking; refresh: () => void }) {
  const [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [qr, setQr] = useState(''),
    [busy, setBusy] = useState(false);
  async function action(type: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ message: string; token?: string }>(`/bookings/${b.id}/${type}`);
      if (result.token) setQr(await QRCode.toDataURL(result.token, { width: 260, margin: 2 }));
      else {
        setMessage(result.message);
        setQr('');
        refresh();
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="text-link" to="/app/bookings">
        ← All bookings
      </Link>
      <div className="section-title">
        <div>
          <h1>Your court time.</h1>
          <p className="muted">{b.reference}</p>
        </div>
        <span className={`badge ${b.status.toLowerCase()}`}>{b.status}</span>
      </div>
      {b.status === 'PENDING' && (
        <p className="notice">
          Request received. Your court time is not reserved until facility staff confirm it. Expires{' '}
          {formatTime(b.expiresAt)}.
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <div className="panel">
        <h2>{b.court.facility.name}</h2>
        <p>
          {b.court.name} · {b.court.sport}
        </p>
        <dl className="booking-info">
          <dt>Starts</dt>
          <dd>{formatTime(b.startsAt)}</dd>
          <dt>Ends</dt>
          <dd>{formatTime(b.endsAt)}</dd>
          <dt>Reservation mode</dt>
          <dd>{b.mode.replaceAll('_', ' ')}</dd>
          <dt>People, including you</dt>
          <dd>{b.expectedGuests}</dd>
          <dt>Total</dt>
          <dd>{formatMoney(b.totalCentavos)}</dd>
          <dt>Payment</dt>
          <dd>
            {b.paymentRecords?.some((p) => p.state === 'PAID')
              ? 'PAID · recorded by facility staff'
              : 'UNPAID · Pay at facility after confirmation'}
          </dd>
        </dl>
        <section className="notice" aria-label="Booking and payment guidance">
          <strong>
            {b.status === 'PENDING'
              ? 'Next: wait for facility approval'
              : b.status === 'CONFIRMED'
                ? 'Next: arrange payment and check in'
                : 'This booking is no longer awaiting approval'}
          </strong>
          <p>
            Booking status and payment status are separate. Arrange payment directly with the facility after
            confirmation. Authorized staff record external payment details; this prototype does not charge a
            card or transfer money.
          </p>
          {b.status === 'CONFIRMED' && (
            <p>
              Keep your booking reference ready. Generate a check-in code below when you are ready to present
              it to staff.
            </p>
          )}
        </section>
        <h3>Your cancellation terms</h3>
        <p>{b.policySnapshot}</p>
        {['PENDING', 'CONFIRMED'].includes(b.status) && new Date(b.startsAt) > new Date() && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  'Cancel this reservation? This releases a confirmed slot and does not issue a payment refund.',
                )
              )
                void action('cancel');
            }}
          >
            Cancel booking
          </button>
        )}
        {b.status === 'CONFIRMED' && (
          <div className="qr-panel">
            <h3>Booking check-in</h3>
            <p>
              Issue a fresh code before showing it to authorized facility staff. Previous codes become
              invalid.
            </p>
            <button className="btn" disabled={busy} onClick={() => void action('qr')}>
              Issue check-in QR
            </button>
            {qr && <img src={qr} alt="Private booking check-in QR code" width="260" height="260" />}
          </div>
        )}
      </div>
      {b.status === 'CONFIRMED' && new Date(b.startsAt) > new Date() && (
        <RescheduleForm booking={b} refresh={refresh} />
      )}
      {b.status === 'CONFIRMED' && new Date(b.startsAt) > new Date() && (
        <GameOrganizer booking={b} refresh={refresh} />
      )}
      <div className="panel">
        <h3>Booking timeline</h3>
        <ol className="timeline">
          {b.history.map((h) => (
            <li key={h.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{h.status}</strong>
                <p>{h.reason}</p>
                <small>{formatTime(h.createdAt)}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
function RescheduleForm({ booking, refresh }: { booking: Booking; refresh: () => void }) {
  const pending = booking.rescheduleRequests?.find((r) => r.state === 'PENDING');
  const [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const startsAt = new Date(`${values.get('date')}T${values.get('time')}:00+08:00`);
      const duration = new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime();
      const result = await post<{ message: string }>(`/bookings/${booking.id}/reschedule`, {
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + duration).toISOString(),
        reason: values.get('reason'),
      });
      setMessage(result.message);
      refresh();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h3>Request a different time</h3>
      <p>
        Your original time stays reserved until the facility approves. Court, duration, price, and terms
        remain the same.
      </p>
      {error && <ErrorState error={error} />}{' '}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {pending ? (
        <p className="notice">
          Pending change: {formatTime(pending.startsAt)}. The original reservation remains confirmed.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="form-row">
            <label>
              New date
              <input required name="date" type="date" />
            </label>
            <label>
              New start time (PHT)
              <input required name="time" type="time" step="1800" />
            </label>
          </div>
          <label>
            Reason for change
            <input required minLength={3} maxLength={300} name="reason" />
          </label>
          <button className="btn secondary" disabled={busy}>
            Request schedule change
          </button>
        </form>
      )}
    </div>
  );
}
function Saved() {
  const [actionError, setActionError] = useState<Error | null>(null);
  const result = useQuery({ queryKey: ['saved'], queryFn: () => api<{ facility: Facility }[]>('/saved') });
  if (result.isPending) return <Loading />;
  if (result.error) return <ErrorState error={result.error} />;
  return (
    <>
      <h1>Saved places</h1>
      {actionError && <ErrorState error={actionError} />}
      {result.data.length ? (
        <div className="card-grid two">
          {result.data.map(({ facility }) => (
            <div key={facility.id}>
              <FacilityCard facility={facility} />
              <button
                className="text-button"
                onClick={() =>
                  void api(`/saved/${facility.id}`, { method: 'DELETE', body: '{}' })
                    .then(() => result.refetch())
                    .catch(setActionError)
                }
              >
                Remove saved facility
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Heart size={36} />
          <h2>Keep a good court close.</h2>
          <p>Tap a facility’s heart to save it here.</p>
          <Link className="btn" to="/facilities">
            Explore courts
          </Link>
        </div>
      )}
    </>
  );
}
function Notifications() {
  const [actionError, setActionError] = useState<Error | null>(null);
  const result = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notice[]>('/notifications'),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  return (
    <>
      <h1>Your updates</h1>
      {actionError && <ErrorState error={actionError} />}
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} />
      ) : result.data.length ? (
        result.data.map((n) => (
          <div className="panel" key={n.id}>
            <Link to={n.href}>
              {n.title} <ArrowRight size={16} />
            </Link>
            <p className="small muted">{formatTime(n.createdAt)}</p>
            {!n.readAt && (
              <button
                className="text-button"
                onClick={() =>
                  void post('/notifications/read', { id: n.id })
                    .then(() => result.refetch())
                    .catch(setActionError)
                }
              >
                Mark read
              </button>
            )}
          </div>
        ))
      ) : (
        <div className="empty">
          <Bell size={36} />
          <h2>You’re all caught up.</h2>
          <p>Booking updates appear here after the server records them.</p>
        </div>
      )}
    </>
  );
}
function SettingsPanel() {
  const { pathname } = useLocation();
  const me = useUser();
  const qc = useQueryClient();
  const [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState('');
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<{ id: string; createdAt: string; lastSeenAt: string }[]>('/auth/sessions'),
  });
  const preferences = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api<{ publicProfile: boolean; emailNotifications: boolean }>('/auth/preferences'),
  });
  async function submit(event: FormEvent<HTMLFormElement>, path: string) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body =
      path === 'preferences'
        ? {
            publicProfile: f.get('publicProfile') === 'on',
            emailNotifications: f.get('emailNotifications') === 'on',
          }
        : Object.fromEntries(f);
    try {
      const result = await post<{ message: string }>(`/auth/${path}`, body);
      setMessage(result.message);
      if (path === 'change-password') await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      setError(e as Error);
    }
  }
  return (
    <>
      <h1>Account settings</h1>
      <p>
        <Link to="/app/settings/verification">Contact information & verification</Link> ·{' '}
        <Link to="/app/settings/preferences">Player preferences</Link> ·{' '}
        <Link to="/app/applications">Facility applications</Link>
      </p>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <div className="panel">
        <h2>{me.data?.user?.nickname}</h2>
        <p>{me.data?.user?.email}</p>
        <p className="small muted">
          Email is private. Adult eligibility is self-declared, not verified identity.
        </p>
      </div>
      {!pathname.endsWith('security') && (
        <div className="panel">
          <h2>Privacy & notifications</h2>
          {preferences.data && (
            <form onSubmit={(e) => void submit(e, 'preferences')}>
              <label className="checkbox">
                <input type="checkbox" name="publicProfile" defaultChecked={preferences.data.publicProfile} />
                Allow nickname on future public profile (profiles are not published yet)
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="emailNotifications"
                  defaultChecked={preferences.data.emailNotifications}
                />
                Email me booking updates
              </label>
              <button className="btn">Save preferences</button>
            </form>
          )}
          <hr />
          <button
            className="text-button"
            onClick={() => {
              if (window.confirm('Record an account-deletion request for manual review?'))
                void post<{ message: string }>('/auth/deletion-request')
                  .then((r) => setMessage(r.message))
                  .catch((e) => setError(e));
            }}
          >
            Request account deletion
          </button>
        </div>
      )}
      <MfaPanel />
      <div className="panel">
        <h2>Change password</h2>
        <form onSubmit={(e) => void submit(e, 'change-password')}>
          <label>
            Current password
            <input required type="password" name="currentPassword" autoComplete="current-password" />
          </label>
          <label>
            New password
            <input
              required
              type="password"
              minLength={12}
              maxLength={128}
              name="password"
              autoComplete="new-password"
            />
          </label>
          <button className="btn">Change password & revoke sessions</button>
        </form>
      </div>
      <div className="panel">
        <h2>Active sessions</h2>
        {sessions.error && <ErrorState error={sessions.error} />}{' '}
        {sessions.data?.map((s) => (
          <div className="court-row" key={s.id}>
            <div>
              <strong>Signed in {formatTime(s.createdAt)}</strong>
              <p>Last active {formatTime(s.lastSeenAt)}</p>
            </div>
            <button
              className="btn secondary compact"
              onClick={() =>
                void api(`/auth/sessions/${s.id}`, { method: 'DELETE', body: '{}' })
                  .then(() => {
                    void sessions.refetch();
                    void qc.invalidateQueries({ queryKey: ['me'] });
                  })
                  .catch(setError)
              }
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
function Operations() {
  const { pathname } = useLocation();
  const [checkInMode, setCheckInMode] = useState('reference');
  const paymentOnly = pathname.endsWith('/payment-entry');
  const staffMode = pathname.startsWith('/staff');
  const adminRequests = pathname === '/admin/booking-requests';
  const bookings = useQuery({
    queryKey: ['operations', adminRequests ? 'pending' : 'all'],
    queryFn: () => api<Booking[]>(`/operations/bookings${adminRequests ? '?status=PENDING' : ''}`),
  });
  const facilities = useQuery({
    queryKey: ['my-facilities'],
    queryFn: () =>
      api<{ facility: Facility; role: string; permissions: string[] }[]>('/operations/facilities'),
  });
  const [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ message: string }>(path, body);
      setMessage(result.message);
      await bookings.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  if (bookings.isPending || facilities.isPending) return <Loading />;
  if (bookings.error || facilities.error) return <ErrorState error={(bookings.error ?? facilities.error)!} />;
  if (pathname.endsWith('/activity')) return <AuditView path="/operations/audit" />;
  const assigned = facilities.data.filter((m) => m.role === (staffMode ? 'STAFF' : 'OWNER'));
  const can = (facilityId: string, permission: string) =>
    assigned.some(
      (m) => m.facility.id === facilityId && (m.role === 'OWNER' || m.permissions.includes(permission)),
    );
  const rows = bookings.data.filter((b) => can(b.court.facility.id, paymentOnly ? 'PAYMENTS' : 'BOOKINGS'));
  return (
    <>
      <div className="eyebrow dark">FACILITY OPERATIONS</div>
      <h1>
        {adminRequests
          ? 'Booking requests for assigned facilities'
          : pathname.endsWith('check-in')
            ? 'Welcome players in.'
            : pathname.endsWith('facilities')
              ? 'Your facilities'
              : pathname.endsWith('payments')
                ? 'Payment records'
                : 'The day’s game plan.'}
      </h1>
      {adminRequests && (
        <p className="notice">
          Review up to 100 pending player requests at facilities where you have an owner assignment. Admin
          oversight of other facilities remains available under Bookings. Confirmation rechecks availability,
          price and policy before reserving the court.
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <div className="stats-grid">
        <div className="panel">
          <span>Pending requests</span>
          <strong>{rows.filter((b) => b.status === 'PENDING').length}</strong>
        </div>
        <div className="panel">
          <span>Confirmed reservations</span>
          <strong>{rows.filter((b) => b.status === 'CONFIRMED').length}</strong>
        </div>
        <div className="panel">
          <span>Recorded full payments</span>
          <strong>
            {formatMoney(
              rows
                .flatMap((b) => b.paymentRecords ?? [])
                .filter((p) => p.state === 'PAID')
                .reduce((a, p) => a + p.amountCentavos, 0),
            )}
          </strong>
        </div>
      </div>
      <p className="small muted">
        Counts cover the latest 100 assigned bookings. Recorded payments are external records, not audited
        revenue.
      </p>
      {pathname.endsWith('calendar') ? (
        <ScheduleManagement
          facilities={assigned
            .filter((m) => m.role === 'OWNER' || m.permissions.includes('BOOKINGS'))
            .map((m) => m.facility)}
        />
      ) : pathname.endsWith('facilities') ? (
        facilities.data.map(({ facility: f, role }) => (
          <div className="panel" key={f.id}>
            <h2>{f.name}</h2>
            <p>
              {role} · {f.area} · Fictional demo
            </p>
            {f.courts.map((c) => (
              <p key={c.id}>
                {c.name}: {c.sport}, {formatMoney(c.hourlyRate)} / hour
              </p>
            ))}
            <Link to={`/facilities/${f.slug}`}>View published details</Link>
          </div>
        ))
      ) : pathname.endsWith('check-in') ? (
        <div className="panel">
          <h2>Controlled reference lookup</h2>
          <p>
            Use the player’s booking reference or a QR token from an authorized scanner. Facility, time-window
            and replay checks apply to both methods.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action('/operations/check-in', Object.fromEntries(new FormData(e.currentTarget)));
            }}
          >
            <label>
              Assigned facility
              <select required name="facilityId">
                {assigned
                  .filter((m) => m.role === 'OWNER' || m.permissions.includes('ATTENDANCE'))
                  .map(({ facility: f }) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Check-in method
              <select value={checkInMode} onChange={(e) => setCheckInMode(e.target.value)}>
                <option value="reference">Booking reference</option>
                <option value="token">QR token</option>
              </select>
            </label>
            <label>
              {checkInMode === 'reference' ? 'Booking reference' : 'QR token'}
              <input
                key={checkInMode}
                required
                name={checkInMode}
                type={checkInMode === 'token' ? 'password' : 'text'}
                autoComplete="off"
              />
            </label>
            <button className="btn" disabled={busy}>
              {checkInMode === 'reference' ? 'Check in by reference' : 'Validate QR and check in'}
            </button>
          </form>
          <p className="small muted">
            Built-in camera scanning is not implemented. A supplied QR token is validated by the authenticated
            API and is never displayed in attendance records.
          </p>
        </div>
      ) : (
        <div>
          {rows.length ? (
            rows.map((b) => (
              <div className="panel" key={b.id}>
                <div className="section-title">
                  <div>
                    <span className={`badge ${b.status.toLowerCase()}`}>{b.status}</span>
                    <h3>
                      {b.court.facility.name} · {b.court.name}
                    </h3>
                    <p>
                      {formatTime(b.startsAt)} – {formatTime(b.endsAt)}
                    </p>
                    <small>{b.reference}</small>
                  </div>
                  <strong>{formatMoney(b.totalCentavos)}</strong>
                </div>
                {!paymentOnly && can(b.court.facility.id, 'BOOKINGS') && b.status === 'PENDING' && (
                  <div className="button-row">
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        const reason = adminRequests
                          ? window.prompt('Reason for confirming this booking (at least 3 characters)')
                          : 'Approved by authorized facility operator.';
                        if (
                          !reason ||
                          reason.trim().length < 3 ||
                          (adminRequests &&
                            !window.confirm(`Confirm booking ${b.reference}? This reserves the court time.`))
                        )
                          return;
                        void action(`/operations/bookings/${b.id}/decision`, {
                          status: 'CONFIRMED',
                          reason,
                        });
                      }}
                    >
                      Confirm request
                    </button>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(
                          'Reason for rejecting this request (at least 3 characters)',
                        );
                        if (reason && (!adminRequests || window.confirm(`Reject booking ${b.reference}?`)))
                          void action(`/operations/bookings/${b.id}/decision`, {
                            status: 'REJECTED',
                            reason,
                          });
                      }}
                    >
                      Reject request
                    </button>
                  </div>
                )}
                {!paymentOnly &&
                  can(b.court.facility.id, 'BOOKINGS') &&
                  b.rescheduleRequests
                    ?.filter((r) => r.state === 'PENDING')
                    .map((r) => (
                      <div className="notice" key={r.id}>
                        <strong>Schedule change requested</strong>
                        <p>
                          {formatTime(r.startsAt)} to {formatTime(r.endsAt)} · {r.reason}
                        </p>
                        <div className="button-row">
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() =>
                              void action(`/operations/reschedules/${r.id}/decision`, {
                                approve: true,
                                reason: 'Schedule change approved by facility operator.',
                              })
                            }
                          >
                            Approve schedule change
                          </button>
                          <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() =>
                              void action(`/operations/reschedules/${r.id}/decision`, {
                                approve: false,
                                reason: 'Requested schedule change declined by facility operator.',
                              })
                            }
                          >
                            Keep original schedule
                          </button>
                        </div>
                      </div>
                    ))}
                {can(b.court.facility.id, 'PAYMENTS') &&
                  b.status === 'CONFIRMED' &&
                  !b.paymentRecords?.some((p) => p.state === 'PAID') && (
                    <form
                      className="payment-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(`/operations/bookings/${b.id}/payment`, {
                          ...Object.fromEntries(new FormData(e.currentTarget)),
                          amountCentavos: b.totalCentavos,
                        });
                      }}
                    >
                      <label>
                        Payment method
                        <select name="method">
                          <option value="CASH">Cash at facility</option>
                          <option value="BANK">External bank transfer</option>
                          <option value="EWALLET">External e-wallet</option>
                        </select>
                      </label>
                      <label>
                        Receipt / record reference
                        <input required minLength={3} maxLength={80} name="reference" />
                      </label>
                      <button className="btn secondary" disabled={busy}>
                        Record verified full payment
                      </button>
                    </form>
                  )}
                {b.paymentRecords?.some((p) => p.state === 'PAID') && (
                  <p className="notice success">Full external payment recorded.</p>
                )}
                {!paymentOnly &&
                  can(b.court.facility.id, 'BOOKINGS') &&
                  b.status === 'CONFIRMED' &&
                  new Date(b.endsAt) <= new Date() && (
                    <div className="button-row">
                      {['COMPLETED', 'NO_SHOW'].map((status) => (
                        <button
                          key={status}
                          className="btn secondary"
                          disabled={busy}
                          onClick={() =>
                            void action(`/operations/bookings/${b.id}/decision`, {
                              status,
                              reason: 'Attendance reviewed after booking end.',
                            })
                          }
                        >
                          Mark {status.toLowerCase().replaceAll('_', ' ')}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ))
          ) : (
            <div className="empty">
              <h2>No assigned requests yet.</h2>
              <p>Players’ requests for your assigned facility appear here.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
function ScheduleManagement({ facilities }: { facilities: Facility[] }) {
  return <CourtCalendar facilities={facilities} />;
}
function AuditView({ path }: { path: string }) {
  const result = useQuery({
    queryKey: ['audit', path],
    queryFn: () =>
      api<{ id: string; action: string; outcome: string; createdAt: string; correlationId: string }[]>(path),
  });
  return (
    <>
      <h1>Audit history</h1>
      <p className="muted">Latest 100 events. Runtime access is read/append only.</p>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time (PHT)</th>
                <th>Action</th>
                <th>Outcome</th>
                <th>Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((a) => (
                <tr key={a.id}>
                  <td>{formatTime(a.createdAt)}</td>
                  <td>{a.action}</td>
                  <td>{a.outcome}</td>
                  <td className="small">{a.correlationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
