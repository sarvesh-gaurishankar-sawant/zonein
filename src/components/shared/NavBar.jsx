import { useState, useEffect, useRef } from 'react';

const TABS = ['calendar', 'inbox', 'tags', 'stats', 'settings'];

export default function NavBar({ view, onSwitch, user, initial, onLogout }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const dropdownRef = useRef(null);

  const avatarInitial = initial || (user?.email || 'U').charAt(0).toUpperCase();

  useEffect(() => {
    const close = () => { setDropdownOpen(false); setMobileNavOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleTabClick = (tab) => {
    onSwitch(tab);
    setMobileNavOpen(false);
  };

  return (
    <div className="header">
      <div className="logo">
        <div className="logo-icon">Z</div>
        <div className="logo-text">Zone<span>In</span></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'flex-end', position: 'relative' }}>
        {/* Desktop nav */}
        <div className="nav-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`nav-tab${view === tab ? ' active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="hamburger-btn"
          onClick={(e) => { e.stopPropagation(); setMobileNavOpen((o) => !o); }}
        >
          ☰
        </button>
        <div className={`mobile-nav-dropdown${mobileNavOpen ? ' open' : ''}`} onClick={(e) => e.stopPropagation()}>
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`nav-tab${view === tab ? ' active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* User avatar */}
        <div className="user-section" style={{ position: 'relative' }}>
          <div
            className="user-avatar"
            onClick={(e) => { e.stopPropagation(); setDropdownOpen((o) => !o); }}
          >
            {avatarInitial}
          </div>
          <div className={`user-dropdown${dropdownOpen ? ' open' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="user-dropdown-header">
              <div className="user-dropdown-email">{user?.email || '—'}</div>
            </div>
            <button className="user-dropdown-item" onClick={() => { setDropdownOpen(false); onLogout(); }}>
              <span>🚪</span> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
