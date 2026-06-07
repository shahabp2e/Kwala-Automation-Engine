'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const config = {
  success: { icon: <CheckCircle size={16} />, color: '#34D399', bg: '#0A2E22', border: '#065F46' },
  error:   { icon: <XCircle     size={16} />, color: '#F87171', bg: '#2E0A0A', border: '#7F1D1D' },
  warning: { icon: <AlertTriangle size={16} />, color: '#FBBF24', bg: '#2E200A', border: '#78350F' },
  info:    { icon: <Info        size={16} />, color: '#60A5FA', bg: '#0A1E2E', border: '#1E3A5F' },
};

function Toast({ toast, onRemove }) {
  const cfg = config[toast.type];

  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 4500);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl text-sm min-w-72 max-w-sm animate-slide-in"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      <span className="mt-0.5 shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-xs opacity-80">{toast.message}</p>}
      </div>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
      {toasts.map(t => <Toast key={t.id} toast={t} onRemove={onRemove} />)}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((type, title, message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
  }, []);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, add, remove };
}
