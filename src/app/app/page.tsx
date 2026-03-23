'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import DashboardPage from '@/components/pages/DashboardPage';
import CommandPage from '@/components/pages/CommandPage';
import AIChatPage from '@/components/pages/AIChatPage';
import AnalyticsPage from '@/components/pages/AnalyticsPage';
import SettingsPage from '@/components/pages/SettingsPage';
import JournalPage from '@/components/pages/JournalPage';
import SimulatorPage from '@/components/pages/SimulatorPage';
import Onboarding from '@/components/pages/Onboarding';
import AuthPage from '@/components/auth/AuthPage';
import AuthModal from '@/components/auth/AuthModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnimatePresence, motion } from 'framer-motion';
import { ToastContainer } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { fullSync, pushAccountSettings, pushDailySessions, pullFullAccountSettings, pushTrades, pullDayData, pushDayData } from '@/lib/supabaseSync';

// Force dynamic rendering — prevents prerender failures when Supabase env vars absent on deploy
export const dynamic = 'force-dynamic';

const pageVariants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

const VALID_TABS = new Set(['dashboard', 'terminal', 'plan', 'analytics', 'settings', 'journal', 'calculator', 'simulator']);

export default function Home() {
  const [mounted, setMounted] = useState(false);
  // authChecked = true once we've confirmed the Supabase session status
  const [authChecked, setAuthChecked] = useState(false);
  const {
    setActiveTab,
    activeTab,
    hasOnboarded,
    trades,
    account,
    dailySessions,
    dayNotes,
    dayJournalEntries,
    setTrades,
    updateAccount,
    updateDayNote,
    saveDayJournalEntry,
    language,
    tradingDayRollHour,
    setLanguage,
    setTradingDayRollHour,
    userId,
    setUserId,
    setUserEmail,
    showAuthModal,
    setShowAuthModal,
  } = useAppStore();

  // ── Pull all cloud data into the store after login / session restore ──
  // Called on both explicit sign-in and automatic session restore on a new device.
  // Uses Promise.allSettled so a partial failure (e.g. day_data table missing) never
  // blocks the rest of the sync.
  async function syncFromCloud(uid: string, isFirstLogin = false) {
    // Bidirectional trade sync
    const tradeResult = await fullSync(trades, uid).catch(() => null);
    if (tradeResult) setTrades(tradeResult);

    // Account settings — remote wins on login; push local if no remote row yet
    const remote = await pullFullAccountSettings(uid).catch(() => null);
    if (remote) {
      updateAccount(remote.account);
      if (remote.tradingDayRollHour !== tradingDayRollHour) setTradingDayRollHour(remote.tradingDayRollHour);
      if (remote.language !== language) setLanguage(remote.language);
    } else if (isFirstLogin) {
      await pushAccountSettings(account, uid, tradingDayRollHour, language).catch(console.error);
    }

    // Day notes + journal entries (best-effort — table may not exist yet)
    const dayData = await pullDayData(uid).catch(() => null);
    if (dayData) {
      Object.entries(dayData.dayNotes ?? {}).forEach(([date, note]) => updateDayNote(date, note as string));
      Object.entries(dayData.dayJournalEntries ?? {}).forEach(([date, entry]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        saveDayJournalEntry(date, entry as any);
      });
    }
  }

  // ── Session bootstrap + auth state listener ──────────────────
  useEffect(() => {
    // Handle PWA shortcut ?tab=terminal style navigation
    const param = new URLSearchParams(window.location.search).get('tab');
    if (param && VALID_TABS.has(param)) {
      setActiveTab(param as Parameters<typeof setActiveTab>[0]);
    }

    // Check existing session — resolves before showing any UI to prevent flicker.
    // IMPORTANT: when a session already exists (e.g. opening on a new device where
    // Supabase persists the token), we must pull cloud data here — handleAuthSuccess
    // is NOT called in this path, so without this sync the store stays empty.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? '');
        syncFromCloud(session.user.id).finally(() => {
          setAuthChecked(true);
          setMounted(true);
        });
      } else {
        setAuthChecked(true);
        setMounted(true);
      }
    });

    // Listen for auth state changes (OAuth callback, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? '');
      } else {
        setUserId(null);
        setUserEmail(null);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-sync trades to Supabase on mutations (debounced 2s) ──
  useEffect(() => {
    if (!userId || trades.length === 0) return;
    const timer = setTimeout(() => {
      pushTrades(trades, userId).catch(console.error);
    }, 2000);
    return () => clearTimeout(timer);
  }, [trades, userId]);

  // ── Auto-sync account settings on any change (debounced 3s) ──
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => {
      pushAccountSettings(account, userId, tradingDayRollHour, language).catch(console.error);
    }, 3000);
    return () => clearTimeout(timer);
  }, [account, userId, tradingDayRollHour, language]);

  // ── Auto-sync daily sessions on change (debounced 5s) ──
  useEffect(() => {
    if (!userId || dailySessions.length === 0) return;
    const timer = setTimeout(() => {
      pushDailySessions(dailySessions, userId).catch(console.error);
    }, 5000);
    return () => clearTimeout(timer);
  }, [dailySessions, userId]);

  // ── Auto-sync day notes + journal entries (debounced 4s) ──
  useEffect(() => {
    if (!userId) return;
    const hasNotes = Object.keys(dayNotes).length > 0;
    const hasEntries = Object.keys(dayJournalEntries).length > 0;
    if (!hasNotes && !hasEntries) return;
    const timer = setTimeout(() => {
      pushDayData(dayNotes, dayJournalEntries, userId).catch(console.error);
    }, 4000);
    return () => clearTimeout(timer);
  }, [dayNotes, dayJournalEntries, userId]);

  // ── Auth success handler ──────────────────────────────────────
  async function handleAuthSuccess(uid: string, email: string) {
    setUserId(uid);
    setUserEmail(email);
    setShowAuthModal(false);
    await syncFromCloud(uid, true);
  }

  const pages: Record<string, React.ReactNode> = {
    dashboard:  <ErrorBoundary><DashboardPage /></ErrorBoundary>,
    terminal:   <ErrorBoundary><CommandPage /></ErrorBoundary>,
    plan:       <ErrorBoundary><AIChatPage /></ErrorBoundary>,
    analytics:  <ErrorBoundary><AnalyticsPage /></ErrorBoundary>,
    settings:   <ErrorBoundary><SettingsPage /></ErrorBoundary>,
    journal:    <ErrorBoundary><JournalPage /></ErrorBoundary>,
    calculator: <ErrorBoundary><CommandPage /></ErrorBoundary>,
    simulator:  <ErrorBoundary><SimulatorPage /></ErrorBoundary>,
  };

  // Blank shell until Supabase session check completes — prevents flicker
  if (!mounted || !authChecked) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#090909',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 32, height: 32, background: '#FDC800',
          animation: 'pulse 1.4s ease-in-out infinite',
        }} />
        <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
      </div>
    );
  }

  // ── AUTH GATE — must be logged in to access the app ──────────
  if (!userId) {
    return <AuthPage onSuccess={handleAuthSuccess} />;
  }

  // ── ONBOARDING — first-time setup after auth ─────────────────
  if (!hasOnboarded) {
    return <Onboarding />;
  }

  return (
    <div className="app-shell">
      <Header onShowAuth={() => setShowAuthModal(true)} />
      <Sidebar />
      <main className="page-content" id="main-content">
        <ErrorBoundary>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {pages[activeTab] ?? <DashboardPage />}
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>
      <BottomNav />
      <ToastContainer />

      {/* Auth modal — triggered from Header or anywhere via showAuthModal store flag */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onSuccess={handleAuthSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
