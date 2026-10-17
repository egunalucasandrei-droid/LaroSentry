import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  displayClock,
  displayMinute,
  formatMoney,
  formatTime,
  phtDate,
  type ScheduleRules,
} from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading, useUser } from './main';
import './scheduler.css';

type Court = {
  id: string;
  name: string;
  surface: string;
  sport: string;
  hourlyRate: number;
  capacity: number;
  active: boolean;
  openMinute: number | null;
  closeMinute: number | null;
  minDuration: number;
  defaultDuration: number;
  maxDuration: number | null;
  startInterval: number;
  facilityId: string;
  facility: { id: string; name: string; openHour: number; closeHour: number; cancellationPolicy: string };
};
type Slot = { startsAt: string; endsAt: string; status: string };
type Schedule = {
  slots: Slot[];
  rules: ScheduleRules;
  duration: number;
  pending?: number;
  allocations?: { id: string; kind: string; startsAt: string; endsAt: string; reason: string }[];
  refreshedAt: string;
};
type Reservation = {
  id: string;
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalCentavos: number;
  court: Court;
  user: { id: string; nickname: string };
  source: string;
};
type PageResult = { items: Reservation[]; total: number; page: number; pageSize: number };
type Selection = { court: Court; slot: Slot; duration: number };
const tomorrow = () => phtDate(new Date(Date.now() + 86400000));
const shift = (date: string, n: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
function clockMinute(value: FormDataEntryValue | null) {
  const match = String(value ?? '')
    .trim()
    .match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i);
  if (!match) throw new Error('Enter a time such as 7:30 AM.');
  return ((Number(match[1]) % 12) + (match[3]!.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
}
function ClockInput({ name, label, minute = 360 }: { name: string; label: string; minute?: number }) {
  return (
    <label>
      {label}
      <input
        name={name}
        defaultValue={displayMinute(minute)}
        placeholder="7:30 AM"
        required
        pattern="(1[0-2]|0?[1-9]):[0-5][0-9] *([AaPp][Mm])"
        title="12-hour time, for example 7:30 AM"
      />
    </label>
  );
}
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className="nolta-modal" ref={ref} aria-label={title} onCancel={onClose}>
      <div className="nolta-modal-head">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Confirmation({ label = 'I confirm these changes.' }: { label?: string }) {
  return (
    <>
      <label>
        Reason
        <input name="reason" required minLength={3} maxLength={300} />
      </label>
      <label className="nolta-check">
        <input name="confirmed" type="checkbox" required />
        {label}
      </label>
    </>
  );
}
function useAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState('');
  async function run(work: () => Promise<unknown>, success = 'Saved.') {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await work();
      await qc.invalidateQueries();
      setMessage(success);
      return true;
    } catch (e) {
      setError(e as Error);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    message,
    run,
    feedback: (
      <>
        {error && <ErrorState error={error} />}
        {message && (
          <p className="nolta-notice" role="status">
            {message}
          </p>
        )}
      </>
    ),
  };
}
function useCourts(manage: boolean) {
  return useQuery({
    queryKey: ['scheduler', 'courts', manage],
    queryFn: () => api<Court[]>(`/scheduler/courts?manage=${manage ? '1' : '0'}`),
  });
}

export default function Scheduler() {
  const me = useUser(),
    { pathname } = useLocation();
  const manage = pathname.startsWith('/scheduler/admin');
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorState error={me.error} />;
  if (!me.data.user) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  const user = me.data.user,
    allowed = ['ADMIN', 'FACILITY_OWNER'].includes(user.role);
  if (manage && !allowed)
    return (
      <section className="container section">
        <h1>Admin or court host access required</h1>
        <Link to="/scheduler">Open user mode</Link>
      </section>
    );
  if (manage && !user.mfaVerified && !user.verificationBypassed)
    return <Navigate to={`/mfa?next=${encodeURIComponent(pathname)}`} replace />;
  const page = pathname.split('/').filter(Boolean).at(-1);
  const nav = manage
    ? [
        ['/scheduler/admin/schedule', 'Schedule'],
        ['/scheduler/admin/courts', 'Courts'],
        ['/scheduler/admin/activity', 'Activity'],
      ]
    : [
        ['/scheduler', 'Home'],
        ['/scheduler/book', 'Book a Court'],
        ['/scheduler/reservations', 'My Reservations'],
        ['/scheduler/profile', 'Profile'],
      ];
  return (
    <section className="nolta">
      <header className="nolta-top">
        <Link to="/scheduler" className="nolta-brand">
          <svg width="48" height="38" viewBox="0 0 96 76" role="img" aria-label="NOLTA logo">
            <rect width="96" height="76" rx="4" fill="#fff" />
            <path d="M5 5H91L54 52H5Z" fill="#172b70" />
            <path d="M91 5L54 52H91Z" fill="#238b57" />
            <path d="M5 5L54 52" stroke="#fff" strokeWidth="4" />
            <circle cx="70" cy="22" r="4" fill="#d5df27" />
            <text x="9" y="69" fill="#172b70" fontFamily="Arial" fontSize="13" fontWeight="800">
              NOLTA
            </text>
          </svg>
          <span>
            NOLTA<small>Scheduling by LaroSentry</small>
          </span>
        </Link>
        <span className="nolta-tag">{manage ? 'COURT MANAGEMENT' : 'USER MODE'}</span>
      </header>
      <nav className="nolta-nav" aria-label="NOLTA navigation">
        {nav.map(([to, label]) => (
          <NavLink key={to} to={to!} end>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="nolta-switch">
        {allowed && (
          <Link to={manage ? '/scheduler' : '/scheduler/admin/schedule'}>
            {manage ? 'Open user mode' : 'Manage assigned courts'}
          </Link>
        )}
        <Link to="/scheduler/profile">Account / Logout</Link>
        {user.role === 'ADMIN' && <Link to="/admin">Platform administration</Link>}
      </div>
      {page === 'courts' && manage ? (
        <CourtsPage />
      ) : page === 'activity' && manage ? (
        <Reservations manage />
      ) : page === 'book' || page === 'schedule' ? (
        <SchedulePage manage={manage} />
      ) : page === 'reservations' ? (
        <Reservations manage={false} />
      ) : page === 'profile' ? (
        <Profile />
      ) : (
        <UserHome />
      )}
    </section>
  );
}
function UserHome() {
  const me = useUser(),
    courts = useCourts(false);
  const bookings = useQuery({
    queryKey: ['scheduler', 'upcoming'],
    queryFn: () => api<PageResult>('/scheduler/reservations?period=upcoming'),
  });
  return (
    <>
      <div className="nolta-hero">
        <p>YOUR NEXT MATCH</p>
        <h1>Welcome, {me.data?.user?.nickname}.</h1>
        <p>Choose a court, find your time and keep your reservations together.</p>
        <Link className="nolta-button" to="/scheduler/book">
          Book a Court
        </Link>
      </div>
      <div className="nolta-grid">
        <article className="nolta-card">
          <h2>Available courts</h2>
          {courts.error ? (
            <ErrorState error={courts.error} />
          ) : (
            <p>
              {courts.data?.length ?? '…'} active courts at published facilities. Availability depends on your
              selected date.
            </p>
          )}
          <Link to="/scheduler/book">Browse courts and times</Link>
        </article>
        <article className="nolta-card">
          <h2>Upcoming reservations</h2>
          {bookings.error ? (
            <ErrorState error={bookings.error} />
          ) : (
            <p>{bookings.data?.total ?? '…'} upcoming requests or confirmed reservations.</p>
          )}
          <Link to="/scheduler/reservations">View My Reservations</Link>
        </article>
      </div>
      <div className="nolta-list">
        {bookings.data?.items.slice(0, 3).map((b) => (
          <article className="nolta-card" key={b.id}>
            <h3>{b.court.name}</h3>
            <p>
              {formatTime(b.startsAt)} – {displayClock(b.endsAt)}
            </p>
            <span className="nolta-tag">{b.status}</span>
          </article>
        ))}
      </div>
    </>
  );
}
function Calendar({ date, onChange }: { date: string; onChange: (v: string) => void }) {
  const [view, setView] = useState('month');
  const day = new Date(`${date}T12:00:00Z`),
    first = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1, 12)),
    firstDate = first.toISOString().slice(0, 10);
  const cells: (string | null)[] =
    view === 'day'
      ? [date]
      : view === 'week'
        ? Array.from({ length: 7 }, (_, i) => shift(date, i - day.getUTCDay()))
        : [
            ...Array.from({ length: first.getUTCDay() }, () => null),
            ...Array.from(
              { length: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate() },
              (_, i) => shift(firstDate, i),
            ),
          ];
  function move(n: number) {
    onChange(
      view === 'month'
        ? new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + n, 1, 12)).toISOString().slice(0, 10)
        : shift(date, n * (view === 'week' ? 7 : 1)),
    );
  }
  return (
    <div className="nolta-card">
      <div className="nolta-calendar-head">
        <button type="button" aria-label={`Previous ${view}`} onClick={() => move(-1)}>
          ‹
        </button>
        <strong>
          {day.toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </strong>
        <button type="button" aria-label={`Next ${view}`} onClick={() => move(1)}>
          ›
        </button>
        <button type="button" onClick={() => onChange(phtDate())}>
          Today
        </button>
      </div>
      <div className="nolta-views">
        {['month', 'week', 'day'].map((v) => (
          <button type="button" key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      {view !== 'day' && (
        <div className="nolta-weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      )}
      <div className={`nolta-days ${view === 'day' ? 'nolta-day' : ''}`}>
        {cells.map((d, i) =>
          d ? (
            <button
              type="button"
              key={d}
              aria-label={`Select ${d}`}
              aria-pressed={d === date}
              onClick={() => onChange(d)}
            >
              {Number(d.slice(-2))}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}
function Availability({
  manage,
  courts,
  onSelect,
  initialCourt,
  initialDuration,
  ignoreBookingId,
}: {
  manage: boolean;
  courts: Court[];
  onSelect: (v: Selection | null) => void;
  initialCourt?: string;
  initialDuration?: number;
  ignoreBookingId?: string;
}) {
  const [courtId, setCourt] = useState(initialCourt ?? courts[0]?.id ?? ''),
    [date, setDate] = useState(tomorrow),
    [duration, setDuration] = useState(
      String(
        initialDuration ??
          courts.find((c) => c.id === (initialCourt ?? courts[0]?.id))?.defaultDuration ??
          60,
      ),
    ),
    [selected, setSelected] = useState('');
  const court = courts.find((c) => c.id === courtId);
  const schedule = useQuery({
    queryKey: ['scheduler', 'availability', courtId, date, duration, manage, ignoreBookingId],
    queryFn: () =>
      api<Schedule>(
        `/scheduler/courts/${courtId}/schedule?date=${date}&duration=${duration}&manage=${manage ? '1' : '0'}${ignoreBookingId ? `&ignoreBookingId=${ignoreBookingId}` : ''}`,
      ),
    enabled: !!courtId && !!duration,
    refetchInterval: 30000,
  });
  function clear() {
    setSelected('');
    onSelect(null);
  }
  if (!court)
    return (
      <p className="nolta-card">
        No courts available. Court hosts can add courts under Courts; only approved facilities are publicly
        bookable.
      </p>
    );
  return (
    <>
      <div className="nolta-fields">
        <label>
          Court
          <select
            aria-label="Court"
            value={courtId}
            onChange={(e) => {
              setCourt(e.target.value);
              setDuration(String(courts.find((c) => c.id === e.target.value)!.defaultDuration));
              clear();
            }}
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.facility.name} · {c.name}
                {!c.active ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Booking date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                clear();
              }
            }}
          />
        </label>
        <label>
          Duration (minutes)
          <input
            type="number"
            min={court.minDuration}
            max={court.maxDuration ?? 1440}
            step="1"
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              clear();
            }}
          />
        </label>
      </div>
      <div className="nolta-schedule-grid">
        <Calendar
          date={date}
          onChange={(v) => {
            setDate(v);
            clear();
          }}
        />
        <section>
          <h2>Available time slots</h2>
          <p>
            {court.surface} · {formatMoney(court.hourlyRate)} / hour · Philippine time
          </p>
          <p className="nolta-help">
            Minimum {court.minDuration} min · Starts every {court.startInterval} min ·{' '}
            {court.maxDuration ? `Maximum ${court.maxDuration} min` : 'Fits within opening hours'}. Pending
            requests do not reserve time.
          </p>
          {schedule.isPending ? (
            <Loading />
          ) : schedule.error ? (
            <ErrorState error={schedule.error} />
          ) : (
            <>
              <p>
                Opens {displayMinute(schedule.data.rules.openMinute)} · Closes{' '}
                {displayMinute(schedule.data.rules.closeMinute)}
              </p>
              <div className="nolta-slots">
                {schedule.data.slots.map((s) => {
                  const label =
                    s.status === 'BOOKED'
                      ? 'Reserved'
                      : s.status === 'CLOSED'
                        ? 'Maintenance / unavailable'
                        : s.status === 'AVAILABLE'
                          ? 'Available'
                          : 'Unavailable';
                  return (
                    <button
                      type="button"
                      key={s.startsAt}
                      className={`nolta-slot nolta-${s.status.toLowerCase()}`}
                      disabled={s.status !== 'AVAILABLE'}
                      aria-pressed={selected === s.startsAt}
                      onClick={() => {
                        setSelected(s.startsAt);
                        onSelect({ court, slot: s, duration: Number(duration) });
                      }}
                    >
                      <strong>
                        {displayClock(s.startsAt)} – {displayClock(s.endsAt)}
                      </strong>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              {!schedule.data.slots.length && <p>No sessions fit these hours and duration.</p>}
              <p className="nolta-help">
                Updated {displayClock(schedule.data.refreshedAt)}. Availability is rechecked when saved.
              </p>
              <button type="button" onClick={() => void schedule.refetch()}>
                Refresh availability
              </button>
              {manage && !ignoreBookingId && (
                <Maintenance court={court} date={date} schedule={schedule.data} />
              )}
            </>
          )}
        </section>
      </div>
      {manage && !ignoreBookingId && (
        <div className="nolta-grid">
          <CourtForm court={court} facilities={[court.facility]} compact />
          <ExceptionForm court={court} date={date} />
        </div>
      )}
    </>
  );
}
function SchedulePage({ manage }: { manage: boolean }) {
  const courts = useCourts(manage),
    [selection, setSelection] = useState<Selection | null>(null),
    [review, setReview] = useState(false);
  return (
    <>
      <h1>{manage ? 'Schedule' : 'Book a Court'}</h1>
      <p>
        Select a court, date and duration. Green slots can be selected; reserved and maintenance slots are
        unavailable.
      </p>
      {courts.isPending ? (
        <Loading />
      ) : courts.error ? (
        <ErrorState error={courts.error} />
      ) : (
        <Availability manage={manage} courts={courts.data} onSelect={setSelection} />
      )}
      {selection && (
        <div className="nolta-summary">
          <h2>Selected session</h2>
          <p>
            {selection.court.name} · {formatTime(selection.slot.startsAt)} –{' '}
            {displayClock(selection.slot.endsAt)} · {selection.duration} minutes
          </p>
          <button className="nolta-button" onClick={() => setReview(true)}>
            {manage ? 'Review manual reservation' : 'Review reservation'}
          </button>
        </div>
      )}
      {review && selection && (
        <BookingReview
          selection={selection}
          manual={manage}
          onClose={() => setReview(false)}
          onSaved={() => {
            setReview(false);
            setSelection(null);
          }}
        />
      )}
    </>
  );
}
function BookingReview({
  selection,
  manual,
  onClose,
  onSaved,
}: {
  selection: Selection;
  manual: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const action = useAction(),
    [key] = useState(() => crypto.randomUUID()),
    [saved, setSaved] = useState('');
  const { court, slot, duration } = selection,
    total = Math.round((court.hourlyRate * duration) / 60);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.run(async () => {
      const result = await post<{ reference: string }>(
        '/scheduler/reservations',
        {
          courtId: court.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          mode: 'BOOKING_ONLY',
          expectedGuests: 1,
          manual,
          ...(manual && f.get('email') ? { customerEmail: f.get('email') } : {}),
          reviewedTotal: total,
          reviewedPolicy: court.facility.cancellationPolicy,
          confirmed: true,
          reason: f.get('reason') || 'Player reviewed and submitted a reservation request.',
        },
        { 'Idempotency-Key': key },
      );
      setSaved(result.reference);
    }, 'Reservation saved.');
  }
  return (
    <Modal title={manual ? 'Confirm manual reservation' : 'Confirm reservation request'} onClose={onClose}>
      <p>
        {court.facility.name} · {court.name}
      </p>
      <p>
        {formatTime(slot.startsAt)} – {displayClock(slot.endsAt)} · {duration} minutes
      </p>
      <p>
        <strong>{formatMoney(total)}</strong> · No money is transferred here.
      </p>
      <p>{court.facility.cancellationPolicy}</p>
      {action.feedback}
      {saved ? (
        <>
          <p>Reference: {saved}</p>
          <p>
            {manual ? 'The session is reserved.' : 'Request pending host approval; time is not reserved yet.'}
          </p>
          <Link to={manual ? '/scheduler/admin/activity' : '/scheduler/reservations'}>View reservations</Link>
          <button onClick={onSaved}>Done</button>
        </>
      ) : (
        <form onSubmit={submit}>
          {manual && (
            <>
              <label>
                Customer account email (optional)
                <input name="email" type="email" maxLength={254} />
              </label>
              <p className="nolta-help">
                Exact active verified account email. Leave empty to book for your own account.
              </p>
            </>
          )}
          <Confirmation label="I have reviewed the court, times, price and policy." />
          <button className="nolta-button" disabled={action.busy}>
            {manual ? 'Create reservation' : 'Submit request'}
          </button>
        </form>
      )}
    </Modal>
  );
}
function CourtForm({
  court,
  facilities,
  compact = false,
  onSaved,
}: {
  court?: Court;
  facilities: { id: string; name: string; openHour?: number; closeHour?: number }[];
  compact?: boolean;
  onSaved?: () => void;
}) {
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.run(async () => {
      await post(`/scheduler/courts${court ? `/${court.id}` : ''}`, {
        facilityId: f.get('facilityId'),
        name: f.get('name'),
        surface: f.get('surface'),
        sport: f.get('sport'),
        hourlyRate: Math.round(Number(f.get('price')) * 100),
        capacity: Number(f.get('capacity')),
        active: f.get('active') === 'on',
        openMinute: clockMinute(f.get('open')),
        closeMinute: clockMinute(f.get('close')) || 1440,
        minDuration: Number(f.get('minimum')),
        defaultDuration: Number(f.get('default')),
        maxDuration: f.get('maximum') ? Number(f.get('maximum')) : null,
        startInterval: Number(f.get('interval')),
        confirmed: true,
        reason: f.get('reason'),
      });
      onSaved?.();
    }, 'Court settings saved. Existing reservations retain their original times.');
  }
  const form = (
    <form key={court?.id ?? 'new'} onSubmit={submit} className="nolta-card">
      <h2>{court ? 'Court & schedule settings' : 'Add court'}</h2>
      {action.feedback}
      <div className="nolta-fields">
        {!court && (
          <label>
            Facility
            <select name="facilityId" required>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Court name
          <input name="name" defaultValue={court?.name} required minLength={2} maxLength={80} />
        </label>
        <label>
          Surface
          <input
            name="surface"
            defaultValue={court?.surface ?? 'Hard'}
            required
            minLength={2}
            maxLength={40}
          />
        </label>
        <label>
          Sport
          <select name="sport" defaultValue={court?.sport ?? 'Tennis'}>
            {['Tennis', 'Basketball', 'Badminton', 'Volleyball', 'Futsal', 'Pickleball'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Hourly price (PHP)
          <input
            name="price"
            type="number"
            min="0"
            max="100000"
            step="0.01"
            required
            defaultValue={(court?.hourlyRate ?? 50000) / 100}
          />
        </label>
        <label>
          Capacity
          <input
            name="capacity"
            type="number"
            min="1"
            max="40"
            required
            defaultValue={court?.capacity ?? 4}
          />
        </label>
        <ClockInput
          name="open"
          label="Opens (AM/PM)"
          minute={court?.openMinute ?? (court?.facility.openHour ?? 6) * 60}
        />
        <ClockInput
          name="close"
          label="Closes (AM/PM)"
          minute={court?.closeMinute ?? (court?.facility.closeHour ?? 22) * 60}
        />
        <label>
          Minimum duration (minutes)
          <input
            name="minimum"
            type="number"
            min="1"
            max="1440"
            required
            defaultValue={court?.minDuration ?? 30}
          />
        </label>
        <label>
          Default duration (minutes)
          <input
            name="default"
            type="number"
            min="1"
            max="1440"
            required
            defaultValue={court?.defaultDuration ?? 60}
          />
        </label>
        <label>
          Maximum duration (optional)
          <input name="maximum" type="number" min="1" max="1440" defaultValue={court?.maxDuration ?? ''} />
        </label>
        <label>
          Start interval (minutes)
          <input
            name="interval"
            type="number"
            min="1"
            max="1440"
            required
            defaultValue={court?.startInterval ?? 30}
          />
        </label>
      </div>
      <label className="nolta-check">
        <input name="active" type="checkbox" defaultChecked={court?.active ?? true} />
        Court active
      </label>
      <p className="nolta-help">
        Deactivation prevents new bookings; it does not delete history or cancel existing reservations. Review
        affected reservations separately.
      </p>
      <Confirmation />
      <button className="nolta-button" disabled={action.busy || !facilities.length}>
        Save court
      </button>
    </form>
  );
  return compact ? (
    <details className="nolta-details">
      <summary>Operating hours & duration settings</summary>
      {form}
    </details>
  ) : (
    form
  );
}
function CourtsPage() {
  const courts = useCourts(true),
    facilities = useQuery({
      queryKey: ['scheduler', 'facilities'],
      queryFn: () => api<{ id: string; name: string }[]>('/scheduler/facilities'),
    }),
    [editing, setEditing] = useState<Court | null | undefined>(undefined);
  return (
    <>
      <div className="nolta-calendar-head">
        <h1>Courts</h1>
        <button className="nolta-button" onClick={() => setEditing(null)}>
          Add Court
        </button>
      </div>
      {courts.isPending ? (
        <Loading />
      ) : courts.error ? (
        <ErrorState error={courts.error} />
      ) : (
        <div className="nolta-grid">
          {courts.data.map((c) => (
            <article className="nolta-card" key={c.id}>
              <span className="nolta-tag">{c.active ? 'Active' : 'Inactive'}</span>
              <h2>{c.name}</h2>
              <p>
                {c.facility.name} · {c.surface} · {c.sport}
              </p>
              <p>
                {displayMinute(c.openMinute ?? c.facility.openHour * 60)} –{' '}
                {displayMinute(c.closeMinute ?? c.facility.closeHour * 60)}
              </p>
              <p>
                {c.minDuration} min minimum · {c.defaultDuration} min default · {formatMoney(c.hourlyRate)}
                /hour
              </p>
              <button onClick={() => setEditing(c)}>Edit court / activation</button>
            </article>
          ))}
        </div>
      )}
      {!courts.data?.length && <p>No assigned courts. You need an owner membership to manage a facility.</p>}
      {editing !== undefined && (
        <Modal title={editing ? 'Edit court' : 'Add Court'} onClose={() => setEditing(undefined)}>
          {facilities.error ? (
            <ErrorState error={facilities.error} />
          ) : (
            <CourtForm
              court={editing ?? undefined}
              facilities={facilities.data ?? []}
              onSaved={() => setEditing(undefined)}
            />
          )}
        </Modal>
      )}
    </>
  );
}
function Maintenance({ court, date, schedule }: { court: Court; date: string; schedule: Schedule }) {
  const action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.run(async () => {
      const day = new Date(`${date}T00:00:00+08:00`).getTime(),
        all = f.get('all') === 'on',
        from = all ? 0 : clockMinute(f.get('from')),
        to = all ? 1440 : clockMinute(f.get('to')) || 1440;
      await post('/operations/closures', {
        courtId: court.id,
        startsAt: new Date(day + from * 60000).toISOString(),
        endsAt: new Date(day + to * 60000).toISOString(),
        reason: f.get('reason'),
      });
    }, 'Maintenance saved.');
  }
  return (
    <details className="nolta-details">
      <summary>Maintenance & blocked time</summary>
      {action.feedback}
      <form onSubmit={submit} className="nolta-card" key={date}>
        <p>Selected date: {date}. Confirmed reservations cannot be displaced.</p>
        <div className="nolta-fields">
          <ClockInput name="from" label="From (AM/PM)" minute={schedule.rules.openMinute} />
          <ClockInput name="to" label="To (AM/PM)" minute={schedule.rules.closeMinute} />
        </div>
        <label className="nolta-check">
          <input name="all" type="checkbox" />
          Block entire date
        </label>
        <Confirmation />
        <button className="nolta-button" disabled={action.busy}>
          Add maintenance
        </button>
      </form>
      {schedule.allocations
        ?.filter((a) => a.kind === 'CLOSURE')
        .map((a) => (
          <div className="nolta-card" key={a.id}>
            <p>
              {formatTime(a.startsAt)} – {displayClock(a.endsAt)}
            </p>
            <p>{a.reason}</p>
            <button
              disabled={action.busy}
              onClick={() => {
                if (window.confirm('Reopen this maintenance period?'))
                  void action.run(() => post(`/operations/closures/${a.id}/reopen`), 'Maintenance reopened.');
              }}
            >
              Reopen maintenance
            </button>
          </div>
        ))}
    </details>
  );
}
function ExceptionForm({ court, date }: { court: Court; date: string }) {
  const action = useAction();
  const rules = useQuery({
    queryKey: ['scheduler', 'exceptions', court.id],
    queryFn: () =>
      api<
        {
          id: string;
          date: string;
          closed: boolean;
          openMinute: number;
          closeMinute: number;
          reason: string;
        }[]
      >(`/scheduler/courts/${court.id}/exceptions`),
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.run(
      () =>
        post(`/scheduler/courts/${court.id}/exceptions`, {
          date,
          openMinute: clockMinute(f.get('open')),
          closeMinute: clockMinute(f.get('close')) || 1440,
          closed: f.get('closed') === 'on',
          remove: f.get('remove') === 'on',
          confirmed: true,
          reason: f.get('reason'),
        }),
      'Date exception saved.',
    );
  }
  return (
    <details className="nolta-details">
      <summary>Date-specific schedule exceptions</summary>
      {action.feedback}
      <form className="nolta-card" onSubmit={submit} key={`${court.id}${date}`}>
        <h2>Exception for {date}</h2>
        <p>Overrides normal hours on this date. Existing confirmed reservations are protected.</p>
        <ClockInput
          name="open"
          label="Exception opens (AM/PM)"
          minute={court.openMinute ?? court.facility.openHour * 60}
        />
        <ClockInput
          name="close"
          label="Exception closes (AM/PM)"
          minute={court.closeMinute ?? court.facility.closeHour * 60}
        />
        <label className="nolta-check">
          <input name="closed" type="checkbox" />
          Closed all day
        </label>
        <label className="nolta-check">
          <input name="remove" type="checkbox" />
          Remove exception and restore normal hours
        </label>
        <Confirmation />
        <button disabled={action.busy}>Save date exception</button>
      </form>
      {rules.error && <ErrorState error={rules.error} />}
      {rules.data?.map((r) => (
        <p key={r.id}>
          {r.date}: {r.closed ? 'Closed' : `${displayMinute(r.openMinute)} – ${displayMinute(r.closeMinute)}`}{' '}
          · {r.reason}
        </p>
      ))}
    </details>
  );
}
function Reservations({ manage }: { manage: boolean }) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [date, setDate] = useState(''),
    [courtId, setCourt] = useState(''),
    [period, setPeriod] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Reservation | null>(null),
    [action, setAction] = useState(''),
    [reset, setReset] = useState(false),
    [resetMessage, setResetMessage] = useState('');
  const me = useUser(),
    courts = useCourts(manage);
  const query = new URLSearchParams({
    manage: manage ? '1' : '0',
    q: search,
    status,
    page: String(page),
    period,
    ...(date ? { date } : {}),
    ...(courtId ? { courtId } : {}),
  });
  const list = useQuery({
    queryKey: ['scheduler', 'reservations', query.toString()],
    queryFn: () => api<PageResult>(`/scheduler/reservations?${query}`),
    refetchInterval: 30000,
  });
  function change(fn: () => void) {
    fn();
    setPage(1);
  }
  return (
    <>
      <h1>{manage ? 'Activity' : 'My Reservations'}</h1>
      {resetMessage && (
        <p className="nolta-notice" role="status">
          {resetMessage}
        </p>
      )}
      <div className="nolta-fields">
        <label>
          Search reservations
          <input
            value={search}
            onChange={(e) => change(() => setSearch(e.target.value))}
            placeholder="Reference, customer or court"
            maxLength={100}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => change(() => setStatus(e.target.value))}>
            <option value="">All statuses</option>
            {['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED', 'REJECTED', 'NO_SHOW'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Reservation date
          <input type="date" value={date} onChange={(e) => change(() => setDate(e.target.value))} />
        </label>
        <label>
          Filter court
          <select value={courtId} onChange={(e) => change(() => setCourt(e.target.value))}>
            <option value="">All courts</option>
            {courts.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Period
          <select value={period} onChange={(e) => change(() => setPeriod(e.target.value))}>
            <option value="">All periods</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      <div className="nolta-actions">
        <button
          onClick={() => {
            setSearch('');
            setStatus('');
            setDate('');
            setCourt('');
            setPeriod('');
            setPage(1);
          }}
        >
          Reset Filters
        </button>
        {manage && me.data?.user?.role === 'ADMIN' && me.data.user.demoAccessAllowed && (
          <button className="nolta-danger" onClick={() => setReset(true)}>
            Reset Demo Reservations
          </button>
        )}
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} />
      ) : (
        <>
          <p>
            {list.data.total} reservations · Page {page}
          </p>
          <div className="nolta-list">
            {list.data.items.map((b) => (
              <article className="nolta-card nolta-reservation" key={b.id}>
                <div>
                  <span className="nolta-tag">{b.status}</span>
                  <h2>{b.court.name}</h2>
                  <p>
                    {b.reference} · {manage ? b.user.nickname : 'Your reservation'}
                  </p>
                  <p>
                    {formatTime(b.startsAt)} – {displayClock(b.endsAt)} ·{' '}
                    {(new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 60000} minutes
                  </p>
                  <p>
                    {b.court.facility.name} · {formatMoney(b.totalCentavos)}
                  </p>
                  <Link to={`/app/bookings/${b.id}`}>
                    {manage ? 'Organizer details (own bookings only)' : 'Reservation details'}
                  </Link>
                </div>
                <div className="nolta-actions">
                  {new Date(b.startsAt) > new Date() && ['PENDING', 'CONFIRMED'].includes(b.status) && (
                    <>
                      {manage && b.status === 'PENDING' && (
                        <button
                          onClick={() => {
                            setSelected(b);
                            setAction('CONFIRM');
                          }}
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setSelected(b);
                          setAction('CANCEL');
                        }}
                      >
                        Cancel
                      </button>
                      {manage && (
                        <button
                          onClick={() => {
                            setSelected(b);
                            setAction('RESCHEDULE');
                          }}
                        >
                          Reschedule
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!list.data.items.length && (
            <div className="nolta-card">
              <h2>No reservations found</h2>
              <p>Try another filter or book a court.</p>
            </div>
          )}
          <div className="nolta-actions">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous page
            </button>
            <button disabled={page * 20 >= list.data.total} onClick={() => setPage(page + 1)}>
              Next page
            </button>
          </div>
        </>
      )}
      {selected && (
        <ReservationAction
          booking={selected}
          action={action}
          manage={manage}
          courts={courts.data ?? []}
          onClose={() => setSelected(null)}
        />
      )}
      {reset && (
        <ResetDemo
          onClose={() => setReset(false)}
          onSaved={() => {
            setReset(false);
            setResetMessage('Demo reservations reset. Courts, maintenance and history are preserved.');
          }}
        />
      )}
    </>
  );
}
function ReservationAction({
  booking,
  action,
  manage,
  courts,
  onClose,
}: {
  booking: Reservation;
  action: string;
  manage: boolean;
  courts: Court[];
  onClose: () => void;
}) {
  const mutation = useAction(),
    [selection, setSelection] = useState<Selection | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await mutation.run(() =>
        action === 'CONFIRM'
          ? post(`/operations/bookings/${booking.id}/decision`, {
              status: 'CONFIRMED',
              reason: f.get('reason'),
            })
          : !manage
            ? post(`/bookings/${booking.id}/cancel`)
            : post(`/scheduler/reservations/${booking.id}/change`, {
                action,
                confirmed: true,
                reason: f.get('reason'),
                ...(selection
                  ? {
                      courtId: selection.court.id,
                      startsAt: selection.slot.startsAt,
                      endsAt: selection.slot.endsAt,
                      mode: 'BOOKING_ONLY',
                      expectedGuests: 1,
                    }
                  : {}),
              }),
      )
    )
      onClose();
  }
  return (
    <Modal
      title={`${action === 'CONFIRM' ? 'Confirm' : action === 'CANCEL' ? 'Cancel' : 'Reschedule'} reservation`}
      onClose={onClose}
    >
      <p>
        {booking.reference} · {booking.court.name}
      </p>
      <p>
        {formatTime(booking.startsAt)} – {displayClock(booking.endsAt)}
      </p>
      {mutation.feedback}
      {action === 'RESCHEDULE' && (
        <Availability
          manage
          courts={courts.filter((c) => c.facilityId === booking.court.facilityId)}
          initialCourt={booking.court.id}
          ignoreBookingId={booking.id}
          initialDuration={
            (new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000
          }
          onSelect={setSelection}
        />
      )}
      {selection && (
        <p>
          New session: {selection.court.name}, {formatTime(selection.slot.startsAt)} –{' '}
          {displayClock(selection.slot.endsAt)}, {selection.duration} min ·{' '}
          {formatMoney(Math.round((selection.court.hourlyRate * selection.duration) / 60))}
        </p>
      )}
      <form onSubmit={submit}>
        <Confirmation label="I confirm this reservation change." />
        <button className="nolta-button" disabled={mutation.busy || (action === 'RESCHEDULE' && !selection)}>
          Save reservation change
        </button>
      </form>
      <p className="nolta-help">Any external payment/refund must be handled separately with the facility.</p>
    </Modal>
  );
}
function ResetDemo({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const preview = useQuery({
      queryKey: ['scheduler', 'reset-preview'],
      queryFn: () => api<{ count: number; fingerprint: string; message: string }>('/scheduler/demo-reset'),
    }),
    action = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      await action.run(
        () =>
          post('/scheduler/demo-reset', {
            confirmed: true,
            reason: f.get('reason'),
            fingerprint: preview.data!.fingerprint,
          }),
        'Demo reservations reset.',
      )
    )
      onSaved();
  }
  return (
    <Modal title="Reset Demo Reservations" onClose={onClose}>
      {action.feedback}
      {preview.isPending ? (
        <Loading />
      ) : preview.error ? (
        <ErrorState error={preview.error} />
      ) : (
        <>
          <p>
            <strong>{preview.data.count} NOLTA demo reservations</strong> will be archived and removed from
            active lists, including past, cancelled and upcoming records.
          </p>
          <p>{preview.data.message}</p>
          <p>
            This is an archive reset, not deletion of immutable evidence. Other LaroSentry bookings are
            untouched.
          </p>
          <form onSubmit={submit}>
            <Confirmation label="I explicitly confirm this demo reservation reset." />
            <button className="nolta-danger" disabled={action.busy}>
              Confirm demo reset
            </button>
          </form>
        </>
      )}
    </Modal>
  );
}
function Profile() {
  const me = useUser(),
    action = useAction();
  const user = me.data!.user!;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action.run(() => post('/scheduler/profile', { nickname: f.get('nickname') }), 'Profile saved.');
  }
  return (
    <>
      <h1>Profile</h1>
      {action.feedback}
      <form className="nolta-card" onSubmit={submit}>
        <label>
          Account name
          <input name="nickname" defaultValue={user.nickname} minLength={2} maxLength={40} required />
        </label>
        <p>Email: {user.email}</p>
        <p>Role: {user.role.replaceAll('_', ' ')}</p>
        <button className="nolta-button" disabled={action.busy}>
          Save profile
        </button>
        <Link to="/app/settings">Privacy and account settings</Link>
        <Link to="/app/security">Account security and MFA</Link>
      </form>
      <button onClick={() => void action.run(() => post('/auth/logout'), 'Logged out.')}>
        Log out of NOLTA
      </button>
    </>
  );
}
