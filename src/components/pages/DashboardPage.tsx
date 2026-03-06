'use client';

import styles from './DashboardPage.module.css';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import DailyGuard from '@/components/ui/DailyGuard';
import { motion, Variants } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Calculator, Activity,
    AlertTriangle, CheckCircle, Shield, Zap, Info
} from 'lucide-react';
import PnLChart from '@/components/analytics/PnLChart';
import ConsistencyGauge from '@/components/analytics/ConsistencyGauge';

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1] as const, duration: 0.45 } } };

export default function DashboardPage() {
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line
    useEffect(() => { setMounted(true); }, []);

    const { account, trades, getTodayRiskUsed, setActiveTab } = useAppStore();

    const used = mounted ? getTodayRiskUsed() : 0;
    const remaining = mounted ? Math.max(0, account.dailyLossLimit - used) : account.dailyLossLimit;
    const usedPct = account.dailyLossLimit > 0 ? Math.min(100, (used / account.dailyLossLimit) * 100) : 0;
    const isDanger = mounted && usedPct >= 90;
    const isWarning = mounted && usedPct >= 60;

    // Safe position size for next trade
    const maxPerTrade = (account.balance * account.maxRiskPercent) / 100;
    const safeNextRisk = mounted ? Math.min(maxPerTrade, remaining) : maxPerTrade;

    // Trade history analysis
    const recentTrades = trades.slice(0, 5);
    const closedTrades = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');
    const wins = trades.filter(t => t.outcome === 'win').length;
    const losses = trades.filter(t => t.outcome === 'loss').length;
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

    // Revenge trade detection: last 2 trades — did size increase after a loss?
    const revengeAlert = mounted && trades.length >= 2 &&
        trades[1].outcome === 'loss' &&
        trades[0].riskUSD > trades[1].riskUSD * 1.3;

    // Consistency: std deviation of risk %
    let riskConsistency = 100;
    if (closedTrades.length >= 3) {
        const risks = closedTrades.map(t => (t.riskUSD / account.balance) * 100);
        const avg = risks.reduce((a, b) => a + b, 0) / risks.length;
        const variance = risks.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / risks.length;
        const stdDev = Math.sqrt(variance);
        riskConsistency = Math.max(0, Math.round(100 - stdDev * 20));
    }

    // P&L from closed trades
    const totalPnl = closedTrades.reduce((sum, t) => {
        return sum + (t.pnl || ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))));
    }, 0);

    // Prepare P&L Chart Data
    const pnlChartData = closedTrades.reduce((acc, t, i) => {
        const pnl = t.pnl || ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)));
        const cumulative = (acc.length > 0 ? acc[acc.length - 1].cumulative : 0) + pnl;
        acc.push({
            id: t.id,
            pnl,
            cumulative,
            asset: t.asset
        });
        return acc;
    }, [] as any[]);

    // Tradeify Consistency Calculation
    let consistencyScore = 0;
    let bestDayPnl = 0;
    if (totalPnl > 0) {
        const dailyPnls: Record<string, number> = {};
        closedTrades.forEach(t => {
            const day = t.createdAt.split('T')[0];
            const p = t.pnl || ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)));
            dailyPnls[day] = (dailyPnls[day] || 0) + p;
        });
        const dailyValues = Object.values(dailyPnls);
        bestDayPnl = Math.max(0, ...dailyValues);
        consistencyScore = (bestDayPnl / totalPnl) * 100;
    }

    return (
        <motion.div className={styles.page} variants={container} initial="hidden" animate="show">

            {/* ── Balance Hero ── */}
            <motion.div variants={item} className={`glass-card glass-card--elevated ${styles.hero}`}>
                <div className={styles.heroMain}>
                    <div className={styles.heroLeft}>
                        <p className={styles.heroLabel}>Account Balance</p>
                        <motion.h1
                            className={styles.heroBalance}
                            key={account.balance}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </motion.h1>
                        {closedTrades.length > 0 && (
                            <p className={`${styles.heroSub} ${totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                {totalPnl >= 0 ? '↑' : '↓'} ${Math.abs(totalPnl).toFixed(0)} realized PnL · {closedTrades.length} trades
                            </p>
                        )}
                    </div>
                    <div className={styles.heroRight}>
                        <span className={styles.heroAssetBadge}>{account.assetType}</span>
                        <span className={styles.heroRisk}>{account.maxRiskPercent}% risk/trade</span>
                    </div>
                </div>

                {pnlChartData.length > 0 && (
                    <div className={styles.pnlContainer}>
                        <PnLChart data={pnlChartData} />
                    </div>
                )}
            </motion.div>

            {/* ── Revenge Trade Alert ── */}
            {revengeAlert && (
                <motion.div variants={item} className={`glass-card glass-card--danger ${styles.alertBanner}`}>
                    <AlertTriangle size={16} />
                    <div>
                        <p className={styles.alertTitle}>⚠ Revenge Trade Pattern Detected</p>
                        <p className={styles.alertDesc}>Your last trade after a loss was 30%+ larger. Consider reducing size.</p>
                    </div>
                </motion.div>
            )}

            {/* ── Daily Guard ── */}
            <motion.div variants={item} className={`glass-card ${styles.guardCard} ${isDanger ? 'glass-card--danger' : ''}`}>
                <div className={styles.guardLeft}>
                    <div className={styles.guardTopRow}>
                        <span className={styles.guardTitle} data-tooltip="This tracks your risk for the day across all closed and open trades. If you hit this limit, stop trading." data-tooltip-pos="right">
                            Daily Loss Guard <Info size={12} className="inline ml-1 text-muted opacity-50 hover:opacity-100" />
                        </span>
                        <span className={`badge ${isDanger ? 'badge--danger' : isWarning ? 'badge--warning' : 'badge--success'}`}>
                            {isDanger ? 'DANGER' : isWarning ? 'WARNING' : 'SAFE'}
                        </span>
                    </div>
                    <span className={styles.guardLimit}>Limit: ${account.dailyLossLimit.toLocaleString()}</span>

                    <div className={styles.guardStats}>
                        <div className={styles.guardStat}>
                            <span className={`${styles.guardStatValue} text-danger`}>${used.toFixed(0)}</span>
                            <span className={styles.guardStatLabel}>Used</span>
                        </div>
                        <div className={styles.guardStatDivider} />
                        <div className={styles.guardStat}>
                            <span className={`${styles.guardStatValue} ${remaining === 0 ? 'text-danger' : 'text-success'}`}>${remaining.toFixed(0)}</span>
                            <span className={styles.guardStatLabel}>Remaining</span>
                        </div>
                        <div className={styles.guardStatDivider} />
                        <div className={styles.guardStat}>
                            <span className={`${styles.guardStatValue} text-accent`}>${safeNextRisk.toFixed(0)}</span>
                            <span className={styles.guardStatLabel}>Safe next trade</span>
                        </div>
                    </div>

                    {isDanger && (
                        <motion.div className={styles.guardAlert} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                            <AlertTriangle size={12} />
                            <span>STOP TRADING — Daily limit almost reached</span>
                        </motion.div>
                    )}
                </div>
                <DailyGuard size={120} showLabel={false} />
            </motion.div>

            {/* ── Tradeify Consistency Gauge ── */}
            {account.propFirm?.includes('Tradeify') && totalPnl > 0 && (
                <motion.div variants={item} className={styles.consistencyContainer}>
                    <ConsistencyGauge score={consistencyScore} bestDayPnl={bestDayPnl} totalPnl={totalPnl} />
                </motion.div>
            )}

            {/* ── Stats Row ── */}
            <motion.div variants={item} className={styles.statsRow}>
                <div className={`glass-card ${styles.statCard}`} data-tooltip="Percentage of your closed trades that are profitable.">
                    <CheckCircle size={16} className={styles.statIcon} />
                    <span className={styles.statValue}>{winRate}%</span>
                    <span className={styles.statLabel}>Win Rate</span>
                </div>
                <div className={`glass-card ${styles.statCard}`} data-tooltip="Measures risk discipline. High score = consistent position sizing. Low score = erratic size changes.">
                    <Activity size={16} className={styles.statIcon} />
                    <span className={styles.statValue}>{riskConsistency}</span>
                    <span className={styles.statLabel}>Consistency</span>
                </div>
                <div className={`glass-card ${styles.statCard}`}>
                    <TrendingUp size={16} className={styles.statIcon} />
                    <span className={styles.statValue}>{trades.length}</span>
                    <span className={styles.statLabel}>Total Plans</span>
                </div>
            </motion.div>

            {/* ── Prop Firm Status ── */}
            {account.dailyLossLimit > 0 && (
                <motion.div variants={item} className={`glass-card ${styles.propStatus}`}>
                    <div className={styles.propStatusHeader}>
                        <Shield size={14} />
                        <span className={styles.propStatusTitle} data-tooltip="These rules are driven by your selected prop firm configuration in Settings. Ensure you check these before entering high-risk environments.">
                            Rule Compliance <Info size={12} className="inline ml-1 text-muted opacity-50 hover:opacity-100" />
                        </span>
                        <span className={`badge ${isDanger ? 'badge--danger' : isWarning ? 'badge--warning' : 'badge--success'}`}>
                            {isDanger ? 'AT RISK' : 'COMPLIANT'}
                        </span>
                    </div>
                    <div className={styles.propRules}>
                        <div className={styles.propRule}>
                            <span>{isDanger ? '🔴' : '🟢'}</span>
                            <span>Daily Loss: {usedPct.toFixed(1)}% of {account.dailyLossLimit.toLocaleString()} limit used</span>
                        </div>
                        <div className={styles.propRule}>
                            <span>{safeNextRisk < maxPerTrade * 0.5 ? '🟡' : '🟢'}</span>
                            <span>Max trade risk: ${maxPerTrade.toFixed(0)} ({account.maxRiskPercent}%)</span>
                        </div>
                        <div className={styles.propRule}>
                            <span>🟢</span>
                            <span>Max trades at max risk today: {account.dailyLossLimit > 0 && maxPerTrade > 0 ? Math.floor(account.dailyLossLimit / maxPerTrade) : '—'}</span>
                        </div>
                        {account.propFirm ? (
                            <>
                                <div className={styles.propRuleDivider} />
                                {account.minHoldTimeSec && account.minHoldTimeSec > 0 ? (
                                    <div className={styles.propRule}>
                                        <span>⏱️</span>
                                        <span>Time Guard: Hold executions &gt; {account.minHoldTimeSec}s</span>
                                    </div>
                                ) : null}
                                <div className={styles.propRule}>
                                    <span>⚖️</span>
                                    <span>Leverage Locked: {account.leverage || 2}:1</span>
                                </div>
                                <div className={styles.propRule}>
                                    <span>📉</span>
                                    <span>Max Drawdown: {account.drawdownType || 'EOD'} (Limit: ${account.maxDrawdownLimit?.toLocaleString()})</span>
                                </div>
                                {account.isConsistencyActive && (
                                    <div className={styles.propRule}>
                                        <span>📊</span>
                                        <span>Consistency: Best day must be ≤ 20% of total profit for payout lock</span>
                                    </div>
                                )}
                                {account.propFirm.includes('Tradeify') && (
                                    <>
                                        <div className={styles.propRule}>
                                            <span>🛡️</span>
                                            <span>Anti-Hedging: No offsetting risk allowed</span>
                                        </div>
                                        <div className={styles.propRule}>
                                            <span>📅</span>
                                            <span>Inactivity: Must trade at least every 30 days</span>
                                        </div>
                                    </>
                                )}
                            </>
                        ) : null}
                    </div>
                </motion.div>
            )}

            {/* ── Quick Actions ── */}
            <motion.div variants={item} className={styles.actions}>
                <button className={`btn btn--primary ${styles.actionBtn}`} onClick={() => setActiveTab('calculator')} id="quick-calc-btn">
                    <Calculator size={16} /> Calculate Position
                </button>
                <button className={`btn btn--ghost ${styles.actionBtn}`} onClick={() => setActiveTab('analytics')} id="quick-analytics-btn">
                    <Zap size={16} /> My Analytics
                </button>
            </motion.div>

            {/* ── Recent Trades ── */}
            {recentTrades.length > 0 && (
                <motion.div variants={item}>
                    <div className="section-header">
                        <span className="section-title">Recent Plans</span>
                        <button className="btn btn--ghost btn--sm" onClick={() => setActiveTab('journal')}>View All</button>
                    </div>
                    <div className={`glass-card ${styles.tradeList}`}>
                        {recentTrades.map((trade, i) => (
                            <div key={trade.id} className={`${styles.tradeRow} ${i < recentTrades.length - 1 ? styles.tradeRowBorder : ''}`}>
                                <div className={styles.tradeLeft}>
                                    <div className={`${styles.tradeIcon} ${trade.outcome === 'win' ? styles.tradeWin : trade.outcome === 'loss' ? styles.tradeLoss : styles.tradeOpen}`}>
                                        {trade.outcome === 'win' ? <TrendingUp size={12} /> : trade.outcome === 'loss' ? <TrendingDown size={12} /> : <Activity size={12} />}
                                    </div>
                                    <div>
                                        <span className={styles.tradeAsset}>{trade.asset}</span>
                                        <span className={styles.tradeDate}>{new Date(trade.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className={styles.tradeRight}>
                                    <span className={`${styles.tradePnl} ${trade.outcome === 'win' ? 'text-success' : trade.outcome === 'loss' ? 'text-danger' : 'text-secondary'}`}>
                                        {trade.outcome === 'win' ? '+' : trade.outcome === 'loss' ? '−' : ''}
                                        ${Math.abs(trade.pnl ?? (trade.outcome === 'win' ? trade.rewardUSD : trade.riskUSD)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className={styles.tradeLots}>1:{trade.rr.toFixed(1)}R</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {recentTrades.length === 0 && (
                <motion.div variants={item} className={`glass-card ${styles.emptyState}`} style={{ textAlign: 'left', alignItems: 'flex-start', padding: 24 }}>
                    <h3 className="mb-2" style={{ fontSize: 18, fontWeight: 700 }}>Welcome to RiskGuardia</h3>
                    <p className="text-secondary mb-4" style={{ fontSize: 13 }}>
                        Your risk parameters are set. Here is how to use your terminal to trade safely:
                    </p>
                    <div className="flex flex-col gap-sm w-full mb-6">
                        <div className="flex items-center gap-sm" style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                            <div className="flex items-center justify-center bg-[var(--accent)] text-black rounded-full" style={{ width: 24, height: 24, fontSize: 12, fontWeight: 'bold' }}>1</div>
                            <span style={{ fontSize: 13 }}>Go to the <strong className="text-primary">Risk Engine</strong> before you enter a trade.</span>
                        </div>
                        <div className="flex items-center gap-sm" style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                            <div className="flex items-center justify-center bg-[var(--accent)] text-black rounded-full" style={{ width: 24, height: 24, fontSize: 12, fontWeight: 'bold' }}>2</div>
                            <span style={{ fontSize: 13 }}>Input your Entry and Stop Loss. The app calculates your exact lot size.</span>
                        </div>
                        <div className="flex items-center gap-sm" style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                            <div className="flex items-center justify-center bg-[var(--accent)] text-black rounded-full" style={{ width: 24, height: 24, fontSize: 12, fontWeight: 'bold' }}>3</div>
                            <span style={{ fontSize: 13 }}>Hit <strong>Log Plan</strong>. The trade appears here, tracking your daily risk limit.</span>
                        </div>
                    </div>
                    <button className="btn btn--primary btn--full" onClick={() => setActiveTab('calculator')}>
                        Open Risk Engine →
                    </button>
                </motion.div>
            )}
        </motion.div>
    );
}
