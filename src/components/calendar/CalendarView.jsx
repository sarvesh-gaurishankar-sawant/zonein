import { useEffect, useRef, useState } from 'react';
import { getDateKey, getHourLabel, getTimeLabel, isMobile, isSlotPast, genId } from '../../lib/utils';

const ROW_H_DESKTOP = 9;
const ROW_H_MOBILE = 14;

export default function CalendarView({
  sessions, tags, focusSettings,
  calOffset, setCalOffset,
  selectedSlot, setSelectedSlot,
  confirmingCancel, setConfirmingCancel,
  onStartSession, onCompleteSession, onCancelSession,
  onOpenModal, onBook,
}) {
  const scrollRef = useRef(null);
  const [mobile, setMobile] = useState(isMobile());
  const [hoverPreview, setHoverPreview] = useState(null);

  useEffect(() => {
    const onResize = () => setMobile(isMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const rowH = mobile ? ROW_H_MOBILE : ROW_H_DESKTOP;
  const cols = mobile ? 1 : 3;

  const getCalDays = () => {
    const days = [];
    const base = new Date();
    base.setDate(base.getDate() + calOffset * cols);
    for (let i = 0; i < cols; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const calDays = getCalDays();
  const now = new Date();
  const today = getDateKey();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const rangeStart = calDays[0];
  const rangeEnd = calDays[calDays.length - 1];
  const rangeLabel = rangeStart.getMonth() === rangeEnd.getMonth()
    ? `${monthNames[rangeStart.getMonth()]} ${rangeStart.getFullYear()}`
    : `${monthNames[rangeStart.getMonth()]} — ${monthNames[rangeEnd.getMonth()]} ${rangeEnd.getFullYear()}`;

  const timeSlots = [];
  for (let h = 0; h <= 23; h++) for (let m = 0; m < 60; m += 5) timeSlots.push({ h, m });

  const nowTotal = now.getHours() * 60 + now.getMinutes();
  const nowOffset = (nowTotal / 5) * rowH;
  const showNowLine = calDays.some((d) => getDateKey(d) === today);

  useEffect(() => {
    if (showNowLine && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, nowOffset - 100);
    }
  }, []);

  const getSessionsForSlot = (date, h, m) =>
    sessions.filter((s) => {
      if (s.date !== date || s.status === 'cancelled') return false;
      const sS = s.start_hour * 60 + s.start_min;
      const sE = sS + s.duration;
      const t = h * 60 + m;
      return t >= sS && t < sE;
    });

  const isSlotCovered = (date, h, m) =>
    sessions.some((s) => {
      if (s.date !== date || s.status === 'cancelled') return false;
      const sS = s.start_hour * 60 + s.start_min;
      const sE = sS + s.duration;
      const t = h * 60 + m;
      return t > sS && t < sE;
    });

  const getCountdown = (s) => {
    if (s.status !== 'active' || !s.started_at) return null;
    const end = s.started_at + s.duration * 60000;
    const msLeft = end - Date.now();
    if (msLeft <= 0) return null;
    const sec = Math.ceil(msLeft / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} left`;
  };

  const gridCols = `${mobile ? 32 : 36}px repeat(${cols}, 1fr)`;

  return (
    <div className="cal-card">
      <div className="cal-header">
        <div className="cal-title">{rangeLabel}</div>
        <div className="cal-nav-group">
          <button className="cal-nav" onClick={() => { setCalOffset((o) => o - 1); setSelectedSlot(null); }}>‹</button>
          <button className="cal-today-btn" onClick={() => { setCalOffset(0); setSelectedSlot(null); }}>Today</button>
          <button className="cal-nav" onClick={() => { setCalOffset((o) => o + 1); setSelectedSlot(null); }}>›</button>
        </div>
      </div>

      <div className="cal-day-headers" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {calDays.map((d) => {
          const dk = getDateKey(d);
          const isT = dk === today;
          return (
            <div key={dk} className={`cal-day-hdr${isT ? ' today-hdr' : ''}`}>
              {isT ? 'Today' : dayNames[d.getDay()]} {d.getDate()}
            </div>
          );
        })}
      </div>

      <div className="cal-scroll" ref={scrollRef}>
        {showNowLine && (
          <>
            <div className="now-time-label" style={{ top: nowOffset - 5 }}>{getTimeLabel(now.getHours(), now.getMinutes())}</div>
            <div className="now-dot" style={{ top: nowOffset }} />
            <div className="now-line" style={{ top: nowOffset }} />
          </>
        )}

        {timeSlots.map(({ h, m }) => {
          const isHour = m === 0;
          const is15 = m % 15 === 0;
          const tLabel = isHour ? getHourLabel(h) : (is15 ? `:${String(m).padStart(2, '0')}` : '');

          return (
            <div
              key={`${h}-${m}`}
              className={`cal-time-row${isHour ? ' hour-row' : is15 ? ' quarter-row' : ''}`}
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className={`cal-time-label${isHour ? ' hour-label' : ''}`}>{tLabel}</div>

              {calDays.map((d) => {
                const dk = getDateKey(d);
                const past = isSlotPast(dk, h, m);
                const slotSessions = getSessionsForSlot(dk, h, m);
                const hasS = slotSessions.length > 0;
                const isSel = selectedSlot?.date === dk && selectedSlot?.hour === h && selectedSlot?.min === m;
                const covered = isSlotCovered(dk, h, m);

                let sc = null;

                if (isSel && !hasS) {
                  const popH = Math.round((focusSettings.duration / 5) * rowH) - 2;
                  sc = (
                    <div className="slot-popup" style={{ height: popH }}>
                      <button className="slot-popup-btn book" onClick={() => onBook(dk, h, m)}>
                        Book {focusSettings.duration}min
                      </button>
                      <button className="slot-popup-btn clear" onClick={() => setSelectedSlot(null)}>Clear</button>
                    </div>
                  );
                } else if (hasS) {
                  slotSessions.forEach((s) => {
                    if (s.start_hour === h && s.start_min === m) {
                      const sTag = s.tag ? tags.find((t) => t.id === s.tag) : null;
                      const blockH = Math.round((s.duration / 5) * rowH) - 2;
                      const countdown = getCountdown(s);

                      if (confirmingCancel === s.id) {
                        sc = (
                          <div className="cancel-popup" style={{ height: blockH }}>
                            <button className="cancel-popup-btn keep" onClick={() => setConfirmingCancel(null)}>Keep</button>
                            <button className="cancel-popup-btn cancel-confirm" onClick={() => onCancelSession(s.id)}>Cancel Session</button>
                          </div>
                        );
                      } else {
                        const hasActions = s.status === 'booked' || s.status === 'active';
                        sc = (
                          <div
                            className={`session-block ${s.status}`}
                            style={{ height: blockH, position: 'relative', paddingBottom: hasActions ? 22 : 0 }}
                            onClick={() => onOpenModal(s.id)}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700 }}>{getTimeLabel(s.start_hour, s.start_min)}</div>
                                <div style={{ fontSize: 8, opacity: 0.6 }}>{s.duration}min</div>
                              </div>
                              <div>
                                {s.status === 'active' && countdown && (
                                  <div className="session-countdown">{countdown}</div>
                                )}
                                {s.status === 'completed' && <div style={{ fontSize: 8, color: 'var(--text-secondary)' }}>✓ Done</div>}
                                {s.notes && <div style={{ fontSize: 7, color: 'var(--accent)', opacity: 0.7 }}>✎ notes</div>}
                              </div>
                            </div>
                            {sTag && (
                              <div className="session-tag" style={{ background: sTag.color + '33', color: sTag.color }}>{sTag.name}</div>
                            )}
                            {s.linked_id && s.start_hour === 0 && s.start_min === 0 && (
                              <div style={{ fontSize: 7, color: 'var(--accent)', opacity: 0.8, marginTop: 2 }}>↑ from prev day</div>
                            )}
                            {s.linked_id && !(s.start_hour === 0 && s.start_min === 0) && (
                              <div style={{ fontSize: 7, color: 'var(--accent)', opacity: 0.8, marginTop: 2 }}>↓ continues next day</div>
                            )}
                            {hasActions && (
                              <div className="session-actions">
                                {s.status === 'booked' && (
                                  <button className="session-action-btn" onClick={(e) => { e.stopPropagation(); onStartSession(s.id); }}>▶</button>
                                )}
                                {s.status === 'active' && (
                                  <button className="session-action-btn" onClick={(e) => { e.stopPropagation(); onCompleteSession(s.id); }}>✓</button>
                                )}
                                <button className="session-action-btn x-btn" onClick={(e) => { e.stopPropagation(); setConfirmingCancel(s.id); setSelectedSlot(null); }}>✕</button>
                              </div>
                            )}
                          </div>
                        );
                      }
                    }
                  });
                }

                return (
                  <div
                    key={dk}
                    className={`cal-slot${past && !hasS ? ' past-slot' : ''}`}
                    style={covered && !hasS ? { pointerEvents: 'none' } : {}}
                    onClick={!past && !hasS && !isSel && !covered ? () => {
                      setConfirmingCancel(null);
                      setSelectedSlot((prev) =>
                        prev?.date === dk && prev?.hour === h && prev?.min === m ? null : { date: dk, hour: h, min: m }
                      );
                    } : undefined}
                    onMouseEnter={!mobile && !past && !hasS && !covered ? (e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const scrollBottom = scrollRef.current?.getBoundingClientRect().bottom ?? window.innerHeight;
                      const rawHeight = Math.round((focusSettings.duration / 5) * rowH) - 2;
                      // Clamp height so the preview never overflows below the calendar scroll area
                      const height = Math.min(rawHeight, scrollBottom - rect.top - 2);
                      setHoverPreview({ top: rect.top, left: rect.left, width: rect.width, height });
                    } : undefined}
                    onMouseLeave={!mobile ? () => setHoverPreview(null) : undefined}
                  >
                    {sc}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {hoverPreview && (
        <div
          className="hover-duration-preview"
          style={{
            position: 'fixed',
            top: hoverPreview.top,
            left: hoverPreview.left,
            width: hoverPreview.width,
            height: hoverPreview.height,
          }}
        />
      )}
    </div>
  );
}
