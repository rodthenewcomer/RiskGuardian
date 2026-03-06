'use client';

import styles from './TradePlanPage.module.css';
import { useAppStore } from '@/store/appStore';
import { motion } from 'framer-motion';
import OutcomeCard from '@/components/ui/OutcomeCard';
import { TrendingUp, TrendingDown, Clock, Zap } from 'lucide-react';

export default function TradePlanPage() {
    const { trades, updateTradeOutcome, account, setActiveTab } = useAppStore();
    const openTrades = trades.filter(t => !t.outcome || t.outcome === 'open');
    const latestPlan = openTrades[0] ?? null;

    if (!latestPlan) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyContent}>
                    <div className={styles.emptyIcon}>
                        <Zap size={32} strokeWidth={2} />
                    </div>
                    <h2 className="text-subheading text-[#fff] mb-2">NO ACTIVE TARGET</h2>
                    <p className="text-caption mb-6">Calculate and lock a trade in the Risk Engine to arm the HUD.</p>
                    <button
                        className="btn btn--primary px-8 py-4"
                        onClick={() => setActiveTab('calculator')}
                        id="create-plan-btn"
                    >
                        ARM NEW TRADE
                    </button>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className={styles.page}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
        >
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <span className="text-caption text-[var(--accent)] font-[800] tracking-[0.1em]">ARMED TARGET</span>
                    <h1 className={styles.assetName}>{latestPlan.asset}</h1>
                    <p className="text-caption flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(latestPlan.createdAt).toLocaleTimeString()}
                    </p>
                </div>
                <div className={styles.rrBig}>
                    <span className={styles.rrValue}>{latestPlan.rr.toFixed(1)}R</span>
                    <span className={styles.rrLabel}>YIELD</span>
                </div>
            </div>

            {/* Entry Box */}
            <div className={styles.entryCard}>
                <span className={styles.entryLabel}>ENTRY<br />POINT</span>
                <span className={styles.entryValue}>{latestPlan.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</span>
                <span className={styles.entryLots}>{latestPlan.lotSize.toLocaleString()} {latestPlan.lotSize === 1 ? 'UNIT' : 'UNITS'}</span>
            </div>

            {/* Coordinates */}
            <div className={styles.outcomes}>
                <OutcomeCard label="TAKE PROFIT (TP)" price={latestPlan.takeProfit} pnl={latestPlan.rewardUSD} type="tp" rr={latestPlan.rr} />
                <OutcomeCard label="STOP LOSS (SL)" price={latestPlan.stopLoss} pnl={latestPlan.riskUSD} type="sl" />
            </div>

            {/* Battle Stats */}
            <div className={styles.stats}>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Risk Exposure</span>
                    <span className={`${styles.statValue} text-danger`}>-${latestPlan.riskUSD.toFixed(0)}</span>
                </div>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Max Reward</span>
                    <span className={`${styles.statValue} text-success`}>+${latestPlan.rewardUSD.toFixed(0)}</span>
                </div>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Collateral Impact</span>
                    <span className={styles.statValue}>{((latestPlan.riskUSD / account.balance) * 100).toFixed(2)}%</span>
                </div>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Balance if WIN</span>
                    <span className={`${styles.statValue} text-success`}>
                        ${(account.balance + latestPlan.rewardUSD).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                </div>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Balance if LOSS</span>
                    <span className={`${styles.statValue} text-danger`}>
                        ${(account.balance - latestPlan.riskUSD).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                </div>
            </div>

            {/* Mission Outcome Controls */}
            <div className={styles.outcomeButtons}>
                <button
                    className={`btn btn--success ${styles.outcomeBtn}`}
                    onClick={() => updateTradeOutcome(latestPlan.id, 'win')}
                    id="mark-win-btn"
                >
                    <TrendingUp size={20} />
                    TP HIT
                </button>
                <button
                    className={`btn btn--danger ${styles.outcomeBtn}`}
                    onClick={() => updateTradeOutcome(latestPlan.id, 'loss')}
                    id="mark-loss-btn"
                >
                    <TrendingDown size={20} />
                    SL HIT
                </button>
            </div>
        </motion.div>
    );
}
