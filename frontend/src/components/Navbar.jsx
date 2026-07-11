/**
 * Navbar.jsx — Top navigation bar
 * Architecture §2.1
 *
 * Contains:
 *   - QuantSignal logo + brand
 *   - Ticker search bar (controlled, calls onSearch prop)
 *   - User greeting
 *   - Navigation links (Dashboard, Knowledge Base, History)
 *   - Logout button
 */

import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import styles from './Navbar.module.css';

// ── Icons (inline SVG, no external dependency) ──────────────────────────────
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

const ChartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

export default function Navbar({ onSearch }) {
  const { user, logout }     = useAuth();
  const navigate             = useNavigate();
  const [query, setQuery]    = useState('');
  const [focused, setFocused]= useState(false);

  function handleSearch(e) {
    e.preventDefault();
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;
    onSearch?.(symbol);
    navigate('/dashboard');
    setQuery('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setQuery(''); e.target.blur(); }
  }

  return (
    <nav className={styles.navbar}>
      {/* Brand */}
      <NavLink to="/dashboard" className={styles.brand} id="nav-brand">
        <div className={styles.brandIcon}>
          <ChartIcon />
        </div>
        <span className={styles.brandName}>QuantSignal</span>
      </NavLink>

      {/* Search bar */}
      <form className={`${styles.searchForm} ${focused ? styles.searchFocused : ''}`} onSubmit={handleSearch} id="nav-search-form">
        <span className={styles.searchIcon}><SearchIcon /></span>
        <input
          id="nav-search-input"
          className={styles.searchInput}
          type="text"
          placeholder="Search ticker… e.g. RELIANCE.NS"
          value={query}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={styles.searchBtn} id="nav-search-btn">
          Analyze
        </button>
      </form>

      {/* Nav links */}
      <div className={styles.navLinks}>
        <NavLink to="/dashboard" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} id="nav-dashboard">
          Dashboard
        </NavLink>
        <NavLink to="/knowledge-base" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} id="nav-kb">
          Knowledge Base
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} id="nav-history">
          History
        </NavLink>
      </div>

      {/* User area */}
      <div className={styles.userArea}>
        {user && (
          <span className={styles.userGreeting} id="nav-user-greeting">
            {user.displayName || user.email?.split('@')[0]}
          </span>
        )}
        <button className={styles.logoutBtn} onClick={logout} id="nav-logout-btn" title="Sign out">
          <LogoutIcon />
          <span>Sign out</span>
        </button>
      </div>
    </nav>
  );
}
