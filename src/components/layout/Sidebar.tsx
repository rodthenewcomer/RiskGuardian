'use client';

import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';
import { useAppStore } from '@/store/appStore';
import {
    LayoutDashboard, Terminal, Calculator,
    BookOpen, BarChart2, Settings, Brain, ShieldCheck
} from 'lucide-react';

const TABS = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'terminal', label: 'Command HUD', Icon: Terminal },
    { id: 'bridge', label: 'Live Bridge', Icon: ShieldCheck },
    { id: 'calculator', label: 'Risk Engine', Icon: Calculator },
    { id: 'plan', label: 'AI Copilot', Icon: Brain },
    { id: 'journal', label: 'Flight Log', Icon: BookOpen },
    { id: 'analytics', label: 'Analytics', Icon: BarChart2 },
    { id: 'settings', label: 'Config', Icon: Settings },
] as const;

export default function Sidebar() {
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line
    useEffect(() => { setMounted(true); }, []);

    const { activeTab, setActiveTab } = useAppStore();
    if (!mounted) return null;

    return (
        <nav className={styles.sidebar} aria-label="Main navigation">
            <div className={styles.logo}>
                <span className={styles.logoCompact}>
                    <span className={styles.logoAccent}>R</span>G
                </span>
                <span className={styles.logoFull}>
                    <span className={styles.logoAccent}>Risk</span>Guardian
                </span>
            </div>
            <ul className={styles.list}>
                {TABS.map(({ id, label, Icon }) => (
                    <li key={id}>
                        <button
                            className={`${styles.item} ${activeTab === id ? styles.active : ''}`}
                            onClick={() => setActiveTab(id)}
                            title={label}
                            aria-label={label}
                        >
                            <Icon size={18} strokeWidth={1.8} />
                            <span className={styles.label}>{label}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
