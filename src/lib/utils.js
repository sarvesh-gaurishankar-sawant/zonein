export function getDateKey(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getHourLabel(h) {
  if (h === 0) return '12AM';
  if (h < 12) return h + 'AM';
  if (h === 12) return '12PM';
  return (h - 12) + 'PM';
}

export function getTimeLabel(h, m) {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h === 0 ? 12 : (h > 12 ? h - 12 : h);
  return `${hr}:${String(m).padStart(2, '0')}${ampm}`;
}

export function isMobile() {
  return (
    window.innerWidth <= 600 ||
    window.matchMedia('(max-width: 600px)').matches ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
}

export function sessionEndDate(s) {
  if (s.started_at) return new Date(s.started_at + s.duration * 60000);
  const parts = s.date.split('-');
  const start = new Date(+parts[0], +parts[1] - 1, +parts[2], s.start_hour, s.start_min, 0);
  return new Date(start.getTime() + s.duration * 60000);
}

export function isSlotPast(dk, h, m) {
  const now = new Date(), today = getDateKey(now);
  if (dk < today) return true;
  if (dk === today && (h * 60 + (m || 0)) < (now.getHours() * 60 + now.getMinutes())) return true;
  return false;
}

export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function genId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
