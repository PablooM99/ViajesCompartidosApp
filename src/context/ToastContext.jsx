import { createContext, useContext, useMemo, useState, useEffect } from "react";

// Estructura del toast: { id, type, message, duration }
const Ctx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Agregar toast (type: "success" | "error" | "info" | "warn")
  const push = (type, message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const duration = Math.max(1000, Number(opts.duration ?? 3500));
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    // Auto-cierre
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
    return id;
  };

  const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const clear = () => setToasts([]);

  const api = useMemo(
    () => ({
      show: (message, opts) => push("info", message, opts),
      success: (message, opts) => push("success", message, opts),
      error: (message, opts) => push("error", message, opts),
      warn: (message, opts) => push("warn", message, opts),
      remove,
      clear,
    }),
    []
  );

  // Evita saltos de scroll cuando aparecen toasts
  useEffect(() => {
    if (!toasts.length) return;
    const el = document.scrollingElement || document.documentElement;
    const prev = el.style.scrollPaddingTop;
    el.style.scrollPaddingTop = "8px";
    return () => {
      el.style.scrollPaddingTop = prev || "";
    };
  }, [toasts.length]);

  return (
    <Ctx.Provider value={api}>
      {children}

      {/* UI de Toasts (esquina superior derecha) */}
      <div className="pointer-events-none fixed top-3 right-3 z-[1000] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto shadow-lg rounded-2xl px-4 py-3 text-sm border",
              t.type === "success" && "bg-green-50 border-green-200 text-green-800",
              t.type === "error" && "bg-red-50 border-red-200 text-red-800",
              t.type === "warn" && "bg-yellow-50 border-yellow-200 text-yellow-800",
              t.type === "info" && "bg-blue-50 border-blue-200 text-blue-800",
            ]
              .filter(Boolean)
              .join(" ")}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5">
                {t.type === "success" ? "✅" : t.type === "error" ? "❌" : t.type === "warn" ? "⚠️" : "ℹ️"}
              </span>
              <div className="flex-1">{t.message}</div>
              <button
                onClick={() => remove(t.id)}
                className="ml-2 rounded-xl border px-2 py-1 text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// Hook para consumir el contexto
export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Permitir que componentes montados fuera del provider no rompan la app
    if (import.meta?.env?.DEV) {
      console.warn("useToast() usado fuera de <ToastProvider />");
    }
    // API no-op para evitar crashes
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      warn: () => {},
      remove: () => {},
      clear: () => {},
    };
  }
  return ctx;
}

// Export por defecto para compatibilidad con imports existentes:
// import ToastProvider from "./context/ToastContext.jsx"
export default ToastProvider;
