import { useState, useRef } from 'react';
import { getTimeLabel, isSlotPast } from '../../lib/utils';
import { FLASK_URL } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export default function BottomBar({ focusSettings, setFocusSettings, saveSettings, selectedSlot, tags, onBook, onLogDone, sessions, setSessions, isMobile, showToast }) {
  const [bbExpanded, setBbExpanded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState({ visible: false, type: '', msg: '' });
  const aiInputRef = useRef(null);
  const aiResultTimeout = useRef(null);

  const selTag = focusSettings.tag ? tags.find((t) => t.id === focusSettings.tag) : null;
  const slotIsPast = selectedSlot ? isSlotPast(selectedSlot.date, selectedSlot.hour, selectedSlot.min) : false;
  const handleLabel = selectedSlot
    ? `${slotIsPast ? '✓ Log' : '⚡ Book'} ${focusSettings.duration}min${selTag ? ' · ' + selTag.name : ''} · ${getTimeLabel(selectedSlot.hour, selectedSlot.min)}`
    : '⚡ Booking controls';

  const submitAI = async () => {
    if (aiLoading) return;
    const input = aiInputRef.current;
    if (!input) return;
    const message = input.value.trim();
    if (!message) { input.focus(); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { showToast('Session expired, please sign in again'); return; }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setAiLoading(true);
    setAiResult({ visible: false, type: '', msg: '' });

    try {
      fetch(`${FLASK_URL}/health`).catch(() => {});
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let res;
      try {
        res = await fetch(`${FLASK_URL}/api/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ message, timezone, default_duration: focusSettings.duration, default_break: 10 }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Something went wrong');

      setSessions((prev) => {
        const newSess = data.sessions.filter((s) => !prev.find((x) => x.id === s.id));
        return [...prev, ...newSess];
      });
      input.value = '';
      showToast(`✓ ${data.summary}`, 4000);
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Server is waking up — try again in a few seconds' : err.message;
      setAiResult({ visible: true, type: 'error', msg: `✗ ${msg}` });
      if (aiResultTimeout.current) clearTimeout(aiResultTimeout.current);
      aiResultTimeout.current = setTimeout(() => setAiResult({ visible: false, type: '', msg: '' }), 5000);
    } finally {
      setAiLoading(false);
      setTimeout(() => { if (aiInputRef.current) { aiInputRef.current.disabled = false; aiInputRef.current.focus(); } }, 60);
    }
  };

  const innerContent = (
    <>
      {aiLoading && (
        <div className="ai-loading-overlay active">
          <div className="ai-loading-spinner" />
          <div className="ai-loading-text">⚡ AI is scheduling...</div>
          <div className="ai-loading-sub">Hang tight, booking your session</div>
        </div>
      )}
      <div className="ai-section">
        <div className="ai-input-row">
          <input
            ref={aiInputRef}
            className="ai-inline-input"
            id="ai-bar-input"
            type="text"
            placeholder="⚡ schedule with AI..."
            onKeyDown={(e) => e.key === 'Enter' && submitAI()}
            autoComplete="off"
            spellCheck="false"
            style={{ flex: 1, height: 32 }}
          />
          <button className="ai-send-btn" id="ai-send-btn" onClick={submitAI} disabled={aiLoading}>Book</button>
        </div>
        {aiResult.visible && (
          <div className={`ai-bar-result show ${aiResult.type}`}>{aiResult.msg}</div>
        )}
      </div>

      <div className="duration-row">
        <span className="dur-label">Duration</span>
        {[25, 50, 75].map((d) => (
          <button
            key={d}
            className={`dur-btn${focusSettings.duration === d ? ' active' : ''}`}
            onClick={() => { setFocusSettings((s) => ({ ...s, duration: d })); saveSettings({ ...focusSettings, duration: d }); }}
          >
            {d}<span>min</span>
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="tag-row">
          <span className="dur-label">Tag</span>
          <button
            className={`tag-sel-btn${!focusSettings.tag ? ' active' : ''}`}
            onClick={() => { setFocusSettings((s) => ({ ...s, tag: null })); saveSettings({ ...focusSettings, tag: null }); }}
          >None</button>
          {tags.map((t) => (
            <button
              key={t.id}
              className={`tag-sel-btn${focusSettings.tag === t.id ? ' active' : ''}`}
              onClick={() => { setFocusSettings((s) => ({ ...s, tag: t.id })); saveSettings({ ...focusSettings, tag: t.id }); }}
            >
              <span className="tag-sel-dot" style={{ background: t.color }} />
              {t.name}
            </button>
          ))}
        </div>
      )}

      <button
        className="book-bar-btn"
        disabled={!selectedSlot}
        onClick={() => {
          if (!selectedSlot) return;
          if (slotIsPast) onLogDone(selectedSlot.date, selectedSlot.hour, selectedSlot.min);
          else onBook(selectedSlot.date, selectedSlot.hour, selectedSlot.min);
        }}
      >
        <span className="bolt">{slotIsPast ? '✓' : '⚡'}</span>
        {selectedSlot
          ? `${slotIsPast ? 'Log Done' : 'Book'} ${focusSettings.duration}min${selTag ? ' — ' + selTag.name : ''} — ${getTimeLabel(selectedSlot.hour, selectedSlot.min)}`
          : 'Select a time slot to book'}
      </button>
    </>
  );

  if (isMobile) {
    return (
      <div className="bottom-bar">
        <div
          className="bb-handle"
          style={{ display: 'flex' }}
          onClick={() => setBbExpanded((o) => !o)}
        >
          <span className={`bb-handle-label${selectedSlot ? ' slot-ready' : ''}`}>{handleLabel}</span>
          <span className="bb-chevron" style={{ transform: bbExpanded ? 'rotate(180deg)' : '' }}>▼</span>
        </div>
        <div className={`bb-panel${bbExpanded ? ' open' : ''}`}>
          <div className="bb-panel-inner">{innerContent}</div>
        </div>
      </div>
    );
  }

  return <div className="bottom-bar">{innerContent}</div>;
}
