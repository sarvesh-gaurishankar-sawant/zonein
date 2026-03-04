import { useEffect, useRef, useState } from 'react';
import { TAG_COLORS } from '../../lib/constants';

export default function TagsView({ tags, sessions, onAddTag, onDeleteTag, showToast }) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const completed = sessions.filter(s => s.status === 'completed');

  const handleAdd = async () => {
    const name = newTagName.trim();
    if (!name) return;
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      showToast('Tag already exists');
      return;
    }
    await onAddTag(name, newTagColor);
    setNewTagName('');
    showToast(`Tag "${name}" added!`);
  };

  return (
    <div className="tags-page">
      <div className="tags-section">
        <div className="tags-section-title">Create New Tag</div>
        <div className="add-tag-row">
          <input
            ref={inputRef}
            className="add-tag-input"
            type="text"
            placeholder="Tag name..."
            maxLength={20}
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="add-tag-btn" onClick={handleAdd}>Add</button>
        </div>
        <div className="color-picker-row">
          {TAG_COLORS.map(c => (
            <div
              key={c}
              className={`color-dot${newTagColor === c ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setNewTagColor(c)}
            />
          ))}
        </div>
      </div>

      <div className="tags-section">
        <div className="tags-section-title">Your Tags ({tags.length})</div>
        {tags.length > 0 ? (
          <div className="tag-list">
            {tags.map(t => {
              const count = completed.filter(s => s.tag === t.id).length;
              return (
                <div key={t.id} className="tag-item">
                  <div className="tag-item-color" style={{ background: t.color }} />
                  <div className="tag-item-name">{t.name}</div>
                  <div className="tag-item-count">{count} session{count !== 1 ? 's' : ''}</div>
                  <button
                    className="tag-item-del"
                    onClick={e => { e.stopPropagation(); onDeleteTag(t.id); }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="tags-empty">No tags yet. Create one above!</div>
        )}
      </div>
    </div>
  );
}
