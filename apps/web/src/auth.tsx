import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { registerSchema, POLICY_VERSION, type User } from '@larosentry/contracts';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { api, post } from './api';
import type { Access } from './role-workspaces';
import { ErrorState, useUser } from './main';
import { CourtArt } from './court-art';
type RegisterForm = z.input<typeof registerSchema>;
export default function Auth() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<Error | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [linkToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (linkToken) history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [linkToken]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { policyVersion: POLICY_VERSION },
  });
  const nextValue = params.get('next');
  const next =
    nextValue?.startsWith('/') && !nextValue.startsWith('//') && !nextValue.includes('\\')
      ? nextValue
      : '/app/bookings';
  async function run(path: string, data: unknown) {
    setError(null);
    setMessage('');
    setBusy(true);
    try {
      const result = await post<{ message?: string; user?: User }>(path, data);
      if (path === '/auth/login') {
        qc.clear();
        qc.setQueryData(['me'], { user: result.user });
        if (
          result.user?.needsOnboarding ||
          !result.user?.emailVerified ||
          (result.user.role !== 'PLAYER' && !result.user.phoneVerified && !result.user.demoAccessAllowed)
        ) {
          navigate('/onboarding');
          return;
        }
        const access = await api<Access>('/workspaces');
        const home = access.admin
          ? '/admin'
          : access.owner
            ? '/owner'
            : access.staff
              ? '/staff'
              : '/app/bookings';
        navigate(nextValue ? next : home);
      } else {
        setMessage(result.message ?? 'Saved.');
        if (path === '/auth/verify-email')
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['me'] }),
            qc.invalidateQueries({ queryKey: ['onboarding'] }),
          ]);
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (pathname === '/reset-password') data.token = linkToken;
    void run(`/auth${pathname}`, data);
  }
  const titles: Record<string, string> = {
    '/login': 'Good to see you again.',
    '/register': 'Your next game starts here.',
    '/verify-email': 'One small step. Then, play.',
    '/forgot-password': 'Let’s get you back in.',
    '/reset-password': 'A fresh start for your account.',
  };
  if (pathname === '/mfa')
    return (
      <section className="container section narrow">
        <MfaPanel />
      </section>
    );
  return (
    <div className="auth-page">
      <div className="auth-art">
        <CourtArt hero />
        <div>
          <div className="eyebrow">MAKE ROOM FOR PLAY</div>
          <h2>
            The game is better
            <br />
            when you’re there.
          </h2>
          <p>
            Your court time, in one place.
            <br />
            Request, confirm and get ready to play.
          </p>
        </div>
      </div>
      <section className="auth-form">
        <div className="eyebrow dark">WELCOME TO LAROSENTRY</div>
        <h1>{titles[pathname]}</h1>
        <p className="muted">
          {pathname === '/register'
            ? 'Create your adult account to request court time.'
            : pathname === '/login'
              ? 'Log in to keep your plans moving.'
              : 'Use the secure link sent to your email address.'}
        </p>
        {error && <ErrorState error={error} />}{' '}
        {message && (
          <div className="notice success" role="status">
            {message}
            {pathname !== '/login' && (
              <p>
                <Link to={`/login?next=${encodeURIComponent(next)}`}>
                  Continue to log in <ArrowRight size={14} />
                </Link>
              </p>
            )}
          </div>
        )}
        {pathname === '/register' ? (
          <form onSubmit={handleSubmit((data) => run('/auth/register', data))}>
            <label>
              Email address
              <input type="email" autoComplete="email" {...register('email')} />
              {errors.email && <small className="error-text">{errors.email.message}</small>}
            </label>
            <label>
              Nickname
              <input autoComplete="nickname" {...register('nickname')} />
              {errors.nickname && <small className="error-text">{errors.nickname.message}</small>}
            </label>
            <label>
              Philippine mobile number
              <input
                type="tel"
                autoComplete="tel"
                placeholder="+639171234567 or 09171234567"
                {...register('phone')}
              />
              {errors.phone && <small className="error-text">{errors.phone.message}</small>}
            </label>
            <label>
              Password
              <input
                aria-label="Password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
              <small>At least 12 characters. Use a unique passphrase.</small>
              {errors.password && <small className="error-text">{errors.password.message}</small>}
            </label>
            <label>
              Confirm password
              <input type="password" autoComplete="new-password" {...register('confirmPassword')} />
              {errors.confirmPassword && (
                <small className="error-text">{errors.confirmPassword.message}</small>
              )}
            </label>
            <label className="checkbox">
              <input type="checkbox" {...register('adult')} />I declare that I am at least 18 years old.
            </label>
            {errors.adult && <small className="error-text">{errors.adult.message}</small>}
            <label className="checkbox">
              <input type="checkbox" {...register('acceptedTerms')} />
              <span>
                I accept the <Link to="/terms">terms of use</Link>.
              </span>
            </label>
            {errors.acceptedTerms && <small className="error-text">{errors.acceptedTerms.message}</small>}
            <label className="checkbox">
              <input type="checkbox" {...register('acceptedPrivacy')} />
              <span>
                I accept the <Link to="/privacy">privacy notice</Link>.
              </span>
            </label>
            {errors.acceptedPrivacy && <small className="error-text">{errors.acceptedPrivacy.message}</small>}
            <button className="btn full" disabled={busy}>
              {busy ? 'Creating your account…' : 'Create account'}
              <ArrowRight size={17} />
            </button>
            <p className="center small">
              Already part of the game? <Link to={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
            </p>
          </form>
        ) : pathname === '/verify-email' ? (
          <>
            <button
              className="btn full"
              disabled={busy || !linkToken || !!message}
              onClick={() => void run('/auth/verify-email', { token: linkToken })}
            >
              Verify my email <ArrowRight size={17} />
            </button>
            {!linkToken && <p className="notice">Open the complete verification link from your email.</p>}
            {message && (
              <p>
                <Link className="btn secondary" to="/onboarding">
                  Continue account verification
                </Link>
              </p>
            )}
          </>
        ) : (
          <form onSubmit={submit}>
            {pathname !== '/reset-password' && (
              <label>
                Email address
                <input required name="email" type="email" autoComplete="email" maxLength={254} />
              </label>
            )}
            {pathname !== '/forgot-password' && (
              <label>
                {pathname === '/reset-password' ? 'New password' : 'Password'}
                <input
                  required
                  name="password"
                  type="password"
                  autoComplete={pathname === '/login' ? 'current-password' : 'new-password'}
                  minLength={pathname === '/reset-password' ? 12 : 1}
                  maxLength={128}
                />
              </label>
            )}
            {pathname === '/login' && (
              <Link className="small right" to="/forgot-password">
                Forgot password?
              </Link>
            )}
            <button className="btn full" disabled={busy || (pathname === '/reset-password' && !linkToken)}>
              {busy
                ? 'Please wait…'
                : pathname === '/login'
                  ? 'Log in'
                  : pathname === '/forgot-password'
                    ? 'Send recovery email'
                    : 'Change password'}
              <ArrowRight size={17} />
            </button>
            {pathname === '/login' && (
              <p className="center small">
                New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
              </p>
            )}
          </form>
        )}
        <div className="auth-assurance">
          <ShieldCheck size={18} />
          <span>
            Your session stays in a protected cookie.
            <br />
            Your email is never part of a public profile.
          </span>
        </div>
      </section>
    </div>
  );
}
export function MfaPanel() {
  const demoNavigate = useNavigate();
  const { pathname: mfaPath } = useLocation();
  const [showAuthenticator, setShowAuthenticator] = useState(false);
  const [mfaParams] = useSearchParams();
  const requestedWorkspace = mfaParams.get('next');
  const user = useUser();
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user.isPending && !user.data?.user) return <Navigate to="/login?next=/mfa" replace />;
  async function submit(event: FormEvent<HTMLFormElement>, path: string) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setError(null);
    setBusy(true);
    try {
      if (path === 'demo-access') {
        const result = await post<{ message: string }>('/auth/demo-access', data);
        setMessage(result.message);
        await qc.invalidateQueries({ queryKey: ['me'] });
        demoNavigate(
          requestedWorkspace?.startsWith('/') &&
            !requestedWorkspace.startsWith('//') &&
            !requestedWorkspace.includes('\\')
            ? requestedWorkspace
            : user.data?.user?.role === 'ADMIN'
              ? '/manage'
              : mfaPath.startsWith('/staff') || user.data?.user?.role === 'FACILITY_STAFF'
                ? '/staff'
                : '/owner',
        );
      } else if (path === 'setup') setSetup(await post('/auth/mfa/setup', data));
      else {
        const result = await post<{ recoveryCodes: string[]; message: string }>('/auth/mfa/verify', data);
        setCodes(result.recoveryCodes);
        setMessage(result.message);
        setSetup(null);
        await qc.invalidateQueries({ queryKey: ['me'] });
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <div className="eyebrow dark">AN EXTRA LAYER OF CARE</div>
      <h2>Protect your workspace.</h2>
      <p>
        {user.data?.user?.demoAccessAllowed
          ? 'This isolated demo offers password-confirmed preview access. Normal accounts require MFA.'
          : 'Owners, staff, and administrators must verify MFA before using privileged operations.'}
      </p>
      {error && <ErrorState error={error} />}{' '}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {user.data?.user?.demoAccessAllowed && !user.data.user.mfaVerified && (
        <div className="notice">
          <h3>Local demo access</h3>
          <p>
            Use your demo account password to explore the workspace without an authenticator. This option is
            limited to the named accounts in this local demo database and lasts up to 30 minutes.
          </p>
          <form onSubmit={(e) => void submit(e, 'demo-access')}>
            <label>
              Demo account password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="btn" disabled={busy}>
              Open demo workspace
            </button>
          </form>
          <button className="text-button" onClick={() => setShowAuthenticator(true)}>
            Set up an authenticator instead
          </button>
        </div>
      )}
      {!user.data?.user?.mfaVerified &&
        (!user.data?.user?.demoAccessAllowed || showAuthenticator) &&
        !user.data?.user?.mfaEnabled &&
        !setup && (
          <form onSubmit={(e) => void submit(e, 'setup')}>
            <label>
              Confirm your password
              <input type="password" name="password" autoComplete="current-password" required />
            </label>
            <button className="btn" disabled={busy}>
              Set up authenticator
            </button>
          </form>
        )}
      {setup && (
        <div className="notice">
          <p>Add a time-based account in your authenticator app using this secret. Keep it private.</p>
          <code className="break-all">{setup.secret}</code>
        </div>
      )}
      {(setup || user.data?.user?.mfaEnabled) && !user.data?.user?.mfaVerified && (
        <form onSubmit={(e) => void submit(e, 'verify')}>
          <label>
            Authenticator or recovery code
            <input required name="code" autoComplete="one-time-code" maxLength={100} />
          </label>
          <button className="btn" disabled={busy}>
            Verify MFA
          </button>
        </form>
      )}
      {codes.length > 0 && (
        <div className="notice">
          <strong>Save these recovery codes privately now.</strong>
          <p>Each is usable once. They will not be shown again.</p>
          {codes.map((code) => (
            <div className="break-all small" key={code}>
              {code}
            </div>
          ))}
        </div>
      )}
      {user.data?.user?.mfaVerified && (
        <Link
          className="btn"
          to={
            requestedWorkspace?.startsWith('/') &&
            !requestedWorkspace.startsWith('//') &&
            !requestedWorkspace.includes('\\')
              ? requestedWorkspace
              : user.data.user.role === 'ADMIN'
                ? '/admin'
                : user.data.user.role === 'FACILITY_STAFF'
                  ? '/staff'
                  : '/owner'
          }
        >
          Open workspace <ArrowRight size={17} />
        </Link>
      )}
    </div>
  );
}
