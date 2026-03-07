'use client';

import styles from './AnalyticsPage.module.css';
import { useState, useMemo } from 'react';
import { useAppStore, getTradingDay } from '@/store/appStore';
import { generateForensics } from '@/ai/EdgeForensics';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, ReferenceLine
} from 'recharts';
import { Target, AlertTriangle, Download, Link2, Check, Info } from 'lucide-react';

export default function AnalyticsPage() {
    const { trades, account } = useAppStore();
    const [activeTab, setActiveTab] = useState('OVERVIEW');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [copied, setCopied] = useState(false);

    // Sort chronological + apply date range filter
    const closed = useMemo(() => {
        return trades
            .filter(t => t.outcome === 'win' || t.outcome === 'loss')
            .filter(t => {
                const d = t.createdAt.split('T')[0];
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
                return true;
            })
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [trades, dateFrom, dateTo]);

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

    // Dailies — use closedAt with 5 PM EST rollover (Tradeify trading day convention)
    const dailyMap: Record<string, { pnl: number; count: number }> = {};
    closed.forEach(t => {
        const d = getTradingDay(t.closedAt ?? t.createdAt);
        if (!dailyMap[d]) dailyMap[d] = { pnl: 0, count: 0 };
        dailyMap[d].pnl += (t.pnl ?? 0);
        dailyMap[d].count++;
    });
    const dailyData = Object.keys(dailyMap).map(k => ({ date: k, pnl: dailyMap[k].pnl })).sort((a, b) => a.date.localeCompare(b.date));
    const bestDay = Math.max(...dailyData.map(d => d.pnl), 0);
    const worstDay = Math.min(...dailyData.map(d => d.pnl), 0);
    const avgDaily = dailyData.length > 0 ? dailyData.reduce((s, d) => s + d.pnl, 0) / dailyData.length : 0;
    const bestDayDate = dailyData.reduce((a, b) => b.pnl > a.pnl ? b : a, { date: '', pnl: -Infinity }).date;
    const worstDayDate = dailyData.reduce((a, b) => b.pnl < a.pnl ? b : a, { date: '', pnl: Infinity }).date;

    // Median daily P&L
    const medianDaily = (() => {
        if (dailyData.length === 0) return 0;
        const sorted = [...dailyData].map(d => d.pnl).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    })();

    // Daily volatility — standard deviation of daily P&L
    const dailyVolatility = (() => {
        if (dailyData.length < 2) return 0;
        const variance = dailyData.reduce((s, d) => s + Math.pow(d.pnl - avgDaily, 2), 0) / dailyData.length;
        return Math.sqrt(variance);
    })();
    const daysWithin1Std = dailyData.length > 0 && dailyVolatility > 0
        ? Math.round((dailyData.filter(d => Math.abs(d.pnl - avgDaily) <= dailyVolatility).length / dailyData.length) * 100)
        : 0;

    // Weekly breakdown — groups trading days into Mon–Sun calendar weeks
    const weeklyBreakdown = (() => {
        const weekMap: Record<string, { trades: typeof closed; days: Set<string> }> = {};
        closed.forEach(t => {
            const day = getTradingDay(t.closedAt ?? t.createdAt);
            const dt = new Date(day + 'T12:00:00Z');
            const dow = dt.getUTCDay();
            const offset = dow === 0 ? -6 : 1 - dow;
            const mon = new Date(dt);
            mon.setUTCDate(dt.getUTCDate() + offset);
            const weekKey = mon.toISOString().slice(0, 10);
            if (!weekMap[weekKey]) weekMap[weekKey] = { trades: [], days: new Set() };
            weekMap[weekKey].trades.push(t);
            weekMap[weekKey].days.add(day);
        });
        return Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, { trades: wt, days }]) => {
            const netPnl = wt.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const weekWins = wt.filter(t => (t.pnl ?? 0) > 0).length;
            const winRate = wt.length > 0 ? (weekWins / wt.length) * 100 : 0;
            const dayPnls: Record<string, number> = {};
            wt.forEach(t => {
                const d = getTradingDay(t.closedAt ?? t.createdAt);
                dayPnls[d] = (dayPnls[d] || 0) + (t.pnl ?? 0);
            });
            const dayVals = Object.values(dayPnls);
            const bestDayPnl = dayVals.length ? Math.max(...dayVals) : 0;
            const worstDayPnl = dayVals.length ? Math.min(...dayVals) : 0;
            const worstDayStr = Object.entries(dayPnls).find(([, p]) => p === worstDayPnl)?.[0] ?? '';
            const sortedDays = [...days].sort();
            const weekEnd = sortedDays[sortedDays.length - 1];
            let flag = '';
            let flagSev: 'critical' | 'warning' | 'clean' = 'clean';
            if (netPnl < 0 && worstDayPnl < 0 && Math.abs(worstDayPnl) >= Math.abs(netPnl) * 0.7) {
                const dl = worstDayStr ? new Date(worstDayStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                flag = `CRITICAL – ${dl} blowup wiped the entire week`;
                flagSev = 'critical';
            } else if (netPnl > 0 && winRate >= 60) {
                flag = 'Solid execution';
                flagSev = 'clean';
            } else if (netPnl < 0) {
                flag = 'Net loss week';
                flagSev = 'warning';
            }
            return { weekStart, weekEnd, numDays: sortedDays.length, netPnl, bestDayPnl, worstDayPnl, winRate, flag, flagSev };
        });
    })();

    // Report date range (from first to last closed trade)
    const reportRange = closed.length > 0 ? {
        from: new Date(closed[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        to: new Date(closed[closed.length - 1].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        fromShort: new Date(closed[0].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        toShort: new Date(closed[closed.length - 1].createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    } : null;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleExportPDF = () => {
        window.print();
    };

    const PIE_COLORS = ['#A6FF4D', '#00D4FF', '#EAB308', '#ff4757', '#fb923c'];

    return (
        <div className={styles.page}>
            {/* ── REPORT HEADER ──────────────────────────────────── */}
            <div style={{ borderBottom: '1px solid #1a1c24' }}>
                {/* Critical patterns alert */}
                {forensics.patterns.length > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 32px', background: 'rgba(230,0,35,0.06)',
                        borderBottom: '1px solid rgba(230,0,35,0.2)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={12} color="#e60023" />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#e60023', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                {forensics.patterns.length} Critical Pattern{forensics.patterns.length > 1 ? 's' : ''} Detected
                            </span>
                        </div>
                        <button
                            onClick={() => setActiveTab('PATTERNS')}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#e60023', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em', textDecoration: 'underline' }}>
                            EXPLORE →
                        </button>
                    </div>
                )}

                {/* Main header row */}
                <div style={{ padding: '20px 32px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 8 }}>
                            Analysis{reportRange ? ` · ${reportRange.fromShort} – ${reportRange.toShort}` : ''}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>
                                {closed.length} trades
                            </span>
                            {closed.length > 0 && (
                                <>
                                    <span style={{ color: '#1a1c24' }}>·</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: netPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                        {netPnl >= 0 ? '+' : ''}${netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} net P&L
                                    </span>
                                </>
                            )}
                            {/* Date range pickers (compact) */}
                            <span style={{ color: '#1a1c24' }}>·</span>
                            <input type="date" className={styles.dateInput} value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '3px 8px', fontSize: 11 }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563' }}>to</span>
                            <input type="date" className={styles.dateInput} value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '3px 8px', fontSize: 11 }} />
                            {(dateFrom || dateTo) && (
                                <button className={styles.dateClear} onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ padding: '3px 8px', fontSize: 10 }}>✕</button>
                            )}
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button
                            onClick={handleExportPDF}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                                padding: '8px 14px', background: 'transparent',
                                border: '1px solid #1a1c24', color: '#8b949e', cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#A6FF4D'; (e.currentTarget as HTMLButtonElement).style.color = '#A6FF4D'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1a1c24'; (e.currentTarget as HTMLButtonElement).style.color = '#8b949e'; }}
                        >
                            <Download size={12} /> EXPORT PDF
                        </button>
                        <button
                            onClick={handleCopyLink}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                                padding: '8px 14px',
                                background: copied ? 'rgba(166,255,77,0.1)' : 'transparent',
                                border: `1px solid ${copied ? 'rgba(166,255,77,0.4)' : '#1a1c24'}`,
                                color: copied ? '#A6FF4D' : '#8b949e', cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            {copied ? <><Check size={12} /> COPIED</> : <><Link2 size={12} /> COPY LINK</>}
                        </button>
                    </div>
                </div>
            </div>
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
                                        {(() => {
                                            const rs = forensics.riskScore;
                                            if (closed.length === 0) return (
                                                <>
                                                    <svg width="100" height="60" viewBox="0 0 100 60">
                                                        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1a1c24" strokeWidth="8" strokeLinecap="round" />
                                                    </svg>
                                                    <span className="text-2xl font-bold font-sans mt-[-20px] text-[#4b5563]">—</span>
                                                    <span className="text-[9px] uppercase tracking-widest mt-4 text-[#4b5563]">NO DATA</span>
                                                </>
                                            );
                                            const riskColor = rs > 75 ? '#ff4757' : rs > 30 ? '#EAB308' : '#A6FF4D';
                                            const riskLabel = rs > 75 ? 'CRITICAL RISK' : rs > 30 ? 'ELEVATED RISK' : 'HEALTHY RISK';
                                            return (<>
                                                <svg width="100" height="60" viewBox="0 0 100 60">
                                                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={riskColor} strokeWidth="8" strokeLinecap="round" />
                                                </svg>
                                                <span className="text-2xl font-bold font-sans mt-[-20px]" style={{ color: riskColor }}>{rs.toFixed(0)}</span>
                                                <span className="text-[9px] uppercase tracking-widest mt-4" style={{ color: riskColor }}>{riskLabel}</span>
                                            </>);
                                        })()}
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
                            <span className={styles.sectionTitle}>
                                Daily P&L Breakdown · {dailyData.length} Session{dailyData.length !== 1 ? 's' : ''}
                            </span>

                            {/* Bar Chart with X axis dates */}
                            <div className={styles.fullWidthCard} style={{ height: 300, paddingBottom: 20 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dailyData.slice(-30)} margin={{ bottom: 20 }}>
                                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 9, fill: '#4b5563', fontFamily: 'var(--font-mono)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={d => {
                                                const dt = new Date(d + 'T12:00:00Z');
                                                return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                            }}
                                        />
                                        <YAxis hide />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                                            formatter={(v: number) => [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, 'P&L']}
                                            labelFormatter={l => new Date(l + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                        />
                                        <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                                            {dailyData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#A6FF4D' : '#ff4757'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* 4 KPI Cards — Best Day, Worst Day, Avg Daily, Daily Volatility */}
                            <div className={styles.kpiGrid}>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>Best Day</span>
                                    <span className={`${styles.kpiValue} ${styles.textGreen}`}>
                                        {bestDay > 0 ? `+$${bestDay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                    </span>
                                    {bestDayDate && <span className={styles.kpiSub}>
                                        {new Date(bestDayDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
                                    </span>}
                                </div>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>Worst Day</span>
                                    <span className={`${styles.kpiValue} ${styles.textRed}`}>
                                        {worstDay < 0 ? `-$${Math.abs(worstDay).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                    </span>
                                    {worstDayDate && <span className={styles.kpiSub}>
                                        {new Date(worstDayDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
                                    </span>}
                                </div>
                                <div className={styles.kpiBox}>
                                    <span className={styles.kpiLabel}>Avg Daily P&L</span>
                                    <span className={`${styles.kpiValue} ${avgDaily >= 0 ? styles.textGreen : styles.textRed}`}>
                                        {avgDaily >= 0 ? '+' : ''}${avgDaily.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className={styles.kpiSub}>
                                        Median: {medianDaily >= 0 ? '+' : ''}${medianDaily.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className={styles.kpiBox} style={{ borderRight: 'none' }}>
                                    <span className={styles.kpiLabel}>Daily Volatility</span>
                                    <span className={`${styles.kpiValue} ${styles.textYellow}`}>
                                        {dailyVolatility > 0 ? `±$${dailyVolatility.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                                    </span>
                                    {dailyData.length >= 2 && <span className={styles.kpiSub}>
                                        {daysWithin1Std}% days within 1 StdDev
                                    </span>}
                                </div>
                            </div>

                            {/* Weekly Performance Breakdown */}
                            {weeklyBreakdown.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <span className={styles.sectionTitle}>Weekly Performance Breakdown</span>
                                    <div className={styles.fullWidthCard} style={{ padding: 0, overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #1a1c24', background: '#0d1117' }}>
                                                    {['WEEK', 'DAYS', 'NET P&L', 'BEST', 'WORST', 'WIN %', 'FLAG'].map((h, i) => (
                                                        <th key={i} style={{ padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right', color: '#4b5563', fontWeight: 700, letterSpacing: '0.08em', fontSize: 10, whiteSpace: 'nowrap' }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {weeklyBreakdown.map((w, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #1a1c24', transition: 'background 0.1s' }}
                                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0d1117'}
                                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                                                    >
                                                        <td style={{ padding: '14px 16px', color: '#c9d1d9', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                            {w.weekStart} to {w.weekEnd}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', color: '#6b7280' }}>{w.numDays}</td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: w.netPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                            {w.netPnl >= 0 ? '+' : ''}${w.netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', color: '#A6FF4D' }}>
                                                            +${w.bestDayPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', color: '#ff4757' }}>
                                                            -${Math.abs(w.worstDayPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', color: w.winRate >= 55 ? '#A6FF4D' : w.winRate >= 45 ? '#EAB308' : '#ff4757', fontWeight: 700 }}>
                                                            {w.winRate.toFixed(1)}%
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                            {w.flag && (
                                                                <span style={{
                                                                    display: 'inline-block', padding: '3px 8px',
                                                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                                                                    border: `1px solid ${w.flagSev === 'critical' ? 'rgba(255,71,87,0.4)' : w.flagSev === 'warning' ? 'rgba(234,179,8,0.4)' : 'rgba(166,255,77,0.3)'}`,
                                                                    color: w.flagSev === 'critical' ? '#ff4757' : w.flagSev === 'warning' ? '#EAB308' : '#A6FF4D',
                                                                    background: w.flagSev === 'critical' ? 'rgba(255,71,87,0.08)' : w.flagSev === 'warning' ? 'rgba(234,179,8,0.06)' : 'rgba(166,255,77,0.06)',
                                                                    whiteSpace: 'nowrap', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis',
                                                                }}>
                                                                    {w.flag}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'INSTRUMENTS' && (
                        <motion.div key="instruments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                            <span className={styles.sectionTitle}>Performance by Instrument</span>
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
                            <span className={styles.sectionTitle}>Session Forensics</span>
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
                            <span className={styles.sectionTitle}>24-Hour Edge Map</span>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            <span className={styles.sectionTitle}>Streak Analysis</span>
                            <div className={styles.fullWidthCard} style={{ padding: '32px' }}>
                                <div className="flex flex-wrap gap-1 mb-10">
                                    {forensics.streaksSequence.map((res: string, i: number) => (
                                        <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${res === 'W' ? 'border-[#A6FF4D] text-[#A6FF4D]' : 'border-[#ff4757] text-[#ff4757]'}`}>
                                            {res}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
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
                            <span className={styles.sectionTitle}>Behavioral Patterns</span>
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
                            <span className={styles.sectionTitle}>Execution Scorecard</span>
                            <div className="grid grid-cols-2 gap-4">
                                {forensics.scorecard.map((s: any, i: number) => (
                                    <div key={i} className={styles.kpiBox + ' flex-row items-center gap-6'}>
                                        <div className={`text-[42px] font-black ${s.grade === 'A' ? styles.textGreen : s.grade === 'B' ? 'text-[#00D4FF]' : s.grade === 'C' ? styles.textYellow : s.grade === '—' ? 'text-[#6b7280]' : styles.textRed}`}>
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

                    {activeTab === 'QUANT' && (() => {
                        const dailyPnls = dailyData.map(d => d.pnl);
                        const n = dailyPnls.length;
                        const meanDaily = n > 0 ? dailyPnls.reduce((s, v) => s + v, 0) / n : 0;
                        const variance = n > 1 ? dailyPnls.reduce((s, v) => s + (v - meanDaily) ** 2, 0) / (n - 1) : 0;
                        const stdDev = Math.sqrt(variance);
                        const sharpe = stdDev > 0 ? (meanDaily / stdDev) * Math.sqrt(252) : 0;
                        const downside = dailyPnls.filter(v => v < 0);
                        const downsideVariance = downside.length > 0 ? downside.reduce((s, v) => s + v ** 2, 0) / downside.length : 0;
                        const downsideStd = Math.sqrt(downsideVariance);
                        const sortino = downsideStd > 0 ? (meanDaily / downsideStd) * Math.sqrt(252) : 0;
                        return (
                            <motion.div key="quant" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
                                <span className={styles.sectionTitle}>Quant Metrics</span>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { label: 'Sharpe Ratio', val: n >= 2 ? sharpe.toFixed(2) : '—', sub: 'Risk-adjusted return (annualized)' },
                                        { label: 'Sortino Ratio', val: n >= 2 ? sortino.toFixed(2) : '—', sub: 'Downside deviation penalty (annualized)' },
                                        { label: 'Calmar Ratio', val: maxDd > 0 ? ((netPnl * 12) / Math.abs(maxDd)).toFixed(2) : '—', sub: 'Return vs Maximum Drawdown' },
                                        { label: 'Efficiency Index', val: (grossProfit + grossLoss) > 0 ? (Math.abs(netPnl) / (grossProfit + grossLoss) * 100).toFixed(1) + '%' : '—', sub: 'Capital throughput efficiency' }
                                    ].map((q, i) => (
                                        <div key={i} className={styles.kpiBox}>
                                            <span className={styles.kpiLabel}>{q.label.toUpperCase()}</span>
                                            <span className={`${styles.kpiValue} text-white`}>{q.val}</span>
                                            <span className={styles.kpiSub}>{q.sub}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        );
                    })()}

                    {activeTab === 'VERDICT' && (() => {
                        // ── Grade computation ──
                        let gradeScore = 100;
                        forensics.patterns.forEach((p: any) => {
                            if (p.severity === 'CRITICAL') gradeScore -= 20;
                            else gradeScore -= 10;
                        });
                        if (closed.length > 0 && winRate < 50) gradeScore -= 10;
                        if (closed.length > 0 && profitFactor < 1) gradeScore -= 20;
                        gradeScore = Math.max(0, gradeScore);
                        const grade = gradeScore >= 90 ? 'A' : gradeScore >= 75 ? 'B' : gradeScore >= 55 ? 'C' : 'D';
                        const gradeColor = grade === 'A' ? '#A6FF4D' : grade === 'B' ? '#00D4FF' : grade === 'C' ? '#EAB308' : '#ff4757';
                        const gradeDesc = grade === 'A' ? 'Solid execution' : grade === 'B' ? 'Minor leakage' : grade === 'C' ? 'Needs work' : 'Significant issues';

                        // ── Prescriptions from patterns ──
                        const prescriptions = forensics.patterns.map((p: any, idx: number) => ({
                            num: String(idx + 1).padStart(2, '0'),
                            title: p.name === 'Revenge Trading' ? 'Enforce a Hard Tilt Stop' :
                                p.name === 'Held Losers' ? 'Cap Maximum Hold Time on Losers' :
                                p.name === 'Spike Vulnerability' ? 'Add Hard Stop on Every Entry' :
                                p.name === 'Early Exit' ? 'Let Winners Run to Target' :
                                p.name === 'Micro Overtrading' ? 'Reduce Micro Contract Frequency' :
                                p.name,
                            desc: p.desc,
                            badge: p.severity === 'CRITICAL' ? 'CRITICAL' : Math.abs(p.impact) > 200 ? 'HIGH' : 'RECOMMENDED',
                            impact: Math.abs(p.impact),
                        }));

                        // ── Projected impact ──
                        const totalRecovery = forensics.patterns.reduce((s: number, p: any) => s + Math.abs(p.impact), 0);
                        const projectedPnl = netPnl + totalRecovery;
                        const tradeCount = closed.length;
                        const sessionCount = forensics.sessions?.length || 1;

                        return (
                            <motion.div key="verdict" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">

                                {/* ANALYST VERDICT */}
                                <div>
                                    <span className={styles.sectionTitle} style={{ marginBottom: 16, display: 'flex' }}>ANALYST VERDICT</span>
                                    <div className="bg-[#0d1117] border border-[#1a1c24]" style={{ borderRadius: 4 }}>
                                        <div className="flex gap-0">
                                            {/* Grade Box */}
                                            <div className="flex flex-col items-center justify-center gap-1 p-6 border-r border-[#1a1c24]" style={{ minWidth: 140 }}>
                                                <span className="text-[9px] uppercase tracking-[0.15em] font-bold" style={{ color: '#6b7280' }}>Overall Grade</span>
                                                <span className="text-[64px] font-black leading-none" style={{ color: gradeColor }}>{grade}</span>
                                                <span className="text-[11px] font-medium text-center" style={{ color: '#8b949e' }}>{gradeDesc}</span>
                                            </div>
                                            {/* Narrative */}
                                            <div className="flex-1 p-6 flex items-center">
                                                <p className="text-[14px] text-[#c9d1d9] leading-[1.7] font-sans">
                                                    {forensics.verdict.message}
                                                    {forensics.patterns.length > 0 && ` The top behavioral leak is ${forensics.patterns[0].name.toLowerCase()}, costing $${Math.abs(forensics.patterns[0].impact).toLocaleString()} across ${forensics.patterns[0].freq} occurrences. `}
                                                    {forensics.verdict.isCritical ? ' Correcting these specific patterns is the highest-leverage action available to you.' : ' Your fundamentals are sound — the edge exists.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ACTIONABLE PRESCRIPTIONS */}
                                {prescriptions.length > 0 && (
                                    <div>
                                        <span className={styles.sectionTitle} style={{ marginBottom: 16, display: 'flex' }}>ACTIONABLE PRESCRIPTION</span>
                                        <div className="flex flex-col gap-3">
                                            {prescriptions.map((rx: any) => (
                                                <div key={rx.num} className="bg-[#0d1117] border border-[#1a1c24] p-5 flex flex-col gap-3" style={{ borderRadius: 4 }}>
                                                    <div className="flex items-start gap-4">
                                                        <span className="text-[28px] font-black" style={{ color: '#1e2430', lineHeight: 1, minWidth: 40 }}>{rx.num}</span>
                                                        <div className="flex flex-col gap-1 flex-1">
                                                            <span className="text-[15px] font-bold text-white">{rx.title}</span>
                                                            <p className="text-[12px] text-[#8b949e] leading-relaxed">{rx.desc}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4 border-t border-[#1a1c24] pt-3">
                                                        <span className={`text-[9px] font-black px-2 py-1 tracking-widest border rounded-sm ${rx.badge === 'CRITICAL' ? 'text-[#ff4757] border-[#ff4757]/40 bg-[#ff4757]/10' : rx.badge === 'HIGH' ? 'text-[#EAB308] border-[#EAB308]/40 bg-[#EAB308]/10' : 'text-[#A6FF4D] border-[#A6FF4D]/30 bg-[#A6FF4D]/05'}`}>
                                                            {rx.badge}
                                                        </span>
                                                        <span className="text-[11px] text-[#6b7280]">
                                                            Impact: <span className="font-bold" style={{ color: '#A6FF4D' }}>+${rx.impact.toLocaleString()}/session</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* PROJECTED IMPACT */}
                                {prescriptions.length > 0 && (
                                    <div>
                                        <span className={styles.sectionTitle} style={{ marginBottom: 8, display: 'flex' }}>PROJECTED IMPACT IF IMPLEMENTED</span>
                                        <p className="text-[11px] text-[#4b5563] mb-4 leading-relaxed">
                                            Projection assumes full elimination of all flagged behavioral patterns. Actual improvement will vary — patterns are modeled independently and may overlap on shared trades.
                                        </p>
                                        <div className="flex gap-3 items-center">
                                            <div className="flex-1 bg-[#0d1117] border border-[#1a1c24] p-5 flex flex-col gap-2" style={{ borderRadius: 4 }}>
                                                <span className="text-[9px] uppercase tracking-[0.15em] font-bold" style={{ color: '#6b7280' }}>Current (with behavioral errors)</span>
                                                <span className="text-[36px] font-black font-mono" style={{ color: netPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                    {netPnl >= 0 ? '+' : '-'}${Math.abs(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-[11px]" style={{ color: '#4b5563' }}>{tradeCount} trades · {sessionCount} sessions</span>
                                            </div>
                                            <div className="flex items-center justify-center text-[#4b5563]" style={{ fontSize: 20 }}>→</div>
                                            <div className="flex-1 bg-[#0d1117] border border-[#1a1c24] p-5 flex flex-col gap-2" style={{ borderRadius: 4 }}>
                                                <span className="text-[9px] uppercase tracking-[0.15em] font-bold" style={{ color: '#6b7280' }}>Projected (with corrections)</span>
                                                <span className="text-[36px] font-black font-mono" style={{ color: projectedPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                    {projectedPnl >= 0 ? '+' : '-'}${Math.abs(projectedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-[11px]" style={{ color: '#4b5563' }}>~{tradeCount} trades · Behavioral fixes applied</span>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-[#1a1c24] text-center text-[12px] font-mono" style={{ color: '#6b7280' }}>
                                            POTENTIAL IMPROVEMENT: <span className="font-black" style={{ color: '#A6FF4D' }}>+${totalRecovery.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                )}

                                {prescriptions.length === 0 && (
                                    <div className="bg-[#0d1117] border border-[#1a1c24] p-10 text-center flex flex-col items-center gap-3" style={{ borderRadius: 4 }}>
                                        <span className="text-[42px] font-black" style={{ color: gradeColor }}>{grade}</span>
                                        <span className="text-[14px] font-bold text-white">
                                            {closed.length >= 10 ? 'No Critical Patterns Detected' : 'Insufficient Data for Pattern Detection'}
                                        </span>
                                        <p className="text-[12px] text-[#6b7280] max-w-xs leading-relaxed">
                                            {closed.length >= 10
                                                ? forensics.verdict.message
                                                : `${closed.length} closed trades logged. Add more trades to unlock deeper forensic analysis. Minimum 10 closed trades recommended.`
                                            }
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })()}

                    {activeTab === 'COMPARE' && (
                        <motion.div key="compare" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center justify-center p-8 sm:p-32 gap-6 opacity-40">
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
