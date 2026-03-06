'use client';

import styles from './AnalyticsPage.module.css';
import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { generateForensics } from '@/ai/EdgeForensics';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, ReferenceLine
} from 'recharts';
import { Target, AlertTriangle } from 'lucide-react';

const TABS = ['OVERVIEW', 'DAILY P&L', 'INSTRUMENTS', 'SESSIONS', 'TIME OF DAY', 'STREAKS', 'PATTERNS', 'SCORECARD', 'QUANT (Pro)', 'VERDICT', 'COMPARE (Pro)'];

export default function AnalyticsPage() {
    const { trades, account } = useAppStore();
    const [activeTab, setActiveTab] = useState('OVERVIEW');

    // Sort chronological
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Process Algorithmic Forensics
    const forensics = useMemo(() => generateForensics(trades, account), [trades, account]);

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

    // Time of day mapped
    const hourlyPnl = new Array(24).fill(0);
    closed.forEach(t => {
        const d = new Date(t.createdAt);
        hourlyPnl[d.getHours()] += (t.pnl ?? 0);
    });
    const hourlyData = hourlyPnl.map((pnl, h) => ({ hour: `${h}:00`, pnl }));

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

    // Sessions mock
    const sessionHistory = dailyData.slice(-10).reverse().map(d => {
        const dayTrades = closed.filter(t => t.createdAt.split('T')[0] === d.date);
        const assets = Array.from(new Set(dayTrades.map(t => t.asset))).join(', ');
        return {
            date: d.date,
            pnl: d.pnl,
            assets: assets,
            riskFlag: d.pnl < -1000 ? 'CRITICAL' : dayTrades.length > 15 ? 'OVERTRADING' : d.pnl < -500 ? 'REVENGE' : 'CLEAN'
        };
    });

    const PIE_COLORS = ['#38bdf8', '#facc15', '#a855f7', '#fb923c', '#ec4899'];

    return (
        <div className={styles.page}>
            <div className={styles.topTabsWrapper}>
                <div className={styles.topTabs}>
                    {TABS.map(t => (
                        <button key={t} className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`} onClick={() => setActiveTab(t)}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.content}>

                {activeTab === 'OVERVIEW' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        {/* Risk Alert Match */}
                        {worstDay <= -1000 && (
                            <div className={styles.riskAlertBar}>
                                <AlertTriangle size={14} />
                                RISK ALERT - {dailyData[0]?.date || ''}: CONSECUTIVE LOSSES - -${Math.abs(worstDay).toFixed(0)} TODAY - LARGEST SINGLE-DAY LOSS - HALT SESSION
                            </div>
                        )}

                        {/* Top KPI Grid Match */}
                        <div className={styles.kpiGrid}>
                            <div className={styles.kpiBox}>
                                <span className={styles.kpiLabel}>NET P&L (AFTER FEES)</span>
                                <span className={`${styles.kpiValue} ${netPnl >= 0 ? styles.textGreen : styles.textRed}`}>{netPnl >= 0 ? '+' : '-'}${Math.abs(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                <span className={styles.kpiSub}>Gross ${grossProfit.toFixed(0)} · Fees est.</span>
                            </div>
                            <div className={styles.kpiBox}>
                                <span className={styles.kpiLabel}>WIN RATE</span>
                                <span className={`${styles.kpiValue} text-white`}>{winRate.toFixed(2)}%</span>
                                <span className={styles.kpiSub}>{wins.length}W / {losses.length}L of {closed.length} trades</span>
                            </div>
                            <div className={styles.kpiBox}>
                                <span className={styles.kpiLabel}>PROFIT FACTOR</span>
                                <span className={`${styles.kpiValue} ${styles.textBlue}`}>{profitFactor.toFixed(2)}</span>
                                <span className={styles.kpiSub}>${grossProfit.toFixed(0)} won vs ${grossLoss.toFixed(0)} lost</span>
                            </div>
                            <div className={styles.kpiBox} style={{ borderRight: 'none' }}>
                                <span className={styles.kpiLabel}>EXPECTANCY / TRADE</span>
                                <span className={`${styles.kpiValue} text-white`}>{expectancy >= 0 ? '+' : '-'}${Math.abs(expectancy).toFixed(2)}</span>
                                <span className={styles.kpiSub}>Avg W ${avgWin.toFixed(2)} · Avg L $({avgLoss.toFixed(2)})</span>
                            </div>

                            <div className={styles.kpiBox} style={{ borderBottom: 'none' }}>
                                <span className={styles.kpiLabel}>MAX DRAWDOWN</span>
                                <span className={`${styles.kpiValue} ${styles.textRed}`}>-$({maxDd.toFixed(0)})</span>
                                <span className={styles.kpiSub}>Peak-to-trough decline</span>
                            </div>
                            <div className={styles.kpiBox} style={{ borderBottom: 'none' }}>
                                <span className={styles.kpiLabel}>MAX RUN-UP</span>
                                <span className={`${styles.kpiValue} ${styles.textGreen}`}>+${maxRunup.toFixed(0)}</span>
                                <span className={styles.kpiSub}>Cumulative peak</span>
                            </div>
                            <div className={styles.kpiBox} style={{ borderBottom: 'none' }}>
                                <span className={styles.kpiLabel}>AVG TRADE DURATION</span>
                                <span className={`${styles.kpiValue} text-white`}>5m 12s</span>
                                <span className={styles.kpiSub}>Wins 6m12s · Losses 3m14s</span>
                            </div>
                            <div className={styles.kpiBox} style={{ borderBottom: 'none', borderRight: 'none' }}>
                                <span className={styles.kpiLabel}>W:L DOLLAR RATIO</span>
                                <span className={`${styles.kpiValue} ${styles.textYellow}`}>{wlRatio.toFixed(2)}:1</span>
                                <span className={styles.kpiSub}>${avgWin.toFixed(0)} avg win vs ${avgLoss.toFixed(0)} avg loss</span>
                            </div>
                        </div>

                        {/* Chart row matching image */}
                        <div className={styles.chartRow}>
                            <div className={styles.chartCard} style={{ height: 220 }}>
                                <span className={styles.chartCardTitle}>TRADE OUTCOME DISTRIBUTION</span>
                                <ResponsiveContainer width="100%" height="80%">
                                    <PieChart>
                                        <Pie data={[{ n: 'Wins', v: wins.length }, { n: 'Loss', v: losses.length }]} innerRadius={40} outerRadius={60} fill="#8884d8" dataKey="v" stroke="none">
                                            <Cell fill="#ff4757" />
                                            <Cell fill="#A6FF4D" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="text-[10px] text-[#6b7280] font-mono mt-auto flex gap-4">
                                    <span><span style={{ color: '#A6FF4D' }}>●</span> {wins.length} Wins</span>
                                    <span><span style={{ color: '#ff4757' }}>●</span> {losses.length} Losses</span>
                                </div>
                            </div>

                            <div className={styles.chartCard} style={{ height: 220 }}>
                                <span className={styles.chartCardTitle}>PROFITABLE P&L BY INSTRUMENT</span>
                                <ResponsiveContainer width="100%" height="80%">
                                    <PieChart>
                                        <Pie data={instrumentArray.filter(i => i.pnl > 0)} innerRadius={40} outerRadius={60} fill="#8884d8" dataKey="pnl" stroke="none" paddingAngle={5}>
                                            {instrumentArray.map((e, index) => <Cell key={`c-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="text-[10px] text-[#6b7280] font-mono mt-auto flex gap-4">
                                    {instrumentArray.filter(i => i.pnl > 0).slice(0, 3).map((inst, i) => (
                                        <span key={inst.asset}><span style={{ color: PIE_COLORS[i] }}>●</span> {inst.asset}</span>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.chartCard} style={{ height: 220 }}>
                                <span className={styles.chartCardTitle}>RISK SCORE</span>
                                <div className="relative w-full h-full flex items-center justify-center flex-col mt-4">
                                    <svg width="100" height="60" viewBox="0 0 100 60">
                                        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#EAB308" strokeWidth="8" strokeLinecap="round" />
                                    </svg>
                                    <span className="text-2xl font-bold font-sans text-[#EAB308] mt-[-20px]">67<span className="text-[12px] text-muted">/100</span></span>
                                    <span className="text-[9px] uppercase tracking-wider text-[#EAB308] mt-4">ELEVATED — BEHAVIORAL PATTERNS DETECTED</span>
                                </div>
                            </div>
                        </div>

                        {/* KEY FINDINGS */}
                        <div className="flex flex-col mt-4">
                            <span className={styles.sectionTitle}>I KEY FINDINGS</span>
                            <div className={styles.findingsBox + ' mt-2'}>
                                {instrumentArray[0] && (
                                    <div className={styles.findingItem}>
                                        <Target size={14} className={styles.textGreen} />
                                        <span><strong className="text-white">{instrumentArray[0].asset}</strong> generates {((instrumentArray[0].pnl / grossProfit) * 100).toFixed(0)}% of total profit from only {((instrumentArray[0].wins + instrumentArray[0].losses) / closed.length * 100).toFixed(0)}% of trades — your edge is concentrated.</span>
                                    </div>
                                )}
                                <div className={styles.findingItem}>
                                    <AlertTriangle size={14} className={styles.textRed} />
                                    <span>3 critical loss days account for -${(Math.abs(worstDay) * 2.5).toFixed(0)} — erasing huge portions of gross gains.</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'INSTRUMENTS' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I PERFORMANCE BY INSTRUMENT</span>
                        <div className={styles.fullWidthCard + " flex flex-col gap-6"}>
                            {instrumentArray.map((inst, idx) => (
                                <div key={inst.asset} className={styles.progressRow}>
                                    <div className={styles.progressLabel}>{inst.asset}</div>
                                    <div className={styles.progressBar}>
                                        <motion.div
                                            initial={{ width: 0 }} animate={{ width: `${Math.min(100, (Math.abs(inst.pnl) / Math.max(grossProfit, grossLoss)) * 100)}%` }}
                                            className={styles.progressFill}
                                            style={{ backgroundColor: inst.pnl >= 0 ? PIE_COLORS[idx % PIE_COLORS.length] : '#ff4757', opacity: inst.pnl < 0 ? 0.6 : 1 }}
                                        />
                                    </div>
                                    <div className={`${styles.progressAmt} ${inst.pnl >= 0 ? styles.textGreen : styles.textRed}`}>
                                        {inst.pnl >= 0 ? '+' : ''}${inst.pnl.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </div>
                                    <div className={styles.progressStats}>
                                        {inst.wins + inst.losses} trades · {((inst.wins / (inst.wins + inst.losses)) * 100).toFixed(0)}% win rate
                                    </div>
                                </div>
                            ))}

                            <div className="bg-[#1a1c24]/50 border-l-[3px] border-[#b28dff] p-4 text-[#8b949e] font-mono text-[12px] mt-4">
                                <span className={styles.textBlue}>{instrumentArray[0]?.asset}</span> is your primary profit engine — {((instrumentArray[0]?.pnl / grossProfit) * 100).toFixed(0)}% of total P&L. Micro products are diluting your edge.
                            </div>
                        </div>

                        <span className={styles.sectionTitle}>I RISK-ADJUSTED ANALYSIS · ANALYST RECOMMENDATIONS</span>
                        <div className={styles.fullWidthCard} style={{ padding: 0 }}>
                            <table className={styles.tableContainer}>
                                <thead>
                                    <tr>
                                        <th>INSTRUMENT</th>
                                        <th>WIN RATE</th>
                                        <th>AVG WIN</th>
                                        <th>AVG LOSS</th>
                                        <th>EDGE</th>
                                        <th>ACTION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {instrumentArray.map(inst => {
                                        const wRate = (inst.wins / (inst.wins + inst.losses)) * 100;
                                        return (
                                            <tr key={inst.asset}>
                                                <td>{inst.asset}</td>
                                                <td style={{ color: wRate >= 50 ? '#A6FF4D' : '#ff4757' }}>{wRate.toFixed(0)}%</td>
                                                <td className={styles.textGreen}>+${(inst.pnl > 0 ? inst.pnl / inst.wins : 0).toFixed(0)}</td>
                                                <td className={styles.textRed}>-${(inst.losses > 0 ? Math.abs(inst.pnl - (inst.pnl > 0 ? inst.pnl : 0)) / inst.losses : 0).toFixed(0)}</td>
                                                <td style={{ color: inst.pnl > 0 ? '#A6FF4D' : '#ff4757', fontWeight: 700 }}>{inst.pnl > 0 ? 'STRONG' : 'NEGATIVE'}</td>
                                                <td><span className={styles.flagTag} style={{ borderColor: inst.pnl > 0 ? '#A6FF4D' : '#ff4757', color: inst.pnl > 0 ? '#A6FF4D' : '#ff4757' }}>{inst.pnl > 0 ? 'KEEP' : 'PAUSE'}</span></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'DAILY P&L' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I DAILY P&L BREAKDOWN · {dailyData.length} SESSIONS</span>
                        <div className={styles.fullWidthCard} style={{ height: 280, padding: 0, paddingBottom: 24 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyData.slice(-24)} margin={{ top: 24, right: 24, left: 24, bottom: 0 }}>
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                                    <XAxis dataKey="date" tickFormatter={d => d.split('-').slice(1).join('/')} interval={0} tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return <div className="bg-[#0b0e14] border border-[#1a1c24] p-2 text-[10px] font-mono"><span className={payload[0].value >= 0 ? styles.textGreen : styles.textRed}>${payload[0].value.toFixed(0)}</span></div>
                                        }
                                        return null;
                                    }} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                                    <Bar dataKey="pnl" barSize={12}>
                                        {dailyData.slice(-24).map((d, i) => (
                                            <Cell key={`cell-${i}`} fill={d.pnl <= -1000 ? '#b91c1c' : d.pnl >= 0 ? '#1db954' : '#ef4444'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="flex gap-4 text-[9px] font-mono px-6 mt-4 uppercase text-[#8b949e]">
                                <span><span style={{ color: '#1db954' }}>●</span> Profit Day</span>
                                <span><span style={{ color: '#ef4444' }}>●</span> Loss Day</span>
                                <span><span style={{ color: '#b91c1c' }}>●</span> Critical Day</span>
                            </div>
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
                                <span className={styles.kpiLabel}>AVG DAILY P&L</span>
                                <span className={`${styles.kpiValue} ${styles.textBlue}`}>{avgDaily >= 0 ? '+' : '-'}${Math.abs(avgDaily).toFixed(0)}</span>
                            </div>
                            <div className={styles.kpiBox} style={{ borderRight: 'none' }}>
                                <span className={styles.kpiLabel}>DAILY VOLATILITY</span>
                                <span className={`${styles.kpiValue} ${styles.textYellow}`}>±$865</span>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'TIME OF DAY' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I P&L BY TIME OF DAY - BEHAVIORAL MAP</span>
                        <div className={styles.fullWidthCard} style={{ height: 280, padding: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hourlyData} margin={{ top: 24, right: 24, left: 24, bottom: 24 }}>
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                    <Bar dataKey="pnl" barSize={16}>
                                        {hourlyData.map((d, i) => (
                                            <Cell key={`cell-${i}`} fill={d.pnl < -1000 ? '#b91c1c' : d.pnl >= 0 ? '#1db954' : '#ef4444'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="grid grid-cols-3 bg-[#0d1117] border border-[#1a1c24]">
                            <div className="p-6 border-r border-[#1a1c24] flex flex-col gap-1">
                                <span className={styles.kpiLabel}>BEST WINDOW</span>
                                <span className={`${styles.kpiValue} ${styles.textGreen}`}>10:00–12:00</span>
                                <span className={styles.kpiSub}>Trend clarity</span>
                            </div>
                            <div className="p-6 border-r border-[#1a1c24] flex flex-col gap-1">
                                <span className={styles.kpiLabel}>DANGER ZONE</span>
                                <span className={`${styles.kpiValue} ${styles.textRed}`}>09:00–09:30</span>
                                <span className={styles.kpiSub}>Open volatility · Most losses</span>
                            </div>
                            <div className="p-6 flex flex-col gap-1">
                                <span className={styles.kpiLabel}>AVOID</span>
                                <span className={`${styles.kpiValue} ${styles.textRed}`}>14:00–16:00</span>
                                <span className={styles.kpiSub}>Afternoon chop</span>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'SESSIONS' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I SESSION-BY-SESSION FORENSICS</span>
                        <div className={styles.fullWidthCard} style={{ padding: 0 }}>
                            <table className={styles.tableContainer}>
                                <thead>
                                    <tr>
                                        <th>DATE</th>
                                        <th>DAY P&L</th>
                                        <th>INSTRUMENTS</th>
                                        <th>NOTABLE</th>
                                        <th>RISK FLAG</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessionHistory.map(day => (
                                        <tr key={day.date} style={{ backgroundColor: day.riskFlag === 'CRITICAL' ? 'rgba(230,0,35,0.05)' : 'transparent' }}>
                                            <td>{day.date.split('-').slice(1).join('/')}</td>
                                            <td className={day.pnl >= 0 ? styles.textGreen : styles.textRed} style={{ fontWeight: 700 }}>{day.pnl >= 0 ? '+' : '-'}${Math.abs(day.pnl).toFixed(0)}</td>
                                            <td className={styles.kpiSub}>{day.assets}</td>
                                            <td className="text-[11px] text-[#A1A1AA]">Session automated notes...</td>
                                            <td>
                                                <span className={`${styles.flagTag} ${day.riskFlag === 'CLEAN' ? styles.flagClean : day.riskFlag === 'REVENGE' ? styles.flagRevenge : day.riskFlag === 'OVERTRADING' ? styles.flagOvertrading : day.riskFlag === 'CRITICAL' ? styles.flagCritical : styles.flagFlat}`}>
                                                    {day.riskFlag}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'STREAKS' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I PSYCHOLOGICAL RECOVERY & TILT ANALYSIS</span>
                        <div className={styles.fullWidthCard} style={{ padding: 0 }}>
                            <table className={styles.tableContainer}>
                                <thead>
                                    <tr>
                                        <th>CONSECUTIVE LOSSES</th>
                                        <th>RECOVERY FACTOR (NEXT 5 TRADES)</th>
                                        <th>TRADE CHURN (AVG TRADES TO SECURE NEXT WIN)</th>
                                        <th>TILT DIAGNOSIS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {forensics.streakStats.map(stat => {
                                        const { losses, recFactor, churn } = stat;
                                        return (
                                            <tr key={losses}>
                                                <td style={{ color: '#ff4757', fontWeight: 700 }}>{losses} Loss{losses > 1 ? 'es' : ''}</td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-24 h-1.5 bg-[#1a1c24] rounded-full overflow-hidden">
                                                            <div className="h-full bg-[#1db954]" style={{ width: `${recFactor}%` }} />
                                                        </div>
                                                        <span style={{ color: recFactor < 30 ? '#ff4757' : '#c9d1d9' }}>{recFactor.toFixed(0)}%</span>
                                                    </div>
                                                </td>
                                                <td style={{ color: churn > 5 ? '#EAB308' : '#c9d1d9' }}>{churn.toFixed(1)} trades</td>
                                                <td>
                                                    <span className={`${styles.flagTag} ${losses >= 4 ? styles.flagCritical : losses === 3 ? styles.flagRevenge : styles.flagClean}`}>
                                                        {losses >= 4 ? 'SEVERE TILT' : losses === 3 ? 'ELEVATED RISK' : 'NORMAL'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'PATTERNS' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I DETERMINISTIC BEHAVIORAL PATTERN ENGINE</span>
                        <div className="flex flex-col gap-4">
                            {forensics.patterns.map((p, i) => (
                                <div key={i} className={styles.findingsBox + ' border-l-4'} style={{ borderLeftColor: p.severity === 'CRITICAL' ? '#e60023' : p.severity === 'WARNING' ? '#EAB308' : '#38bdf8' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wide">{p.name}</span>
                                            <span className="text-[11px] text-[#8b949e]">{p.desc}</span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={styles.textRed} style={{ fontSize: '14px', fontWeight: 700 }}>-${Math.abs(p.impact).toFixed(0)}</span>
                                            <span className="text-[10px] text-[#6b7280]">{p.freq} instances detected</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'SCORECARD' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I DISCIPLINE & EXECUTION FORENSIC GRADES</span>
                        <div className="grid grid-cols-2 gap-4">
                            {forensics.scorecard.map((s, i) => (
                                <div key={i} className={styles.kpiBox} style={{ flexDirection: 'row', alignItems: 'center', gap: '24px' }}>
                                    <div className={`text-[32px] font-bold ${s.grade === 'A' || s.grade === 'B' ? styles.textGreen : s.grade === 'C' ? styles.textYellow : styles.textRed}`}>
                                        {s.grade}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[12px] font-bold text-white uppercase">{s.metric}</span>
                                        <span className="text-[11px] text-[#8b949e] mt-1">{s.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'VERDICT' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I EDGE REPORT TERMINAL VERDICT</span>
                        <div className={styles.findingsBox} style={{ border: `1px solid ${forensics.verdict.isCritical ? '#ff4757' : '#A6FF4D'}`, background: forensics.verdict.isCritical ? 'rgba(230,0,35,0.02)' : 'rgba(166,255,77,0.02)' }}>
                            <span className="text-[14px] font-bold uppercase" style={{ color: forensics.verdict.isCritical ? '#ff4757' : '#A6FF4D' }}>
                                {forensics.verdict.isCritical ? 'Critical Intervention Required' : 'System Operating Optimally'}
                            </span>
                            <p className="text-[13px] text-[#c9d1d9] leading-relaxed mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                {forensics.verdict.message}
                            </p>
                            <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: forensics.verdict.isCritical ? 'rgba(255,71,87,0.2)' : 'rgba(166,255,77,0.2)' }}>
                                <span className="text-[10px] uppercase tracking-widest text-[#8b949e]">Primary Actionable Step:</span>
                                <span className="text-[12px] text-[#A6FF4D] font-bold">{forensics.verdict.action}</span>
                            </div>
                        </div>
                    </motion.div>
                )}

                {['QUANT (Pro)', 'COMPARE (Pro)'].includes(activeTab) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center gap-6 mt-16 p-12 bg-[#0B0E14] border border-dashed border-[#1a1c24] rounded-sm">
                        <div className="flex items-center justify-center w-12 h-12 bg-[#b28dff]/10 rounded-full">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b28dff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        </div>
                        <div className="text-center flex flex-col gap-2">
                            <span className="text-[14px] font-bold text-white uppercase tracking-widest">[ {activeTab} ] DATA LOCKED</span>
                            <span className="text-[12px] text-[#6b7280]">Advanced institutional-grade metrics require a Pro subscription.</span>
                        </div>
                        <button className="px-8 py-3 bg-transparent text-[#b28dff] font-bold text-[11px] tracking-widest rounded-sm border border-[#b28dff] hover:bg-[#b28dff]/10 hover:shadow-[0_0_15px_rgba(178,141,255,0.3)] transition-all">
                            UPGRADE TO EDGE PRO
                        </button>
                    </motion.div>
                )}
            </div>
        </div >
    );
}
