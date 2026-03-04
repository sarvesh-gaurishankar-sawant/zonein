import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useData(user) {
  const [sessions, setSessions] = useState([]);
  const [tags, setTags] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [focusSettings, setFocusSettings] = useState({
    duration: 50,
    task: 'desk',
    tag: null,
    autostart: false,
    autostartBreaks: false,
    breakDuration: 5,
    initial: null,
  });
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (user) loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      const [sessRes, tagsRes, tasksRes, settingsRes] = await Promise.all([
        supabase.from('sessions').select('*').eq('user_id', user.id),
        supabase.from('tags').select('*').eq('user_id', user.id),
        supabase.from('tasks').select('*').eq('user_id', user.id),
        supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      setSessions(sessRes.data || []);
      setTags(tagsRes.data || []);
      setTasks((tasksRes.data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));

      if (settingsRes.data) {
        setFocusSettings({
          duration: settingsRes.data.duration ?? 50,
          task: settingsRes.data.task ?? 'desk',
          tag: settingsRes.data.tag ?? null,
          autostart: settingsRes.data.autostart ?? false,
          autostartBreaks: settingsRes.data.autostart_breaks ?? false,
          breakDuration: settingsRes.data.break_duration ?? 5,
          initial: settingsRes.data.initial ?? null,
        });
      }
      setDataLoaded(true);
    } catch (e) {
      console.error('Load error:', e);
    }
  }, [user]);

  // Session CRUD
  const saveSession = useCallback(async (session) => {
    if (!user) return null;
    const data = { ...session, user_id: user.id };
    const { error } = await supabase
      .from('sessions')
      .upsert(data, { onConflict: 'id' });
    if (error) { console.error('saveSession error:', error); return null; }
    return session;
  }, [user]);

  const deleteSession = useCallback(async (id) => {
    if (!user) return;
    await supabase.from('sessions').delete().eq('id', id).eq('user_id', user.id);
  }, [user]);

  // Tag CRUD
  const saveTag = useCallback(async (tag) => {
    if (!user) return;
    await supabase.from('tags').upsert({ ...tag, user_id: user.id }, { onConflict: 'id,user_id' });
  }, [user]);

  const deleteTagFromDB = useCallback(async (id) => {
    if (!user) return;
    await supabase.from('tags').delete().eq('id', id).eq('user_id', user.id);
  }, [user]);

  // Task CRUD
  const saveTask = useCallback(async (task) => {
    if (!user) return;
    await supabase.from('tasks').upsert({ ...task, user_id: user.id }, { onConflict: 'id' });
  }, [user]);

  const deleteTaskFromDB = useCallback(async (id) => {
    if (!user) return;
    await supabase.from('tasks').delete().eq('id', id).eq('user_id', user.id);
  }, [user]);

  // Settings
  const saveSettings = useCallback(async (settings) => {
    if (!user) return;
    await supabase.from('settings').upsert({
      user_id: user.id,
      duration: settings.duration,
      task: settings.task,
      tag: settings.tag,
      autostart: settings.autostart,
      autostart_breaks: settings.autostartBreaks,
      break_duration: settings.breakDuration,
      initial: settings.initial || null,
    }, { onConflict: 'user_id' });
  }, [user]);

  return {
    sessions, setSessions,
    tags, setTags,
    tasks, setTasks,
    focusSettings, setFocusSettings,
    dataLoaded,
    loadAll,
    saveSession, deleteSession,
    saveTag, deleteTagFromDB,
    saveTask, deleteTaskFromDB,
    saveSettings,
  };
}
