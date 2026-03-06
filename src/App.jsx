import { useEffect, useRef, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useData } from './hooks/useData';
import { useToast } from './hooks/useToast';
import { genId, getDateKey, getTimeLabel, isMobile } from './lib/utils';
import { FLASK_URL } from './lib/constants';
import { supabase } from './lib/supabase';

import NavBar from './components/shared/NavBar';
import Toast from './components/shared/Toast';
import NotifPopup from './components/shared/NotifPopup';
import LoginScreen from './components/auth/LoginScreen';
import BreakOverlay from './components/timer/BreakOverlay';
import CalendarView from './components/calendar/CalendarView';
import BottomBar from './components/calendar/BottomBar';
import SessionModal from './components/calendar/SessionModal';
import StatsView from './components/stats/StatsView';
import SettingsView from './components/settings/SettingsView';
import TagsView from './components/tags/TagsView';
import InboxView from './components/inbox/InboxView';

export default function App() {
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, resetPassword, logout } = useAuth();
  const {
    sessions, setSessions,
    tags, setTags,
    tasks, setTasks,
    focusSettings, setFocusSettings,
    dataLoaded,
    saveSession, deleteSession,
    saveTag, deleteTagFromDB,
    saveTask, deleteTaskFromDB,
    saveSettings,
  } = useData(user);

  const { toast, showToast, dismissToast } = useToast();

  const [view, setView] = useState('calendar');
  const [calOffset, setCalOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirmingCancel, setConfirmingCancel] = useState(null);
  const [modalSessionId, setModalSessionId] = useState(null);
  const [notif, setNotif] = useState({ visible: false, title: '', body: '' });
  const [breakVisible, setBreakVisible] = useState(false);

  // Timer refs
  const sessionTimersRef = useRef({});
  const autostartTimersRef = useRef({});
  const countdownIntervalRef = useRef(null);

  // Live refs to avoid stale closures in autostart timers.
  // sessionsRef is kept current via useEffect; startSessionRef is assigned
  // inline after startSession is defined (so it's always the latest closure).
  const sessionsRef = useRef([]);
  const startSessionRef = useRef(null);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // ===== CHIME =====
  function playStartChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) { /* ignore */ }
  }

  function showNotifPopup(title, body) {
    setNotif({ visible: true, title, body });
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }

  // ===== SESSION TIMERS =====
  function startSessionTimer(s) {
    if (sessionTimersRef.current[s.id]) clearTimeout(sessionTimersRef.current[s.id]);
    const endTime = s.started_at + s.duration * 60000;
    const msLeft = endTime - Date.now();
    if (msLeft > 0) {
      sessionTimersRef.current[s.id] = setTimeout(() => {
        completeSesion(s.id, true);
        delete sessionTimersRef.current[s.id];
      }, msLeft);
    }
  }

  function restoreActiveTimers(sessionsArr) {
    sessionsArr.forEach(s => {
      if (s.status === 'active' && s.started_at) {
        const msLeft = (s.started_at + s.duration * 60000) - Date.now();
        if (msLeft > 0) {
          sessionTimersRef.current[s.id] = setTimeout(() => {
            completeSesion(s.id, true);
            delete sessionTimersRef.current[s.id];
          }, msLeft);
        }
      }
    });
  }

  // ===== START / COMPLETE / CANCEL =====
  async function startSession(id) {
    const idx = sessions.findIndex(x => x.id === id);
    if (idx === -1) return;
    const s = { ...sessions[idx], status: 'active', started_at: Date.now() };
    const updated = [...sessions];
    updated[idx] = s;
    setSessions(updated);
    startSessionTimer(s);
    await saveSession(s);
    playStartChime();
    showToast('Session started! 🔥');
    scheduleAutostarts(updated, focusSettings);
  }
  // Assign inline (during render) so the ref is always current when a timer fires
  startSessionRef.current = startSession;

  function completeSesion(id, auto = false) {
    // Find linked partner BEFORE entering setSessions, using the current sessions snapshot
    const completingSession = sessions.find(x => x.id === id);
    const linkedPartner = completingSession?.linked_id
      ? sessions.find(x => x.linked_id === completingSession.linked_id && x.id !== id && x.status === 'booked')
      : null;

    setSessions(prev => {
      const idx = prev.findIndex(x => x.id === id);
      if (idx === -1) return prev;
      const s = { ...prev[idx], status: 'completed' };
      const updated = [...prev];
      updated[idx] = s;
      saveSession(s);
      playStartChime();
      return updated;
    });

    // Show break overlay unless this is a split session continuing into the next part
    if (!linkedPartner) {
      setTimeout(() => setBreakVisible(true), 500);
    }

    // Auto-start the next part of a split session
    if (linkedPartner) {
      setTimeout(() => startSessionRef.current(linkedPartner.id), 500);
    }
    if (sessionTimersRef.current[id]) {
      clearTimeout(sessionTimersRef.current[id]);
      delete sessionTimersRef.current[id];
    }

  }

  async function cancelSession(id) {
    // If this session is part of a linked pair (midnight overflow), cancel both
    const s = sessions.find(x => x.id === id);
    const linked = s?.linked_id ? sessions.filter(x => x.linked_id === s.linked_id) : [s];
    const idsToCancel = linked.map(x => x.id);
    setSessions(prev => prev.filter(x => !idsToCancel.includes(x.id)));
    await Promise.all(idsToCancel.map(deleteSession));
    setConfirmingCancel(null);
    showToast(idsToCancel.length > 1 ? 'Split session cancelled (both parts)' : 'Session cancelled');
  }

  // ===== LOG DONE (past session) =====
  async function logDoneSession(date, hour, min) {
    const duration = focusSettings.duration;
    const s = {
      id: genId(),
      date,
      start_hour: hour,
      start_min: min,
      duration,
      task: focusSettings.task || 'desk',
      tag: focusSettings.tag || null,
      status: 'completed',
      notes: '',
      linked_id: null,
    };
    setSessions(prev => [...prev, s]);
    setSelectedSlot(null);
    showToast(`✓ Logged ${getTimeLabel(hour, min)} — ${duration}min`);
    await saveSession(s);
  }

  // ===== BOOK SESSION =====
  async function bookSession(date, hour, min) {
    const duration = focusSettings.duration;
    const startMins = hour * 60 + min;
    const endMins = startMins + duration;
    const common = {
      task: focusSettings.task || 'desk',
      tag: focusSettings.tag || null,
      status: 'booked',
      notes: '',
    };

    if (endMins > 1440) {
      // Session overflows past midnight — split into two linked sessions
      const linkedId = genId();
      const day1Duration = 1440 - startMins; // minutes until midnight
      const day2Duration = duration - day1Duration; // minutes into next day

      // Compute next day's date
      const [yr, mo, dy] = date.split('-').map(Number);
      const nextDay = new Date(yr, mo - 1, dy + 1);
      const nextDate = getDateKey(nextDay);

      const s1 = { ...common, id: genId(), date, start_hour: hour, start_min: min, duration: day1Duration, linked_id: linkedId };
      const s2 = { ...common, id: genId(), date: nextDate, start_hour: 0, start_min: 0, duration: day2Duration, linked_id: linkedId };

      setSessions(prev => [...prev, s1, s2]);
      setSelectedSlot(null);
      showToast(`⚡ Booked ${getTimeLabel(hour, min)} — ${duration}min (splits midnight)`);
      await Promise.all([saveSession(s1), saveSession(s2)]);
      scheduleAutostarts([...sessions, s1, s2], focusSettings);
    } else {
      // Normal single-day session
      const s = { ...common, id: genId(), date, start_hour: hour, start_min: min, duration, linked_id: null };
      setSessions(prev => [...prev, s]);
      setSelectedSlot(null);
      showToast(`⚡ Booked ${getTimeLabel(hour, min)} — ${duration}min`);
      await saveSession(s);
      scheduleAutostarts([...sessions, s], focusSettings);
    }
  }

  // ===== MODAL =====
  const modalSession = sessions.find(s => s.id === modalSessionId) || null;

  async function saveModalSession(updated) {
    const idx = sessions.findIndex(x => x.id === updated.id);
    if (idx === -1) return;
    const updatedSessions = [...sessions];
    updatedSessions[idx] = updated;
    setSessions(updatedSessions);
    await saveSession(updated);
    setModalSessionId(null);
    showToast('Saved!');
  }

  async function deleteModalSession(id) {
    // If this session is part of a linked pair (midnight overflow), delete both
    const s = sessions.find(x => x.id === id);
    const linked = s?.linked_id ? sessions.filter(x => x.linked_id === s.linked_id) : [s];
    const idsToDelete = linked.map(x => x.id);
    setSessions(prev => prev.filter(x => !idsToDelete.includes(x.id)));
    idsToDelete.forEach(sid => {
      if (sessionTimersRef.current[sid]) {
        clearTimeout(sessionTimersRef.current[sid]);
        delete sessionTimersRef.current[sid];
      }
    });
    await Promise.all(idsToDelete.map(deleteSession));
    setModalSessionId(null);
    showToast(idsToDelete.length > 1 ? 'Split session removed (both parts)' : 'Session removed');
  }

  // ===== AUTOSTART =====
  // Keep startSessionRef always pointing at the latest startSession function
  // so autostart timers (which may fire hours later) never call a stale closure.
  function scheduleAutostarts(sessionsArr, settings) {
    Object.keys(autostartTimersRef.current).forEach(id => {
      clearTimeout(autostartTimersRef.current[id]);
      delete autostartTimersRef.current[id];
    });
    if (!settings.autostart) return;
    const now = Date.now();
    (sessionsArr || sessions).forEach(s => {
      if (s.status !== 'booked') return;
      const [year, month, day] = s.date.split('-').map(Number);
      const startTime = new Date(year, month - 1, day, s.start_hour, s.start_min, 0).getTime();
      const msUntil = startTime - now;
      // Use 0 delay for sessions whose start time has already passed
      const delay = msUntil > 0 ? msUntil : 0;
      autostartTimersRef.current[s.id] = setTimeout(async () => {
        // Read from refs to always get the latest sessions array and startSession fn
        const fresh = sessionsRef.current.find(x => x.id === s.id);
        if (fresh && fresh.status === 'booked') {
          await startSessionRef.current(s.id);
        }
        delete autostartTimersRef.current[s.id];
      }, delay);
    });
  }

  // ===== COUNTDOWN =====
  useEffect(() => {
    countdownIntervalRef.current = setInterval(() => {
      const active = sessions.filter(s => s.status === 'active' && s.started_at);
      if (active.length > 0) {
        const s = active[0];
        const msLeft = (s.started_at + s.duration * 60000) - Date.now();
        if (msLeft > 0) {
          const totalSec = Math.ceil(msLeft / 1000);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          const sTag = s.tag ? tags.find(t => t.id === s.tag) : null;
          document.title = `${mins}:${String(secs).padStart(2, '0')} ${sTag ? sTag.name : 'Focus'} - ZoneIn`;
        } else {
          document.title = 'ZoneIn - Focus Session Calendar';
        }
      } else {
        document.title = 'ZoneIn - Focus Session Calendar';
      }
    }, 1000);
    return () => clearInterval(countdownIntervalRef.current);
  }, [sessions, tags]);

  // ===== RESTORE TIMERS ON DATA LOAD =====
  useEffect(() => {
    if (dataLoaded && sessions.length > 0) {
      restoreActiveTimers(sessions);
      scheduleAutostarts(sessions, focusSettings);
    }
  }, [dataLoaded]);

  // ===== TAGS CRUD =====
  async function addTag(name, color) {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) + Date.now().toString(36).slice(-4);
    const newTag = { id, name, color };
    setTags(prev => [...prev, newTag]);
    await saveTag(newTag);
  }

  async function deleteTag(id) {
    setTags(prev => prev.filter(t => t.id !== id));
    let updatedSettings = focusSettings;
    if (focusSettings.tag === id) {
      updatedSettings = { ...focusSettings, tag: null };
      setFocusSettings(updatedSettings);
      await saveSettings(updatedSettings);
    }
    await deleteTagFromDB(id);
  }

  // ===== TASKS CRUD =====
  async function addTask(title) {
    const task = { id: genId(), title, done: false, tag_id: null, created_at: new Date().toISOString() };
    setTasks(prev => [task, ...prev]);
    await saveTask(task);
  }

  async function toggleTask(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const updated = { ...t, done: !t.done };
    setTasks(prev => prev.map(x => x.id === id ? updated : x));
    await saveTask(updated);
  }

  async function deleteTask(id) {
    setTasks(prev => prev.filter(x => x.id !== id));
    await deleteTaskFromDB(id);
  }

  async function scheduleTask(taskId, { date, hour, min }) {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    const newSession = {
      id: null,
      date,
      start_hour: hour,
      start_min: min,
      duration: focusSettings.duration,
      task: 'desk',
      tag: t.tag_id || focusSettings.tag || null,
      status: 'booked',
      notes: t.title,
    };
    const saved = await saveSession(newSession);
    if (saved) setSessions(prev => [...prev, saved]);
    const updatedTask = { ...t, done: true };
    setTasks(prev => prev.map(x => x.id === taskId ? updatedTask : x));
    await saveTask(updatedTask);
    setView('calendar');
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-app)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border-light)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onSignIn={signIn}
        onSignUp={signUp}
        onGoogle={signInWithGoogle}
        onReset={resetPassword}
      />
    );
  }

  return (
    <div className="app">
      <NavBar
        view={view}
        onSwitch={setView}
        user={user}
        initial={focusSettings.initial}
        onLogout={logout}
      />

      {view === 'calendar' && (
        <BottomBar
          focusSettings={focusSettings}
          setFocusSettings={setFocusSettings}
          saveSettings={saveSettings}
          selectedSlot={selectedSlot}
          tags={tags}
          onBook={bookSession}
          onLogDone={logDoneSession}
          sessions={sessions}
          setSessions={setSessions}
          isMobile={isMobile()}
          showToast={showToast}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {view === 'calendar' && (
          <CalendarView
            sessions={sessions}
            tags={tags}
            focusSettings={focusSettings}
            calOffset={calOffset}
            setCalOffset={setCalOffset}
            selectedSlot={selectedSlot}
            setSelectedSlot={setSelectedSlot}
            confirmingCancel={confirmingCancel}
            setConfirmingCancel={setConfirmingCancel}
            onStartSession={startSession}
            onCompleteSession={id => completeSesion(id, false)}
            onCancelSession={cancelSession}
            onOpenModal={setModalSessionId}
            onBook={bookSession}
            onLogDone={logDoneSession}
          />
        )}

        {view === 'stats' && (
          <StatsView sessions={sessions} tags={tags} />
        )}

        {view === 'settings' && (
          <SettingsView
            focusSettings={focusSettings}
            setFocusSettings={setFocusSettings}
            saveSettings={saveSettings}
            user={user}
            showToast={showToast}
          />
        )}

        {view === 'tags' && (
          <TagsView
            tags={tags}
            sessions={sessions}
            onAddTag={addTag}
            onDeleteTag={deleteTag}
            showToast={showToast}
          />
        )}

        {view === 'inbox' && (
          <InboxView
            tasks={tasks}
            tags={tags}
            focusSettings={focusSettings}
            onAddTask={addTask}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
            onScheduleTask={scheduleTask}
            showToast={showToast}
          />
        )}
      </div>

      {modalSession && (
        <SessionModal
          session={modalSession}
          tags={tags}
          onClose={() => setModalSessionId(null)}
          onSave={saveModalSession}
          onDelete={deleteModalSession}
        />
      )}

      <BreakOverlay
        visible={breakVisible}
        onDismiss={() => setBreakVisible(false)}
        autostartBreaks={focusSettings.autostartBreaks}
        breakDuration={focusSettings.breakDuration}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
      <NotifPopup notif={notif} onDismiss={() => setNotif(n => ({ ...n, visible: false }))} />

    </div>
  );
}
