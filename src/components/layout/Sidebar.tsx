'use client';

import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';
import { useAppStore } from '@/store/appStore';
import {
    LayoutDashboard, Terminal,
    BookOpen, BarChart2, Settings, Brain, ShieldCheck
} from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

const TAB_IDS = [
    { id: 'dashboard', Icon: LayoutDashboard },
    { id: 'terminal', Icon: Terminal },
    { id: 'bridge', Icon: ShieldCheck },
    { id: 'plan', Icon: Brain },
    { id: 'journal', Icon: BookOpen },
    { id: 'analytics', Icon: BarChart2 },
    { id: 'settings', Icon: Settings },
] as const;

export default function Sidebar() {
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line
    useEffect(() => { setMounted(true); }, []);

    const { activeTab, setActiveTab, language, setLanguage } = useAppStore();
    const { t } = useTranslation();
    const lang = language ?? 'en';

    const tabLabels: Record<string, string> = {
        dashboard: t.nav.dashboard,
        terminal: t.nav.riskEngine,
        bridge: t.bridge.title,
        plan: t.nav.aiCoach,
        journal: t.nav.journal,
        analytics: t.nav.analytics,
        settings: t.nav.settings,
    };

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
                {TAB_IDS.map(({ id, Icon }) => {
                    const label = tabLabels[id] ?? id;
                    return (
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
                    );
                })}
            </ul>

            {/* Language switcher at bottom of sidebar */}
            <div className={styles.langSection}>
                <button
                    className={styles.langToggle}
                    onClick={() => setLanguage(lang === 'en' ? 'fr' : 'en')}
                    title={lang === 'en' ? 'Passer en français' : 'Switch to English'}
                >
                    <span className={lang === 'en' ? styles.langActive : styles.langInactive}>EN</span>
                    <span className={styles.langSep}>|</span>
                    <span className={lang === 'fr' ? styles.langActive : styles.langInactive}>FR</span>
                </button>
            </div>
        </nav>
    );
}
