'use client';

import { useAppStore } from '@/store/appStore';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import DashboardPage from '@/components/pages/DashboardPage';
import CommandPage from '@/components/pages/CommandPage';
import BridgePage from '@/components/pages/BridgePage';
import CalculatorPage from '@/components/pages/CalculatorPage';
import AIChatPage from '@/components/pages/AIChatPage';
import JournalPage from '@/components/pages/JournalPage';
import AnalyticsPage from '@/components/pages/AnalyticsPage';
import SettingsPage from '@/components/pages/SettingsPage';
import { AnimatePresence, motion } from 'framer-motion';

const pageVariants = {
    enter: { opacity: 0, y: 12 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
};

export default function AppPage() {
    const activeTab = useAppStore(s => s.activeTab);

    const pages: Record<string, React.ReactNode> = {
        dashboard: <DashboardPage />,
        terminal: <CommandPage />,
        bridge: <BridgePage />,
        calculator: <CalculatorPage />,
        plan: <AIChatPage />,
        journal: <JournalPage />,
        analytics: <AnalyticsPage />,
        settings: <SettingsPage />,
    };

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
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {pages[activeTab] ?? <DashboardPage />}
                    </motion.div>
                </AnimatePresence>
            </main>
            <BottomNav />
        </div>
    );
}
