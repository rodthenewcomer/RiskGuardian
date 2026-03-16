'use client';

import styles from './AnalyticsPage.module.css';
import { useState, useMemo } from 'react';
import { useAppStore, getTradingDay } from '@/store/appStore';
import { generateForensics } from '@/ai/EdgeForensics';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, ReferenceLine,
    AreaChart, Area, CartesianGrid, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { Target, AlertTriangle, Download, Link2, Check, Info, TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react';
import ComposedDailyChart, { addRollingAvg } from '@/components/charts/ComposedDailyChart';
import InstrumentRadar, { type InstrumentMetric } from '@/components/charts/InstrumentRadar';
import PnLHistogram from '@/components/charts/PnLHistogram';
import DayOfWeekChart, { type DayStats } from '@/components/charts/DayOfWeekChart';
import HeatmapGrid from '@/components/charts/HeatmapGrid';
import TradeScatterChart, { type ScatterPoint } from '@/components/charts/TradeScatterChart';

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

    // ── Enriched session metrics ──
    const sessionMetrics = useMemo(() => forensics.sessions.map((s: any) => {
        const sWins = s.trades.filter((t: any) => (t.pnl ?? 0) > 0);
        const sLosses = s.trades.filter((t: any) => (t.pnl ?? 0) < 0);
        const sAvgWin = sWins.length > 0 ? sWins.reduce((acc: number, t: any) => acc + (t.pnl ?? 0), 0) / sWins.length : 0;
        const sAvgLoss = sLosses.length > 0 ? Math.abs(sLosses.reduce((acc: number, t: any) => acc + (t.pnl ?? 0), 0)) / sLosses.length : 0;
        const bestTrade = s.trades.reduce((best: any, t: any) => (t.pnl ?? 0) > (best?.pnl ?? -Infinity) ? t : best, null);
        const worstTrade = s.trades.reduce((worst: any, t: any) => (t.pnl ?? 0) < (worst?.pnl ?? Infinity) ? t : worst, null);
        // Max consecutive losses in session
        let maxConsecLoss = 0; let currLoss = 0;
        s.trades.forEach((t: any) => { if ((t.pnl ?? 0) < 0) { currLoss++; if (currLoss > maxConsecLoss) maxConsecLoss = currLoss; } else currLoss = 0; });
        // Cumulative P&L within session
        let cum = 0;
        const cumPnl = s.trades.map((t: any) => { cum += (t.pnl ?? 0); return { pnl: cum }; });
        // Profit factor
        const gross = sWins.reduce((a: number, t: any) => a + (t.pnl ?? 0), 0);
        const lossAbs = sLosses.reduce((a: number, t: any) => a + Math.abs(t.pnl ?? 0), 0);
        const pf = lossAbs > 0 ? gross / lossAbs : gross > 0 ? 99 : 0;
        // Start/end time EST
        const fmtEstTime = (iso: string) => new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        // Behavioral observation
        let obs = '';
        if (s.tag === 'REVENGE') obs = `Rapid re-entry detected after a loss. Emotional execution cost $${Math.abs(sLosses.reduce((a: number, t: any) => a + (t.pnl ?? 0), 0)).toFixed(0)} in avoidable exposure.`;
        else if (s.tag === 'CRITICAL') obs = `Session P&L exceeded critical loss threshold. Decision quality degraded significantly toward end of session.`;
        else if (s.tag === 'OVERTRADING') obs = `${s.trades.length} trades in one session is beyond optimal. Trade count dilutes your statistical edge.`;
        else if (s.pnl > 0 && sWins.length / s.trades.length >= 0.6) obs = `Clean execution. Win rate and profit factor both within elite range for this session.`;
        else obs = `Mixed session. P&L directionally positive but execution consistency has room to improve.`;
        return { ...s, sAvgWin, sAvgLoss, bestTrade, worstTrade, maxConsecLoss, cumPnl, pf, fmtEstTime, fmtDate, gross, lossAbs };
    }), [forensics.sessions]);

    // Session-level aggregate KPIs
    const greenSessions = sessionMetrics.filter((s: any) => s.pnl > 0).length;
    const redSessions = sessionMetrics.filter((s: any) => s.pnl <= 0).length;
    const avgSessionPnl = sessionMetrics.length > 0 ? sessionMetrics.reduce((a: number, s: any) => a + s.pnl, 0) / sessionMetrics.length : 0;
    const avgSessionTrades = sessionMetrics.length > 0 ? sessionMetrics.reduce((a: number, s: any) => a + s.trades.length, 0) / sessionMetrics.length : 0;
    const bestSession = sessionMetrics.length > 0 ? sessionMetrics.reduce((b: any, s: any) => s.pnl > b.pnl ? s : b, sessionMetrics[0]) : null;
    const worstSession = sessionMetrics.length > 0 ? sessionMetrics.reduce((b: any, s: any) => s.pnl < b.pnl ? s : b, sessionMetrics[0]) : null;

    // Per-session expanded state
    const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
    const toggleSession = (id: string) => setExpandedSessions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    // Per-hour granular stats (EST)
    const hourlyStats = useMemo(() => {
        const stats = Array.from({ length: 24 }, (_, h) => ({ h, pnl: 0, trades: 0, wins: 0 }));
        closed.forEach(t => {
            const estDate = new Date(new Date(t.closedAt ?? t.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const h = estDate.getHours();
            stats[h].pnl += (t.pnl ?? 0);
            stats[h].trades++;
            if ((t.pnl ?? 0) > 0) stats[h].wins++;
        });
        return stats;
    }, [closed]);
    const hourlyData = hourlyStats.map(s => ({ hour: `${String(s.h).padStart(2, '0')}:00`, h: s.h, pnl: s.pnl, trades: s.trades, wr: s.trades > 0 ? (s.wins / s.trades) * 100 : 0 }));

    // Hour × Day-of-week heatmap data
    const heatmapData = useMemo(() => {
        const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const map: Record<string, { pnl: number; trades: number }> = {};
        closed.forEach(t => {
            const estDate = new Date(new Date(t.closedAt ?? t.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const h = estDate.getHours();
            const day = DOW[estDate.getDay()];
            const key = `${day}:${h}`;
            if (!map[key]) map[key] = { pnl: 0, trades: 0 };
            map[key].pnl += (t.pnl ?? 0);
            map[key].trades++;
        });
        return Object.entries(map).map(([key, v]) => {
            const [day, hourStr] = key.split(':');
            return { day, hour: parseInt(hourStr), pnl: v.trades > 0 ? v.pnl / v.trades : 0, trades: v.trades };
        });
    }, [closed]);

    // Scatter: per-trade hour vs P&L (TIME OF DAY scatter)
    const scatterByHour = useMemo((): ScatterPoint[] => closed.map(t => {
        const estDate = new Date(new Date(t.closedAt ?? t.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const h = estDate.getHours() + estDate.getMinutes() / 60;
        const p = t.pnl ?? 0;
        return { x: h, y: p, z: Math.max(20, Math.abs(p)), label: t.asset };
    }), [closed]);

    // Scatter: per-session start-hour vs P&L (SESSIONS scatter)
    const sessionScatterData = useMemo((): ScatterPoint[] => sessionMetrics.map((s: any) => {
        const estDate = new Date(new Date(s.startTime).toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const h = estDate.getHours() + estDate.getMinutes() / 60;
        return { x: parseFloat(h.toFixed(1)), y: s.pnl, z: Math.max(20, Math.abs(s.pnl)), label: `S${sessionMetrics.indexOf(s) + 1}` };
    }), [sessionMetrics]);

    // Session windows (EST)
    const SESSION_WINDOWS = [
        { label: 'FUTURES PRE-MARKET', range: '00:00–06:00', hours: [0,1,2,3,4,5], color: '#38bdf8' },
        { label: 'FUTURES OPEN', range: '06:00–09:30', hours: [6,7,8,9], color: '#fb923c' },
        { label: 'NYSE OPEN', range: '09:30–11:00', hours: [9,10], color: '#A6FF4D' },
        { label: 'LUNCH GRIND', range: '11:00–14:00', hours: [11,12,13], color: '#EAB308' },
        { label: 'NY AFTERNOON', range: '14:00–16:00', hours: [14,15], color: '#A6FF4D' },
        { label: 'AFTER HOURS', range: '16:00–20:00', hours: [16,17,18,19], color: '#8b5cf6' },
        { label: 'EVENING', range: '20:00–23:59', hours: [20,21,22,23], color: '#6b7280' },
    ];

    // Instruments
    const instrumentMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
    closed.forEach(t => {
        if (!instrumentMap[t.asset]) instrumentMap[t.asset] = { wins: 0, losses: 0, pnl: 0 };
        instrumentMap[t.asset].pnl += (t.pnl ?? 0);
        if ((t.pnl ?? 0) >= 0) instrumentMap[t.asset].wins++;
        else instrumentMap[t.asset].losses++;
    });
    const instrumentArray = Object.keys(instrumentMap).map(k => ({ asset: k, ...instrumentMap[k] })).sort((a, b) => b.pnl - a.pnl);

    // Deep per-instrument metrics
    const instrumentDeep = useMemo(() => {
        const map: Record<string, {
            asset: string; pnl: number; wins: number; losses: number;
            avgWin: number; avgLoss: number; profitFactor: number; expectancy: number; wlRatio: number;
            maxWin: number; maxLoss: number; avgDuration: number;
            longTrades: number; shortTrades: number;
            equityCurve: { i: number; pnl: number }[];
            tradeList: typeof closed;
        }> = {};
        closed.forEach(t => {
            if (!map[t.asset]) map[t.asset] = { asset: t.asset, pnl: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, expectancy: 0, wlRatio: 0, maxWin: 0, maxLoss: 0, avgDuration: 0, longTrades: 0, shortTrades: 0, equityCurve: [], tradeList: [] };
            map[t.asset].tradeList.push(t);
        });
        return Object.values(map).map(inst => {
            const iWins = inst.tradeList.filter(t => (t.pnl ?? 0) > 0);
            const iLosses = inst.tradeList.filter(t => (t.pnl ?? 0) < 0);
            const grossW = iWins.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const grossL = iLosses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
            const aW = iWins.length > 0 ? grossW / iWins.length : 0;
            const aL = iLosses.length > 0 ? grossL / iLosses.length : 0;
            const wr = inst.tradeList.length > 0 ? (iWins.length / inst.tradeList.length) * 100 : 0;
            const pf = grossL > 0 ? grossW / grossL : grossW > 0 ? 99 : 0;
            const exp = ((wr / 100) * aW) - ((1 - wr / 100) * aL);
            let cum = 0;
            const curve = inst.tradeList.map((t, i) => { cum += (t.pnl ?? 0); return { i: i + 1, pnl: cum }; });
            return {
                ...inst,
                pnl: inst.tradeList.reduce((s, t) => s + (t.pnl ?? 0), 0),
                wins: iWins.length, losses: iLosses.length,
                avgWin: aW, avgLoss: aL,
                profitFactor: pf, expectancy: exp,
                wlRatio: aL > 0 ? aW / aL : 0,
                maxWin: iWins.length > 0 ? Math.max(...iWins.map(t => t.pnl ?? 0)) : 0,
                maxLoss: iLosses.length > 0 ? Math.max(...iLosses.map(t => Math.abs(t.pnl ?? 0))) : 0,
                avgDuration: inst.tradeList.length > 0 ? inst.tradeList.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / inst.tradeList.length : 0,
                longTrades: inst.tradeList.filter(t => !t.isShort).length,
                shortTrades: inst.tradeList.filter(t => t.isShort).length,
                winRate: wr,
                equityCurve: curve,
            };
        }).sort((a, b) => b.pnl - a.pnl);
    }, [closed]);

    // Radar-ready instrument metrics (normalized)
    const radarInstruments: InstrumentMetric[] = instrumentDeep.slice(0, 5).map(inst => ({
        asset: inst.asset,
        winRate: inst.winRate,
        profitFactor: Math.min(inst.profitFactor, 5),
        expectancy: inst.expectancy,
        wlRatio: inst.wlRatio,
        tradeCount: inst.tradeList.length,
        pnl: inst.pnl,
    }));

    // Expanded state for instrument cards
    const [expandedInstruments, setExpandedInstruments] = useState<Set<string>>(new Set());
    const toggleInstrument = (asset: string) => setExpandedInstruments(prev => { const n = new Set(prev); n.has(asset) ? n.delete(asset) : n.add(asset); return n; });

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

    // Daily enriched for ComposedDailyChart (adds trade count)
    const dailyEnriched = useMemo(() => dailyData.map(d => ({ ...d, count: dailyMap[d.date]?.count ?? 0 })), [dailyData, dailyMap]);
    const dailyWithRolling = useMemo(() => addRollingAvg(dailyEnriched, 5), [dailyEnriched]);

    // Day-of-week breakdown
    const dayOfWeekStats = useMemo((): DayStats[] => {
        const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const map: Record<string, { pnl: number; trades: number; wins: number }> = {};
        closed.forEach(t => {
            const dt = new Date(getTradingDay(t.closedAt ?? t.createdAt) + 'T12:00:00Z');
            const day = DOW[dt.getUTCDay()];
            if (!map[day]) map[day] = { pnl: 0, trades: 0, wins: 0 };
            map[day].pnl += (t.pnl ?? 0);
            map[day].trades++;
            if ((t.pnl ?? 0) > 0) map[day].wins++;
        });
        return Object.entries(map).map(([day, v]) => ({ day, pnl: v.pnl, trades: v.trades, wins: v.wins, wr: v.trades > 0 ? (v.wins / v.trades) * 100 : 0 }));
    }, [closed]);

    // Monthly breakdown
    const monthlyBreakdown = useMemo(() => {
        const map: Record<string, { pnl: number; trades: number; wins: number; days: Set<string> }> = {};
        closed.forEach(t => {
            const d = getTradingDay(t.closedAt ?? t.createdAt);
            const ym = d.slice(0, 7);
            if (!map[ym]) map[ym] = { pnl: 0, trades: 0, wins: 0, days: new Set() };
            map[ym].pnl += (t.pnl ?? 0);
            map[ym].trades++;
            if ((t.pnl ?? 0) > 0) map[ym].wins++;
            map[ym].days.add(d);
        });
        return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([ym, v]) => ({
            month: new Date(ym + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            ym, pnl: v.pnl, trades: v.trades,
            wr: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
            days: v.days.size,
        }));
    }, [closed]);

    // P&L values for histogram
    const allPnlValues = useMemo(() => closed.map(t => t.pnl ?? 0), [closed]);

    // Win/loss day counts
    const greenDays = dailyData.filter(d => d.pnl > 0).length;
    const redDays = dailyData.filter(d => d.pnl < 0).length;
    const flatDays = dailyData.filter(d => d.pnl === 0).length;
    const dayWinRate = dailyData.length > 0 ? (greenDays / dailyData.length) * 100 : 0;

    // Longest green/red day streak
    const longestGreenDayStreak = (() => {
        let max = 0; let cur = 0;
        dailyData.forEach(d => { if (d.pnl > 0) { cur++; if (cur > max) max = cur; } else cur = 0; });
        return max;
    })();
    const longestRedDayStreak = (() => {
        let max = 0; let cur = 0;
        dailyData.forEach(d => { if (d.pnl < 0) { cur++; if (cur > max) max = cur; } else cur = 0; });
        return max;
    })();

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

    // Streak runs: consecutive sequences of W or L
    const streakRuns = useMemo(() => {
        const seq = closed.map(t => (t.pnl ?? 0) >= 0 ? 'W' : 'L');
        const runs: { type: 'W' | 'L'; length: number; pnl: number; startIdx: number }[] = [];
        let i = 0;
        while (i < seq.length) {
            let j = i;
            while (j < seq.length && seq[j] === seq[i]) j++;
            const run = closed.slice(i, j);
            runs.push({ type: seq[i] as 'W' | 'L', length: j - i, pnl: run.reduce((s, t) => s + (t.pnl ?? 0), 0), startIdx: i });
            i = j;
        }
        return runs;
    }, [closed]);

    // Streak length distribution — grouped bar data
    const streakLengthDist = useMemo(() => {
        const MAX = 6;
        const wc = Array(MAX + 1).fill(0);
        const lc = Array(MAX + 1).fill(0);
        streakRuns.forEach(r => {
            const b = Math.min(r.length, MAX);
            if (r.type === 'W') wc[b]++; else lc[b]++;
        });
        return Array.from({ length: MAX }, (_, i) => ({
            len: i + 1 < MAX ? `${i + 1}` : `${MAX}+`,
            wins: wc[i + 1],
            losses: lc[i + 1],
        }));
    }, [streakRuns]);

    // Streak P&L impact — how much each run earned/lost (top 10 by abs)
    const streakImpactData = useMemo(() =>
        [...streakRuns]
            .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
            .slice(0, 10)
            .map((r, i) => ({ name: `${r.type}${r.length}·${i}`, type: r.type, length: r.length, pnl: r.pnl })),
        [streakRuns]);

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
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>to</span>
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
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em' }}>{p.freq} DETECTED · {forensics.patterns.length} TOTAL</span>
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
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{k.sub}</span>
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
                                            <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em' }}>{l}</div>
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
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#A6FF4D' }}>{wins.length} trades</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ff4757' }}>{losses.length} trades</span>
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>
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
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#A6FF4D' }}>Avg win</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#A6FF4D', opacity: 0.65 }}>{wins.length} winning trades</span>
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
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757' }}>Avg loss</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757', opacity: 0.65 }}>{losses.length} losing trades</span>
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
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>{row.sub}</div>
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
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>No trade data to plot</div>
                                    )}
                                </div>
                                {equityCurve.length > 1 && (
                                    <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757' }}>Max drawdown: -${maxDd.toFixed(0)}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#A6FF4D' }}>Max run-up: +${maxRunup.toFixed(0)}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>Trades: {closed.length}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: netPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>Final: {netPnl >= 0 ? '+' : ''}${netPnl.toFixed(0)}</span>
                                    </div>
                                )}
                                {equityCurve.length > 1 && (
                                    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>WHAT THIS MEANS</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                {netPnl >= 0
                                                    ? <>Equity is <strong style={{ color: '#A6FF4D' }}>net positive</strong>. Max drawdown was <strong style={{ color: '#ff4757' }}>-${maxDd.toFixed(0)}</strong> — a {maxRunup > 0 ? ((maxDd / maxRunup) * 100).toFixed(0) : 0}% retracement of your peak. A smooth rising curve = consistent edge. A jagged one = high variance — you may be getting lucky with large outlier wins.</>
                                                    : <>Equity is <strong style={{ color: '#ff4757' }}>net negative</strong> at ${netPnl.toFixed(0)}. The curve shape tells you whether losses are concentrated (a few blowouts) or systematic (steady bleed). Max drawdown hit <strong style={{ color: '#ff4757' }}>-${maxDd.toFixed(0)}</strong>.</>}
                                            </p>
                                        </div>
                                        <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                {maxDd > 0 && netPnl > 0
                                                    ? `Your max drawdown is -$${maxDd.toFixed(0)} — ${((maxDd / netPnl) * 100).toFixed(0)}% of net profit. Set a hard drawdown ceiling at -$${Math.round(maxDd * 0.6)} to protect gains. If hit, reduce position size by 50% for the rest of the session.`
                                                    : maxDd > 0
                                                    ? `Max drawdown -$${maxDd.toFixed(0)} with negative net P&L signals a structural problem. Reduce all trade sizes by 30% immediately and re-evaluate edge by reviewing PATTERNS tab.`
                                                    : 'Log more trades to see drawdown analysis.'}
                                            </p>
                                        </div>
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
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#A6FF4D' }}>{wins.length} trades</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757' }}>{losses.length} trades</span>
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
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>No instrument data</div>
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
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>/100</span>
                                                </div>
                                                <div style={{ height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${rs}%` }} style={{ height: '100%', background: `linear-gradient(to right, #A6FF4D, ${riskColor})`, borderRadius: 3 }} />
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: riskColor, fontWeight: 700, border: `1px solid ${riskColor}33`, background: `${riskColor}11`, padding: '3px 8px', display: 'inline-block' }}>
                                                    {riskLabel} RISK
                                                </div>
                                                <div style={{ marginTop: 16, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    {[{ label: '0-30', tag: 'CLEAN', active: rs <= 30 }, { label: '31-55', tag: 'MODERATE', active: rs > 30 && rs <= 55 }, { label: '56-75', tag: 'HIGH', active: rs > 55 && rs <= 75 }, { label: '76-100', tag: 'CRITICAL', active: rs > 75 }].map((z, i) => (
                                                        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 6px', border: `1px solid ${z.active ? riskColor : '#1a1c24'}`, color: z.active ? riskColor : '#6b7280', background: z.active ? `${riskColor}11` : 'transparent' }}>
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
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>{row.sub}</div>
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
                                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase' }}>{h}</th>
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
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', marginTop: 12, fontStyle: 'italic' }}>
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
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>No negative time zones detected</div>
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
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>No positive time zones detected yet</div>
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
                        <motion.div key="daily" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── HEADER ── */}
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>DAILY P&L INTELLIGENCE</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Daily Performance Breakdown</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>
                                    {dailyData.length} trading day{dailyData.length !== 1 ? 's' : ''} · bars show daily net P&L · dashed line = 5-day rolling average · day-of-week and distribution analysis below
                                </div>
                            </div>

                            {/* ── 8-KPI GRID ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: 'BEST DAY', value: bestDay > 0 ? `+$${bestDay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', sub: bestDayDate ? new Date(bestDayDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—', color: '#A6FF4D' },
                                    { label: 'WORST DAY', value: worstDay < 0 ? `-$${Math.abs(worstDay).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', sub: worstDayDate ? new Date(worstDayDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—', color: '#ff4757' },
                                    { label: 'AVG DAILY P&L', value: avgDaily !== 0 ? `${avgDaily >= 0 ? '+' : ''}$${Math.abs(avgDaily).toFixed(2)}` : '—', sub: `Median: ${medianDaily >= 0 ? '+' : ''}$${Math.abs(medianDaily).toFixed(2)}`, color: avgDaily >= 0 ? '#A6FF4D' : '#ff4757' },
                                    { label: 'DAILY VOLATILITY', value: dailyVolatility > 0 ? `±$${dailyVolatility.toFixed(0)}` : '—', sub: `${daysWithin1Std}% days within 1σ`, color: '#EAB308' },
                                    { label: 'GREEN DAYS', value: `${greenDays}`, sub: `${dayWinRate.toFixed(0)}% of ${dailyData.length} days`, color: '#A6FF4D' },
                                    { label: 'RED DAYS', value: `${redDays}`, sub: `${(100 - dayWinRate).toFixed(0)}% of ${dailyData.length} days`, color: '#ff4757' },
                                    { label: 'LONGEST GREEN STREAK', value: `${longestGreenDayStreak}d`, sub: 'Consecutive profitable days', color: '#A6FF4D' },
                                    { label: 'LONGEST RED STREAK', value: `${longestRedDayStreak}d`, sub: 'Consecutive losing days', color: longestRedDayStreak >= 3 ? '#ff4757' : '#EAB308' },
                                ].map((k, i) => (
                                    <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{k.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── MAIN CHART: ComposedChart bar + rolling avg ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>NET P&L PER TRADING DAY</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9' }}>Bars = daily P&L · Yellow dashed = 5-day rolling average</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16 }}>
                                        {[{ color: '#A6FF4D', label: 'Profitable day' }, { color: '#ff4757', label: 'Loss day' }, { color: '#EAB308', label: '5d avg', dash: true }].map((l, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 20, height: 2, background: l.color, borderTop: l.dash ? '2px dashed' : undefined, borderColor: l.color }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: l.color }}>{l.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <ComposedDailyChart data={dailyEnriched.slice(-60)} height={280} rollingWindow={5} />
                                {/* Interpretation */}
                                {dailyData.length >= 3 && (
                                    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>WHAT THIS MEANS</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                {greenDays > redDays
                                                    ? <>Your day win rate is <strong style={{ color: '#A6FF4D' }}>{dayWinRate.toFixed(0)}%</strong> ({greenDays} green vs {redDays} red). The 5-day rolling average shows whether your edge is improving or degrading over time — watch its slope, not just daily bars.</>
                                                    : <>Your day win rate is <strong style={{ color: '#ff4757' }}>{dayWinRate.toFixed(0)}%</strong> ({greenDays} green vs {redDays} red). More red days than green is a structural issue, not variance — look for recurring calendar patterns below.</>}
                                            </p>
                                        </div>
                                        <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                {avgDaily > 0
                                                    ? `Average daily P&L is +$${avgDaily.toFixed(0)} — protect it with a daily loss floor of -$${Math.round(avgDaily * 1.5)}. If the 5d average line trends down for 3+ bars, cut position size 30% until it flattens.`
                                                    : `Average daily P&L is -$${Math.abs(avgDaily).toFixed(0)}. Immediately set a daily max-loss of $${Math.round(Math.abs(avgDaily) * 0.7)} and halt trading once hit. Review the day-of-week breakdown below for structural patterns.`}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 2-COL: Day of Week P&L + Day of Week Win Rate ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>DAY-OF-WEEK EDGE BREAKDOWN</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 4 }}>Net P&L and win rate per weekday — reveals calendar biases in your execution</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginBottom: 20 }}>Left bar = total P&L accumulated that day · Right bar = win rate percentage · A day with high P&L but low win rate means wins are large, losses frequent</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>P&L BY WEEKDAY</div>
                                        <DayOfWeekChart data={dayOfWeekStats} metric="pnl" height={160} />
                                    </div>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>WIN RATE BY WEEKDAY · 50% = break-even</div>
                                        <DayOfWeekChart data={dayOfWeekStats} metric="wr" height={160} />
                                    </div>
                                </div>
                                {dayOfWeekStats.length >= 3 && (() => {
                                    const best = [...dayOfWeekStats].sort((a, b) => b.pnl - a.pnl)[0];
                                    const worst = [...dayOfWeekStats].sort((a, b) => a.pnl - b.pnl)[0];
                                    const trapDay = dayOfWeekStats.find(d => d.trades >= 3 && (d.wins / d.trades) * 100 < 40);
                                    return (
                                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>WHAT THIS MEANS</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    <strong style={{ color: '#A6FF4D' }}>{best.day}</strong> is your strongest day (+${best.pnl.toFixed(0)} · {best.trades > 0 ? ((best.wins / best.trades) * 100).toFixed(0) : 0}% WR). <strong style={{ color: '#ff4757' }}>{worst.day}</strong> is your worst (${worst.pnl.toFixed(0)}). {trapDay ? <><strong style={{ color: '#ff4757' }}>{trapDay.day}</strong> is a statistical trap with &lt;40% WR over {trapDay.trades} trades.</> : 'No weekday has dropped below 40% WR over 3+ samples.'}
                                                </p>
                                            </div>
                                            <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                    {trapDay
                                                        ? `${trapDay.day} has a sub-40% win rate — implement a soft trading ban until WR improves over 15+ samples. Add 20% to your position size on ${best.day} to compound your strongest day.`
                                                        : `All active days are above 40% WR — no hard bans needed. Incrementally increase size on ${best.day} while monitoring. Review if ${worst.day} dips below 40% WR.`}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* ── P&L DISTRIBUTION HISTOGRAM ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>DAILY P&L DISTRIBUTION</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 6 }}>Frequency of each P&L range — reveals clustering, fat tails, and outlier days</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 16 }}>A healthy distribution clusters tightly to the right of zero. Wide spread = high variance = unpredictable edge.</div>
                                <PnLHistogram pnlValues={dailyData.map(d => d.pnl)} buckets={16} height={140} />
                                <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'BEST SINGLE DAY', v: `+$${bestDay.toFixed(0)}`, c: '#A6FF4D' },
                                        { label: 'WORST SINGLE DAY', v: `-$${Math.abs(worstDay).toFixed(0)}`, c: '#ff4757' },
                                        { label: 'RANGE', v: `$${(bestDay - worstDay).toFixed(0)}`, c: '#EAB308' },
                                        { label: 'STD DEV', v: `±$${dailyVolatility.toFixed(0)}`, c: '#c9d1d9' },
                                    ].map((k, i) => (
                                        <div key={i}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>{k.label}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: k.c }}>{k.v}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── MONTHLY BREAKDOWN ── */}
                            {monthlyBreakdown.length > 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>MONTHLY SUMMARY</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>Net result aggregated by calendar month</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {monthlyBreakdown.map((m, i) => (
                                            <div key={i} style={{ flex: '1 1 120px', background: '#0b0e14', border: `1px solid ${m.pnl >= 0 ? 'rgba(166,255,77,0.2)' : 'rgba(255,71,87,0.2)'}`, padding: '12px 14px' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 4 }}>{m.month}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: m.pnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                    {m.pnl >= 0 ? '+' : ''}${Math.abs(m.pnl).toFixed(0)}
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', marginTop: 4 }}>
                                                    {m.trades}T · {m.wr.toFixed(0)}%WR · {m.days}d
                                                </div>
                                                <div style={{ marginTop: 6, height: 3, background: '#1a1c24', borderRadius: 1 }}>
                                                    <div style={{ height: '100%', width: `${m.wr}%`, background: m.pnl >= 0 ? '#A6FF4D' : '#ff4757', borderRadius: 1, opacity: 0.7 }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── WEEKLY BREAKDOWN TABLE ── */}
                            {weeklyBreakdown.length > 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>WEEKLY PERFORMANCE BREAKDOWN</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>Week-over-week P&L, best/worst day per week, and behavioral flags</div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                    {['WEEK', 'DAYS', 'NET P&L', 'BEST DAY', 'WORST DAY', 'WIN %', 'FLAG'].map((h, i) => (
                                                        <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {weeklyBreakdown.map((w, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #1a1c24' }}
                                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0f1420'}
                                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                                                        <td style={{ padding: '12px 16px', color: '#c9d1d9', fontWeight: 600, whiteSpace: 'nowrap' }}>{w.weekStart} → {w.weekEnd}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>{w.numDays}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: w.netPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                            {w.netPnl >= 0 ? '+' : ''}${Math.abs(w.netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#A6FF4D' }}>+${w.bestDayPnl.toFixed(0)}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ff4757' }}>-${Math.abs(w.worstDayPnl).toFixed(0)}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: w.winRate >= 55 ? '#A6FF4D' : w.winRate >= 45 ? '#EAB308' : '#ff4757' }}>{w.winRate.toFixed(1)}%</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                            {w.flag && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', border: `1px solid ${w.flagSev === 'critical' ? 'rgba(255,71,87,0.4)' : w.flagSev === 'warning' ? 'rgba(234,179,8,0.4)' : 'rgba(166,255,77,0.3)'}`, color: w.flagSev === 'critical' ? '#ff4757' : w.flagSev === 'warning' ? '#EAB308' : '#A6FF4D', background: w.flagSev === 'critical' ? 'rgba(255,71,87,0.08)' : w.flagSev === 'warning' ? 'rgba(234,179,8,0.06)' : 'rgba(166,255,77,0.06)', whiteSpace: 'nowrap' }}>{w.flag}</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* ── ACTIONABLE RULES ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>DAILY RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        { rule: 'RULE 01 — DAILY LOSS LIMIT', detail: `Your worst day was -$${Math.abs(worstDay).toFixed(0)}. Set a hard daily stop at $${Math.round(Math.abs(worstDay) * 0.5)} — 50% of your worst day. Walk away when hit. A single blowout day erases multiple good days.`, icon: '⛔', color: '#ff4757' },
                                        { rule: 'RULE 02 — TARGET & WALK RULE', detail: `Best day was +$${bestDay.toFixed(0)}. Once you hit ${(bestDay * 0.6).toFixed(0)} in a day, cut position size by half. Don't give back your edge trying to maximize a good day.`, icon: '→', color: '#A6FF4D' },
                                        {
                                            rule: `RULE 03 — ${dayOfWeekStats.sort((a, b) => a.pnl - b.pnl)[0]?.day ?? 'WORST DAY'} CAUTION`,
                                            detail: `${dayOfWeekStats.sort((a, b) => a.pnl - b.pnl)[0]?.day ?? 'Your worst weekday'} is your statistically worst day. Trade reduced size or skip this day entirely until win rate exceeds 50% over 20+ samples.`,
                                            icon: '⏸', color: '#EAB308',
                                        },
                                        { rule: 'RULE 04 — STREAK PROTECTION', detail: `${longestRedDayStreak >= 2 ? `Your longest red day streak was ${longestRedDayStreak} consecutive days. After 2 red days in a row, cut daily trade limit by 50% until you record a green day.` : 'No prolonged red day streaks detected. Maintain current daily discipline.'}`, icon: '✓', color: '#c9d1d9' },
                                    ].map((r, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', background: '#0b0e14', borderLeft: `2px solid ${r.color}55` }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: r.color, flexShrink: 0, width: 20 }}>{r.icon}</span>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: r.color, letterSpacing: '0.08em', marginBottom: 4 }}>{r.rule}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>{r.detail}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </motion.div>
                    )}

                    {activeTab === 'INSTRUMENTS' && (
                        <motion.div key="instruments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── HEADER ── */}
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>INSTRUMENT INTELLIGENCE</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Performance by Instrument</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>
                                    {instrumentDeep.length} instrument{instrumentDeep.length !== 1 ? 's' : ''} traded · radar shows multi-dimensional strength · click any row to expand full drill-down
                                </div>
                            </div>

                            {/* ── 4-KPI STRIP ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: 'INSTRUMENTS TRADED', value: `${instrumentDeep.length}`, sub: `${instrumentDeep.filter(i => i.pnl >= 0).length} profitable`, color: '#c9d1d9' },
                                    { label: 'BEST INSTRUMENT', value: instrumentDeep[0]?.asset ?? '—', sub: instrumentDeep[0] ? `+$${instrumentDeep[0].pnl.toFixed(0)} net` : '—', color: '#A6FF4D' },
                                    { label: 'WORST INSTRUMENT', value: instrumentDeep[instrumentDeep.length - 1]?.asset ?? '—', sub: instrumentDeep[instrumentDeep.length - 1]?.pnl < 0 ? `-$${Math.abs(instrumentDeep[instrumentDeep.length - 1].pnl).toFixed(0)} net` : '—', color: '#ff4757' },
                                    { label: 'MOST TRADED', value: [...instrumentDeep].sort((a, b) => b.tradeList.length - a.tradeList.length)[0]?.asset ?? '—', sub: `${[...instrumentDeep].sort((a, b) => b.tradeList.length - a.tradeList.length)[0]?.tradeList.length ?? 0} trades`, color: '#c9d1d9' },
                                ].map((k, i) => (
                                    <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{k.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── RADAR + PNL BARS ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: instrumentDeep.length >= 2 ? '1fr 1fr' : '1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Radar chart */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>MULTI-METRIC RADAR</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 6 }}>5-axis normalized comparison — Win Rate · PF · Expectancy · W/L · Volume</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginBottom: 8 }}>A bar chart shows one metric. This radar shows which instrument dominates across ALL dimensions simultaneously.</div>
                                    <InstrumentRadar instruments={radarInstruments} height={280} />
                                </div>
                                {/* P&L diverging bars */}
                                <div style={{ background: '#0d1117', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>NET P&L RANKING</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>Signed contribution per instrument — diverging from zero</div>
                                    <div style={{ height: 280 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={instrumentDeep.slice(0, 8).map(i => ({ asset: i.asset, pnl: i.pnl, wr: i.winRate }))} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 0 }} barCategoryGap="25%">
                                                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" horizontal={false} />
                                                <XAxis type="number" tick={{ fontSize: 9, fill: '#6b7280', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} />
                                                <YAxis type="category" dataKey="asset" tick={{ fontSize: 10, fill: '#8b949e', fontFamily: 'var(--font-mono)', fontWeight: 600 }} axisLine={false} tickLine={false} width={40} />
                                                <ReferenceLine x={0} stroke="rgba(255,255,255,0.12)" />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0 }}
                                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                                    formatter={(v: number | undefined, _n: unknown, props: { payload?: { wr: number } }) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)} · ${props.payload?.wr.toFixed(0) ?? 0}% WR`, 'P&L'] : ['—', 'P&L']}
                                                />
                                                <Bar dataKey="pnl" radius={[0, 2, 2, 0]}>
                                                    {instrumentDeep.slice(0, 8).map((inst, i) => (
                                                        <Cell key={i} fill={inst.pnl >= 0 ? 'rgba(166,255,77,0.85)' : 'rgba(255,71,87,0.85)'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* ── INSTRUMENT COMPARISON TABLE ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>FULL INSTRUMENT SCORECARD</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {['INSTRUMENT', 'TRADES', 'WIN RATE', 'NET P&L', 'PROFIT FACTOR', 'AVG WIN', 'AVG LOSS', 'EXPECTANCY', 'LONG/SHORT', 'VERDICT'].map((h, i) => (
                                                    <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {instrumentDeep.map((inst, i) => {
                                                const verdict = inst.pnl > 0 && inst.winRate >= 55 && inst.profitFactor >= 1.5 ? 'EDGE' : inst.pnl > 0 && inst.winRate >= 45 ? 'PLAYABLE' : inst.pnl > 0 ? 'MARGINAL' : inst.winRate >= 50 ? 'MIXED' : 'CUT';
                                                const vColor = verdict === 'EDGE' ? '#A6FF4D' : verdict === 'PLAYABLE' ? 'rgba(166,255,77,0.6)' : verdict === 'MARGINAL' ? '#EAB308' : verdict === 'MIXED' ? '#fb923c' : '#ff4757';
                                                return (
                                                    <tr key={inst.asset} style={{ borderBottom: '1px solid #1a1c24', cursor: 'pointer' }}
                                                        onClick={() => toggleInstrument(inst.asset)}
                                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0f1420'}
                                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                                                        <td style={{ padding: '12px 12px', color: '#fff', fontWeight: 700 }}>
                                                            {inst.asset}
                                                            <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>{expandedInstruments.has(inst.asset) ? '▲' : '▼'}</span>
                                                        </td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: '#6b7280' }}>{inst.tradeList.length}</td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: inst.winRate >= 55 ? '#A6FF4D' : inst.winRate >= 45 ? '#EAB308' : '#ff4757' }}>{inst.winRate.toFixed(0)}%</td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: inst.pnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                            {inst.pnl >= 0 ? '+' : '-'}${Math.abs(inst.pnl).toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: inst.profitFactor >= 1.5 ? '#A6FF4D' : inst.profitFactor >= 1 ? '#EAB308' : '#ff4757' }}>
                                                            {inst.profitFactor === 99 ? '∞' : inst.profitFactor.toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: '#A6FF4D' }}>+${inst.avgWin.toFixed(0)}</td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: '#ff4757' }}>-${inst.avgLoss.toFixed(0)}</td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: inst.expectancy >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                            {inst.expectancy >= 0 ? '+' : ''}${inst.expectancy.toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: '#6b7280', fontSize: 10 }}>
                                                            <span style={{ color: '#fb923c' }}>{inst.longTrades}L</span> / <span style={{ color: '#38bdf8' }}>{inst.shortTrades}S</span>
                                                        </td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                                                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', border: `1px solid ${vColor}44`, color: vColor, background: `${vColor}11`, letterSpacing: '0.06em' }}>{verdict}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* ── EXPANDED INSTRUMENT DRILL-DOWN ── */}
                            {instrumentDeep.filter(inst => expandedInstruments.has(inst.asset)).map((inst, idx) => (
                                <div key={inst.asset} style={{ background: '#0d1117', border: '1px solid rgba(166,255,77,0.15)', overflow: 'hidden' }}>
                                    <div style={{ padding: '16px 24px', background: '#0b0e14', borderBottom: '1px solid #1a1c24', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff' }}>{inst.asset} — Deep Dive</div>
                                        <button onClick={() => toggleInstrument(inst.asset)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', background: 'none', border: '1px solid #1a1c24', padding: '4px 10px', cursor: 'pointer' }}>COLLAPSE ▲</button>
                                    </div>
                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        {/* 6-metric mini grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: '#1a1c24' }}>
                                            {[
                                                { label: 'BEST TRADE', value: `+$${inst.maxWin.toFixed(0)}`, color: '#A6FF4D' },
                                                { label: 'WORST TRADE', value: `-$${inst.maxLoss.toFixed(0)}`, color: '#ff4757' },
                                                { label: 'AVG DURATION', value: fmtDuration(inst.avgDuration), color: '#c9d1d9' },
                                                { label: 'LONG TRADES', value: `${inst.longTrades}`, color: '#fb923c' },
                                                { label: 'SHORT TRADES', value: `${inst.shortTrades}`, color: '#38bdf8' },
                                                { label: 'W/L RATIO', value: inst.wlRatio > 0 ? `${inst.wlRatio.toFixed(2)}:1` : '—', color: inst.wlRatio >= 1.5 ? '#A6FF4D' : inst.wlRatio >= 1 ? '#EAB308' : '#ff4757' },
                                            ].map((k, i) => (
                                                <div key={i} style={{ padding: '12px 14px', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: k.color }}>{k.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Equity curve for this instrument */}
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>INSTRUMENT EQUITY CURVE</div>
                                            <div style={{ height: 100, background: '#0b0e14', padding: '8px 0' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={inst.equityCurve} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                                        <defs>
                                                            <linearGradient id={`ig${idx}`} x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor={inst.pnl >= 0 ? '#A6FF4D' : '#ff4757'} stopOpacity={0.2} />
                                                                <stop offset="95%" stopColor={inst.pnl >= 0 ? '#A6FF4D' : '#ff4757'} stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                                                        <Area type="monotone" dataKey="pnl" stroke={inst.pnl >= 0 ? '#A6FF4D' : '#ff4757'} strokeWidth={1.5} fill={`url(#ig${idx})`} dot={false} />
                                                        <Tooltip contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: 'var(--font-mono)', fontSize: 10, borderRadius: 0 }} formatter={(v: number | undefined) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, 'Running P&L'] : ['—', 'Running P&L']} labelFormatter={(l: unknown) => `Trade ${l}`} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        {/* P&L distribution for this instrument */}
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>TRADE P&L DISTRIBUTION — {inst.asset}</div>
                                            <PnLHistogram pnlValues={inst.tradeList.map(t => t.pnl ?? 0)} buckets={12} height={100} />
                                        </div>

                                        {/* Coaching */}
                                        <div style={{ background: 'rgba(166,255,77,0.03)', border: '1px solid rgba(166,255,77,0.12)', padding: '14px 16px' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>COACHING ACTION — {inst.asset}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8 }}>
                                                {inst.pnl > 0 && inst.winRate >= 55 && inst.profitFactor >= 1.5
                                                    ? `→ ${inst.asset} is your strongest instrument across all metrics (${inst.winRate.toFixed(0)}% WR, ${inst.profitFactor.toFixed(2)} PF). Allocate your highest conviction sizing here. Consider adding to your session plan specifically when ${inst.asset} is in structure.`
                                                    : inst.pnl > 0 && inst.winRate >= 45
                                                    ? `→ ${inst.asset} is playable but not optimal — ${inst.winRate.toFixed(0)}% WR and ${inst.profitFactor.toFixed(2)} PF show edge that needs refinement. Focus on entry precision before increasing size.`
                                                    : inst.pnl < 0
                                                    ? `→ ${inst.asset} is a net loss instrument (-$${Math.abs(inst.pnl).toFixed(0)}). Remove it from your active trade list immediately. Your capital deployed here would have been better used in your profitable instruments.`
                                                    : `→ ${inst.asset} shows mixed results. Do not increase size until WR exceeds 50% over 20+ trades and expectancy is consistently positive.`
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* ── ACTIONABLE RULES ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>INSTRUMENT RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        {
                                            rule: `RULE 01 — FOCUS ON YOUR EDGE`,
                                            detail: `${instrumentDeep[0]?.asset ?? 'Your best instrument'} is your highest-edge instrument. Minimum 60% of session allocation should go here until you demonstrate consistent edge in other instruments.`,
                                            icon: '→', color: '#A6FF4D',
                                        },
                                        {
                                            rule: `RULE 02 — CUT DEAD INSTRUMENTS`,
                                            detail: `${instrumentDeep.filter(i => i.pnl < 0).map(i => i.asset).join(', ') || 'None'} ${instrumentDeep.filter(i => i.pnl < 0).length > 0 ? 'are net negative — remove from your active list until you identify why these are failing.' : '— all instruments are currently profitable.'}`,
                                            icon: '⛔', color: '#ff4757',
                                            show: instrumentDeep.filter(i => i.pnl < 0).length > 0,
                                        },
                                        {
                                            rule: `RULE 03 — DIRECTION DISCIPLINE`,
                                            detail: `Check your long vs short split per instrument. Direction bias (e.g., always longing a downtrending asset) is a silent P&L killer. Match direction to market structure, not habit.`,
                                            icon: '⏸', color: '#EAB308',
                                        },
                                        {
                                            rule: `RULE 04 — INSTRUMENT FOCUS CAP`,
                                            detail: `You're trading ${instrumentDeep.length} instrument${instrumentDeep.length > 1 ? 's' : ''}. ${instrumentDeep.length > 3 ? `Consider reducing to your top 2-3 for the next 30 days. More instruments = more context switching = diluted edge.` : 'Current instrument count is within optimal range for focused execution.'}`,
                                            icon: '✓', color: '#c9d1d9',
                                        },
                                    ].filter(r => (r as any).show !== false).map((r, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', background: '#0b0e14', borderLeft: `2px solid ${r.color}55` }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: r.color, flexShrink: 0, width: 20 }}>{r.icon}</span>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: r.color, letterSpacing: '0.08em', marginBottom: 4 }}>{r.rule}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>{r.detail}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </motion.div>
                    )}

                    {activeTab === 'SESSIONS' && (
                        <motion.div key="sessions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── HEADER ── */}
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>SESSION FORENSICS</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Trading Session Analysis</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>
                                    Sessions auto-detected from 2h+ inactivity gaps. Each session is independently profiled for behavioral quality, edge consistency, and coaching signal.
                                </div>
                            </div>

                            {/* ── 8-KPI GRID ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: 'TOTAL SESSIONS', value: `${sessionMetrics.length}`, sub: `${greenSessions} green · ${redSessions} red`, color: '#c9d1d9' },
                                    { label: 'SESSION WIN RATE', value: sessionMetrics.length > 0 ? `${((greenSessions / sessionMetrics.length) * 100).toFixed(0)}%` : '—', sub: `${greenSessions} profitable sessions`, color: greenSessions >= redSessions ? '#A6FF4D' : '#ff4757' },
                                    { label: 'AVG SESSION P&L', value: avgSessionPnl !== 0 ? `${avgSessionPnl >= 0 ? '+' : ''}$${avgSessionPnl.toFixed(0)}` : '—', sub: 'Per session average', color: avgSessionPnl >= 0 ? '#A6FF4D' : '#ff4757' },
                                    { label: 'AVG TRADES / SESSION', value: avgSessionTrades > 0 ? avgSessionTrades.toFixed(1) : '—', sub: avgSessionTrades > 15 ? 'Overtrading risk' : 'Within normal range', color: avgSessionTrades > 15 ? '#ff4757' : '#c9d1d9' },
                                    { label: 'BEST SESSION', value: bestSession ? `+$${bestSession.pnl.toFixed(0)}` : '—', sub: bestSession ? bestSession.fmtDate(bestSession.startTime) : '—', color: '#A6FF4D' },
                                    { label: 'WORST SESSION', value: worstSession && worstSession.pnl < 0 ? `-$${Math.abs(worstSession.pnl).toFixed(0)}` : '—', sub: worstSession ? worstSession.fmtDate(worstSession.startTime) : '—', color: '#ff4757' },
                                    { label: 'CRITICAL SESSIONS', value: `${sessionMetrics.filter((s: any) => s.tag === 'CRITICAL').length}`, sub: 'Loss > $1,000 threshold', color: sessionMetrics.filter((s: any) => s.tag === 'CRITICAL').length > 0 ? '#ff4757' : '#A6FF4D' },
                                    { label: 'REVENGE SESSIONS', value: `${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length}`, sub: 'Rapid re-entry after loss', color: sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length > 0 ? '#EAB308' : '#A6FF4D' },
                                ].map((k, i) => (
                                    <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{k.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── SESSION P&L OVERVIEW BAR CHART ── */}
                            {sessionMetrics.length > 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>SESSION P&L WATERFALL</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>Net result per session — ordered chronologically</div>
                                    <div style={{ height: 180 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={sessionMetrics.map((s: any, i: number) => ({ name: `S${i + 1}`, pnl: s.pnl, tag: s.tag, trades: s.trades.length }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
                                                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} width={48} />
                                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                                                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                                    formatter={(v: number | undefined, _n: unknown, props: { payload?: { tag: string; trades: number } }) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)} · ${props.payload?.trades ?? 0} trades · ${props.payload?.tag ?? ''}`, 'Session P&L'] : ['—', 'Session P&L']}
                                                    labelFormatter={(l: unknown) => `Session ${l}`}
                                                />
                                                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                                                    {sessionMetrics.map((s: any, i: number) => (
                                                        <Cell key={i} fill={s.pnl >= 0 ? (s.tag === 'CLEAN' ? '#A6FF4D' : 'rgba(166,255,77,0.6)') : (s.tag === 'CRITICAL' ? '#ff4757' : 'rgba(255,71,87,0.7)')} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    {/* Session waterfall interpretation */}
                                    {sessionMetrics.length >= 2 && (() => {
                                        const critSessions = sessionMetrics.filter((s: any) => s.tag === 'CRITICAL');
                                        const revSessions = sessionMetrics.filter((s: any) => s.tag === 'REVENGE');
                                        const cleanSessions = sessionMetrics.filter((s: any) => s.pnl > 0);
                                        return (
                                            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>WHAT THIS MEANS</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                        {cleanSessions.length} of {sessionMetrics.length} sessions were profitable ({((cleanSessions.length / sessionMetrics.length) * 100).toFixed(0)}% session win rate).
                                                        {critSessions.length > 0 && <> <strong style={{ color: '#ff4757' }}>{critSessions.length} CRITICAL</strong> session{critSessions.length !== 1 ? 's' : ''} exceeded blowout threshold.</>}
                                                        {revSessions.length > 0 && <> <strong style={{ color: '#EAB308' }}>{revSessions.length} REVENGE</strong> session{revSessions.length !== 1 ? 's' : ''} detected — rapid re-entry after a loss.</>}
                                                    </p>
                                                </div>
                                                <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                        {critSessions.length > 0
                                                            ? `Your ${critSessions.length} critical session${critSessions.length !== 1 ? 's' : ''} had outsized losses. Set a per-session max-loss of $${Math.round(Math.abs(avgSessionPnl) * 2 || 500)} — once hit, close all positions and step away for minimum 2 hours.`
                                                            : 'No critical sessions yet. Set a per-session max-loss now as a pre-emptive rule before you experience your first blowout.'}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* ── INDIVIDUAL SESSION CARDS ── */}
                            {sessionMetrics.length === 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '40px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#6b7280' }}>
                                    No sessions detected yet — log at least 2 trades with a 2h+ gap between them.
                                </div>
                            )}
                            {sessionMetrics.map((s: any, idx: number) => {
                                const tagColor = s.tag === 'CLEAN' ? '#A6FF4D' : s.tag === 'CRITICAL' ? '#ff4757' : s.tag === 'REVENGE' ? '#EAB308' : s.tag === 'OVERTRADING' ? '#F97316' : '#38bdf8';
                                const isExpanded = expandedSessions.has(s.id);
                                const seq = s.trades.map((t: any) => (t.pnl ?? 0) >= 0 ? 'W' : 'L');
                                const sessionWr = s.trades.length > 0 ? (s.trades.filter((t: any) => (t.pnl ?? 0) > 0).length / s.trades.length) * 100 : 0;
                                return (
                                    <div key={s.id} style={{ background: '#0d1117', border: `1px solid ${s.pnl >= 0 ? '#1a1c24' : 'rgba(255,71,87,0.15)'}`, overflow: 'hidden' }}>
                                        {/* Session header — always visible */}
                                        <div
                                            onClick={() => toggleSession(s.id)}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', cursor: 'pointer', borderBottom: isExpanded ? '1px solid #1a1c24' : 'none', background: '#0b0e14', gap: 16, flexWrap: 'wrap' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 2 }}>SESSION {idx + 1} OF {sessionMetrics.length}</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#fff' }}>
                                                        {s.fmtDate(s.startTime)}
                                                    </div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                                        {s.fmtEstTime(s.startTime)} – {s.fmtEstTime(s.endTime)} EST · {s.durationMinutes >= 60 ? `${Math.floor(s.durationMinutes / 60)}h ${Math.floor(s.durationMinutes % 60)}m` : `${Math.floor(s.durationMinutes)}m`} duration
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                                                {/* Mini sequence dots */}
                                                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                                    {seq.slice(0, 20).map((r: string, i: number) => (
                                                        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: r === 'W' ? '#A6FF4D' : '#ff4757', opacity: 0.85 }} />
                                                    ))}
                                                    {seq.length > 20 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>+{seq.length - 20}</span>}
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: s.pnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                        {s.pnl >= 0 ? '+' : '-'}${Math.abs(s.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 2 }}>{s.trades.length} trades · {sessionWr.toFixed(0)}% WR</div>
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, padding: '4px 10px', border: `1px solid ${tagColor}44`, color: tagColor, background: `${tagColor}11`, letterSpacing: '0.08em' }}>
                                                    {s.tag}
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#6b7280', userSelect: 'none' }}>{isExpanded ? '▲' : '▼'}</div>
                                            </div>
                                        </div>

                                        {/* Expanded detail */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                                                        {/* 6 mini KPIs */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: '#1a1c24' }}>
                                                            {[
                                                                { label: 'TRADES', value: s.trades.length, color: '#c9d1d9' },
                                                                { label: 'WIN RATE', value: `${sessionWr.toFixed(0)}%`, color: sessionWr >= 55 ? '#A6FF4D' : sessionWr >= 45 ? '#EAB308' : '#ff4757' },
                                                                { label: 'PROFIT FACTOR', value: s.pf === 99 ? '∞' : s.pf.toFixed(2), color: s.pf >= 1.5 ? '#A6FF4D' : s.pf >= 1 ? '#EAB308' : '#ff4757' },
                                                                { label: 'AVG WIN', value: s.sAvgWin > 0 ? `+$${s.sAvgWin.toFixed(0)}` : '—', color: '#A6FF4D' },
                                                                { label: 'AVG LOSS', value: s.sAvgLoss > 0 ? `-$${s.sAvgLoss.toFixed(0)}` : '—', color: '#ff4757' },
                                                                { label: 'MAX CONSEC LOSS', value: s.maxConsecLoss > 0 ? `${s.maxConsecLoss}` : '0', color: s.maxConsecLoss >= 3 ? '#ff4757' : s.maxConsecLoss >= 2 ? '#EAB308' : '#A6FF4D' },
                                                            ].map((k, i) => (
                                                                <div key={i} style={{ padding: '12px 16px', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Session mini equity curve + best/worst trade */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start', flexWrap: 'wrap' }}>
                                                            <div>
                                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>INTRA-SESSION EQUITY PATH</div>
                                                                <div style={{ height: 80 }}>
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <AreaChart data={s.cumPnl} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                                                            <defs>
                                                                                <linearGradient id={`sg${idx}`} x1="0" y1="0" x2="0" y2="1">
                                                                                    <stop offset="5%" stopColor={s.pnl >= 0 ? '#A6FF4D' : '#ff4757'} stopOpacity={0.2} />
                                                                                    <stop offset="95%" stopColor={s.pnl >= 0 ? '#A6FF4D' : '#ff4757'} stopOpacity={0} />
                                                                                </linearGradient>
                                                                            </defs>
                                                                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                                                                            <Area type="monotone" dataKey="pnl" stroke={s.pnl >= 0 ? '#A6FF4D' : '#ff4757'} strokeWidth={1.5} fill={`url(#sg${idx})`} dot={false} />
                                                                            <Tooltip
                                                                                contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: 'var(--font-mono)', fontSize: 10, borderRadius: 0, color: '#c9d1d9' }}
                                                                                formatter={(v: number | undefined) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, 'Running P&L'] : ['—', 'Running P&L']}
                                                                                labelFormatter={(l: unknown) => `Trade ${Number(l) + 1}`}
                                                                            />
                                                                        </AreaChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
                                                                {s.bestTrade && (
                                                                    <div style={{ padding: '10px 14px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.15)' }}>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#A6FF4D', letterSpacing: '0.1em', marginBottom: 3 }}>BEST TRADE</div>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#A6FF4D' }}>+${(s.bestTrade.pnl ?? 0).toFixed(2)}</div>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', marginTop: 2 }}>{s.bestTrade.asset} · {s.fmtEstTime(s.bestTrade.closedAt ?? s.bestTrade.createdAt)}</div>
                                                                    </div>
                                                                )}
                                                                {s.worstTrade && (
                                                                    <div style={{ padding: '10px 14px', background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.15)' }}>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#ff4757', letterSpacing: '0.1em', marginBottom: 3 }}>WORST TRADE</div>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#ff4757' }}>-${Math.abs(s.worstTrade.pnl ?? 0).toFixed(2)}</div>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', marginTop: 2 }}>{s.worstTrade.asset} · {s.fmtEstTime(s.worstTrade.closedAt ?? s.worstTrade.createdAt)}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Win/Loss P&L bars */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                            {[
                                                                { label: 'GROSS PROFIT', val: s.gross, total: s.gross + s.lossAbs, color: '#A6FF4D' },
                                                                { label: 'GROSS LOSS', val: s.lossAbs, total: s.gross + s.lossAbs, color: '#ff4757' },
                                                            ].map((bar, i) => (
                                                                <div key={i}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{bar.label}</span>
                                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: bar.color }}>{i === 0 ? '+' : '-'}${bar.val.toFixed(0)}</span>
                                                                    </div>
                                                                    <div style={{ height: 5, background: '#1a1c24', borderRadius: 2 }}>
                                                                        <motion.div initial={{ width: 0 }} animate={{ width: `${bar.total > 0 ? (bar.val / bar.total) * 100 : 0}%` }} style={{ height: '100%', background: bar.color, borderRadius: 2, opacity: 0.8 }} />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Behavioral observation */}
                                                        <div style={{ background: `${tagColor}08`, border: `1px solid ${tagColor}22`, padding: '14px 16px', display: 'flex', gap: 12 }}>
                                                            <div style={{ width: 3, background: tagColor, flexShrink: 0, borderRadius: 2 }} />
                                                            <div>
                                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: tagColor, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>BEHAVIORAL OBSERVATION</div>
                                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7 }}>
                                                                    {s.tag === 'REVENGE' && `Rapid re-entry detected after a loss. Emotional execution cost $${s.sAvgLoss.toFixed(0)} in avoidable exposure per trade. Pattern: loss → immediate re-entry without structural reset.`}
                                                                    {s.tag === 'CRITICAL' && `Session P&L hit critical loss threshold (-$${Math.abs(s.pnl).toFixed(0)}). Decision quality degraded toward end of session. ${s.maxConsecLoss >= 3 ? `${s.maxConsecLoss} consecutive losses indicate tilt mode was active.` : ''}`}
                                                                    {s.tag === 'OVERTRADING' && `${s.trades.length} trades in a single session is above your statistical optimal. Above ~12 trades, execution quality dilutes and each additional trade carries diminishing edge.`}
                                                                    {s.tag === 'CLEAN' && s.pnl > 0 && `Clean execution session. Win rate ${sessionWr.toFixed(0)}% and profit factor ${s.pf === 99 ? '∞' : s.pf.toFixed(2)} are within elite range. This is the template to replicate.`}
                                                                    {s.tag === 'SIZING UP' && `Position sizing increase detected after prior losses — a classic tilt signal. Emotional sizing costs more than the extra exposure: it costs decision quality.`}
                                                                    {s.tag === 'CLEAN' && s.pnl <= 0 && `Structurally clean session despite a net loss. Losses appear to be part of normal variance rather than behavioral breakdown. Acceptable outcome.`}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Coaching action */}
                                                        <div style={{ background: 'rgba(166,255,77,0.03)', border: '1px solid rgba(166,255,77,0.12)', padding: '14px 16px' }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>COACHING ACTION</div>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8 }}>
                                                                {s.tag === 'REVENGE' && `→ After any losing trade, mandatory 5-min break before next entry. Journal the feeling before the next trade. Re-entry within 2min of a loss is statistically proven to be a losing behavior in your data.`}
                                                                {s.tag === 'CRITICAL' && `→ Implement a session hard-stop at -$${Math.round(Math.abs(s.pnl) * 0.5)} (50% of this session's damage). Walk away. The data shows continued trading after a critical threshold deepens the loss every time.`}
                                                                {s.tag === 'OVERTRADING' && `→ Cap sessions at ${Math.max(6, Math.floor(avgSessionTrades))} trades. Quality over quantity — your edge per trade drops sharply after this threshold.`}
                                                                {s.tag === 'CLEAN' && s.pnl > 0 && `→ This is your reference session. Before every trading day, review the start time (${s.fmtEstTime(s.startTime)} EST), the trade count (${s.trades.length}), and the mindset that produced a ${sessionWr.toFixed(0)}% WR. Replicate the conditions.`}
                                                                {s.tag === 'SIZING UP' && `→ Lock position size at a fixed unit per session. Do not adjust size during the session. Review sizing only once a week based on equity curve trend, not within-session emotion.`}
                                                                {s.tag === 'CLEAN' && s.pnl <= 0 && `→ No action needed for this session's behavioral profile. Accept the loss as variance, not failure. Continue systematic execution.`}
                                                            </div>
                                                        </div>

                                                        {/* Full trade table */}
                                                        <div>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>TRADE LOG — THIS SESSION</div>
                                                            <div style={{ overflowX: 'auto' }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                                                    <thead>
                                                                        <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                                            {['#', 'TIME (EST)', 'ASSET', 'DIR', 'P&L', 'DURATION', 'RUNNING', 'SIGNAL'].map((h, i) => (
                                                                                <th key={i} style={{ padding: '8px 12px', textAlign: i <= 1 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {s.trades.map((t: any, ti: number) => {
                                                                            const running = s.cumPnl[ti]?.pnl ?? 0;
                                                                            const prevTrade = ti > 0 ? s.trades[ti - 1] : null;
                                                                            const timeSincePrev = prevTrade ? (new Date(t.closedAt ?? t.createdAt).getTime() - new Date(prevTrade.closedAt ?? prevTrade.createdAt).getTime()) / 1000 : null;
                                                                            const isRevenge = prevTrade && (prevTrade.pnl ?? 0) < 0 && timeSincePrev !== null && timeSincePrev < 300;
                                                                            const flag = isRevenge ? 'REVENGE' : (t.pnl ?? 0) >= 0 ? '' : (t.durationSeconds ?? 0) > 1800 ? 'HELD LONG' : '';
                                                                            const flagColor = flag === 'REVENGE' ? '#ff4757' : flag === 'HELD LONG' ? '#EAB308' : '#A6FF4D';
                                                                            return (
                                                                                <tr key={t.id} style={{ borderBottom: '1px solid rgba(26,28,36,0.6)' }}
                                                                                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0f1420'}
                                                                                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                                                                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{ti + 1}</td>
                                                                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.fmtEstTime(t.closedAt ?? t.createdAt)}</td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#c9d1d9', fontWeight: 600 }}>{t.asset}</td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: t.isShort ? '#38bdf8' : '#fb923c', fontSize: 9, fontWeight: 700 }}>{t.isShort ? 'SHORT' : 'LONG'}</td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (t.pnl ?? 0) >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                                                        {(t.pnl ?? 0) >= 0 ? '+' : '-'}${Math.abs(t.pnl ?? 0).toFixed(2)}
                                                                                    </td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>
                                                                                        {fmtDuration(t.durationSeconds ?? 0)}
                                                                                    </td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: running >= 0 ? '#A6FF4D' : '#ff4757', fontWeight: 600 }}>
                                                                                        {running >= 0 ? '+' : ''}${running.toFixed(0)}
                                                                                    </td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                                                        {flag && <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', border: `1px solid ${flagColor}44`, color: flagColor, background: `${flagColor}11`, letterSpacing: '0.06em' }}>{flag}</span>}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>

                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}

                            {/* ── SESSION CONSISTENCY ANALYSIS ── */}
                            {sessionMetrics.length >= 3 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>SESSION CONSISTENCY SCORE</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 20 }}>Consistency is more valuable than peak sessions. Variance below shows how predictable your edge is.</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: '#1a1c24', marginBottom: 20 }}>
                                        {(() => {
                                            const pnls = sessionMetrics.map((s: any) => s.pnl);
                                            const mean = pnls.reduce((a: number, b: number) => a + b, 0) / pnls.length;
                                            const variance = pnls.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / pnls.length;
                                            const stdDev = Math.sqrt(variance);
                                            const consistency = stdDev > 0 ? Math.max(0, 100 - Math.min(100, (stdDev / Math.max(Math.abs(mean), 1)) * 50)) : 100;
                                            return [
                                                { label: 'CONSISTENCY SCORE', value: `${consistency.toFixed(0)}/100`, color: consistency >= 70 ? '#A6FF4D' : consistency >= 50 ? '#EAB308' : '#ff4757' },
                                                { label: 'STD DEV P&L', value: `±$${stdDev.toFixed(0)}`, color: '#c9d1d9' },
                                                { label: 'SESSIONS WITHIN 1σ', value: `${pnls.filter((p: number) => Math.abs(p - mean) <= stdDev).length}/${pnls.length}`, color: '#c9d1d9' },
                                            ].map((k, i) => (
                                                <div key={i} style={{ padding: '16px 20px', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                    {/* Session P&L scatter dots */}
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 8 }}>SESSION P&L DISTRIBUTION</div>
                                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                        {sessionMetrics.map((s: any, i: number) => {
                                            const maxAbs = Math.max(...sessionMetrics.map((x: any) => Math.abs(x.pnl)), 1);
                                            const h = Math.max(4, (Math.abs(s.pnl) / maxAbs) * 48);
                                            return (
                                                <div key={i} title={`Session ${i+1}: ${s.pnl >= 0 ? '+' : ''}$${s.pnl.toFixed(0)}`} style={{ width: 12, height: h, background: s.pnl >= 0 ? '#A6FF4D' : '#ff4757', opacity: 0.8, borderRadius: 1, cursor: 'default' }} />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── SESSION SCATTER: Start Time vs P&L ── */}
                            {sessionScatterData.length > 1 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>SESSION SCATTER — START HOUR vs P&L</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 4 }}>Does your session P&L depend on when you start? Each dot = one session.</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginBottom: 12 }}>Dot size = session magnitude. Look for vertical clustering: winning start windows vs losing ones.</div>
                                    <TradeScatterChart
                                        data={sessionScatterData}
                                        xLabel="Session Start Hour (EST)"
                                        height={200}
                                        xFormatter={(v: number) => `${String(Math.floor(v)).padStart(2,'0')}:${String(Math.round((v % 1) * 60)).padStart(2,'0')}`}
                                    />
                                </div>
                            )}

                            {/* ── ACTIONABLE RULES ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>SESSION-BASED RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        {
                                            rule: 'RULE 01 — SESSION DAILY LOSS LIMIT',
                                            detail: `Your worst session lost $${worstSession && worstSession.pnl < 0 ? Math.abs(worstSession.pnl).toFixed(0) : 'N/A'}. Set a hard daily loss limit at 50% of that figure. When hit, session ends — no exceptions.`,
                                            icon: '⛔', color: '#ff4757',
                                            show: worstSession && worstSession.pnl < -100,
                                        },
                                        {
                                            rule: `RULE 02 — TRADE COUNT CAP`,
                                            detail: `Average session has ${avgSessionTrades.toFixed(1)} trades. Cap at ${Math.max(8, Math.ceil(avgSessionTrades * 1.3))} trades per session. Every trade beyond your optimal count has a statistically lower win rate.`,
                                            icon: '→', color: '#EAB308',
                                            show: true,
                                        },
                                        {
                                            rule: 'RULE 03 — REVENGE PROTOCOL',
                                            detail: `${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length} session${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length !== 1 ? 's' : ''} flagged for revenge behavior. After any loss, minimum 5-minute break. Log your emotional state before re-entry.`,
                                            icon: '⏸', color: '#EAB308',
                                            show: sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length > 0,
                                        },
                                        {
                                            rule: 'RULE 04 — REPLICATE BEST SESSION',
                                            detail: bestSession ? `Best session: $${bestSession.pnl.toFixed(0)} on ${bestSession.fmtDate(bestSession.startTime)} — ${bestSession.trades.length} trades, started at ${bestSession.fmtEstTime(bestSession.startTime)} EST. Identify what was different that day and systemize it.` : 'Log more sessions to identify your best session pattern.',
                                            icon: '✓', color: '#A6FF4D',
                                            show: true,
                                        },
                                    ].filter((r: any) => r.show).map((r, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', background: '#0b0e14', borderLeft: `2px solid ${r.color}55` }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: r.color, flexShrink: 0, width: 20 }}>{r.icon}</span>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: r.color, letterSpacing: '0.08em', marginBottom: 4 }}>{r.rule}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>{r.detail}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </motion.div>
                    )}

                    {activeTab === 'TIME' && (
                        <motion.div key="time" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── HEADER ── */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>TIME OF DAY INTELLIGENCE</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>24-Hour Edge Map</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>
                                        Every hour profiled by net P&L, win rate, and trade density in EST. Your edge is not uniform across the clock — this page shows exactly where it lives and where it costs you.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'BEST HOUR', value: `${String(forensics.timeStats.bestHour).padStart(2,'0')}:00`, color: '#A6FF4D' },
                                        { label: 'WORST HOUR', value: `${String(forensics.timeStats.worstHour).padStart(2,'0')}:00`, color: '#ff4757' },
                                        { label: 'ACTIVE HOURS', value: `${hourlyStats.filter(s => s.trades > 0).length}/24`, color: '#c9d1d9' },
                                    ].map((k, i) => (
                                        <div key={i} style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '10px 16px', minWidth: 100 }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── 4-KPI STRIP ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {(() => {
                                    const bestH = hourlyStats[forensics.timeStats.bestHour];
                                    const worstH = hourlyStats[forensics.timeStats.worstHour];
                                    const activeH = hourlyStats.filter(s => s.trades > 0);
                                    const topSession = SESSION_WINDOWS.map(sw => ({
                                        ...sw,
                                        pnl: sw.hours.reduce((s, h) => s + hourlyStats[h].pnl, 0),
                                        trades: sw.hours.reduce((s, h) => s + hourlyStats[h].trades, 0),
                                    })).sort((a, b) => b.pnl - a.pnl)[0];
                                    const profitableHours = activeH.filter(s => s.pnl > 0);
                                    return [
                                        { label: 'BEST HOUR P&L', value: bestH ? `+$${bestH.pnl.toFixed(0)}` : '—', sub: `${String(forensics.timeStats.bestHour).padStart(2,'0')}:00 EST · ${bestH?.trades ?? 0} trades`, color: '#A6FF4D' },
                                        { label: 'WORST HOUR P&L', value: worstH ? `-$${Math.abs(worstH.pnl).toFixed(0)}` : '—', sub: `${String(forensics.timeStats.worstHour).padStart(2,'0')}:00 EST · ${worstH?.trades ?? 0} trades`, color: '#ff4757' },
                                        { label: 'PEAK SESSION WINDOW', value: topSession?.pnl > 0 ? `+$${topSession.pnl.toFixed(0)}` : '—', sub: topSession ? `${topSession.label} · ${topSession.trades} trades` : '—', color: '#A6FF4D' },
                                        { label: 'PROFITABLE HOURS', value: activeH.length > 0 ? `${profitableHours.length}/${activeH.length}` : '—', sub: `${activeH.length > 0 ? ((profitableHours.length / activeH.length) * 100).toFixed(0) : 0}% of active hours are green`, color: profitableHours.length > activeH.length / 2 ? '#A6FF4D' : '#EAB308' },
                                    ].map((k, i) => (
                                        <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>{k.sub}</span>
                                        </div>
                                    ));
                                })()}
                            </div>

                            {/* ── CHART 1: P&L BY HOUR ── */}
                            {(() => {
                                const activeH = hourlyStats.filter(s => s.trades > 0);
                                const sortedByPnl = [...activeH].sort((a, b) => b.pnl - a.pnl);
                                const top3 = sortedByPnl.slice(0, 3);
                                const top3PnlSum = top3.reduce((s, h) => s + h.pnl, 0);
                                const totalGross = activeH.reduce((s, h) => s + Math.max(0, h.pnl), 0);
                                const top3Pct = totalGross > 0 ? ((top3PnlSum / totalGross) * 100).toFixed(0) : '—';
                                const trapHours = activeH.filter(h => h.pnl < 0);
                                const trapCost = trapHours.reduce((s, h) => s + h.pnl, 0);
                                const maxPnl = Math.max(...hourlyData.map(x => Math.abs(x.pnl)), 1);
                                return (
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px 24px 20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>CHART 1 OF 4 — P&L BY HOUR (EST)</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#c9d1d9' }}>Net profit/loss accumulated per clock hour</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginTop: 4 }}>Bar height = dollar P&L · Color intensity scales with trade density · Empty bars = no trades that hour</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, background: '#A6FF4D' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D' }}>Profitable hour</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, background: '#ff4757' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757' }}>Loss hour</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, background: '#1a1c24', border: '1px solid #2d3748' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#00D4FF' }}>No trades</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ height: 260 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={hourlyData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
                                                    <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={1} />
                                                    <YAxis tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} width={48} />
                                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                                                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                                        formatter={(v: number | undefined, _name: unknown, props: { payload?: { trades: number; wr: number } }) => {
                                                            if (v === undefined) return ['—', 'P&L'];
                                                            const trades = props.payload?.trades ?? 0;
                                                            if (trades === 0) return ['No trades this hour', ''];
                                                            const wr = props.payload?.wr ?? 0;
                                                            return [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)} · ${trades} trades · ${wr.toFixed(0)}% WR`, 'P&L'];
                                                        }}
                                                        labelFormatter={(l: unknown) => `${l} EST`}
                                                    />
                                                    <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                                                        {hourlyData.map((d, i) => {
                                                            const intensity = Math.max(0.35, Math.min(1, Math.abs(d.pnl) / maxPnl));
                                                            return <Cell key={i} fill={d.trades === 0 ? 'rgba(26,28,36,0.4)' : d.pnl >= 0 ? `rgba(166,255,77,${intensity})` : `rgba(255,71,87,${intensity})`} />;
                                                        })}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        {/* Interpretation */}
                                        {activeH.length > 0 && (
                                            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>WHAT THIS MEANS</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                        Your top 3 profitable hours ({top3.map(h => `${String(h.h).padStart(2,'0')}:00`).join(', ')}) account for <strong style={{ color: '#A6FF4D' }}>{top3Pct}%</strong> of all hourly profit. Meanwhile, your {trapHours.length} loss hour{trapHours.length !== 1 ? 's' : ''} collectively cost <strong style={{ color: '#ff4757' }}>${Math.abs(trapCost).toFixed(0)}</strong>. Your edge is concentrated — not spread evenly.
                                                    </p>
                                                </div>
                                                <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                        Concentrate 80% of your position size in your top 3 hours. Reduce size by 50% in any hour with negative P&L. Do not trade hours with fewer than 3 data points — insufficient edge evidence.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ── CHART 2: WIN RATE BY HOUR (visually distinct — zone-shaded ComposedChart) ── */}
                            {(() => {
                                const activeH = hourlyStats.filter(s => s.trades > 0);
                                const strongEdgeHours = activeH.filter(h => (h.wins / h.trades) * 100 >= 60);
                                const trapHours = activeH.filter(h => (h.wins / h.trades) * 100 < 40);
                                const avgWR = activeH.length > 0 ? activeH.reduce((s, h) => s + (h.wins / h.trades) * 100, 0) / activeH.length : 0;
                                return (
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px 24px 20px' }}>
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>CHART 2 OF 4 — WIN RATE BY HOUR</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#c9d1d9' }}>Probability of winning per clock hour (active hours only)</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginTop: 4 }}>
                                                <span style={{ color: '#A6FF4D', fontWeight: 700 }}>Green zone ≥60%</span> = strong edge &nbsp;·&nbsp;
                                                <span style={{ color: '#EAB308', fontWeight: 700 }}>Yellow 40–59%</span> = marginal &nbsp;·&nbsp;
                                                <span style={{ color: '#ff4757', fontWeight: 700 }}>Red &lt;40%</span> = statistical trap — this hour costs money
                                            </div>
                                        </div>
                                        <div style={{ height: 200 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={hourlyData.filter(d => d.trades > 0)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
                                                    {/* Background zone fill: green above 60, yellow 40-60, red below 40 */}
                                                    <defs>
                                                        <linearGradient id="wrZoneGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="rgba(166,255,77,0.07)" />
                                                            <stop offset="40%" stopColor="rgba(166,255,77,0.04)" />
                                                            <stop offset="60%" stopColor="rgba(234,179,8,0.04)" />
                                                            <stop offset="100%" stopColor="rgba(255,71,87,0.07)" />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} width={36} />
                                                    <ReferenceLine y={60} stroke="rgba(166,255,77,0.3)" strokeDasharray="4 2" label={{ value: '60% EDGE', fill: '#A6FF4D', fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
                                                    <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" label={{ value: '50%', fill: '#8b949e', fontSize: 8, fontFamily: 'var(--font-mono)' }} />
                                                    <ReferenceLine y={40} stroke="rgba(255,71,87,0.3)" strokeDasharray="4 2" label={{ value: '40% TRAP', fill: '#ff4757', fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                                                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                                        formatter={(v: number | undefined, _n: unknown, props: { payload?: { trades: number; pnl: number } }) => {
                                                            if (v === undefined) return ['—', 'Win Rate'];
                                                            const trades = props.payload?.trades ?? 0;
                                                            const pnl = props.payload?.pnl ?? 0;
                                                            const signal = v >= 60 ? '✓ STRONG EDGE' : v >= 50 ? '→ PLAYABLE' : v >= 40 ? '⚠ MARGINAL' : '⛔ AVOID';
                                                            return [`${v.toFixed(1)}% WR · ${trades} trades · ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)} P&L · ${signal}`, 'Win Rate'];
                                                        }}
                                                        labelFormatter={(l: unknown) => `${l} EST`}
                                                    />
                                                    <Bar dataKey="wr" radius={[3, 3, 0, 0]} maxBarSize={40}>
                                                        {hourlyData.filter(d => d.trades > 0).map((d, i) => (
                                                            <Cell key={i} fill={d.wr >= 60 ? '#A6FF4D' : d.wr >= 50 ? 'rgba(166,255,77,0.55)' : d.wr >= 40 ? '#EAB308' : '#ff4757'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        {/* Interpretation */}
                                        {activeH.length > 0 && (
                                            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>WHAT THIS MEANS</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                        You have <strong style={{ color: '#A6FF4D' }}>{strongEdgeHours.length} strong-edge hour{strongEdgeHours.length !== 1 ? 's' : ''}</strong> (≥60% WR) and <strong style={{ color: '#ff4757' }}>{trapHours.length} statistical trap{trapHours.length !== 1 ? 's' : ''}</strong> (&lt;40% WR). Your overall active-hour average is <strong style={{ color: '#EAB308' }}>{avgWR.toFixed(1)}%</strong>. Win rate below 40% is not variance — it&apos;s structural.
                                                    </p>
                                                </div>
                                                <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                        {trapHours.length > 0
                                                            ? `Implement a soft trading ban on ${trapHours.map(h => `${String(h.h).padStart(2,'0')}:00`).slice(0,3).join(', ')} EST. These hours have a below-40% win rate over your entire dataset — that is not a streak, it is your baseline.`
                                                            : `No trap hours detected — maintain current time discipline. Monitor if a new hour drops below 40% WR over 10+ trades.`}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ── CHART 3: HEATMAP — Hour × Day-of-Week ── */}
                            {heatmapData.length > 0 && (() => {
                                const bestCell = heatmapData.reduce((best, c) => c.trades > 0 && c.pnl > (best?.pnl ?? -Infinity) ? c : best, heatmapData[0]);
                                const worstCell = heatmapData.reduce((worst, c) => c.trades > 0 && c.pnl < (worst?.pnl ?? Infinity) ? c : worst, heatmapData[0]);
                                const fmtH = (h: number) => h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`;
                                return (
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px 24px 20px' }}>
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>CHART 3 OF 4 — P&L HEATMAP · HOUR × DAY OF WEEK</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#c9d1d9' }}>Average P&L per (hour, day) combination — your complete time edge fingerprint</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginTop: 4 }}>
                                                Each cell = avg P&L across all trades at that hour on that weekday · Brighter = higher magnitude · Hover for details
                                            </div>
                                        </div>
                                        <HeatmapGrid data={heatmapData} minTrades={1} />
                                        {/* Interpretation */}
                                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>WHAT THIS MEANS</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    Your best slot is <strong style={{ color: '#A6FF4D' }}>{bestCell.day} {fmtH(bestCell.hour)}</strong> (+${bestCell.pnl.toFixed(0)} avg · {bestCell.trades} trades). Your worst slot is <strong style={{ color: '#ff4757' }}>{worstCell.day} {fmtH(worstCell.hour)}</strong> (${worstCell.pnl.toFixed(0)} avg · {worstCell.trades} trades). Red clusters on the same day-of-week point to structural market conditions, not random variance.
                                                </p>
                                            </div>
                                            <div style={{ padding: '14px 16px', background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.12)', borderLeft: '3px solid #ff4757' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                    Double your size on <strong style={{ color: '#A6FF4D' }}>{bestCell.day} {fmtH(bestCell.hour)}</strong> when that slot has ≥3 prior occurrences. Block calendar entries for <strong style={{ color: '#ff4757' }}>{worstCell.day} {fmtH(worstCell.hour)}</strong> — set a reminder to not trade during that window.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── CHART 4: TRADE SCATTER — Hour vs P&L ── */}
                            {scatterByHour.length > 0 && (() => {
                                const bigWins = scatterByHour.filter(d => d.y > 0).sort((a,b) => b.y - a.y).slice(0,3);
                                const bigLosses = scatterByHour.filter(d => d.y < 0).sort((a,b) => a.y - b.y).slice(0,3);
                                const fmtT = (v: number) => `${String(Math.floor(v)).padStart(2,'0')}:${String(Math.round((v % 1) * 60)).padStart(2,'0')}`;
                                return (
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px 24px 20px' }}>
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>CHART 4 OF 4 — INDIVIDUAL TRADE SCATTER · HOUR vs P&L</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#c9d1d9' }}>Every single trade plotted by time and dollar outcome</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginTop: 4 }}>
                                                Each dot = one trade · <span style={{ color: '#A6FF4D' }}>Green = win</span> · <span style={{ color: '#ff4757' }}>Red = loss</span> · Dot size proportional to P&L magnitude · Time in EST
                                            </div>
                                        </div>
                                        <TradeScatterChart
                                            data={scatterByHour}
                                            xLabel="Hour (EST)"
                                            height={240}
                                            xFormatter={fmtT}
                                        />
                                        {/* Interpretation */}
                                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                            <div style={{ padding: '14px 16px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>HOW TO READ THIS</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    Look for <strong style={{ color: '#A6FF4D' }}>green clusters</strong> — time windows where wins dominate. Look for <strong style={{ color: '#ff4757' }}>red clusters or large red dots</strong> — those are your blowup windows. Vertical clustering at a specific hour = that hour has a consistent behavioral outcome for you.
                                                </p>
                                            </div>
                                            <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>TOP OBSERVATIONS</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', lineHeight: 1.9 }}>
                                                    {bigWins.length > 0 && <div>Biggest wins: {bigWins.map(d => `${fmtT(d.x)} (+$${d.y.toFixed(0)})`).join(' · ')}</div>}
                                                    {bigLosses.length > 0 && <div>Biggest losses: {bigLosses.map(d => `${fmtT(d.x)} (-$${Math.abs(d.y).toFixed(0)})`).join(' · ')}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── SESSION WINDOW BREAKDOWN ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>SESSION WINDOW ANALYSIS</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 20 }}>Market structure changes across sessions. Your edge should too.</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {SESSION_WINDOWS.map((sw, i) => {
                                        const swPnl = sw.hours.reduce((s, h) => s + hourlyStats[h].pnl, 0);
                                        const swTrades = sw.hours.reduce((s, h) => s + hourlyStats[h].trades, 0);
                                        const swWins = sw.hours.reduce((s, h) => s + hourlyStats[h].wins, 0);
                                        const swWr = swTrades > 0 ? (swWins / swTrades) * 100 : 0;
                                        const maxSwPnl = Math.max(...SESSION_WINDOWS.map(s2 => Math.abs(s2.hours.reduce((acc, h) => acc + hourlyStats[h].pnl, 0))), 1);
                                        const barW = Math.min(100, (Math.abs(swPnl) / maxSwPnl) * 100);
                                        if (swTrades === 0) return null;
                                        return (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 80px 60px', alignItems: 'center', gap: 16, padding: '14px 16px', background: i % 2 === 0 ? '#0d1117' : '#0b0e14', borderBottom: '1px solid #1a1c24' }}>
                                                <div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: sw.color, letterSpacing: '0.06em' }}>{sw.label}</div>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', marginTop: 2 }}>{sw.range} EST</div>
                                                </div>
                                                <div style={{ position: 'relative', height: 6, background: '#1a1c24', borderRadius: 2 }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${barW}%` }} style={{ height: '100%', background: swPnl >= 0 ? '#A6FF4D' : '#ff4757', borderRadius: 2, opacity: 0.8 }} />
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: swPnl >= 0 ? '#A6FF4D' : '#ff4757', textAlign: 'right' }}>
                                                    {swPnl >= 0 ? '+' : '-'}${Math.abs(swPnl).toFixed(0)}
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: swWr >= 50 ? '#A6FF4D' : swWr >= 40 ? '#EAB308' : '#ff4757', textAlign: 'right', fontWeight: 600 }}>
                                                    {swWr.toFixed(0)}% WR
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', textAlign: 'right' }}>
                                                    {swTrades}T
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── HOURLY DATA TABLE ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>FULL HOUR-BY-HOUR BREAKDOWN</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {['HOUR (EST)', 'SESSION', 'TRADES', 'WIN RATE', 'NET P&L', 'SIGNAL'].map((h, i) => (
                                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {hourlyStats.filter(s => s.trades > 0).map((s, i) => {
                                                const session = SESSION_WINDOWS.find(sw => sw.hours.includes(s.h));
                                                const wr = (s.wins / s.trades) * 100;
                                                const signal = s.pnl > 0 && wr >= 60 ? 'STRONG EDGE' : s.pnl > 0 && wr >= 50 ? 'PLAYABLE' : s.pnl > 0 && wr < 50 ? 'MARGINAL' : wr >= 50 ? 'MIXED' : 'AVOID';
                                                const sigColor = signal === 'STRONG EDGE' ? '#A6FF4D' : signal === 'PLAYABLE' ? 'rgba(166,255,77,0.6)' : signal === 'MARGINAL' ? '#EAB308' : signal === 'MIXED' ? '#fb923c' : '#ff4757';
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid #1a1c24' }}
                                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0f1420'}
                                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                                                        <td style={{ padding: '12px 16px', color: '#c9d1d9', fontWeight: 700 }}>
                                                            {String(s.h).padStart(2,'0')}:00 – {String(s.h+1).padStart(2,'0')}:00
                                                            {s.h === forensics.timeStats.bestHour && <span style={{ marginLeft: 8, fontSize: 8, color: '#A6FF4D', border: '1px solid rgba(166,255,77,0.3)', padding: '1px 5px' }}>BEST</span>}
                                                            {s.h === forensics.timeStats.worstHour && <span style={{ marginLeft: 8, fontSize: 8, color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', padding: '1px 5px' }}>WORST</span>}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: session?.color ?? '#6b7280', fontSize: 9, letterSpacing: '0.06em' }}>{session?.label ?? '—'}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>{s.trades}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: wr >= 55 ? '#A6FF4D' : wr >= 45 ? '#EAB308' : '#ff4757' }}>{wr.toFixed(0)}%</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: s.pnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                            {s.pnl >= 0 ? '+' : '-'}${Math.abs(s.pnl).toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', border: `1px solid ${sigColor}44`, color: sigColor, background: `${sigColor}11`, letterSpacing: '0.06em' }}>{signal}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {hourlyStats.filter(s => s.trades > 0).length === 0 && (
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', padding: '24px 16px' }}>No closed trades logged yet.</div>
                                    )}
                                </div>
                            </div>

                            {/* ── STRENGTH + DANGER ZONE DETAILED CARDS ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Strength */}
                                <div style={{ background: 'rgba(166,255,77,0.03)', border: '1px solid rgba(166,255,77,0.12)', padding: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <TrendingUp size={13} color="#A6FF4D" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>STRENGTH ZONE</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                                        {String(forensics.timeStats.bestHour).padStart(2,'0')}:00 – {String(forensics.timeStats.bestHour + 1).padStart(2,'0')}:00 <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>EST</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#A6FF4D', marginBottom: 12 }}>
                                        +${hourlyStats[forensics.timeStats.bestHour]?.pnl.toFixed(0) ?? '0'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>TRADES</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#c9d1d9' }}>{hourlyStats[forensics.timeStats.bestHour]?.trades ?? 0}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>WIN RATE</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#A6FF4D' }}>
                                                {hourlyStats[forensics.timeStats.bestHour]?.trades > 0 ? ((hourlyStats[forensics.timeStats.bestHour].wins / hourlyStats[forensics.timeStats.bestHour].trades) * 100).toFixed(0) : 0}%
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>SESSION</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: SESSION_WINDOWS.find(sw => sw.hours.includes(forensics.timeStats.bestHour))?.color ?? '#6b7280' }}>
                                                {SESSION_WINDOWS.find(sw => sw.hours.includes(forensics.timeStats.bestHour))?.label ?? '—'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ background: 'rgba(166,255,77,0.06)', border: '1px solid rgba(166,255,77,0.15)', padding: '12px 14px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>COACHING ACTION</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7 }}>
                                            Protect this window. Arrive flat — no carry-forward losses from earlier sessions. Use larger conviction sizing only during this hour. This is where your statistical edge lives.
                                        </div>
                                    </div>
                                </div>

                                {/* Danger */}
                                <div style={{ background: 'rgba(255,71,87,0.03)', border: '1px solid rgba(255,71,87,0.12)', padding: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <AlertTriangle size={13} color="#ff4757" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>DANGER ZONE</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                                        {String(forensics.timeStats.worstHour).padStart(2,'0')}:00 – {String(forensics.timeStats.worstHour + 1).padStart(2,'0')}:00 <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>EST</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#ff4757', marginBottom: 12 }}>
                                        -${Math.abs(hourlyStats[forensics.timeStats.worstHour]?.pnl ?? 0).toFixed(0)}
                                    </div>
                                    <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>TRADES</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#c9d1d9' }}>{hourlyStats[forensics.timeStats.worstHour]?.trades ?? 0}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>WIN RATE</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#ff4757' }}>
                                                {hourlyStats[forensics.timeStats.worstHour]?.trades > 0 ? ((hourlyStats[forensics.timeStats.worstHour].wins / hourlyStats[forensics.timeStats.worstHour].trades) * 100).toFixed(0) : 0}%
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>SESSION</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: SESSION_WINDOWS.find(sw => sw.hours.includes(forensics.timeStats.worstHour))?.color ?? '#6b7280' }}>
                                                {SESSION_WINDOWS.find(sw => sw.hours.includes(forensics.timeStats.worstHour))?.label ?? '—'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.15)', padding: '12px 14px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>COACHING ACTION</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7 }}>
                                            Hard rule: no new positions opened during this window until win rate exceeds 50% over 20+ trades. This hour is costing you real money — the data is clear.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── ACTIONABLE RULES ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>TIME-BASED RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        {
                                            rule: `RULE 01 — BEST HOUR PRIORITY`,
                                            detail: `Focus maximum position sizing and highest conviction setups between ${String(forensics.timeStats.bestHour).padStart(2,'0')}:00–${String(forensics.timeStats.bestHour+1).padStart(2,'0')}:00 EST. This is your statistically proven peak edge window.`,
                                            icon: '→', color: '#A6FF4D',
                                        },
                                        {
                                            rule: `RULE 02 — DANGER HOUR BLOCK`,
                                            detail: `Implement a soft trading ban at ${String(forensics.timeStats.worstHour).padStart(2,'0')}:00 EST. If a setup appears, reduce size by 50% and require double confirmation before entry.`,
                                            icon: '⛔', color: '#ff4757',
                                        },
                                        {
                                            rule: `RULE 03 — SESSION TRANSITION PAUSE`,
                                            detail: `Add a 5-minute no-trade buffer at every session boundary (06:00, 09:30, 11:00, 14:00, 16:00 EST). Market microstructure shifts — your edge does too.`,
                                            icon: '⏸', color: '#EAB308',
                                        },
                                        {
                                            rule: `RULE 04 — DEAD HOUR DISCIPLINE`,
                                            detail: `${24 - hourlyStats.filter(s => s.trades > 0).length} hours show zero activity — preserve this discipline. Do not expand your active hours until your current window win rate exceeds 55% over 30+ trades.`,
                                            icon: '✓', color: '#6b7280',
                                        },
                                    ].map((r, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', background: '#0b0e14', borderLeft: `2px solid ${r.color}55` }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: r.color, flexShrink: 0, width: 20 }}>{r.icon}</span>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: r.color, letterSpacing: '0.08em', marginBottom: 4 }}>{r.rule}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>{r.detail}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </motion.div>
                    )}

                    {activeTab === 'STREAKS' && (
                        <motion.div key="streaks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── HEADER ── */}
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>STREAK FORENSICS</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Win & Loss Streak Analysis</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>
                                    Every streak tells a story. Win streaks reveal your edge in motion. Loss streaks reveal tilt, misalignment, or structural market shifts. This page decodes both.
                                </div>
                            </div>

                            {/* ── 6-KPI GRID ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: 'MAX WIN STREAK', value: `${forensics.maxWinStreak}`, sub: 'Consecutive winning trades', color: '#A6FF4D' },
                                    { label: 'MAX LOSS STREAK', value: `${forensics.maxLossStreak}`, sub: 'Consecutive losing trades', color: forensics.maxLossStreak >= 4 ? '#ff4757' : forensics.maxLossStreak >= 3 ? '#EAB308' : '#c9d1d9' },
                                    { label: 'TOTAL STREAK RUNS', value: `${streakRuns.length}`, sub: `${streakRuns.filter(r => r.type === 'W').length}W runs · ${streakRuns.filter(r => r.type === 'L').length}L runs`, color: '#c9d1d9' },
                                    { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, sub: `${wins.length}W · ${losses.length}L`, color: winRate >= 55 ? '#A6FF4D' : winRate >= 45 ? '#EAB308' : '#ff4757' },
                                    { label: 'EXPECTANCY', value: expectancy !== 0 ? `${expectancy >= 0 ? '+' : ''}$${Math.abs(expectancy).toFixed(2)}` : '—', sub: 'Per trade average', color: expectancy >= 0 ? '#A6FF4D' : '#ff4757' },
                                    { label: 'WORST STREAK COST', value: worstStreakInfo ? `-$${Math.abs(worstStreakInfo.pnl).toFixed(0)}` : '—', sub: worstStreakInfo ? `${worstStreakInfo.count} losses · ${worstStreakInfo.date}` : 'No data', color: '#ff4757' },
                                ].map((k, i) => (
                                    <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>{k.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── TRADE SEQUENCE VISUALIZATION ── */}
                            {closed.length > 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>FULL TRADE SEQUENCE</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>
                                        Each segment = one streak run. Width ∝ streak length. This is your behavioral fingerprint.
                                    </div>
                                    {/* Segment bar */}
                                    <div style={{ display: 'flex', height: 48, width: '100%', overflow: 'hidden', gap: 1, marginBottom: 12 }}>
                                        {streakRuns.map((run, i) => {
                                            const pct = (run.length / closed.length) * 100;
                                            const isWin = run.type === 'W';
                                            return (
                                                <div
                                                    key={i}
                                                    title={`${run.type === 'W' ? 'Win' : 'Loss'} streak × ${run.length} · ${run.pnl >= 0 ? '+' : ''}$${run.pnl.toFixed(0)}`}
                                                    style={{
                                                        flex: `0 0 ${Math.max(pct, 0.4)}%`,
                                                        background: isWin ? `rgba(166,255,77,${0.4 + Math.min(run.length / 8, 0.55)})` : `rgba(255,71,87,${0.4 + Math.min(run.length / 8, 0.55)})`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: run.length >= 3 ? 9 : 0,
                                                        fontFamily: 'var(--font-mono)',
                                                        fontWeight: 700,
                                                        color: isWin ? '#0a1a00' : '#2a0008',
                                                        cursor: 'default',
                                                        transition: 'opacity 0.1s',
                                                    }}
                                                >
                                                    {run.length >= 3 ? run.length : ''}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Individual dot row */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 12 }}>
                                        {forensics.streaksSequence.map((res: string, i: number) => (
                                            <div key={i} style={{
                                                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                                background: res === 'W' ? '#A6FF4D' : '#ff4757',
                                                opacity: 0.8,
                                                boxShadow: res === 'W' ? '0 0 3px rgba(166,255,77,0.5)' : '0 0 3px rgba(255,71,87,0.5)',
                                            }} />
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 12, height: 12, background: 'rgba(166,255,77,0.7)' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D' }}>Win streak (darker = longer)</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 12, height: 12, background: 'rgba(255,71,87,0.7)' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757' }}>Loss streak (darker = longer)</span>
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#8b949e', marginLeft: 'auto' }}>{closed.length} trades · {streakRuns.length} streak runs</span>
                                    </div>
                                    {/* NLP narrative */}
                                    {worstStreakInfo && closed.length >= 5 && (
                                        <div style={{ marginTop: 20, padding: '16px 20px', background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.15)', borderLeft: '3px solid #ff4757' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>WORST STREAK DECODED</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{worstStreakInfo.count} consecutive {worstStreakInfo.dominantAsset}{worstStreakInfo.isShort ? ' short' : ''} losses</span>
                                                {' on '}
                                                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{worstStreakInfo.date}</span>
                                                {` from ${worstStreakInfo.startTime} to ${worstStreakInfo.endTime}, costing `}
                                                <span style={{ color: '#ff4757', fontWeight: 700 }}>-${Math.abs(worstStreakInfo.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                {'.'}
                                                {recoveryProbTable.find(r => r.n === 3) && (() => {
                                                    const r3 = recoveryProbTable.find(r => r.n === 3)!;
                                                    return ` After 3+ consecutive losses, your historical recovery probability is ${r3.recoveryProb !== null ? r3.recoveryProb.toFixed(0) : '—'}% — the damage compounds before you stabilize.`;
                                                })()}
                                                {forensics.maxLossStreak >= 4 ? ` Direction bias maintained through ${worstStreakInfo.count} market rejections — a classic tilt signature.` : ''}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── STREAK LENGTH DISTRIBUTION ── */}
                            {streakRuns.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    {/* Win vs Loss streak length distribution */}
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>STREAK LENGTH DISTRIBUTION</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', marginBottom: 16 }}>Do your losses cluster more than your wins?</div>
                                        <div style={{ height: 200 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={streakLengthDist} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
                                                    <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="len" tick={{ fontSize: 10, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} label={{ value: 'Streak Length', position: 'insideBottom', offset: -4, fill: '#6b7280', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
                                                    <YAxis tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={28} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                                                        formatter={(v: number | undefined, name: string | undefined) => v !== undefined ? [`${v} streak${v !== 1 ? 's' : ''}`, name === 'wins' ? 'Win Streaks' : 'Loss Streaks'] : ['—', name ?? '']}
                                                        labelFormatter={(l: unknown) => `Length ${l}`}
                                                    />
                                                    <Bar dataKey="wins" name="wins" fill="rgba(166,255,77,0.8)" radius={[2, 2, 0, 0]} />
                                                    <Bar dataKey="losses" name="losses" fill="rgba(255,71,87,0.8)" radius={[2, 2, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, background: 'rgba(166,255,77,0.8)' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D' }}>Win streaks</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, background: 'rgba(255,71,87,0.8)' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757' }}>Loss streaks</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Streak impact chart */}
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>TOP STREAK IMPACTS</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', marginBottom: 16 }}>Biggest earning & losing runs by dollar impact.</div>
                                        <div style={{ height: 200 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={streakImpactData} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="25%">
                                                    <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" horizontal={false} />
                                                    <XAxis type="number" tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} />
                                                    <YAxis type="category" dataKey="name" tick={false} axisLine={false} tickLine={false} width={4} />
                                                    <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                                                        formatter={(v: number | undefined, _n: unknown, props: { payload?: { type: string; length: number } }) => {
                                                            if (v === undefined) return ['—', ''];
                                                            const r = props.payload;
                                                            return [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)} · ${r?.type === 'W' ? 'Win' : 'Loss'} ×${r?.length ?? 0}`, 'Impact'];
                                                        }}
                                                        labelFormatter={() => ''}
                                                    />
                                                    <Bar dataKey="pnl" radius={[0, 2, 2, 0]}>
                                                        {streakImpactData.map((d, i) => (
                                                            <Cell key={i} fill={d.pnl >= 0 ? 'rgba(166,255,77,0.85)' : 'rgba(255,71,87,0.85)'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── RECOVERY PROBABILITY ── */}
                            {recoveryProbTable.length > 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>RECOVERY PROBABILITY AFTER N CONSECUTIVE LOSSES</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', marginBottom: 20 }}>Derived from your actual trade sequence — not theory. How likely is your next trade to be a win after a losing streak?</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#1a1c24', marginBottom: 20 }}>
                                        {recoveryProbTable.map((row, i) => {
                                            const pct = row.recoveryProb ?? 0;
                                            const color = pct >= 65 ? '#A6FF4D' : pct >= 50 ? '#EAB308' : '#ff4757';
                                            return (
                                                <div key={i} style={{ padding: '20px 16px', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center' }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AFTER {row.n} LOSSES</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color }}>{row.recoveryProb !== null ? `${row.recoveryProb.toFixed(0)}%` : '—'}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#8b949e' }}>recovery</span>
                                                    {/* Mini progress bar */}
                                                    <div style={{ width: '100%', height: 4, background: '#1a1c24', borderRadius: 1 }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 1 }} />
                                                    </div>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280' }}>{row.instances} instance{row.instances !== 1 ? 's' : ''}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#8b949e' }}>{row.avgTrades !== null ? `${row.avgTrades.toFixed(1)} trades to recover` : '—'}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>COACHING ACTION</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8 }}>
                                            {recoveryProbTable[0]?.recoveryProb !== null && recoveryProbTable[0].recoveryProb! < 60
                                                ? `After just ${recoveryProbTable[0].n} loss, your probability of the next trade winning drops to ${recoveryProbTable[0].recoveryProb!.toFixed(0)}%. This is your primary tilt signal. Use a mandatory 5-minute break after any loss. The data is clear.`
                                                : `Your recovery rate after 1 loss is ${recoveryProbTable[0]?.recoveryProb?.toFixed(0) ?? '—'}% — above the random 50% baseline. Good discipline. The risk is after ${recoveryProbTable[1]?.n ?? 2}+ consecutive losses where the probability drops to ${recoveryProbTable[1]?.recoveryProb?.toFixed(0) ?? '—'}%.`
                                            }
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── PSYCHOLOGICAL STATE PROFILE ── */}
                            {psychStates.length > 0 && closed.length >= 5 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>PSYCHOLOGICAL STATE PROFILE</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', marginBottom: 20 }}>Behavioral patterns extracted from your data. Each state has a documented trigger and a prescriptive response.</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {psychStates.map((ps, i) => {
                                            const sevColor = ps.severity === 'CRITICAL' ? '#ff4757' : ps.severity === 'HIGH' ? '#EAB308' : '#00D4FF';
                                            const sevBg = ps.severity === 'CRITICAL' ? 'rgba(255,71,87,0.05)' : ps.severity === 'HIGH' ? 'rgba(234,179,8,0.04)' : 'rgba(0,212,255,0.04)';
                                            const sevBorder = ps.severity === 'CRITICAL' ? 'rgba(255,71,87,0.2)' : ps.severity === 'HIGH' ? 'rgba(234,179,8,0.18)' : 'rgba(0,212,255,0.18)';
                                            return (
                                                <div key={i} style={{ background: sevBg, border: `1px solid ${sevBorder}`, padding: '0', overflow: 'hidden' }}>
                                                    {/* Header */}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${sevBorder}`, background: `${sevColor}08` }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                            <div style={{ width: 3, height: 28, background: sevColor, flexShrink: 0 }} />
                                                            <div>
                                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>{ps.title}</div>
                                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: sevColor, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>STATE DETECTED</div>
                                                            </div>
                                                        </div>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '4px 10px', border: `1px solid ${sevColor}44`, color: sevColor, background: `${sevColor}11` }}>
                                                            {ps.severity}
                                                        </span>
                                                    </div>
                                                    {/* Body */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                                        <div style={{ padding: '16px 20px', borderRight: `1px solid ${sevBorder}` }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>TRIGGER</div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>{ps.trigger}</p>
                                                        </div>
                                                        <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.01)' }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>PRESCRIBED RESPONSE</div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.7, margin: 0 }}>{ps.response}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                        </motion.div>
                    )}

                    {activeTab.startsWith('PATTERNS') && (
                        <motion.div key="patterns" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── HEADER ── */}
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>BEHAVIORAL FORENSICS</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Detected Behavioral Patterns</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>
                                    Machine-detected recurring behaviors in your trade sequence. Each pattern has a quantified dollar impact, a trigger condition, and a prescriptive fix.
                                </div>
                            </div>

                            {forensics.patterns.length === 0 ? (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '48px', textAlign: 'center' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#A6FF4D', marginBottom: 8 }}>✓ CLEAN</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#8b949e' }}>No behavioral patterns detected in your data. Log more trades for deeper analysis.</div>
                                </div>
                            ) : (
                                <>
                                    {/* ── 4-KPI GRID ── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                        {[
                                            { label: 'PATTERNS DETECTED', value: `${forensics.patterns.length}`, sub: `${forensics.patterns.filter((p: any) => p.severity === 'CRITICAL').length} critical`, color: forensics.patterns.some((p: any) => p.severity === 'CRITICAL') ? '#ff4757' : '#EAB308' },
                                            { label: 'TOTAL BEHAVIORAL COST', value: behavioralCost < 0 ? `-$${Math.abs(behavioralCost).toFixed(0)}` : '$0', sub: 'Avoidable losses', color: '#ff4757' },
                                            { label: 'PROJECTED NET P&L', value: withoutToxicPatterns !== 0 ? `${withoutToxicPatterns >= 0 ? '+' : ''}$${Math.abs(withoutToxicPatterns).toFixed(0)}` : '—', sub: 'If all patterns corrected', color: withoutToxicPatterns > netPnl ? '#A6FF4D' : '#c9d1d9' },
                                            { label: 'BEHAVIORAL EFFICIENCY', value: (grossProfit + grossLoss) > 0 ? `${(100 - (Math.abs(behavioralCost) / (grossProfit + grossLoss)) * 100).toFixed(0)}%` : '—', sub: 'Capital not lost to behavior', color: '#c9d1d9' },
                                        ].map((k, i) => (
                                            <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>{k.sub}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* ── PATTERN IMPACT COMPARISON CHART ── */}
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>PATTERN COST COMPARISON</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', marginBottom: 16 }}>Dollar cost of each behavioral pattern, sorted by impact. The longest bar needs your attention first.</div>
                                        <div style={{ height: Math.max(120, forensics.patterns.length * 52) }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={[...forensics.patterns].sort((a: any, b: any) => Math.abs(b.impact) - Math.abs(a.impact)).map((p: any) => ({ name: p.name, impact: Math.abs(p.impact), freq: p.freq, severity: p.severity }))}
                                                    layout="vertical"
                                                    margin={{ top: 4, right: 80, bottom: 0, left: 0 }}
                                                    barCategoryGap="30%"
                                                >
                                                    <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" horizontal={false} />
                                                    <XAxis type="number" tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`} />
                                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#c9d1d9', fontFamily: 'var(--font-mono)', fontWeight: 600 }} axisLine={false} tickLine={false} width={140} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                                                        formatter={(v: number | undefined, _n: unknown, props: { payload?: { freq: number; severity: string } }) => {
                                                            if (v === undefined) return ['—', ''];
                                                            return [`-$${v.toFixed(0)} · ${props.payload?.freq ?? 0} instances · ${props.payload?.severity ?? ''}`, 'Behavioral Cost'];
                                                        }}
                                                        labelFormatter={(l: unknown) => `${l}`}
                                                    />
                                                    <Bar dataKey="impact" radius={[0, 2, 2, 0]}>
                                                        {[...forensics.patterns].sort((a: any, b: any) => Math.abs(b.impact) - Math.abs(a.impact)).map((p: any, i: number) => (
                                                            <Cell key={i} fill={p.severity === 'CRITICAL' ? '#ff4757' : p.severity === 'HIGH' ? 'rgba(255,71,87,0.6)' : '#EAB308'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, background: '#ff4757' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757' }}>CRITICAL</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, background: 'rgba(255,71,87,0.6)' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', opacity: 0.7 }}>HIGH</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, background: '#EAB308' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308' }}>MODERATE</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── DEEP PATTERN CARDS ── */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase' }}>PATTERN DEEP DIVE</div>
                                        {forensics.patterns.map((p: any, i: number) => {
                                            const isC = p.severity === 'CRITICAL';
                                            const sevColor = isC ? '#ff4757' : p.severity === 'HIGH' ? '#EAB308' : '#fb923c';
                                            const sevBg = isC ? 'rgba(255,71,87,0.04)' : 'rgba(234,179,8,0.04)';
                                            const sevBorder = isC ? 'rgba(255,71,87,0.2)' : 'rgba(234,179,8,0.18)';
                                            const prescription = p.name === 'Revenge Trading'
                                                ? 'After any losing trade, mandatory 5-minute break before next entry. No exceptions. Set a timer. Journal your emotional state before re-entering. Rapid re-entry within 2 minutes of a loss has a statistically lower win rate in your data.'
                                                : p.name === 'Held Losers'
                                                ? 'Set a hard maximum hold time on losers: if a position is down and has been open longer than your avg win hold time, close it. Time-in-trade on losers is compounding cost, not opportunity.'
                                                : p.name === 'Spike Vulnerability'
                                                ? 'Hard stop losses are non-negotiable on volatile instruments. No position should be held through a news/spike event without a stop. Size down or exit before known catalysts.'
                                                : p.name === 'Early Exit'
                                                ? 'For your next 20 winning trades, do not exit until either your stop is hit or your initial target is reached. Log the would-have-been P&L. The data will show you exactly how much you are leaving on the table.'
                                                : p.name === 'Micro Overtrading'
                                                ? 'Cap micro contract frequency to 3 entries per session per instrument. Overtrading micro contracts dilutes your edge and increases commission drag on already thin margins.'
                                                : `Address the root cause of ${p.name}. Review ${p.freq} occurrence${p.freq > 1 ? 's' : ''} and identify the common trigger across all instances.`;
                                            return (
                                                <div key={i} style={{ background: sevBg, border: `1px solid ${sevBorder}`, overflow: 'hidden' }}>
                                                    {/* Pattern header */}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${sevBorder}`, background: `${sevColor}08`, flexWrap: 'wrap', gap: 12 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                                            <div style={{ width: 3, height: 36, background: sevColor, flexShrink: 0 }} />
                                                            <div>
                                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>{p.name}</div>
                                                                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, padding: '2px 8px', border: `1px solid ${sevColor}44`, color: sevColor, background: `${sevColor}11`, letterSpacing: '0.1em' }}>{p.severity}</span>
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>{p.freq} OCCURRENCE{p.freq > 1 ? 'S' : ''} DETECTED</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>BEHAVIORAL COST</div>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 800, color: '#ff4757' }}>-${Math.abs(p.impact).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                                        </div>
                                                    </div>

                                                    {/* Description + evidence */}
                                                    <div style={{ padding: '16px 24px', borderBottom: `1px solid ${sevBorder}` }}>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: '0 0 12px 0' }}>{p.desc}</p>
                                                        {p.evidence && p.evidence.length > 0 && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>EVIDENCE</div>
                                                                {p.evidence.map((ev: string, idx: number) => (
                                                                    <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                                        <div style={{ width: 4, height: 4, background: sevColor, flexShrink: 0, marginTop: 5, borderRadius: '50%' }} />
                                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', lineHeight: 1.6 }}>{ev}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Trigger / Prescription */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                                        <div style={{ padding: '16px 24px', borderRight: `1px solid ${sevBorder}` }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>TRIGGER PATTERN</div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                                {p.name === 'Revenge Trading' && 'Loss → rapid re-entry within minutes. Emotional pressure overrides systematic entry criteria. Confirmation bias maintained despite market rejection.'}
                                                                {p.name === 'Held Losers' && 'Open losing position held significantly longer than average winning trades. Hope displacing risk management — waiting for a reversal that the data shows rarely comes.'}
                                                                {p.name === 'Spike Vulnerability' && 'Rapid large loss in under 3 minutes — likely a news spike or stop-hunt event. No hard stop in place to limit damage.'}
                                                                {p.name === 'Early Exit' && 'Winning positions closed before reaching structural target. Premature profit-taking driven by fear of reversal. Asymmetry works against you when wins are cut short.'}
                                                                {p.name === 'Micro Overtrading' && 'Above-normal trade frequency on micro contracts within single sessions. Frequency without edge is just commission bleeding.'}
                                                                {!['Revenge Trading','Held Losers','Spike Vulnerability','Early Exit','Micro Overtrading'].includes(p.name) && `Recurring pattern detected ${p.freq} time${p.freq > 1 ? 's' : ''} across your trade history. See evidence above for specific instances.`}
                                                            </p>
                                                        </div>
                                                        <div style={{ padding: '16px 24px', background: 'rgba(166,255,77,0.02)' }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>PRESCRIPTION</div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.7, margin: 0 }}>{prescription}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* ── BEHAVIORAL HEALTH SUMMARY ── */}
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>BEHAVIORAL REMEDIATION PRIORITY</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {[...forensics.patterns]
                                                .sort((a: any, b: any) => Math.abs(b.impact) - Math.abs(a.impact))
                                                .map((p: any, i: number) => {
                                                    const maxImpact = Math.max(...forensics.patterns.map((x: any) => Math.abs(x.impact)), 1);
                                                    const barW = (Math.abs(p.impact) / maxImpact) * 100;
                                                    const sevColor = p.severity === 'CRITICAL' ? '#ff4757' : p.severity === 'HIGH' ? '#EAB308' : '#fb923c';
                                                    return (
                                                        <div key={i}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', fontWeight: 700 }}>#{i + 1} {p.name}</span>
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '1px 6px', border: `1px solid ${sevColor}44`, color: sevColor, background: `${sevColor}11` }}>{p.severity}</span>
                                                                </div>
                                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#ff4757' }}>-${Math.abs(p.impact).toFixed(0)}</span>
                                                            </div>
                                                            <div style={{ height: 6, background: '#1a1c24', borderRadius: 1 }}>
                                                                <motion.div initial={{ width: 0 }} animate={{ width: `${barW}%` }} style={{ height: '100%', background: sevColor, borderRadius: 1, opacity: 0.8 }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                        <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(166,255,77,0.03)', border: '1px solid rgba(166,255,77,0.12)', borderLeft: '3px solid #A6FF4D' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>FOCUS ORDER</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8 }}>
                                                Fix {forensics.patterns[0]?.name ?? 'your top pattern'} first — it costs the most. Do not attempt to address multiple patterns simultaneously. Master one rule change per 2 weeks. Sequence matters.
                                                {behavioralCost < 0 && ` Correcting all patterns would recover approximately $${Math.abs(behavioralCost).toFixed(0)}, turning your net P&L from ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(0)} to ${withoutToxicPatterns >= 0 ? '+' : ''}$${withoutToxicPatterns.toFixed(0)}.`}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                        </motion.div>
                    )}

                    {activeTab === 'SCORECARD' && (() => {
                        // ── Pre-compute all enriched scorecard values ──
                        const sc = forensics.scorecard; // [{metric, grade, desc}]
                        const gradeColor = (g: string) => g === 'A' ? '#A6FF4D' : g === 'B' ? '#00D4FF' : g === 'C' ? '#EAB308' : g === '—' ? '#6b7280' : '#ff4757';
                        const gradeScore = (g: string) => g === 'A' ? 100 : g === 'B' ? 75 : g === 'C' ? 50 : g === '—' ? 50 : 20;
                        const compositeScore = sc.length > 0 ? Math.round(sc.reduce((s: number, x: any) => s + gradeScore(x.grade), 0) / sc.length) : 0;
                        const compositeGrade = compositeScore >= 90 ? 'A' : compositeScore >= 75 ? 'B' : compositeScore >= 55 ? 'C' : compositeScore >= 35 ? 'D' : 'F';
                        const passing = sc.filter((x: any) => x.grade === 'A' || x.grade === 'B').length;
                        const failing = sc.filter((x: any) => x.grade === 'F' || x.grade === 'D').length;

                        // Max single-trade loss
                        const maxLossTrade = losses.length > 0 ? Math.max(...losses.map(t => Math.abs(t.pnl ?? 0))) : 0;
                        const maxLossPct = (account.startingBalance ?? 0) > 0 ? (maxLossTrade / (account.startingBalance ?? 1)) * 100 : 0;

                        // Revenge trading
                        const revPattern = forensics.patterns.find((p: any) => p.name === 'Revenge Trading');
                        const revCount = revPattern?.freq ?? 0;

                        // Hold time ratio
                        const htRatio = avgLossDuration > 0 ? avgWinDuration / avgLossDuration : null;

                        // First hour EST trades
                        const firstHourStats = hourlyStats.slice(0, 10).reduce((acc, h) => ({ pnl: acc.pnl + h.pnl, trades: acc.trades + h.trades, wins: acc.wins + h.wins }), { pnl: 0, trades: 0, wins: 0 });
                        const firstHourWR = firstHourStats.trades > 0 ? (firstHourStats.wins / firstHourStats.trades) * 100 : 0;

                        // Max session trades
                        const maxSessionTrades = sessionMetrics.length > 0 ? Math.max(...sessionMetrics.map((s: any) => s.trades.length)) : 0;

                        // Micro contracts P&L (assets starting with M + 1-2 alphanumeric chars, e.g. MES, MNQ, MCL, M2K, M6A)
                        const microAssets = instrumentArray.filter(i => /^M[A-Z0-9]{1,2}$/.test(i.asset));
                        const microPnl = microAssets.reduce((s, i) => s + i.pnl, 0);

                        // Instrument count
                        const instCount = instrumentArray.length;

                        // Per-metric enriched data
                        const metricDetails = [
                            {
                                idx: 0,
                                actualLabel: 'MAX SINGLE TRADE LOSS',
                                actualValue: maxLossTrade > 0 ? `-$${maxLossTrade.toFixed(0)}` : '—',
                                actualSub: maxLossPct > 0 ? `${maxLossPct.toFixed(1)}% of starting balance` : 'No losses recorded',
                                barPct: Math.min(100, (maxLossPct / 6) * 100),
                                barColor: maxLossPct < 1 ? '#A6FF4D' : maxLossPct < 2 ? '#00D4FF' : maxLossPct < 4 ? '#EAB308' : '#ff4757',
                                interpretation: maxLossTrade > 0
                                    ? `Your largest single trade loss was $${maxLossTrade.toFixed(0)} (${maxLossPct.toFixed(1)}% of starting balance). ${maxLossPct < 1 ? 'Under 1% — tight risk control. Elite-level discipline on position sizing.' : maxLossPct < 2 ? 'Between 1–2% — within the standard guideline. Acceptable, but tighten toward 1%.' : maxLossPct < 4 ? 'Between 2–4% — above the 2% guideline. This trade took a meaningful bite of capital on a single entry.' : 'Above 4% — one trade risked a disproportionate share of your account. This must be corrected immediately.'}`
                                    : 'No loss data available yet. Log closed trades to see risk per trade analysis.',
                                action: maxLossPct >= 4
                                    ? `Hard rule: no single trade risks more than 1% of starting balance ($${Math.round((account.startingBalance ?? 0) * 0.01)}). Your worst trade was ${maxLossPct.toFixed(1)}× that limit. Pre-set stops before entry — no exceptions.`
                                    : maxLossPct >= 2
                                    ? `Tighten your default stop to 1% of starting balance ($${Math.round((account.startingBalance ?? 0) * 0.01)}). Your worst trade exceeded 2% — this is manageable now but a pattern would compound the damage.`
                                    : `Good discipline — max loss within 2%. Maintain stops. If any trade exceeds $${Math.round((account.startingBalance ?? 0) * 0.015)}, review whether position size was appropriate.`,
                            },
                            {
                                idx: 1,
                                actualLabel: 'REVENGE SEQUENCES DETECTED',
                                actualValue: `${revCount}`,
                                actualSub: revCount > 0 ? `${revPattern?.freq} occurrences · Est. cost -$${Math.abs(revPattern?.impact ?? 0).toFixed(0)}` : 'Zero revenge sequences',
                                barPct: Math.min(100, revCount * 25),
                                barColor: revCount === 0 ? '#A6FF4D' : revCount === 1 ? '#EAB308' : revCount <= 3 ? '#F97316' : '#ff4757',
                                interpretation: revCount === 0
                                    ? 'No revenge trading patterns detected. You are not immediately re-entering after losses — this means your emotional regulation is working. This is one of the hardest disciplines to maintain.'
                                    : `${revCount} revenge sequence${revCount > 1 ? 's' : ''} detected. Revenge trading is rapid re-entry within minutes of a loss, driven by the urge to recover — not by new market structure. The entry thesis after a revenge entry is nearly always the same broken thesis that caused the original loss.`,
                                action: revCount === 0
                                    ? 'Maintain current discipline. Rule to lock in: after any single loss, mandatory 5-minute pause before next entry. Even clean re-entries benefit from a reset window.'
                                    : `Implement a hard cooldown after every loss: minimum 10 minutes before the next entry is allowed. Your data shows $${Math.abs(revPattern?.impact ?? 0).toFixed(0)} in identifiable revenge-trade losses. One rule eliminates that entire cost.`,
                            },
                            {
                                idx: 2,
                                actualLabel: 'WIN/LOSS HOLD RATIO',
                                actualValue: htRatio !== null ? `${htRatio.toFixed(2)}x` : '—',
                                actualSub: `Winners: ${fmtDuration(avgWinDuration)} · Losers: ${fmtDuration(avgLossDuration)}`,
                                barPct: htRatio !== null ? Math.min(100, (htRatio / 2) * 100) : 50,
                                barColor: htRatio === null ? '#6b7280' : htRatio >= 1.2 ? '#A6FF4D' : htRatio >= 0.9 ? '#00D4FF' : htRatio >= 0.6 ? '#EAB308' : '#ff4757',
                                interpretation: htRatio === null
                                    ? 'Insufficient trade history to compute hold time asymmetry. Log at least one win and one loss with timestamps to unlock this metric.'
                                    : htRatio >= 1.2
                                    ? `Winners held ${htRatio.toFixed(2)}x longer than losers — strong asymmetry. You are cutting losses efficiently and letting profits run. This is the structural behavior of consistently profitable traders.`
                                    : htRatio >= 0.9
                                    ? `Winners held ${htRatio.toFixed(2)}x as long as losers — near-neutral asymmetry. You are close to balance but not yet running wins long enough relative to losses. A small improvement in target discipline would push this to A.`
                                    : htRatio >= 0.6
                                    ? `Winners held ${htRatio.toFixed(2)}x as long as losers — mild inversion. Losses linger slightly longer than wins on average, suggesting some hope-holding on losing trades.`
                                    : `Losers held ${(1/htRatio).toFixed(2)}x longer than winners — severe inversion. You are cutting wins aggressively short while holding losses well past their natural exit. This pattern erodes edge even in high win-rate strategies.`,
                                action: htRatio !== null && htRatio < 0.9
                                    ? `Set a time-based kill switch: any losing trade open beyond ${fmtDuration(avgWinDuration * 1.5)} gets closed regardless of price action. Stop waiting for reversals that the data shows rarely materialize.`
                                    : 'Keep letting winners breathe. If tempted to close a winner early, verify your target has been hit — if not, hold the position.',
                            },
                            {
                                idx: 3,
                                actualLabel: 'AVG WIN / AVG LOSS RATIO',
                                actualValue: wlRatio > 0 ? `${wlRatio.toFixed(2)}:1` : '—',
                                actualSub: `Avg win $${avgWin.toFixed(0)} · Avg loss $${avgLoss.toFixed(0)}`,
                                barPct: Math.min(100, (wlRatio / 3) * 100),
                                barColor: wlRatio >= 1.5 ? '#A6FF4D' : wlRatio >= 1 ? '#EAB308' : '#ff4757',
                                interpretation: wlRatio === 0
                                    ? 'No complete win/loss data. Log both wins and losses to compute the payoff ratio.'
                                    : wlRatio >= 1.5
                                    ? `W:L ratio ${wlRatio.toFixed(2)}:1 — wins are meaningfully larger than losses. At your ${winRate.toFixed(0)}% win rate, your expected value per trade is +$${expectancy.toFixed(2)}. This is structural edge.`
                                    : wlRatio >= 1.2
                                    ? `W:L ratio ${wlRatio.toFixed(2)}:1 — above 1:1 and approaching the optimal 1.5× threshold. Expected value per trade: +$${expectancy.toFixed(2)}. Minor improvement in target discipline would push this to elite range.`
                                    : wlRatio >= 1.0
                                    ? `W:L ratio ${wlRatio.toFixed(2)}:1 — marginally above breakeven. Your wins and losses are nearly the same size, so your edge comes almost entirely from win rate. Any win rate regression directly erodes profitability.`
                                    : `W:L ratio ${wlRatio.toFixed(2)}:1 — losses larger than wins on average. Your expected value per trade is ${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}. ${expectancy >= 0 ? 'Positive expectancy is maintained by your win rate, but any WR dip will flip it negative.' : 'Negative expectancy — the combination of low W:L and insufficient win rate is costing you per trade on average.'}`,
                                action: wlRatio < 1.5
                                    ? `Target 1.5× your average stop size minimum. If avg loss is $${avgLoss.toFixed(0)}, your minimum target should be $${(avgLoss * 1.5).toFixed(0)}. Do not close winning trades before that level.`
                                    : 'Above 1.5 — strong. Maintain discipline. Do not move targets closer when uncomfortable; let the system work.',
                            },
                            {
                                idx: 4,
                                actualLabel: microAssets.length > 0 ? 'MICRO CONTRACT NET P&L' : 'MICRO CONTRACTS',
                                actualValue: microAssets.length > 0 ? `${microPnl >= 0 ? '+' : ''}$${microPnl.toFixed(0)}` : '—',
                                actualSub: microAssets.length > 0 ? `${microAssets.length} micro instrument${microAssets.length !== 1 ? 's' : ''} traded` : 'No micro contracts detected',
                                barPct: microAssets.length === 0 ? 100 : Math.min(100, (Math.abs(microPnl) / Math.max(Math.abs(netPnl), 1)) * 100),
                                barColor: microAssets.length === 0 || microPnl >= 0 ? '#A6FF4D' : '#ff4757',
                                interpretation: microAssets.length === 0
                                    ? 'No micro contracts detected in your trade history. This metric monitors whether smaller-size practice trades are costing you through commission bleed.'
                                    : microPnl >= 0
                                    ? `Micro contracts are net profitable (+$${microPnl.toFixed(0)}). Your smaller-size trades are contributing positively to your edge — they are being used appropriately.`
                                    : `Micro contracts have a net loss of $${Math.abs(microPnl).toFixed(0)}. Micro sizing should reduce risk, not add a separate loss center. These trades are bleeding commissions without edge.`,
                                action: microPnl < 0 && microAssets.length > 0
                                    ? `Immediately apply the same entry criteria to micro trades as full-size trades. Do not use micro contracts for "feeling out" the market — every trade needs an edge thesis.`
                                    : 'Micro management is clean. Continue applying full entry discipline to micro-size trades — no different rules for smaller contracts.',
                            },
                            {
                                idx: 5,
                                actualLabel: 'FIRST-HOUR TRADES (PRE-10AM)',
                                actualValue: firstHourStats.trades > 0 ? `${firstHourStats.trades}T · ${firstHourWR.toFixed(0)}% WR` : 'None',
                                actualSub: firstHourStats.trades > 0 ? `Net P&L: ${firstHourStats.pnl >= 0 ? '+' : ''}$${firstHourStats.pnl.toFixed(0)} before 10:00 EST` : 'No trades logged before 10:00 EST',
                                barPct: firstHourStats.trades === 0 ? 100 : Math.min(100, firstHourWR),
                                barColor: firstHourWR >= 50 && firstHourStats.pnl >= 0 ? '#A6FF4D' : firstHourWR >= 40 ? '#EAB308' : '#ff4757',
                                interpretation: firstHourStats.trades === 0
                                    ? 'No first-hour trades detected. The open is the most volatile and spread-widest period — avoiding it is a valid edge strategy.'
                                    : firstHourWR >= 50 && firstHourStats.pnl >= 0
                                    ? `First hour performance is positive (${firstHourWR.toFixed(0)}% WR, +$${firstHourStats.pnl.toFixed(0)}). You have an edge in the open window — this is unusual and worth protecting.`
                                    : `First hour win rate is ${firstHourWR.toFixed(0)}% with ${firstHourStats.pnl >= 0 ? '+' : ''}$${firstHourStats.pnl.toFixed(0)} net. The open window has the highest spread costs and news-spike risk. Below 50% WR here is structural, not random.`,
                                action: firstHourStats.trades > 0 && (firstHourWR < 50 || firstHourStats.pnl < 0)
                                    ? `Consider a soft ban on trades before 10:00 EST — or require a 15-minute observation period after open before entering. Your first-hour data does not justify full-size participation.`
                                    : firstHourStats.trades > 0
                                    ? 'First hour is profitable — protect it. Use full standard size in this window. If WR ever drops below 50% over 20+ samples, re-evaluate.'
                                    : 'Good instinct avoiding the open. Re-evaluate once you have 20+ data points if market conditions change.',
                            },
                            {
                                idx: 6,
                                actualLabel: 'MAX TRADES IN ONE SESSION',
                                actualValue: maxSessionTrades > 0 ? `${maxSessionTrades} trades` : '—',
                                actualSub: `Avg per session: ${avgSessionTrades.toFixed(1)} trades · ${sessionMetrics.length} sessions total`,
                                barPct: Math.min(100, (maxSessionTrades / 25) * 100),
                                barColor: maxSessionTrades <= 10 ? '#A6FF4D' : maxSessionTrades <= 15 ? '#00D4FF' : maxSessionTrades <= 20 ? '#EAB308' : '#ff4757',
                                interpretation: maxSessionTrades === 0
                                    ? 'No session data available yet. Log trades across multiple sessions to track session cap discipline.'
                                    : maxSessionTrades <= 10
                                    ? `Max session trade count is ${maxSessionTrades} — tight, selective execution. You are not overtrading. Each trade likely has a distinct structural thesis.`
                                    : maxSessionTrades <= 15
                                    ? `Max session trade count is ${maxSessionTrades} — within acceptable range. Edge selectivity is holding, but there is room to trim the lower-conviction setups.`
                                    : maxSessionTrades <= 20
                                    ? `One session reached ${maxSessionTrades} trades. This is above the optimal ceiling of 15. Beyond that, you are likely filling time or chasing missed entries rather than waiting for clean setups.`
                                    : `One or more sessions hit ${maxSessionTrades} trades. At this volume, trade quality invariably drops — later trades in a session are statistically weaker than early ones. Each trade past 15 is diluting your edge.`,
                                action: maxSessionTrades > 15
                                    ? `Set a hard session cap of 10 trades and a soft warning at 8. When you hit the cap, close the terminal. The data consistently shows edge decay above 10–12 trades per session.`
                                    : 'Session cap discipline is solid. Keep a maximum of 10 trades as your target. Any impulse beyond that warrants a pause, not an entry.',
                            },
                            {
                                idx: 7,
                                actualLabel: 'INSTRUMENTS TRADED',
                                actualValue: `${instCount}`,
                                actualSub: instCount > 0 ? instrumentArray.slice(0, 4).map(i => i.asset).join(' · ') + (instCount > 4 ? ` +${instCount - 4} more` : '') : 'No trades logged',
                                barPct: Math.min(100, Math.max(0, 100 - ((instCount - 1) / 5) * 100)),
                                barColor: instCount <= 2 ? '#A6FF4D' : instCount <= 4 ? '#EAB308' : '#ff4757',
                                interpretation: instCount === 0
                                    ? 'No instrument data yet.'
                                    : instCount <= 2
                                    ? `You trade ${instCount} instrument${instCount !== 1 ? 's' : ''} — excellent focus. Deep knowledge of a single instrument is your edge. You know its spread, its behavior, its patterns.`
                                    : instCount <= 4
                                    ? `${instCount} instruments traded. This is manageable but approaching the spread-too-thin threshold. Each instrument requires separate behavioral understanding.`
                                    : `${instCount} instruments traded. Ticker hopping is diluting your edge. Proficiency requires repetition — switching instruments resets your read of the tape.`,
                                action: instCount > 3
                                    ? `Select your top 2 instruments by P&L and win rate (currently: ${instrumentArray.slice(0, 2).map(i => i.asset).join(', ')}) and trade exclusively those for 30 sessions. Re-evaluate diversification only after edge is confirmed in both.`
                                    : `Focus maintained. Do not add new instruments until current ones have 50+ trade samples each.`,
                            },
                        ];

                        return (
                            <motion.div key="scorecard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                                {/* ── HEADER ── */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>EXECUTION QUALITY AUDIT</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Execution Scorecard</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>
                                            8 behavioral execution metrics graded A–F from your actual trade data. This is not opinion — it is derived directly from timestamps, P&L, and pattern sequences.
                                        </div>
                                    </div>
                                    {/* Composite grade callout */}
                                    <div style={{ background: '#0d1117', border: `1px solid ${gradeColor(compositeGrade)}44`, padding: '16px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 120 }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>OVERALL GRADE</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 52, fontWeight: 900, color: gradeColor(compositeGrade), lineHeight: 1, textShadow: `0 0 24px ${gradeColor(compositeGrade)}44` }}>{compositeGrade}</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: gradeColor(compositeGrade), letterSpacing: '0.08em' }}>{compositeScore}/100</div>
                                    </div>
                                </div>

                                {/* ── 4-KPI STRIP ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                    {[
                                        { label: 'COMPOSITE SCORE', value: `${compositeScore}`, sub: `Out of 100 · Grade ${compositeGrade}`, color: gradeColor(compositeGrade) },
                                        { label: 'METRICS PASSING', value: `${passing}/8`, sub: `${(passing / 8 * 100).toFixed(0)}% pass rate (A or B)`, color: passing >= 6 ? '#A6FF4D' : passing >= 4 ? '#EAB308' : '#ff4757' },
                                        { label: 'FAILING METRICS', value: `${failing}`, sub: failing === 0 ? 'No critical issues' : `${failing} need immediate attention`, color: failing === 0 ? '#A6FF4D' : failing <= 2 ? '#EAB308' : '#ff4757' },
                                        { label: 'BEHAVIORAL RISK', value: `${forensics.riskScore.toFixed(0)}/100`, sub: forensics.riskScore > 60 ? 'CRITICAL — address immediately' : forensics.riskScore > 35 ? 'Elevated — monitor closely' : 'Healthy', color: forensics.riskScore > 60 ? '#ff4757' : forensics.riskScore > 35 ? '#EAB308' : '#A6FF4D' },
                                    ].map((k, i) => (
                                        <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>{k.sub}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* ── SCORE OVERVIEW BAR ── */}
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '20px 24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>ALL 8 METRICS AT A GLANCE</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {sc.map((s: any, i: number) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '200px 28px 1fr 60px', alignItems: 'center', gap: 16 }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.metric}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 900, color: gradeColor(s.grade), textAlign: 'center' }}>{s.grade}</div>
                                                <div style={{ height: 4, background: '#1a1c24', borderRadius: 2, overflow: 'hidden' }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${gradeScore(s.grade)}%` }} transition={{ delay: i * 0.05 }} style={{ height: '100%', background: gradeColor(s.grade), borderRadius: 2 }} />
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {s.grade === 'A' ? 'PASSING' : s.grade === 'B' ? 'GOOD' : s.grade === 'C' ? 'MARGINAL' : s.grade === '—' ? 'NO DATA' : 'FAILING'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── 8 METRIC DEEP DIVE CARDS ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    {metricDetails.map((m, i) => {
                                        const s = sc[m.idx];
                                        const gc = gradeColor(s.grade);
                                        const isFailing = s.grade === 'F' || s.grade === 'D';
                                        return (
                                            <div key={i} style={{ background: '#0d1117', padding: '24px', display: 'flex', flexDirection: 'column', gap: 14, borderLeft: `2px solid ${gc}33` }}>
                                                {/* Grade + name */}
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280' }}>METRIC {i + 1} OF 8</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, padding: '1px 6px', border: `1px solid ${gc}44`, color: gc, background: `${gc}11`, letterSpacing: '0.1em' }}>
                                                                {s.grade === 'A' ? 'PASSING' : s.grade === 'B' ? 'GOOD' : s.grade === 'C' ? 'MARGINAL' : s.grade === '—' ? 'NO DATA' : 'FAILING'}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: '#fff' }}>{s.metric}</div>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginTop: 3, lineHeight: 1.5 }}>{s.desc}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 900, color: gc, lineHeight: 1, textShadow: `0 0 20px ${gc}33` }}>{s.grade}</div>
                                                    </div>
                                                </div>

                                                {/* Actual value */}
                                                <div style={{ background: '#0b0e14', border: '1px solid #1a1c24', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{m.actualLabel}</div>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: gc }}>{m.actualValue}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', lineHeight: 1.6 }}>{m.actualSub}</div>
                                                    </div>
                                                </div>

                                                {/* Score bar */}
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', letterSpacing: '0.08em' }}>SCORE</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: gc, fontWeight: 700 }}>{gradeScore(s.grade)}/100</span>
                                                    </div>
                                                    <div style={{ height: 4, background: '#1a1c24', borderRadius: 2, overflow: 'hidden' }}>
                                                        <motion.div initial={{ width: 0 }} animate={{ width: `${gradeScore(s.grade)}%` }} transition={{ delay: i * 0.06, duration: 0.5 }} style={{ height: '100%', background: gc, borderRadius: 2 }} />
                                                    </div>
                                                </div>

                                                {/* Interpretation + Action */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                                                    <div style={{ padding: '12px 14px', background: `rgba(${isFailing ? '255,71,87' : '166,255,77'},0.04)`, border: `1px solid rgba(${isFailing ? '255,71,87' : '166,255,77'},0.12)`, borderLeft: `3px solid ${isFailing ? '#ff4757' : '#A6FF4D'}` }}>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: isFailing ? '#ff4757' : '#A6FF4D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>WHAT THIS MEANS</div>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>{m.interpretation}</p>
                                                    </div>
                                                    <div style={{ padding: '12px 14px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.12)', borderLeft: '3px solid #EAB308' }}>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>ACTION</div>
                                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>{m.action}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* ── SUMMARY COACHING BLOCK ── */}
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>PRIORITY CORRECTION PLAN — HIGHEST IMPACT FIRST</div>
                                    {failing > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {sc.filter((s: any) => s.grade === 'F' || s.grade === 'D').map((s: any, i: number) => {
                                                const gc = gradeColor(s.grade);
                                                const det = metricDetails.find(m => sc[m.idx] === s);
                                                return (
                                                    <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 16px', background: '#0b0e14', borderLeft: `3px solid ${gc}` }}>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 900, color: gc, opacity: 0.3, lineHeight: 1, flexShrink: 0, width: 32 }}>{String(i + 1).padStart(2, '0')}</div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#fff' }}>{s.metric}</span>
                                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, padding: '1px 6px', border: `1px solid ${gc}44`, color: gc, background: `${gc}11` }}>GRADE {s.grade}</span>
                                                            </div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                                {det?.action ?? s.desc}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div style={{ padding: '20px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.15)', borderLeft: '3px solid #A6FF4D' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#A6FF4D', marginBottom: 6 }}>All metrics passing — elite execution discipline.</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                Zero failing grades means your behavioral foundations are solid. Focus on incremental improvement: review C-grade metrics and target one area per month. Consistency compounds faster than breakthroughs.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* ── GRADE LEGEND ── */}
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '16px 24px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>GRADE SCALE</span>
                                    {[
                                        { g: 'A', label: '≥90 · Passing', c: '#A6FF4D' },
                                        { g: 'B', label: '75–89 · Good', c: '#00D4FF' },
                                        { g: 'C', label: '50–74 · Marginal', c: '#EAB308' },
                                        { g: 'D', label: '20–49 · Failing', c: '#F97316' },
                                        { g: 'F', label: '<20 · Critical', c: '#ff4757' },
                                        { g: '—', label: 'No data', c: '#00D4FF' },
                                    ].map(({ g, label, c }) => (
                                        <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 900, color: c, lineHeight: 1 }}>{g}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: c, opacity: 0.75 }}>{label}</span>
                                        </div>
                                    ))}
                                </div>

                            </motion.div>
                        );
                    })()}

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
                                        <p className="text-[11px] text-[#6b7280] mb-4 leading-relaxed">
                                            Projection assumes full elimination of all flagged behavioral patterns. Actual improvement will vary — patterns are modeled independently and may overlap on shared trades.
                                        </p>
                                        <div className="flex gap-3 items-center">
                                            <div className="flex-1 bg-[#0d1117] border border-[#1a1c24] p-5 flex flex-col gap-2" style={{ borderRadius: 4 }}>
                                                <span className="text-[9px] uppercase tracking-[0.15em] font-bold" style={{ color: '#6b7280' }}>Current (with behavioral errors)</span>
                                                <span className="text-[36px] font-black font-mono" style={{ color: netPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                    {netPnl >= 0 ? '+' : '-'}${Math.abs(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-[11px]" style={{ color: '#6b7280' }}>{tradeCount} trades · {sessionCount} sessions</span>
                                            </div>
                                            <div className="flex items-center justify-center text-[#6b7280]" style={{ fontSize: 20 }}>→</div>
                                            <div className="flex-1 bg-[#0d1117] border border-[#1a1c24] p-5 flex flex-col gap-2" style={{ borderRadius: 4 }}>
                                                <span className="text-[9px] uppercase tracking-[0.15em] font-bold" style={{ color: '#6b7280' }}>Projected (with corrections)</span>
                                                <span className="text-[36px] font-black font-mono" style={{ color: projectedPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                                    {projectedPnl >= 0 ? '+' : '-'}${Math.abs(projectedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-[11px]" style={{ color: '#6b7280' }}>~{tradeCount} trades · Behavioral fixes applied</span>
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
                                    <span className="text-[10px] font-mono text-[#6b7280]">Last 30 days vs. prior period</span>
                                </div>
                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-[#1a1c24]">
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest text-[#6b7280]">Metric</th>
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest text-[#6b7280]">All Time</th>
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest" style={{ color: '#00D4FF' }}>Last 30d</th>
                                                <th className="px-5 py-3 text-[9px] font-mono uppercase tracking-widest text-[#6b7280]">Prior</th>
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
                                <p className="px-5 py-3 text-[10px] font-mono text-[#6b7280]">
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
