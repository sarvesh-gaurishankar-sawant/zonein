import { useRef, useEffect, useCallback } from 'react';
import { sessionEndDate } from '../lib/utils';

export function useTimer({ sessions, setSessions, focusSettings, saveSession, onSessionComplete, onBreakEnd }) {
  const sessionTimersRef = useRef({});
  const autostartTimersRef = useRef({});
  const countdownIntervalRef = useRef(null);

  // Countdown ticker — updates document title and any countdown elements
  useEffect(() => {
    countdownIntervalRef.current = setInterval(() => {
      const active = sessions.find((s) => s.status === 'active');
      if (active) {
        const msLeft = sessionEndDate(active).getTime() - Date.now();
        if (msLeft > 0) {
          const totalSec = Math.ceil(msLeft / 1000);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          document.title = `${mins}:${String(secs).padStart(2, '0')} Focus - ZoneIn`;
        }
      } else {
        document.title = 'ZoneIn - Focus Session Calendar';
      }
    }, 1000);
    return () => clearInterval(countdownIntervalRef.current);
  }, [sessions]);

  // Schedule autostart timers whenever sessions or autostart setting changes
  useEffect(() => {
    // Clear old timers
    Object.values(autostartTimersRef.current).forEach(clearTimeout);
    autostartTimersRef.current = {};

    if (!focusSettings.autostart) return;

    const now = Date.now();
    sessions.forEach((s) => {
      if (s.status !== 'booked') return;
      const [year, month, day] = s.date.split('-').map(Number);
      const startTime = new Date(year, month - 1, day, s.start_hour, s.start_min, 0).getTime();
      const msUntil = startTime - now;
      if (msUntil > 0) {
        autostartTimersRef.current[s.id] = setTimeout(() => {
          startSession(s.id);
          delete autostartTimersRef.current[s.id];
        }, msUntil);
      }
    });

    return () => {
      Object.values(autostartTimersRef.current).forEach(clearTimeout);
      autostartTimersRef.current = {};
    };
  }, [sessions, focusSettings.autostart]);

  // Restore active session timers on mount
  useEffect(() => {
    sessions.forEach((s) => {
      if (s.status === 'active') {
        const msLeft = sessionEndDate(s).getTime() - Date.now();
        if (msLeft > 0) {
          if (sessionTimersRef.current[s.id]) clearTimeout(sessionTimersRef.current[s.id]);
          sessionTimersRef.current[s.id] = setTimeout(() => {
            completeSession(s.id, true);
            delete sessionTimersRef.current[s.id];
          }, msLeft);
        }
      }
    });
  }, []); // Only on mount

  const startSession = useCallback(async (id) => {
    setSessions((prev) => {
      const next = prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, status: 'active', started_at: Date.now() };
        saveSession(updated);
        const msLeft = sessionEndDate(updated).getTime() - Date.now();
        if (msLeft > 0) {
          if (sessionTimersRef.current[id]) clearTimeout(sessionTimersRef.current[id]);
          sessionTimersRef.current[id] = setTimeout(() => {
            completeSession(id, true);
            delete sessionTimersRef.current[id];
          }, msLeft);
        }
        return updated;
      });
      return next;
    });
  }, [setSessions, saveSession]);

  const completeSession = useCallback(async (id, auto = false) => {
    setSessions((prev) => {
      const next = prev.map((s) => {
        if (s.id !== id) return s;
        if (s.status !== 'active' && s.status !== 'booked') return s;
        const updated = { ...s, status: 'completed' };
        if (sessionTimersRef.current[id]) {
          clearTimeout(sessionTimersRef.current[id]);
          delete sessionTimersRef.current[id];
        }
        saveSession(updated);
        return updated;
      });
      return next;
    });
    if (onSessionComplete) onSessionComplete(auto);
  }, [setSessions, saveSession, onSessionComplete]);

  return { startSession, completeSession };
}
