import { useState } from 'react';

const PRESET_DURATIONS = [25, 50, 75];
const PRESET_BREAKS = [5, 10, 15];

export default function SettingsView({ focusSettings, setFocusSettings, saveSettings, user, showToast }) {
  const [initialInput, setInitialInput] = useState(focusSettings.initial || '');
  const [customDur, setCustomDur] = useState('');
  const [customBreak, setCustomBreak] = useState('');
  const s = focusSettings;

  const isCustomDuration = !PRESET_DURATIONS.includes(s.duration);
  const isCustomBreak = !PRESET_BREAKS.includes(s.breakDuration);

  const toggle = async (key) => {
    const updated = { ...focusSettings, [key]: !focusSettings[key] };
    setFocusSettings(updated);
    await saveSettings(updated);
  };

  const setBreakDuration = async (d) => {
    const updated = { ...focusSettings, breakDuration: d };
    setFocusSettings(updated);
    await saveSettings(updated);
  };

  const setDuration = async (d) => {
    const updated = { ...focusSettings, duration: d };
    setFocusSettings(updated);
    await saveSettings(updated);
  };

  const saveInitial = async () => {
    const val = initialInput.trim().toUpperCase();
    if (!val) return;
    const updated = { ...focusSettings, initial: val };
    setFocusSettings(updated);
    await saveSettings(updated);
    showToast('Avatar updated!');
  };

  const avatarLetter = s.initial || (user?.email || 'U').charAt(0).toUpperCase();

  const toggleBtnStyle = (on) => ({
    padding: '5px 12px',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-light)'}`,
    background: on ? 'var(--accent)' : 'var(--bg-surface)',
    color: on ? '#000' : 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 800,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 1,
    textTransform: 'uppercase',
    flexShrink: 0,
    boxShadow: on ? '2px 2px 0 #000' : 'none',
  });

  const pillBtnStyle = (active) => ({
    padding: '5px 12px',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
    fontFamily: 'inherit',
    background: active ? 'var(--accent)' : 'var(--bg-surface)',
    color: active ? '#000' : 'var(--text-secondary)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    boxShadow: active ? '2px 2px 0 #000' : 'none',
  });

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  };

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    padding: 16,
    marginBottom: 12,
  };

  const sectionLabelStyle = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 12,
  };

  const settingTitleStyle = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' };
  const settingDescStyle = { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 };

  return (
    <div className="stats-page">
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 16 }}>
        Settings
      </div>

      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Session</div>

        <div style={rowStyle}>
          <div>
            <div style={settingTitleStyle}>Auto-start sessions</div>
            <div style={settingDescStyle}>Automatically start a booked session at its scheduled time</div>
          </div>
          <button style={toggleBtnStyle(s.autostart)} onClick={() => toggle('autostart')}>
            {s.autostart ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style={rowStyle}>
          <div>
            <div style={settingTitleStyle}>Auto-start breaks</div>
            <div style={settingDescStyle}>Automatically start a break after a session</div>
          </div>
          <button style={toggleBtnStyle(s.autostartBreaks)} onClick={() => toggle('autostartBreaks')}>
            {s.autostartBreaks ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style={rowStyle}>
          <div>
            <div style={settingTitleStyle}>Default break duration</div>
            <div style={settingDescStyle}>Used when autostart breaks is on</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {PRESET_BREAKS.map(d => (
              <button key={d} style={pillBtnStyle(s.breakDuration === d)} onClick={() => { setCustomBreak(''); setBreakDuration(d); }}>
                {d}m
              </button>
            ))}
            <input
              type="text"
              inputMode="numeric"
              placeholder={isCustomBreak ? String(s.breakDuration) : 'custom'}
              value={customBreak}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setCustomBreak(raw);
                const val = parseInt(raw, 10);
                if (val && val >= 1 && val <= 120) setBreakDuration(val);
              }}
              onBlur={() => {
                const val = parseInt(customBreak, 10);
                if (val && val >= 1 && val <= 120) setBreakDuration(val);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = parseInt(customBreak, 10);
                  if (val && val >= 1 && val <= 120) { setBreakDuration(val); e.target.blur(); }
                }
              }}
              style={{
                ...pillBtnStyle(isCustomBreak),
                width: 60, textAlign: 'center',
                outline: 'none', cursor: 'text',
              }}
            />
          </div>
        </div>

        <div style={{ ...rowStyle, marginBottom: 0 }}>
          <div>
            <div style={settingTitleStyle}>Default duration</div>
            <div style={settingDescStyle}>Default session length when booking</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {PRESET_DURATIONS.map(d => (
              <button key={d} style={pillBtnStyle(s.duration === d)} onClick={() => { setCustomDur(''); setDuration(d); }}>
                {d}m
              </button>
            ))}
            <input
              type="text"
              inputMode="numeric"
              placeholder={isCustomDuration ? String(s.duration) : 'custom'}
              value={customDur}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setCustomDur(raw);
                const val = parseInt(raw, 10);
                if (val && val >= 1 && val <= 480) setDuration(val);
              }}
              onBlur={() => {
                const val = parseInt(customDur, 10);
                if (val && val >= 1 && val <= 480) setDuration(val);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = parseInt(customDur, 10);
                  if (val && val >= 1 && val <= 480) { setDuration(val); e.target.blur(); }
                }
              }}
              style={{
                ...pillBtnStyle(isCustomDuration),
                width: 60, textAlign: 'center',
                outline: 'none', cursor: 'text',
              }}
            />
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionLabelStyle}>Profile</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={settingTitleStyle}>Avatar initial</div>
            <div style={settingDescStyle}>Single letter shown in the top-right corner</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 0,
              background: 'var(--accent)', color: '#000',
              fontSize: 16, fontWeight: 900, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #000', boxShadow: '3px 3px 0 #000',
            }}>
              {avatarLetter}
            </div>
            <input
              type="text"
              maxLength={1}
              value={initialInput}
              placeholder={avatarLetter}
              onChange={e => setInitialInput(e.target.value.toUpperCase())}
              style={{
                width: 44, height: 36, textAlign: 'center',
                fontSize: 18, fontWeight: 900, fontFamily: 'inherit',
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', outline: 'none',
                textTransform: 'uppercase',
              }}
            />
            <button
              onClick={saveInitial}
              style={{
                padding: '6px 14px', fontSize: 11, fontWeight: 800, fontFamily: 'inherit',
                background: 'var(--accent)', color: '#000', border: '1px solid var(--accent)',
                boxShadow: '2px 2px 0 #000', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase',
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
