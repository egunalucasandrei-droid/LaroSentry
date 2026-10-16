import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Users } from 'lucide-react';
import { formatTime, type Booking } from '@larosentry/contracts';
import { api, post } from './api';
import { ErrorState, Loading } from './main';

type Game = {
  id: string;
  mode: string;
  status: string;
  published: boolean;
  startsAt: string;
  endsAt: string;
  rules: string;
  capacity: number;
  spaces: number;
  offlineGuests: number;
  organizer: string;
  isOrganizer: boolean;
  participation: string | null;
  facility: string;
  area: string;
  court: string;
  sport: string;
};
type Invitation = { id: string; bookingId: string; expiresAt: string; startsAt: string; facility: string };
type Roster = {
  participants: { id: string; userId: string; nickname: string; state: string }[];
  invitations: { id: string; nickname: string; state: string; expiresAt: string }[];
};
function useAction(refresh?: () => void) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState<Error | null>(null);
  async function run(path: string, body: object = {}) {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const result = await post<{ message: string }>(path, body);
      setMessage(result.message);
      await client.invalidateQueries({ queryKey: ['community'] });
      refresh?.();
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
    run,
    feedback: (
      <>
        {message && (
          <p role="status" className="notice success">
            {message}
          </p>
        )}
        {error && <ErrorState error={error} />}
      </>
    ),
  };
}
export function GameOrganizer({ booking: b, refresh }: { booking: Booking; refresh: () => void }) {
  const action = useAction(refresh);
  const [mode, setMode] = useState(b.mode),
    [published, setPublished] = useState(b.published);
  const roster = useQuery({
    queryKey: ['community', 'roster', b.id],
    queryFn: () => api<Roster>(`/games/${b.id}/roster`),
  });
  async function settings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(`/games/${b.id}/settings`, {
      mode,
      published: mode === 'PUBLIC' && published,
      offlineGuests: Number(form.get('offlineGuests')),
      rules: String(form.get('rules')),
    });
  }
  return (
    <section className="panel" aria-label="Manage game participation">
      <div className="eyebrow dark">MAKE ROOM FOR YOUR PEOPLE</div>
      <h2>Manage your game</h2>
      <p>
        You count as one place. Offline guests and approved players count toward your {b.expectedGuests}
        -person capacity. Pending requests and invitations do not reserve places.
      </p>
      {action.feedback}
      <form onSubmit={settings}>
        <label>
          Game visibility
          <select
            aria-label="Game visibility"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setPublished(false);
            }}
          >
            <option value="BOOKING_ONLY">Booking only</option>
            <option value="PUBLIC">Public game</option>
            <option value="PRIVATE">Private game</option>
          </select>
        </label>
        <label>
          Offline guests (excluding you)
          <input
            name="offlineGuests"
            type="number"
            min={0}
            max={b.expectedGuests - 1}
            defaultValue={b.offlineGuests}
            required
          />
        </label>
        <label>
          Game rules
          <textarea
            name="rules"
            defaultValue={b.rules}
            maxLength={1000}
            placeholder="Skill level, equipment to bring, and group expectations. Keep contact details private."
          />
        </label>
        {mode === 'PUBLIC' && (
          <label className="checkbox-label">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Publish this game for signed-in adult players. My nickname, facility, time, capacity and rules
            will be visible.
          </label>
        )}
        <p className="small muted">
          Resolve active players, requests and invitations before changing modes. Unpublishing stops new
          requests; existing players keep access.
        </p>
        <button className="btn" disabled={action.busy}>
          Save game settings
        </button>
      </form>
      {b.mode === 'PRIVATE' && (
        <form
          className="section"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            if (await action.run(`/games/${b.id}/invite`, { email: new FormData(form).get('email') }))
              form.reset();
          }}
        >
          <h3>Invite someone you know</h3>
          <p>
            They must sign in with the invited, verified account. Invitations expire within 48 hours or when
            the game starts.
          </p>
          <label>
            Player email
            <input name="email" type="email" maxLength={254} required autoComplete="off" />
          </label>
          <button className="btn secondary" disabled={action.busy}>
            Send private invitation
          </button>
        </form>
      )}
      {roster.isPending ? (
        <Loading />
      ) : roster.error ? (
        <ErrorState error={roster.error} retry={() => void roster.refetch()} />
      ) : (
        <>
          <h3>Player requests and places</h3>
          {!roster.data.participants.length && <p className="muted">No player requests yet.</p>}
          {roster.data.participants.map((p) => (
            <div className="community-row" key={p.id}>
              <div>
                <strong>{p.nickname}</strong>
                <span className="badge">{p.state}</span>
              </div>
              <div className="community-actions">
                {p.state === 'REQUESTED' && (
                  <button
                    className="btn compact"
                    disabled={action.busy}
                    onClick={() => void action.run(`/games/${b.id}/participants/${p.id}`, { approve: true })}
                  >
                    Approve {p.nickname}
                  </button>
                )}
                {['REQUESTED', 'APPROVED'].includes(p.state) && (
                  <button
                    className="btn secondary compact"
                    disabled={action.busy}
                    onClick={() => void action.run(`/games/${b.id}/participants/${p.id}`, { approve: false })}
                  >
                    {p.state === 'APPROVED' ? 'Remove' : 'Decline'} {p.nickname}
                  </button>
                )}
              </div>
            </div>
          ))}
          {!!roster.data.invitations.length && <h3>Private invitations</h3>}
          {roster.data.invitations.map((i) => (
            <div className="community-row" key={i.id}>
              <div>
                <strong>{i.nickname}</strong>
                <span className="badge">
                  {i.state === 'PENDING' && new Date(i.expiresAt) <= new Date() ? 'EXPIRED' : i.state}
                </span>
                <p className="small">Expires {formatTime(i.expiresAt)}</p>
              </div>
              {i.state === 'PENDING' && (
                <button
                  className="btn secondary compact"
                  disabled={action.busy}
                  onClick={() => void action.run(`/game-invitations/${i.id}/revoke`)}
                >
                  Revoke invitation
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function Community() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const id = pathname.match(/^\/app\/games\/([^/]+)$/)?.[1];
  if (pathname === '/app/invitations') return <Invitations />;
  if (id) return <GameDetail id={id} key={id} />;
  return <GameList />;
}
function GameList() {
  const [tab, setTab] = useState('Public games');
  const games = useQuery({
    queryKey: ['community', 'games', tab],
    queryFn: () => api<Game[]>(tab === 'Public games' ? '/games' : '/my-games'),
    refetchInterval: 30000,
  });
  return (
    <>
      <div className="eyebrow dark">FIND YOUR NEXT GAME</div>
      <h1>Good games. Good company.</h1>
      <p className="muted">
        Join a confirmed game with organizer approval. No player matching or contact directory.
      </p>
      <div className="tabs" role="group" aria-label="Game lists">
        {['Public games', 'My participation'].map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {games.isPending ? (
        <Loading />
      ) : games.error ? (
        <ErrorState error={games.error} retry={() => void games.refetch()} />
      ) : games.data.length ? (
        <div className="game-grid">
          {games.data.map((g) => (
            <Link to={`/app/games/${g.id}`} className="panel game-card" key={g.id}>
              <span className="eyebrow dark">{g.sport}</span>
              <h2>{g.facility}</h2>
              <p>
                {g.court} · {g.area}
              </p>
              <p>
                <CalendarDays size={16} /> {formatTime(g.startsAt)}
              </p>
              <p>
                <Users size={16} /> {g.spaces} of {g.capacity} places open
              </p>
              <p className="small">Organized by {g.organizer}</p>
              <span className="badge">{g.participation ?? g.status}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Users size={36} />
          <h2>{tab === 'Public games' ? 'The next game could be yours.' : 'Your next group is waiting.'}</h2>
          <p>
            {tab === 'Public games'
              ? 'No published games available yet. Book a court, then publish after facility confirmation.'
              : 'Request to join a public game or accept a private invitation.'}
          </p>
          <Link className="btn" to="/facilities">
            Find a court
          </Link>
        </div>
      )}
      <Blocks />
    </>
  );
}
function GameDetail({ id }: { id: string }) {
  const navigate = useNavigate(),
    action = useAction();
  const game = useQuery({
    queryKey: ['community', 'game', id],
    queryFn: () => api<Game>(`/games/${id}`),
    refetchInterval: 30000,
  });
  if (game.isPending) return <Loading />;
  if (game.error) return <ErrorState error={game.error} retry={() => void game.refetch()} />;
  const g = game.data,
    upcoming = g.status === 'CONFIRMED' && new Date(g.startsAt) > new Date();
  return (
    <>
      <Link className="text-link" to="/app/games">
        Back to games
      </Link>
      <section className="panel">
        <span className="eyebrow dark">
          {g.sport} · {g.mode}
        </span>
        <h1>{g.facility}</h1>
        <p>
          {g.court} · {g.area}
        </p>
        <p>
          {formatTime(g.startsAt)} to {formatTime(g.endsAt)}
        </p>
        <p>Organized by {g.organizer}</p>
        <span className="badge">{g.status}</span>
        <h2>
          {g.spaces} {g.spaces === 1 ? 'place' : 'places'} open
        </h2>
        <p>
          Capacity {g.capacity}, including the organizer, offline guests and approved players. This listing
          does not collect player payments.
        </p>
        <h3>Game rules</h3>
        <p className="game-rules">
          {g.rules ||
            'No additional rules provided. Follow the facility rules and ask the organizer before participating.'}
        </p>
        {action.feedback}
        {g.participation && (
          <p className="notice">
            Your participation: {g.participation}.{' '}
            {g.participation === 'REQUESTED' && 'Wait for organizer approval before attending.'}
          </p>
        )}
        <div className="community-actions">
          {g.isOrganizer ? (
            <Link className="btn" to={`/app/bookings/${id}`}>
              Manage your game
            </Link>
          ) : (
            <>
              {upcoming &&
                g.mode === 'PUBLIC' &&
                g.published &&
                (!g.participation || g.participation === 'LEFT') && (
                  <button
                    className="btn"
                    disabled={action.busy || !g.spaces}
                    onClick={() => void action.run(`/games/${id}/join`)}
                  >
                    {g.spaces ? 'Request to join' : 'Game full'}
                  </button>
                )}
              {upcoming && ['REQUESTED', 'APPROVED'].includes(g.participation ?? '') && (
                <button
                  className="btn secondary"
                  disabled={action.busy}
                  onClick={async () => {
                    if (await action.run(`/games/${id}/leave`)) navigate('/app/games');
                  }}
                >
                  {g.participation === 'REQUESTED' ? 'Withdraw request' : 'Leave game'}
                </button>
              )}
              <button
                className="text-button"
                disabled={action.busy}
                onClick={async () => {
                  if (
                    window.confirm(
                      'Block new interactions with this organizer? Existing participation stays active until you leave.',
                    ) &&
                    (await action.run(`/games/${id}/block`))
                  )
                    navigate('/app/games');
                }}
              >
                Block organizer
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
}
function Invitations() {
  const action = useAction();
  const invitations = useQuery({
    queryKey: ['community', 'invitations'],
    queryFn: () => api<Invitation[]>('/game-invitations'),
    refetchInterval: 30000,
  });
  return (
    <>
      <div className="eyebrow dark">A PLACE IN THE GAME</div>
      <h1>Your invitations</h1>
      <p>
        Only invitations addressed to your signed-in account appear here. Accepting claims an available place.
      </p>
      {action.feedback}
      {invitations.isPending ? (
        <Loading />
      ) : invitations.error ? (
        <ErrorState error={invitations.error} retry={() => void invitations.refetch()} />
      ) : invitations.data.length ? (
        invitations.data.map((i) => (
          <section className="panel" key={i.id}>
            <h2>{i.facility}</h2>
            <p>{formatTime(i.startsAt)}</p>
            <p className="small">Invitation expires {formatTime(i.expiresAt)}</p>
            <div className="community-actions">
              <Link className="text-link" to={`/app/games/${i.bookingId}`}>
                Review game details
              </Link>
              <button
                className="btn"
                disabled={action.busy}
                onClick={() => void action.run(`/game-invitations/${i.id}/respond`, { accept: true })}
              >
                Accept invitation
              </button>
              <button
                className="btn secondary"
                disabled={action.busy}
                onClick={() => void action.run(`/game-invitations/${i.id}/respond`, { accept: false })}
              >
                Decline invitation
              </button>
            </div>
          </section>
        ))
      ) : (
        <div className="empty">
          <CalendarDays size={36} />
          <h2>No pending invitations.</h2>
          <p>Accepted games appear under My participation.</p>
          <Link className="btn" to="/app/games">
            Explore games
          </Link>
        </div>
      )}
    </>
  );
}
function Blocks() {
  const action = useAction();
  const blocks = useQuery({
    queryKey: ['community', 'blocks'],
    queryFn: () => api<{ id: string; nickname: string }[]>('/blocks'),
  });
  if (blocks.error) return <ErrorState error={blocks.error} retry={() => void blocks.refetch()} />;
  if (!blocks.data?.length) return null;
  return (
    <section className="panel">
      <h2>Blocked organizers</h2>
      {action.feedback}
      {blocks.data.map((p) => (
        <div className="community-row" key={p.id}>
          <strong>{p.nickname}</strong>
          <button
            className="btn secondary compact"
            disabled={action.busy}
            onClick={() => void action.run(`/blocks/${p.id}/remove`)}
          >
            Unblock {p.nickname}
          </button>
        </div>
      ))}
    </section>
  );
}
