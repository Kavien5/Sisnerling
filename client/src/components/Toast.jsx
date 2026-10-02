import React from "react";
import { IconAlert, IconCheck } from "./Icons.jsx";

export const ToastContext = React.createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);
  // Pesan identik yang sedang tampil dicatat agar tidak menumpuk.
  // Tanpa ini, saat server mati beberapa request yang gagal berbarengan
  // memunculkan notifikasi yang sama berulang-ulang.
  const active = React.useRef(new Set());

  const push = (message, type = "success") => {
    const key = type + "|" + message;
    if (active.current.has(key)) return;
    active.current.add(key);
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      active.current.delete(key);
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3500);
  };

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="toast-icon">
              {t.type === "error" ? <IconAlert size={16} /> : <IconCheck size={16} />}
            </span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastContext);
}
