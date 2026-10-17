import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, formatTime, type Facility } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading, useUser } from './main';
import { OwnerInvitations } from './onboarding';

export type Access = {
  player: boolean;
  owner: boolean;
  staff: boolean;
  admin: boolean;
  staffPermissions: string[];
};
export const useWorkspaces = (enabled = true) =>
  useQuery({ queryKey: ['workspaces'], queryFn: () => api<Access>('/workspaces'), enabled });
export function WorkspaceSwitcher({ access }: { access: Access }) {
  const { pathname } = useLocation(),
    navigate = useNavigate();
  const current = pathname.startsWith('/owner')
    ? '/owner'
    : pathname.startsWith('/staff')
      ? '/staff'
      : pathname.startsWith('/admin')
        ? '/admin'
        : '/app';
  return (
    <label>
      Switch workspace
      <select value={current} onChange={(e) => navigate(e.target.value)}>
        <option value="/app">Player workspace</option>
        {access.owner && <option value="/owner">Facility owner workspace</option>}
        {access.staff && <option value="/staff">Staff workspace</option>}
        {access.admin && <option value="/admin">Admin workspace</option>}
      </select>
    </label>
  );
}
type BookingRow = {
  id: string;
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalCentavos: number;
  user: { nickname: string };
  court: { name: string; facility: { name: string } };
};
type Row = {
  id: string;
  name?: string;
  area?: string;
  status?: string;
  reference?: string;
  amountCentavos?: number;
  method?: string;
  state?: string;
  verifier?: string;
  actorId?: string;
  createdAt?: string;
  reason?: string;
  action?: string;
  outcome?: string;
  resourceId?: string;
  category?: string;
  rating?: number;
  text?: string;
  membershipRole?: string;
  permissions?: string[];
  user?: { nickname: string; email: string };
  facility?: { name: string };
  memberships?: { role: string; user: { nickname: string }; permissions: string[] }[];
  booking?: BookingRow;
  court?: BookingRow['court'];
  startsAt?: string;
  endsAt?: string;
  totalCentavos?: number;
  history?: { id: string; status: string; actorId: string; reason?: string; createdAt: string }[];
  paymentRecords?: Row[];
};
type PageData = { items: Row[]; total: number; page: number; pageSize: number };
const titles: Record<string, string> = {
  facilities: 'Your facilities',
  staff: 'Authorized staff',
  reviews: 'Facility reviews',
  reports: 'Facility report status',
  payments: 'Payment records',
  reservations: 'Reservations',
  attendance: 'Attendance records',
  activity: 'Facility activity',
  courts: 'Courts',
};

export function RoleRecords({ mode, section }: { mode: 'owner' | 'staff' | 'admin'; section: string }) {
  const [params] = useSearchParams();
  const [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('');
  const [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null);
  const endpoint =
    mode === 'admin'
      ? `/admin/${section}`
      : `/workspaces/${mode}/${section === 'reservations' ? 'bookings' : section === 'courts' ? 'facilities' : section}`;
  const facilityId = params.get('facilityId') ?? '';
  const result = useQuery({
    queryKey: ['role-records', mode, section, page, search, status, facilityId],
    queryFn: () =>
      api<PageData>(
        `${endpoint}?${new URLSearchParams({ page: String(page), q: search, ...(status ? { status } : {}), ...(facilityId ? { facilityId } : {}) })}`,
      ),
  });
  async function publication(id: string, next: string) {
    const reason = window.prompt(`Reason to ${next.toLowerCase()} this facility (at least 10 characters)`);
    if (!reason || !window.confirm(`Confirm facility status: ${next}? Existing reservations remain.`)) return;
    try {
      const r = await post<{ message: string }>(`/admin/facilities/${id}/status`, {
        status: next,
        reason,
        confirmed: true,
      });
      setMessage(r.message);
      await result.refetch();
    } catch (e) {
      setError(e as Error);
    }
  }
  return (
    <>
      <h1>{mode === 'admin' ? `Platform ${section}` : (titles[section] ?? section)}</h1>
      {section === 'payments' && (
        <p>
          External payment records are separate from booking status. PAID means an authorized operator
          recorded a verified full external payment. Refunds and corrections require a separate facility
          review; no money is transferred here.
        </p>
      )}
      {section === 'payments' && mode !== 'admin' && (
        <p>
          <Link className="btn secondary" to={`/${mode}/payment-entry`}>
            Record a verified external payment
          </Link>
        </p>
      )}
      {section === 'reports' && (
        <p>
          Only facility report categories and review status are shown. Report narratives and reporter
          identities remain with the administration team for fair review.
        </p>
      )}
      {section === 'courts' && (
        <p>
          <Link className="btn" to="/scheduler/admin/courts">
            Manage courts and pricing
          </Link>
        </p>
      )}
      <form
        className="button-row"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q);
          setPage(1);
        }}
      >
        <label>
          Search{' '}
          {section === 'bookings' || section === 'reservations' || section === 'payments'
            ? 'booking reference'
            : section}
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        </label>
        <button className="btn secondary">Search</button>
        {['bookings', 'reservations', 'facilities'].includes(section) && (
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {(section === 'facilities'
                ? ['PENDING', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED']
                : ['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW', 'EXPIRED']
              ).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </form>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} />
      ) : (
        <>
          <p className="small muted">
            {result.data.total} records · Page {page}
          </p>
          {!result.data.items.length && (
            <div className="empty">
              <h2>No records found.</h2>
            </div>
          )}
          {result.data.items.map((r) => (
            <article className="panel" key={r.id}>
              <h2>
                {r.name ??
                  r.reference ??
                  r.booking?.reference ??
                  r.user?.nickname ??
                  r.action ??
                  r.category ??
                  'Review'}
              </h2>
              {(r.status || r.state) && <span className="badge">{r.status ?? r.state}</span>}
              {r.area && <p>{r.area}</p>}
              {r.booking && (
                <>
                  <p>
                    {r.booking.court.facility.name} · {r.booking.court.name} · {r.booking.user.nickname}
                  </p>
                  <p>
                    {formatTime(r.booking.startsAt)} – {formatTime(r.booking.endsAt)} · Booking:{' '}
                    {r.booking.status}
                  </p>
                </>
              )}
              {r.court && (
                <p>
                  {r.court.facility.name} · {r.court.name} · {r.user?.nickname}
                </p>
              )}
              {r.startsAt && (
                <p>
                  {formatTime(r.startsAt)} – {formatTime(r.endsAt!)}
                </p>
              )}
              {r.amountCentavos !== undefined && (
                <p>
                  {formatMoney(r.amountCentavos)} · {r.method} · Reference: {r.reference ?? 'None'} · Verified
                  by {r.verifier ?? r.actorId}
                </p>
              )}
              {r.totalCentavos !== undefined && <p>{formatMoney(r.totalCentavos)}</p>}
              {r.createdAt && <p>{formatTime(r.createdAt)}</p>}
              {r.permissions && <p>Permissions: {r.permissions.join(', ') || 'None granted'}</p>}
              {r.user?.email && <p>{r.user.email}</p>}
              {r.rating !== undefined && (
                <p>
                  {r.rating}/5 · {r.text}
                </p>
              )}
              {r.action && (
                <p>
                  {r.outcome} · Actor: {r.actorId ?? 'System'} · Resource: {r.resourceId ?? 'None'} ·{' '}
                  {r.reason}
                </p>
              )}
              {r.memberships && (
                <ul>
                  {r.memberships.map((m, i) => (
                    <li key={i}>
                      {m.role}: {m.user.nickname} {m.role === 'STAFF' ? `(${m.permissions.join(', ')})` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {mode === 'owner' && section === 'facilities' && (
                <>
                  <Link className="btn secondary" to={`/owner/facilities/${r.id}`}>
                    Edit facility details
                  </Link>
                  <FacilityPublicLink id={r.id} />
                </>
              )}
              {mode === 'admin' && section === 'facilities' && (
                <div className="button-row">
                  <button
                    className="btn secondary"
                    onClick={() =>
                      void publication(r.id, r.status === 'PUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED')
                    }
                  >
                    {r.status === 'PUBLISHED' ? 'Unpublish facility' : 'Publish approved facility'}
                  </button>
                  <Link to={`/admin/bookings?facilityId=${r.id}`}>Investigate bookings</Link>
                </div>
              )}
              {mode === 'admin' && section === 'bookings' && (
                <Link to={`/admin/bookings/${r.id}`}>Review booking history</Link>
              )}
            </article>
          ))}
          <div className="button-row">
            <button className="btn secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous page
            </button>
            <button
              className="btn secondary"
              disabled={page * 20 >= result.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next page
            </button>
          </div>
        </>
      )}
      {mode === 'owner' && section === 'staff' && <StaffForm refresh={() => void result.refetch()} />}
      {mode === 'owner' && section === 'staff' && <OwnerInvitations />}
    </>
  );
}
function FacilityPublicLink({ id }: { id: string }) {
  const r = useQuery({
    queryKey: ['owner-facility', id],
    queryFn: () => api<Facility>(`/workspaces/owner/facilities/${id}`),
  });
  return r.data ? (
    <p>
      <Link to={`/facilities/${r.data.slug}`}>View published details</Link>
    </p>
  ) : null;
}
export function RoleOverview({ mode }: { mode: 'owner' | 'staff' }) {
  const r = useQuery({
    queryKey: ['role-overview', mode],
    queryFn: () =>
      api<{
        metrics: { label: string; value: number }[];
        memberships: { facility: { name: string }; permissions: string[]; role: string }[];
      }>(`/workspaces/${mode}/overview`),
  });
  return (
    <>
      <span className="eyebrow dark">{mode === 'owner' ? 'FACILITY OWNER' : 'ASSIGNED STAFF'}</span>
      <h1>{mode === 'owner' ? 'The day’s game plan.' : 'Your daily operations'}</h1>
      {r.isPending ? (
        <Loading />
      ) : r.error ? (
        <ErrorState error={r.error} />
      ) : (
        <>
          <div className="stats-grid">
            {r.data.metrics.map((m) => (
              <div className="panel" key={m.label}>
                <span>{m.label}</span>
                <strong>{m.value}</strong>
              </div>
            ))}
          </div>
          <nav className="button-row" aria-label="Daily workspace actions">
            {(mode === 'owner' || r.data.memberships.some((m) => m.permissions.includes('BOOKINGS'))) && (
              <>
                <Link className="btn" to={`/${mode}/bookings`}>
                  Review booking requests
                </Link>
                <Link className="btn secondary" to={`/${mode}/calendar`}>
                  Open today's schedule
                </Link>
              </>
            )}
            {(mode === 'owner' || r.data.memberships.some((m) => m.permissions.includes('ATTENDANCE'))) && (
              <Link className="btn secondary" to={`/${mode}/check-in`}>
                Check in a player
              </Link>
            )}
            {(mode === 'owner' || r.data.memberships.some((m) => m.permissions.includes('PAYMENTS'))) && (
              <Link className="btn secondary" to={`/${mode}/payments`}>
                Review payment records
              </Link>
            )}
          </nav>
          <p>
            Counts come from assigned facilities and granted permissions. Today uses Philippine time. Pending
            requests do not reserve a slot.
          </p>
          {r.data.memberships.map((m, i) => (
            <div className="panel" key={i}>
              <h2>{m.facility.name}</h2>
              <p>
                {m.role} · {m.permissions.join(', ') || 'No operational permissions granted'}
              </p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
function DecisionFields() {
  return (
    <>
      <label>
        Reason
        <textarea name="reason" required minLength={10} maxLength={1000} />
      </label>
      <label>
        <input type="checkbox" name="confirmed" required /> I confirm this change.
      </label>
    </>
  );
}
export function FacilityEditor({ id }: { id: string }) {
  const r = useQuery({
      queryKey: ['owner-facility', id],
      queryFn: () => api<Facility>(`/workspaces/owner/facilities/${id}`),
    }),
    [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const result = await post<{ message: string }>(`/workspaces/owner/facilities/${id}`, {
        description: f.get('description'),
        address: f.get('address'),
        amenities: String(f.get('amenities'))
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        reason: f.get('reason'),
        confirmed: f.get('confirmed') === 'on',
      });
      setMessage(result.message);
      await r.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Edit facility details</h1>
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      {r.isPending ? (
        <Loading />
      ) : r.error ? (
        <ErrorState error={r.error} />
      ) : (
        <form className="panel" onSubmit={(e) => void submit(e)}>
          <h2>{r.data.name}</h2>
          <label>
            Description
            <textarea
              aria-label="Description"
              required
              name="description"
              minLength={20}
              maxLength={2000}
              defaultValue={r.data.description}
            />
          </label>
          <label>
            Address
            <input required name="address" minLength={10} maxLength={250} defaultValue={r.data.address} />
          </label>
          <label>
            Amenities (comma separated)
            <input name="amenities" defaultValue={r.data.amenities.join(', ')} />
          </label>
          <p>
            Court prices and hours: <Link to="/scheduler/admin/courts">Manage courts</Link>. Listing
            publication remains an administrative decision.
          </p>
          <DecisionFields />
          <button className="btn" disabled={busy}>
            Save facility details
          </button>
        </form>
      )}
    </>
  );
}
function StaffForm({ refresh }: { refresh: () => void }) {
  const facilities = useQuery({
      queryKey: ['staff-owner-facilities'],
      queryFn: () => api<PageData>('/workspaces/owner/facilities'),
    }),
    [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ message: string }>(`/workspaces/owner/facilities/${f.get('facilityId')}/staff`, {
        email: f.get('email'),
        permissions: f.getAll('permissions'),
        remove: f.get('remove') === 'on',
        reason: f.get('reason'),
        confirmed: f.get('confirmed') === 'on',
      });
      setMessage(r.message);
      refresh();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={(e) => void submit(e)}>
      <h2>Add or update staff access</h2>
      <p>
        Use an existing verified account’s exact email. Existing sessions are revoked after any change. This
        form grants staff permissions for one facility.
      </p>
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <label>
        Facility
        <select name="facilityId" required>
          {facilities.data?.items.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Staff account email
        <input type="email" name="email" required />
      </label>
      {['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'].map((p) => (
        <label key={p}>
          <input type="checkbox" name="permissions" value={p} />
          {p}
        </label>
      ))}
      <label>
        <input type="checkbox" name="remove" /> Remove this facility’s staff access
      </label>
      <DecisionFields />
      <button className="btn" disabled={busy}>
        Update staff access
      </button>
    </form>
  );
}
export function AdminBookingReview({ id }: { id: string }) {
  const r = useQuery({ queryKey: ['admin-booking', id], queryFn: () => api<Row>(`/admin/bookings/${id}`) });
  return (
    <>
      <h1>Booking investigation</h1>
      {r.isPending ? (
        <Loading />
      ) : r.error ? (
        <ErrorState error={r.error} />
      ) : (
        <div className="panel">
          <h2>{r.data.reference}</h2>
          <p>
            {r.data.status} · {r.data.court?.facility.name} · {r.data.user?.nickname}
          </p>
          <h3>Booking history</h3>
          {r.data.history?.map((h) => (
            <p key={h.id}>
              {formatTime(h.createdAt)} · {h.status} · Actor: {h.actorId} · {h.reason}
            </p>
          ))}
          <h3>Payment history</h3>
          {r.data.paymentRecords?.length ? (
            r.data.paymentRecords.map((p) => (
              <p key={p.id}>
                {p.state} · {formatMoney(p.amountCentavos!)} · {p.method} · {p.reference} · Verified by{' '}
                {p.actorId} · {formatTime(p.createdAt!)}
              </p>
            ))
          ) : (
            <p>No payment recorded.</p>
          )}
        </div>
      )}
    </>
  );
}
export function AccountWorkspaceSettings() {
  const me = useUser();
  return (
    <>
      <h1>Workspace settings</h1>
      <p>
        Signed in as {me.data?.user?.nickname} ({me.data?.user?.role}). Access is assigned through approved
        facilities, staff permissions or explicit local administrator authorization.
      </p>
      <p>
        <Link to="/app/settings/profile">Profile settings</Link> ·{' '}
        <Link to="/app/settings/security">Account security and MFA</Link> ·{' '}
        <Link to="/security">Security & acceptable use</Link>
      </p>
    </>
  );
}
