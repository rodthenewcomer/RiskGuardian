'use client';

import styles from './DashboardPage.module.css';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import DailyGuard from '@/components/ui/DailyGuard';
import { motion, Variants } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Calculator, Activity,
    AlertTriangle, CheckCircle, Shield, Zap, Info,
    Clock, Lock, BarChart2, Ban, CalendarDays, AlertCircle,
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

    const maxPerTrade = (account.balance * account.maxRiskPercent) / 100;
    const safeNextRisk = mounted ? Math.min(maxPerTrade, remaining) : maxPerTrade;

    const recentTrades = trades.slice(0, 5);
    const closedTrades = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');
    const wins = trades.filter(t => t.outcome === 'win').length;
    const losses = trades.filter(t => t.outcome === 'loss').length;
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

    const revengeAlert = mounted && trades.length >= 2 &&
        trades[1].outcome === 'loss' &&
        trades[0].riskUSD > trades[1].riskUSD * 1.3;

    let riskConsistency = 100;
    if (closedTrades.length >= 3) {
        const risks = closedTrades.map(t => (t.riskUSD / account.balance) * 100);
        const avg = risks.reduce((a, b) => a + b, 0) / risks.length;
        const variance = risks.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / risks.length;
        const stdDev = Math.sqrt(variance);
        riskConsistency = Math.max(0, Math.round(100 - stdDev * 20));
    }

    const totalPnl = closedTrades.reduce((sum, t) => {
        return sum + (t.pnl || ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))));
    }, 0);

    const avgRR = closedTrades.length > 0
        ? closedTrades.reduce((s, t) => s + t.rr, 0) / closedTrades.length
        : 0;

    const pnlChartData = closedTrades.reduce((acc, t) => {
        const pnl = t.pnl || ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)));
        const cumulative = (acc.length > 0 ? acc[acc.length - 1].cumulative : 0) + pnl;
        acc.push({ id: t.id, pnl, cumulative, asset: t.asset });
        return acc;
    }, [] as { id: string; pnl: number; cumulative: number; asset: string }[]);

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

    const ruleStatus = (ok: boolean, warn = false) => ({
        icon: ok ? CheckCircle : (warn ? AlertCircle : AlertTriangle),
        cls: ok ? styles.ruleIconGreen : (warn ? styles.ruleIconYellow : styles.ruleIconRed),
    });

    return (
        <motion.div className={styles.page} variants={container} initial="hidden" animate="show">

            {/* ── Balance Hero ── */}
            <motion.div variants={item} className={styles.hero}>
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
                                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)} PnL &middot; {closedTrades.length} closed
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
                        <p className={styles.alertTitle}>Revenge Trade Pattern Detected</p>
                        <p className={styles.alertDesc}>Your last trade after a loss was 30%+ larger. Reduce size.</p>
                    </div>
                </motion.div>
            )}

            {/* ── Daily Guard ── */}
            <motion.div variants={item} className={`${styles.guardCard} ${isDanger ? 'glass-card--danger' : ''}`}>
                <div className={styles.guardLeft}>
                    <div className={styles.guardTopRow}>
                        <span className={styles.guardTitle} data-tooltip="Tracks daily risk across all trades. Hit this limit — stop trading." data-tooltip-pos="right">
                            Daily Loss Guard <Info size={11} className="inline ml-1 text-muted opacity-50 hover:opacity-100" />
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
                            <span className={styles.guardStatLabel}>Safe next</span>
                        </div>
                    </div>

                    {isDanger && (
                        <motion.div className={styles.guardAlert} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                            <AlertTriangle size={12} />
                            <span>STOP — Daily limit almost reached</span>
                        </motion.div>
                    )}
                </div>
                <DailyGuard size={110} showLabel={false} />
            </motion.div>

            {/* ── Tradeify Consistency Gauge ── */}
            {account.propFirm?.includes('Tradeify') && totalPnl > 0 && (
                <motion.div variants={item} className={styles.consistencyContainer}>
                    <ConsistencyGauge score={consistencyScore} bestDayPnl={bestDayPnl} totalPnl={totalPnl} />
                </motion.div>
            )}

            {/* ── KPI Grid 2×2 ── */}
            <motion.div variants={item} className={styles.kpiGrid}>
                <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`} data-tooltip="Win rate of all closed trades.">
                    <CheckCircle size={14} className={styles.kpiIcon} />
                    <span className={styles.kpiValue}>{winRate}%</span>
                    <span className={styles.kpiLabel}>Win Rate</span>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`} data-tooltip="Consistent sizing = high score.">
                    <Activity size={14} className={styles.kpiIcon} />
                    <span className={styles.kpiValue}>{riskConsistency}</span>
                    <span className={styles.kpiLabel}>Consistency</span>
                </div>
                <div className={styles.kpiCard}>
                    <BarChart2 size={14} className={styles.kpiIcon} />
                    <span className={styles.kpiValue}>{trades.length}</span>
                    <span className={styles.kpiLabel}>Total Plans</span>
                </div>
                <div className={styles.kpiCard}>
                    <TrendingUp size={14} className={styles.kpiIcon} />
                    <span className={styles.kpiValue}>{avgRR > 0 ? avgRR.toFixed(1) : '—'}</span>
                    <span className={styles.kpiLabel}>Avg R:R</span>
                </div>
            </motion.div>

            {/* ── Prop Firm Compliance ── */}
            {account.dailyLossLimit > 0 && (
                <motion.div variants={item} className={styles.propStatus}>
                    <div className={styles.propStatusHeader}>
                        <Shield size={14} />
                        <span className={styles.propStatusTitle} data-tooltip="Risk rules from your prop firm config in Settings.">
                            Rule Compliance <Info size={11} className="inline ml-1 text-muted opacity-50 hover:opacity-100" />
                        </span>
                        <span className={`badge ${isDanger ? 'badge--danger' : isWarning ? 'badge--warning' : 'badge--success'}`}>
                            {isDanger ? 'AT RISK' : 'COMPLIANT'}
                        </span>
                    </div>
                    <div className={styles.propRules}>
                        {(() => { const s = ruleStatus(!isDanger, isWarning); return (
                            <div className={styles.propRule}>
                                <s.icon size={13} className={`${styles.ruleIcon} ${s.cls}`} />
                                <span>Daily Loss: {usedPct.toFixed(1)}% of ${account.dailyLossLimit.toLocaleString()} used</span>
                            </div>
                        ); })()}
                        {(() => { const s = ruleStatus(safeNextRisk >= maxPerTrade * 0.5, safeNextRisk < maxPerTrade * 0.5); return (
                            <div className={styles.propRule}>
                                <s.icon size={13} className={`${styles.ruleIcon} ${s.cls}`} />
                                <span>Max trade risk: ${maxPerTrade.toFixed(0)} ({account.maxRiskPercent}%)</span>
                            </div>
                        ); })()}
                        <div className={styles.propRule}>
                            <CheckCircle size={13} className={`${styles.ruleIcon} ${styles.ruleIconGreen}`} />
                            <span>Max trades at max risk: {account.dailyLossLimit > 0 && maxPerTrade > 0 ? Math.floor(account.dailyLossLimit / maxPerTrade) : '—'}</span>
                        </div>

                        {account.propFirm && (
                            <>
                                <div className={styles.propRuleDivider} />
                                {account.minHoldTimeSec && account.minHoldTimeSec > 0 ? (
                                    <div className={styles.propRule}>
                                        <Clock size={13} className={`${styles.ruleIcon} ${styles.ruleIconGreen}`} />
                                        <span>Time Guard: hold &gt; {account.minHoldTimeSec}s per execution</span>
                                    </div>
                                ) : null}
                                <div className={styles.propRule}>
                                    <Lock size={13} className={`${styles.ruleIcon} ${styles.ruleIconGreen}`} />
                                    <span>Leverage locked: {account.leverage || 2}:1</span>
                                </div>
                                <div className={styles.propRule}>
                                    <TrendingDown size={13} className={`${styles.ruleIcon} ${styles.ruleIconYellow}`} />
                                    <span>Max drawdown: {account.drawdownType || 'EOD'} — limit ${account.maxDrawdownLimit?.toLocaleString()}</span>
                                </div>
                                {account.isConsistencyActive && (
                                    <div className={styles.propRule}>
                                        <BarChart2 size={13} className={`${styles.ruleIcon} ${styles.ruleIconGreen}`} />
                                        <span>Consistency: best day must be ≤ 20% of total profit</span>
                                    </div>
                                )}
                                {account.propFirm.includes('Tradeify') && (
                                    <>
                                        <div className={styles.propRule}>
                                            <Ban size={13} className={`${styles.ruleIcon} ${styles.ruleIconRed}`} />
                                            <span>Anti-hedging: no offsetting positions</span>
                                        </div>
                                        <div className={styles.propRule}>
                                            <CalendarDays size={13} className={`${styles.ruleIcon} ${styles.ruleIconYellow}`} />
                                            <span>Inactivity: trade at least every 30 days</span>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ── Quick Actions ── */}
            <motion.div variants={item} className={styles.actions}>
                <button className={`btn btn--primary ${styles.actionBtn}`} onClick={() => setActiveTab('terminal')} id="quick-calc-btn">
                    <Calculator size={15} /> Calculate
                </button>
                <button className={`btn btn--ghost ${styles.actionBtn}`} onClick={() => setActiveTab('analytics')} id="quick-analytics-btn">
                    <Zap size={15} /> Analytics
                </button>
            </motion.div>

            {/* ── Recent Trades ── */}
            {recentTrades.length > 0 && (
                <motion.div variants={item}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Recent Plans</span>
                        <button className="btn btn--ghost btn--sm" onClick={() => setActiveTab('journal')}>View All</button>
                    </div>
                    <div className={styles.tradeList}>
                        {recentTrades.map((trade, i) => (
                            <div key={trade.id} className={`${styles.tradeRow} ${i < recentTrades.length - 1 ? styles.tradeRowBorder : ''}`}>
                                <div className={styles.tradeLeft}>
                                    <div className={`${styles.tradeIcon} ${trade.outcome === 'win' ? styles.tradeWin : trade.outcome === 'loss' ? styles.tradeLoss : styles.tradeOpen}`}>
                                        {trade.outcome === 'win' ? <TrendingUp size={13} /> : trade.outcome === 'loss' ? <TrendingDown size={13} /> : <Activity size={13} />}
                                    </div>
                                    <div>
                                        <span className={styles.tradeAsset}>{trade.asset}</span>
                                        <span className={styles.tradeDate}>
                                            {new Date(trade.createdAt).toLocaleString()} &rarr; {trade.closedAt ? new Date(trade.closedAt).toLocaleTimeString() : 'OPEN'}
                                        </span>
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

            {/* ── Empty / Onboarding ── */}
            {recentTrades.length === 0 && (
                <motion.div variants={item} className={styles.emptyState}>
                    <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>Welcome to RiskGuardian</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Risk rules are set. Here is how to start:
                    </p>
                    <div className={styles.emptyStep}>
                        <div className={styles.emptyStepNum}>1</div>
                        <span className={styles.emptyStepText}>Open the <strong style={{ color: 'var(--text-primary)' }}>Risk Engine</strong> before you enter a trade.</span>
                    </div>
                    <div className={styles.emptyStep}>
                        <div className={styles.emptyStepNum}>2</div>
                        <span className={styles.emptyStepText}>Input your Entry and Stop Loss. Get exact position size instantly.</span>
                    </div>
                    <div className={styles.emptyStep}>
                        <div className={styles.emptyStepNum}>3</div>
                        <span className={styles.emptyStepText}>Hit <strong style={{ color: 'var(--text-primary)' }}>Log Plan</strong> — your daily risk limit tracks automatically.</span>
                    </div>
                    <button className="btn btn--primary btn--full" style={{ marginTop: 8 }} onClick={() => setActiveTab('terminal')}>
                        Open Risk Engine
                    </button>
                </motion.div>
            )}
        </motion.div>
    );
}
