import { useState } from 'react';
import { getDateKey, getTimeLabel } from '../../lib/utils';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulePicker({ task, focusSettings, onConfirm, onClose }) {
  const now = new Date();
  const todayKey = getDateKey(now);

  // Build next 5 days
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const defaultHour = now.getHours() + 1;
  const defaultTime = `${String(defaultHour > 23 ? 0 : defaultHour).padStart(2, '0')}:00`;

  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [timeValue, setTimeValue] = useState(defaultTime);

  const handleConfirm = () => {
    if (!selectedDate || !timeValue) return;
    const [hStr, mStr] = timeValue.split(':');
    const h = parseInt(hStr);
    const m = parseInt(mStr);
    onConfirm({ date: selectedDate, hour: h, min: m });
  };

  if (!task) return null;

  return (
    <div className="schedule-picker show" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="schedule-picker-card" onClick={e => e.stopPropagation()}>
        <div className="schedule-picker-title">Schedule Task</div>
        <div className="schedule-picker-task">"{task.title}"</div>

        <div className="schedule-picker-label">Day</div>
        <div className="schedule-date-row">
          {days.map(d => {
            const dk = getDateKey(d);
            const dayName = dk === todayKey ? 'Today' : DAY_NAMES[d.getDay()];
            return (
              <button
                key={dk}
                className={`schedule-date-btn${selectedDate === dk ? ' active' : ''}`}
                onClick={() => setSelectedDate(dk)}
              >
                {dayName}<br />
                <span style={{ fontSize: 15, fontWeight: 900 }}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        <div className="schedule-picker-label">Time</div>
        <div className="schedule-time-row">
          <input
            className="schedule-time-input"
            type="time"
            value={timeValue}
            onChange={e => setTimeValue(e.target.value)}
          />
        </div>

        <div className="schedule-picker-btns">
          <button className="schedule-confirm-btn" onClick={handleConfirm}>Schedule</button>
          <button className="schedule-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
