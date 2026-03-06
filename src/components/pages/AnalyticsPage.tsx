'use client';

import styles from './AnalyticsPage.module.css';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart, Bar, XAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, ReferenceLine, CartesianGrid, YAxis, Area, AreaChart, Cell
} from 'recharts';
import {
    TrendingUp, TrendingDown, Brain, Activity, AlertTriangle,
    Zap, Target, ShieldCheck, BookOpen, Layers, FlaskConical
} from 'lucide-react';
import {
    analyzeRiskGuardian, analyzeBehavior, analyzeConsistency,
    generateJournalInsights, scoreTradeQuality,
    detectSetups, runStrategySimulator
} from '@/ai/RiskAI';

type Tab = 'overview' | 'behavior' | 'consistency' | 'insights' | 'whatif' | 'edge' | 'simulator';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <TrendingUp size={11} /> },
    { id: 'behavior', label: 'Behavior', icon: <Brain size={11} /> },
    { id: 'edge', label: 'Edge AI', icon: <Layers size={11} /> },
    { id: 'simulator', label: 'Simulator', icon: <FlaskConical size={11} /> },
    { id: 'consistency', label: 'Streak', icon: <Activity size={11} /> },
    { id: 'insights', label: 'Journal', icon: <BookOpen size={11} /> },
    { id: 'whatif', label: 'What-If', icon: <Zap size={11} /> },
];

export default function AnalyticsPage() {
    const { trades, account, getTodayRiskUsed } = useAppStore();
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    const todayUsed = getTodayRiskUsed();
    const maxTradeRisk = (account.balance * account.maxRiskPercent) / 100;
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');

    const guardian = useMemo(() => analyzeRiskGuardian(account, todayUsed), [account, todayUsed]);
    const behavior = useMemo(() => analyzeBehavior(trades, maxTradeRisk), [trades, maxTradeRisk]);
    const consistency = useMemo(() => analyzeConsistency(trades), [trades]);
    const journal = useMemo(() => generateJournalInsights(trades, account), [trades, account]);
    const setups = useMemo(() => detectSetups(trades), [trades]);
    const [simMonths, setSimMonths] = useState(3);
    const [simTrades, setSimTrades] = useState(20);

    // PnL chart data
    const pnlData = closed.reduce((acc, t, i) => {
        const pnl = (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD));
        const cumulative = (acc.length > 0 ? acc[acc.length - 1].cumulative : 0) + pnl;
        acc.push({ trade: `T${i + 1}`, pnl, cumulative });
        return acc;
    }, [] as { trade: string; pnl: number; cumulative: number }[]);

    // Trade Quality Score for last trade
    const lastTrade = closed[0];
    const lastQuality = lastTrade && account.dailyLossLimit > 0 ? scoreTradeQuality({
        riskUSD: lastTrade.riskUSD,
        maxTradeRisk,
        rr: lastTrade.rr,
        stopDistancePct: lastTrade.entry > 0 ? (Math.abs(lastTrade.entry - lastTrade.stopLoss) / lastTrade.entry) * 100 : 1,
        remainingDailyPct: (guardian.remainingDaily / account.dailyLossLimit) * 100,
        behaviorState: behavior.emotionalState
    }) : null;

    // Simulator — derived from actual trade history stats
    const simStats = useMemo(() => {
        const wins = closed.filter(t => t.outcome === 'win');
        const losses = closed.filter(t => t.outcome === 'loss');
        const winRate = closed.length > 0 ? wins.length / closed.length : 0.5;
        const avgRR = closed.filter(t => t.rr > 0).length > 0
            ? closed.reduce((s, t) => s + t.rr, 0) / closed.length : 2;
        const avgRisk = closed.length > 0
            ? closed.reduce((s, t) => s + t.riskUSD, 0) / closed.length : maxTradeRisk;
        return { winRate, avgRR, avgRisk };
    }, [closed, maxTradeRisk]);

    const simResult = useMemo(() => runStrategySimulator({
        currentRisk: Math.max(simStats.avgRisk, 1),
        currentWinRate: simStats.winRate,
        currentAvgRR: simStats.avgRR,
        tradesPerMonth: simTrades,
        startingBalance: account.balance || 10000,
        maxDrawdownLimit: account.maxDrawdownLimit || account.dailyLossLimit * 10 || 2000,
        months: simMonths
    }), [simStats, simTrades, simMonths, account]);

    const survivalColor = guardian.survivalStatus === 'safe' ? '#A6FF4D' :
        guardian.survivalStatus === 'caution' ? '#FFB300' :
            guardian.survivalStatus === 'danger' ? '#FF8C00' : '#FF4757';

    if (trades.length === 0) {
        return (
            <div className={styles.page}>
                <div className={styles.pageHeader}>
                    <div className={styles.pageIcon}><Brain size={20} /></div>
                    <div>
                        <h1 className="text-subheading">AI Intelligence</h1>
                        <p className="text-caption">7 AI systems watching your performance</p>
                    </div>
                </div>
                <div className={styles.emptyCard}>
                    <Brain size={48} strokeWidth={1} className="text-[var(--text-muted)]" />
                    <p className="text-subheading mt-3 text-[var(--text-secondary)]">AI Engine Ready</p>
                    <p className="text-caption">Execute trades to activate behavioral analysis, consistency tracking, and AI coaching.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>

            {/* Header */}
            <div className={styles.pageHeader}>
                <div className={styles.pageIcon}><Brain size={20} /></div>
                <div className="flex-1">
                    <h1 className="text-subheading">AI Intelligence</h1>
                    <p className="text-caption">7 systems · {closed.length} trades analyzed</p>
                </div>
                <div className={`text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1 ${guardian.survivalStatus === 'safe' ? 'bg-accent/10 text-accent' :
                    guardian.survivalStatus === 'caution' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-danger/10 text-danger'
                    }`}>
                    <ShieldCheck size={10} />
                    {guardian.survivalStatus.toUpperCase()}
                </div>
            </div>

            {/* Tab Nav */}
            <nav className={styles.tabNav}>
                {TABS.map(t => (
                    <button key={t.id}
                        className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabBtnActive : ''}`}
                        onClick={() => setActiveTab(t.id)}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </nav>

            <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

                    {/* ───────────── OVERVIEW ───────────── */}
                    {activeTab === 'overview' && (
                        <div className="flex flex-col gap-4">
                            {/* Risk Guardian */}
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><ShieldCheck size={12} /> Risk Guardian</p>
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-muted">Daily used</span>
                                        <span className="font-bold" style={{ color: survivalColor }}>{guardian.proximityPct.toFixed(0)}%</span>
                                    </div>
                                    <div className={styles.survivalBar}>
                                        <motion.div
                                            className={styles.survivalFill}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${guardian.proximityPct}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            style={{ background: survivalColor }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        {[
                                            { label: 'Remaining Daily', value: `$${guardian.remainingDaily.toFixed(0)}`, color: 'text-success' },
                                            { label: 'Safe Risk', value: `$${guardian.safeRisk.toFixed(0)}`, color: 'text-accent' },
                                            { label: 'Trades Left', value: String(guardian.maxTradesLeft), color: 'text-white' },
                                        ].map(s => (
                                            <div key={s.label} className="flex flex-col items-center gap-0.5 bg-white/3 rounded-lg p-2">
                                                <span className={`font-mono text-[16px] font-extrabold ${s.color}`}>{s.value}</span>
                                                <span className="text-[9px] uppercase tracking-wider text-muted text-center">{s.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-[12px] text-muted italic mt-1">{guardian.recommendation}</div>
                                </div>
                            </div>

                            {/* KPI Row */}
                            <div className={styles.kpiRow}>
                                {[
                                    { label: 'Net P&L', value: `${journal.netPnl >= 0 ? '+' : ''}$${Math.abs(journal.netPnl).toFixed(0)}`, colorClass: journal.netPnl >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]', sub: `${closed.length} closed trades` },
                                    { label: 'Win Rate', value: `${journal.winRate.toFixed(0)}%`, colorClass: journal.winRate >= 55 ? 'text-[var(--color-success)]' : journal.winRate >= 45 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]', sub: `${journal.wins}W · ${journal.losses}L` },
                                    { label: 'Expectancy', value: `${journal.expectancy >= 0 ? '+' : ''}$${journal.expectancy.toFixed(0)}`, colorClass: journal.expectancy >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]', sub: 'per trade avg' },
                                    { label: 'Avg R:R', value: `${journal.avgRR.toFixed(2)}R`, colorClass: journal.avgRR >= 2 ? 'text-[var(--color-success)]' : journal.avgRR >= 1.5 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]', sub: 'reward:risk ratio' },
                                ].map(k => (
                                    <div key={k.label} className={styles.kpiCard}>
                                        <span className={styles.kpiLabel}>{k.label}</span>
                                        <span className={`${styles.kpiValue} ${k.colorClass}`}>{k.value}</span>
                                        <span className={styles.kpiSub}>{k.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Equity Curve */}
                            {pnlData.length > 0 && (
                                <div className={styles.chartCard}>
                                    <p className={`${styles.sectionTitle} mb-3`}><TrendingUp size={12} /> Cumulative PnL Trajectory</p>
                                    <ResponsiveContainer width="100%" height={140}>
                                        <AreaChart data={pnlData}>
                                            <defs>
                                                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#A6FF4D" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#A6FF4D" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                                            <XAxis dataKey="trade" tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fill: '#475569', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                                            <Tooltip content={({ active, payload }) => active && payload?.length ? (
                                                <div className={styles.tooltip}>
                                                    <p className={styles.tooltipLabel}>{payload[0].payload.trade}</p>
                                                    <p className={`${styles.tooltipValue} ${(payload[0].value as number) >= 0 ? 'text-success' : 'text-danger'}`}>
                                                        {(payload[0].value as number) >= 0 ? '+' : ''}${(payload[0].value as number).toFixed(2)}
                                                    </p>
                                                </div>
                                            ) : null} />
                                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                                            <Area type="monotone" dataKey="cumulative" stroke="#A6FF4D" strokeWidth={2} fill="url(#pnlGrad)" dot={false} animationDuration={1200} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Bar chart */}
                            {pnlData.length > 0 && (
                                <div className={styles.chartCard}>
                                    <p className={`${styles.sectionTitle} mb-3`}><Activity size={12} /> Bar-by-Bar Execution</p>
                                    <ResponsiveContainer width="100%" height={90}>
                                        <BarChart data={pnlData}>
                                            <Tooltip content={({ active, payload }) => active && payload?.length ? (
                                                <div className={styles.tooltip}>
                                                    <p className={`${styles.tooltipValue} ${(payload[0].value as number) >= 0 ? 'text-success' : 'text-danger'}`}>
                                                        {(payload[0].value as number) >= 0 ? '+' : ''}${(payload[0].value as number).toFixed(2)}
                                                    </p>
                                                </div>
                                            ) : null} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                                            <Bar dataKey="pnl" radius={[2, 2, 2, 2]}>
                                                {pnlData.map((entry, i) => (
                                                    <Cell key={`cell-${i}`} fill={entry.pnl >= 0 ? '#34c759' : '#ff4757'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Last Trade Quality */}
                            {lastQuality && (
                                <div className={styles.sectionCard}>
                                    <p className={styles.sectionTitle}><Target size={12} /> Last Trade Score</p>
                                    <div className="flex items-center gap-4">
                                        <div className={`${styles.gradeCircle} ${lastQuality.grade.startsWith('A') ? styles.gradeA :
                                            lastQuality.grade.startsWith('B') ? styles.gradeB :
                                                lastQuality.grade.startsWith('C') ? styles.gradeC : styles.gradeDF
                                            }`}>{lastQuality.grade}</div>
                                        <div className="flex-1">
                                            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">Score: {lastQuality.score}/100</p>
                                            <p className="text-[12px] text-secondary leading-snug">{lastQuality.summary}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2">
                                        {lastQuality.breakdown.map(b => (
                                            <div key={b.label} className={styles.breakdownRow}>
                                                <span className={styles.breakdownLabel}>{b.label}</span>
                                                <span className={`${styles.breakdownVal} ${b.status === 'good' ? styles.statusGood : b.status === 'warn' ? styles.statusWarn : styles.statusBad}`}>{b.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ───────────── BEHAVIOR AI ───────────── */}
                    {activeTab === 'behavior' && (
                        <div className="flex flex-col gap-4">
                            {/* Emotional State Card */}
                            <div className={`${styles.behaviorCard} ${behavior.emotionalState === 'disciplined' ? styles.behaviorSafe :
                                behavior.emotionalState === 'cautious' ? styles.behaviorCaution :
                                    behavior.emotionalState === 'stressed' ? styles.behaviorDanger :
                                        styles.behaviorRevenge
                                }`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-muted uppercase tracking-wider">Emotional State</span>
                                    <span className={`${styles.emotionBadge} ${behavior.emotionalState === 'disciplined' ? styles.emotionDisciplined :
                                        behavior.emotionalState === 'cautious' ? styles.emotionCautious :
                                            behavior.emotionalState === 'stressed' ? styles.emotionStressed :
                                                styles.emotionRevenge
                                        }`}>
                                        {behavior.emotionalState === 'disciplined' ? '✅' :
                                            behavior.emotionalState === 'cautious' ? '⚠️' :
                                                behavior.emotionalState === 'stressed' ? '🔴' : '🚨'}
                                        {behavior.emotionalState.toUpperCase()}
                                    </span>
                                </div>
                                <p className={styles.behaviorRec}>{behavior.recommendation}</p>
                                {behavior.stopTradingRecommended && (
                                    <div className="flex items-center gap-2 mt-1 p-2 bg-danger/10 border border-danger/30 rounded">
                                        <AlertTriangle size={14} className="text-danger shrink-0" />
                                        <span className="text-[11px] text-danger font-bold">Recommended: {behavior.cooldownMinutes}-minute cooldown before next trade.</span>
                                    </div>
                                )}
                            </div>

                            {/* Stats Grid */}
                            <div className={styles.kpiRow}>
                                {[
                                    { label: 'Consecutive Losses', value: String(behavior.consecutiveLosses), color: behavior.consecutiveLosses >= 3 ? 'text-danger' : behavior.consecutiveLosses >= 2 ? 'text-warning' : 'text-success' },
                                    { label: 'Trades Today', value: String(behavior.tradesThisSession), color: behavior.overtradingAlert ? 'text-warning' : 'text-white' },
                                    { label: 'Win Streak', value: String(behavior.winStreak), color: 'text-success' },
                                    { label: 'Loss Streak', value: String(behavior.lossStreak), color: behavior.lossStreak >= 3 ? 'text-danger' : 'text-white' },
                                ].map(s => (
                                    <div key={s.label} className={styles.kpiCard}>
                                        <span className={styles.kpiLabel}>{s.label}</span>
                                        <span className={`${styles.kpiValue} ${s.color}`}>{s.value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Revenge Trading */}
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><AlertTriangle size={12} /> Revenge Trade Detector</p>
                                {behavior.revengeRisk ? (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[12px] text-secondary">Size increase after loss</span>
                                            <span className="font-mono font-bold text-danger text-[16px]">+{behavior.revengePct.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(100, behavior.revengePct)}%` }}
                                                className="h-full rounded-full bg-danger"
                                                transition={{ duration: 1 }}
                                            />
                                        </div>
                                        <p className="text-[11px] text-muted">Severity: <strong className={behavior.revengeSeverity === 'extreme' ? 'text-danger' : 'text-warning'}>{behavior.revengeSeverity.toUpperCase()}</strong></p>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[12px] text-success">
                                        <ShieldCheck size={14} /> No revenge trading detected. Sizing is consistent.
                                    </div>
                                )}
                            </div>

                            {/* Overtrading */}
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><Activity size={12} /> Overtrading Monitor</p>
                                <div className="flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] text-muted">Trades this session</span>
                                        <span className={`font-mono text-[20px] font-extrabold ${behavior.overtradingAlert ? 'text-warning' : 'text-white'}`}>{behavior.tradesThisSession}</span>
                                    </div>
                                    <div className={`text-[11px] px-3 py-1.5 rounded-full font-bold ${behavior.overtradingAlert ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                                        {behavior.overtradingAlert ? '⚠️ HIGH FREQUENCY' : '✅ NORMAL VOLUME'}
                                    </div>
                                </div>
                                {behavior.avgTimeBetweenTrades > 0 && (
                                    <p className="text-[11px] text-muted mt-1">Avg time between trades: {behavior.avgTimeBetweenTrades.toFixed(0)} min</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ───────────── CONSISTENCY ───────────── */}
                    {activeTab === 'consistency' && (
                        <div className="flex flex-col gap-4">
                            {/* Score Hero */}
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><Target size={12} /> Consistency Score</p>
                                <div className="flex items-center gap-4">
                                    <div className="relative w-20 h-20 shrink-0">
                                        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                                            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                                            <motion.circle
                                                cx="40" cy="40" r="34"
                                                fill="none" stroke="#A6FF4D" strokeWidth="8"
                                                strokeLinecap="round"
                                                strokeDasharray={2 * Math.PI * 34}
                                                initial={{ strokeDashoffset: 2 * Math.PI * 34 }}
                                                animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - consistency.score / 100) }}
                                                transition={{ duration: 1.5, ease: 'easeOut' }}
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="font-mono text-[18px] font-extrabold">{consistency.score}</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-2">
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Best Day</span>
                                            <span className="font-mono font-bold text-success">+${consistency.bestDay.toFixed(0)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Worst Day</span>
                                            <span className="font-mono font-bold text-danger">${consistency.worstDay.toFixed(0)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Avg Day</span>
                                            <span className={`font-mono font-bold ${consistency.avgDailyPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                                {consistency.avgDailyPnl >= 0 ? '+' : ''}${consistency.avgDailyPnl.toFixed(0)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Green/Red days</span>
                                            <span className="font-mono font-bold">{consistency.profitDays}G · {consistency.lossDays}R</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tradeify Payout Rule */}
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><ShieldCheck size={12} /> Tradeify 20% Payout Rule</p>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[12px] text-muted">Best day concentration</span>
                                    <span className={`font-mono font-bold text-[16px] ${consistency.payoutEligible ? 'text-success' : 'text-danger'}`}>
                                        {consistency.bestDayPct.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, (consistency.bestDayPct / 40) * 100)}%` }}
                                        className={`h-full rounded-full ${consistency.payoutEligible ? 'bg-success' : 'bg-danger'}`}
                                        transition={{ duration: 1 }}
                                    />
                                    <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: '50%' }} />
                                </div>
                                <div className="flex justify-between text-[9px] text-muted font-bold uppercase tracking-wider">
                                    <span>0%</span><span>⬆ 20% LIMIT</span><span>40%+</span>
                                </div>
                                <div className={`mt-3 p-2 rounded text-[11px] font-semibold ${consistency.payoutEligible ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                    {consistency.payoutEligible ? '✅ PASSING — Eligible for payout request.' : `❌ FAILING — Best day is too concentrated. Add more profit on other days to dilute below 20%.`}
                                </div>
                            </div>

                            {/* AI Insights */}
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><Brain size={12} /> AI Insights</p>
                                {consistency.insights.map((ins, i) => (
                                    <div key={i} className={styles.insightRow}>
                                        <div className={styles.insightDot} />
                                        <span>{ins}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ───────────── AI JOURNAL ───────────── */}
                    {activeTab === 'insights' && (
                        <div className="flex flex-col gap-4">
                            {/* AI Coach */}
                            <div className={styles.coachCard}>
                                <div className={styles.coachIcon}><Brain size={18} /></div>
                                <div>
                                    <p className={styles.coachTitle}>AI Risk Coach</p>
                                    <p className={styles.coachMessage}>{journal.aiCoachMessage}</p>
                                </div>
                            </div>

                            {/* Daily Summary */}
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><BookOpen size={12} /> Session Summary</p>
                                <p className="text-[13px] text-secondary leading-relaxed">{journal.dailySummary}</p>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="bg-white/3 rounded p-2">
                                        <p className="text-[9px] text-muted uppercase tracking-wider">Best Setup</p>
                                        <p className="text-[12px] font-bold text-success mt-0.5">{journal.bestSetup}</p>
                                    </div>
                                    <div className="bg-white/3 rounded p-2">
                                        <p className="text-[9px] text-muted uppercase tracking-wider">Worst Pattern</p>
                                        <p className="text-[12px] font-bold text-danger mt-0.5">{journal.worstPattern}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Weekly Report */}
                            {journal.weeklyReport && (
                                <div className={styles.sectionCard}>
                                    <p className={styles.sectionTitle}><TrendingUp size={12} /> Weekly Report</p>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Weekly P&L</span>
                                            <span className={`font-mono font-bold ${journal.weeklyReport.weeklyPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                                {journal.weeklyReport.weeklyPnl >= 0 ? '+' : ''}${journal.weeklyReport.weeklyPnl.toFixed(0)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Weekly Win Rate</span>
                                            <span className="font-mono font-bold">{journal.weeklyReport.weekWinRate.toFixed(0)}%</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Top Asset</span>
                                            <span className="font-mono font-bold text-accent">{journal.weeklyReport.topAsset}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-muted">Expectancy/trade</span>
                                            <span className={`font-mono font-bold ${journal.expectancy >= 0 ? 'text-success' : 'text-danger'}`}>
                                                {journal.expectancy >= 0 ? '+' : ''}${journal.expectancy.toFixed(0)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* W/L Summary */}
                            <div className={styles.wlCard}>
                                <div className={styles.wlItem}>
                                    <span className={`${styles.wlNum} text-[var(--color-success)]`}>{journal.wins}</span>
                                    <span className={styles.wlLabel}>Wins</span>
                                </div>
                                <div className={styles.wlDivider} />
                                <div className={styles.wlItem}>
                                    <span className={styles.wlNum}>{journal.totalTrades}</span>
                                    <span className={styles.wlLabel}>Total</span>
                                </div>
                                <div className={styles.wlDivider} />
                                <div className={styles.wlItem}>
                                    <span className={`${styles.wlNum} text-[var(--color-danger)]`}>{journal.losses}</span>
                                    <span className={styles.wlLabel}>Losses</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ───────────── WHAT-IF ───────────── */}
                    {activeTab === 'whatif' && (
                        <div className="flex flex-col gap-4">
                            <div className={styles.sectionCard}>
                                <p className={styles.sectionTitle}><Zap size={12} /> What-If Simulator</p>
                                <p className="text-[12px] text-muted">Simulate alternative trading decisions on your historical data.</p>
                            </div>

                            {journal.whatIf.length === 0 ? (
                                <div className={styles.emptyCard}>
                                    <Zap size={36} strokeWidth={1} className="text-muted" />
                                    <p className="text-[13px] text-secondary mt-2">Log more trades to unlock What-If scenarios.</p>
                                </div>
                            ) : (
                                journal.whatIf.map((w, i) => (
                                    <motion.div key={i} className={styles.whatIfCard} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                                        <p className={styles.whatIfTitle}>📊 Scenario: {w.scenarioLabel}</p>
                                        <div className={styles.whatIfNumbers}>
                                            <div className={styles.whatIfNum}>
                                                <span className={styles.whatIfNumLabel}>Actual P&L</span>
                                                <span className={`${styles.whatIfNumValue} ${w.pnlActual >= 0 ? 'text-success' : 'text-danger'}`}>
                                                    {w.pnlActual >= 0 ? '+' : ''}${w.pnlActual.toFixed(0)}
                                                </span>
                                            </div>
                                            <div className={styles.whatIfNum}>
                                                <span className={styles.whatIfNumLabel}>Scenario P&L</span>
                                                <span className={`${styles.whatIfNumValue} ${w.pnlScenario >= 0 ? 'text-success' : 'text-danger'}`}>
                                                    {w.pnlScenario >= 0 ? '+' : ''}${w.pnlScenario.toFixed(0)}
                                                </span>
                                            </div>
                                            <div className={styles.whatIfNum}>
                                                <span className={styles.whatIfNumLabel}>Difference</span>
                                                <span className={`${styles.whatIfNumValue} ${w.difference >= 0 ? 'text-accent' : 'text-warning'}`}>
                                                    {w.difference >= 0 ? '+' : ''}${w.difference.toFixed(0)}
                                                </span>
                                            </div>
                                        </div>
                                        <p className={styles.whatIfLesson}>💡 {w.lesson}</p>
                                    </motion.div>
                                ))
                            )}

                            {/* Meta insight */}
                            <div className={styles.coachCard}>
                                <div className={styles.coachIcon}><Brain size={18} /></div>
                                <div>
                                    <p className={styles.coachTitle}>The Real Secret</p>
                                    <p className={styles.coachMessage}>
                                        Discipline is not about finding better setups. It is about knowing exactly when to stop.
                                        Your edge compounds through persistence — not through extra trades.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'edge' && (
                        <motion.div key="edge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.tabContent}>
                            {/* Header */}
                            <div className={styles.coachCard} style={{ marginBottom: 12 }}>
                                <div className={styles.coachIcon}><Layers size={18} /></div>
                                <div>
                                    <p className={styles.coachTitle}>Edge Discovery — {setups.totalEdges} profitable patterns found</p>
                                    <p className={styles.coachMessage}>{setups.primaryEdge}</p>
                                </div>
                            </div>

                            {/* Anti-pattern warning */}
                            {setups.worstEdge && setups.worstEdge.strength === 'avoid' && (
                                <div className={`${styles.behaviorCard} ${styles.dangerCard}`} style={{ marginBottom: 10 }}>
                                    <AlertTriangle size={14} className="text-danger flex-shrink-0" />
                                    <div><p className="font-bold text-danger text-[12px]">Avoid</p><p className={styles.alertText}>{setups.antiPattern}</p></div>
                                </div>
                            )}

                            {/* Edge list */}
                            <div className="flex flex-col gap-2">
                                {setups.edges.slice(0, 8).map(edge => (
                                    <div key={edge.id} className={`${styles.whatIfCard} ${edge.strength === 'strong' ? 'border-l-[3px] border-l-[#A6FF4D]' : edge.strength === 'avoid' ? 'border-l-[3px] border-l-[#FF4757]' : ''}`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-[12px] font-bold">{edge.label}</span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${edge.strength === 'strong' ? 'bg-accent/10 text-accent' :
                                                    edge.strength === 'moderate' ? 'bg-blue-500/10 text-blue-400' :
                                                        edge.strength === 'weak' ? 'bg-yellow-500/10 text-yellow-400' :
                                                            'bg-danger/10 text-danger'
                                                }`}>{edge.strength.toUpperCase()}</span>
                                        </div>
                                        <div className={styles.grid2}>
                                            <div className={styles.kpiItem}>
                                                <span className={styles.kpiLabel}>Win Rate</span>
                                                <span className={`${styles.kpiValue} ${edge.winRate >= 0.55 ? 'text-success' : edge.winRate < 0.4 ? 'text-danger' : 'text-warning'}`}>{(edge.winRate * 100).toFixed(0)}%</span>
                                            </div>
                                            <div className={styles.kpiItem}>
                                                <span className={styles.kpiLabel}>Avg R:R</span>
                                                <span className={styles.kpiValue}>{edge.avgRR.toFixed(1)}R</span>
                                            </div>
                                            <div className={styles.kpiItem}>
                                                <span className={styles.kpiLabel}>Expectancy</span>
                                                <span className={`${styles.kpiValue} ${edge.expectancy >= 0 ? 'text-success' : 'text-danger'}`}>{edge.expectancy >= 0 ? '+' : ''}${edge.expectancy.toFixed(0)}</span>
                                            </div>
                                            <div className={styles.kpiItem}>
                                                <span className={styles.kpiLabel}>Trades</span>
                                                <span className={styles.kpiValue}>{edge.tradeCount}</span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-muted mt-1 italic">{edge.recommendation}</p>
                                    </div>
                                ))}
                            </div>

                            {!setups.readyToTrade && (
                                <p className="text-center text-muted text-[11px] mt-4">Log {20 - closed.length} more trades for full statistical confidence.</p>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'simulator' && (
                        <motion.div key="simulator" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.tabContent}>
                            {/* Config controls */}
                            <div className={styles.card} style={{ marginBottom: 12 }}>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">Monte Carlo Config · 1,000 paths</p>
                                <div className={styles.grid2}>
                                    <div>
                                        <label className="text-[10px] text-muted uppercase font-bold block mb-1">Months</label>
                                        <div className="flex gap-1">
                                            {[1, 3, 6, 12].map(m => (
                                                <button key={m} onClick={() => setSimMonths(m)}
                                                    className={`text-[11px] px-2 py-1 rounded border transition-all ${simMonths === m ? 'border-accent text-accent bg-accent/10' : 'border-border-subtle text-muted'
                                                        }`}>{m}M</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-muted uppercase font-bold block mb-1">Trades/Month</label>
                                        <div className="flex gap-1">
                                            {[10, 20, 40, 60].map(n => (
                                                <button key={n} onClick={() => setSimTrades(n)}
                                                    className={`text-[11px] px-2 py-1 rounded border transition-all ${simTrades === n ? 'border-accent text-accent bg-accent/10' : 'border-border-subtle text-muted'
                                                        }`}>{n}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-muted mt-2">Using your actual stats: {(simStats.winRate * 100).toFixed(0)}% win rate · {simStats.avgRR.toFixed(1)}R avg · ${simStats.avgRisk.toFixed(0)} avg risk</p>
                            </div>

                            {/* Verdict card */}
                            <div className={`${styles.card} ${simResult.bestResult.verdict === 'excellent' ? 'border-l-[3px] border-l-[#A6FF4D]' : simResult.bestResult.verdict === 'viable' ? 'border-l-[3px] border-l-[#FFB300]' : 'border-l-[3px] border-l-[#FF4757]'}`} style={{ marginBottom: 10 }}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[12px] font-bold">Optimal Configuration</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${simResult.bestResult.verdict === 'excellent' ? 'bg-accent/10 text-accent' :
                                            simResult.bestResult.verdict === 'viable' ? 'bg-yellow-500/10 text-yellow-400' :
                                                'bg-danger/10 text-danger'
                                        }`}>{simResult.bestResult.verdict.toUpperCase()}</span>
                                </div>
                                <p className="text-[11px] text-muted italic mb-3">{simResult.summary}</p>

                                <div className={styles.grid2}>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>Optimal Risk/Trade</span>
                                        <span className={`${styles.kpiValue} text-accent`}>${simResult.optimalRisk}</span>
                                    </div>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>Optimal R:R</span>
                                        <span className={`${styles.kpiValue} text-accent`}>{simResult.optimalRR.toFixed(1)}R</span>
                                    </div>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>Monthly Return (median)</span>
                                        <span className={`${styles.kpiValue} ${simResult.bestResult.medianMonthlyReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {simResult.bestResult.medianMonthlyReturn >= 0 ? '+' : ''}{simResult.bestResult.medianMonthlyReturn.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>Survival Rate</span>
                                        <span className={`${styles.kpiValue} ${simResult.bestResult.survivalRate >= 80 ? 'text-success' : 'text-danger'}`}>
                                            {simResult.bestResult.survivalRate.toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>Ruin Chance</span>
                                        <span className={`${styles.kpiValue} ${simResult.bestResult.ruinChance <= 10 ? 'text-success' : 'text-danger'}`}>
                                            {simResult.bestResult.ruinChance.toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>Expectancy/Trade</span>
                                        <span className={`${styles.kpiValue} ${simResult.bestResult.expectancyPerTrade >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {simResult.bestResult.expectancyPerTrade >= 0 ? '+' : ''}${simResult.bestResult.expectancyPerTrade.toFixed(0)}
                                        </span>
                                    </div>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>10th Pct Balance</span>
                                        <span className={styles.kpiValue}>${simResult.bestResult.mean10thPctBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className={styles.kpiItem}>
                                        <span className={styles.kpiLabel}>90th Pct Balance</span>
                                        <span className={styles.kpiValue}>${simResult.bestResult.mean90thPctBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Alternatives mini-grid */}
                            <p className="text-[10px] text-muted uppercase tracking-wider font-bold mb-2">Alternative Configurations Tested</p>
                            <div className="flex flex-col gap-2">
                                {simResult.alternatives.slice(0, 4).map((alt, i) => (
                                    <div key={i} className={styles.whatIfCard}>
                                        <div className="flex justify-between">
                                            <span className="text-[11px] font-bold">
                                                ${alt.config.riskUSD} risk · {alt.config.avgWinR.toFixed(1)}R · {alt.config.tradesPerMonth} trades/mo
                                            </span>
                                            <span className={`text-[10px] font-mono font-bold ${alt.result.verdict === 'excellent' ? 'text-accent' :
                                                    alt.result.verdict === 'viable' ? 'text-yellow-400' :
                                                        'text-danger'
                                                }`}>{alt.result.survivalRate.toFixed(0)}% survival · {alt.result.medianMonthlyReturn >= 0 ? '+' : ''}{alt.result.medianMonthlyReturn.toFixed(1)}%/mo</span>
                                        </div>
                                        <p className="text-[10px] text-muted mt-0.5 italic">{alt.result.recommendation}</p>
                                    </div>
                                ))}
                            </div>

                            <div className={styles.coachCard} style={{ marginTop: 12 }}>
                                <div className={styles.coachIcon}><FlaskConical size={18} /></div>
                                <div>
                                    <p className={styles.coachTitle}>Institution-Level Analytics</p>
                                    <p className={styles.coachMessage}>{simResult.bestResult.recommendation}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                </motion.div>
            </AnimatePresence>
        </div>
    );
}
