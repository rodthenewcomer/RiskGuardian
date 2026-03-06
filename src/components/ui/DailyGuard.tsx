'use client';

import styles from './DailyGuard.module.css';
import { useAppStore } from '@/store/appStore';
import { motion } from 'framer-motion';
import { ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';

interface DailyGuardProps {
    size?: number;
    showLabel?: boolean;
}

export default function DailyGuard({ size = 160, showLabel = true }: DailyGuardProps) {
    const { account, getTodayRiskUsed } = useAppStore();
    const used = getTodayRiskUsed();
    const remaining = Math.max(0, account.dailyLossLimit - used);
    const pct = Math.min(100, (used / account.dailyLossLimit) * 100);

    const r = (size / 2) * 0.75;
    const circumference = 2 * Math.PI * r;
    const strokeDash = circumference - (pct / 100) * circumference;

    const isWarning = pct >= 60;
    const isDanger = pct >= 90;
    const isBlown = pct >= 100;

    const color = isBlown ? '#FF3D71' : isDanger ? '#FF3D71' : isWarning ? '#FFB300' : '#00D4FF';
    const StatusIcon = isBlown ? ShieldOff : isDanger ? ShieldAlert : ShieldCheck;

    return (
        <div className={styles.wrapper} style={{ width: size, height: size }}>
            {/* SVG ring */}
            <svg width={size} height={size} className={styles.svg}>
                {/* Track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={8}
                />
                {/* Glow track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={8}
                    strokeOpacity={0.15}
                />
                {/* Animated fill */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: strokeDash }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
                />
            </svg>

            {/* Center content */}
            <div className={styles.center}>
                <div className={styles.statusIcon} style={{ color }}>
                    <StatusIcon size={20} strokeWidth={2} />
                </div>
                <motion.span
                    key={remaining}
                    className={styles.remaining}
                    style={{ color }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25 }}
                >
                    ${remaining.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </motion.span>
                {showLabel && (
                    <span className={styles.label}>
                        {isBlown ? 'Daily Limit Hit' : 'Risk Remaining'}
                    </span>
                )}
                <span className={styles.sublabel}>
                    {Math.round(pct)}% used
                </span>
            </div>
        </div>
    );
}
