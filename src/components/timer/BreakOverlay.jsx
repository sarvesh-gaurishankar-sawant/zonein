import { useState, useEffect, useRef } from 'react';

export default function BreakOverlay({ visible, onDismiss, autostartBreaks, breakDuration }) {
  const [phase, setPhase] = useState('prompt'); // 'prompt' | 'timer'
  const [breakMins, setBreakMins] = useState(5);
  const [msLeft, setMsLeft] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const endTimeRef = useRef(null);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    if (autostartBreaks) {
      startBreak(breakDuration || 5);
    } else {
      setPhase('prompt');
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const startBreak = (mins) => {
    setBreakMins(mins);
    const ms = mins * 60000;
    setTotalMs(ms);
    setMsLeft(ms);
    endTimeRef.current = Date.now() + ms;
    setPhase('timer');

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const left = endTimeRef.current - Date.now();
      setMsLeft(left > 0 ? left : 0);
      if (left <= 0) {
        clearInterval(intervalRef.current);
        endBreak(true);
      }
    }, 1000);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => endBreak(true), ms);
  };

  const endBreak = (auto) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    document.title = 'ZoneIn - Focus Session Calendar';
    onDismiss(auto);
    setPhase('prompt');
  };

  if (!visible) return null;

  const totalSec = Math.ceil(msLeft / 1000);
  const dispMins = Math.floor(totalSec / 60);
  const dispSecs = totalSec % 60;
  const progressPct = totalMs > 0 ? (msLeft / totalMs) * 100 : 100;

  return (
    <div className="break-overlay show">
      {phase === 'prompt' ? (
        <div className="break-prompt">
          <div className="break-prompt-emoji">☕</div>
          <div className="break-prompt-title">Session Complete!</div>
          <div className="break-prompt-sub">You crushed it. Take a moment to rest — your brain will thank you.</div>
          <div className="break-prompt-options">
            {[5, 10, 15].map((m) => (
              <button key={m} className="break-opt-btn" onClick={() => startBreak(m)}>
                <span className="break-opt-num">{m}</span>
                <span className="break-opt-label">minutes</span>
              </button>
            ))}
          </div>
          <button className="break-skip-btn" onClick={() => onDismiss(false)}>Skip, keep going →</button>
        </div>
      ) : (
        <div className="break-timer-screen">
          <div className="break-timer-status">On Break</div>
          <div className="break-ring-wrap">
            <div className="break-ring" />
            <div className="break-ring-inner" />
            <div className="break-timer-display">
              {dispMins}:{String(dispSecs).padStart(2, '0')}
            </div>
          </div>
          <div className="break-timer-hint">Breathe. Stretch. Hydrate. 🌿</div>
          <div className="break-progress-track">
            <div className="break-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <button className="break-end-btn" onClick={() => endBreak(false)}>End Break Early</button>
        </div>
      )}
    </div>
  );
}
