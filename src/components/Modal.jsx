export default function Modal({ open, onClose, title, children, actions }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="absolute inset-0 grid place-items-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-medium">{title}</div>
              <button onClick={onClose} className="text-sm px-2 py-1 rounded-xl border">✕</button>
            </div>
            <div className="p-4">{children}</div>
            {actions && (
              <div className="px-4 py-3 border-t flex gap-2 justify-end">{actions}</div>
            )}
          </div>
        </div>
      </div>
    );
  }
  