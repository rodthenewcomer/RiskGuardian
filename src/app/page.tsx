'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import Sidebar from '@/components/layout/Sidebar';
import DashboardPage from '@/components/pages/DashboardPage';
import CalculatorPage from '@/components/pages/CalculatorPage';
import TradePlanPage from '@/components/pages/TradePlanPage';
import JournalPage from '@/components/pages/JournalPage';
import AnalyticsPage from '@/components/pages/AnalyticsPage';
import SettingsPage from '@/components/pages/SettingsPage';
import Onboarding from '@/components/pages/Onboarding';
import CommandPage from '@/components/pages/CommandPage';
import { AnimatePresence, motion } from 'framer-motion';

const pageVariants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line
  useEffect(() => { setMounted(true); }, []);

  const activeTab = useAppStore(s => s.activeTab);
  const hasOnboarded = useAppStore(s => s.hasOnboarded);

  const pages: Record<string, React.ReactNode> = {
    dashboard: <DashboardPage />,
    terminal: <CommandPage />,
    calculator: <CalculatorPage />,
    plan: <TradePlanPage />,
    journal: <JournalPage />,
    analytics: <AnalyticsPage />,
    settings: <SettingsPage />,
  };

  // Server / pre-mount: render nothing to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="app-shell app-shell--loading" />
    );
  }

  // New user — run onboarding
  if (!hasOnboarded) {
    return <Onboarding />;
  }

  return (
    <div className="app-shell">
      <Header />
      <Sidebar />
      <main className="page-content" id="main-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          >
            {pages[activeTab] ?? <DashboardPage />}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav />
    </div>
  );
}
