import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, formatTime } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading } from './main';
import { RoleRecords, AdminBookingReview, AccountWorkspaceSettings } from './role-workspaces';

type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Event = {
  id: string;
  actorId: string | null;
  actor?: string;
  action: string;
  outcome: string;
  reason?: string;
  resourceId?: string;
  correlationId: string;
  createdAt: string;
};
type History = { id: string; actorId: string; action: string; reason: string; createdAt: string };
type Row = {
  id: string;
  state?: string;
  createdAt: string;
  facility?: { name: string; area: string };
  nickname?: string;
  email?: string;
  role?: string;
  suspendedAt?: string | null;
  category?: string;
  targetType?: string;
  severity?: string;
  rule?: string;
};
type Detail = Row & {
  history: History[];
  applicantMessage?: string;
  applicant?: {
    nickname: string;
    id: string;
    verifiedAt?: string | null;
    phoneVerifiedAt?: string | null;
    suspendedAt?: string | null;
  };
  draftId?: string | null;
  draft?: {
    relationship: string;
    idType: string | null;
    data: { facilityPhone?: string; facilityEmail?: string; evidenceExplanation?: string };
  } | null;
  documents?: { id: string; kind: string; createdAt: string; expiresAt: string; deletedAt: string | null }[];
  reporter?: { nickname: string; id: string };
  verifiedAt?: string;
  mfaEnabled?: boolean;
  details?: string;
  resolution?: string;
  note?: string;
  explanation?: string;
  events?: Event[];
  targetId?: string;
  facility?: {
    name: string;
    area: string;
    address: string;
    description: string;
    amenities?: string[];
    latitude: number;
    longitude: number;
    openHour: number;
    closeHour: number;
    cancellationPolicy: string;
    status: string;
    courts: { id: string; name: string; sport: string; hourlyRate: number; capacity: number }[];
  };
};
export default function Admin() {
  const { pathname } = useLocation();
  const [, , section, id] = pathname.split('/');
  return (
    <>
      <div className="admin-intro">
        <span className="eyebrow dark">AUTHORIZED TEAM WORKSPACE</span>
        <p className="small muted">
          Use access only for an assigned administrative purpose.{' '}
          <Link to="/security">Security & acceptable use</Link>
        </p>
      </div>
      {!section ? (
        <Overview />
      ) : ['facilities', 'bookings', 'payments'].includes(section) ? (
        section === 'bookings' && id ? (
          <AdminBookingReview id={id} />
        ) : (
          <RoleRecords key={section} mode="admin" section={section} />
        )
      ) : section === 'settings' ? (
        <AccountWorkspaceSettings />
      ) : section === 'health' ? (
        <Health />
      ) : section === 'audit' ? (
        <Audit id={id} />
      ) : ['applications', 'users', 'reports', 'alerts'].includes(section) ? (
        id ? (
          <RecordDetail key={`${section}-${id}`} section={section} id={id} />
        ) : (
          <RecordList key={section} section={section} />
        )
      ) : (
        <div className="panel">
          <h1>Admin page not found</h1>
          <Link to="/admin">Return to overview</Link>
        </div>
      )}
    </>
  );
}
function Overview() {
  const result = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () =>
      api<{
        pendingApplications: number;
        openReports: number;
        unresolvedAlerts: number;
        publishedFacilities: number;
        registeredUsers: number;
        paymentRecords: number;
        recentActions: { id: string; action: string; outcome: string; createdAt: string }[];
        checkedAt: string;
      }>('/admin/overview'),
    refetchInterval: 30000,
  });
  return (
    <>
      <h1>Administration overview</h1>
      <div className="button-row">
        <Link className="btn" to="/admin/booking-requests">
          Review pending booking requests
        </Link>
        <Link className="btn secondary" to="/admin/bookings">
          All booking history
        </Link>
      </div>
      <p className="muted">Current database counts. Review records before making a decision.</p>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          <div className="stats-grid">
            {(
              [
                ['Published facilities', result.data.publishedFacilities, '/admin/facilities'],
                ['Registered accounts', result.data.registeredUsers, '/admin/users'],
                ['External payment records', result.data.paymentRecords, '/admin/payments'],
              ] as const
            ).map(([label, value, href]) => (
              <Link className="panel" key={href} to={href}>
                <span>{label}</span>
                <strong>{value}</strong>
              </Link>
            ))}
          </div>
          <h2>Review queue</h2>
          <p className="muted">
            Applications, user concerns and alerts awaiting a human decision. Review evidence before taking
            action.
          </p>
          <div className="stats-grid">
            {[
              [
                'applications',
                'Facility applications',
                result.data.pendingApplications,
                'Pending, under review or awaiting clarification.',
              ],
              ['reports', 'Open reports', result.data.openReports, 'Open or actively being reviewed.'],
              [
                'alerts',
                'Unresolved alerts',
                result.data.unresolvedAlerts,
                'Open or acknowledged; not yet resolved.',
              ],
            ].map(([href, label, count, definition]) => (
              <Link className="panel admin-stat-card" key={href} to={`/admin/${href}`}>
                <span>{label}</span>
                <strong>{count}</strong>
                <p className="small">{definition}</p>
              </Link>
            ))}
          </div>
          <p className="small muted">Checked {formatTime(result.data.checkedAt)}</p>
          <section className="panel">
            <h2>Recent administrative activity</h2>
            {result.data.recentActions.length ? (
              result.data.recentActions.map((action) => (
                <p key={action.id}>
                  <Link to={`/admin/audit/${action.id}`}>{action.action.replaceAll('_', ' ')}</Link> ·{' '}
                  {action.outcome} · {formatTime(action.createdAt)}
                </p>
              ))
            ) : (
              <p>No administrative activity recorded yet.</p>
            )}
            <Link to="/admin/audit">Search full audit history →</Link>
          </section>
          <div className="button-row">
            <Link className="btn secondary" to="/admin/payments">
              Inspect external payments
            </Link>
            <Link className="btn secondary" to="/admin/health">
              Check operational status
            </Link>
          </div>
        </>
      )}
      <p className="notice">
        Alerts are signals for human review, not evidence of an attack. Reports are considered fairly; no
        restriction is applied automatically.
      </p>
      <p>
        Exports and file downloads are disabled. Search and inspect only the records needed for your review.
      </p>
    </>
  );
}
const titles: Record<string, string> = {
  applications: 'Facility applications',
  users: 'User access',
  reports: 'Reports',
  alerts: 'Security alerts',
};
const states: Record<string, string[]> = {
  applications: ['PENDING', 'UNDER_REVIEW', 'CLARIFICATION', 'APPROVED', 'REJECTED', 'SUSPENDED'],
  reports: ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'],
  alerts: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'],
  users: [],
};
function RecordList({ section }: { section: string }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [state, setState] = useState('');
  const query = new URLSearchParams({ page: String(page), q: search, ...(state ? { state } : {}) });
  const result = useQuery({
    queryKey: ['admin', section, page, search, state],
    queryFn: () => api<Page<Row>>(`/admin/${section}?${query}`),
  });
  return (
    <>
      <h1>{titles[section]}</h1>
      {section === 'alerts' && (
        <p className="notice">
          These rules identify events to investigate. Severity indicates review priority, not guilt or proof
          of an attack.
        </p>
      )}
      {section === 'users' && (
        <p>
          Restriction blocks sign-in and revokes sessions. Existing bookings and financial history remain.
          Restoration requires another recorded decision. Admin grants are limited to the documented local
          operator command.
        </p>
      )}
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(String(new FormData(e.currentTarget).get('q') ?? ''));
          setPage(1);
        }}
      >
        <label>
          {section === 'users'
            ? 'Search nickname or email'
            : section === 'applications'
              ? 'Search facility name'
              : section === 'reports'
                ? 'Search category'
                : 'Search rule'}
          <input name="q" maxLength={100} type="search" />
        </label>
        {states[section]!.length > 0 && (
          <label>
            Status
            <select
              aria-label="Status"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {states[section]!.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <button className="btn compact">Search</button>
      </form>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          {!result.data.items.length && <p className="panel">No matching records.</p>}
          {result.data.items.map((r) => (
            <Link className="panel admin-record" key={r.id} to={`/admin/${section}/${r.id}`}>
              <div>
                <h2>{r.facility?.name ?? r.nickname ?? r.category ?? r.rule}</h2>
                <p className="small">{r.facility?.area ?? r.email ?? r.targetType ?? r.severity}</p>
                <p className="small muted">{formatTime(r.createdAt)}</p>
              </div>
              <span className="badge">{r.state ?? (r.suspendedAt ? 'RESTRICTED' : r.role)}</span>
              <span className="text-link">Inspect record</span>
            </Link>
          ))}
          <Pagination data={result.data} setPage={setPage} />
        </>
      )}
    </>
  );
}
export function Pagination({
  data,
  setPage,
}: {
  data: { page: number; pageSize: number; total: number };
  setPage: (page: number) => void;
}) {
  return (
    <nav className="community-actions" aria-label="Results pages">
      <button
        className="btn secondary compact"
        disabled={data.page <= 1}
        onClick={() => setPage(data.page - 1)}
      >
        Previous
      </button>
      <span>
        Page {data.page} · {data.total} records
      </span>
      <button
        className="btn secondary compact"
        disabled={data.page * data.pageSize >= data.total}
        onClick={() => setPage(data.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
export function DecisionForm({
  endpoint,
  field,
  choices,
  label,
  explanation,
  evidenceReview = false,
}: {
  endpoint: string;
  field: string;
  choices: { value: string; label: string }[];
  label: string;
  explanation: string;
  evidenceReview?: boolean;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const result = await post<{ message: string }>(endpoint, {
        [field]: field === 'restricted' ? values.get('action') === 'true' : values.get('action'),
        reason: values.get('reason'),
        confirmed: values.get('confirmed') === 'on',
        ...(evidenceReview
          ? {
              identityReviewed: values.get('identityReviewed') === 'on',
              facilityReviewed: values.get('facilityReviewed') === 'on',
            }
          : {}),
      });
      setMessage(result.message);
      form.reset();
      await client.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel admin-decision" onSubmit={submit}>
      <h2>{label}</h2>
      <p>{explanation}</p>
      {error && <ErrorState error={error} />}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      <label>
        Decision
        <select name="action" aria-label="Decision" required>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reason
        <textarea
          name="reason"
          minLength={10}
          maxLength={1000}
          required
          placeholder="Record the evidence considered and a fair reason. Do not include passwords, tokens or unnecessary personal details."
        />
      </label>
      {evidenceReview && (
        <>
          <label className="checkbox">
            <input type="checkbox" name="identityReviewed" />I reviewed the submitted identity evidence.
          </label>
          <label className="checkbox">
            <input type="checkbox" name="facilityReviewed" />I reviewed facility existence and representation
            authority.
          </label>
        </>
      )}
      <label className="checkbox-label">
        <input type="checkbox" name="confirmed" required />I confirm this action for the record shown above
        and have reviewed its impact.
      </label>
      <button className="btn" disabled={busy}>
        {busy ? 'Recording…' : 'Record decision'}
      </button>
    </form>
  );
}
function HistoryView({ rows }: { rows: History[] }) {
  return (
    <section className="panel">
      <h2>Decision history</h2>
      <p className="small muted">Latest 50 immutable decisions, newest first.</p>
      {rows.length ? (
        rows.map((h) => (
          <article className="admin-history" key={h.id}>
            <strong>{h.action}</strong>
            <p className="game-rules">{h.reason}</p>
            <p className="small break-all">
              Actor {h.actorId} · {formatTime(h.createdAt)}
            </p>
          </article>
        ))
      ) : (
        <p>No decisions recorded yet.</p>
      )}
    </section>
  );
}
function RecordDetail({ section, id }: { section: string; id: string }) {
  const result = useQuery({
    queryKey: ['admin', section, id],
    queryFn: () => api<Detail>(`/admin/${section}/${id}`),
  });
  if (result.isPending) return <Loading />;
  if (result.error) return <ErrorState error={result.error} retry={() => void result.refetch()} />;
  const r = result.data;
  let action: ReactNode = null;
  if (
    section === 'applications' &&
    ['PENDING', 'UNDER_REVIEW', 'CLARIFICATION', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(r.state!)
  )
    action = (
      <DecisionForm
        endpoint={`/admin/applications/${id}/decision`}
        field="action"
        choices={
          r.draftId
            ? r.state === 'PENDING'
              ? [{ value: 'START_REVIEW', label: 'Start review' }]
              : r.state === 'APPROVED'
                ? [{ value: 'SUSPEND', label: 'Suspend facility application' }]
                : ['REJECTED', 'SUSPENDED'].includes(r.state!)
                  ? [{ value: 'REOPEN', label: 'Reopen for review' }]
                  : r.state === 'UNDER_REVIEW'
                    ? [
                        { value: 'CLARIFY', label: 'Request more information' },
                        { value: 'APPROVE', label: 'Approve and publish facility' },
                        { value: 'REJECT', label: 'Reject application' },
                      ]
                    : [{ value: 'REJECT', label: 'Reject application' }]
            : r.state === 'PENDING'
              ? [
                  { value: 'CLARIFY', label: 'Request clarification' },
                  { value: 'APPROVE', label: 'Approve and publish facility' },
                  { value: 'REJECT', label: 'Reject application' },
                ]
              : [{ value: 'REJECT', label: 'Reject application' }]
        }
        label="Application decision"
        evidenceReview={!!r.draftId && r.state === 'UNDER_REVIEW'}
        explanation="Approval publishes this facility and grants its applicant facility-owner permissions. A reviewer cannot decide their own application. This is an administrative review, not a guarantee of safety or legitimacy. The reason is shared with the applicant."
      />
    );
  if (section === 'users')
    action = (
      <DecisionForm
        endpoint={`/admin/users/${id}/restriction`}
        field="restricted"
        choices={[
          {
            value: String(!r.suspendedAt),
            label: r.suspendedAt ? 'Restore account access' : 'Restrict account access',
          },
        ]}
        label="Account restriction"
        explanation="A restriction blocks all account access and revokes existing sessions without cancelling bookings or deleting records. It remains until explicitly restored. Self-restriction and removing the last usable admin are prohibited. Record a reviewable reason; alerts alone do not establish abuse."
      />
    );
  if (section === 'reports')
    action = (
      <DecisionForm
        endpoint={`/admin/reports/${id}/decision`}
        field="state"
        choices={(['RESOLVED', 'DISMISSED'].includes(r.state!)
          ? ['OPEN']
          : ['REVIEWING', 'RESOLVED', 'DISMISSED'].filter((s) => s !== r.state)
        ).map((s) => ({ value: s, label: s === 'OPEN' ? 'Reopen for review' : s }))}
        label="Report decision"
        explanation="Consider supporting facts and the affected users fairly. A decision does not automatically restrict an account. The reason is shared with the reporter; avoid disclosing another user's private information. Another admin must decide your own report."
      />
    );
  if (section === 'alerts' && r.state !== 'RESOLVED')
    action = (
      <DecisionForm
        endpoint={`/admin/alerts/${id}/decision`}
        field="state"
        choices={[
          {
            value: r.state === 'OPEN' ? 'ACKNOWLEDGED' : 'RESOLVED',
            label: r.state === 'OPEN' ? 'Acknowledge for review' : 'Resolve with review notes',
          },
        ]}
        label="Alert review"
        explanation="Inspect the supporting events. Acknowledge before resolving, and explain your finding, including benign causes or uncertainty. This action does not restrict any account."
      />
    );
  return (
    <>
      <Link className="text-link" to={`/admin/${section}`}>
        Back to {titles[section]}
      </Link>
      <h1>{r.facility?.name ?? r.nickname ?? r.category ?? r.rule}</h1>
      <p className="small break-all">Record {r.id}</p>
      <span className="badge">{r.state ?? (r.suspendedAt ? 'RESTRICTED' : 'ACTIVE')}</span>
      <section className="panel">
        {section === 'applications' && r.facility && (
          <>
            <h2>Submitted facility</h2>
            {r.draft && (
              <>
                <p>
                  Relationship: {r.draft.relationship} · ID: {r.draft.idType ?? 'Not supplied'}
                </p>
                <p>
                  Facility contact: {r.draft.data.facilityPhone} · {r.draft.data.facilityEmail}
                </p>
                <p>Supporting evidence explanation: {r.draft.data.evidenceExplanation ?? 'None'}</p>
                <p>
                  Contact checks: see verification status below; uploads alone do not establish authenticity.
                </p>
                {r.state === 'UNDER_REVIEW' &&
                  r.documents
                    ?.filter((d) => !d.deletedAt)
                    .map((d) => <SecureDocument key={d.id} applicationId={id} document={d} />)}
              </>
            )}
            <p>
              {r.facility.address} · {r.facility.area}
            </p>
            <p className="game-rules">{r.facility.description}</p>
            <p>Amenities: {r.facility.amenities?.join(', ') || 'None supplied'}</p>
            <p>
              Location: {r.facility.latitude}, {r.facility.longitude}. Hours (PHT): {r.facility.openHour}:00–
              {r.facility.closeHour}:00.
            </p>
            <p>Applicant: {r.applicant?.nickname}</p>
            <p>
              Email: {r.applicant?.verifiedAt ? 'Verified' : 'Not verified'} · Mobile:{' '}
              {r.applicant?.phoneVerifiedAt ? 'Verified' : 'Not verified'} · Account:{' '}
              {r.applicant?.suspendedAt ? 'Restricted' : 'Active'}
            </p>
            <p>Publication state: {r.facility.status}</p>
            <h3>Cancellation policy</h3>
            <p className="game-rules">{r.facility.cancellationPolicy}</p>
            {r.facility.courts.map((c) => (
              <p key={c.id}>
                {c.name} · {c.sport} · {formatMoney(c.hourlyRate)}/hour · capacity {c.capacity}
              </p>
            ))}
            <h3>Applicant clarification</h3>
            <p className="game-rules">{r.applicantMessage || 'No clarification submitted.'}</p>
          </>
        )}
        {section === 'users' && (
          <dl className="booking-info">
            <dt>Email</dt>
            <dd>{r.email}</dd>
            <dt>Role</dt>
            <dd>{r.role}</dd>
            <dt>Email verified</dt>
            <dd>{r.verifiedAt ? 'Yes' : 'No'}</dd>
            <dt>MFA enrolled</dt>
            <dd>{r.mfaEnabled ? 'Yes' : 'No'}</dd>
            <dt>Restricted since</dt>
            <dd>{r.suspendedAt ? formatTime(r.suspendedAt) : 'Not restricted'}</dd>
          </dl>
        )}
        {section === 'reports' && (
          <>
            <p>Reporter: {r.reporter?.nickname}</p>
            <p>Type: {r.targetType}</p>
            {r.targetId && <p className="break-all">Target reference: {r.targetId}</p>}
            <h2>Submitted report</h2>
            <p className="game-rules">{r.details}</p>
            {r.resolution && (
              <>
                <h3>Latest response</h3>
                <p className="game-rules">{r.resolution}</p>
              </>
            )}
          </>
        )}
        {section === 'alerts' && (
          <>
            <p className="notice">{r.severity} review priority. An alert is not proof of wrongdoing.</p>
            <p>{r.explanation}</p>
            {r.note && <p className="game-rules">Review note: {r.note}</p>}
            <h2>Supporting events</h2>
            <EventTable rows={r.events ?? []} />
          </>
        )}
      </section>
      {action}
      <HistoryView rows={r.history} />
    </>
  );
}
function SecureDocument({
  applicationId,
  document: d,
}: {
  applicationId: string;
  document: { id: string; kind: string; expiresAt: string };
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState<Error | null>(null);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function view() {
    try {
      const r = await fetch(`/api/admin/applications/${applicationId}/documents/${d.id}`, {
        credentials: 'same-origin',
      });
      if (!r.ok) throw new Error((await r.json()).message ?? 'Document unavailable');
      setUrl(URL.createObjectURL(await r.blob()));
    } catch (e) {
      setError(e as Error);
    }
  }
  return (
    <div className="panel">
      <p>
        {d.kind} — Submitted; expires {new Date(d.expiresAt).toLocaleDateString()}
      </p>
      <button className="btn secondary" onClick={() => void view()}>
        View private {d.kind.toLowerCase()} image
      </button>
      {error && <ErrorState error={error} />}
      {url && (
        <>
          <img
            src={url}
            alt={`Private ${d.kind.toLowerCase()} evidence for manual review`}
            style={{ maxWidth: '100%', maxHeight: 600 }}
          />
          <button className="text-button" onClick={() => setUrl('')}>
            Close private image
          </button>
        </>
      )}
    </div>
  );
}
function EventTable({ rows }: { rows: Event[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Time (PHT)</th>
            <th>Actor</th>
            <th>Action / outcome</th>
            <th>Reason / evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{formatTime(e.createdAt)}</td>
              <td className="break-all">{e.actor ?? e.actorId ?? 'System / local operator'}</td>
              <td>
                {e.action}
                <br />
                {e.outcome}
              </td>
              <td>
                <Link className="text-link break-all" to={`/admin/audit/${e.id}`}>
                  View event {e.id}
                </Link>
                <p className="game-rules">{e.reason}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Audit({ id }: { id?: string }) {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState({ q: '', from: '', to: '' });
  const query = new URLSearchParams({
    page: String(page),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  });
  const result = useQuery({
    queryKey: ['admin', 'audit', id, page, filters],
    queryFn: () => api<Page<Event>>(`/admin/audit?${query}`),
    enabled: !id,
  });
  const detail = useQuery({
    queryKey: ['admin', 'audit', id],
    queryFn: () => api<Event>(`/admin/audit/${id}`),
    enabled: !!id,
  });
  if (id)
    return (
      <>
        <Link className="text-link" to="/admin/audit">
          Back to audit history
        </Link>
        <h1>Audit event</h1>
        {detail.isPending ? (
          <Loading />
        ) : detail.error ? (
          <ErrorState error={detail.error} />
        ) : (
          <section className="panel">
            <EventTable rows={[detail.data]} />
            <p className="small break-all">Resource {detail.data.resourceId ?? '—'}</p>
            <p className="small break-all">Correlation {detail.data.correlationId}</p>
          </section>
        )}
      </>
    );
  return (
    <>
      <h1>Audit history</h1>
      <p>
        Read-only, paginated records. Search by action, outcome, resource ID, actor UUID or event UUID. Date
        filters use Philippine Time.
      </p>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setFilters({ q: String(f.get('q')), from: String(f.get('from')), to: String(f.get('to')) });
          setPage(1);
        }}
      >
        <label>
          Search audit
          <input name="q" type="search" maxLength={100} />
        </label>
        <label>
          From date
          <input name="from" type="date" />
        </label>
        <label>
          To date
          <input name="to" type="date" />
        </label>
        <button className="btn compact">Search</button>
      </form>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          {result.data.items.length ? <EventTable rows={result.data.items} /> : <p>No matching events.</p>}
          <Pagination data={result.data} setPage={setPage} />
        </>
      )}
    </>
  );
}
function Health() {
  const result = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () =>
      api<{
        checkedAt: string;
        api: string;
        database: string;
        queryMilliseconds: number;
        uptimeSeconds: number;
        pendingMail: number;
        failedMail: number;
        lastMailDeliveredAt: string | null;
        oldestPendingMailAt: string | null;
        alertWorker: {
          lastSuccessAt: string | null;
          lastFailureAt: string | null;
          recentEventLimitReached: boolean;
        };
        smtp: string;
        exports: string;
        files: string;
      }>('/admin/health'),
    refetchInterval: 30000,
  });
  return (
    <>
      <h1>Operational health</h1>
      <p>
        Measurements from this running application only. No security score or guarantee of availability is
        inferred.
      </p>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <section className="panel">
          <dl className="booking-info">
            <dt>Checked</dt>
            <dd>{formatTime(result.data.checkedAt)}</dd>
            <dt>API</dt>
            <dd>{result.data.api}</dd>
            <dt>Database</dt>
            <dd>
              {result.data.database} ({result.data.queryMilliseconds} ms)
            </dd>
            <dt>Process uptime</dt>
            <dd>{result.data.uptimeSeconds} seconds</dd>
            <dt>Pending mail</dt>
            <dd>{result.data.pendingMail} undelivered messages, including exhausted retries</dd>
            <dt>Exhausted mail retries</dt>
            <dd>{result.data.failedMail} messages with at least 10 attempts</dd>
            <dt>Last mail delivery</dt>
            <dd>
              {result.data.lastMailDeliveredAt
                ? formatTime(result.data.lastMailDeliveredAt)
                : 'No delivery recorded'}
            </dd>
            <dt>Oldest pending mail</dt>
            <dd>{result.data.oldestPendingMailAt ? formatTime(result.data.oldestPendingMailAt) : 'None'}</dd>
            <dt>Last alert rule scan</dt>
            <dd>
              {result.data.alertWorker.lastSuccessAt
                ? formatTime(result.data.alertWorker.lastSuccessAt)
                : 'Not observed in this process yet'}
            </dd>
            <dt>Last alert scan failure</dt>
            <dd>
              {result.data.alertWorker.lastFailureAt
                ? formatTime(result.data.alertWorker.lastFailureAt)
                : 'None observed in this process'}
            </dd>
            <dt>Alert scan coverage</dt>
            <dd>
              {result.data.alertWorker.lastSuccessAt
                ? result.data.alertWorker.recentEventLimitReached
                  ? 'Reached the 5,000-event limit; coverage is partial.'
                  : 'Below the 5,000-event limit for the recent 30-minute window.'
                : 'Not measured yet.'}
            </dd>
            <dt>Exports</dt>
            <dd>{result.data.exports}</dd>
            <dt>Files</dt>
            <dd>{result.data.files}</dd>
          </dl>
          <p>{result.data.smtp}</p>
        </section>
      )}
    </>
  );
}
