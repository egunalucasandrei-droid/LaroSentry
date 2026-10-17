import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, formatTime } from '@larosentry/contracts';
import { api } from './api';
import { Loading, ErrorState } from './main';
import { Recommendations } from './onboarding';
type Overview = {
  pending: number;
  upcoming: number;
  saved: number;
  unread: number;
  checkedAt: string;
  recent: {
    id: string;
    reference: string;
    status: string;
    startsAt: string;
    endsAt: string;
    totalCentavos: number;
    court: { name: string; facility: { name: string } };
  }[];
  notifications: { id: string; title: string; href: string; readAt: string | null; createdAt: string }[];
};
export default function PlayerHome() {
  const result = useQuery({
    queryKey: ['player-overview'],
    queryFn: () => api<Overview>('/player/overview'),
    refetchInterval: 30000,
  });
  return (
    <>
      <span className="eyebrow dark">YOUR NEXT GAME</span>
      <h1>Your playing plan.</h1>
      <p className="muted">
        Requests, reservations and updates, together. A pending request does not reserve court time.
      </p>
      <div className="button-row">
        <Link className="btn" to="/facilities">
          Find a court
        </Link>
        <Link className="btn secondary" to="/app/bookings">
          My bookings
        </Link>
        <Link className="btn secondary" to="/app/games">
          Explore public games
        </Link>
      </div>
      {result.isPending ? (
        <Loading />
      ) : result.error ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : (
        <>
          <div className="stats-grid">
            {(
              [
                ['Upcoming confirmed reservations', result.data.upcoming, '/app/bookings'],
                ['Pending requests', result.data.pending, '/app/bookings'],
                ['Saved published facilities', result.data.saved, '/app/saved'],
                ['Unread notifications', result.data.unread, '/app/notifications'],
              ] as const
            ).map(([label, value, href]) => (
              <Link className="panel" to={href} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </Link>
            ))}
          </div>
          <div className="presentation-columns">
            <section>
              <h2>Recent booking activity</h2>
              {result.data.recent.length ? (
                result.data.recent.map((b) => (
                  <Link className="panel presentation-record" key={b.id} to={`/app/bookings/${b.id}`}>
                    <span className={`badge ${b.status.toLowerCase()}`}>{b.status.replaceAll('_', ' ')}</span>
                    <h3>{b.court.facility.name}</h3>
                    <p>
                      {b.court.name} · {formatTime(b.startsAt)}
                    </p>
                    <p>
                      {formatMoney(b.totalCentavos)} · {b.reference}
                    </p>
                    <span className="text-link">View booking →</span>
                  </Link>
                ))
              ) : (
                <div className="panel">
                  <p>No bookings yet. Choose a facility and send your first request.</p>
                  <Link to="/facilities">Find a court →</Link>
                </div>
              )}
            </section>
            <section>
              <h2>Latest updates</h2>
              {result.data.notifications.length ? (
                result.data.notifications.map((n) => (
                  <Link
                    className="panel presentation-record"
                    key={n.id}
                    to={n.href.startsWith('/') && !n.href.startsWith('//') ? n.href : '/app/notifications'}
                  >
                    <strong>{n.title}</strong>
                    <p className="small muted">
                      {formatTime(n.createdAt)} · {n.readAt ? 'Read' : 'Unread'}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="panel">You’re all caught up. Booking and account updates will appear here.</p>
              )}
              <Link to="/app/notifications">All notifications →</Link>
            </section>
          </div>
          <p className="small muted">
            Live account counts · updated {formatTime(result.data.checkedAt)}. Upcoming means confirmed
            sessions that have not ended; pending excludes expired requests.
          </p>
        </>
      )}
      <Recommendations embedded />
    </>
  );
}
