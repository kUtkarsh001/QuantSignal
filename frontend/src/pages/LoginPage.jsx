/**
 * LoginPage.jsx — Register + Login forms
 * Architecture §2.1
 *
 * Checkpoint (Day 15): Fill in email + password → POST hits /api/auth/login
 * → JWT stored in localStorage → redirects to /dashboard.
 * Logout clears token. Refresh on /dashboard redirects here if no token.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import styles from './LoginPage.module.css';

// ── Icons ──────────────────────────────────────────────────────────────────
const EyeIcon = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const ChartIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

// ── Feature chips shown on the left panel ─────────────────────────────────
const FEATURES = [
  { icon: '📊', label: 'DSP-powered indicators', desc: 'SMA · EMA · RSI · MACD · Bollinger' },
  { icon: '🤖', label: 'Multi-agent AI analysis', desc: 'Chart Signal + Macro Sentiment + Synthesiser' },
  { icon: '📄', label: 'RAG knowledge base', desc: 'Upload reports, get cited answers' },
  { icon: '🎯', label: 'Confidence scoring', desc: 'Server-computed 0–100 signal strength' },
];

// ── Form fields helper ─────────────────────────────────────────────────────
function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.passwordWrap}>
      <input
        id={id}
        className="form-input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
      />
      <button type="button" className={styles.eyeBtn} onClick={() => setShow(s => !s)} tabIndex={-1} aria-label={show ? 'Hide password' : 'Show password'}>
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

export default function LoginPage() {
  const { loginWithCredentials, register } = useAuth();
  const navigate = useNavigate();

  const [mode,        setMode]        = useState('login');  // 'login' | 'register'
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await loginWithCredentials(email, password);
      } else {
        if (!displayName.trim()) { setError('Display name is required.'); setLoading(false); return; }
        await register(email, password, displayName.trim());
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError('');
    setEmail('');
    setPassword('');
    setDisplayName('');
  }

  return (
    <div className={styles.page}>
      {/* Left panel — branding + features */}
      <div className={styles.leftPanel}>
        <div className={styles.leftContent}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}><ChartIcon /></div>
            <span className={styles.logoText}>QuantSignal</span>
          </div>

          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>
              AI-Driven<br />
              <span className={styles.heroAccent}>Trend Analysis</span>
            </h1>
            <p className={styles.heroSub}>
              Combine DSP signal processing with LangChain AI agents to generate confidence-scored investment signals from market data and your own research documents.
            </p>
          </div>

          <div className={styles.featureList}>
            {FEATURES.map(f => (
              <div key={f.label} className={styles.featureItem}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <div>
                  <div className={styles.featureLabel}>{f.label}</div>
                  <div className={styles.featureDesc}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.techStack}>
            {['React', 'Express', 'MongoDB', 'Pinecone', 'Gemini'].map(t => (
              <span key={t} className={styles.techTag}>{t}</span>
            ))}
          </div>
        </div>

        {/* Decorative glow orbs */}
        <div className={styles.orb1} aria-hidden />
        <div className={styles.orb2} aria-hidden />
      </div>

      {/* Right panel — form */}
      <div className={styles.rightPanel}>
        <div className={styles.formCard}>
          {/* Tab switcher */}
          <div className={styles.tabs} role="tablist">
            <button
              id="tab-login"
              role="tab"
              aria-selected={mode === 'login'}
              className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
              onClick={() => switchMode('login')}
            >
              Sign In
            </button>
            <button
              id="tab-register"
              role="tab"
              aria-selected={mode === 'register'}
              className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`}
              onClick={() => switchMode('register')}
            >
              Create Account
            </button>
          </div>

          <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>
              {mode === 'login' ? 'Welcome back' : 'Get started'}
            </h2>
            <p className={styles.formSub}>
              {mode === 'login'
                ? 'Sign in to access your analysis dashboard.'
                : 'Create your free account to begin analyzing markets.'}
            </p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit} id="auth-form" noValidate>
            {/* Display name — register only */}
            {mode === 'register' && (
              <div className="form-group fade-in">
                <label className="form-label" htmlFor="input-displayname">Your Name</label>
                <input
                  id="input-displayname"
                  className="form-input"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Utkarsh"
                  autoComplete="name"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="input-email">Email address</label>
              <input
                id="input-email"
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="input-password">Password</label>
              <PasswordInput
                id="input-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Min 6 characters' : 'Enter your password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className={styles.errorBox} id="auth-error" role="alert">
                <AlertIcon />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              id="auth-submit-btn"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <div className={styles.switchPrompt}>
            {mode === 'login' ? (
              <span>Don't have an account?{' '}
                <button id="switch-to-register" className={styles.switchLink} onClick={() => switchMode('register')}>
                  Create one
                </button>
              </span>
            ) : (
              <span>Already have an account?{' '}
                <button id="switch-to-login" className={styles.switchLink} onClick={() => switchMode('login')}>
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
