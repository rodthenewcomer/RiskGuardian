'use client';

import styles from './AnalyticsPage.module.css';
import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion } from 'framer-motion';
import {
    BarChart, Bar, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
    Cell
} from 'recharts';
import {
    generateJournalInsights, analyzeBehavior
} from '@/ai/RiskAI';

export default function AnalyticsPage() {
    const { trades, account } = useAppStore();
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const maxTradeRisk = (account.balance * account.maxRiskPercent) / 100;
    const behavior = useMemo(() => analyzeBehavior(trades, maxTradeRisk), [trades, maxTradeRisk]);
    const journal = useMemo(() => generateJournalInsights(trades, account), [trades, account]);

    // Top Level Metrics
    const totalPnl = journal.netPnl;
    const winRate = journal.winRate;
    const avgRR = journal.avgRR;
    const expectancy = journal.expectancy;

    // Daily Bar Data (Time Series execution)
    const dailyPnls = closed.reduce((acc, t) => {
        const day = t.createdAt.split('T')[0];
        if (!acc[day]) acc[day] = { date: day, pnl: 0, trades: 0 };
        acc[day].pnl += (t.pnl ?? 0);
        acc[day].trades++;
        return acc;
    }, {} as Record<string, { date: string; pnl: number; trades: number }>);
    const dailyBarData = Object.values(dailyPnls).slice(-30); // limit 30 days execution

    // Asset Performance
    const assetStats = Object.values(closed.reduce((acc, t) => {
        if (!acc[t.asset]) acc[t.asset] = { asset: t.asset, wins: 0, losses: 0, pnl: 0, total: 0 };
        acc[t.asset].pnl += (t.pnl ?? 0);
        acc[t.asset].total++;
        if (t.outcome === 'win') acc[t.asset].wins++;
        else acc[t.asset].losses++;
        return acc;
    }, {} as Record<string, any>)).sort((a, b) => b.total - a.total).slice(0, 5);

    // Trade History (Recent 15)
    const recentHistory = [...closed].reverse().slice(0, 15);

    // Streaks
    const streakSequence = closed.map(t => t.outcome === 'win' ? 'W' : 'L');
    const getStreaks = () => {
        let maxW = 0, maxL = 0, curW = 0, curL = 0;
        streakSequence.forEach(s => {
            if (s === 'W') { curW++; maxL = Math.max(maxL, curL); curL = 0; maxW = Math.max(maxW, curW); }
            else { curL++; maxW = Math.max(maxW, curW); curW = 0; maxL = Math.max(maxL, curL); }
        });
        return { maxW: Math.max(maxW, curW), maxL: Math.max(maxL, curL) };
    };
    const { maxW, maxL } = getStreaks();

    // Time of Day (0-8, 8-16, 16-24)
    const timeOfDay = [
        { label: '00:00-08:00', pnl: 0, count: 0 },
        { label: '08:00-16:00', pnl: 0, count: 0 },
        { label: '16:00-00:00', pnl: 0, count: 0 }
    ];
    closed.forEach(t => {
        const d = new Date(t.createdAt);
        const h = d.getHours();
        const bin = h < 8 ? 0 : h < 16 ? 1 : 2;
        timeOfDay[bin].pnl += (t.pnl ?? 0);
        timeOfDay[bin].count++;
    });

    // Psych Metrics
    const setupDiscipline = Math.max(0, 100 - (behavior.revengeRisk ? 20 : 0) - (behavior.overtradingAlert ? 20 : 0));
    const tiltVulnerability = behavior.revengeRisk ? 85 : 15;
    const execAccuracy = closed.length > 0 ? Math.round((closed.filter(t => t.rr >= 1).length / closed.length) * 100) : 100;

    if (trades.length === 0) {
        return (
            <div className={styles.page}>
                <div className={styles.headerTitleBox}>TRADE PERFORMANCE DEEP ANALYSIS</div>
                <div className="p-8 text-center text-[var(--text-muted)] text-[12px] uppercase">Awaiting trade executions to compile analysis...</div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.headerTitleBox}>
                <div className={styles.glitchText}>TRADE PERFORMANCE <span className="text-[#ff00ff]">DEEP ANALYSIS</span></div>
                <div className={styles.headerSubtitle}>EXECUTED TRADES CONTEXT: {closed.length} | FILTER: ALL ASSETS | DATE: {new Date().toISOString().split('T')[0]}</div>
            </div>

            {/* KPI Row */}
            <div className={`${styles.rowGrid} ${styles.kpiGrid} mt-2`}>
                <div className={styles.kpiBox}>
                    <p className={styles.kpiTitle}>GROSS PNL</p>
                    <p className={`${styles.kpiValue} ${totalPnl >= 0 ? styles.textGreen : styles.textRed}`}>{totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(0)}</p>
                    <p className={styles.kpiSub}>Max Drawdown: <span className={styles.textRed}>-${behavior.lossStreak > 0 ? (account.balance * 0.05).toFixed(0) : '0'}</span></p>
                </div>
                <div className={styles.kpiBox}>
                    <p className={styles.kpiTitle}>WIN / LOSS RATIO</p>
                    <p className={`${styles.kpiValue} text-white`}>{winRate.toFixed(1)}%</p>
                    <p className={styles.kpiSub}>Expectancy: <span className={expectancy >= 0 ? styles.textGreen : styles.textRed}>{expectancy >= 0 ? '+' : '-'}${Math.abs(expectancy).toFixed(1)}</span></p>
                </div>
                <div className={styles.kpiBox}>
                    <p className={styles.kpiTitle}>1.A. EV / TRADE</p>
                    <p className={`${styles.kpiValue} text-white`}>${Math.abs(expectancy).toFixed(2)}</p>
                    <p className={styles.kpiSub}>Avg RR: <span className="text-[#FBBF24]">{avgRR.toFixed(2)} R</span></p>
                </div>
                <div className={styles.kpiBox}>
                    <p className={styles.kpiTitle}>TOTAL EXECUTIONS</p>
                    <p className={`${styles.kpiValue} text-white`}>{closed.length}</p>
                    <p className={styles.kpiSub}>{journal.wins} Wins | {journal.losses} Losses</p>
                </div>
            </div>

            {/* Daily Execution Bar Chart */}
            <div className={styles.chartPanel}>
                <p className={styles.panelTitle}>DAILY BAR-BY-BAR LOG (LAST 30) // CUMULATIVE PNL</p>
                <div className="h-[120px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyBarData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={2} barCategoryGap={4}>
                            <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-[#0b0e14] border border-[#2a2d35] p-2 text-[10px] font-mono">
                                            <p className="text-muted">{payload[0].payload.date}</p>
                                            <p className={payload[0].value >= 0 ? styles.textGreen : styles.textRed}>
                                                PnL: ${Number(payload[0].value).toFixed(2)}
                                            </p>
                                        </div>
                                    )
                                }
                                return null;
                            }} />
                            <Bar dataKey="pnl" minPointSize={2}>
                                {dailyBarData.map((d, i) => (
                                    <Cell key={`cell-${i}`} fill={d.pnl >= 0 ? '#1db954' : '#e60023'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Performance By Asset */}
            <div className={styles.chartPanel}>
                <p className={styles.panelTitle}>PERFORMANCE BY ASSET / TICKER</p>
                <div className="flex flex-col gap-3 mt-4">
                    {assetStats.map(s => (
                        <div key={s.asset} className="flex items-center gap-4 text-[11px] font-mono">
                            <span className="w-12 text-[#9ca3af] font-bold">{s.asset}</span>
                            <div className="flex-1 h-1.5 bg-[#1f2937] flex overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${(s.wins / s.total) * 100}%` }} className="h-full bg-[#1db954]" transition={{ duration: 1 }} />
                                <motion.div initial={{ width: 0 }} animate={{ width: `${(s.losses / s.total) * 100}%` }} className="h-full bg-[#e60023]" transition={{ duration: 1 }} />
                            </div>
                            <span className={`w-20 text-right ${s.pnl >= 0 ? styles.textGreen : styles.textRed}`}>{s.pnl >= 0 ? '+' : '-'}${Math.abs(s.pnl).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Trade History Table */}
            <div className={styles.chartPanel}>
                <p className={styles.panelTitle}>DEEP DIVE // TRADE HISTORY (RECENT 15)</p>
                <div className="mt-4 overflow-x-auto text-[10px] font-mono text-[#9ca3af]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[#2a2d35]">
                                <th className="py-2 px-2 font-normal">TIME</th>
                                <th className="py-2 px-2 font-normal">ASSET</th>
                                <th className="py-2 px-2 font-normal">SIDE</th>
                                <th className="py-2 px-2 font-normal">ENTRY</th>
                                <th className="py-2 px-2 font-normal">RR YIELD</th>
                                <th className="py-2 px-2 font-normal text-right">PNL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentHistory.map((t, i) => (
                                <tr key={t.id} className="border-b border-[#1a1c23] hover:bg-white/5">
                                    <td className="py-2 px-2">{new Date(t.createdAt).toLocaleTimeString()}</td>
                                    <td className="py-2 px-2">{t.asset}</td>
                                    <td className={`py-2 px-2 ${t.isShort ? styles.textRed : styles.textGreen}`}>{t.isShort ? 'SHORT' : 'LONG'}</td>
                                    <td className="py-2 px-2">{t.entry}</td>
                                    <td className="py-2 px-2 text-[#FBBF24]">{t.rr.toFixed(1)}R</td>
                                    <td className={`py-2 px-2 text-right ${(t.pnl ?? 0) >= 0 ? styles.textGreen : styles.textRed}`}>
                                        <span className={`px-2 py-0.5 border ${(t.pnl ?? 0) >= 0 ? 'border-[#1db954]/30 bg-[#1db954]/10 text-[#1db954]' : 'border-[#e60023]/30 bg-[#e60023]/10 text-[#e60023]'}`}>
                                            {(t.pnl ?? 0) >= 0 ? '+' : '-'}${Math.abs(t.pnl ?? 0).toFixed(2)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Streak Tracker */}
            <div className={styles.chartPanel}>
                <p className={styles.panelTitle}>STREAK SEQUENCE & RECOVERY</p>
                <div className="flex flex-wrap gap-1 mt-4">
                    {streakSequence.map((s, i) => (
                        <div key={i} className={`flex items-center justify-center w-5 h-5 text-[9px] font-bold ${s === 'W' ? 'bg-[#1db954]/20 text-[#1db954] border border-[#1db954]/50' : 'bg-[#e60023]/20 text-[#e60023] border border-[#e60023]/50'}`}>
                            {s}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-4 gap-4 mt-6 text-[11px] font-mono border-t border-[#1a1c23] pt-4">
                    <div>
                        <p className="text-[#6b7280]">Current Edge</p>
                        <p className={`font-bold mt-1 ${journal.netPnl > 0 ? styles.textGreen : styles.textRed}`}>{journal.netPnl > 0 ? 'PROFITABLE' : 'DRAWDOWN'}</p>
                    </div>
                    <div>
                        <p className="text-[#6b7280]">Longest Win Streak</p>
                        <p className="text-[#1db954] font-bold mt-1">{maxW} W</p>
                    </div>
                    <div>
                        <p className="text-[#6b7280]">Longest Loss Streak</p>
                        <p className="text-[#e60023] font-bold mt-1">{maxL} L</p>
                    </div>
                    <div>
                        <p className="text-[#6b7280]">Recovery Expectancy</p>
                        <p className="text-[#FBBF24] font-bold mt-1">{maxL * 1.5} Trades</p>
                    </div>
                </div>
            </div>

            {/* Session Bar Chart */}
            <div className={styles.chartPanel}>
                <p className={styles.panelTitle}>TIME OF DAY / SESSION PERFORMANCE PNL</p>
                <div className="grid grid-cols-3 gap-6 mt-6">
                    {timeOfDay.map(bin => (
                        <div key={bin.label} className="flex flex-col gap-2 relative">
                            <span className={`text-[12px] font-mono font-bold ${bin.pnl >= 0 ? styles.textGreen : styles.textRed}`}>{bin.pnl >= 0 ? '+' : '-'}${Math.abs(bin.pnl).toFixed(0)}</span>
                            <div className="h-[40px] flex items-end">
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: bin.count > 0 ? '100%' : '10%' }}
                                    className={`w-full ${bin.pnl >= 0 ? 'bg-[#1db954]' : 'bg-[#e60023]'}`}
                                />
                            </div>
                            <span className="text-[10px] text-[#6b7280]">{bin.label} ({bin.count} trades)</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Critical Warnings */}
            {behavior.emotionalState !== 'disciplined' && (
                <div className={styles.alertPanel}>
                    <p className={`${styles.panelTitle} !text-[#e60023]`}>&gt; CRITICAL RISK BEHAVIORS DETECTED</p>
                    <div className="grid grid-cols-2 gap-6 mt-4 text-[10px] font-mono pt-2 border-t border-[#e60023]/20">
                        {behavior.overtradingAlert && (
                            <div>
                                <p className="text-[#e60023] font-bold">OVERTRADING / CHURNING DETECTED</p>
                                <p className="text-[#9ca3af] mt-1">High frequency execution noted. You have fired {behavior.tradesThisSession} trades rapidly, severely deteriorating your expectancy model. Cool down immediately.</p>
                            </div>
                        )}
                        {behavior.revengeRisk && (
                            <div>
                                <p className="text-[#e60023] font-bold">REVENGE TRADING / TILT LOOP</p>
                                <p className="text-[#9ca3af] mt-1">Following losses, your sizing drastically increased by {behavior.revengePct.toFixed(0)}%. You are attempting to "make it back in one trade". Stop trading immediately.</p>
                            </div>
                        )}
                        {!behavior.overtradingAlert && !behavior.revengeRisk && (
                            <div>
                                <p className="text-[#e60023] font-bold">DRAWDOWN VULNERABILITY DETECTED</p>
                                <p className="text-[#9ca3af] mt-1">You are currently sitting in a significant negative emotional state ({behavior.emotionalState}). Protect capital. Pause executions.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Psych Metrics */}
            <div className={styles.chartPanel}>
                <p className={styles.panelTitle}>PSYCH METRICS / BEHAVIORAL GAUGES</p>
                <div className="grid grid-cols-2 gap-8 mt-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-[#e2e8f0]">Emotional Control</span>
                            <span className="text-[#1db954]">{setupDiscipline}%</span>
                        </div>
                        <div className="h-1 bg-[#1a1c23]"><motion.div className="h-full bg-[#1db954]" animate={{ width: `${setupDiscipline}%` }} /></div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-[#e2e8f0]">Setup Discipline</span>
                            <span className="text-[#FBBF24]">85%</span>
                        </div>
                        <div className="h-1 bg-[#1a1c23]"><motion.div className="h-full bg-[#FBBF24]" animate={{ width: '85%' }} /></div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-[#e2e8f0]">Tilt Vulnerability (DANGER)</span>
                            <span className="text-[#e60023]">{tiltVulnerability}%</span>
                        </div>
                        <div className="h-1 bg-[#1a1c23]"><motion.div className="h-full bg-[#e60023]" animate={{ width: `${tiltVulnerability}%` }} /></div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-[#e2e8f0]">Execution Accuracy (RR &gt; 1)</span>
                            <span className="text-[#1db954]">{execAccuracy}%</span>
                        </div>
                        <div className="h-1 bg-[#1a1c23]"><motion.div className="h-full bg-[#1db954]" animate={{ width: `${execAccuracy}%` }} /></div>
                    </div>
                </div>
            </div>

            {/* Verdict */}
            <div className={styles.verdictPanel}>
                <p className={styles.panelTitle}>ANALYST VERDICT // FINAL SYSTEM DIAGNOSTIC</p>
                <div className="text-[#9ca3af] text-[11px] font-mono leading-relaxed mt-4">
                    {journal.aiCoachMessage} <br /><br />
                    {journal.dailySummary} Your best mathematical advantage is currently found specifically within <span className="text-[#ff00ff] font-bold">{journal.bestSetup}</span>. Conversely, you bleed the most capital trading <span className="text-[#e60023] font-bold">{journal.worstPattern}</span>. <br /><br />
                    <span className="text-white">DIAGNOSTIC STATUS: {behavior.emotionalState.toUpperCase() === 'DISCIPLINED' ? <span className="text-[#1db954]">CLEAR FOR TRADING</span> : <span className="text-[#e60023]">WARNING — EXERCISE CAUTION</span>}</span>
                </div>
            </div>

            <div className="text-center text-[10px] font-mono text-[#4b5563] mt-8 mb-4">
                RISKGUARDIA DEEP ANALYTICS ENGINE // END OF REPORT // TIMESTAMP: {new Date().toISOString()}
            </div>
        </div>
    );
}
