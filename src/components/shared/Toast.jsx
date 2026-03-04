export default function Toast({ toast, onDismiss }) {
  if (!toast.visible) return null;
  return (
    <div className="toast" onClick={onDismiss}>
      <span id="toast-msg">{toast.msg}</span>
      <span className="toast-close">✕</span>
    </div>
  );
}
