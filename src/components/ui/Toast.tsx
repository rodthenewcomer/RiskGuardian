'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

// Module-level singleton to allow triggering toasts from anywhere
type ToastListener = (toast: Toast) => void;
const listeners: ToastListener[] = [];

export function showToast(message: string, type: ToastType = 'info', duration = 4000) {
  const toast: Toast = { id: `${Date.now()}-${Math.random()}`, message, type, duration };
  listeners.forEach(fn => fn(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: ToastListener = (toast) => {
      setToasts(prev => [...prev.slice(-4), toast]); // max 5 toasts
    };
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 80,
      right: 16,
      zIndex: 9999, // above all modals and overlays
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 340,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration ?? 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const colorMap: Record<ToastType, string> = {
    success: '#FDC800',
    error: '#ff4757',
    warning: '#EAB308',
    info: '#38bdf8',
  };

  const IconMap: Record<ToastType, React.ComponentType<{ size: number; color: string }>> = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const Icon = IconMap[toast.type];
  const color = colorMap[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: '#0d1117',
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: '#c9d1d9',
        pointerEvents: 'auto',
        cursor: 'pointer',
        minWidth: 240,
      }}
      onClick={() => onDismiss(toast.id)}
    >
      <Icon size={16} color={color} />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0 }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
