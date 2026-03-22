'use client';

import { useState } from 'react';
import styles from './BottomNav.module.css';
import { useAppStore } from '@/store/appStore';
import { LayoutDashboard, Terminal, BookOpen, Brain, BarChart2, FlaskConical, Settings2, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/i18n/useTranslation';

// Main 4 tabs always visible
const MAIN_TABS = [
    { id: 'dashboard' as const, icon: LayoutDashboard },
    { id: 'terminal'  as const, icon: Terminal },
    { id: 'journal'   as const, icon: BookOpen },
    { id: 'plan'      as const, icon: Brain },
];

// Overflow tabs accessible via + tray
const TRAY_TABS = [
    { id: 'analytics' as const, icon: BarChart2 },
    { id: 'simulator' as const, icon: FlaskConical },
    { id: 'settings'  as const, icon: Settings2 },
];

export default function BottomNav() {
    const { activeTab, setActiveTab } = useAppStore();
    const { t } = useTranslation();
    const [trayOpen, setTrayOpen] = useState(false);

    const tabLabels: Record<string, string> = {
        dashboard: t.nav.dashboard,
        terminal:  t.nav.riskEngine,
        journal:   t.nav.journal,
        plan:      t.nav.aiCoach,
        analytics: t.nav.analytics,
        simulator: t.nav.simulator,
        settings:  t.nav.settings,
    };

    const trayActive = TRAY_TABS.some(tt => tt.id === activeTab);

    function handleMainTab(id: typeof MAIN_TABS[number]['id']) {
        setActiveTab(id);
        setTrayOpen(false);
    }

    function handleTrayTab(id: typeof TRAY_TABS[number]['id']) {
        setActiveTab(id);
        setTrayOpen(false);
    }

    return (
        <>
            {/* Backdrop — closes tray when tapping outside */}
            <AnimatePresence>
                {trayOpen && (
                    <motion.div
                        key="tray-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={() => setTrayOpen(false)}
                        style={{
                            position: 'fixed', inset: 0,
                            background: 'rgba(0,0,0,0.55)',
                            zIndex: 98, /* below tray, above page */
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Overflow tray — slides up from nav */}
            <AnimatePresence>
                {trayOpen && (
                    <motion.div
                        key="tray"
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                        style={{
                            position: 'fixed',
                            bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))',
                            left: 0, right: 0,
                            background: '#0d1117',
                            borderTop: '1px solid #1a1c24',
                            zIndex: 99,
                            padding: '12px 0 8px',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 8px' }}>
                            {TRAY_TABS.map(({ id, icon: Icon }) => {
                                const active = activeTab === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => handleTrayTab(id)}
                                        style={{
                                            flex: 1, display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', gap: 6,
                                            padding: '10px 4px',
                                            background: active ? 'rgba(253,200,0,0.08)' : 'transparent',
                                            border: 'none',
                                            borderTop: `2px solid ${active ? '#FDC800' : 'transparent'}`,
                                            cursor: 'pointer',
                                            color: active ? '#FDC800' : '#8b949e',
                                            transition: 'color 0.15s',
                                            WebkitTapHighlightColor: 'transparent',
                                        }}
                                        aria-label={tabLabels[id]}
                                    >
                                        <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                                        <span style={{
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 10, fontWeight: active ? 700 : 500,
                                            letterSpacing: '0.02em', lineHeight: 1,
                                        }}>
                                            {tabLabels[id]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main nav bar */}
            <nav className={styles.nav} role="navigation" aria-label="Main navigation">
                <div className={styles.inner}>
                    {MAIN_TABS.map(({ id, icon: Icon }) => {
                        const active = activeTab === id;
                        const label = tabLabels[id];
                        let hasAgedTrades = false;
                        if (id === 'journal') {
                            // eslint-disable-next-line react-hooks/rules-of-hooks
                            const store = useAppStore();
                            hasAgedTrades = store.trades.some(t => t.outcome === 'open' && Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 3600000) >= 4);
                        }

                        return (
                            <button
                                key={id}
                                className={`${styles.tab} ${active ? styles.active : ''}`}
                                onClick={() => handleMainTab(id)}
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

                    {/* Plus / overflow button — 5th slot */}
                    <button
                        className={`${styles.tab} ${trayActive || trayOpen ? styles.active : ''}`}
                        onClick={() => setTrayOpen(o => !o)}
                        aria-label="More"
                        aria-expanded={trayOpen}
                        style={{ position: 'relative' }}
                    >
                        {(trayActive || trayOpen) && (
                            <motion.div
                                layoutId="nav-indicator"
                                className={styles.indicator}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                        <motion.div
                            animate={{ rotate: trayOpen ? 45 : 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {trayOpen
                                ? <X size={20} strokeWidth={2.2} className={styles.icon} />
                                : <Plus size={20} strokeWidth={2} className={styles.icon} />
                            }
                        </motion.div>
                        <span className={styles.label}>{trayOpen ? t.nav.closeTray : t.nav.more}</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
