import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatTime } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading } from './main';
import { Pagination } from './admin';
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Application = {
  draftId?: string | null;
  id: string;
  state: string;
  applicantMessage: string;
  facility: { name: string; slug: string; status: string };
  latest: { reason: string; createdAt: string } | null;
};
type Report = {
  id: string;
  state: string;
  category: string;
  details: string;
  resolution: string | null;
  createdAt: string;
};
export function Reports() {
  const [page, setPage] = useState(1),
    [kind, setKind] = useState('SECURITY'),
    [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['my-reports', page],
    queryFn: () => api<Page<Report>>(`/reports?page=${page}`),
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      const r = await post<{ message: string }>('/reports', {
        targetType: kind,
        ...(['FACILITY', 'GAME'].includes(kind) ? { targetId: f.get('targetId') } : {}),
        category: f.get('category'),
        details: f.get('details'),
      });
      setMessage(r.message);
      form.reset();
      await list.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>My reports</h1>
      <p>
        Submit a concern and track fair human review.{' '}
        <Link to="/security">Read security & acceptable use</Link>.
      </p>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <form className="panel" onSubmit={(e) => void submit(e)}>
        <h2>Report a concern</h2>
        <label>
          Report about
          <select aria-label="Report about" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="SECURITY">Security or privacy</option>
            <option value="GENERAL">General conduct or account concern</option>
            <option value="FACILITY">Published facility</option>
            <option value="GAME">Game I can access</option>
          </select>
        </label>
        {['FACILITY', 'GAME'].includes(kind) && (
          <label>
            Facility or game ID
            <input name="targetId" required placeholder="UUID reference" />
          </label>
        )}
        <label>
          Category
          <select name="category" aria-label="Category">
            {['Security concern', 'Privacy concern', 'Conduct or abuse', 'Facility concern', 'Other'].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <label>
          What happened?
          <textarea
            name="details"
            required
            minLength={20}
            maxLength={3000}
            placeholder="Describe the page, time and observed issue. Do not include credentials, tokens or unnecessary personal information."
          />
        </label>
        <p className="small muted">
          Up to ten reports per account per day. Reports are visible to authorized admins and your account.
        </p>
        <button className="btn" disabled={busy}>
          Submit report
        </button>
      </form>
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} />
      ) : (
        <>
          {!list.data.items.length && <p>No reports submitted yet.</p>}
          {list.data.items.map((r) => (
            <article className="panel" key={r.id}>
              <h2>{r.category}</h2>
              <span className="badge">{r.state}</span>
              <p className="small break-all">
                Reference {r.id} · {formatTime(r.createdAt)}
              </p>
              <p className="game-rules">{r.details}</p>
              {r.resolution && <p className="notice game-rules">Review response: {r.resolution}</p>}
            </article>
          ))}
          <Pagination data={list.data} setPage={setPage} />
        </>
      )}
    </>
  );
}
export function Applications() {
  const [page, setPage] = useState(1),
    [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['my-applications', page],
    queryFn: () => api<Page<Application>>(`/facility-applications?page=${page}`),
  });
  async function send(path: string, data: unknown) {
    setBusy(true);
    try {
      const r = await post<{ message: string }>(path, data);
      setMessage(r.message);
      await list.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>My facility applications</h1>
      <p>
        Submit facility details for administrative review. Submission never publishes a listing. Approval
        grants owner access, which requires MFA; it does not guarantee the facility’s safety or legitimacy.
      </p>
      {error && <ErrorState error={error} />}{' '}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      <p>
        <Link className="btn" to="/onboarding/facility">
          Apply to list a facility
        </Link>
      </p>
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          {!list.data.items.length && <p>No applications yet.</p>}
          {list.data.items.map((a) => (
            <article className="panel" key={a.id}>
              <h2>{a.facility.name}</h2>
              <span className="badge">{a.state}</span>
              <p className="small break-all">Reference {a.id}</p>
              {a.latest && <p className="notice game-rules">Reviewer response: {a.latest.reason}</p>}
              {a.state === 'APPROVED' && (
                <Link className="btn secondary" to={`/facilities/${a.facility.slug}`}>
                  View approved facility
                </Link>
              )}
              {a.draftId && (
                <p>
                  <Link className="btn secondary" to={`/onboarding/facility/${a.draftId}`}>
                    View verification progress / provide requested evidence
                  </Link>
                </p>
              )}
              {a.state === 'CLARIFICATION' && !a.draftId && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(`/facility-applications/${a.id}/reply`, {
                      message: new FormData(e.currentTarget).get('message'),
                    });
                  }}
                >
                  <label>
                    Clarification response
                    <textarea name="message" minLength={10} maxLength={2000} required />
                  </label>
                  <button className="btn" disabled={busy}>
                    Send clarification
                  </button>
                </form>
              )}
            </article>
          ))}
          <Pagination data={list.data} setPage={setPage} />
        </>
      )}
    </>
  );
}
