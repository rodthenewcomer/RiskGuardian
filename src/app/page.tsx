'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import DashboardPage from '@/components/pages/DashboardPage';
import CommandPage from '@/components/pages/CommandPage';
import BridgePage from '@/components/pages/BridgePage';
import AIChatPage from '@/components/pages/AIChatPage';
import AnalyticsPage from '@/components/pages/AnalyticsPage';
import SettingsPage from '@/components/pages/SettingsPage';
import JournalPage from '@/components/pages/JournalPage';
import CalculatorPage from '@/components/pages/CalculatorPage';
import Onboarding from '@/components/pages/Onboarding';
import { AnimatePresence, motion } from 'framer-motion';

const pageVariants = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const activeTab = useAppStore(s => s.activeTab);
  const hasOnboarded = useAppStore(s => s.hasOnboarded);

  const pages: Record<string, React.ReactNode> = {
    dashboard: <DashboardPage />,
    terminal: <CommandPage />,
    bridge: <BridgePage />,
    plan: <AIChatPage />,
    analytics: <AnalyticsPage />,
    settings: <SettingsPage />,
    journal: <JournalPage />,
    calculator: <CalculatorPage />,
  };

  // Avoid hydration mismatch — localStorage state only available client-side
  if (!mounted) {
    return <div className="app-shell app-shell--loading" />;
  }

  // New user — run 3-step onboarding
  if (!hasOnboarded) {
    return <Onboarding />;
  }

  return (
    <div className="app-shell">
      <Header />
      <main className="page-content" id="main-content">
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
      </main>
      <BottomNav />
    </div>
  );
}
