'use client';

import styles from './BottomNav.module.css';
import { useAppStore } from '@/store/appStore';
import { LayoutDashboard, Terminal, BookOpen, Brain, BarChart2, Settings2, FlaskConical } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from '@/i18n/useTranslation';

const TAB_IDS = [
    { id: 'dashboard' as const, icon: LayoutDashboard },
    { id: 'terminal' as const, icon: Terminal },
    { id: 'journal' as const, icon: BookOpen },
    { id: 'plan' as const, icon: Brain },
    { id: 'analytics' as const, icon: BarChart2 },
    { id: 'simulator' as const, icon: FlaskConical },
    { id: 'settings' as const, icon: Settings2 },
];

export default function BottomNav() {
    const { activeTab, setActiveTab } = useAppStore();
    const { t } = useTranslation();

    const tabLabels: Record<string, string> = {
        dashboard: t.nav.dashboard,
        terminal: t.nav.riskEngine,
        journal: t.nav.journal,
        plan: t.nav.aiCoach,
        analytics: t.nav.analytics,
        simulator: t.nav.simulator,
        settings: t.nav.settings,
    };

    return (
        <nav className={styles.nav} role="navigation" aria-label="Main navigation">
            <div className={styles.inner}>
                {TAB_IDS.map(({ id, icon: Icon }) => {
                    const active = activeTab === id;
                    const label = tabLabels[id] ?? id;
                    let hasAgedTrades = false;
                    if (id === 'journal') {
                        const store = useAppStore();
                        hasAgedTrades = store.trades.some(t => t.outcome === 'open' && Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 3600000) >= 4);
                    }

                    return (
                        <button
                            key={id}
                            className={`${styles.tab} ${active ? styles.active : ''}`}
                            onClick={() => setActiveTab(id)}
                            aria-label={label}
                            aria-current={active ? 'page' : undefined}
                            title={label}
                            style={{ position: 'relative' }}
                        >
                            {active && (
                                <motion.div
                                    layoutId="nav-indicator"
                                    className={styles.indicator}
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <div style={{ position: 'relative' }}>
                                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} className={styles.icon} />
                                {hasAgedTrades && (
                                    <div style={{ position: 'absolute', top: -2, right: -4, width: 8, height: 8, background: '#ff4757', borderRadius: '50%', border: '2px solid #090909' }} />
                                )}
                            </div>
                            <span className={styles.label}>{label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
