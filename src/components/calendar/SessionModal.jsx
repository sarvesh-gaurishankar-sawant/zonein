import { useState, useEffect } from 'react';
import { getTimeLabel } from '../../lib/utils';
import { MOODS } from '../timer/BreakOverlay';

export default function SessionModal({ session, tags, onClose, onSave, onDelete }) {
  const [notes, setNotes] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedMood, setSelectedMood] = useState(null);

  useEffect(() => {
    if (session) {
      setNotes(session.notes || '');
      setSelectedTag(session.tag || null);
      setSelectedMood(session.mood || null);
    }
  }, [session]);

  if (!session) return null;

  const statusLabel =
    session.status === 'active' ? 'In Progress' :
    session.status === 'completed' ? 'Completed' :
    session.status === 'booked' ? 'Booked' : session.status;

  const handleSave = () => {
    onSave({ ...session, notes: notes.trim(), tag: selectedTag, mood: selectedMood || null });
  };

  return (
    <div className="modal-overlay show" onClick={(e) => e.target.classList.contains('modal-overlay') && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>
        <div className="modal-title">Session Details</div>
        <div className="modal-subtitle">{session.date} at {getTimeLabel(session.start_hour, session.start_min)}</div>
        <div className="modal-info-row">
          <span className="modal-info-chip">{session.duration} min</span>
          <span className="modal-info-chip">{statusLabel}</span>
        </div>
        <div className="modal-field-label" style={{ marginBottom: 6 }}>Tag</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            className={`tag-sel-btn${!selectedTag ? ' active' : ''}`}
            onClick={() => setSelectedTag(null)}
          >None</button>
          {tags.map((t) => (
            <button
              key={t.id}
              className={`tag-sel-btn${selectedTag === t.id ? ' active' : ''}`}
              style={selectedTag !== t.id ? { borderColor: t.color + '55' } : {}}
              onClick={() => setSelectedTag(t.id)}
            >
              <span className="tag-sel-dot" style={{ background: t.color }} />
              {t.name}
            </button>
          ))}
          {tags.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No tags yet — create some in the Tags tab</span>
          )}
        </div>
        <div className="modal-field-label" style={{ marginBottom: 6 }}>Mood</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {MOODS.map(m => (
            <button
              key={m.id}
              className={`mood-btn modal-mood-btn${selectedMood === m.id ? ' selected' : ''}`}
              onClick={() => setSelectedMood(selectedMood === m.id ? null : m.id)}
              title={m.label}
            >
              <span className="mood-emoji">{m.emoji}</span>
              <span className="mood-label">{m.label}</span>
            </button>
          ))}
        </div>
        <div className="modal-field-label">What did you work on?</div>
        <textarea
          className="modal-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Solved 3 LeetCode mediums on trees, reviewed binary search patterns..."
          autoFocus
        />
        <div className="modal-btn-row">
          <button className="modal-save-btn" onClick={handleSave}>Save Notes</button>
          <button className="modal-del-btn" onClick={() => onDelete(session.id)}>Delete</button>
        </div>
      </div>
    </div>
  );
}
