import { useEffect, useRef, useState } from 'react';
import { FLASK_URL } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

// Fallback messages in case AI is unavailable
const FALLBACK = {
  start: "Ready to zone in! What are you working on? 👀",
  end_yes: "That's what I like to hear! Great work 🔥",
  end_no: "No worries — progress still happened. Try again! 💪",
};

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function fetchCompanionMessage({ phase, goal, completed, tagName, duration, timezone }) {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${FLASK_URL}/api/companion/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ phase, goal, completed, tag_name: tagName, duration, timezone }),
  });
  if (!res.ok) return null;
  return await res.json();
}

export async function postCompanionLog({ sessionId, goal, completed, tagId, duration, timezone }) {
  const token = await getToken();
  if (!token) return;
  fetch(`${FLASK_URL}/api/companion/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      session_id: sessionId,
      goal: goal || null,
      completed,
      tag_id: tagId || null,
      duration,
      timezone,
    }),
  }).catch(() => {}); // fire and forget
}

// phase: 'start' | 'end-check' | null
export default function SessionCompanion({ phase, sessionGoal, sessionMeta, onGoalSet, onCheckin, onDismiss }) {
  const [input, setInput] = useState('');
  const [visible, setVisible] = useState(false);
  const [animOut, setAnimOut] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [showInput, setShowInput] = useState(true);
  const [loading, setLoading] = useState(false);
  const [endResult, setEndResult] = useState(null); // 'yes' | 'no'
  const [endMessage, setEndMessage] = useState('');
  const inputRef = useRef(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!phase) return;
    setVisible(true);
    setAnimOut(false);
    setInput('');
    setEndResult(null);
    setEndMessage('');
    setAiMessage('');
    setLoading(true);

    const backendPhase = phase === 'start' ? 'start' : phase === 'proactive' ? 'proactive' : 'end';
    const fallbackMsg = phase === 'start' ? FALLBACK.start : phase === 'proactive' ? "Hey! Good to see you. Ready to focus?" : '';

    fetchCompanionMessage({
      phase: backendPhase,
      goal: sessionGoal || '',
      completed: null,
      tagName: sessionMeta?.tagName || '',
      duration: sessionMeta?.duration || 50,
      timezone,
    }).then(data => {
      if (data?.message) {
        setAiMessage(data.message);
        setShowInput(phase === 'start' && data.show_input !== false);
      } else {
        setAiMessage(fallbackMsg);
        setShowInput(phase === 'start');
      }
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }).catch(() => {
      setAiMessage(fallbackMsg);
      setShowInput(phase === 'start');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    });
  }, [phase]);

  function dismiss() {
    setAnimOut(true);
    setTimeout(() => {
      setVisible(false);
      setAnimOut(false);
      onDismiss();
    }, 250);
  }

  function handleStartSubmit() {
    const goal = input.trim();
    onGoalSet(goal || null);
    dismiss();
  }

  async function handleCheckin(did) {
    setEndResult(did ? 'yes' : 'no');
    onCheckin(did);

    // Fetch AI end message based on outcome
    fetchCompanionMessage({
      phase: 'end',
      goal: sessionGoal || '',
      completed: did,
      tagName: sessionMeta?.tagName || '',
      duration: sessionMeta?.duration || 50,
      timezone,
    }).then(data => {
      setEndMessage(data?.message || (did ? FALLBACK.end_yes : FALLBACK.end_no));
    }).catch(() => {
      setEndMessage(did ? FALLBACK.end_yes : FALLBACK.end_no);
    });

    setTimeout(() => dismiss(), 2500);
  }

  if (!visible || !phase) return null;

  return (
    <div className={`companion-overlay${animOut ? ' out' : ''}`} onClick={e => e.target === e.currentTarget && dismiss()}>
      <div className={`companion-card${animOut ? ' out' : ''}`}>

        {/* Avatar */}
        <div className="companion-avatar">Z</div>

        {/* START PHASE */}
        {phase === 'start' && !endResult && (
          <>
            <div className="companion-msg">
              {loading ? <span className="companion-loading">thinking...</span> : aiMessage}
            </div>
            {!loading && showInput && (
              <input
                ref={inputRef}
                className="companion-input"
                type="text"
                placeholder="e.g. Finish the auth component..."
                maxLength={120}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStartSubmit()}
              />
            )}
            {!loading && (
              <div className="companion-btns">
                <button className="companion-btn primary" onClick={handleStartSubmit}>
                  Let's go ⚡
                </button>
                <button className="companion-btn ghost" onClick={dismiss}>Skip</button>
              </div>
            )}
          </>
        )}

        {/* END CHECK PHASE */}
        {phase === 'end-check' && !endResult && (
          <>
            <div className="companion-msg">
              {loading
                ? <span className="companion-loading">thinking...</span>
                : (aiMessage || `Session done! ${sessionGoal ? `Did you finish "${sessionGoal}"?` : 'Did you get it done?'}`)
              }
            </div>
            {!loading && (
              <div className="companion-btns">
                <button className="companion-btn yes" onClick={() => handleCheckin(true)}>✓ Yes!</button>
                <button className="companion-btn no" onClick={() => handleCheckin(false)}>✕ Not quite</button>
              </div>
            )}
          </>
        )}

        {/* PROACTIVE PHASE */}
        {phase === 'proactive' && !endResult && (
          <>
            <div className="companion-msg">
              {loading ? <span className="companion-loading">thinking...</span> : aiMessage}
            </div>
            {!loading && (
              <div className="companion-btns">
                <button className="companion-btn primary" onClick={dismiss}>Let's go ⚡</button>
                <button className="companion-btn ghost" onClick={dismiss}>Dismiss</button>
              </div>
            )}
          </>
        )}

        {/* END RESULT */}
        {endResult && (
          <div className={`companion-result ${endResult}`}>
            {endMessage || (endResult === 'yes' ? FALLBACK.end_yes : FALLBACK.end_no)}
          </div>
        )}

      </div>
    </div>
  );
}
