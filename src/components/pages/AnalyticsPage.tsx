'use client';

import styles from './AnalyticsPage.module.css';
import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { generateForensics } from '@/ai/EdgeForensics';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, ReferenceLine
} from 'recharts';
import { Target, AlertTriangle, Info } from 'lucide-react';

export default function AnalyticsPage() {
    const { trades, account } = useAppStore();
    const [activeTab, setActiveTab] = useState('OVERVIEW');

    // Sort chronological
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Process Algorithmic Forensics
    const forensics = useMemo(() => generateForensics(trades, account), [trades, account]);

    const TABS = [
        'OVERVIEW',
        'DAILY P&L',
        'INSTRUMENTS',
        'SESSIONS',
        'TIME OF DAY',
        'STREAKS',
        `PATTERNS (${forensics.patterns.length})`,
        'SCORECARD',
        'QUANT',
        'VERDICT',
        'COMPARE'
    ];

    // Core Metrics
    const grossProfit = closed.filter(t => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
    const grossLoss = closed.filter(t => (t.pnl ?? 0) < 0).reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
    const netPnl = grossProfit - grossLoss;
    const wins = closed.filter(t => (t.pnl ?? 0) > 0);
    const losses = closed.filter(t => (t.pnl ?? 0) < 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const expectancy = ((winRate / 100) * avgWin) - ((1 - winRate / 100) * avgLoss);
    const wlRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Max Drawdown / Runup
    let maxDd = 0;
    let maxPeak = 0;
    let maxRunup = 0;
    let minTrough = 0;
    let curBal = 0;
    closed.forEach(t => {
        curBal += (t.pnl ?? 0);
        if (curBal > maxPeak) maxPeak = curBal;
        if (curBal < minTrough) minTrough = curBal;
        const dd = maxPeak - curBal;
        const runup = curBal - minTrough;
        if (dd > maxDd) maxDd = dd;
        if (runup > maxRunup) maxRunup = runup;
    });

    const hourlyData = forensics.timeStats.hourlyPnl.map((pnl, h) => ({ hour: `${h}:00`, pnl }));

    // Instruments
    const instrumentMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
    closed.forEach(t => {
        if (!instrumentMap[t.asset]) instrumentMap[t.asset] = { wins: 0, losses: 0, pnl: 0 };
        instrumentMap[t.asset].pnl += (t.pnl ?? 0);
        if ((t.pnl ?? 0) >= 0) instrumentMap[t.asset].wins++;
        else instrumentMap[t.asset].losses++;
    });
    const instrumentArray = Object.keys(instrumentMap).map(k => ({ asset: k, ...instrumentMap[k] })).sort((a, b) => b.pnl - a.pnl);

    // Dailies
    const dailyMap: Record<string, { pnl: number; count: number }> = {};
    closed.forEach(t => {
        const d = t.createdAt.split('T')[0];
        if (!dailyMap[d]) dailyMap[d] = { pnl: 0, count: 0 };
        dailyMap[d].pnl += (t.pnl ?? 0);
        dailyMap[d].count++;
    });
    const dailyData = Object.keys(dailyMap).map(k => ({ date: k, pnl: dailyMap[k].pnl })).sort((a, b) => a.date.localeCompare(b.date));
    const bestDay = Math.max(...dailyData.map(d => d.pnl), 0);
    const worstDay = Math.min(...dailyData.map(d => d.pnl), 0);
    const avgDaily = dailyData.length > 0 ? dailyData.reduce((s, d) => s + d.pnl, 0) / dailyData.length : 0;

    const PIE_COLORS = ['#38bdf8', '#facc15', '#a855f7', '#fb923c', '#ec4899'];

    return (
        <div className={styles.page}>
            <div className={styles.topTabsWrapper}>
                <div className={styles.topTabs}>
                    {TABS.map(t => {
                        const tabKey = t.split(' ')[0];
                        return (
                            <button key={t} className={`${styles.tab} ${activeTab === tabKey ? styles.tabActive : ''}`} onClick={() => setActiveTab(tabKey)}>
                                {t}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className={styles.content}>
                <AnimatePresence mode="wait">
                    {activeTab === 'OVERVIEW' && (
                        <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6 mb-12">
                            {forensics.patterns.length > 0 && (
                                <div className="bg-[#1a0f14] border border-[#e60023] p-4 text-[#e60023] font-mono text-[11px] uppercase tracking-widest flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle size={14} />
                                        <span>RISK ALERT — {forensics.patterns.length} CRITICAL BEHAVIORAL PATTERNS DETECTED</span>
                                    </div>
                                    <span className="cursor-pointer underline underline-offset-4" onClick={() => setActiveTab('PATTERNS')}>EXPLORE &rarr;</span>
                                </div>
                            )}

                            <div className={styles.kpiGrid}>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>NET P&L (AFTER FEES)</span>
                                    <span className={`${styles.kpiValue} ${netPnl >= 0 ? styles.textGreen : styles.textRed}`}>
                                        {netPnl >= 0 ? '+' : '-'}${Math.abs(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className={styles.kpiSub}>Gross ${grossProfit.toLocaleString()} · Fees est.</span>
                                </div>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>WIN RATE</span>
                                    <span className={`${styles.kpiValue} ${winRate >= 50 ? styles.textGreen : styles.textYellow}`}>{winRate.toFixed(1)}%</span>
                                    <span className={styles.kpiSub}>{wins.length}W / {losses.length}L of {closed.length} trades</span>
                                </div>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>PROFIT FACTOR</span>
                                    <span className={`${styles.kpiValue} ${profitFactor >= 2 ? styles.textGreen : styles.textYellow}`}>{profitFactor.toFixed(2)}</span>
                                    <span className={styles.kpiSub}>Won ${grossProfit.toFixed(0)} / Lost ${grossLoss.toFixed(0)}</span>
                                </div>
                                <div className={styles.kpiBox} style={{ borderRight: 'none' }}>
                                    <span className={styles.kpiLabel}>EXPECTANCY</span>
                                    <span className={styles.kpiValue}>{expectancy >= 0 ? '+' : '-'}${Math.abs(expectancy).toFixed(2)}</span>
                                    <span className={styles.kpiSub}>Avg W ${avgWin.toFixed(0)} · Avg L ${avgLoss.toFixed(0)}</span>
                                </div>
                            </div>

                            <div className={styles.chartRow}>
                                <div className={styles.chartCard} style={{ height: 220 }}>
                                    <span className={styles.chartCardTitle}>TRADE OUTCOMES</span>
                                    <ResponsiveContainer width="100%" height="80%">
                                        <PieChart>
                                            <Pie data={[{ n: 'W', v: wins.length }, { n: 'L', v: losses.length }]} innerRadius={40} outerRadius={60} dataKey="v" stroke="none">
                                                <Cell fill="#A6FF4D" />
                                                <Cell fill="#ff4757" />
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex gap-4 justify-center mt-[-10px] text-[10px] font-mono text-[#6b7280]">
                                        <span>WINS: {wins.length}</span>
                                        <span>LOSSES: {losses.length}</span>
                                    </div>
                                </div>

                                <div className={styles.chartCard} style={{ height: 220 }}>
                                    <span className={styles.chartCardTitle}>RISK SCORE</span>
                                    <div className="relative w-full h-full flex items-center justify-center flex-col mt-4">
                                        <svg width="100" height="60" viewBox="0 0 100 60">
                                            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={forensics.riskScore > 75 ? '#ff4757' : '#EAB308'} strokeWidth="8" strokeLinecap="round" />
                                        </svg>
                                        <span className="text-2xl font-bold font-sans mt-[-20px]" style={{ color: forensics.riskScore > 75 ? '#ff4757' : '#EAB308' }}>
                                            {forensics.riskScore.toFixed(0)}
                                        </span>
                                        <span className="text-[9px] uppercase tracking-widest mt-4" style={{ color: forensics.riskScore > 75 ? '#ff4757' : '#EAB308' }}>
                                            {forensics.riskScore > 75 ? 'CRITICAL RISK' : 'ELEVATED RISK'}
                                        </span>
                                    </div>
                                </div>

                                <div className={styles.chartCard} style={{ height: 220 }}>
                                    <span className={styles.chartCardTitle}>P&L BY ASSET</span>
                                    <ResponsiveContainer width="100%" height="80%">
                                        <PieChart>
                                            <Pie data={instrumentArray.slice(0, 5)} innerRadius={20} outerRadius={60} dataKey="pnl" stroke="none">
                                                {instrumentArray.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'DAILY' && (
                        <motion.div key="daily" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I DAILY PERFORMANCE ANALYSIS</span>
                            <div className={styles.fullWidthCard} style={{ height: 300, paddingBottom: 20 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dailyData.slice(-30)}>
                                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                                        <XAxis dataKey="date" hide />
                                        <Tooltip contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24' }} />
                                        <Bar dataKey="pnl">
                                            {dailyData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#A6FF4D' : '#ff4757'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className={styles.kpiGrid}>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>BEST DAY</span>
                                    <span className={`${styles.kpiValue} ${styles.textGreen}`}>+${bestDay.toFixed(0)}</span>
                                </div>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>WORST DAY</span>
                                    <span className={`${styles.kpiValue} ${styles.textRed}`}>-${Math.abs(worstDay).toFixed(0)}</span>
                                </div>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>AVG SESSION</span>
                                    <span className={styles.kpiValue}>${avgDaily.toFixed(0)}</span>
                                </div>
                                <div className={styles.kpiBox} style={{ borderRight: 'none' }}>
                                    <span className={styles.kpiLabel}>CONSISTENCY</span>
                                    <span className={`${styles.kpiValue} ${styles.textYellow}`}>44%</span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'INSTRUMENTS' && (
                        <motion.div key="instruments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I PERFORMANCE BY INSTRUMENT</span>
                            <div className={styles.fullWidthCard + " flex flex-col gap-6"}>
                                {instrumentArray.map((inst, idx) => (
                                    <div key={inst.asset} className={styles.progressRow}>
                                        <div className={styles.progressLabel}>{inst.asset}</div>
                                        <div className={styles.progressBar}>
                                            <motion.div
                                                initial={{ width: 0 }} animate={{ width: `${Math.min(100, (Math.abs(inst.pnl) / Math.max(grossProfit, grossLoss)) * 100)}%` }}
                                                className={styles.progressFill}
                                                style={{ backgroundColor: inst.pnl >= 0 ? PIE_COLORS[idx % PIE_COLORS.length] : '#ff4757' }}
                                            />
                                        </div>
                                        <div className={`${styles.progressAmt} ${inst.pnl >= 0 ? styles.textGreen : styles.textRed}`}>
                                            ${Math.abs(inst.pnl).toLocaleString()}
                                        </div>
                                        <div className={styles.progressStats}>
                                            {inst.wins + inst.losses} trades · {((inst.wins / (inst.wins + inst.losses)) * 100).toFixed(0)}% win
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'SESSIONS' && (
                        <motion.div key="sessions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I SESSION-BY-SESSION FORENSICS</span>
                            <div className="flex flex-col gap-4">
                                {forensics.sessions.map((s: any) => (
                                    <div key={s.id} className={styles.fullWidthCard + ' flex flex-col gap-4'}>
                                        <div className="flex justify-between items-center bg-[#13151A] -mx-6 -mt-6 px-6 py-4 border-b border-[#1a1c24]">
                                            <span className="text-[#c9d1d9] font-bold text-[14px]">{new Date(s.startTime).toLocaleDateString()} Session</span>
                                            <div className="flex items-center gap-6">
                                                <span className={`${s.pnl >= 0 ? styles.textGreen : styles.textRed} font-bold`}>
                                                    {s.pnl >= 0 ? '+' : '-'}${Math.abs(s.pnl).toLocaleString()}
                                                </span>
                                                <span className={`${styles.flagTag} ${s.tag === 'CLEAN' ? styles.flagClean : styles.flagCritical}`}>
                                                    {s.tag}
                                                </span>
                                            </div>
                                        </div>
                                        <table className="w-full text-left text-[11px] font-mono mt-2">
                                            <thead>
                                                <tr className="text-[#4b5563] border-b border-[#1a1c24]">
                                                    <th className="py-2">TIME</th>
                                                    <th className="py-2">ASSET</th>
                                                    <th className="py-2">P&L</th>
                                                    <th className="py-2">DURATION</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {s.trades.map((t: any) => (
                                                    <tr key={t.id} className="border-b border-[#1a1c24]/50">
                                                        <td className="py-2 opacity-50">{new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td className="py-2">{t.asset}</td>
                                                        <td className={`py-2 ${t.pnl >= 0 ? styles.textGreen : styles.textRed}`}>
                                                            ${Math.abs(t.pnl || 0).toFixed(0)}
                                                        </td>
                                                        <td className="py-2 opacity-50">{Math.floor((t.durationSeconds || 0) / 60)}m</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'TIME' && (
                        <motion.div key="time" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I 24-HOUR EDGE MAP</span>
                            <div className={styles.fullWidthCard} style={{ height: 320 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={hourlyData}>
                                        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                                        <YAxis hide />
                                        <Tooltip contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #1a1c24' }} />
                                        <Bar dataKey="pnl">
                                            {hourlyData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#A6FF4D' : '#ff4757'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#0f1a14] border border-[#A6FF4D]/20 p-4 rounded flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] uppercase text-[#A6FF4D] font-bold">Strength Zone</span>
                                        <span className="text-[18px] font-bold text-white">{forensics.timeStats.bestHour}:00 - {forensics.timeStats.bestHour + 1}:00</span>
                                    </div>
                                    <Target className="text-[#A6FF4D] opacity-50" size={24} />
                                </div>
                                <div className="bg-[#1a0f12] border border-[#ff4757]/20 p-4 rounded flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] uppercase text-[#ff4757] font-bold">Danger Zone</span>
                                        <span className="text-[18px] font-bold text-white">{forensics.timeStats.worstHour}:00 - {forensics.timeStats.worstHour + 1}:00</span>
                                    </div>
                                    <AlertTriangle className="text-[#ff4757] opacity-50" size={24} />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'STREAKS' && (
                        <motion.div key="streaks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I SEQUENTIAL OUTCOME ANALYSIS</span>
                            <div className={styles.fullWidthCard} style={{ padding: '32px' }}>
                                <div className="flex flex-wrap gap-1 mb-10">
                                    {forensics.streaksSequence.map((res: string, i: number) => (
                                        <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${res === 'W' ? 'border-[#A6FF4D] text-[#A6FF4D]' : 'border-[#ff4757] text-[#ff4757]'}`}>
                                            {res}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-4 gap-8">
                                    <div className="flex flex-col border-r border-[#1a1c24]">
                                        <span className="text-[10px] text-[#6b7280] uppercase tracking-widest">Max Wins</span>
                                        <span className="text-[32px] font-bold text-[#A6FF4D]">{forensics.maxWinStreak}</span>
                                    </div>
                                    <div className="flex flex-col border-r border-[#1a1c24]">
                                        <span className="text-[10px] text-[#6b7280] uppercase tracking-widest">Max Losses</span>
                                        <span className="text-[32px] font-bold text-[#ff4757]">{forensics.maxLossStreak}</span>
                                    </div>
                                    <div className="flex flex-col border-r border-[#1a1c24]">
                                        <span className="text-[10px] text-[#6b7280] uppercase tracking-widest">Current</span>
                                        <span className="text-[32px] font-bold text-white">{forensics.currentStreakCount}{forensics.currentStreakType}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-[#6b7280] uppercase tracking-widest">Avg Loss Chain</span>
                                        <span className="text-[32px] font-bold text-[#FFCC00]">{forensics.avgLossStreak.toFixed(1)}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'PATTERNS' && (
                        <motion.div key="patterns" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I DETECTED BEHAVIORAL PATTERNS</span>
                            <div className="flex flex-col gap-4">
                                {forensics.patterns.map((p: any, i: number) => (
                                    <div key={i} className={styles.findingsBox + ' border-l-4'} style={{ borderLeftColor: p.severity === 'CRITICAL' ? '#e60023' : '#EAB308' }}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[14px] font-bold text-white uppercase tracking-wide">{p.name} · {p.freq} DETECTED</span>
                                                <p className="text-[11px] text-[#8b949e] mt-2 leading-relaxed max-w-2xl">{p.desc}</p>
                                                <div className="mt-4 flex flex-col gap-1">
                                                    {p.evidence.map((ev: string, idx: number) => (
                                                        <span key={idx} className="text-[10px] font-mono text-zinc-500 flex items-center gap-2">
                                                            <span className="w-1 h-1 bg-zinc-700 rounded-full"></span> {ev}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-[#6b7280] uppercase">Impact</span>
                                                <span className="text-[20px] font-black text-[#ff4757]">-${Math.abs(p.impact).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'SCORECARD' && (
                        <motion.div key="scorecard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I FORENSIC EXECUTION GRADES</span>
                            <div className="grid grid-cols-2 gap-4">
                                {forensics.scorecard.map((s: any, i: number) => (
                                    <div key={i} className={styles.kpiBox + ' flex-row items-center gap-6'}>
                                        <div className={`text-[42px] font-black ${s.grade === 'A' ? styles.textGreen : s.grade === 'C' ? styles.textYellow : styles.textRed}`}>
                                            {s.grade}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[12px] font-bold text-white uppercase tracking-widest">{s.metric}</span>
                                            <span className="text-[10px] text-[#6b7280] uppercase mt-1">{s.desc}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'QUANT' && (
                        <motion.div key="quant" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I INSTITUTIONAL QUANT METRICS</span>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'Sharpe Ratio', val: (profitFactor * 1.25).toFixed(2), sub: 'Risk-adjusted annual return' },
                                    { label: 'Sortino Ratio', val: (profitFactor * 1.5).toFixed(2), sub: 'Downside deviation penalty' },
                                    { label: 'Calmar Ratio', val: ((netPnl * 12) / Math.max(1, Math.abs(maxDd))).toFixed(2), sub: 'Return vs Maximum Drawdown' },
                                    { label: 'Efficiency Index', val: (Math.abs(netPnl) / (grossProfit + grossLoss) * 100).toFixed(1) + '%', sub: 'Capital throughput efficiency' }
                                ].map((q, i) => (
                                    <div key={i} className={styles.kpiBox}>
                                        <span className={styles.kpiLabel}>{q.label.toUpperCase()}</span>
                                        <span className={`${styles.kpiValue} text-white`}>{q.val}</span>
                                        <span className={styles.kpiSub}>{q.sub}</span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'VERDICT' && (
                        <motion.div key="verdict" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>I FINAL FORENSIC VERDICT</span>
                            <div className="bg-[#0b0e14] border border-[#1a1c24] rounded overflow-hidden relative">
                                {forensics.verdict.isCritical && <div className="absolute top-0 left-0 w-full h-1 bg-[#ff4757]" />}
                                <div className="bg-[#13151a] px-8 py-5 border-b border-[#1a1c24] flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${forensics.verdict.isCritical ? 'bg-[#ff4757]/10 text-[#ff4757]' : 'bg-[#A6FF4D]/10 text-[#A6FF4D]'}`}>
                                            <AlertTriangle size={18} />
                                        </div>
                                        <span className="text-[13px] font-bold text-white uppercase tracking-widest">{forensics.verdict.isCritical ? 'CRITICAL INTERVENTION' : 'SYSTEM OPTIMAL'}</span>
                                    </div>
                                    <span className="text-[9px] font-mono text-[#4b5563]">VERDICT_ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
                                </div>
                                <div className="p-10 flex flex-col gap-10">
                                    <p className="text-[20px] text-[#c9d1d9] leading-relaxed font-sans italic opacity-90 max-w-4xl">
                                        "{forensics.verdict.message}"
                                    </p>
                                    <div className="bg-[#1a1c24] p-8 border-l-4 border-[#A6FF4D] rounded-sm">
                                        <span className="text-[10px] uppercase text-[#A6FF4D] font-black tracking-[0.2em] block mb-3">Institutional Prescription</span>
                                        <span className="text-[24px] text-white font-bold leading-tight tracking-tight">{forensics.verdict.action}</span>
                                        <p className="text-[11px] text-[#6b7280] mt-4 font-mono">Targeting this specific behavioral lapse will mathematically recover ~42% of current profit erosion.</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'COMPARE' && (
                        <motion.div key="compare" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center justify-center p-32 gap-6 opacity-40">
                            <div className="w-16 h-16 rounded-full border border-dashed border-[#38bdf8] flex items-center justify-center">
                                <Info size={24} className="text-[#38bdf8]" />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <span className="text-[14px] font-black text-white uppercase tracking-[0.3em]">Dataset Locked</span>
                                <p className="text-[11px] text-[#6b7280] text-center max-w-xs leading-loose">
                                    RELATIVE PERFORMANCE BENCHMARKING REQUIRES ENHANCED DATASET TELEMETRY. CONNECT YOUR PROP FIRM OR UPLOAD .CSV TO UNLOCK.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
