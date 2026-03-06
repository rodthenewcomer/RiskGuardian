'use client';

import { useEffect, useState } from 'react';
import styles from './Header.module.css';
import { useAppStore } from '@/store/appStore';
import { Shield, Bell } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Header() {
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line
    useEffect(() => { setMounted(true); }, []);

    const { account, getTodayRiskUsed } = useAppStore();
    const used = mounted ? getTodayRiskUsed() : 0;
    const guardPct = mounted ? Math.min(100, (used / account.dailyLossLimit) * 100) : 0;
    const isWarning = mounted && guardPct >= 60;
    const isDanger = mounted && guardPct >= 90;

    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                {/* Logo */}
                <div className={styles.logo}>
                    <div className={`${styles.logoIcon}${isDanger ? ` ${styles.danger}` : isWarning ? ` ${styles.warning}` : ''}`}>
                        <Shield size={16} strokeWidth={2.5} />
                    </div>
                    <span className={styles.logoText}>
                        Prop<span className={styles.logoAccent}>Guard</span>
                    </span>
                </div>

                {/* Balance pill */}
                <div className={styles.balancePill}>
                    <span className={styles.balanceLabel}>Balance</span>
                    <motion.span
                        key={mounted ? account.balance : 0}
                        className={styles.balanceValue}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        ${mounted
                            ? account.balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                            : '—'
                        }
                    </motion.span>
                </div>

                {/* Notification bell */}
                <button className="btn btn--icon" aria-label="Notifications">
                    <Bell size={18} />
                    {mounted && isDanger && <span className={styles.notifDot} />}
                </button>
            </div>

            {/* Guard progress bar */}
            <div className={styles.guardBar}>
                <motion.div
                    className={`${styles.guardFill} ${isDanger ? styles.guardDanger : isWarning ? styles.guardWarning : styles.guardSafe}`}
                    initial={{ width: 0 }}
                    animate={{ width: mounted ? `${guardPct}%` : '0%' }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
            </div>
        </header>
    );
}
