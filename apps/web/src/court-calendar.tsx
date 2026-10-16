import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { displayClock, formatMoney, formatTime, type Facility } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading, useUser } from './main';

type Schedule = {
  court: {
    id: string;
    name: string;
    facilityName: string;
    hourlyRate: number;
    openHour: number;
    closeHour: number;
    active: boolean;
  };
  date: string;
  duration: number;
  rules: { startInterval: number };
  refreshedAt: string;
  pending: number;
  slots: { startsAt: string; endsAt: string; status: string }[];
  allocations: { id: string; startsAt: string; endsAt: string; kind: string; reason: string | null }[];
};
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const day = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const shift = (value: string, count: number) => iso(new Date(day(value).getTime() + count * 86400000));
const local = (value: string) => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
export default function CourtCalendar({ facilities }: { facilities: Facility[] }) {
  const me = useUser();
  const courts = facilities.flatMap((f) => f.courts.map((c) => ({ ...c, facility: f })));
  const [courtId, setCourt] = useState(courts[0]?.id ?? '');
  const [date, setDate] = useState(() => (me.data?.user?.demoAccessAllowed ? shift(today(), 1) : today()));
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const schedule = useQuery({
    queryKey: ['court-schedule', courtId, date],
    queryFn: () => api<Schedule>(`/operations/courts/${courtId}/schedule?date=${date}`),
    enabled: !!courtId,
    refetchInterval: 30000,
  });
  const selected = day(date);
  const monthStart = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1, 12));
  const monthLength = new Date(
    Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] =
    view === 'month'
      ? [
          ...Array.from({ length: monthStart.getUTCDay() }, () => null),
          ...Array.from({ length: monthLength }, (_, i) => shift(iso(monthStart), i)),
        ]
      : view === 'week'
        ? Array.from({ length: 7 }, (_, i) => shift(date, i - selected.getUTCDay()))
        : [date];
  function choose(value: string) {
    setDate(value);
    setStart('');
    setEnd('');
    setMessage('');
  }
  function move(direction: number) {
    if (view === 'month')
      choose(iso(new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + direction, 1, 12))));
    else choose(shift(date, direction * (view === 'week' ? 7 : 1)));
  }
  async function mutate(path: string, body: object) {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const result = await post<{ message: string }>(path, body);
      setMessage(result.message);
      if (path === '/operations/closures' && start) setDate(start.slice(0, 10));
      await qc.invalidateQueries({ queryKey: ['court-schedule'] });
      await qc.invalidateQueries({ queryKey: ['availability'] });
      await qc.invalidateQueries({ queryKey: ['allocations'] });
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  function close(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    void mutate('/operations/closures', {
      courtId,
      startsAt: new Date(`${start}+08:00`).toISOString(),
      endsAt: new Date(`${end}+08:00`).toISOString(),
      reason: values.get('reason'),
    });
  }
  if (!courts.length)
    return (
      <div className="panel">
        <h2>Schedule & closures</h2>
        <p>No courts are assigned to this account. Ask an administrator to review facility access.</p>
        <Link to="/manage">Back to management</Link>
      </div>
    );
  return (
    <div className="court-calendar">
      <div className="section-title">
        <div>
          <span className="eyebrow dark">COURT MANAGEMENT</span>
          <h2>Schedule & closures</h2>
          <p>Philippine time (PHT). Choose a date and court to see live availability.</p>
        </div>
        <button className="btn secondary compact" onClick={() => choose(today())}>
          Today
        </button>
      </div>
      <div className="panel">
        <div className="form-row">
          <label>
            Court
            <select
              value={courtId}
              onChange={(e) => {
                setCourt(e.target.value);
                setStart('');
                setEnd('');
              }}
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.facility.name} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Calendar date
            <input
              type="date"
              value={date}
              required
              onChange={(e) => {
                if (e.target.value) choose(e.target.value);
              }}
            />
          </label>
        </div>
        <div className="calendar-toolbar">
          <button className="btn secondary compact" aria-label={`Previous ${view}`} onClick={() => move(-1)}>
            ‹
          </button>
          <strong>
            {selected.toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </strong>
          <button className="btn secondary compact" aria-label={`Next ${view}`} onClick={() => move(1)}>
            ›
          </button>
        </div>
        <div className="calendar-views" aria-label="Calendar view">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              className="btn secondary compact"
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v[0]!.toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {view !== 'day' && (
          <div className="calendar-weekdays" aria-hidden="true">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        )}
        <div
          className={`calendar-days ${view === 'day' ? 'calendar-single-day' : ''}`}
          aria-label="Choose calendar day"
        >
          {cells.map((value, i) =>
            value ? (
              <button
                key={value}
                aria-label={`Select ${value}`}
                aria-pressed={value === date}
                onClick={() => choose(value)}
              >
                {day(value).getUTCDate()}
                {value === today() && <small>Today</small>}
              </button>
            ) : (
              <span key={`empty-${i}`} />
            ),
          )}
        </div>
      </div>
      {error && <ErrorState error={error} />}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {schedule.isPending ? (
        <Loading />
      ) : schedule.error ? (
        <ErrorState error={schedule.error} retry={() => void schedule.refetch()} />
      ) : (
        <>
          <div className="section-title">
            <div>
              <h2>Available time slots</h2>
              <p>
                {schedule.data.court.name} · {date} · {formatMoney(schedule.data.court.hourlyRate)} / hour
              </p>
            </div>
            <button className="text-button" onClick={() => void schedule.refetch()}>
              Refresh availability
            </button>
          </div>
          <p className="small muted">
            {schedule.data.duration}-minute slots start every {schedule.data.rules.startInterval} minutes
            during operating hours. {schedule.data.pending} pending requests on this day do not reserve time.
            Availability is rechecked when a booking is confirmed or a closure is created.
          </p>
          <div className="slot-grid">
            {schedule.data.slots.map((s) => (
              <button
                key={s.startsAt}
                className={`calendar-slot slot-${s.status.toLowerCase()}`}
                disabled={s.status !== 'AVAILABLE'}
                aria-pressed={start === local(s.startsAt)}
                onClick={() => {
                  setStart(local(s.startsAt));
                  setEnd(local(s.endsAt));
                }}
              >
                <strong>
                  {displayClock(s.startsAt)}–{displayClock(s.endsAt)}
                </strong>
                <span>{s.status.replaceAll('_', ' ')}</span>
              </button>
            ))}
          </div>
          {!schedule.data.slots.length && <p>No one-hour slots fit these operating hours.</p>}
          <p className="small muted">
            Updated {formatTime(schedule.data.refreshedAt)}. Select an available slot to prefill the closure
            controls below.
          </p>
          <form className="panel" onSubmit={close}>
            <h3>Block court time</h3>
            <p>
              For maintenance or other unavailable periods. Existing confirmed bookings cannot be displaced.
            </p>
            <div className="form-row">
              <label>
                Closure start
                <input
                  name="start"
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Closure end
                <input
                  name="end"
                  type="datetime-local"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <label>
              Reason
              <input name="reason" required minLength={3} maxLength={300} />
            </label>
            <button className="btn" disabled={busy}>
              Create closure
            </button>
          </form>
          <div className="panel">
            <h3>Allocations on this date</h3>
            {schedule.data.allocations.map((a) => (
              <div className="court-row" key={a.id}>
                <div>
                  <span className="badge">{a.kind}</span>
                  <p>
                    {formatTime(a.startsAt)} to {formatTime(a.endsAt)}
                  </p>
                  {a.reason && <p>{a.reason}</p>}
                </div>
                {a.kind === 'CLOSURE' && (
                  <button
                    className="btn secondary compact"
                    disabled={busy}
                    onClick={() => void mutate(`/operations/closures/${a.id}/reopen`, {})}
                  >
                    Reopen
                  </button>
                )}
              </div>
            ))}
            {!schedule.data.allocations.length && <p>No confirmed bookings or closures on this date.</p>}
          </div>
          <Link className="btn secondary" to="/owner/bookings">
            Review booking requests
          </Link>
        </>
      )}
    </div>
  );
}
