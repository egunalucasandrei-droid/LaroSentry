import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Heart,
  LayoutGrid,
  Map,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { formatMoney, sports, type Facility, type BookingInput } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading, useUser } from './main';
import { CourtArt } from './court-art';
const FacilityMap = lazy(() => import('./map'));
type ListResponse = { items: Facility[]; total: number; page: number; pageSize: number };
function useFacilities(query = '') {
  return useQuery({
    queryKey: ['facilities', query],
    queryFn: () => api<ListResponse>(`/facilities${query ? '?' + query : ''}`),
  });
}
function useCompare() {
  const [items, setItems] = useState<Facility[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('compare') ?? '[]') as Facility[];
    } catch {
      return [];
    }
  });
  function toggle(facility: Facility) {
    const next = items.some((f) => f.id === facility.id)
      ? items.filter((f) => f.id !== facility.id)
      : [...items, facility].slice(0, 3);
    setItems(next);
    sessionStorage.setItem('compare', JSON.stringify(next));
  }
  return { items, toggle };
}
export function FacilityCard({
  facility,
  compare,
  selected,
}: {
  facility: Facility;
  compare?: (f: Facility) => void;
  selected?: boolean;
}) {
  const { data } = useUser();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!data?.user) {
      navigate(`/login?next=${encodeURIComponent('/app/saved')}`);
      return;
    }
    setSaving(true);
    try {
      await post(`/saved/${facility.id}`);
      setMessage('Saved to your places');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="facility-card">
      <div className="card-image">
        <Link to={`/facilities/${facility.slug}`} tabIndex={-1} aria-hidden="true">
          <CourtArt sport={facility.courts[0]?.sport} />
        </Link>
        <span className="photo-label">Demo illustration</span>
        <button
          className="save-button"
          onClick={() => void save()}
          disabled={saving}
          aria-label={`Save ${facility.name}`}
        >
          <Heart size={18} />
        </button>
        <span className="sport-pill">{facility.courts[0]?.sport}</span>
      </div>
      <div className="card-body">
        <div className="card-place">
          <MapPin size={13} />
          {facility.area}
          {facility.demo && <span>Fictional facility</span>}
        </div>
        <h3>
          <Link to={`/facilities/${facility.slug}`}>{facility.name}</Link>
        </h3>
        <p className="card-amenities">{facility.amenities.slice(0, 3).join(' · ')}</p>
        <p className="small muted">
          {facility.courts.length} listed {facility.courts.length === 1 ? 'court' : 'courts'} ·{' '}
          {[...new Set(facility.courts.map((c) => c.sport))].join(' · ')}
        </p>
        <div className="card-bottom">
          <span>
            <strong>{formatMoney(Math.min(...facility.courts.map((c) => c.hourlyRate)))}</strong>
            <span className="muted"> / hour</span>
            <small>Starting price</small>
          </span>
          <Link
            to={`/facilities/${facility.slug}`}
            className="round-arrow"
            aria-label={`View ${facility.name}`}
          >
            <ArrowUpRight size={21} />
          </Link>
        </div>
        {compare && (
          <button className="compare-button" onClick={() => compare(facility)} aria-pressed={selected}>
            {selected ? <Check size={14} /> : <span>＋</span>}
            {selected ? 'Added to comparison' : 'Compare facility'}
          </button>
        )}
        {message && (
          <p className="small" role="status">
            {message}
          </p>
        )}
      </div>
    </article>
  );
}
function SearchBar({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of data) if (value) params.set(key, String(value));
    navigate(`/facilities?${params}`);
  }
  return (
    <form className={`search-bar ${compact ? 'compact-search' : ''}`} onSubmit={submit}>
      <label>
        <span>
          <MapPin size={15} /> WHERE TO PLAY
        </span>
        <input name="q" placeholder="City or neighborhood" defaultValue="Quezon City" />
      </label>
      <label>
        <span>
          <LayoutGrid size={15} /> YOUR SPORT
        </span>
        <select name="sport" defaultValue="">
          <option value="">All sports</option>
          {sports.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        <span>
          <CalendarDays size={15} /> GAME DAY
        </span>
        <input name="date" type="date" aria-label="Game day" />
      </label>
      <button className="btn" type="submit">
        <Search size={18} /> Find a court
      </button>
    </form>
  );
}
export function Home() {
  const facilities = useFacilities();
  const reduced = useReducedMotion();
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <motion.div
            className="hero-copy"
            initial={reduced ? false : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="eyebrow">
              <span /> YOUR NEXT GAME STARTS HERE
            </div>
            <h1>
              Less searching.
              <br />
              More <em>playing.</em>
              <svg viewBox="0 0 300 16" aria-hidden="true">
                <path
                  d="M3 12Q150 -5 293 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </h1>
            <p>
              Find a sports facility, choose a time and send a booking request. Owners manage reservations;
              staff keep game day moving. All in one place.
            </p>
            <div className="hero-reassurance">
              <ShieldCheck size={19} />
              <span>Clear prices. Live schedule checks. Facility approval before you play.</span>
            </div>
          </motion.div>
          <div className="hero-visual">
            <CourtArt hero />
            <div className="hero-image-caption">
              THE COURT IS CALLING. <ArrowUpRight size={17} />
            </div>
            <span className="hero-demo">Original court illustration · Demonstration only</span>
            <div className="floating-card">
              <span className="floating-icon">
                <CalendarDays size={22} />
              </span>
              <div>
                <strong>Make it a game day.</strong>
                <small>Your next court is a few clicks away.</small>
              </div>
              <ArrowUpRight size={18} />
            </div>
          </div>
        </div>
        <div className="container hero-search">
          <SearchBar />
          <div className="search-foot">
            <span>
              Start local: <Link to="/facilities?q=Quezon+City">Quezon City</Link>
              <Link to="/facilities?q=Marikina">Marikina</Link>
              <Link to="/facilities?q=Pasig">Pasig</Link>
            </span>
            <span>
              <MapPin size={13} /> No location access needed
            </span>
          </div>
        </div>
      </section>
      <section className="container presentation-paths" aria-label="Ways to use LaroSentry">
        <Link className="panel" to="/facilities">
          <CalendarDays aria-hidden="true" />
          <h2>Find your next court</h2>
          <p>Compare facilities, check times and track your booking request.</p>
          <span className="text-link">Explore as a player →</span>
        </Link>
        <Link className="panel" to="/list-your-facility">
          <ShieldCheck aria-hidden="true" />
          <h2>Run your facility</h2>
          <p>Review requests, manage your schedule and coordinate authorized staff.</p>
          <span className="text-link">See facility hosting →</span>
        </Link>
        <Link className="panel" to="/how-it-works">
          <Users aria-hidden="true" />
          <h2>Know what happens next</h2>
          <p>Request, wait for approval, arrange payment and check in at the facility.</p>
          <span className="text-link">How booking works →</span>
        </Link>
      </section>
      <section className="container section sports-section">
        <div className="section-title">
          <div className="inline-title">
            <span className="eyebrow dark">FIND YOUR PLAY</span>
            <h2>Different sports. Same good feeling.</h2>
          </div>
          <Link className="text-link" to="/facilities">
            Explore all courts <ArrowRight size={16} />
          </Link>
        </div>
        <div className="sports-grid">
          {sports.map((s, i) => (
            <Link key={s} to={`/facilities?sport=${s}`} className="sport-category">
              <span className={`sport-symbol s${i}`} aria-hidden="true">
                {['◉', '⌁', '◍', '◈', '⬡', '◒'][i]}
              </span>
              <span>{s}</span>
              <ChevronRight size={15} />
            </Link>
          ))}
        </div>
      </section>
      <section className="section featured-section">
        <div className="container">
          <div className="section-title">
            <div>
              <div className="eyebrow dark">A PLACE FOR YOUR NEXT GAME</div>
              <h2>Explore the neighborhood.</h2>
              <p className="muted">Explore courts, compare options and plan your next game.</p>
            </div>
            <Link to="/facilities" className="btn secondary">
              Browse facilities <ArrowUpRight size={17} />
            </Link>
          </div>
          {facilities.isPending ? (
            <Loading />
          ) : facilities.error ? (
            <ErrorState error={facilities.error} retry={() => void facilities.refetch()} />
          ) : (
            <div className="card-grid">
              {facilities.data.items.slice(0, 3).map((f) => (
                <FacilityCard facility={f} key={f.id} />
              ))}
            </div>
          )}
          <p className="demo-note">
            Listings marked as demonstrations are fictional and do not represent real venue photographs.
          </p>
        </div>
      </section>
      <section className="container section how-section">
        <div>
          <div className="eyebrow dark">FROM “LET’S PLAY” TO GAME DAY</div>
          <h2>
            A little planning.
            <br />A lot more playing.
          </h2>
          <Link className="text-link" to="/how-it-works">
            Here’s how it works <ArrowRight size={17} />
          </Link>
        </div>
        <div className="steps">
          {[
            ['01', 'Find your space', 'Choose your sport, explore a neighborhood, and compare your options.'],
            [
              '02',
              'Request your time',
              'Pick a court and review the full price. Staff confirm your request.',
            ],
            [
              '03',
              'Show up. Get moving.',
              'Check your confirmation, bring your booking, and enjoy your time on court.',
            ],
          ].map(([n, title, text]) => (
            <div className="step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="container community-section">
        <div>
          <span className="eyebrow">GOOD GAMES, GOOD COMPANY</span>
          <h2>
            Make space for
            <br />a shared game.
          </h2>
          <p>
            Public games let registered adults request a place in a confirmed booking. The organizer decides
            who joins. No matching scores or player rankings.
          </p>
          <Link className="btn light" to="/app/games">
            Explore public games <ArrowRight size={17} />
          </Link>
        </div>
        <div className="community-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <Users size={100} strokeWidth={1} />
          <span>
            MORE ROOM
            <br />
            FOR THE GAME.
          </span>
        </div>
      </section>
      <section className="container owner-cta">
        <div>
          <div className="eyebrow dark">ON THE OTHER SIDE OF THE COURT?</div>
          <h2>Your facility. A simpler game plan.</h2>
          <p className="muted">Manage booking requests, schedules, and attendance in one place.</p>
        </div>
        <Link to="/list-your-facility" className="btn">
          Meet your facility workspace <ArrowUpRight size={17} />
        </Link>
      </section>
    </>
  );
}
export function Facilities() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [view, setView] = useState('list');
  const [locationMessage, setLocationMessage] = useState('');
  const compare = useCompare();
  const result = useFacilities(params.toString());
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== (params.get('q') ?? '')) {
        const next = new URLSearchParams(params);
        next.set('q', query);
        next.delete('page');
        setParams(next, { replace: true });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, params, setParams]);
  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    setParams(next);
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationMessage('Location is unavailable. Search an area manually.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationMessage(
          `One-time location received (${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}). Demo coordinates do not support reliable distance sorting; use an area below.`,
        );
      },
      () => setLocationMessage('Location was not available. You can still search by city or neighborhood.'),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 8000 },
    );
  }
  return (
    <section className="container section discovery">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight size={14} /> Find courts
      </div>
      <div className="section-title">
        <div>
          <div className="eyebrow dark">YOUR GAME, YOUR PLACE</div>
          <h1>Find your next court.</h1>
          <p className="muted">
            Explore spaces to play across Metro Manila. Demonstration listings are labeled.
          </p>
        </div>
        <button className="btn secondary" onClick={locate}>
          <MapPin size={17} />
          Use my location once
        </button>
      </div>
      {locationMessage && (
        <p className="notice" role="status">
          {locationMessage}
        </p>
      )}
      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search facilities"
            placeholder="Facility name or area"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Sport</span>
          <select value={params.get('sport') ?? ''} onChange={(e) => filter('sport', e.target.value)}>
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Maximum hourly price</span>
          <select value={params.get('maxPrice') ?? ''} onChange={(e) => filter('maxPrice', e.target.value)}>
            <option value="">Any price</option>
            <option value="50000">Up to ₱500 / hr</option>
            <option value="100000">Up to ₱1,000 / hr</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Amenity</span>
          <select value={params.get('amenity') ?? ''} onChange={(e) => filter('amenity', e.target.value)}>
            <option value="">All amenities</option>
            <option>Covered courts</option>
            <option>Parking</option>
            <option>Changing rooms</option>
          </select>
        </label>
        <button
          className="icon-button"
          onClick={() => {
            setQuery('');
            setParams({});
          }}
          aria-label="Clear filters"
        >
          <X size={19} />
        </button>
      </div>
      <div className="date-filters">
        <label>
          Available date
          <input
            aria-label="Available date"
            type="date"
            value={params.get('date') ?? ''}
            onChange={(e) => filter('date', e.target.value)}
          />
        </label>
        <label>
          Start time (optional)
          <select
            aria-label="Availability start time"
            disabled={!params.get('date')}
            value={params.get('time') ?? ''}
            onChange={(e) => filter('time', e.target.value)}
          >
            <option value="">Any one-hour opening</option>
            {Array.from(
              { length: 32 },
              (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
            ).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {params.get('date') && (
        <p className="notice">
          Showing facilities with a one-hour opening on {params.get('date')}
          {params.get('time') ? ` at ${params.get('time')} PHT` : ''}. Pending requests do not reserve slots.
          Choose a court to review its schedule.
        </p>
      )}
      <div className="results-bar">
        <span>
          <SlidersHorizontal size={16} />
          {result.data ? `${result.data.total} facilities to explore` : 'Looking for courts…'}
        </span>
        <div>
          <label>
            Sort{' '}
            <select value={params.get('sort') ?? 'name'} onChange={(e) => filter('sort', e.target.value)}>
              <option value="name">Name</option>
              <option value="price">Starting price</option>
            </select>
          </label>
          <button
            className={view === 'list' ? 'toggle active' : 'toggle'}
            onClick={() => setView('list')}
            aria-label="List view"
            aria-pressed={view === 'list'}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            className={view === 'map' ? 'toggle active' : 'toggle'}
            onClick={() => setView('map')}
            aria-label="Map view"
            aria-pressed={view === 'map'}
          >
            <Map size={18} />
          </button>
        </div>
      </div>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : result.data.items.length === 0 ? (
        <div className="empty">
          <Search size={32} />
          <h2>No courts found here.</h2>
          <p>Try another area or fewer filters.</p>
        </div>
      ) : view === 'map' ? (
        <Suspense fallback={<Loading />}>
          <FacilityMap facilities={result.data.items} />
        </Suspense>
      ) : (
        <div className="card-grid">
          {result.data.items.map((f) => (
            <FacilityCard
              key={f.id}
              facility={f}
              compare={compare.toggle}
              selected={compare.items.some((item) => item.id === f.id)}
            />
          ))}
        </div>
      )}
      {result.data && result.data.total > 9 && (
        <div className="pagination">
          <button
            className="btn secondary"
            disabled={result.data.page === 1}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('page', String(result.data.page - 1));
              setParams(next);
            }}
          >
            Previous
          </button>
          <span>
            Page {result.data.page} of {Math.ceil(result.data.total / 9)}
          </span>
          <button
            className="btn secondary"
            disabled={result.data.page * 9 >= result.data.total}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('page', String(result.data.page + 1));
              setParams(next);
            }}
          >
            Next
          </button>
        </div>
      )}
      {compare.items.length > 0 && (
        <div className="compare-tray">
          <span>{compare.items.length} of 3 facilities selected</span>
          <Link className="btn light compact" to="/compare">
            Compare facilities <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </section>
  );
}
const tomorrow = () => new Date(Date.now() + 86400000 + 8 * 3600000).toISOString().slice(0, 10);
export function FacilityDetail() {
  const { slug } = useParams();
  const facility = useQuery({
    queryKey: ['facility', slug],
    queryFn: () => api<Facility>(`/facilities/${slug}`),
  });
  if (facility.isPending) return <Loading />;
  if (facility.error)
    return (
      <div className="container section">
        <ErrorState error={facility.error} />
      </div>
    );
  const f = facility.data;
  return (
    <section className="container section">
      <div className="breadcrumbs">
        <Link to="/facilities">Find courts</Link>
        <ChevronRight size={14} />
        {f.name}
      </div>
      <div className="section-title">
        <div>
          {f.demo && <span className="badge">Fictional demonstration facility</span>}
          <h1>{f.name}</h1>
          <p className="muted">
            <MapPin size={16} className="inline-icon" />
            {f.address}
          </p>
        </div>
        <Link to="/compare" className="text-link">
          View comparison <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="detail-gallery">
        <CourtArt sport={f.courts[0]?.sport} />
        <div>
          <CourtArt sport={f.courts[1]?.sport} />
          <span>Original illustrations · Not venue photographs</span>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <h2>A space for your next game.</h2>
          <p className="body-copy">{f.description}</p>
          <div className="detail-points">
            <span>
              <Clock3 />
              Open {f.openHour}:00–{f.closeHour}:00 PHT
            </span>
            <span>
              <ShieldCheck />
              Demo listing · No business verification
            </span>
          </div>
          <h3>Make yourself at home</h3>
          <div className="amenities">
            {f.amenities.map((a) => (
              <span key={a}>
                <Check size={16} />
                {a}
              </span>
            ))}
          </div>
          <h3>Available courts</h3>
          {f.courts.map((c) => (
            <div className="court-row" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <p>
                  {c.sport} · Up to {c.capacity} people
                </p>
              </div>
              <strong>
                {formatMoney(c.hourlyRate)}
                <small> / hour</small>
              </strong>
            </div>
          ))}
          <h3>Know before you go</h3>
          <p className="body-copy">{f.cancellationPolicy}</p>
          <p className="notice">
            A pending request does not reserve a slot. Wait for facility confirmation before making any
            payment or travelling.
          </p>
        </div>
        <BookingPanel facility={f} />
        <div className="facility-reviews">
          <h3>Reviews</h3>
          <p className="muted">Customer reviews are not currently available.</p>
        </div>
      </div>
    </section>
  );
}
function BookingPanel({ facility }: { facility: Facility }) {
  const { data: auth } = useUser();
  const navigate = useNavigate();
  const [courtId, setCourt] = useState(facility.courts[0]!.id),
    [date, setDate] = useState(tomorrow()),
    [time, setTime] = useState('09:00'),
    [duration, setDuration] = useState('1'),
    [guests, setGuests] = useState(2),
    [mode, setMode] = useState<BookingInput['mode']>('BOOKING_ONLY');
  const [quote, setQuote] = useState<{
      totalCentavos: number;
      policy: string;
      paymentArrangement: string;
      quoteFingerprint: string;
    } | null>(null),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false),
    [idempotency, setIdempotency] = useState(crypto.randomUUID());
  useEffect(() => {
    const raw = sessionStorage.getItem('booking-draft');
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        if (draft.slug === facility.slug) {
          setCourt(draft.courtId);
          setDate(draft.date);
          setTime(draft.time);
          setDuration(draft.duration);
          setGuests(draft.guests);
          if (['BOOKING_ONLY', 'PUBLIC', 'PRIVATE'].includes(draft.mode)) setMode(draft.mode);
        }
      } catch {
        /* ignore malformed safe draft */
      }
    }
  }, [facility.slug]);
  useEffect(() => {
    setQuote(null);
    setIdempotency(crypto.randomUUID());
  }, [courtId, date, time, duration, guests, mode]);
  const availability = useQuery({
    queryKey: ['availability', courtId, date],
    queryFn: () =>
      api<{ occupied: { startsAt: string; endsAt: string; kind: string }[]; refreshedAt: string }>(
        `/courts/${courtId}/availability?date=${date}`,
      ),
    enabled: !!date,
    refetchInterval: 30000,
  });
  function data(): BookingInput {
    const starts = new Date(`${date}T${time}:00+08:00`);
    return {
      courtId,
      startsAt: starts.toISOString(),
      endsAt: new Date(starts.getTime() + Number(duration) * 3600000).toISOString(),
      mode,
      expectedGuests: guests,
    };
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setQuote(await post('/bookings/quote', data()));
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!auth?.user) {
      sessionStorage.setItem(
        'booking-draft',
        JSON.stringify({ slug: facility.slug, courtId, date, time, duration, guests, mode }),
      );
      navigate(`/login?next=${encodeURIComponent(`/facilities/${facility.slug}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const details = data();
      const fingerprint = JSON.stringify({ userId: auth.user.id, ...details });
      const stored = sessionStorage.getItem('booking-attempt');
      let prior: { fingerprint: string; key: string } | null = null;
      try {
        prior = stored ? JSON.parse(stored) : null;
      } catch {
        /* malformed local draft */
      }
      const key = prior?.fingerprint === fingerprint ? prior.key : idempotency;
      sessionStorage.setItem('booking-attempt', JSON.stringify({ fingerprint, key }));
      sessionStorage.setItem(
        'booking-draft',
        JSON.stringify({ slug: facility.slug, courtId, date, time, duration, guests, mode }),
      );
      const result = await post<{ id: string }>(
        '/bookings',
        { ...details, quoteFingerprint: quote?.quoteFingerprint },
        { 'Idempotency-Key': key },
      );
      sessionStorage.removeItem('booking-draft');
      sessionStorage.removeItem('booking-attempt');
      navigate(`/app/bookings/${result.id}`);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="booking-panel">
      <div className="eyebrow dark">MAKE TIME FOR PLAY</div>
      <h2>Choose your court.</h2>
      <p className="muted small">All times in Philippine Time (Asia/Manila).</p>
      <form onSubmit={review}>
        <label>
          Court
          <select value={courtId} onChange={(e) => setCourt(e.target.value)}>
            {facility.courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.sport}
              </option>
            ))}
          </select>
        </label>
        <label>
          Game day
          <input
            required
            type="date"
            value={date}
            min={new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Start time
            <input required type="time" step="1800" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            Duration
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((n) => (
                <option key={n} value={n}>
                  {n} hour{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          People, including you
          <input
            type="number"
            required
            min={1}
            max={facility.courts.find((c) => c.id === courtId)?.capacity ?? 20}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
          />
        </label>
        <label>
          Reservation mode
          <select value={mode} onChange={(e) => setMode(e.target.value as BookingInput['mode'])}>
            <option value="BOOKING_ONLY">Booking only — bring your own group</option>
            <option value="PUBLIC">Public game — approve player requests</option>
            <option value="PRIVATE">Private game — invite players</option>
          </select>
        </label>
        <p className="notice small">
          Your guest count is the total capacity, including you. After facility confirmation, you can publish
          a public game or send private invitations from your booking.
        </p>
        <button className="btn full" disabled={busy}>
          {busy ? 'Checking…' : 'Review request'}
          <ArrowRight size={17} />
        </button>
      </form>
      {error && <ErrorState error={error} />}{' '}
      {sessionStorage.getItem('booking-attempt') && auth?.user && (
        <button
          className="text-button"
          onClick={async () => {
            try {
              const attempt = JSON.parse(sessionStorage.getItem('booking-attempt')!);
              const recovered = await api<{ id: string }>(`/booking-submissions/${attempt.key}`);
              sessionStorage.removeItem('booking-attempt');
              navigate(`/app/bookings/${recovered.id}`);
            } catch (e) {
              setError(e as Error);
            }
          }}
        >
          Check whether my last submission succeeded
        </button>
      )}
      {quote && (
        <div className="quote-review" aria-live="polite">
          <div className="price-line">
            <strong>Total for your court time</strong>
            <strong>{formatMoney(quote.totalCentavos)}</strong>
          </div>
          <p className="small">{quote.paymentArrangement}</p>
          <p className="small">{quote.policy}</p>
          <button className="btn full" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Submitting…' : auth?.user ? 'Submit booking request' : 'Log in to continue'}
          </button>
          <p className="small muted">By submitting, you accept these terms. Staff approval is required.</p>
        </div>
      )}
      <div className="availability">
        <strong>Allocated times on this day</strong>
        {availability.isPending ? (
          <p>Refreshing…</p>
        ) : availability.error ? (
          <p className="error-text">Availability unavailable. Try refreshing before booking.</p>
        ) : (
          <>
            {availability.data.occupied.length ? (
              availability.data.occupied.map((slot, i) => (
                <p key={i}>
                  {new Date(slot.startsAt).toLocaleTimeString('en-PH', {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  –
                  {new Date(slot.endsAt).toLocaleTimeString('en-PH', {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {slot.kind === 'CLOSURE' ? 'Closed' : 'Reserved'}
                </p>
              ))
            ) : (
              <p>No allocated times found.</p>
            )}
            <small>Last refreshed {new Date(availability.data.refreshedAt).toLocaleTimeString()}</small>
          </>
        )}
      </div>
    </aside>
  );
}
export function Compare() {
  const { items, toggle } = useCompare();
  return (
    <section className="container section">
      <div className="eyebrow dark">FIND THE RIGHT SPACE</div>
      <h1>A closer look, side by side.</h1>
      <p className="muted">Compare up to three facilities. Prices shown are starting hourly rates.</p>
      {items.length ? (
        <div className="compare-grid">
          {items.map((f) => (
            <div className="panel" key={f.id}>
              <button
                className="icon-button float-right"
                onClick={() => toggle(f)}
                aria-label={`Remove ${f.name}`}
              >
                <X />
              </button>
              <h2>{f.name}</h2>
              <p>{f.area}</p>
              <dl>
                <dt>Starts at</dt>
                <dd>{formatMoney(Math.min(...f.courts.map((c) => c.hourlyRate)))} / hour</dd>
                <dt>Sports</dt>
                <dd>{f.courts.map((c) => c.sport).join(', ')}</dd>
                <dt>Amenities</dt>
                <dd>{f.amenities.join(', ')}</dd>
                <dt>Hours (PHT)</dt>
                <dd>
                  {f.openHour}:00–{f.closeHour}:00
                </dd>
                <dt>Listing</dt>
                <dd>{f.demo ? 'Fictional demonstration' : 'Published facility'}</dd>
              </dl>
              <Link className="btn" to={`/facilities/${f.slug}`}>
                View courts <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>Your comparison starts with a court.</h2>
          <Link className="btn" to="/facilities">
            Explore facilities
          </Link>
        </div>
      )}
    </section>
  );
}
