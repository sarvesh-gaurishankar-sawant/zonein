export default function NotifPopup({ notif, onDismiss }) {
  if (!notif.visible) return null;
  return (
    <div className="notif-popup show" onClick={onDismiss}>
      <div className="notif-popup-title">{notif.title}</div>
      <div className="notif-popup-body">{notif.body}</div>
      <div className="notif-popup-dismiss">Click to dismiss</div>
    </div>
  );
}
