import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sports, type Facility } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading, useUser } from './main';
import { FacilityCard } from './public';

type Preferences = {
  sports: string[];
  areas: string[];
  times: string[];
  court: string;
  budgetMin: number | null;
  budgetMax: number | null;
  goals: string[];
  recommendations: boolean;
};
type Status = {
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: string;
  purpose: string | null;
  completed: boolean;
  smsMode: string;
  emailAvailable: boolean;
  preferences: Preferences;
};
type Document = { id: string; kind: string; createdAt: string; expiresAt: string; deletedAt: string | null };
type Draft = {
  id: string;
  stage: string;
  relationship: string;
  idType: string | null;
  data: Record<string, unknown>;
  documents: Document[];
  idTypes: string[];
  application?: { state: string; identityState: string; facilityState: string } | null;
};
export default function Onboarding() {
  const me = useUser(),
    { pathname } = useLocation(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const state = useQuery({
    queryKey: ['onboarding'],
    queryFn: () => api<Status>('/onboarding'),
    enabled: !!me.data?.user,
  });
  const [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState(''),
    [localCode, setLocalCode] = useState(''),
    [busy, setBusy] = useState(false);
  async function action(path: string, data: unknown = {}) {
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ message: string; signInAgain?: boolean }>(`/onboarding/${path}`, data);
      setMessage(r.message);
      if (path === 'sms/verify') setLocalCode('');
      if (r.signInAgain) {
        qc.clear();
        navigate('/login?next=%2Fonboarding');
        return;
      }
      await state.refetch();
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  if (me.isPending) return <Loading />;
  if (!me.data?.user) return <Navigate to="/login?next=%2Fonboarding" replace />;
  if (state.isPending) return <Loading />;
  if (state.error)
    return (
      <section className="container section onboarding">
        <ErrorState error={state.error} />
      </section>
    );
  const s = state.data,
    first = s.emailVerified || s.phoneVerified,
    both = s.emailVerified && s.phoneVerified;
  if (pathname.startsWith('/onboarding/facility'))
    return (
      <section className="container section onboarding">
        <Link to="/onboarding">Account verification</Link>
        <FacilityOnboarding verified={both} />
      </section>
    );
  const settings = pathname.includes('/settings/');
  return (
    <section className="container section onboarding">
      <span className="eyebrow dark">YOUR LAROSENTRY ACCOUNT</span>
      <h1>{settings ? 'Account verification & preferences' : 'Let’s get you ready to play.'}</h1>
      <p>Create account → Verify contacts → Choose purpose → Complete onboarding</p>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <div className="panel">
        <h2>Verify contact information</h2>
        <p>
          Both your email address and mobile number are required. You may choose which one to verify first.
        </p>
        <p>
          <strong>{s.status.replaceAll('_', ' ')}</strong>. Email:{' '}
          {s.emailVerified ? 'Verified' : 'Not verified'} · Mobile:{' '}
          {s.phoneVerified ? 'Verified' : 'Not verified'}
        </p>
        <p>Your mobile number is private and is not shown on public profiles.</p>
        <div className="form-row">
          <div>
            <h3>Verify with email</h3>
            <p>{s.email}</p>
            <button
              className="btn secondary"
              disabled={busy || s.emailVerified || s.emailAvailable === false}
              onClick={() => void action('email/resend')}
            >
              Resend verification email
            </button>
            <p className="small muted">
              {s.emailAvailable === false
                ? 'Email verification is unavailable in this test pilot. No email was sent.'
                : 'Links expire after 24 hours. Queued does not mean delivered; local testing uses Mailpit.'}
            </p>
          </div>
          <div>
            <h3>Verify with SMS</h3>
            <p>{s.phone ?? 'No mobile number added'}</p>
            <button
              className="btn secondary"
              disabled={busy || s.phoneVerified || !s.phone || s.smsMode === 'unavailable'}
              onClick={() => void action('sms/send')}
            >
              Send verification code
            </button>
            {s.smsMode === 'unavailable' && (
              <p className="notice">SMS verification is temporarily unavailable. No SMS was sent.</p>
            )}
            {!s.phoneVerified && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action('sms/verify', { code: new FormData(e.currentTarget).get('code') });
                }}
              >
                <label>
                  SMS verification code
                  <input
                    name="code"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </label>
                <button className="btn" disabled={busy}>
                  Verify mobile
                </button>
              </form>
            )}
            {s.smsMode === 'local' && (
              <>
                <button
                  className="text-button"
                  onClick={() =>
                    void api<{ code: string | null }>('/onboarding/dev-sms')
                      .then((r) => setLocalCode(r.code ?? 'No active code'))
                      .catch(setError)
                  }
                >
                  Open local test inbox
                </button>
                <p className="small muted">
                  Local simulation only; no SMS is sent. Never use this mode for real phone verification.
                </p>
                {localCode && (
                  <p role="status">
                    Local test code: <code>{localCode}</code>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <details>
          <summary>Add or change contact information</summary>
          <p>
            Confirm your password. Changed channels need verification, and all sessions will be revoked. If
            MFA is enabled, verify it first in Security settings.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action('contacts', Object.fromEntries(new FormData(e.currentTarget)));
            }}
          >
            <label>
              Email address
              <input type="email" name="email" defaultValue={s.email} required />
            </label>
            <label>
              Philippine mobile number
              <input
                type="tel"
                name="phone"
                defaultValue={s.phone ?? ''}
                placeholder="+639171234567"
                required
              />
            </label>
            <label>
              Confirm current password
              <input type="password" name="password" autoComplete="current-password" required />
            </label>
            <button className="btn secondary" disabled={busy}>
              Update contact information
            </button>
          </form>
        </details>
      </div>
      {!both && (
        <p className="notice">
          Verify the remaining channel to book, submit facility evidence or use privileged tools. You can
          personalize your account after your first verification.
        </p>
      )}
      {first && (
        <>
          <div className="panel">
            <h2>How will you use LaroSentry?</h2>
            <div className="button-row">
              <button
                className="btn"
                disabled={busy}
                onClick={() => void action('purpose', { purpose: 'PLAYER' })}
              >
                Player — I want to find courts and play.
              </button>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => void action('purpose', { purpose: 'HOST' })}
              >
                Facility owner / court host — I own or represent a sports facility.
              </button>
            </div>
            <p>
              Choosing host records intent only. Facility-specific admin approval is required for owner
              access. Staff receive assignments or invitations; ADMIN is never a signup option.
            </p>
          </div>
          {s.purpose === 'PLAYER' || settings ? (
            <PreferenceForm
              preferences={s.preferences}
              done={async () => {
                await Promise.all([state.refetch(), qc.invalidateQueries({ queryKey: ['me'] })]);
                navigate(both ? '/app' : '/facilities');
              }}
            />
          ) : s.purpose === 'HOST' ? (
            <div className="panel">
              <h2>Verify your facility</h2>
              <p>
                We review contact information, submitted identity evidence, facility details and your
                authority to represent it. Uploads do not prove authenticity.
              </p>
              {both ? (
                <Link className="btn" to="/onboarding/facility">
                  Continue facility verification
                </Link>
              ) : (
                <p>Complete both contact verifications above first.</p>
              )}
            </div>
          ) : null}
        </>
      )}
      {both && s.completed && (
        <p>
          <Link className="btn secondary" to="/app">
            Enter player workspace
          </Link>{' '}
          · <Link to="/app/applications">My facility applications</Link>
        </p>
      )}
      <p>
        <Link to="/facilities">Browse all courts</Link> ·{' '}
        <Link to="/app/settings/security">Security settings</Link> · <Link to="/privacy">Privacy notice</Link>
      </p>
    </section>
  );
}
function PreferenceForm({ preferences: p, done }: { preferences: Preferences; done: () => void }) {
  const [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>, skip = false) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await post(
        '/onboarding/preferences',
        skip
          ? { skip: true }
          : {
              sports: f.getAll('sports'),
              areas: String(f.get('areas') ?? '')
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean),
              times: f.getAll('times'),
              court: f.get('court'),
              budgetMin: f.get('budgetMin') ? Math.round(Number(f.get('budgetMin')) * 100) : null,
              budgetMax: f.get('budgetMax') ? Math.round(Number(f.get('budgetMax')) * 100) : null,
              goals: f.getAll('goals'),
              recommendations: f.get('recommendations') === 'on',
            },
      );
      done();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={(e) => void submit(e)}>
      <h2>Help us personalize your LaroSentry experience.</h2>
      <p>
        Every question is optional. No precise location is required. Preferences never restrict normal search.
      </p>
      {error && <ErrorState error={error} />}
      <fieldset>
        <legend>Sports you play</legend>
        {[...sports, 'Others'].map((v) => (
          <label className="checkbox" key={v}>
            <input type="checkbox" name="sports" value={v} defaultChecked={p.sports.includes(v)} />
            {v}
          </label>
        ))}
      </fieldset>
      <label>
        Preferred cities or areas (comma separated)
        <input
          name="areas"
          maxLength={800}
          defaultValue={p.areas.join(', ')}
          placeholder="Quezon City, Marikina"
        />
      </label>
      <fieldset>
        <legend>When do you usually play?</legend>
        {[
          'Weekday mornings',
          'Weekday afternoons',
          'Weekday evenings',
          'Weekend mornings',
          'Weekend afternoons',
          'Weekend evenings',
        ].map((v) => (
          <label className="checkbox" key={v}>
            <input type="checkbox" name="times" value={v} defaultChecked={p.times.includes(v)} />
            {v}
          </label>
        ))}
      </fieldset>
      <label>
        Court preference
        <select name="court" defaultValue={p.court}>
          {['Indoor', 'Outdoor', 'Covered', 'No preference'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Minimum hourly budget (PHP)
          <input
            name="budgetMin"
            type="number"
            min={0}
            max={10000}
            defaultValue={p.budgetMin === null ? '' : p.budgetMin / 100}
          />
        </label>
        <label>
          Maximum hourly budget (PHP)
          <input
            name="budgetMax"
            type="number"
            min={0}
            max={10000}
            defaultValue={p.budgetMax === null ? '' : p.budgetMax / 100}
          />
        </label>
      </div>
      <fieldset>
        <legend>What are you looking for?</legend>
        {[
          'Book a court',
          'Join public games',
          'Play with friends',
          'Discover new facilities',
          'Compare prices',
        ].map((v) => (
          <label className="checkbox" key={v}>
            <input type="checkbox" name="goals" value={v} defaultChecked={p.goals.includes(v)} />
            {v}
          </label>
        ))}
      </fieldset>
      <label className="checkbox">
        <input type="checkbox" name="recommendations" defaultChecked={p.recommendations} />
        Use preferences for rules-based recommendations
      </label>
      <div className="button-row">
        <button className="btn" disabled={busy}>
          Save preferences
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy}
          onClick={(e) => {
            const form = e.currentTarget.form!;
            void submit(
              { preventDefault: () => {}, currentTarget: form } as FormEvent<HTMLFormElement>,
              true,
            );
          }}
        >
          Skip for now
        </button>
      </div>
    </form>
  );
}
export function Recommendations() {
  const r = useQuery({
    queryKey: ['recommendations'],
    queryFn: () =>
      api<{ items: (Facility & { explanation: string })[]; method: string }>('/onboarding/recommendations'),
  });
  return (
    <>
      <h1>Recommended for you</h1>
      <p>
        Simple rules use your optional sport, area, court and budget preferences.{' '}
        <Link to="/app/settings/preferences">Update preferences</Link> ·{' '}
        <Link to="/facilities">Browse all facilities</Link>
      </p>
      {r.isPending ? (
        <Loading />
      ) : r.error ? (
        <ErrorState error={r.error} />
      ) : (
        <>
          <p className="small muted">{r.data.method}</p>
          <div className="card-grid recommendation-grid">
            {r.data.items.map((f) => (
              <div key={f.id}>
                <FacilityCard facility={f} />
                <p>{f.explanation}</p>
              </div>
            ))}
          </div>
          {!r.data.items.length && <p>No published facilities are available yet.</p>}
        </>
      )}
    </>
  );
}
export function FacilityOnboarding({ verified }: { verified: boolean }) {
  const { pathname } = useLocation(),
    navigate = useNavigate();
  const id = pathname.split('/')[3];
  const list = useQuery({
    queryKey: ['facility-drafts'],
    queryFn: () => api<{ items: { id: string; stage: string }[] }>('/onboarding/drafts'),
    enabled: verified && !id,
  });
  const draft = useQuery({
    queryKey: ['facility-draft', id],
    queryFn: () => api<Draft>(`/onboarding/drafts/${id}`),
    enabled: verified && !!id,
  });
  const [step, setStep] = useState(1),
    [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  async function create() {
    try {
      const d = await post<{ id: string }>('/onboarding/drafts');
      navigate(`/onboarding/facility/${d.id}`);
    } catch (e) {
      setError(e as Error);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      data: Record<string, unknown> = { ...draft.data!.data };
    for (const [key, value] of f.entries()) {
      if (['relationship', 'idType'].includes(key)) continue;
      if (typeof value === 'string' && !value.trim()) {
        delete data[key];
        continue;
      }
      data[key] = ['latitude', 'longitude', 'openHour', 'closeHour', 'hourlyRate', 'capacity'].includes(key)
        ? Number(value)
        : key === 'amenities'
          ? String(value)
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : value;
    }
    setBusy(true);
    try {
      const d = draft.data!;
      await post(`/onboarding/drafts/${id}`, {
        data,
        relationship: f.get('relationship') ?? d.relationship,
        idType: f.get('idType') ?? d.idType,
      });
      setMessage('Draft saved privately.');
      await draft.refetch();
      setStep(step === 1 ? 2 : step);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      file = f.get('file') as File;
    if (file.size > 2 * 1024 * 1024) {
      setError(new Error('Choose a PNG or JPEG image up to 2 MB.'));
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        setMessage('');
        setError(null);
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]!);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await post(`/onboarding/drafts/${id}/documents`, { kind: f.get('kind'), base64 });
      setMessage('Image submitted for verification. It has not been verified.');
      form.reset();
      await draft.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  if (!verified)
    return (
      <>
        <h1>Verify your facility</h1>
        <p>Contact verification required: verify both email and mobile first.</p>
        <Link className="btn" to="/onboarding">
          Verify contacts
        </Link>
      </>
    );
  return (
    <>
      <h1>Verify your facility</h1>
      <p>
        Contact information ✓ · Email ✓ · Mobile ✓ · Identity/facility evidence → Admin review. One government
        ID image is requested only to review identity and authority. Do not submit extra ID numbers or
        unrelated personal information.
      </p>
      {error && <ErrorState error={error} />}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {!id ? (
        <div className="panel">
          <button className="btn" onClick={() => void create()}>
            Start facility draft
          </button>
          {list.data?.items.map((d) => (
            <p key={d.id}>
              <Link to={`/onboarding/facility/${d.id}`}>
                Continue draft {d.id.slice(0, 8)} — {d.stage}
              </Link>
            </p>
          ))}
        </div>
      ) : draft.isPending ? (
        <Loading />
      ) : draft.error ? (
        <ErrorState error={draft.error} />
      ) : (
        <>
          <p>
            Application: {draft.data.application?.state ?? 'DRAFT'} · Identity:{' '}
            {draft.data.application?.identityState ?? 'Not submitted'} · Facility:{' '}
            {draft.data.application?.facilityState ?? 'Not reviewed'}
          </p>
          <div className="button-row">
            {['Facility information', 'Identity & evidence', 'Review & submit'].map((label, i) => (
              <button
                className="btn secondary"
                key={label}
                onClick={() => setStep(i + 1)}
                aria-pressed={step === i + 1}
                disabled={busy}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>
          {draft.data.stage !== 'DRAFT' ? (
            <div className="panel">
              <h2>Submitted for admin review</h2>
              <p>
                Evidence is not automatically verified. Edits become available if more information is
                requested.
              </p>
              <Link to="/app/applications">Track application and decisions</Link>
            </div>
          ) : step === 1 ? (
            <form className="panel" onSubmit={(e) => void save(e)}>
              <h2>Facility information</h2>
              {[
                ['name', 'Facility name'],
                ['area', 'City or area'],
                ['address', 'Facility address'],
                ['description', 'Facility description'],
                ['facilityPhone', 'Facility contact mobile (+63)'],
                ['facilityEmail', 'Facility email (optional)'],
                ['courtName', 'Court name'],
                ['cancellationPolicy', 'Cancellation policy'],
                ['evidenceExplanation', 'Supporting evidence explanation (if owner has no document)'],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input name={name} defaultValue={String(draft.data.data[name!] ?? '')} />
                </label>
              ))}
              <label>
                Amenities (comma separated)
                <input
                  name="amenities"
                  defaultValue={(draft.data.data.amenities as string[] | undefined)?.join(', ') ?? ''}
                />
              </label>
              <div className="form-row">
                {[
                  ['latitude', 'Latitude', 14.6],
                  ['longitude', 'Longitude', 121],
                  ['openHour', 'Opening hour (0–23)', 6],
                  ['closeHour', 'Closing hour (1–24)', 22],
                  ['hourlyRate', 'Hourly price in centavos', 50000],
                  ['capacity', 'Court capacity', 4],
                ].map(([name, label, value]) => (
                  <label key={String(name)}>
                    {label}
                    <input
                      type="number"
                      name={String(name)}
                      step={name === 'latitude' || name === 'longitude' ? 'any' : '1'}
                      defaultValue={Number(draft.data.data[String(name)] ?? value)}
                      required
                    />
                  </label>
                ))}
              </div>
              <label>
                Sport
                <select name="sport" defaultValue={String(draft.data.data.sport ?? 'Basketball')}>
                  {sports.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Relationship to facility
                <select name="relationship" defaultValue={draft.data.relationship}>
                  <option value="OWNER">Owner</option>
                  <option value="MANAGER">Authorized manager</option>
                  <option value="REPRESENTATIVE">Authorized representative</option>
                </select>
              </label>
              <button className="btn" disabled={busy}>
                Save facility information
              </button>
            </form>
          ) : step === 2 ? (
            <div className="panel">
              <h2>Identity & supporting evidence</h2>
              <p>
                PNG/JPEG only, up to 2 MB each. Submit one supported government ID image, facility photo(s),
                and appropriate authority/business evidence. Managers/representatives need authorization
                evidence. Owners may explain why no supporting document applies; an admin decides sufficiency.
                Private encrypted images expire after 30 days, or within seven days of approval/rejection.
              </p>
              <form onSubmit={(e) => void save(e)}>
                <label>
                  Government ID type
                  <select name="idType" required defaultValue={draft.data.idType ?? ''} disabled={busy}>
                    <option value="" disabled>
                      Select supported ID
                    </option>
                    {draft.data.idTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <button className="btn secondary" disabled={busy}>
                  Save ID type
                </button>
              </form>
              <form onSubmit={(e) => void upload(e)}>
                <label>
                  Evidence category
                  <select name="kind" disabled={busy}>
                    <option value="IDENTITY">Government ID — one image</option>
                    <option value="SUPPORT">Authorization / facility supporting document</option>
                    <option value="PHOTO">Facility photo</option>
                  </select>
                </label>
                <label>
                  Evidence image
                  <input name="file" type="file" accept="image/png,image/jpeg" required disabled={busy} />
                </label>
                <button className="btn" disabled={busy}>
                  Upload private image
                </button>
              </form>
              {draft.data.documents
                .filter((d) => !d.deletedAt)
                .map((d) => (
                  <p key={d.id}>
                    {d.kind} — Submitted; expires {new Date(d.expiresAt).toLocaleDateString()}{' '}
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void post(`/onboarding/drafts/${id}/documents/${d.id}/remove`)
                          .then(() => draft.refetch())
                          .catch(setError)
                      }
                    >
                      Remove
                    </button>
                  </p>
                ))}
              <button className="btn secondary" onClick={() => setStep(3)} disabled={busy}>
                Review application
              </button>
            </div>
          ) : (
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                void post<{ message: string }>(`/onboarding/drafts/${id}/submit`)
                  .then(async (r) => {
                    setMessage(r.message);
                    await draft.refetch();
                  })
                  .catch(setError)
                  .finally(() => setBusy(false));
              }}
            >
              <h2>Review & submit</h2>
              <p>
                {String(draft.data.data.name ?? 'Facility information incomplete')} ·{' '}
                {String(draft.data.data.address ?? '')}
              </p>
              <p>
                Relationship: {draft.data.relationship} · ID type: {draft.data.idType ?? 'Required'} · Active
                evidence: {draft.data.documents.filter((d) => !d.deletedAt).length}
              </p>
              <label className="checkbox">
                <input type="checkbox" required />I am authorized to represent this facility and consent to
                private evidence review under the privacy notice.
              </label>
              <button className="btn" disabled={busy}>
                Submit facility for verification
              </button>
            </form>
          )}
        </>
      )}
    </>
  );
}
export function OwnerInvitations() {
  const facilities = useQuery({
      queryKey: ['invite-facilities'],
      queryFn: () => api<{ items: { id: string; name: string }[] }>('/workspaces/owner/facilities'),
    }),
    [selected, setSelected] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  const facilityId = selected || facilities.data?.items[0]?.id;
  const invites = useQuery({
    queryKey: ['staff-invitations', facilityId],
    queryFn: () =>
      api<{
        items: { id: string; email: string; permissions: string[]; state: string; expiresAt: string }[];
      }>(`/workspaces/owner/facilities/${facilityId}/invitations`),
    enabled: !!facilityId,
  });
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await post<{ message: string }>(`/workspaces/owner/facilities/${facilityId}/invitations`, {
        email: f.get('email'),
        permissions: f.getAll('permissions'),
        reason: f.get('reason'),
        confirmed: f.get('confirmed') === 'on',
      });
      setMessage(r.message);
      await invites.refetch();
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <h2>Invite facility staff</h2>
      <p>
        Invite an email address, including someone who has not registered yet. The recipient must verify both
        contacts and accept. No permissions are granted by sending an invitation.
      </p>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <form onSubmit={(e) => void send(e)}>
        <label>
          Invitation facility
          <select value={facilityId ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {facilities.data?.items.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Invitation email
          <input type="email" name="email" required />
        </label>
        {['BOOKINGS', 'PAYMENTS', 'ATTENDANCE'].map((p) => (
          <label className="checkbox" key={p}>
            <input type="checkbox" name="permissions" value={p} />
            Invite {p}
          </label>
        ))}
        <label>
          Invitation reason
          <textarea name="reason" required minLength={10} maxLength={1000} />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="confirmed" required />I confirm this staff invitation.
        </label>
        <button className="btn" disabled={busy || !facilityId}>
          Queue staff invitation
        </button>
      </form>
      {invites.data?.items.map((i) => (
        <p key={i.id}>
          {i.email} · {i.state} · {i.permissions.join(', ')} · expires{' '}
          {new Date(i.expiresAt).toLocaleDateString()}
          {i.state === 'PENDING' && (
            <button
              className="text-button"
              onClick={() => {
                const reason = window.prompt('Reason for revoking this invitation (at least 10 characters)');
                if (reason && window.confirm('Revoke this pending invitation?'))
                  void post<{ message: string }>(
                    `/workspaces/owner/facilities/${facilityId}/invitations/${i.id}/revoke`,
                    { reason, confirmed: true },
                  )
                    .then(async (r) => {
                      setMessage(r.message);
                      await invites.refetch();
                    })
                    .catch(setError);
              }}
            >
              Revoke invitation
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
export function StaffInvitation() {
  const qc = useQueryClient();
  const [tokenValue] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? ''),
    [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    history.replaceState(null, '', location.pathname);
  }, []);
  return (
    <section className="container section">
      <h1>Facility staff invitation</h1>
      <p>
        Sign in with the invited email and verify both email/mobile before accepting. Accepting grants only
        the invitation’s facility permissions and revokes existing sessions.
      </p>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState error={error} />}
      <p>
        <Link to="/login?next=%2Fstaff-invitations">Sign in</Link> ·{' '}
        <Link to="/onboarding">Verify contacts</Link>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void post<{ message: string }>('/onboarding/staff-invitations/accept', {
            token: new FormData(e.currentTarget).get('token'),
          })
            .then((r) => {
              setMessage(r.message);
              qc.clear();
            })
            .catch(setError);
        }}
      >
        <label>
          Invitation code
          <input
            type="password"
            name="token"
            defaultValue={tokenValue}
            required
            minLength={20}
            autoComplete="off"
          />
        </label>
        <button className="btn" disabled={!!message}>
          Accept invitation
        </button>
      </form>
      {message && (
        <p>
          <Link className="btn secondary" to="/login?next=%2Fstaff">
            Sign in to staff workspace
          </Link>
        </p>
      )}
      <p className="small muted">
        If you leave this page to sign in, reopen the invitation link from your email.
      </p>
    </section>
  );
}
