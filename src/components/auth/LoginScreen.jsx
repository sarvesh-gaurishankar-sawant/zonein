import { useState } from 'react';

export default function LoginScreen({ onSignIn, onSignUp, onGoogle, onReset }) {
  const [authView, setAuthView] = useState('auth'); // 'auth' | 'reset'
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [error, setError] = useState('');
  const [resetError, setResetError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Please fill in all fields'); return; }
    if (mode === 'signup' && password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      if (mode === 'signup') {
        await onSignUp(email, password);
        setError('Check your email to confirm your account.');
      } else {
        await onSignIn(email, password);
      }
    } catch (e) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetError('');
    if (!resetEmail) { setResetError('Enter your email'); return; }
    setLoading(true);
    try {
      await onReset(resetEmail);
      setResetSent(true);
    } catch (e) {
      setResetError(e.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-icon">Z</div>
          <div>
            <div className="login-title">Zone<span>In</span></div>
            <div className="login-subtitle">Focus session calendar</div>
          </div>
        </div>

        {authView === 'auth' ? (
          <>
            <div className="login-tabs">
              <button
                className={`login-tab${mode === 'signin' ? ' active' : ''}`}
                onClick={() => { setMode('signin'); setError(''); setEmail(''); setPassword(''); setConfirm(''); }}
              >Sign In</button>
              <button
                className={`login-tab${mode === 'signup' ? ' active' : ''}`}
                onClick={() => { setMode('signup'); setError(''); setEmail(''); setPassword(''); setConfirm(''); }}
              >Sign Up</button>
            </div>
            <div className="login-field">
              <label>Email</label>
              <input className="login-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
            </div>
            <div className="login-field">
              <label>Password</label>
              <input className="login-input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
            </div>
            {mode === 'signup' && (
              <div className="login-field">
                <label>Confirm Password</label>
                <input className="login-input" type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
              </div>
            )}
            <div className="login-error">{error}</div>
            <button className="login-button" disabled={loading} onClick={handleSubmit}>
              {loading && <span className="login-loading" />}
              <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
            </button>
            {mode === 'signin' && (
              <button className="login-text-btn" onClick={() => { setAuthView('reset'); setError(''); }}>Forgot password?</button>
            )}
            <div className="login-divider">or</div>
            <button className="google-btn" onClick={onGoogle}>
              <svg viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>
          </>
        ) : (
          <>
            <div className="login-view-title">Reset Password</div>
            <div className="login-view-desc">Enter your email and we'll send you a reset link.</div>
            {resetSent ? (
              <div style={{ fontSize: 13, color: 'var(--green)', marginBottom: 16 }}>Reset link sent! Check your inbox.</div>
            ) : (
              <>
                <div className="login-field">
                  <label>Email</label>
                  <input className="login-input" type="email" placeholder="you@example.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleReset()} />
                </div>
                <div className="login-error">{resetError}</div>
                <button className="login-button" disabled={loading} onClick={handleReset}>
                  {loading && <span className="login-loading" />}
                  <span>Send Reset Link</span>
                </button>
              </>
            )}
            <button className="login-text-btn" onClick={() => { setAuthView('auth'); setResetSent(false); setResetEmail(''); }}>← Back to Sign In</button>
          </>
        )}
      </div>
    </div>
  );
}
