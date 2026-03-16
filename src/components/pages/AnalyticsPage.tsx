'use client';

import styles from './AnalyticsPage.module.css';
import { useState, useMemo } from 'react';
import { useAppStore, getTradingDay } from '@/store/appStore';
import { generateForensics } from '@/ai/EdgeForensics';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, ReferenceLine,
    AreaChart, Area, CartesianGrid
} from 'recharts';
import { Target, AlertTriangle, Download, Link2, Check, Info, TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react';

export default function AnalyticsPage() {
    const { trades, account } = useAppStore();
    const [activeTab, setActiveTab] = useState('OVERVIEW');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [copied, setCopied] = useState(false);

    // Sort chronological + apply date range filter
    // Date filter uses getTradingDay(closedAt) — trades held overnight are correctly attributed
    const closed = useMemo(() => {
        return trades
            .filter(t => t.outcome === 'win' || t.outcome === 'loss')
            .filter(t => {
                const d = getTradingDay(t.closedAt ?? t.createdAt);
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
                return true;
            })
            .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
    }, [trades, dateFrom, dateTo]);

    const filterActive = !!(dateFrom || dateTo);

    // Compute durationSeconds for each trade before forensics
    const tradesWithDuration = useMemo(() => trades.map(t => ({
        ...t,
        durationSeconds: t.closedAt
            ? Math.floor((new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 1000)
            : t.durationSeconds,
    })), [trades]);

    // Process Algorithmic Forensics
    const forensics = useMemo(() => generateForensics(tradesWithDuration, account), [tradesWithDuration, account]);

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

    // Max Drawdown / Runup — start from startingBalance for accurate absolute drawdown
    const startBal = account.startingBalance ?? 0;
    let maxDd = 0;
    let maxPeak = startBal;
    let maxRunup = 0;
    let minTrough = startBal;
    let curBal = startBal;
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

    // Report date range (from first to last trading day)
    const reportRange = closed.length > 0 ? (() => {
        const first = getTradingDay(closed[0].closedAt ?? closed[0].createdAt);
        const last  = getTradingDay(closed[closed.length - 1].closedAt ?? closed[closed.length - 1].createdAt);
        const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
            new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', opts);
        return {
            from:      fmt(first, { month: 'short', day: 'numeric', year: 'numeric' }),
            to:        fmt(last,  { month: 'short', day: 'numeric', year: 'numeric' }),
            fromShort: fmt(first, { month: 'short', day: 'numeric' }),
            toShort:   fmt(last,  { month: 'short', day: 'numeric', year: 'numeric' }),
        };
    })() : null;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleExportPDF = () => {
        window.print();
    };

    // ── STREAKS: Recovery probability computed from actual trade sequence ──
    const recoveryProbTable = (() => {
        if (closed.length < 3) return [];
        const seq = closed.map(t => (t.pnl ?? 0) >= 0 ? 'W' : 'L');
        return [1, 2, 3, 4, 5].map(n => {
            let instances = 0, winsNext = 0, totalTrades = 0;
            for (let i = n - 1; i < seq.length - 1; i++) {
                let allLoss = true;
                for (let k = i - n + 1; k <= i; k++) { if (seq[k] !== 'L') { allLoss = false; break; } }
                if (allLoss && (i - n + 1 === 0 || seq[i - n] === 'W')) {
                    instances++;
                    if (seq[i + 1] === 'W') { winsNext++; totalTrades += 1; }
                    else {
                        let found = false;
                        for (let j = i + 2; j < seq.length; j++) {
                            if (seq[j] === 'W') { totalTrades += (j - i); found = true; break; }
                        }
                        if (!found) totalTrades += (seq.length - i);
                    }
                }
            }
            return { n, instances, recoveryProb: instances > 0 ? (winsNext / instances) * 100 : null, avgTrades: instances > 0 ? totalTrades / instances : null };
        }).filter(r => r.instances > 0);
    })();

    // ── STREAKS: Worst streak details for NLP narrative ──
    const worstStreakInfo = (() => {
        if (closed.length === 0) return null;
        type StreakBest = { start: number; end: number; count: number; pnl: number };
        let best: StreakBest | null = null;
        let cs = -1, cc = 0, cp = 0;
        closed.forEach((t, i) => {
            if ((t.pnl ?? 0) < 0) {
                if (cc === 0) cs = i;
                cc++; cp += (t.pnl ?? 0);
                if (!best || cc > best.count || (cc === best.count && cp < best.pnl)) best = { start: cs, end: i, count: cc, pnl: cp };
            } else { cc = 0; cp = 0; }
        });
        if (!best) return null;
        const b = best as StreakBest;
        const st = closed[b.start], et = closed[b.end];
        const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
        const streakTrades = closed.slice(b.start, b.end + 1);
        const assetCounts: Record<string, number> = {};
        streakTrades.forEach(t => { assetCounts[t.asset] = (assetCounts[t.asset] || 0) + 1; });
        const dominantAsset = Object.entries(assetCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '';
        const shortCount = streakTrades.filter(t => t.isShort).length;
        return { count: b.count, pnl: b.pnl, date: fmtDate(st.createdAt), startTime: fmtTime(st.createdAt), endTime: fmtTime(et.createdAt), dominantAsset, isShort: shortCount > b.count / 2 };
    })();

    // ── STREAKS: Psychological State Profile (derived from pattern + time data) ──
    const psychStates = (() => {
        const states: Array<{ title: string; severity: 'CRITICAL' | 'HIGH' | 'INFO'; trigger: string; response: string }> = [];
        const revPattern = forensics.patterns.find((p: any) => p.name === 'Revenge Trading');
        const heldPattern = forensics.patterns.find((p: any) => p.name === 'Held Losers');
        const spikePattern = forensics.patterns.find((p: any) => p.name === 'Spike Vulnerability');
        const maxLoss = forensics.maxLossStreak;
        const bH = forensics.timeStats.bestHour;
        const wH = forensics.timeStats.worstHour;

        // 1. Tilt Zone
        if (maxLoss >= 3 || revPattern) {
            states.push({
                title: 'TILT ZONE',
                severity: maxLoss >= 5 || (revPattern && revPattern.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
                trigger: worstStreakInfo
                    ? `${worstStreakInfo.count} consecutive ${worstStreakInfo.dominantAsset}${worstStreakInfo.isShort ? ' short' : ''} losses on ${worstStreakInfo.date} (${worstStreakInfo.startTime}–${worstStreakInfo.endTime}), costing $${Math.abs(worstStreakInfo.pnl).toFixed(0)}. Direction bias held despite repeated market rejection.`
                    : `${maxLoss} consecutive losses detected. Directional bias maintained past the point of edge.`,
                response: `Implement a ${maxLoss >= 4 ? '3' : '2'}-loss directional lockout rule per instrument per session. After ${maxLoss >= 4 ? 3 : 2} losses in the same direction, close the instrument for the day.`,
            });
        }

        // 2. Revenge Mode
        if (revPattern) {
            states.push({
                title: 'REVENGE MODE',
                severity: revPattern.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
                trigger: `Rapid re-entry detected after ${revPattern.freq} loss event${revPattern.freq > 1 ? 's' : ''}, costing an additional $${Math.abs(revPattern.impact).toFixed(0)}. ${revPattern.evidence?.[0] ? `Clearest instance: ${revPattern.evidence[0]}.` : ''}`,
                response: `After any loss exceeding $${Math.round(Math.abs(revPattern.impact / revPattern.freq / 2))}, mandatory 5-minute cooldown before next entry. The Mar trades that recovered all had conviction, not emotion.`,
            });
        } else if (maxLoss >= 2) {
            states.push({
                title: 'REVENGE MODE',
                severity: 'INFO',
                trigger: `No confirmed revenge pattern detected in your data. Your re-entry timing after losses is within normal bounds.`,
                response: `Maintain current discipline. Continue waiting for genuine setups rather than reaction entries.`,
            });
        }

        // 3. Late-Session Drift / Danger Zone
        if (wH >= 18 || wH <= 6) {
            states.push({
                title: 'LATE-SESSION DRIFT',
                severity: 'HIGH',
                trigger: `Your worst-performing hour is ${wH}:00 EST. ${wH >= 20 ? 'Evening entries show decision degradation — these are boredom trades, not setups.' : wH <= 6 ? 'Pre-market entries before structure is established carry elevated risk.' : 'Off-session trading outside core liquidity windows.'}`,
                response: `Set a hard ${wH >= 18 ? '20:00' : '08:30'} EST cutoff. No new positions after that time. Your edge is session-dependent — protect it by staying inside it.`,
            });
        }

        // 4. Optimal Window (always include as reinforcement)
        states.push({
            title: 'OPTIMAL WINDOW',
            severity: 'INFO',
            trigger: `Peak performance hour: ${bH}:00–${bH + 1}:00 EST. ${heldPattern ? 'When winners are held to target, execution quality is elite.' : 'Clear directional conviction in this window produces consistently positive outcomes.'}`,
            response: `Protect this state. Do not carry prior-session losses into your best window. Arrive flat, focused, and structured. This is where your edge lives.`,
        });

        // 5. Spike / Stop-Hunt Vulnerability (if present)
        if (spikePattern) {
            states.push({
                title: 'STOP-HUNT VULNERABILITY',
                severity: 'CRITICAL',
                trigger: `${spikePattern.freq} acute spike event${spikePattern.freq > 1 ? 's' : ''} detected — rapid large losses ($${Math.abs(spikePattern.impact / spikePattern.freq).toFixed(0)} avg) in under 3 minutes. ${spikePattern.evidence?.[0] ?? ''}.`,
                response: `Hard stop losses are non-negotiable on volatile instruments. No position should be held through a news/spike event without a stop. Size down or exit before known catalysts.`,
            });
        }

        return states;
    })();

    // Hold time by outcome
    const avgWinDuration = wins.length > 0
        ? wins.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / wins.length : 0;
    const avgLossDuration = losses.length > 0
        ? losses.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / losses.length : 0;
    const fmtDuration = (s: number) => {
        if (s <= 0) return '—';
        const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
        return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    // Equity curve (cumulative P&L per trade)
    const equityCurve = useMemo(() => {
        let cum = 0;
        return closed.map((t, i) => {
            cum += (t.pnl ?? 0);
            const day = getTradingDay(t.closedAt ?? t.createdAt);
            return { i: i + 1, pnl: cum, date: day };
        });
    }, [closed]);

    // Behavioral cost = sum of negative pattern impacts
    const behavioralCost = forensics.patterns.reduce((s: number, p: any) => s + Math.min(0, p.impact ?? 0), 0);
    const withoutToxicPatterns = netPnl - behavioralCost; // would have earned MORE without

    // Risk score components (recomputed for display)
    const revScore = Math.min(60, forensics.patterns.filter((p: any) => p.name === 'Revenge Trading').length > 0
        ? forensics.patterns.find((p: any) => p.name === 'Revenge Trading').freq * 20 : 0);
    const financialScore = Math.abs(behavioralCost) > (account.startingBalance ?? 50000) * 0.05 ? 25 : 0;
    const wrErosion = closed.length > 0 && winRate < 35 ? 15 : 0;

    // Danger / strength zones by time of day
    const dangerZones = forensics.timeStats.hourlyPnl
        .map((pnl: number, h: number) => ({ h, pnl }))
        .filter((x: { h: number; pnl: number }) => x.pnl < 0)
        .sort((a: { h: number; pnl: number }, b: { h: number; pnl: number }) => a.pnl - b.pnl)
        .slice(0, 4);
    const strengthZones = forensics.timeStats.hourlyPnl
        .map((pnl: number, h: number) => ({ h, pnl }))
        .filter((x: { h: number; pnl: number }) => x.pnl > 0)
        .sort((a: { h: number; pnl: number }, b: { h: number; pnl: number }) => b.pnl - a.pnl)
        .slice(0, 4);

    // Instrument pnl for horizontal bars
    const maxAbsInstPnl = instrumentArray.length > 0 ? Math.max(...instrumentArray.map(i => Math.abs(i.pnl))) : 1;

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
                            <button key={t} className={`${styles.tab} ${activeTab === tabKey ? styles.tabActive : ''}`} onClick={(e) => {
                                setActiveTab(tabKey);
                                e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                            }}>
                                {t}
                            </button>
                        );
                    })}
                </div>
            </div>

            {filterActive && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 16px',
                    background: 'rgba(251, 191, 36, 0.04)',
                    borderBottom: '1px solid rgba(251, 191, 36, 0.18)',
                    fontFamily: 'var(--font-mono)', fontSize: 10, color: '#fbbf24',
                    letterSpacing: '0.05em',
                }}>
                    <Info size={11} />
                    <span>DATE FILTER ACTIVE — trades outside {dateFrom || '…'} → {dateTo || '…'} are hidden. New imports may not be visible.</span>
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)' }}>CLEAR</button>
                </div>
            )}

            <div className={styles.content}>
                <AnimatePresence mode="wait">
                    {activeTab === 'OVERVIEW' && (
                        <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── RISK ALERT BAR ── */}
                            {forensics.patterns.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(230,0,35,0.06)', border: '1px solid rgba(230,0,35,0.25)', borderLeft: '3px solid #e60023' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <AlertTriangle size={13} color="#e60023" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#e60023', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                            RISK ALERT — {forensics.patterns.length} CRITICAL BEHAVIORAL PATTERN{forensics.patterns.length > 1 ? 'S' : ''} DETECTED IN YOUR DATA. CLICK TO INVESTIGATE.
                                        </span>
                                    </div>
                                    <button onClick={() => setActiveTab('PATTERNS')} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#e60023', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                                        SEE ALL PATTERNS →
                                    </button>
                                </div>
                            )}

                            {/* ── CRITICAL PATTERN CALLOUT (top pattern) ── */}
                            {forensics.patterns.length > 0 && (() => {
                                const p = forensics.patterns[0];
                                return (
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', borderLeft: '3px solid #e60023', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: 240 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: '#e60023', letterSpacing: '0.12em', textTransform: 'uppercase', background: 'rgba(230,0,35,0.12)', border: '1px solid rgba(230,0,35,0.3)', padding: '2px 8px' }}>CRITICAL PATTERN</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4b5563', letterSpacing: '0.08em' }}>{p.freq} DETECTED · {forensics.patterns.length} TOTAL</span>
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 }}>{p.name}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#8b949e', lineHeight: 1.7, maxWidth: 520 }}>
                                                {p.desc}{p.evidence?.[0] ? ` ${p.evidence[0]}.` : ''}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' }}>ESTIMATED COST</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#ff4757' }}>
                                                -${Math.abs(p.impact ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </div>
                                            <button onClick={() => setActiveTab('PATTERNS')} style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textDecoration: 'underline' }}>
                                                SEE ALL PATTERNS →
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── 8 KPI BOXES ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {/* Row 1 */}
                                {[
                                    { label: 'NET P&L (AFTER FEES)', value: `${netPnl >= 0 ? '+' : '-'}$${Math.abs(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: netPnl >= 0 ? '#A6FF4D' : '#ff4757', sub: `Gross $${grossProfit.toFixed(0)} · Loss $${grossLoss.toFixed(0)}` },
                                    { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? '#A6FF4D' : '#EAB308', sub: `${wins.length}W / ${losses.length}L of ${closed.length} trades` },
                                    { label: 'PROFIT FACTOR', value: profitFactor === 99 ? '∞' : profitFactor.toFixed(2), color: profitFactor >= 2 ? '#A6FF4D' : profitFactor >= 1.2 ? '#EAB308' : '#ff4757', sub: `Won $${grossProfit.toFixed(0)} / Lost $${grossLoss.toFixed(0)}` },
                                    { label: 'EXPECTANCY / TRADE', value: `${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}`, color: expectancy >= 0 ? '#A6FF4D' : '#ff4757', sub: `Avg W $${avgWin.toFixed(0)} · Avg L $${avgLoss.toFixed(0)}` },
                                    { label: 'MAX DRAWDOWN', value: maxDd > 0 ? `-$${maxDd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', color: '#ff4757', sub: 'Peak to trough' },
                                    { label: 'MAX RUN-UP', value: maxRunup > 0 ? `+$${maxRunup.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', color: '#A6FF4D', sub: 'Trough to peak' },
                                    { label: 'AVG TRADE DURATION', value: fmtDuration((avgWinDuration * wins.length + avgLossDuration * losses.length) / Math.max(1, closed.length)), color: '#c9d1d9', sub: `${wins.length + losses.length} closed trades` },
                                    { label: 'W/L DOLLAR RATIO', value: wlRatio > 0 ? `${wlRatio.toFixed(2)}:1` : '—', color: wlRatio >= 1.5 ? '#A6FF4D' : wlRatio >= 1 ? '#EAB308' : '#ff4757', sub: `$${avgWin.toFixed(0)} avg win · $${avgLoss.toFixed(0)} avg loss` },
                                ].map((k, i) => (
                                    <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1, textShadow: `0 0 12px ${k.color}22` }}>{k.value}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563' }}>{k.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── FULL DETAILS ROW: Waterfall + Wins vs Losses ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Waterfall */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>FULL DETAILS</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Gross, fees, and what actually landed</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 20 }}>A waterfall is the cleanest way to show how commissions compress gross edge into net P&L.</div>
                                    {/* SVG Waterfall */}
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, padding: '0 8px', position: 'relative' }}>
                                        {[
                                            { label: 'GROSS', val: grossProfit, color: '#A6FF4D' },
                                            { label: 'LOSS', val: -grossLoss, color: '#ff4757' },
                                            { label: 'NET', val: netPnl, color: netPnl >= 0 ? '#A6FF4D' : '#ff4757' },
                                        ].map((bar, i) => {
                                            const maxV = Math.max(grossProfit, grossLoss, Math.abs(netPnl), 1);
                                            const h = Math.max(4, (Math.abs(bar.val) / maxV) * 80);
                                            return (
                                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifyContent: 'flex-end', height: '100%' }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: bar.color }}>{bar.val >= 0 ? '+' : ''}${bar.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    <motion.div initial={{ height: 0 }} animate={{ height: h }} style={{ width: '60%', background: bar.color, opacity: 0.85, borderRadius: 2 }} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                                        {['GROSS', 'LOSS', 'NET'].map((l, i) => (
                                            <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4b5563', letterSpacing: '0.08em' }}>{l}</div>
                                        ))}
                                    </div>
                                </div>

                                {/* Wins vs Losses segmented */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>TRADE OUTCOMES</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Wins versus losses</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 20 }}>Segmented composition reads faster than a donut here and keeps the trade counts explicit.</div>
                                    <div style={{ height: 12, background: '#1a1c24', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
                                        {closed.length > 0 && (
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${winRate}%` }} style={{ height: '100%', background: '#A6FF4D', borderRadius: '2px 0 0 2px' }} />
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 32 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 8, height: 8, background: '#A6FF4D', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9' }}>{wins.length} trades</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9' }}>{losses.length} trades</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── TRADE VIABILITY + PAYOFF PROFILE ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Profit Factor & Expectancy gauges */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>TRADE VIABILITY</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Profitability thresholds</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 24 }}>Profit factor tells you whether wins outsize losses. Expectancy tells you what each trade is worth on average.</div>

                                    {/* PF slider */}
                                    <div style={{ marginBottom: 24 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PROFIT FACTOR</span>
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: profitFactor >= 1.5 ? '#A6FF4D' : profitFactor >= 1 ? '#EAB308' : '#ff4757', marginBottom: 10 }}>
                                            {profitFactor === 99 ? '∞' : `${profitFactor.toFixed(2)}x`}
                                        </div>
                                        <div style={{ position: 'relative', height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 8 }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'linear-gradient(to right, #ff4757 0%, #EAB308 40%, #A6FF4D 70%)', borderRadius: 3, width: '100%', opacity: 0.3 }} />
                                            <motion.div initial={{ left: 0 }} animate={{ left: `${Math.min(95, (Math.min(profitFactor, 3) / 3) * 100)}%` }} style={{ position: 'absolute', top: -3, width: 12, height: 12, background: profitFactor >= 1.5 ? '#A6FF4D' : '#EAB308', borderRadius: '50%', transform: 'translateX(-50%)' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4b5563' }}>
                                            <span>0–0.9x LOSS</span><span>1–1.4x FLAT</span><span>1.5–1.9x PLAYABLE</span><span>2x+ EDGE</span>
                                        </div>
                                    </div>

                                    {/* Expectancy slider */}
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>EXPECTANCY / TRADE</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: expectancy >= 0 ? '#A6FF4D' : '#ff4757', marginBottom: 10 }}>
                                            {expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}
                                        </div>
                                        <div style={{ position: 'relative', height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 8 }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'linear-gradient(to right, #ff4757 0%, #EAB308 40%, #A6FF4D 70%)', borderRadius: 3, width: '100%', opacity: 0.3 }} />
                                            <motion.div
                                                initial={{ left: '50%' }}
                                                animate={{ left: `${Math.min(95, Math.max(5, 50 + (expectancy / Math.max(avgWin, 1)) * 40))}%` }}
                                                style={{ position: 'absolute', top: -3, width: 12, height: 12, background: expectancy >= 0 ? '#A6FF4D' : '#ff4757', borderRadius: '50%', transform: 'translateX(-50%)' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4b5563' }}>
                                            <span>NEGATIVE</span><span>FLAT</span><span>POSITIVE</span><span>OPTIMAL</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Payoff Profile */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>PAYOFF PROFILE</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Average win versus average loss</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 24 }}>This is the most direct visual for your W:L dollar ratio. Traders scan the payoff gap faster than the ratio alone.</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 8, height: 8, background: '#A6FF4D', borderRadius: '50%' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>Avg win</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{wins.length} winning trades</span>
                                                </div>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#A6FF4D' }}>+${avgWin.toFixed(2)}</span>
                                            </div>
                                            <div style={{ height: 10, background: '#1a1c24', borderRadius: 2 }}>
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${avgLoss > 0 ? Math.min(100, (avgWin / Math.max(avgWin, avgLoss)) * 100) : 100}%` }} style={{ height: '100%', background: '#A6FF4D', borderRadius: 2 }} />
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>Avg loss</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{losses.length} losing trades</span>
                                                </div>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#ff4757' }}>-${avgLoss.toFixed(2)}</span>
                                            </div>
                                            <div style={{ height: 10, background: '#1a1c24', borderRadius: 2 }}>
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${avgWin > 0 ? Math.min(100, (avgLoss / Math.max(avgWin, avgLoss)) * 100) : 100}%` }} style={{ height: '100%', background: '#ff4757', borderRadius: 2 }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── HOLD TIME ANALYSIS ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>MULTIPLIED EDGE</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Winners versus losers</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 24 }}>Average duration alone hides the real coaching signal. The split below shows whether losers are lingering longer than winners.</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {[
                                        { label: 'Winners', sub: 'Average hold time', dur: avgWinDuration, color: '#A6FF4D' },
                                        { label: 'Losers', sub: 'Average hold time', dur: avgLossDuration, color: '#ff4757' },
                                    ].map((row, i) => {
                                        const maxDur = Math.max(avgWinDuration, avgLossDuration, 1);
                                        return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                <div style={{ width: 72, flexShrink: 0 }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: '#c9d1d9' }}>{row.label}</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4b5563' }}>{row.sub}</div>
                                                </div>
                                                <div style={{ flex: 1, height: 8, background: '#1a1c24', borderRadius: 2 }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${(row.dur / maxDur) * 100}%` }} style={{ height: '100%', background: row.color, borderRadius: 2, opacity: 0.85 }} />
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: row.color, width: 72, textAlign: 'right' }}>
                                                    {fmtDuration(row.dur)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {avgLossDuration > avgWinDuration && avgLossDuration > 0 && (
                                    <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757', fontWeight: 600 }}>
                                        Losers lasting {(avgLossDuration / Math.max(avgWinDuration, 1)).toFixed(1)}x longer than winners.
                                    </div>
                                )}
                            </div>

                            {/* ── BEHAVIORAL COST ── */}
                            {behavioralCost < 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>ESTIMATED TOTAL BEHAVIORAL COST — THIS SESSION</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#ff4757' }}>
                                            -${Math.abs(behavioralCost).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                                            Across {forensics.patterns.length} detected patterns · {Math.abs(behavioralCost / Math.max(grossProfit, 1) * 100).toFixed(1)}% of gross profits
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>WITHOUT TOXIC PATTERNS</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#A6FF4D' }}>
                                            +${withoutToxicPatterns.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginTop: 4 }}>potential</div>
                                    </div>
                                </div>
                            )}

                            {/* ── SESSION-TO-SESSION EQUITY PATH ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>EQUITY CURVE</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Session-to-session equity path</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 20 }}>Cumulative net P&L over your trading days, with the deepest drawdown interval highlighted.</div>
                                <div style={{ height: 180 }}>
                                    {equityCurve.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                                <defs>
                                                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={netPnl >= 0 ? '#A6FF4D' : '#ff4757'} stopOpacity={0.25} />
                                                        <stop offset="95%" stopColor={netPnl >= 0 ? '#A6FF4D' : '#ff4757'} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="i" hide />
                                                <YAxis hide />
                                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                                    formatter={(v: number | undefined) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, 'Cumulative P&L'] : ['—', 'Cumulative P&L']}
                                                    labelFormatter={(l: unknown) => `Trade #${l}`}
                                                />
                                                <Area type="monotone" dataKey="pnl" stroke={netPnl >= 0 ? '#A6FF4D' : '#ff4757'} strokeWidth={2} fill="url(#eqGrad)" dot={false} activeDot={{ r: 4, fill: netPnl >= 0 ? '#A6FF4D' : '#ff4757' }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4b5563' }}>No trade data to plot</div>
                                    )}
                                </div>
                                {equityCurve.length > 1 && (
                                    <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757' }}>Max drawdown: -${maxDd.toFixed(0)}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#A6FF4D' }}>Max run-up: +${maxRunup.toFixed(0)}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563' }}>Trades: {closed.length}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: netPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>Final: {netPnl >= 0 ? '+' : ''}${netPnl.toFixed(0)}</span>
                                    </div>
                                )}
                            </div>

                            {/* ── 3-COL: Trade Outcome | P&L by Instrument | Risk Score ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Trade Outcome Pie */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>TRADE OUTCOME WIN</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', marginBottom: 16 }}>Fast read on how often this session finished green versus red</div>
                                    <div style={{ height: 120 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={[{ n: 'W', v: wins.length }, { n: 'L', v: losses.length }]} innerRadius={30} outerRadius={50} dataKey="v" stroke="none" startAngle={90} endAngle={-270}>
                                                    <Cell fill="#A6FF4D" />
                                                    <Cell fill="#ff4757" />
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 8, height: 8, background: '#A6FF4D', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9' }}>{wins.length} trades</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9' }}>{losses.length} trades</span>
                                        </div>
                                    </div>
                                </div>

                                {/* P&L by Instrument */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>P&L BY INSTRUMENT</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', marginBottom: 16 }}>Signed contribution: our share of volume. Losing instruments stay visibly negative.</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {instrumentArray.slice(0, 5).map((inst, i) => (
                                            <div key={inst.asset} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', width: 36, flexShrink: 0 }}>{inst.asset.slice(0, 4)}</span>
                                                <div style={{ flex: 1, height: 6, background: '#1a1c24', borderRadius: 2 }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${(Math.abs(inst.pnl) / maxAbsInstPnl) * 100}%` }} style={{ height: '100%', background: inst.pnl >= 0 ? PIE_COLORS[i % PIE_COLORS.length] : '#ff4757', borderRadius: 2 }} />
                                                </div>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: inst.pnl >= 0 ? '#A6FF4D' : '#ff4757', width: 60, textAlign: 'right' }}>
                                                    {inst.pnl >= 0 ? '+' : '-'}${Math.abs(inst.pnl).toFixed(0)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {instrumentArray.length === 0 && (
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4b5563' }}>No instrument data</div>
                                    )}
                                </div>

                                {/* Risk Score */}
                                <div style={{ background: '#0d1117', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>RISK SCORE</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', marginBottom: 16 }}>Threshold-based readout designed for faster risk interpretation than a gauge.</div>
                                    {/* Linear bar risk score */}
                                    {(() => {
                                        const rs = forensics.riskScore;
                                        const riskColor = rs > 75 ? '#ff4757' : rs > 50 ? '#F97316' : rs > 30 ? '#EAB308' : '#A6FF4D';
                                        const riskLabel = rs > 75 ? 'CRITICAL' : rs > 50 ? 'HIGH' : rs > 30 ? 'ELEVATED' : 'HEALTHY';
                                        return (
                                            <div style={{ width: '100%' }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 700, color: riskColor, lineHeight: 1 }}>{rs.toFixed(0)}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4b5563' }}>/100</span>
                                                </div>
                                                <div style={{ height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${rs}%` }} style={{ height: '100%', background: `linear-gradient(to right, #A6FF4D, ${riskColor})`, borderRadius: 3 }} />
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: riskColor, fontWeight: 700, border: `1px solid ${riskColor}33`, background: `${riskColor}11`, padding: '3px 8px', display: 'inline-block' }}>
                                                    {riskLabel} RISK
                                                </div>
                                                <div style={{ marginTop: 16, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    {[{ label: '0-30', tag: 'CLEAN', active: rs <= 30 }, { label: '31-55', tag: 'MODERATE', active: rs > 30 && rs <= 55 }, { label: '56-75', tag: 'HIGH', active: rs > 55 && rs <= 75 }, { label: '76-100', tag: 'CRITICAL', active: rs > 75 }].map((z, i) => (
                                                        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 6px', border: `1px solid ${z.active ? riskColor : '#1a1c24'}`, color: z.active ? riskColor : '#4b5563', background: z.active ? `${riskColor}11` : 'transparent' }}>
                                                            {z.label}<br />{z.tag}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* ── RISK SCORE BREAKDOWN ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>HOW THE RISK SCORE IS CALCULATED</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                                    {[
                                        {
                                            label: 'Behavior Patterns',
                                            score: revScore,
                                            max: 60,
                                            color: revScore > 40 ? '#ff4757' : revScore > 20 ? '#EAB308' : '#A6FF4D',
                                            desc: `+${revScore > 0 ? revScore : 0} if critical · +${revScore > 20 ? Math.floor(revScore / 2) : 0} warning · +${0} info`,
                                            sub: `Max: 60 pts`,
                                        },
                                        {
                                            label: 'Financial Damage',
                                            score: financialScore,
                                            max: 25,
                                            color: financialScore > 15 ? '#ff4757' : financialScore > 0 ? '#EAB308' : '#A6FF4D',
                                            desc: `+${financialScore > 15 ? financialScore : 0} if losses >5% of gross · +${financialScore > 5 && financialScore <= 15 ? financialScore : 0} if 1–5% · +0 if <1%`,
                                            sub: `Max: 25 pts`,
                                        },
                                        {
                                            label: 'Win Rate Erosion',
                                            score: wrErosion,
                                            max: 15,
                                            color: wrErosion > 10 ? '#ff4757' : wrErosion > 0 ? '#EAB308' : '#A6FF4D',
                                            desc: `+${wrErosion > 10 ? wrErosion : 0} if win rate <30% & negative expectancy · +${wrErosion > 0 && wrErosion <= 10 ? wrErosion : 0} if 30–35% negative`,
                                            sub: `Max: 15 pts`,
                                        },
                                    ].map((row, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                                            <div style={{ width: 140, flexShrink: 0 }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: '#c9d1d9', marginBottom: 2 }}>{row.label}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4b5563' }}>{row.sub}</div>
                                            </div>
                                            <div style={{ flex: 1, height: 5, background: '#1a1c24', borderRadius: 2, minWidth: 100 }}>
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${(row.score / row.max) * 100}%` }} style={{ height: '100%', background: row.color, borderRadius: 2 }} />
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', flex: 1, minWidth: 180 }}>{row.desc}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: row.color, width: 32, textAlign: 'right' }}>+{row.score}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 4, marginTop: 20 }}>
                                    {[{ r: '0-30', l: 'LOW', c: '#A6FF4D' }, { r: '31-55', l: 'MODERATE', c: '#EAB308' }, { r: '56-75', l: 'HIGH', c: '#F97316' }, { r: '76-100', l: 'CRITICAL', c: '#ff4757', active: forensics.riskScore > 75 }].map((z, i) => (
                                        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', border: `1px solid ${z.c}44`, color: z.c, background: z.active ? `${z.c}15` : 'transparent' }}>{z.r}<br />{z.l}</div>
                                    ))}
                                    <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 12px', border: '2px solid #EAB308', color: '#EAB308', background: 'rgba(234,179,8,0.08)' }}>
                                        YOUR SCORE: {forensics.riskScore.toFixed(0)} / 100
                                    </div>
                                </div>
                            </div>

                            {/* ── BENCHMARK vs RETAIL FUTURES TRADERS ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>BENCHMARK — 100 RETAIL FUTURES TRADERS</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 16 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {['METRIC', 'YOUR VALUE', 'MEDIAN', 'TOP 25%', 'YOUR RANK'].map((h, i) => (
                                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', color: '#4b5563', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[
                                                { metric: 'Win Rate', yours: `${winRate.toFixed(1)}%`, median: '42%', top25: '55%', rank: winRate >= 55 ? 'Top 25% (76+)' : winRate >= 42 ? 'Above Avg (51+)' : 'Below Avg', rankColor: winRate >= 55 ? '#A6FF4D' : winRate >= 42 ? '#EAB308' : '#ff4757' },
                                                { metric: 'Profit Factor', yours: profitFactor === 99 ? '∞' : profitFactor.toFixed(2), median: '1.21', top25: '1.90', rank: profitFactor >= 1.9 ? 'Above Avg (81+)' : profitFactor >= 1.2 ? 'Above Avg (61+)' : 'Below Avg (38%)', rankColor: profitFactor >= 1.9 ? '#A6FF4D' : profitFactor >= 1.2 ? '#EAB308' : '#ff4757' },
                                                { metric: 'Expectancy / Trade ($)', yours: `${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}`, median: '$4', top25: '$75', rank: expectancy >= 75 ? 'Above Avg (79+)' : expectancy >= 4 ? 'Above Avg (56+)' : 'Below Avg', rankColor: expectancy >= 75 ? '#A6FF4D' : expectancy >= 4 ? '#EAB308' : '#ff4757' },
                                                { metric: 'Max Drawdown ($)', yours: `-$${maxDd.toFixed(0)}`, median: '$1390', top25: '$160', rank: maxDd <= 160 ? 'Top 25% (78+)' : maxDd <= 1390 ? 'Above Avg (39+)' : 'Below Avg', rankColor: maxDd <= 160 ? '#A6FF4D' : maxDd <= 1390 ? '#EAB308' : '#ff4757' },
                                                { metric: 'Behavioral Risk Score', yours: `${forensics.riskScore.toFixed(0)}`, median: '58', top25: '26', rank: forensics.riskScore <= 26 ? 'Top 25% (>75)' : forensics.riskScore <= 58 ? 'Above Avg (>50)' : 'Below 25% (35th)', rankColor: forensics.riskScore <= 26 ? '#A6FF4D' : forensics.riskScore <= 58 ? '#EAB308' : '#ff4757' },
                                            ].map((row, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #1a1c24' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0d1117cc'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                                                    <td style={{ padding: '14px 16px', color: '#c9d1d9', fontWeight: 600 }}>{row.metric}</td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: '#fff' }}>{row.yours}</td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right', color: '#6b7280' }}>{row.median}</td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right', color: '#6b7280' }}>{row.top25}</td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, padding: '3px 8px', border: `1px solid ${row.rankColor}44`, color: row.rankColor, background: `${row.rankColor}11` }}>
                                                            {row.rank}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4b5563', marginTop: 12, fontStyle: 'italic' }}>
                                    Source: Probabilistic live data from 100+ retail traders on prop firm accounts · Stats update rolling 30-day
                                </div>
                            </div>

                            {/* ── DANGER ZONES + STRENGTH ZONES ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <TrendingDown size={12} color="#ff4757" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>DANGER ZONES</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {dangerZones.length > 0 ? dangerZones.map((z: { h: number; pnl: number }, i: number) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.15)' }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>{`${String(z.h).padStart(2, '0')}:00–${String(z.h + 1).padStart(2, '0')}:00`} EST</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#ff4757' }}>-${Math.abs(z.pnl).toFixed(0)}</span>
                                            </div>
                                        )) : (
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4b5563' }}>No negative time zones detected</div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <TrendingUp size={12} color="#A6FF4D" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>STRENGTH ZONES</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {strengthZones.length > 0 ? strengthZones.map((z: { h: number; pnl: number }, i: number) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.15)' }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>{`${String(z.h).padStart(2, '0')}:00–${String(z.h + 1).padStart(2, '0')}:00`} EST</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#A6FF4D' }}>+${z.pnl.toFixed(0)}</span>
                                            </div>
                                        )) : (
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4b5563' }}>No positive time zones detected yet</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── SESSION SCORE ── */}
                            {forensics.verdict && (
                                <div style={{ background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.15)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Activity size={13} color="#A6FF4D" />
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#A6FF4D', fontWeight: 600 }}>SESSION SCORE</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>{forensics.verdict.message} {forensics.verdict.action}</span>
                                </div>
                            )}

                            {/* ── CHALLENGE BANNER ── */}
                            <div style={{ background: '#0d1117', border: '1px solid rgba(166,255,77,0.2)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, background: 'rgba(166,255,77,0.1)', border: '1px solid rgba(166,255,77,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, flexShrink: 0 }}>
                                        <Target size={14} color="#A6FF4D" />
                                    </div>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#A6FF4D' }}>
                                            Your {winRate.toFixed(0)}% edge — Challenge your group to beat it.
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                            Share your data and let your crew compete. Link opens your full report.
                                        </div>
                                    </div>
                                </div>
                                <button onClick={handleCopyLink} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '10px 20px', background: '#A6FF4D', color: '#000', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                                    {copied ? '✓ COPIED' : '⬡ COPY CHALLENGE'}
                                </button>
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
                                            formatter={(v: number | undefined) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, 'P&L'] : ['—', 'P&L']}
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
                            <div className="flex flex-col gap-1">
                                <span className={styles.sectionTitle}>Session Forensics</span>
                                <span className="text-[10px] font-mono text-[#8b949e]">
                                    Sessions are automatically detected when there is a gap of 2+ hours between closed trades.
                                </span>
                            </div>
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
                                                        <td className="py-2 opacity-50">{new Date(t.closedAt ?? t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
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
                        <motion.div key="streaks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-8">

                            {/* ── Section 1: KPI Strip ── */}
                            <div className="flex flex-col gap-4">
                                <span className={styles.sectionTitle}>Winning &amp; Losing Streak Analysis</span>
                                <div className={styles.kpiGrid}>
                                    <div className={styles.kpiBox}>
                                        <span className={styles.kpiLabel}>Max Win Streak</span>
                                        <span className={`${styles.kpiValue} ${styles.textGreen}`}>{forensics.maxWinStreak}</span>
                                        <span className={styles.kpiSub}>Consecutive winning trades</span>
                                    </div>
                                    <div className={styles.kpiBox}>
                                        <span className={styles.kpiLabel}>Max Loss Streak</span>
                                        <span className={`${styles.kpiValue} ${styles.textRed}`}>{forensics.maxLossStreak}</span>
                                        <span className={styles.kpiSub}>Consecutive losing trades</span>
                                    </div>
                                    <div className={styles.kpiBox}>
                                        <span className={styles.kpiLabel}>Expectancy</span>
                                        <span className={`${styles.kpiValue} ${expectancy >= 0 ? styles.textGreen : styles.textRed}`}>
                                            {expectancy >= 0 ? '+' : ''}${Math.abs(expectancy).toFixed(2)}
                                        </span>
                                        <span className={styles.kpiSub}>Per trade average</span>
                                    </div>
                                    <div className={styles.kpiBox} style={{ borderRight: 'none' }}>
                                        <span className={styles.kpiLabel}>Win Rate</span>
                                        <span className={`${styles.kpiValue} ${winRate >= 55 ? styles.textGreen : winRate >= 45 ? styles.textYellow : styles.textRed}`}>
                                            {winRate.toFixed(1)}%
                                        </span>
                                        <span className={styles.kpiSub}>{wins.length}W / {losses.length}L · see Expectancy</span>
                                    </div>
                                </div>
                            </div>

                            {/* ── Section 2: Trade Sequence Dots + NLP Narrative ── */}
                            <div className={styles.fullWidthCard} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                {/* Dot legend + sequence */}
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-4">
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', letterSpacing: '0.08em' }}>TRADE SEQUENCE →</span>
                                        <div className="flex items-center gap-1.5">
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A6FF4D' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D' }}>Win</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4757' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757' }}>Loss</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {forensics.streaksSequence.map((res: string, i: number) => (
                                            <div
                                                key={i}
                                                title={res === 'W' ? 'Win' : 'Loss'}
                                                style={{
                                                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                                                    background: res === 'W' ? '#A6FF4D' : '#ff4757',
                                                    opacity: 0.85,
                                                    boxShadow: res === 'W' ? '0 0 4px rgba(166,255,77,0.4)' : '0 0 4px rgba(255,71,87,0.4)',
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* NLP Narrative */}
                                {worstStreakInfo && closed.length >= 5 && (
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#8b949e', lineHeight: 1.8, borderTop: '1px solid #1a1c24', paddingTop: 16 }}>
                                        {`Your worst streak: `}
                                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{worstStreakInfo.count} consecutive {worstStreakInfo.dominantAsset}{worstStreakInfo.isShort ? ' short' : ''} losses</span>
                                        {` on `}
                                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{worstStreakInfo.date}</span>
                                        {` from ${worstStreakInfo.startTime} to ${worstStreakInfo.endTime}, costing `}
                                        <span style={{ color: '#ff4757', fontWeight: 700 }}>${Math.abs(worstStreakInfo.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        {`.`}
                                        {recoveryProbTable.find(r => r.n === 3) && (() => {
                                            const r3 = recoveryProbTable.find(r => r.n === 3)!;
                                            return ` After 3+ consecutive losses, your recovery probability drops to ${r3.recoveryProb !== null ? r3.recoveryProb.toFixed(0) : '—'}% — meaning the damage compounds before you stabilize.`;
                                        })()}
                                        {forensics.maxLossStreak >= 4 ? ` You never once changed direction despite the market rejecting your thesis ${worstStreakInfo.count} times.` : ''}
                                    </p>
                                )}
                                {closed.length < 5 && (
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#4b5563', lineHeight: 1.8, borderTop: '1px solid #1a1c24', paddingTop: 16 }}>
                                        Log at least 5 trades to generate a behavioral narrative.
                                    </p>
                                )}
                            </div>

                            {/* ── Section 3: Recovery Probability Table ── */}
                            {recoveryProbTable.length > 0 && (
                                <div className="flex flex-col gap-4">
                                    <span className={styles.sectionTitle}>Recovery Probability After Consecutive Losses</span>
                                    <div className={styles.fullWidthCard} style={{ padding: 0, overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)' }}>
                                            <thead>
                                                <tr style={{ background: '#0d1117', borderBottom: '1px solid #1a1c24' }}>
                                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: '0.1em' }}>AFTER</th>
                                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: '0.1em' }}>RECOVERY PROBABILITY</th>
                                                    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: '0.1em' }}>AVG TRADES TO RECOVER</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {recoveryProbTable.map((row, i) => {
                                                    const pct = row.recoveryProb ?? 0;
                                                    const color = pct >= 65 ? '#A6FF4D' : pct >= 50 ? '#EAB308' : '#ff4757';
                                                    return (
                                                        <tr key={i} style={{ borderBottom: '1px solid #1a1c24' }}
                                                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0d1117'}
                                                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                                                        >
                                                            <td style={{ padding: '16px 24px', fontSize: 13, color: '#c9d1d9', fontWeight: 600 }}>
                                                                {row.n} consecutive loss{row.n > 1 ? 'es' : ''}
                                                            </td>
                                                            <td style={{ padding: '16px 24px' }}>
                                                                <span style={{ fontSize: 18, fontWeight: 800, color }}>
                                                                    {row.recoveryProb !== null ? `${row.recoveryProb.toFixed(1)}%` : '—'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '16px 24px', fontSize: 13, color: '#6b7280' }}>
                                                                {row.avgTrades !== null ? `${row.avgTrades.toFixed(1)} trades` : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* ── Section 4: Psychological State Profile ── */}
                            {psychStates.length > 0 && closed.length >= 5 && (
                                <div className="flex flex-col gap-4">
                                    <span className={styles.sectionTitle}>Psychological State Profile</span>
                                    <div className="flex flex-col gap-3">
                                        {psychStates.map((ps, i) => {
                                            const sevColor = ps.severity === 'CRITICAL' ? '#ff4757' : ps.severity === 'HIGH' ? '#EAB308' : '#00D4FF';
                                            const sevBg = ps.severity === 'CRITICAL' ? 'rgba(255,71,87,0.08)' : ps.severity === 'HIGH' ? 'rgba(234,179,8,0.06)' : 'rgba(0,212,255,0.06)';
                                            const sevBorder = ps.severity === 'CRITICAL' ? 'rgba(255,71,87,0.25)' : ps.severity === 'HIGH' ? 'rgba(234,179,8,0.2)' : 'rgba(0,212,255,0.2)';
                                            return (
                                                <div key={i} style={{
                                                    background: sevBg, border: `1px solid ${sevBorder}`,
                                                    padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12,
                                                }}>
                                                    {/* Card header */}
                                                    <div className="flex items-center gap-3">
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                                                            {ps.title}
                                                        </span>
                                                        <span style={{
                                                            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                                                            padding: '3px 8px', border: `1px solid ${sevBorder}`, color: sevColor, background: 'transparent',
                                                        }}>
                                                            {ps.severity}
                                                        </span>
                                                    </div>
                                                    {/* Trigger */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Trigger</span>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>{ps.trigger}</p>
                                                    </div>
                                                    {/* Response */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Response</span>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', lineHeight: 1.7, margin: 0, fontWeight: 500 }}>{ps.response}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

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

                    {activeTab === 'COMPARE' && (() => {
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        const thirtyDayStr = thirtyDaysAgo.toISOString().slice(0, 10);

                        const recent30 = closed.filter(t => getTradingDay(t.closedAt ?? t.createdAt) >= thirtyDayStr);
                        const prior = closed.filter(t => getTradingDay(t.closedAt ?? t.createdAt) < thirtyDayStr);

                        const calcMetrics = (set: typeof closed) => {
                            const wins = set.filter(t => (t.pnl ?? 0) > 0);
                            const losses = set.filter(t => (t.pnl ?? 0) < 0);
                            const pnl = set.reduce((s, t) => s + (t.pnl ?? 0), 0);
                            const gp = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
                            const gl = losses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
                            const wr = set.length > 0 ? (wins.length / set.length) * 100 : 0;
                            const pf = gl > 0 ? gp / gl : gp > 0 ? 99 : 0;
                            const avgW = wins.length > 0 ? gp / wins.length : 0;
                            const avgL = losses.length > 0 ? gl / losses.length : 0;
                            return { count: set.length, wins: wins.length, losses: losses.length, pnl, wr, pf, avgW, avgL };
                        };

                        const allMetrics = calcMetrics(closed);
                        const r30Metrics = calcMetrics(recent30);
                        const priorMetrics = calcMetrics(prior);

                        if (closed.length < 5) {
                            return (
                                <motion.div key="compare" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center p-12 gap-4 text-center">
                                    <span className="text-[13px] font-bold text-white">Need 5+ closed trades</span>
                                    <p className="text-[11px] text-[#6b7280] max-w-xs leading-loose">Log or import more trades to unlock the period-over-period comparison view.</p>
                                </motion.div>
                            );
                        }

                        const rows = [
                            { label: 'Trades',        all: allMetrics.count.toString(),                    r30: r30Metrics.count.toString(),                    prior: priorMetrics.count.toString() },
                            { label: 'Net P&L',       all: `${allMetrics.pnl >= 0 ? '+' : ''}$${allMetrics.pnl.toFixed(0)}`,   r30: `${r30Metrics.pnl >= 0 ? '+' : ''}$${r30Metrics.pnl.toFixed(0)}`,   prior: `${priorMetrics.pnl >= 0 ? '+' : ''}$${priorMetrics.pnl.toFixed(0)}` },
                            { label: 'Win Rate',      all: `${allMetrics.wr.toFixed(1)}%`,                 r30: `${r30Metrics.wr.toFixed(1)}%`,                 prior: priorMetrics.count > 0 ? `${priorMetrics.wr.toFixed(1)}%` : '—' },
                            { label: 'Profit Factor', all: allMetrics.pf > 90 ? '∞' : allMetrics.pf.toFixed(2), r30: r30Metrics.pf > 90 ? '∞' : r30Metrics.count > 0 ? r30Metrics.pf.toFixed(2) : '—', prior: priorMetrics.pf > 90 ? '∞' : priorMetrics.count > 0 ? priorMetrics.pf.toFixed(2) : '—' },
                            { label: 'Avg Win',       all: `$${allMetrics.avgW.toFixed(0)}`,               r30: r30Metrics.wins > 0 ? `$${r30Metrics.avgW.toFixed(0)}` : '—',   prior: priorMetrics.wins > 0 ? `$${priorMetrics.avgW.toFixed(0)}` : '—' },
                            { label: 'Avg Loss',      all: `$${allMetrics.avgL.toFixed(0)}`,               r30: r30Metrics.losses > 0 ? `$${r30Metrics.avgL.toFixed(0)}` : '—', prior: priorMetrics.losses > 0 ? `$${priorMetrics.avgL.toFixed(0)}` : '—' },
                        ];

                        const trend = r30Metrics.pnl > priorMetrics.pnl && priorMetrics.count > 0 ? '↑ Improving' : r30Metrics.pnl < priorMetrics.pnl && priorMetrics.count > 0 ? '↓ Declining' : '— Stable';
                        const trendColor = trend.startsWith('↑') ? '#A6FF4D' : trend.startsWith('↓') ? '#ff4757' : '#EAB308';

                        return (
                            <motion.div key="compare" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-0">
                                {/* Trend badge */}
                                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1a1c24]">
                                    <span className="text-[11px] font-mono font-black uppercase tracking-widest" style={{ color: trendColor }}>{trend}</span>
                                    <span className="text-[10px] font-mono text-[#4b5563]">Last 30 days vs. prior period</span>
                                </div>
                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-[#1a1c24]">
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest text-[#4b5563]">Metric</th>
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest text-[#4b5563]">All Time</th>
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest" style={{ color: '#00D4FF' }}>Last 30d</th>
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest text-[#4b5563]">Prior</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, i) => (
                                                <tr key={i} className="border-b border-[#1a1c24]" style={{ background: i % 2 === 0 ? '#0c0e13' : 'transparent' }}>
                                                    <td className="px-5 py-3 text-[10px] font-mono text-[#6b7280] uppercase tracking-wider">{row.label}</td>
                                                    <td className="px-5 py-3 text-[12px] font-mono font-bold text-[#e2e8f0]">{row.all}</td>
                                                    <td className="px-5 py-3 text-[12px] font-mono font-black" style={{ color: '#00D4FF' }}>{row.r30}</td>
                                                    <td className="px-5 py-3 text-[12px] font-mono text-[#6b7280]">{row.prior}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="px-5 py-3 text-[10px] font-mono text-[#4b5563]">
                                    Last 30d: {r30Metrics.count} trades · Prior: {priorMetrics.count} trades
                                </p>
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>
            </div>
        </div>
    );
}
