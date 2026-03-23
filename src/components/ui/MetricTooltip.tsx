'use client';
import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface MetricTooltipProps {
  definition: string;
  healthyRange?: string;
}

export default function MetricTooltip({ definition, healthyRange }: MetricTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mono = 'var(--font-mono)';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Metric definition"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#4b5563', padding: '0 3px', lineHeight: 1,
          display: 'inline-flex', alignItems: 'center',
        }}
      >
        <HelpCircle size={11} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 6,
              background: '#0d1117',
              border: '1px solid #1a1c24',
              borderRadius: 2,
              padding: '10px 12px',
              minWidth: 220,
              maxWidth: 280,
              zIndex: 50, /* tooltip popover above all content */
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 11, color: '#c9d1d9', lineHeight: 1.5 }}>
              {definition}
            </div>
            {healthyRange && (
              <div style={{ fontFamily: mono, fontSize: 10, color: '#FDC800', marginTop: 6, lineHeight: 1.4 }}>
                Target: {healthyRange}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
