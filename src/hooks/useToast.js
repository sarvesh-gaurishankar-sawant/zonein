import { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ visible: false, msg: '' });
  const timerRef = useRef(null);

  const showToast = useCallback((msg, duration = 2500) => {
    setToast({ visible: true, msg });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast({ visible: false, msg: '' }), duration);
  }, []);

  const dismissToast = useCallback(() => {
    setToast({ visible: false, msg: '' });
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast, showToast, dismissToast };
}
