'use client';

import { useEffect, useState } from 'react';
import styles from './Header.module.css';
import { useAppStore } from '@/store/appStore';
import { LogIn, LogOut, User } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

interface HeaderProps {
    onShowAuth?: () => void;
}

export default function Header({ onShowAuth }: HeaderProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const { account, getTodayRiskUsed, language, setLanguage, userId, userEmail, setUserId, setUserEmail } = useAppStore();
    const used = mounted ? getTodayRiskUsed() : 0;
    const guardPct = mounted ? Math.min(100, (used / account.dailyLossLimit) * 100) : 0;
    const isWarning = mounted && guardPct >= 60;
    const isDanger = mounted && guardPct >= 90;
    const lang = language ?? 'en';

    async function handleSignOut() {
        await supabase.auth.signOut();
        setUserId(null);
        setUserEmail(null);
    }

    // Truncate email for display
    const displayEmail = userEmail ? (userEmail.length > 14 ? userEmail.slice(0, 12) + '…' : userEmail) : '';

    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                {/* Logo */}
                <div className={styles.logo}>
                    <Logo size="sm" />
                </div>

                {/* Balance pill */}
                <div className={styles.balancePill}>
                    <span className={styles.balanceLabel}>{lang === 'fr' ? 'Solde' : 'Balance'}</span>
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

                {/* FR / EN language switcher */}
                <button
                    className={styles.langToggle}
                    onClick={() => setLanguage(lang === 'en' ? 'fr' : 'en')}
                    aria-label="Switch language"
                    title={lang === 'en' ? 'Passer en français' : 'Switch to English'}
                >
                    <span className={lang === 'en' ? styles.langActive : styles.langInactive}>EN</span>
                    <span className={styles.langSep}>|</span>
                    <span className={lang === 'fr' ? styles.langActive : styles.langInactive}>FR</span>
                </button>

                {/* Auth — sign in or signed-in user */}
                {mounted && (
                    userId ? (
                        <button
                            className={`${styles.authBtn} ${styles.authBtnActive}`}
                            onClick={handleSignOut}
                            title={userEmail ?? (lang === 'fr' ? 'Se déconnecter' : 'Sign out')}
                        >
                            <User size={11} />
                            <span className={styles.authEmail}>{displayEmail}</span>
                            <LogOut size={11} />
                        </button>
                    ) : (
                        <button
                            className={styles.authBtn}
                            onClick={onShowAuth}
                            title={lang === 'fr' ? 'Se connecter pour synchroniser' : 'Sign in to sync'}
                        >
                            <LogIn size={11} />
                            {lang === 'fr' ? 'Sync' : 'Sync'}
                        </button>
                    )
                )}

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
