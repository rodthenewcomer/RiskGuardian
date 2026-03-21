'use client';

import { Shield } from 'lucide-react';

type LogoSize = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<LogoSize, { iconPx: number; textPx: number; shadow: string; wrapPx: number }> = {
    sm: { iconPx: 16, textPx: 14, shadow: '2px 2px 0 #000', wrapPx: 28 },
    md: { iconPx: 20, textPx: 18, shadow: '3px 3px 0 #000', wrapPx: 36 },
    lg: { iconPx: 26, textPx: 24, shadow: '3px 3px 0 #000', wrapPx: 44 },
};

interface LogoProps {
    size?: LogoSize;
    /** 'dark' = white text (default, for dark app bg); 'light' = dark text (for light landing bg) */
    theme?: 'dark' | 'light';
}

export default function Logo({ size = 'md', theme = 'dark' }: LogoProps) {
    const { iconPx, textPx, shadow, wrapPx } = SIZE_MAP[size];
    const textColor = theme === 'light' ? '#1C293C' : '#fff';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: size === 'sm' ? 8 : 10, textDecoration: 'none' }}>
            <div
                style={{
                    width: wrapPx,
                    height: wrapPx,
                    background: '#FDC800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: shadow,
                    borderRadius: 0,
                }}
            >
                <Shield size={iconPx} color="#000" strokeWidth={2.5} />
            </div>
            <span
                style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: textPx,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                    color: textColor,
                    whiteSpace: 'nowrap',
                }}
            >
                Risk<span style={{ color: '#FDC800' }}>Guardian</span>
            </span>
        </div>
    );
}
