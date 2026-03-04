import { useEffect, useRef, useState } from 'react';
import { genId } from '../../lib/utils';
import SchedulePicker from './SchedulePicker';

export default function InboxView({
  tasks, tags, focusSettings,
  onAddTask, onToggleTask, onDeleteTask,
  onScheduleTask, showToast,
}) {
  const [inputValue, setInputValue] = useState('');
  const [schedulingTask, setSchedulingTask] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const pending = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  const handleAdd = async () => {
    const title = inputValue.trim();
    if (!title) return;
    await onAddTask(title);
    setInputValue('');
  };

  const handleScheduleConfirm = async ({ date, hour, min }) => {
    if (!schedulingTask) return;
    await onScheduleTask(schedulingTask.id, { date, hour, min });
    setSchedulingTask(null);
    showToast(`Scheduled for ${hour % 12 || 12}:${String(min).padStart(2, '0')}${hour >= 12 ? 'pm' : 'am'}!`);
  };

  const TaskItem = ({ t }) => {
    const tag = t.tag_id ? tags.find(x => x.id === t.tag_id) : null;
    return (
      <div className={`inbox-item${t.done ? ' done' : ''}`}>
        <button className="inbox-check" onClick={() => onToggleTask(t.id)}>
          {t.done ? '✓' : ''}
        </button>
        {tag && <span className="inbox-tag-dot" style={{ background: tag.color }} title={tag.name} />}
        <span className="inbox-title">{t.title}</span>
        <div className="inbox-actions">
          {!t.done && (
            <button
              className="inbox-action-btn"
              onClick={() => setSchedulingTask(t)}
              title="Schedule"
            >
              ⊕
            </button>
          )}
          <button className="inbox-action-btn del" onClick={() => onDeleteTask(t.id)} title="Delete">
            ✕
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="inbox-page">
      <div className="inbox-add-bar">
        <input
          ref={inputRef}
          className="inbox-input"
          type="text"
          placeholder="What's on your mind…"
          maxLength={200}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="inbox-add-btn" onClick={handleAdd}>+</button>
      </div>

      <div className="inbox-list">
        {tasks.length === 0 ? (
          <div className="inbox-empty">
            <div className="inbox-empty-icon">📥</div>
            <div className="inbox-empty-text">Your inbox is clear.<br />Type above to capture a thought.</div>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <div className="inbox-section-label">Pending — {pending.length}</div>
                {pending.map(t => <TaskItem key={t.id} t={t} />)}
              </>
            )}
            {done.length > 0 && (
              <>
                <div className="inbox-section-label">Done — {done.length}</div>
                {done.map(t => <TaskItem key={t.id} t={t} />)}
              </>
            )}
          </>
        )}
      </div>

      {schedulingTask && (
        <SchedulePicker
          task={schedulingTask}
          focusSettings={focusSettings}
          onConfirm={handleScheduleConfirm}
          onClose={() => setSchedulingTask(null)}
        />
      )}
    </div>
  );
}
