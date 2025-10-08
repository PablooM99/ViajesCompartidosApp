import { createContext, useContext, useState, useCallback, useEffect } from "react";

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

let idSeq = 0;
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((payload) => {
    const id = ++idSeq;
    const t = { id, type: payload.type || 'info', message: String(payload.message || ''), ttl: payload.ttl || 3000 };
    setToasts((prev) => [...prev, t]);
    return id;
  }, []);

  const success = (message) => push({ type: 'success', message });
  const error = (message) => push({ type: 'error', message, ttl: 4500 });

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map(t => setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== t.id));
    }, t.ttl));
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ push, success, error }}>
      {children}
      <div className="fixed bottom-3 inset-x-0 z-50 px-3 grid place-items-center pointer-events-none">
        <div className="w-full max-w-sm space-y-2">
          {toasts.map(t => (
            <div key={t.id}
                 className={`pointer-events-auto rounded-2xl border px-3 py-2 shadow-sm bg-white ${t.type==='success' ? 'border-emerald-300' : t.type==='error' ? 'border-rose-300' : 'border-neutral-200'}`}>
              <div className="text-sm">{t.message}</div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
