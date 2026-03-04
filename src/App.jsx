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
import SessionCompanion from './components/shared/SessionCompanion';
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

  // ===== COMPANION =====
  const [companionPhase, setCompanionPhase] = useState(null); // 'start' | 'end-check'
  const [companionSessionId, setCompanionSessionId] = useState(null);
  const companionGoalRef = useRef(null); // goal set at session start

  // Timer refs
  const sessionTimersRef = useRef({});
  const autostartTimersRef = useRef({});
  const countdownIntervalRef = useRef(null);

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
    // Show companion check-in
    companionGoalRef.current = null;
    setCompanionSessionId(id);
    setCompanionPhase('start');
  }

  function completeSesion(id, auto = false) {
    setSessions(prev => {
      const idx = prev.findIndex(x => x.id === id);
      if (idx === -1) return prev;
      const s = { ...prev[idx], status: 'completed' };
      const updated = [...prev];
      updated[idx] = s;
      saveSession(s);
      playStartChime();
      if (auto && focusSettings.autostartBreaks) {
        setTimeout(() => setBreakVisible(true), 500);
      }
      return updated;
    });
    if (sessionTimersRef.current[id]) {
      clearTimeout(sessionTimersRef.current[id]);
      delete sessionTimersRef.current[id];
    }
    // Show companion end check-in
    setCompanionSessionId(id);
    setCompanionPhase('end-check');
  }

  async function cancelSession(id) {
    setSessions(prev => prev.filter(x => x.id !== id));
    await deleteSession(id);
    setConfirmingCancel(null);
    showToast('Session cancelled');
  }

  // ===== BOOK SESSION =====
  async function bookSession(date, hour, min) {
    const s = {
      id: genId(),
      date,
      start_hour: hour,
      start_min: min,
      duration: focusSettings.duration,
      task: focusSettings.task || 'desk',
      tag: focusSettings.tag || null,
      status: 'booked',
      notes: '',
    };
    // Optimistically add to UI immediately
    setSessions(prev => [...prev, s]);
    setSelectedSlot(null);
    showToast(`⚡ Booked ${getTimeLabel(hour, min)} — ${focusSettings.duration}min`);
    // Save to DB in background
    await saveSession(s);
    scheduleAutostarts([...sessions, s], focusSettings);
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
    setSessions(prev => prev.filter(x => x.id !== id));
    if (sessionTimersRef.current[id]) {
      clearTimeout(sessionTimersRef.current[id]);
      delete sessionTimersRef.current[id];
    }
    await deleteSession(id);
    setModalSessionId(null);
    showToast('Session removed');
  }

  // ===== AUTOSTART =====
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
      if (msUntil > 0) {
        autostartTimersRef.current[s.id] = setTimeout(async () => {
          const fresh = sessions.find(x => x.id === s.id);
          if (fresh && fresh.status === 'booked') {
            await startSession(s.id);
          }
          delete autostartTimersRef.current[s.id];
        }, msUntil);
      }
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

      <SessionCompanion
        phase={companionPhase}
        sessionGoal={companionGoalRef.current}
        onGoalSet={goal => { companionGoalRef.current = goal; }}
        onCheckin={did => { /* could save to notes in future */ }}
        onDismiss={() => { setCompanionPhase(null); setCompanionSessionId(null); }}
      />
    </div>
  );
}
