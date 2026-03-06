'use client';

import styles from './BottomNav.module.css';
import { useAppStore } from '@/store/appStore';
import {
    LayoutDashboard, Terminal, Calculator, Brain,
    ShieldCheck, BookOpen, BarChart2, Settings2, MoreHorizontal, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

type TabId = 'dashboard' | 'terminal' | 'bridge' | 'calculator' | 'plan' | 'journal' | 'analytics' | 'settings';

const PRIMARY_TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'terminal', label: 'HUD', icon: Terminal },
    { id: 'calculator', label: 'Risk', icon: Calculator },
    { id: 'plan', label: 'AI', icon: Brain },
];

const MORE_TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'bridge', label: 'Guard', icon: ShieldCheck, desc: 'Live bridge monitor' },
    { id: 'journal', label: 'Log', icon: BookOpen, desc: 'Trade history & notes' },
    { id: 'analytics', label: 'Stats', icon: BarChart2, desc: 'Deep analytics & forensics' },
    { id: 'settings', label: 'Config', icon: Settings2, desc: 'Account & prop firm rules' },
];

const MORE_TAB_IDS = MORE_TABS.map(t => t.id);

export default function BottomNav() {
    const { activeTab, setActiveTab } = useAppStore();
    const [moreOpen, setMoreOpen] = useState(false);

    const isMoreActive = MORE_TAB_IDS.includes(activeTab as TabId);

    const handleTabClick = (id: TabId) => {
        setActiveTab(id);
        setMoreOpen(false);
    };

    return (
        <>
            {/* More Drawer Backdrop */}
            <AnimatePresence>
                {moreOpen && (
                    <motion.div
                        className={styles.backdrop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setMoreOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* More Drawer Panel */}
            <AnimatePresence>
                {moreOpen && (
                    <motion.div
                        className={styles.drawer}
                        initial={{ y: '100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '100%', opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    >
                        <div className={styles.drawerHeader}>
                            <span className={styles.drawerTitle}>More</span>
                            <button
                                className={styles.drawerClose}
                                onClick={() => setMoreOpen(false)}
                                aria-label="Close menu"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className={styles.drawerGrid}>
                            {MORE_TABS.map(({ id, label, icon: Icon, desc }) => {
                                const active = activeTab === id;
                                return (
                                    <button
                                        key={id}
                                        className={`${styles.drawerItem} ${active ? styles.drawerItemActive : ''}`}
                                        onClick={() => handleTabClick(id)}
                                        aria-label={label}
                                    >
                                        <div className={`${styles.drawerIcon} ${active ? styles.drawerIconActive : ''}`}>
                                            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                                        </div>
                                        <span className={styles.drawerLabel}>{label}</span>
                                        <span className={styles.drawerDesc}>{desc}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom Nav Bar */}
            <nav className={styles.nav} role="navigation" aria-label="Main navigation">
                <div className={styles.inner}>
                    {PRIMARY_TABS.map(({ id, label, icon: Icon }) => {
                        const active = activeTab === id;
                        return (
                            <button
                                key={id}
                                className={`${styles.tab} ${active ? styles.active : ''}`}
                                onClick={() => handleTabClick(id)}
                                aria-label={label}
                                aria-current={active ? 'page' : undefined}
                            >
                                {active && (
                                    <motion.div
                                        layoutId="nav-indicator"
                                        className={styles.indicator}
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} className={styles.icon} />
                                <span className={styles.label}>{label}</span>
                            </button>
                        );
                    })}

                    {/* More button */}
                    <button
                        className={`${styles.tab} ${isMoreActive || moreOpen ? styles.active : ''}`}
                        onClick={() => setMoreOpen(prev => !prev)}
                        aria-label="More navigation options"
                        aria-expanded={moreOpen}
                    >
                        {(isMoreActive || moreOpen) && !moreOpen && (
                            <motion.div
                                layoutId="nav-indicator"
                                className={styles.indicator}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                        <MoreHorizontal size={20} strokeWidth={isMoreActive || moreOpen ? 2.5 : 1.8} className={styles.icon} />
                        <span className={styles.label}>More</span>
                    </button>
                </div>
            </nav>
        </>
    );
}
