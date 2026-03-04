import { useState } from 'react';
import { getDateKey } from '../../lib/utils';

const PERIODS = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
  ['lifetime', 'Lifetime'],
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getStatsDateRange(period, offset) {
  const now = new Date();
  const off = offset || 0;

  if (period === 'daily') {
    const d = new Date(now);
    d.setDate(d.getDate() + off);
    const dk = getDateKey(d);
    const label = DAY_NAMES[d.getDay()] + ', ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getDate();
    return { start: dk, end: dk, label, isCurrent: off === 0 };
  } else if (period === 'weekly') {
    const base = new Date(now);
    base.setDate(now.getDate() - now.getDay() + off * 7);
    const s = new Date(base);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    const label = MONTH_NAMES[s.getMonth()] + ' ' + s.getDate() + ' – ' + MONTH_NAMES[e.getMonth()] + ' ' + e.getDate();
    return { start: getDateKey(s), end: getDateKey(e), label, isCurrent: off === 0 };
  } else if (period === 'monthly') {
    const target = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const s = target;
    const e = new Date(target.getFullYear(), target.getMonth() + 1, 0);
    const label = MONTH_NAMES[s.getMonth()] + ' ' + s.getFullYear();
    return { start: getDateKey(s), end: getDateKey(e), label, isCurrent: off === 0 };
  } else if (period === 'yearly') {
    const yr = now.getFullYear() + off;
    const s = new Date(yr, 0, 1);
    const e = new Date(yr, 11, 31);
    return { start: getDateKey(s), end: getDateKey(e), label: String(yr), isCurrent: off === 0 };
  }
  return { start: null, end: null, label: 'All Time', isCurrent: true };
}

function buildChartData(period, range, completed, allCompleted) {
  const now = new Date();
  const today = getDateKey();
  let chartData = [];
  let maxVal = 1;

  if (period === 'daily') {
    const dayKey = range.start;
    for (let h = 0; h <= 23; h++) {
      const mins = completed.filter(s => s.date === dayKey && s.start_hour >= h && s.start_hour < h + 1)
        .reduce((a, s) => a + s.duration, 0);
      const isNow = range.isCurrent && h === now.getHours();
      chartData.push({ label: h > 12 ? (h - 12) + 'p' : (h === 0 ? '12a' : (h === 12 ? '12p' : h + 'a')), value: mins, isNow });
    }
  } else if (period === 'weekly') {
    const [y, mo, d] = range.start.split('-').map(Number);
    const weekBase = new Date(y, mo - 1, d);
    for (let i = 0; i < 7; i++) {
      const wd = new Date(weekBase);
      wd.setDate(weekBase.getDate() + i);
      const dk = getDateKey(wd);
      const mins = completed.filter(s => s.date === dk).reduce((a, s) => a + s.duration, 0);
      chartData.push({ label: DAY_NAMES[wd.getDay()], value: mins, isNow: dk === today });
    }
  } else if (period === 'monthly') {
    const [y, mo, d] = range.start.split('-').map(Number);
    const [ey, emo, ed] = range.end.split('-').map(Number);
    const firstDay = new Date(y, mo - 1, d);
    const lastDay = new Date(ey, emo - 1, ed);
    let weekStart = new Date(firstDay);
    let wk = 1;
    while (weekStart <= lastDay) {
      const wEnd = new Date(weekStart);
      wEnd.setDate(weekStart.getDate() + 6);
      const wEndClamped = wEnd > lastDay ? lastDay : wEnd;
      const ws = getDateKey(weekStart), we = getDateKey(wEndClamped);
      const mins = completed.filter(s => s.date >= ws && s.date <= we).reduce((a, s) => a + s.duration, 0);
      chartData.push({ label: 'W' + wk, value: mins, isNow: today >= ws && today <= we });
      weekStart.setDate(weekStart.getDate() + 7);
      wk++;
    }
  } else if (period === 'yearly') {
    const yr = parseInt(range.start.slice(0, 4));
    for (let m = 0; m < 12; m++) {
      const ms = getDateKey(new Date(yr, m, 1));
      const me = getDateKey(new Date(yr, m + 1, 0));
      const mins = completed.filter(s => s.date >= ms && s.date <= me).reduce((a, s) => a + s.duration, 0);
      chartData.push({ label: MONTH_NAMES[m].slice(0, 3), value: mins, isNow: range.isCurrent && m === now.getMonth() });
    }
  } else {
    const dates = allCompleted.map(s => s.date).sort();
    if (dates.length > 0) {
      const firstYear = parseInt(dates[0].slice(0, 4)), lastYear = now.getFullYear();
      for (let y = firstYear; y <= lastYear; y++) {
        const ys = y + '-01-01', ye = y + '-12-31';
        const mins = allCompleted.filter(s => s.date >= ys && s.date <= ye).reduce((a, s) => a + s.duration, 0);
        chartData.push({ label: String(y), value: mins, isNow: y === now.getFullYear() });
      }
    }
  }

  maxVal = Math.max(...chartData.map(c => c.value), 1);
  return { chartData, maxVal };
}

export default function StatsView({ sessions, tags }) {
  const [period, setPeriod] = useState('weekly');
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const today = getDateKey();
  const range = getStatsDateRange(period, offset);

  const allCompleted = sessions.filter(s => s.status === 'completed');
  const completed = range.start
    ? allCompleted.filter(s => s.date >= range.start && s.date <= range.end)
    : allCompleted;

  const totalSessions = completed.length;
  const totalMinutes = completed.reduce((a, s) => a + s.duration, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const avgDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  // Streak calculation
  let streak = 0;
  let streakDate = new Date();
  while (true) {
    const k = getDateKey(streakDate);
    if (sessions.some(s => s.date === k && s.status === 'completed')) {
      streak++;
      streakDate.setDate(streakDate.getDate() - 1);
    } else break;
  }

  const { chartData, maxVal } = buildChartData(period, range, completed, allCompleted);

  // Last 7 days streak bar
  const streakDays = [];
  for (let i = 6; i >= 0; i--) {
    const sd = new Date();
    sd.setDate(sd.getDate() - i);
    const dk = getDateKey(sd);
    const done = sessions.some(s => s.date === dk && s.status === 'completed');
    streakDays.push({ dk, done, isToday: dk === today, day: DAY_NAMES[sd.getDay()] });
  }

  const dur25 = completed.filter(s => s.duration === 25).length;
  const dur50 = completed.filter(s => s.duration === 50).length;
  const dur75 = completed.filter(s => s.duration === 75).length;

  const dayCounts = {};
  completed.forEach(s => { dayCounts[s.date] = (dayCounts[s.date] || 0) + 1; });
  const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="stats-page">
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Your Focus Stats</div>

      <div className="stats-period-row">
        {PERIODS.map(([k, lbl]) => (
          <button
            key={k}
            className={`stats-period-btn${period === k ? ' active' : ''}`}
            onClick={() => { setPeriod(k); setOffset(0); }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {period !== 'lifetime' && (
        <div className="stats-nav-row">
          <button className="stats-nav-btn" onClick={() => setOffset(o => o - 1)}>‹</button>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="stats-nav-label">{range.label}</span>
            {!range.isCurrent && (
              <button className="stats-nav-today" onClick={() => setOffset(0)}>Today</button>
            )}
          </div>
          <button className="stats-nav-btn" onClick={() => setOffset(o => o + 1)}>›</button>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalSessions}</div>
          <div className="stat-label">Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalHours}h</div>
          <div className="stat-label">Focus Time</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{streak}</div>
          <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{avgDuration}m</div>
          <div className="stat-label">Avg Session</div>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="stat-card wide">
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>By Tag</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tags.map(t => {
              const tc = completed.filter(s => s.tag === t.id);
              const tCount = tc.length;
              const tMins = tc.reduce((a, s) => a + s.duration, 0);
              const tHrs = (tMins / 60).toFixed(1);
              const barW = totalMinutes > 0 ? Math.max(4, Math.round((tMins / totalMinutes) * 100)) : 0;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {tCount} session{tCount !== 1 ? 's' : ''} · {tMins >= 60 ? tHrs + 'h' : tMins + 'm'}
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: barW + '%', borderRadius: 2, background: t.color, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {(() => {
              const untagged = completed.filter(s => !s.tag);
              if (untagged.length === 0) return null;
              const uMins = untagged.reduce((a, s) => a + s.duration, 0);
              const uHrs = (uMins / 60).toFixed(1);
              const barW = totalMinutes > 0 ? Math.max(4, Math.round((uMins / totalMinutes) * 100)) : 0;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>Untagged</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {untagged.length} session{untagged.length !== 1 ? 's' : ''} · {uMins >= 60 ? uHrs + 'h' : uMins + 'm'}
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: barW + '%', borderRadius: 2, background: 'var(--text-muted)', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="stat-card wide">
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Last 7 Days</div>
        <div className="streak-bar">
          {streakDays.map(sd => (
            <div key={sd.dk} className={`streak-day${sd.done ? ' done' : ' empty'}${sd.isToday ? ' today' : ''}`}>
              <div>
                <div style={{ fontSize: 11 }}>{sd.done ? '✓' : ''}</div>
                <div>{sd.day}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card wide">
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Activity</div>
        <div className="weekly-chart" style={chartData.length > 12 ? { overflowX: 'auto' } : {}}>
          {chartData.map((w, i) => (
            <div key={i} className="weekly-bar-col" style={chartData.length > 12 ? { minWidth: 28 } : {}}>
              <div className="weekly-bar-val">
                {w.value > 0 ? (w.value >= 60 ? Math.round(w.value / 60) + 'h' : w.value + 'm') : ''}
              </div>
              <div
                className="weekly-bar"
                style={{
                  height: w.value > 0 ? (w.value / maxVal) * 45 : 2,
                  background: w.isNow ? 'linear-gradient(180deg,var(--accent-light),var(--accent))' : undefined,
                }}
              />
              <div className="weekly-bar-label" style={w.isNow ? { color: 'var(--accent)', fontWeight: 700 } : {}}>
                {w.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card wide">
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Session Breakdown</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[[25, dur25, '#d98e48'], [50, dur50, '#5cb87a'], [75, dur75, '#e8a962']].map(([d, c, col]) => (
            <div key={d} style={{ flex: 1, textAlign: 'center', padding: 8, borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: col }}>{c}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{d} min</div>
            </div>
          ))}
        </div>
      </div>

      {bestDay ? (
        <div className="stat-card wide" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Best Day</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{bestDay[1]} sessions</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{bestDay[0]}</div>
        </div>
      ) : (
        <div className="stat-card wide" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 13 }}>
            {period === 'lifetime' ? 'Complete your first session to see stats!' : 'No sessions in this period yet'}
          </div>
        </div>
      )}
    </div>
  );
}
