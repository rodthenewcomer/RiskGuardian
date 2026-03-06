'use client';

import styles from './JournalPage.module.css';
import { useAppStore } from '@/store/appStore';
import { motion } from 'framer-motion';
import { BookOpen, TrendingUp, TrendingDown, Activity, DownloadCloud } from 'lucide-react';
import { SEED_TRADES } from '@/data/seedTrades';

export default function JournalPage() {
    const { trades, setTrades } = useAppStore();

    const handleImportTrades = () => {
        const mappedTrades = SEED_TRADES.map(t => ({
            id: t.id,
            asset: t.asset,
            assetType: t.assetType as 'crypto' | 'forex' | 'futures' | 'stocks',
            entry: t.entry,
            stopLoss: t.sl,
            takeProfit: t.tp,
            lotSize: t.size,
            riskUSD: t.risk,
            rewardUSD: t.reward,
            rr: t.rr,
            outcome: t.outcome as 'win' | 'loss' | 'open',
            createdAt: t.created,
            closedAt: t.created,
            pnl: t.pnl,
            isShort: t.isShort
        }));
        setTrades(mappedTrades);
    };

    // Use only closed trades to assess absolute win rate/pnl
    const closedTrades = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');

    // Total P&L
    const wins = closedTrades.filter(t => t.outcome === 'win');
    const losses = closedTrades.filter(t => t.outcome === 'loss');
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    // Win Rate
    const winRate = closedTrades.length > 0
        ? Math.round((wins.length / closedTrades.length) * 100)
        : 0;

    // Avg RR is best computed from confirmed data
    const avgRR = closedTrades.filter(t => t.rr > 0).length > 0
        ? closedTrades.filter(t => t.rr > 0).reduce((s, t, _, arr) => s + t.rr / arr.length, 0)
        : 0;

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div className={styles.pageIcon}>
                    <BookOpen size={24} />
                </div>
                <div>
                    <h1 className="text-subheading">HUD Flight Log</h1>
                    <p className="text-caption">Execution history & audit trail</p>
                </div>
            </div>

            {/* Summary Grid */}
            <div className={styles.summaryGrid}>
                <div className={`${styles.summaryCard} ${totalPnl >= 0 ? styles.summaryProfit : styles.summaryLoss}`}>
                    <span className={styles.summaryLabel}>TOTAL NET</span>
                    <span className={`${styles.summaryValue} ${totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(0)}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>STRIKE RATE</span>
                    <span className={`${styles.summaryValue} ${winRate >= 50 ? 'text-success' : 'text-danger'}`}>
                        {winRate}%
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>AVG YIELD</span>
                    <span className={`${styles.summaryValue} ${avgRR >= 2 ? 'text-success' : 'text-warning'}`}>
                        {avgRR.toFixed(1)}R
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>EXECUTIONS</span>
                    <span className={styles.summaryValue}>{trades.length}</span>
                </div>
            </div>

            {/* Trade History */}
            {trades.length === 0 ? (
                <div className={styles.emptyCard}>
                    <BookOpen size={48} strokeWidth={1} className="text-[var(--text-muted)]" />
                    <p className="text-subheading mt-3 text-[var(--text-secondary)]">Log Empty</p>
                    <p className="text-caption mb-6">Commit trades via the Risk Engine to populate HUD Flight Log.</p>

                    <button
                        onClick={handleImportTrades}
                        className="btn btn--primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                        <DownloadCloud size={16} /> Import Tradeify History
                    </button>
                </div>
            ) : (
                <div className={styles.tradeList}>
                    {trades.map((trade, i) => (
                        <motion.div
                            key={trade.id}
                            className={styles.tradeCard}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05, duration: 0.2 }}
                        >
                            <div className={styles.tradeTop}>
                                <div className={styles.tradeLeft}>
                                    <div className={`${styles.tradeAvatar} ${trade.outcome === 'win' ? styles.win :
                                        trade.outcome === 'loss' ? styles.loss : styles.open
                                        }`}>
                                        {trade.outcome === 'win' ? <TrendingUp size={20} /> :
                                            trade.outcome === 'loss' ? <TrendingDown size={20} /> :
                                                <Activity size={20} strokeWidth={1.5} />}
                                    </div>
                                    <div>
                                        <span className={styles.tradeAsset}>{trade.asset}</span>
                                        <span className={styles.tradeDate}>{new Date(trade.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className={styles.tradeRight}>
                                    <span className={`${styles.tradePnl} ${trade.outcome === 'win' ? 'text-success' :
                                        trade.outcome === 'loss' ? 'text-danger' : 'text-secondary'
                                        }`}>
                                        {trade.outcome === 'win' ? '+' : trade.outcome === 'loss' ? '-' : '~'}
                                        ${Math.abs(trade.pnl ?? (trade.outcome === 'win' ? trade.rewardUSD : trade.riskUSD)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-caption uppercase tracking-[0.1em]">
                                        {trade.outcome === 'win' ? 'WIN' : trade.outcome === 'loss' ? 'LOSS' : 'OPEN'}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.tradeMeta}>
                                <div className={styles.metaItem}>ENTRY<strong className="text-[#fff]">{trade.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>SL<strong className="text-danger">{trade.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>TP<strong className="text-success">{trade.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>YIELD<strong className="text-cyan">{trade.rr.toFixed(1)}R</strong></div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
