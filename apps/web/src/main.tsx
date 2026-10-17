import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell, Menu, ShieldCheck, X } from 'lucide-react';
import type { User } from '@larosentry/contracts';
import { api, post, ApiError } from './api';
import './styles.css';
import './theme.css';
import { initializeTheme, ThemeToggle } from './theme';
initializeTheme();
const Home = lazy(() => import('./public').then((m) => ({ default: m.Home })));
const Onboarding = lazy(() => import('./onboarding'));
const StaffInvitation = lazy(() => import('./onboarding').then((m) => ({ default: m.StaffInvitation })));
const Facilities = lazy(() => import('./public').then((m) => ({ default: m.Facilities })));
const FacilityDetail = lazy(() => import('./public').then((m) => ({ default: m.FacilityDetail })));
const Compare = lazy(() => import('./public').then((m) => ({ default: m.Compare })));
const Information = lazy(() => import('./information'));
const Auth = lazy(() => import('./auth'));
const Workspace = lazy(() => import('./workspace'));
const Management = lazy(() => import('./management'));
const Scheduler = lazy(() => import('./scheduler'));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
export function useUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User | null; demoMode?: boolean }>('/auth/me'),
    retry: false,
  });
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading your next game…
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <strong>We couldn’t complete that.</strong>
      <p>{error.message}</p>
      {error instanceof ApiError && error.status === 401 && (
        <Link className="btn secondary" to={`/login?next=${encodeURIComponent(window.location.pathname)}`}>
          Log in again
        </Link>
      )}
      {retry && (
        <button className="btn secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="LaroSentry home">
      <span className="brand-mark">
        <ShieldCheck size={24} />
      </span>
      Laro<span>Sentry</span>
      <span className="brand-dot">.</span>
    </Link>
  );
}
function Shell() {
  const { data } = useUser();
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<{ admin: boolean; owner: boolean; staff: boolean }>('/workspaces'),
    enabled: !!data?.user,
  });
  const location = useLocation();
  const [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const [logoutError, setLogoutError] = useState<Error | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    menuPanel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);
  useEffect(() => {
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  async function logout() {
    try {
      await post('/auth/logout');
      // A fresh document clears private query data without racing protected-route redirects.
      window.location.replace('/');
    } catch (e) {
      setLogoutError(e as Error);
    }
  }
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="pilot-strip">
        {import.meta.env.VITE_PUBLIC_PILOT === '1' ? (
          'Test pilot only. Fictional facilities; use test information and synthetic documents. Email/SMS delivery is not configured.'
        ) : (
          <>
            A little more play, a little closer to home. <span>Find courts. Plan games. Keep track.</span>
          </>
        )}
      </div>
      {data?.demoMode && (
        <div className="notice" role="status" style={{ margin: 0, textAlign: 'center' }}>
          DEMO MODE — Verification bypassed for named local demo accounts. Login, roles and facility
          permissions remain enforced.
        </div>
      )}
      <header className="site-header">
        <div className="nav-wrap">
          <Brand />
          <ThemeToggle />
          <button
            className="icon-button mobile-menu"
            ref={menuButton}
            aria-controls="main-navigation"
            aria-label={menu ? 'Close menu' : 'Open menu'}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <nav
            id="main-navigation"
            ref={menuPanel}
            aria-label="Main navigation"
            className={menu ? 'open' : ''}
            onClick={(event) => {
              if ((event.target as Element).closest('a')) setMenu(false);
            }}
          >
            {(workspaces.data?.admin || workspaces.data?.owner || workspaces.data?.staff) && (
              <NavLink to={workspaces.data.admin ? '/admin' : workspaces.data.owner ? '/owner' : '/staff'}>
                {workspaces.data.admin
                  ? 'Admin workspace'
                  : workspaces.data.owner
                    ? 'Owner workspace'
                    : 'Staff workspace'}
              </NavLink>
            )}
            <NavLink to="/facilities">Find courts</NavLink>
            <NavLink to="/scheduler">NOLTA scheduler</NavLink>
            <NavLink to="/app/games">Public games</NavLink>
            <NavLink to="/how-it-works">How it works</NavLink>
            <NavLink to="/list-your-facility">
              For facilities <ArrowUpRight size={14} />
            </NavLink>
            {data?.user ? (
              <div className="mobile-account-links">
                <Link to="/app/bookings">My bookings</Link>
                <Link to="/app/saved">Saved places</Link>
                <Link to="/app/invitations">Invitations</Link>
                <Link to="/app/notifications">Notifications</Link>
                <Link to="/app/reports">My reports</Link>
                <Link to="/app/applications">Facility applications</Link>
                <Link to="/app/settings/profile">Account settings</Link>
                <Link to="/app/settings/verification">Account verification</Link>
                <button className="text-button" onClick={() => void logout()}>
                  Log out
                </button>
              </div>
            ) : (
              <div className="mobile-account-links">
                <Link to="/login">Log in</Link>
                <Link to="/register">Sign up</Link>
              </div>
            )}
          </nav>
          <div className="account-nav">
            {data?.user ? (
              <>
                {(data.user.needsOnboarding || !data.user.phoneVerified) && (
                  <Link to="/onboarding" className="text-button">
                    Verify account
                  </Link>
                )}
                <Link to="/app/notifications" className="icon-button" aria-label="Notifications">
                  <Bell size={20} />
                </Link>
                <Link className="btn secondary compact" to="/app/bookings">
                  My bookings
                </Link>
                <button className="text-button" onClick={() => void logout()}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="login-link">
                  Log in
                </Link>
                <Link to="/register" className="btn compact">
                  Sign up <ArrowUpRight size={16} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {!online && (
        <div className="offline" role="status">
          You’re offline. Reconnect before submitting a booking. Saved form details will remain on this page.
        </div>
      )}
      <main id="main">
        {logoutError && (
          <div className="container">
            <ErrorState error={logoutError} />
          </div>
        )}
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/facilities" element={<Facilities />} />
            <Route path="/facilities/:slug" element={<FacilityDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/onboarding/*" element={<Onboarding />} />
            <Route path="/staff-invitations" element={<StaffInvitation />} />
            <Route path="/app/settings/preferences" element={<Onboarding />} />
            <Route path="/app/settings/verification" element={<Onboarding />} />
            {['login', 'register', 'verify-email', 'forgot-password', 'reset-password', 'mfa'].map((path) => (
              <Route key={path} path={`/${path}`} element={<Auth />} />
            ))}
            <Route path="/app/*" element={<Workspace />} />
            <Route path="/owner/*" element={<Workspace />} />
            <Route path="/staff/*" element={<Workspace />} />
            <Route path="/admin/*" element={<Workspace />} />
            <Route path="/manage" element={<Management />} />
            <Route path="/scheduler/*" element={<Scheduler />} />
            {['how-it-works', 'list-your-facility', 'help', 'privacy', 'terms', 'security'].map((path) => (
              <Route key={path} path={`/${path}`} element={<Information />} />
            ))}
            <Route
              path="*"
              element={
                <section className="container section">
                  <h1>That page is out of bounds.</h1>
                  <Link className="btn" to="/">
                    Back home
                  </Link>
                </section>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <footer>
        <div className="container footer-top">
          <div>
            <Brand />
            <p>Find your court. Make time for play.</p>
          </div>
          <div>
            <strong>Get out and play</strong>
            <Link to="/facilities">Find courts</Link>
            <Link to="/how-it-works">How booking works</Link>
            <Link to="/app/bookings">Your bookings</Link>
          </div>
          <div>
            <strong>Good to know</strong>
            <Link to="/help">Help & contact</Link>
            <Link to="/privacy">Privacy notice</Link>
            <Link to="/terms">Terms of use</Link>
            <Link to="/security">Security & acceptable use</Link>
          </div>
          <div className="footer-note">
            <ShieldCheck />
            <strong>Built with care.</strong>
            <p>
              Staff-approved bookings.
              <br />
              Privacy-conscious participation.
              <br />
              More room for the game.
            </p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} LaroSentry</span>
          <span>Payments are arranged directly with facilities.</span>
          <span>Made for Metro Manila ↗</span>
        </div>
      </footer>
    </>
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
