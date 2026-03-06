'use client';

import styles from './BottomNav.module.css';
import { useAppStore } from '@/store/appStore';
import { LayoutDashboard, Terminal, ShieldCheck, Brain, BarChart2, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';

const TABS = [
    { id: 'dashboard' as const, label: 'Home', icon: LayoutDashboard },
    { id: 'terminal' as const, label: 'HUD', icon: Terminal },
    { id: 'bridge' as const, label: 'Guard', icon: ShieldCheck },
    { id: 'plan' as const, label: 'AI', icon: Brain },
    { id: 'analytics' as const, label: 'Stats', icon: BarChart2 },
    { id: 'settings' as const, label: 'Config', icon: Settings2 },
];

export default function BottomNav() {
    const { activeTab, setActiveTab } = useAppStore();

    return (
        <nav className={styles.nav} role="navigation" aria-label="Main navigation">
            <div className={styles.inner}>
                {TABS.map(({ id, label, icon: Icon }) => {
                    const active = activeTab === id;
                    return (
                        <button
                            key={id}
                            className={`${styles.tab} ${active ? styles.active : ''}`}
                            onClick={() => setActiveTab(id)}
                            aria-label={label}
                            aria-current={active ? 'page' : undefined}
                            title={label}
                        >
                            {active && (
                                <motion.div
                                    layoutId="nav-indicator"
                                    className={styles.indicator}
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} className={styles.icon} />
                            <span className={styles.label}>{label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
