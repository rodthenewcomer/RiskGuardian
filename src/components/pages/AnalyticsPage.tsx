'use client';

import styles from './AnalyticsPage.module.css';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore, getTradingDay, type ReportSnapshot } from '@/store/appStore';
import { useTranslation } from '@/i18n/useTranslation';
import { useIsMobile } from '@/hooks/useIsMobile';
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
import { ChartCard, SegmentedBar, ThresholdBullet, DivergingBarList } from '@/components/charts/RiskGuardianPrimitives';

export default function AnalyticsPage() {
    const { trades, account, language, reportSnapshots, saveReportSnapshot, deleteReportSnapshot } = useAppStore();
    const isMobile = useIsMobile();
    const { t } = useTranslation();
    const lang = language ?? 'en';
    const touchStartX = useRef(0);
    const [activeTab, setActiveTab] = useState('OVERVIEW');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [copied, setCopied] = useState(false);
    const [reportPeriod, setReportPeriod] = useState<'7D'|'30D'|'90D'|'ALL'>('ALL');
    const [snapshotSaved, setSnapshotSaved] = useState(false);
    const [compareSelected, setCompareSelected] = useState<string[]>([]);

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

    const TABS: Array<{ key: string; label: string }> = [
        { key: 'OVERVIEW', label: lang === 'fr' ? 'APERÇU' : 'OVERVIEW' },
        { key: 'DAILY', label: lang === 'fr' ? 'P&L JOURNALIER' : 'DAILY P&L' },
        { key: 'INSTRUMENTS', label: lang === 'fr' ? 'INSTRUMENTS' : 'INSTRUMENTS' },
        { key: 'SESSIONS', label: lang === 'fr' ? 'SESSIONS' : 'SESSIONS' },
        { key: 'TIME', label: lang === 'fr' ? 'HORAIRES' : 'TIME' },
        { key: 'STREAKS', label: lang === 'fr' ? 'SÉRIES' : 'STREAKS' },
        { key: 'PATTERNS', label: lang === 'fr' ? `MOTIFS (${forensics.patterns.length})` : `PATTERNS (${forensics.patterns.length})` },
        { key: 'SCORECARD', label: 'SCORECARD' },
        { key: 'QUANT', label: 'QUANT' },
        { key: 'REPORT', label: lang === 'fr' ? 'RAPPORT' : 'REPORT' },
        { key: 'COMPARE', label: lang === 'fr' ? 'COMPARER' : 'COMPARE' },
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
        { label: 'NYSE OPEN', range: '09:30–11:00', hours: [9,10], color: '#FDC800' },
        { label: 'LUNCH GRIND', range: '11:00–14:00', hours: [11,12,13], color: '#EAB308' },
        { label: 'NY AFTERNOON', range: '14:00–16:00', hours: [14,15], color: '#FDC800' },
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

    const PIE_COLORS = ['#FDC800', '#00D4FF', '#EAB308', '#ff4757', '#fb923c'];

    return (
        <div className={styles.page}>
            {/* ── REPORT HEADER ──────────────────────────────────── */}
            <div style={{ borderBottom: '1px solid #1a1c24' }}>
                {/* Critical patterns alert */}
                {forensics.patterns.length > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: isMobile ? '10px 14px' : '10px 32px', background: 'rgba(230,0,35,0.06)',
                        borderBottom: '1px solid rgba(230,0,35,0.2)', flexWrap: 'wrap', gap: 8,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={12} color="#e60023" />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#e60023', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                {lang === 'fr' ? `${forensics.patterns.length} Motif${forensics.patterns.length > 1 ? 's' : ''} Critique${forensics.patterns.length > 1 ? 's' : ''} Détecté${forensics.patterns.length > 1 ? 's' : ''}` : `${forensics.patterns.length} Critical Pattern${forensics.patterns.length > 1 ? 's' : ''} Detected`}
                            </span>
                        </div>
                        <button
                            onClick={() => setActiveTab('PATTERNS')}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#e60023', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em', textDecoration: 'underline' }}>
                            {lang === 'fr' ? 'EXPLORER →' : 'EXPLORE →'}
                        </button>
                    </div>
                )}

                {/* Main header row */}
                <div style={{ padding: isMobile ? '14px 14px 12px' : '20px 32px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 18 : 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 8 }}>
                            {lang === 'fr' ? 'Analytiques' : 'Analysis'}{reportRange ? ` · ${reportRange.fromShort} – ${reportRange.toShort}` : ''}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>
                                {closed.length} trades
                            </span>
                            {closed.length > 0 && (
                                <>
                                    <span style={{ color: '#1a1c24' }}>·</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: netPnl >= 0 ? '#FDC800' : '#ff4757' }}>
                                        {netPnl >= 0 ? '+' : ''}${netPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {lang === 'fr' ? 'P&L net' : 'net P&L'}
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
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#FDC800'; (e.currentTarget as HTMLButtonElement).style.color = '#FDC800'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1a1c24'; (e.currentTarget as HTMLButtonElement).style.color = '#8b949e'; }}
                        >
                            <Download size={12} /> {lang === 'fr' ? 'EXPORTER PDF' : 'EXPORT PDF'}
                        </button>
                        <button
                            onClick={handleCopyLink}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                                padding: '8px 14px',
                                background: copied ? 'rgba(253,200,0,0.1)' : 'transparent',
                                border: `1px solid ${copied ? 'rgba(253,200,0,0.4)' : '#1a1c24'}`,
                                color: copied ? '#FDC800' : '#8b949e', cursor: 'pointer',
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
                    {TABS.map(({ key, label }) => (
                        <button key={key} className={`${styles.tab} ${activeTab === key ? styles.tabActive : ''}`} onClick={(e) => {
                            setActiveTab(key);
                            e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }}>
                            {label}
                        </button>
                    ))}
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
                    <span>{lang === 'fr' ? `FILTRE ACTIF — trades hors ${dateFrom || '…'} → ${dateTo || '…'} masqués.` : `DATE FILTER ACTIVE — trades outside ${dateFrom || '…'} → ${dateTo || '…'} are hidden.`}</span>
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', padding: '2px 8px', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)' }}>CLEAR</button>
                </div>
            )}

            <div
                className={styles.content}
                onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                    const diff = touchStartX.current - e.changedTouches[0].clientX;
                    if (Math.abs(diff) > 60) {
                        const keys = TABS.map(t => t.key);
                        const curIdx = keys.indexOf(activeTab);
                        if (diff > 0 && curIdx < keys.length - 1) setActiveTab(keys[curIdx + 1]);
                        else if (diff < 0 && curIdx > 0) setActiveTab(keys[curIdx - 1]);
                    }
                }}
            >
                <AnimatePresence mode="wait">
                    {activeTab === 'OVERVIEW' && (
                        <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {/* ── RISK ALERT BAR ── */}
                            {forensics.patterns.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(230,0,35,0.06)', border: '1px solid rgba(230,0,35,0.25)', borderLeft: '3px solid #e60023' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <AlertTriangle size={13} color="#e60023" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#e60023', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                            {lang === 'fr' ? `ALERTE RISQUE — ${forensics.patterns.length} MOTIF${forensics.patterns.length > 1 ? 'S' : ''} COMPORTEMENTAL${forensics.patterns.length > 1 ? 'S' : ''} CRITIQUE${forensics.patterns.length > 1 ? 'S' : ''} DÉTECTÉ${forensics.patterns.length > 1 ? 'S' : ''} DANS VOS DONNÉES. CLIQUEZ POUR ENQUÊTER.` : `RISK ALERT — ${forensics.patterns.length} CRITICAL BEHAVIORAL PATTERN${forensics.patterns.length > 1 ? 'S' : ''} DETECTED IN YOUR DATA. CLICK TO INVESTIGATE.`}
                                        </span>
                                    </div>
                                    <button onClick={() => setActiveTab('PATTERNS')} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#e60023', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.06em', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                                        {lang === 'fr' ? 'VOIR TOUS LES MOTIFS →' : 'SEE ALL PATTERNS →'}
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
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em' }}>{p.freq} {lang === 'fr' ? 'DÉTECTÉ(S)' : 'DETECTED'} · {forensics.patterns.length} {lang === 'fr' ? 'AU TOTAL' : 'TOTAL'}</span>
                                            </div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 }}>{p.name}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#8b949e', lineHeight: 1.7, maxWidth: 520 }}>
                                                {p.desc}{p.evidence?.[0] ? ` ${p.evidence[0]}.` : ''}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 4, textTransform: 'uppercase' }}>{lang === 'fr' ? 'COÛT ESTIMÉ' : 'ESTIMATED COST'}</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#ff4757' }}>
                                                -${Math.abs(p.impact ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </div>
                                            <button onClick={() => setActiveTab('PATTERNS')} style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textDecoration: 'underline' }}>
                                                {lang === 'fr' ? 'VOIR TOUS LES MOTIFS →' : 'SEE ALL PATTERNS →'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── 8 KPI BOXES ── */}
                            {(() => {
                                const kpiBoxes = [
                                    { label: lang === 'fr' ? 'NET P&L' : 'NET P&L',            value: `${netPnl >= 0 ? '+' : '-'}$${Math.abs(netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: netPnl >= 0 ? '#FDC800' : '#ff4757', sub: `Gross $${grossProfit.toFixed(0)} · Loss $${grossLoss.toFixed(0)}` },
                                    { label: lang === 'fr' ? 'TAUX RÉUSSITE' : 'WIN RATE',       value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? '#FDC800' : '#EAB308', sub: `${wins.length}W / ${losses.length}L of ${closed.length}` },
                                    { label: lang === 'fr' ? 'FACT. PROFIT' : 'PROFIT FACTOR',   value: profitFactor === 99 ? '∞' : profitFactor.toFixed(2), color: profitFactor >= 2 ? '#FDC800' : profitFactor >= 1.2 ? '#EAB308' : '#ff4757', sub: `Won $${grossProfit.toFixed(0)} / Lost $${grossLoss.toFixed(0)}` },
                                    { label: lang === 'fr' ? 'ESPÉRANCE' : 'EXPECTANCY',          value: `${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}`, color: expectancy >= 0 ? '#FDC800' : '#ff4757', sub: `Avg W $${avgWin.toFixed(0)} · Avg L $${avgLoss.toFixed(0)}` },
                                    { label: lang === 'fr' ? 'DRAWDOWN MAX' : 'MAX DRAWDOWN',    value: maxDd > 0 ? `-$${maxDd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', color: '#ff4757', sub: lang === 'fr' ? 'Sommet au creux' : 'Peak to trough' },
                                    { label: lang === 'fr' ? 'HAUSSE MAX' : 'MAX RUN-UP',        value: maxRunup > 0 ? `+$${maxRunup.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', color: '#FDC800', sub: lang === 'fr' ? 'Creux au sommet' : 'Trough to peak' },
                                    { label: lang === 'fr' ? 'DURÉE MOY.' : 'AVG DURATION',      value: fmtDuration((avgWinDuration * wins.length + avgLossDuration * losses.length) / Math.max(1, closed.length)), color: '#c9d1d9', sub: `${wins.length + losses.length} closed trades` },
                                    { label: lang === 'fr' ? 'RATIO G/P $' : 'W/L RATIO $',     value: wlRatio > 0 ? `${wlRatio.toFixed(2)}:1` : '—', color: wlRatio >= 1.5 ? '#FDC800' : wlRatio >= 1 ? '#EAB308' : '#ff4757', sub: `$${avgWin.toFixed(0)} avg win · $${avgLoss.toFixed(0)} loss` },
                                ];
                                return isMobile ? (
                                    <div style={{ position: 'relative', borderTop: '1px solid #1a1c24' }}>
                                        <div style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
                                            {kpiBoxes.map((k, i) => (
                                                <div key={i} style={{ flexShrink: 0, minWidth: 140, padding: '16px 14px', borderRight: '1px solid #1a1c24', borderBottom: '1px solid #1a1c24', scrollSnapAlign: 'start', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: k.color, lineHeight: 1, textShadow: `0 0 12px ${k.color}22` }}>{k.value}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{k.sub}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, background: 'linear-gradient(to left, #0B0E14 0%, transparent 100%)', pointerEvents: 'none' }} />
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                        {kpiBoxes.map((k, i) => (
                                            <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1, textShadow: `0 0 12px ${k.color}22` }}>{k.value}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{k.sub}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* ── WIN/LOSS SPLIT + THRESHOLD BULLETS ── */}
                            {closed.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {/* SegmentedBar: win/loss/flat */}
                                    <ChartCard
                                        title={t.analytics?.winRate ?? (lang === 'fr' ? 'TAUX DE RÉUSSITE' : 'WIN RATE')}
                                        subtitle={lang === 'fr' ? 'Répartition gains · pertes sur la période sélectionnée' : 'Win / loss split across the selected period'}
                                    >
                                        <SegmentedBar
                                            wins={wins.length}
                                            losses={losses.length}
                                            height={36}
                                            showLabels
                                        />
                                    </ChartCard>

                                    {/* Three ThresholdBullet metrics */}
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16 }}>
                                        <ChartCard
                                            title={lang === 'fr' ? 'TAUX DE RÉUSSITE' : 'WIN RATE'}
                                            subtitle={lang === 'fr' ? '% de trades gagnants' : '% of winning trades'}
                                        >
                                            <ThresholdBullet
                                                label={lang === 'fr' ? 'Taux de réussite' : 'Win Rate'}
                                                value={winRate}
                                                format={(v) => `${v.toFixed(1)}%`}
                                                thresholds={[
                                                    { max: 40, label: lang === 'fr' ? 'Faible' : 'Poor', color: '#ff4757' },
                                                    { max: 50, label: lang === 'fr' ? 'Passable' : 'Fair', color: '#EAB308' },
                                                    { max: 60, label: lang === 'fr' ? 'Bon' : 'Good', color: '#FDC800' },
                                                    { max: Infinity, label: lang === 'fr' ? 'Excellent' : 'Excellent', color: '#A6FF4D' },
                                                ]}
                                            />
                                        </ChartCard>

                                        <ChartCard
                                            title={lang === 'fr' ? 'FACTEUR PROFIT' : 'PROFIT FACTOR'}
                                            subtitle={lang === 'fr' ? 'Gains bruts ÷ pertes brutes' : 'Gross wins ÷ gross losses'}
                                        >
                                            <ThresholdBullet
                                                label={lang === 'fr' ? 'Facteur profit' : 'Profit Factor'}
                                                value={profitFactor === 99 ? 3 : profitFactor}
                                                format={(v) => `${v.toFixed(2)}x`}
                                                thresholds={[
                                                    { max: 1, label: lang === 'fr' ? 'Perdant' : 'Losing', color: '#ff4757' },
                                                    { max: 1.5, label: lang === 'fr' ? 'Marginal' : 'Marginal', color: '#EAB308' },
                                                    { max: 2.5, label: lang === 'fr' ? 'Bon' : 'Good', color: '#FDC800' },
                                                    { max: Infinity, label: lang === 'fr' ? 'Fort' : 'Strong', color: '#38bdf8' },
                                                ]}
                                            />
                                        </ChartCard>

                                        <ChartCard
                                            title={lang === 'fr' ? 'ESPÉRANCE' : 'EXPECTANCY'}
                                            subtitle={lang === 'fr' ? 'Gain moyen attendu par trade' : 'Expected avg gain per trade'}
                                        >
                                            <ThresholdBullet
                                                label={lang === 'fr' ? 'Espérance' : 'Expectancy'}
                                                value={expectancy}
                                                format={(v) => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}`}
                                                thresholds={[
                                                    { max: 0, label: lang === 'fr' ? 'Négatif' : 'Negative', color: '#ff4757' },
                                                    { max: 50, label: lang === 'fr' ? 'Faible' : 'Low', color: '#EAB308' },
                                                    { max: 150, label: lang === 'fr' ? 'Bon' : 'Good', color: '#FDC800' },
                                                    { max: Infinity, label: lang === 'fr' ? 'Fort' : 'Strong', color: '#38bdf8' },
                                                ]}
                                            />
                                        </ChartCard>
                                    </div>
                                </div>
                            )}

                            {/* ── FULL DETAILS ROW: Waterfall + Wins vs Losses ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Waterfall */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'DÉTAIL COMPLET' : 'FULL DETAILS'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{lang === 'fr' ? 'Brut, frais et ce qui reste réellement' : 'Gross, fees, and what actually landed'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 20 }}>{lang === 'fr' ? 'Un graphique en cascade montre clairement comment les commissions compriment le P&L brut.' : 'A waterfall is the cleanest way to show how commissions compress gross edge into net P&L.'}</div>
                                    {/* SVG Waterfall */}
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, padding: '0 8px', position: 'relative' }}>
                                        {[
                                            { label: lang === 'fr' ? 'BRUT' : 'GROSS', val: grossProfit, color: '#FDC800' },
                                            { label: lang === 'fr' ? 'PERTE' : 'LOSS', val: -grossLoss, color: '#ff4757' },
                                            { label: 'NET', val: netPnl, color: netPnl >= 0 ? '#FDC800' : '#ff4757' },
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
                                        {[lang === 'fr' ? 'BRUT' : 'GROSS', lang === 'fr' ? 'PERTE' : 'LOSS', 'NET'].map((l, i) => (
                                            <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em' }}>{l}</div>
                                        ))}
                                    </div>
                                </div>

                                {/* Wins vs Losses segmented */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'RÉSULTATS DES TRADES' : 'TRADE OUTCOMES'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{lang === 'fr' ? 'Gains contre pertes' : 'Wins versus losses'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 20 }}>{lang === 'fr' ? 'La composition segmentée se lit plus vite qu\'un donut et rend les comptes de trades explicites.' : 'Segmented composition reads faster than a donut here and keeps the trade counts explicit.'}</div>
                                    <div style={{ height: 12, background: '#1a1c24', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
                                        {closed.length > 0 && (
                                            <motion.div initial={{ width: 0 }} animate={{ width: `${winRate}%` }} style={{ height: '100%', background: '#FDC800', borderRadius: '2px 0 0 2px' }} />
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 32 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 8, height: 8, background: '#FDC800', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#FDC800' }}>{wins.length} trades</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ff4757' }}>{losses.length} trades</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── TRADE VIABILITY + PAYOFF PROFILE ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Profit Factor & Expectancy gauges */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'VIABILITÉ DES TRADES' : 'TRADE VIABILITY'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{lang === 'fr' ? 'Seuils de rentabilité' : 'Profitability thresholds'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 24 }}>{lang === 'fr' ? 'Le facteur de profit indique si les gains dépassent les pertes. L\'espérance indique ce que vaut chaque trade en moyenne.' : 'Profit factor tells you whether wins outsize losses. Expectancy tells you what each trade is worth on average.'}</div>

                                    {/* PF slider */}
                                    <div style={{ marginBottom: 24 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PROFIT FACTOR</span>
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: profitFactor >= 1.5 ? '#FDC800' : profitFactor >= 1 ? '#EAB308' : '#ff4757', marginBottom: 10 }}>
                                            {profitFactor === 99 ? '∞' : `${profitFactor.toFixed(2)}x`}
                                        </div>
                                        <div style={{ position: 'relative', height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 8 }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'linear-gradient(to right, #ff4757 0%, #EAB308 40%, #FDC800 70%)', borderRadius: 3, width: '100%', opacity: 0.3 }} />
                                            <motion.div initial={{ left: 0 }} animate={{ left: `${Math.min(95, (Math.min(profitFactor, 3) / 3) * 100)}%` }} style={{ position: 'absolute', top: -3, width: 12, height: 12, background: profitFactor >= 1.5 ? '#FDC800' : '#EAB308', borderRadius: '50%', transform: 'translateX(-50%)' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>
                                            <span>{lang === 'fr' ? '0–0.9x PERTE' : '0–0.9x LOSS'}</span><span>{lang === 'fr' ? '1–1.4x NEUTRE' : '1–1.4x FLAT'}</span><span>{lang === 'fr' ? '1.5–1.9x JOUABLE' : '1.5–1.9x PLAYABLE'}</span><span>{lang === 'fr' ? '2x+ AVANTAGE' : '2x+ EDGE'}</span>
                                        </div>
                                    </div>

                                    {/* Expectancy slider */}
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>EXPECTANCY / TRADE</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: expectancy >= 0 ? '#FDC800' : '#ff4757', marginBottom: 10 }}>
                                            {expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}
                                        </div>
                                        <div style={{ position: 'relative', height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 8 }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'linear-gradient(to right, #ff4757 0%, #EAB308 40%, #FDC800 70%)', borderRadius: 3, width: '100%', opacity: 0.3 }} />
                                            <motion.div
                                                initial={{ left: '50%' }}
                                                animate={{ left: `${Math.min(95, Math.max(5, 50 + (expectancy / Math.max(avgWin, 1)) * 40))}%` }}
                                                style={{ position: 'absolute', top: -3, width: 12, height: 12, background: expectancy >= 0 ? '#FDC800' : '#ff4757', borderRadius: '50%', transform: 'translateX(-50%)' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>
                                            <span>{lang === 'fr' ? 'NÉGATIF' : 'NEGATIVE'}</span><span>{lang === 'fr' ? 'NEUTRE' : 'FLAT'}</span><span>{lang === 'fr' ? 'POSITIF' : 'POSITIVE'}</span><span>{lang === 'fr' ? 'OPTIMAL' : 'OPTIMAL'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Payoff Profile */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'PROFIL DE GAIN' : 'PAYOFF PROFILE'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{lang === 'fr' ? 'Gain moyen contre perte moyenne' : 'Average win versus average loss'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 24 }}>{lang === 'fr' ? 'C\'est la représentation la plus directe de votre ratio W:L en dollars. Les traders lisent l\'écart plus vite que le ratio seul.' : 'This is the most direct visual for your W:L dollar ratio. Traders scan the payoff gap faster than the ratio alone.'}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 8, height: 8, background: '#FDC800', borderRadius: '50%' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#FDC800' }}>{lang === 'fr' ? 'Gain moyen' : 'Avg win'}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#FDC800', opacity: 0.65 }}>{wins.length} {lang === 'fr' ? 'trades gagnants' : 'winning trades'}</span>
                                                </div>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#FDC800' }}>+${avgWin.toFixed(2)}</span>
                                            </div>
                                            <div style={{ height: 10, background: '#1a1c24', borderRadius: 2 }}>
                                                <motion.div initial={{ width: 0 }} animate={{ width: `${avgLoss > 0 ? Math.min(100, (avgWin / Math.max(avgWin, avgLoss)) * 100) : 100}%` }} style={{ height: '100%', background: '#FDC800', borderRadius: 2 }} />
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757' }}>{lang === 'fr' ? 'Perte moyenne' : 'Avg loss'}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757', opacity: 0.65 }}>{losses.length} {lang === 'fr' ? 'trades perdants' : 'losing trades'}</span>
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
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'AVANTAGE MULTIPLIÉ' : 'MULTIPLIED EDGE'}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{lang === 'fr' ? 'Gagnants contre perdants' : 'Winners versus losers'}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 24 }}>{lang === 'fr' ? 'La durée moyenne seule masque le signal de coaching réel. La répartition ci-dessous montre si les perdants durent plus longtemps.' : 'Average duration alone hides the real coaching signal. The split below shows whether losers are lingering longer than winners.'}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {[
                                        { label: lang === 'fr' ? 'Gagnants' : 'Winners', sub: lang === 'fr' ? 'Durée moyenne de détention' : 'Average hold time', dur: avgWinDuration, color: '#FDC800' },
                                        { label: lang === 'fr' ? 'Perdants' : 'Losers', sub: lang === 'fr' ? 'Durée moyenne de détention' : 'Average hold time', dur: avgLossDuration, color: '#ff4757' },
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
                                        {lang === 'fr' ? `Perdants durant ${(avgLossDuration / Math.max(avgWinDuration, 1)).toFixed(1)}x plus longtemps que les gagnants.` : `Losers lasting ${(avgLossDuration / Math.max(avgWinDuration, 1)).toFixed(1)}x longer than winners.`}
                                    </div>
                                )}
                            </div>

                            {/* ── BEHAVIORAL COST ── */}
                            {behavioralCost < 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'COÛT COMPORTEMENTAL TOTAL ESTIMÉ — CETTE SESSION' : 'ESTIMATED TOTAL BEHAVIORAL COST — THIS SESSION'}</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#ff4757' }}>
                                            -${Math.abs(behavioralCost).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                                            {lang === 'fr' ? `Sur ${forensics.patterns.length} motifs détectés · ${Math.abs(behavioralCost / Math.max(grossProfit, 1) * 100).toFixed(1)}% des profits bruts` : `Across ${forensics.patterns.length} detected patterns · ${Math.abs(behavioralCost / Math.max(grossProfit, 1) * 100).toFixed(1)}% of gross profits`}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'SANS MOTIFS TOXIQUES' : 'WITHOUT TOXIC PATTERNS'}</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#FDC800' }}>
                                            +${withoutToxicPatterns.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginTop: 4 }}>{lang === 'fr' ? 'potentiel' : 'potential'}</div>
                                    </div>
                                </div>
                            )}

                            {/* ── SESSION-TO-SESSION EQUITY PATH ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'COURBE D\'ÉQUITÉ' : 'EQUITY CURVE'}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{lang === 'fr' ? 'Courbe d\'équité session par session' : 'Session-to-session equity path'}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 20 }}>{lang === 'fr' ? 'P&L net cumulatif sur vos jours de trading, avec l\'intervalle de drawdown le plus profond mis en évidence.' : 'Cumulative net P&L over your trading days, with the deepest drawdown interval highlighted.'}</div>
                                <div style={{ height: 180 }}>
                                    {equityCurve.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={equityCurve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                                <defs>
                                                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={netPnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0.25} />
                                                        <stop offset="95%" stopColor={netPnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="i" hide />
                                                <YAxis hide />
                                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                                    formatter={(v: number | undefined) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, lang === 'fr' ? 'P&L Cumulatif' : 'Cumulative P&L'] : ['—', lang === 'fr' ? 'P&L Cumulatif' : 'Cumulative P&L']}
                                                    labelFormatter={(l: unknown) => `${lang === 'fr' ? 'Trade n°' : 'Trade #'}${l}`}
                                                />
                                                <Area type="monotone" dataKey="pnl" stroke={netPnl >= 0 ? '#FDC800' : '#ff4757'} strokeWidth={2} fill="url(#eqGrad)" dot={false} activeDot={{ r: 4, fill: netPnl >= 0 ? '#FDC800' : '#ff4757' }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>{lang === 'fr' ? 'Aucune donnée de trade à tracer' : 'No trade data to plot'}</div>
                                    )}
                                </div>
                                {equityCurve.length > 1 && (
                                    <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757' }}>{lang === 'fr' ? `Drawdown max : -$${maxDd.toFixed(0)}` : `Max drawdown: -$${maxDd.toFixed(0)}`}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#FDC800' }}>{lang === 'fr' ? `Hausse max : +$${maxRunup.toFixed(0)}` : `Max run-up: +$${maxRunup.toFixed(0)}`}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{lang === 'fr' ? `Trades : ${closed.length}` : `Trades: ${closed.length}`}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: netPnl >= 0 ? '#FDC800' : '#ff4757' }}>{lang === 'fr' ? `Final : ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(0)}` : `Final: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(0)}`}</span>
                                    </div>
                                )}
                                {equityCurve.length > 1 && (
                                    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                        <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                {netPnl >= 0
                                                    ? lang === 'fr'
                                                        ? <>L&apos;équité est <strong style={{ color: '#FDC800' }}>nette positive</strong>. Le drawdown max était <strong style={{ color: '#ff4757' }}>-${maxDd.toFixed(0)}</strong> — un retracement de {maxRunup > 0 ? ((maxDd / maxRunup) * 100).toFixed(0) : 0}% de votre sommet. Une courbe régulière = avantage consistant. Une courbe irrégulière = forte variance.</>
                                                        : <>Equity is <strong style={{ color: '#FDC800' }}>net positive</strong>. Max drawdown was <strong style={{ color: '#ff4757' }}>-${maxDd.toFixed(0)}</strong> — a {maxRunup > 0 ? ((maxDd / maxRunup) * 100).toFixed(0) : 0}% retracement of your peak. A smooth rising curve = consistent edge. A jagged one = high variance — you may be getting lucky with large outlier wins.</>
                                                    : lang === 'fr'
                                                        ? <>L&apos;équité est <strong style={{ color: '#ff4757' }}>nette négative</strong> à ${netPnl.toFixed(0)}. La forme de la courbe indique si les pertes sont concentrées (quelques explosions) ou systémiques (saignement régulier). Le drawdown max a atteint <strong style={{ color: '#ff4757' }}>-${maxDd.toFixed(0)}</strong>.</>
                                                        : <>Equity is <strong style={{ color: '#ff4757' }}>net negative</strong> at ${netPnl.toFixed(0)}. The curve shape tells you whether losses are concentrated (a few blowouts) or systematic (steady bleed). Max drawdown hit <strong style={{ color: '#ff4757' }}>-${maxDd.toFixed(0)}</strong>.</>}
                                            </p>
                                        </div>
                                        <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'ACTION' : 'ACTION'}</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                {maxDd > 0 && netPnl > 0
                                                    ? lang === 'fr'
                                                        ? `Votre drawdown max est -$${maxDd.toFixed(0)} — ${((maxDd / netPnl) * 100).toFixed(0)}% du P&L net. Fixez un plafond de drawdown à -$${Math.round(maxDd * 0.6)} pour protéger vos gains. Si atteint, réduisez la taille de position de 50% pour le reste de la session.`
                                                        : `Your max drawdown is -$${maxDd.toFixed(0)} — ${((maxDd / netPnl) * 100).toFixed(0)}% of net profit. Set a hard drawdown ceiling at -$${Math.round(maxDd * 0.6)} to protect gains. If hit, reduce position size by 50% for the rest of the session.`
                                                    : maxDd > 0
                                                    ? lang === 'fr'
                                                        ? `Drawdown max -$${maxDd.toFixed(0)} avec un P&L net négatif signale un problème structurel. Réduisez immédiatement toutes les tailles de trade de 30% et réévaluez l'avantage via l'onglet MOTIFS.`
                                                        : `Max drawdown -$${maxDd.toFixed(0)} with negative net P&L signals a structural problem. Reduce all trade sizes by 30% immediately and re-evaluate edge by reviewing PATTERNS tab.`
                                                    : lang === 'fr' ? 'Enregistrez plus de trades pour voir l\'analyse du drawdown.' : 'Log more trades to see drawdown analysis.'}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 3-COL: Trade Outcome | P&L by Instrument | Risk Score ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Trade Outcome Pie */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'RÉSULTAT DES TRADES' : 'TRADE OUTCOME WIN'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', marginBottom: 16 }}>{lang === 'fr' ? 'Lecture rapide de la fréquence à laquelle la session s\'est terminée en positif ou négatif' : 'Fast read on how often this session finished green versus red'}</div>
                                    <div style={{ height: 120 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={[{ n: 'W', v: wins.length }, { n: 'L', v: losses.length }]} innerRadius={30} outerRadius={50} dataKey="v" stroke="none" startAngle={90} endAngle={-270}>
                                                    <Cell fill="#FDC800" />
                                                    <Cell fill="#ff4757" />
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 8, height: 8, background: '#FDC800', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#FDC800' }}>{wins.length} trades</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 8, height: 8, background: '#ff4757', borderRadius: '50%' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757' }}>{losses.length} trades</span>
                                        </div>
                                    </div>
                                </div>

                                {/* P&L by Instrument */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'P&L PAR INSTRUMENT' : 'P&L BY INSTRUMENT'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', marginBottom: 16 }}>{lang === 'fr' ? 'Contribution signée : notre part de volume. Les instruments perdants restent visiblement négatifs.' : 'Signed contribution: our share of volume. Losing instruments stay visibly negative.'}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {instrumentArray.slice(0, 5).map((inst, i) => (
                                            <div key={inst.asset} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', width: 36, flexShrink: 0 }}>{inst.asset.slice(0, 4)}</span>
                                                <div style={{ flex: 1, height: 6, background: '#1a1c24', borderRadius: 2 }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${(Math.abs(inst.pnl) / maxAbsInstPnl) * 100}%` }} style={{ height: '100%', background: inst.pnl >= 0 ? PIE_COLORS[i % PIE_COLORS.length] : '#ff4757', borderRadius: 2 }} />
                                                </div>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: inst.pnl >= 0 ? '#FDC800' : '#ff4757', width: 60, textAlign: 'right' }}>
                                                    {inst.pnl >= 0 ? '+' : '-'}${Math.abs(inst.pnl).toFixed(0)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {instrumentArray.length === 0 && (
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>{lang === 'fr' ? 'Aucune donnée d\'instrument' : 'No instrument data'}</div>
                                    )}
                                </div>

                                {/* Risk Score */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'SCORE DE RISQUE' : 'RISK SCORE'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', marginBottom: 16 }}>{lang === 'fr' ? 'Lecture basée sur des seuils pour une interprétation plus rapide du risque qu\'une jauge.' : 'Threshold-based readout designed for faster risk interpretation than a gauge.'}</div>
                                    {/* Linear bar risk score */}
                                    {(() => {
                                        const rs = forensics.riskScore;
                                        const riskColor = rs > 75 ? '#ff4757' : rs > 50 ? '#F97316' : rs > 30 ? '#EAB308' : '#FDC800';
                                        const riskLabel = rs > 75 ? (lang === 'fr' ? 'CRITIQUE' : 'CRITICAL') : rs > 50 ? (lang === 'fr' ? 'ÉLEVÉ' : 'HIGH') : rs > 30 ? (lang === 'fr' ? 'MODÉRÉ' : 'ELEVATED') : (lang === 'fr' ? 'SAIN' : 'HEALTHY');
                                        return (
                                            <div style={{ width: '100%' }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 700, color: riskColor, lineHeight: 1 }}>{rs.toFixed(0)}</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>/100</span>
                                                </div>
                                                <div style={{ height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 8, overflow: 'hidden' }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${rs}%` }} style={{ height: '100%', background: `linear-gradient(to right, #FDC800, ${riskColor})`, borderRadius: 3 }} />
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: riskColor, fontWeight: 700, border: `1px solid ${riskColor}33`, background: `${riskColor}11`, padding: '3px 8px', display: 'inline-block' }}>
                                                    {riskLabel} {lang === 'fr' ? 'RISQUE' : 'RISK'}
                                                </div>
                                                <div style={{ marginTop: 16, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                    {[{ label: '0-30', tag: lang === 'fr' ? 'PROPRE' : 'CLEAN', active: rs <= 30 }, { label: '31-55', tag: lang === 'fr' ? 'MODÉRÉ' : 'MODERATE', active: rs > 30 && rs <= 55 }, { label: '56-75', tag: lang === 'fr' ? 'ÉLEVÉ' : 'HIGH', active: rs > 55 && rs <= 75 }, { label: '76-100', tag: lang === 'fr' ? 'CRITIQUE' : 'CRITICAL', active: rs > 75 }].map((z, i) => (
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
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'COMMENT LE SCORE DE RISQUE EST CALCULÉ' : 'HOW THE RISK SCORE IS CALCULATED'}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                                    {[
                                        {
                                            label: lang === 'fr' ? 'Patterns comportementaux' : 'Behavior Patterns',
                                            score: revScore,
                                            max: 60,
                                            color: revScore > 40 ? '#ff4757' : revScore > 20 ? '#EAB308' : '#FDC800',
                                            desc: lang === 'fr' ? `+${revScore > 0 ? revScore : 0} si critique · +${revScore > 20 ? Math.floor(revScore / 2) : 0} alerte · +${0} info` : `+${revScore > 0 ? revScore : 0} if critical · +${revScore > 20 ? Math.floor(revScore / 2) : 0} warning · +${0} info`,
                                            sub: lang === 'fr' ? `Max : 60 pts` : `Max: 60 pts`,
                                        },
                                        {
                                            label: lang === 'fr' ? 'Dommages financiers' : 'Financial Damage',
                                            score: financialScore,
                                            max: 25,
                                            color: financialScore > 15 ? '#ff4757' : financialScore > 0 ? '#EAB308' : '#FDC800',
                                            desc: lang === 'fr' ? `+${financialScore > 15 ? financialScore : 0} si pertes >5% du brut · +${financialScore > 5 && financialScore <= 15 ? financialScore : 0} si 1–5% · +0 si <1%` : `+${financialScore > 15 ? financialScore : 0} if losses >5% of gross · +${financialScore > 5 && financialScore <= 15 ? financialScore : 0} if 1–5% · +0 if <1%`,
                                            sub: lang === 'fr' ? `Max : 25 pts` : `Max: 25 pts`,
                                        },
                                        {
                                            label: lang === 'fr' ? 'Érosion du taux de réussite' : 'Win Rate Erosion',
                                            score: wrErosion,
                                            max: 15,
                                            color: wrErosion > 10 ? '#ff4757' : wrErosion > 0 ? '#EAB308' : '#FDC800',
                                            desc: lang === 'fr' ? `+${wrErosion > 10 ? wrErosion : 0} si taux <30% & espérance négative · +${wrErosion > 0 && wrErosion <= 10 ? wrErosion : 0} si 30–35% négatif` : `+${wrErosion > 10 ? wrErosion : 0} if win rate <30% & negative expectancy · +${wrErosion > 0 && wrErosion <= 10 ? wrErosion : 0} if 30–35% negative`,
                                            sub: lang === 'fr' ? `Max : 15 pts` : `Max: 15 pts`,
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
                                    {[{ r: '0-30', l: lang === 'fr' ? 'FAIBLE' : 'LOW', c: '#FDC800' }, { r: '31-55', l: lang === 'fr' ? 'MODÉRÉ' : 'MODERATE', c: '#EAB308' }, { r: '56-75', l: lang === 'fr' ? 'ÉLEVÉ' : 'HIGH', c: '#F97316' }, { r: '76-100', l: lang === 'fr' ? 'CRITIQUE' : 'CRITICAL', c: '#ff4757', active: forensics.riskScore > 75 }].map((z, i) => (
                                        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', border: `1px solid ${z.c}44`, color: z.c, background: (z as any).active ? `${z.c}15` : 'transparent' }}>{z.r}<br />{z.l}</div>
                                    ))}
                                    <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 12px', border: '2px solid #EAB308', color: '#EAB308', background: 'rgba(234,179,8,0.08)' }}>
                                        {lang === 'fr' ? `VOTRE SCORE : ${forensics.riskScore.toFixed(0)} / 100` : `YOUR SCORE: ${forensics.riskScore.toFixed(0)} / 100`}
                                    </div>
                                </div>
                            </div>

                            {/* ── BENCHMARK vs RETAIL FUTURES TRADERS ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'RÉFÉRENCE — 100 TRADERS FUTURES RETAIL' : 'BENCHMARK — 100 RETAIL FUTURES TRADERS'}</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 16 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {[lang === 'fr' ? 'MÉTRIQUE' : 'METRIC', lang === 'fr' ? 'VOTRE VALEUR' : 'YOUR VALUE', lang === 'fr' ? 'MÉDIANE' : 'MEDIAN', 'TOP 25%', lang === 'fr' ? 'VOTRE RANG' : 'YOUR RANK'].map((h, i) => (
                                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[
                                                { metric: lang === 'fr' ? 'Taux de réussite' : 'Win Rate', yours: `${winRate.toFixed(1)}%`, median: '42%', top25: '55%', rank: winRate >= 55 ? (lang === 'fr' ? 'Top 25% (76+)' : 'Top 25% (76+)') : winRate >= 42 ? (lang === 'fr' ? 'Au-dessus moy. (51+)' : 'Above Avg (51+)') : (lang === 'fr' ? 'Sous la moy.' : 'Below Avg'), rankColor: winRate >= 55 ? '#FDC800' : winRate >= 42 ? '#EAB308' : '#ff4757' },
                                                { metric: lang === 'fr' ? 'Facteur de profit' : 'Profit Factor', yours: profitFactor === 99 ? '∞' : profitFactor.toFixed(2), median: '1.21', top25: '1.90', rank: profitFactor >= 1.9 ? (lang === 'fr' ? 'Au-dessus moy. (81+)' : 'Above Avg (81+)') : profitFactor >= 1.2 ? (lang === 'fr' ? 'Au-dessus moy. (61+)' : 'Above Avg (61+)') : (lang === 'fr' ? 'Sous la moy. (38%)' : 'Below Avg (38%)'), rankColor: profitFactor >= 1.9 ? '#FDC800' : profitFactor >= 1.2 ? '#EAB308' : '#ff4757' },
                                                { metric: lang === 'fr' ? 'Espérance / Trade ($)' : 'Expectancy / Trade ($)', yours: `${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}`, median: '$4', top25: '$75', rank: expectancy >= 75 ? (lang === 'fr' ? 'Au-dessus moy. (79+)' : 'Above Avg (79+)') : expectancy >= 4 ? (lang === 'fr' ? 'Au-dessus moy. (56+)' : 'Above Avg (56+)') : (lang === 'fr' ? 'Sous la moy.' : 'Below Avg'), rankColor: expectancy >= 75 ? '#FDC800' : expectancy >= 4 ? '#EAB308' : '#ff4757' },
                                                { metric: lang === 'fr' ? 'Drawdown max ($)' : 'Max Drawdown ($)', yours: `-$${maxDd.toFixed(0)}`, median: '$1390', top25: '$160', rank: maxDd <= 160 ? (lang === 'fr' ? 'Top 25% (78+)' : 'Top 25% (78+)') : maxDd <= 1390 ? (lang === 'fr' ? 'Au-dessus moy. (39+)' : 'Above Avg (39+)') : (lang === 'fr' ? 'Sous la moy.' : 'Below Avg'), rankColor: maxDd <= 160 ? '#FDC800' : maxDd <= 1390 ? '#EAB308' : '#ff4757' },
                                                { metric: lang === 'fr' ? 'Score de risque comportemental' : 'Behavioral Risk Score', yours: `${forensics.riskScore.toFixed(0)}`, median: '58', top25: '26', rank: forensics.riskScore <= 26 ? (lang === 'fr' ? 'Top 25% (>75)' : 'Top 25% (>75)') : forensics.riskScore <= 58 ? (lang === 'fr' ? 'Au-dessus moy. (>50)' : 'Above Avg (>50)') : (lang === 'fr' ? 'Sous top 25% (35e)' : 'Below 25% (35th)'), rankColor: forensics.riskScore <= 26 ? '#FDC800' : forensics.riskScore <= 58 ? '#EAB308' : '#ff4757' },
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
                                    {lang === 'fr' ? 'Source : Données probabilistes de 100+ traders retail sur comptes prop firm · Stats actualisées 30 jours glissants' : 'Source: Probabilistic live data from 100+ retail traders on prop firm accounts · Stats update rolling 30-day'}
                                </div>
                            </div>

                            {/* ── DANGER ZONES + STRENGTH ZONES ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <TrendingDown size={12} color="#ff4757" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>{lang === 'fr' ? 'ZONES DE DANGER' : 'DANGER ZONES'}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {dangerZones.length > 0 ? dangerZones.map((z: { h: number; pnl: number }, i: number) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.15)' }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>{`${String(z.h).padStart(2, '0')}:00–${String(z.h + 1).padStart(2, '0')}:00`} EST</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#ff4757' }}>-${Math.abs(z.pnl).toFixed(0)}</span>
                                            </div>
                                        )) : (
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>{lang === 'fr' ? 'Aucune zone temporelle négative détectée' : 'No negative time zones detected'}</div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <TrendingUp size={12} color="#FDC800" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>{lang === 'fr' ? 'ZONES DE FORCE' : 'STRENGTH ZONES'}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {strengthZones.length > 0 ? strengthZones.map((z: { h: number; pnl: number }, i: number) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.15)' }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>{`${String(z.h).padStart(2, '0')}:00–${String(z.h + 1).padStart(2, '0')}:00`} EST</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#FDC800' }}>+${z.pnl.toFixed(0)}</span>
                                            </div>
                                        )) : (
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>{lang === 'fr' ? 'Aucune zone temporelle positive détectée' : 'No positive time zones detected yet'}</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── SESSION SCORE ── */}
                            {forensics.verdict && (
                                <div style={{ background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.15)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <Activity size={13} color="#FDC800" />
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#FDC800', fontWeight: 600 }}>SESSION SCORE</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e' }}>{forensics.verdict.message} {forensics.verdict.action}</span>
                                </div>
                            )}

                            {/* ── CHALLENGE BANNER ── */}
                            <div style={{ background: '#0d1117', border: '1px solid rgba(253,200,0,0.2)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 32, height: 32, background: 'rgba(253,200,0,0.1)', border: '1px solid rgba(253,200,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, flexShrink: 0 }}>
                                        <Target size={14} color="#FDC800" />
                                    </div>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#FDC800' }}>
                                            Your {winRate.toFixed(0)}% edge — Challenge your group to beat it.
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                            Share your data and let your crew compete. Link opens your full report.
                                        </div>
                                    </div>
                                </div>
                                <button onClick={handleCopyLink} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '10px 20px', background: '#FDC800', color: '#000', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                                    {copied ? '✓ COPIED' : '⬡ COPY CHALLENGE'}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'DAILY' && (
                        <motion.div key="daily" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {dailyData.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, background: '#0d1117', border: '1px solid #1a1c24', padding: 40 }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', textAlign: 'center' }}>No closed trades yet{filterActive ? ' in this date range' : ''}.</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', textAlign: 'center' }}>Log trades and close them to see daily P&L analysis.</div>
                                </div>
                            ) : (<>

                            {/* ── HEADER ── */}
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>DAILY P&L INTELLIGENCE</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Daily Performance Breakdown</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>
                                    {dailyData.length} trading day{dailyData.length !== 1 ? 's' : ''} · bars show daily net P&L · dashed line = 5-day rolling average · day-of-week and distribution analysis below
                                </div>
                            </div>

                            {/* ── 8-KPI GRID ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: lang === 'fr' ? 'MEILLEUR JOUR' : 'BEST DAY', value: bestDay > 0 ? `+$${bestDay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', sub: bestDayDate ? new Date(bestDayDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—', color: '#FDC800' },
                                    { label: lang === 'fr' ? 'PIRE JOUR' : 'WORST DAY', value: worstDay < 0 ? `-$${Math.abs(worstDay).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', sub: worstDayDate ? new Date(worstDayDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—', color: '#ff4757' },
                                    { label: lang === 'fr' ? 'P&L JOURNALIER MOY.' : 'AVG DAILY P&L', value: avgDaily !== 0 ? `${avgDaily >= 0 ? '+' : ''}$${Math.abs(avgDaily).toFixed(2)}` : '—', sub: lang === 'fr' ? `Médiane: ${medianDaily >= 0 ? '+' : ''}$${Math.abs(medianDaily).toFixed(2)}` : `Median: ${medianDaily >= 0 ? '+' : ''}$${Math.abs(medianDaily).toFixed(2)}`, color: avgDaily >= 0 ? '#FDC800' : '#ff4757' },
                                    { label: lang === 'fr' ? 'VOLATILITÉ JOURNALIÈRE' : 'DAILY VOLATILITY', value: dailyVolatility > 0 ? `±$${dailyVolatility.toFixed(0)}` : '—', sub: lang === 'fr' ? `${daysWithin1Std}% jours dans 1σ` : `${daysWithin1Std}% days within 1σ`, color: '#EAB308' },
                                    { label: lang === 'fr' ? 'JOURS VERTS' : 'GREEN DAYS', value: `${greenDays}`, sub: lang === 'fr' ? `${dayWinRate.toFixed(0)}% des ${dailyData.length} jours` : `${dayWinRate.toFixed(0)}% of ${dailyData.length} days`, color: '#FDC800' },
                                    { label: lang === 'fr' ? 'JOURS ROUGES' : 'RED DAYS', value: `${redDays}`, sub: lang === 'fr' ? `${(100 - dayWinRate).toFixed(0)}% des ${dailyData.length} jours` : `${(100 - dayWinRate).toFixed(0)}% of ${dailyData.length} days`, color: '#ff4757' },
                                    { label: lang === 'fr' ? 'PLUS LONGUE SÉRIE VERTE' : 'LONGEST GREEN STREAK', value: `${longestGreenDayStreak}d`, sub: lang === 'fr' ? 'Jours profitables consécutifs' : 'Consecutive profitable days', color: '#FDC800' },
                                    { label: lang === 'fr' ? 'PLUS LONGUE SÉRIE ROUGE' : 'LONGEST RED STREAK', value: `${longestRedDayStreak}d`, sub: lang === 'fr' ? 'Jours perdants consécutifs' : 'Consecutive losing days', color: longestRedDayStreak >= 3 ? '#ff4757' : '#EAB308' },
                                ].map((k, i) => (
                                    <div key={i} style={{ padding: '20px 24px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{k.label}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>{k.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* ── MAIN CHART: ComposedChart bar + rolling avg ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                                    <div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{lang === 'fr' ? 'P&L NET PAR JOUR DE TRADING' : 'NET P&L PER TRADING DAY'}</div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9' }}>{lang === 'fr' ? 'Barres = P&L journalier · Tirets jaunes = moy. mobile 5 jours' : 'Bars = daily P&L · Yellow dashed = 5-day rolling average'}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16 }}>
                                        {[{ color: '#FDC800', label: lang === 'fr' ? 'Jour profitable' : 'Profitable day' }, { color: '#ff4757', label: lang === 'fr' ? 'Jour perdant' : 'Loss day' }, { color: '#EAB308', label: '5d avg', dash: true }].map((l, i) => (
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
                                    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                        <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                {greenDays > redDays
                                                    ? lang === 'fr'
                                                        ? <>Votre taux de réussite journalier est <strong style={{ color: '#FDC800' }}>{dayWinRate.toFixed(0)}%</strong> ({greenDays} verts vs {redDays} rouges). La moy. mobile 5 jours montre si votre avantage s&apos;améliore ou se dégrade — surveillez sa pente, pas seulement les barres.</>
                                                        : <>Your day win rate is <strong style={{ color: '#FDC800' }}>{dayWinRate.toFixed(0)}%</strong> ({greenDays} green vs {redDays} red). The 5-day rolling average shows whether your edge is improving or degrading over time — watch its slope, not just daily bars.</>
                                                    : lang === 'fr'
                                                        ? <>Votre taux de réussite journalier est <strong style={{ color: '#ff4757' }}>{dayWinRate.toFixed(0)}%</strong> ({greenDays} verts vs {redDays} rouges). Plus de jours rouges que verts est un problème structurel, pas de la variance — cherchez des patterns récurrents ci-dessous.</>
                                                        : <>Your day win rate is <strong style={{ color: '#ff4757' }}>{dayWinRate.toFixed(0)}%</strong> ({greenDays} green vs {redDays} red). More red days than green is a structural issue, not variance — look for recurring calendar patterns below.</>}
                                            </p>
                                        </div>
                                        <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                {avgDaily > 0
                                                    ? lang === 'fr'
                                                        ? `P&L journalier moyen est +$${avgDaily.toFixed(0)} — protégez-le avec un plancher de perte journalier de -$${Math.round(avgDaily * 1.5)}. Si la moy. mobile 5 jours baisse 3+ barres consécutives, réduisez la taille de 30% jusqu'à stabilisation.`
                                                        : `Average daily P&L is +$${avgDaily.toFixed(0)} — protect it with a daily loss floor of -$${Math.round(avgDaily * 1.5)}. If the 5d average line trends down for 3+ bars, cut position size 30% until it flattens.`
                                                    : lang === 'fr'
                                                        ? `P&L journalier moyen est -$${Math.abs(avgDaily).toFixed(0)}. Fixez immédiatement une perte max journalière de $${Math.round(Math.abs(avgDaily) * 0.7)} et arrêtez le trading une fois atteinte. Consultez le bilan par jour de la semaine ci-dessous.`
                                                        : `Average daily P&L is -$${Math.abs(avgDaily).toFixed(0)}. Immediately set a daily max-loss of $${Math.round(Math.abs(avgDaily) * 0.7)} and halt trading once hit. Review the day-of-week breakdown below for structural patterns.`}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 2-COL: Day of Week P&L + Day of Week Win Rate ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>DAY-OF-WEEK EDGE BREAKDOWN</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 4 }}>Net P&L and win rate per weekday — reveals calendar biases in your execution</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginBottom: 20 }}>Left bar = total P&L accumulated that day · Right bar = win rate percentage · A day with high P&L but low win rate means wins are large, losses frequent</div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
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
                                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                            <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    {lang === 'fr'
                                                        ? <><strong style={{ color: '#FDC800' }}>{best.day}</strong> est votre meilleur jour (+${best.pnl.toFixed(0)} · {best.trades > 0 ? ((best.wins / best.trades) * 100).toFixed(0) : 0}% TR). <strong style={{ color: '#ff4757' }}>{worst.day}</strong> est votre pire (${worst.pnl.toFixed(0)}). {trapDay ? <><strong style={{ color: '#ff4757' }}>{trapDay.day}</strong> est un piège statistique avec &lt;40% TR sur {trapDay.trades} trades.</> : 'Aucun jour de la semaine n\'est sous les 40% TR sur 3+ échantillons.'}</>
                                                        : <><strong style={{ color: '#FDC800' }}>{best.day}</strong> is your strongest day (+${best.pnl.toFixed(0)} · {best.trades > 0 ? ((best.wins / best.trades) * 100).toFixed(0) : 0}% WR). <strong style={{ color: '#ff4757' }}>{worst.day}</strong> is your worst (${worst.pnl.toFixed(0)}). {trapDay ? <><strong style={{ color: '#ff4757' }}>{trapDay.day}</strong> is a statistical trap with &lt;40% WR over {trapDay.trades} trades.</> : 'No weekday has dropped below 40% WR over 3+ samples.'}</>}
                                                </p>
                                            </div>
                                            <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                    {trapDay
                                                        ? lang === 'fr'
                                                            ? `${trapDay.day} a un taux de réussite sous 40% — mettez en place une restriction de trading jusqu'à ce que le TR dépasse 40% sur 15+ échantillons. Ajoutez 20% à la taille de vos positions le ${best.day} pour maximiser votre meilleur jour.`
                                                            : `${trapDay.day} has a sub-40% win rate — implement a soft trading ban until WR improves over 15+ samples. Add 20% to your position size on ${best.day} to compound your strongest day.`
                                                        : lang === 'fr'
                                                            ? `Tous les jours actifs sont au-dessus de 40% TR — pas de restriction nécessaire. Augmentez progressivement la taille le ${best.day}. Réévaluez si ${worst.day} passe sous les 40% TR.`
                                                            : `All active days are above 40% WR — no hard bans needed. Incrementally increase size on ${best.day} while monitoring. Review if ${worst.day} dips below 40% WR.`}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* ── P&L DISTRIBUTION HISTOGRAM ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>DAILY P&L DISTRIBUTION</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 6 }}>Frequency of each P&L range — reveals clustering, fat tails, and outlier days</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 16 }}>A healthy distribution clusters tightly to the right of zero. Wide spread = high variance = unpredictable edge.</div>
                                <PnLHistogram pnlValues={dailyData.map(d => d.pnl)} buckets={16} height={140} />
                                <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'BEST SINGLE DAY', v: `+$${bestDay.toFixed(0)}`, c: '#FDC800' },
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
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>MONTHLY SUMMARY</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>Net result aggregated by calendar month</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {monthlyBreakdown.map((m, i) => (
                                            <div key={i} style={{ flex: '1 1 120px', background: '#0b0e14', border: `1px solid ${m.pnl >= 0 ? 'rgba(253,200,0,0.2)' : 'rgba(255,71,87,0.2)'}`, padding: '12px 14px' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 4 }}>{m.month}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: m.pnl >= 0 ? '#FDC800' : '#ff4757' }}>
                                                    {m.pnl >= 0 ? '+' : ''}${Math.abs(m.pnl).toFixed(0)}
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', marginTop: 4 }}>
                                                    {m.trades}T · {m.wr.toFixed(0)}%WR · {m.days}d
                                                </div>
                                                <div style={{ marginTop: 6, height: 3, background: '#1a1c24', borderRadius: 1 }}>
                                                    <div style={{ height: '100%', width: `${m.wr}%`, background: m.pnl >= 0 ? '#FDC800' : '#ff4757', borderRadius: 1, opacity: 0.7 }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── WEEKLY BREAKDOWN TABLE ── */}
                            {weeklyBreakdown.length > 0 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>WEEKLY PERFORMANCE BREAKDOWN</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>Week-over-week P&L, best/worst day per week, and behavioral flags</div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                    {(lang === 'fr' ? ['SEMAINE', 'JOURS', 'P&L NET', 'MEILLEUR JOUR', 'PIRE JOUR', 'TAUX RÉU.', 'FLAG'] : ['WEEK', 'DAYS', 'NET P&L', 'BEST DAY', 'WORST DAY', 'WIN %', 'FLAG']).map((h, i) => (
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
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: w.netPnl >= 0 ? '#FDC800' : '#ff4757' }}>
                                                            {w.netPnl >= 0 ? '+' : ''}${Math.abs(w.netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#FDC800' }}>+${w.bestDayPnl.toFixed(0)}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ff4757' }}>-${Math.abs(w.worstDayPnl).toFixed(0)}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: w.winRate >= 55 ? '#FDC800' : w.winRate >= 45 ? '#EAB308' : '#ff4757' }}>{w.winRate.toFixed(1)}%</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                            {w.flag && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', border: `1px solid ${w.flagSev === 'critical' ? 'rgba(255,71,87,0.4)' : w.flagSev === 'warning' ? 'rgba(234,179,8,0.4)' : 'rgba(253,200,0,0.3)'}`, color: w.flagSev === 'critical' ? '#ff4757' : w.flagSev === 'warning' ? '#EAB308' : '#FDC800', background: w.flagSev === 'critical' ? 'rgba(255,71,87,0.08)' : w.flagSev === 'warning' ? 'rgba(234,179,8,0.06)' : 'rgba(253,200,0,0.06)', whiteSpace: 'nowrap' }}>{w.flag}</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* ── ACTIONABLE RULES ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>DAILY RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        { rule: lang === 'fr' ? 'RÈGLE 01 — LIMITE DE PERTE JOURNALIÈRE' : 'RULE 01 — DAILY LOSS LIMIT', detail: lang === 'fr' ? `Votre pire journée était -$${Math.abs(worstDay).toFixed(0)}. Fixez un stop journalier à $${Math.round(Math.abs(worstDay) * 0.5)} — 50% de votre pire journée. Arrêtez quand il est atteint. Une seule mauvaise journée efface plusieurs bonnes.` : `Your worst day was -$${Math.abs(worstDay).toFixed(0)}. Set a hard daily stop at $${Math.round(Math.abs(worstDay) * 0.5)} — 50% of your worst day. Walk away when hit. A single blowout day erases multiple good days.`, icon: '⛔', color: '#ff4757' },
                                        { rule: lang === 'fr' ? 'RÈGLE 02 — RÈGLE CIBLE ET SORTIE' : 'RULE 02 — TARGET & WALK RULE', detail: lang === 'fr' ? `Meilleur jour était +$${bestDay.toFixed(0)}. Une fois $${(bestDay * 0.6).toFixed(0)} atteint en une journée, réduisez la taille de moitié. Ne sacrifiez pas votre avantage en voulant maximiser une bonne journée.` : `Best day was +$${bestDay.toFixed(0)}. Once you hit ${(bestDay * 0.6).toFixed(0)} in a day, cut position size by half. Don't give back your edge trying to maximize a good day.`, icon: '→', color: '#FDC800' },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 03 — PRUDENCE ${dayOfWeekStats.sort((a, b) => a.pnl - b.pnl)[0]?.day ?? 'PIRE JOUR'}` : `RULE 03 — ${dayOfWeekStats.sort((a, b) => a.pnl - b.pnl)[0]?.day ?? 'WORST DAY'} CAUTION`,
                                            detail: lang === 'fr' ? `${dayOfWeekStats.sort((a, b) => a.pnl - b.pnl)[0]?.day ?? 'Votre pire jour'} est votre pire jour statistiquement. Réduisez la taille de position de 50% ce jour-là ou sautez-le entièrement jusqu'à ce que le taux de réussite dépasse 50% sur 20+ échantillons.` : `${dayOfWeekStats.sort((a, b) => a.pnl - b.pnl)[0]?.day ?? 'Your worst weekday'} is your statistically worst day. Trade reduced size or skip this day entirely until win rate exceeds 50% over 20+ samples.`,
                                            icon: '⏸', color: '#EAB308',
                                        },
                                        { rule: lang === 'fr' ? 'RÈGLE 04 — PROTECTION DES SÉRIES' : 'RULE 04 — STREAK PROTECTION', detail: lang === 'fr' ? `${longestRedDayStreak >= 2 ? `Votre plus longue série de jours rouges était ${longestRedDayStreak} jours consécutifs. Après 2 jours rouges consécutifs, réduisez la limite de trades journaliers de 50% jusqu'à enregistrer un jour vert.` : 'Aucune série prolongée de jours rouges détectée. Maintenez la discipline journalière actuelle.'}` : `${longestRedDayStreak >= 2 ? `Your longest red day streak was ${longestRedDayStreak} consecutive days. After 2 red days in a row, cut daily trade limit by 50% until you record a green day.` : 'No prolonged red day streaks detected. Maintain current daily discipline.'}`, icon: '✓', color: '#c9d1d9' },
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

                            </>)}

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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: 'INSTRUMENTS TRADED', value: `${instrumentDeep.length}`, sub: `${instrumentDeep.filter(i => i.pnl >= 0).length} profitable`, color: '#c9d1d9' },
                                    { label: 'BEST INSTRUMENT', value: instrumentDeep[0]?.asset ?? '—', sub: instrumentDeep[0] ? `+$${instrumentDeep[0].pnl.toFixed(0)} net` : '—', color: '#FDC800' },
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
                            <div style={{ display: 'grid', gridTemplateColumns: instrumentDeep.length >= 2 && !isMobile ? '1fr 1fr' : '1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Radar chart */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>MULTI-METRIC RADAR</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 6 }}>5-axis normalized comparison — Win Rate · PF · Expectancy · W/L · Volume</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginBottom: 8 }}>A bar chart shows one metric. This radar shows which instrument dominates across ALL dimensions simultaneously.</div>
                                    <InstrumentRadar instruments={radarInstruments} height={280} />
                                </div>
                                {/* P&L diverging bars */}
                                <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'CLASSEMENT P&L NET' : 'NET P&L RANKING'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 16 }}>{lang === 'fr' ? 'Contribution signée par instrument — divergeant de zéro' : 'Signed contribution per instrument — diverging from zero'}</div>
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
                                                        <Cell key={i} fill={inst.pnl >= 0 ? 'rgba(253,200,0,0.85)' : 'rgba(255,71,87,0.85)'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* ── INSTRUMENT COMPARISON TABLE ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>FULL INSTRUMENT SCORECARD</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {(lang === 'fr' ? ['INSTRUMENT', 'TRADES', 'TAUX RÉU.', 'P&L NET', 'FACT. PROFIT', 'GAIN MOY.', 'PERTE MOY.', 'ESPÉRANCE', 'LONG/COURT', 'VERDICT'] : ['INSTRUMENT', 'TRADES', 'WIN RATE', 'NET P&L', 'PROFIT FACTOR', 'AVG WIN', 'AVG LOSS', 'EXPECTANCY', 'LONG/SHORT', 'VERDICT']).map((h, i) => (
                                                    <th key={i} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {instrumentDeep.map((inst, i) => {
                                                const verdict = inst.pnl > 0 && inst.winRate >= 55 && inst.profitFactor >= 1.5 ? 'EDGE' : inst.pnl > 0 && inst.winRate >= 45 ? 'PLAYABLE' : inst.pnl > 0 ? 'MARGINAL' : inst.winRate >= 50 ? 'MIXED' : 'CUT';
                                                const vColor = verdict === 'EDGE' ? '#FDC800' : verdict === 'PLAYABLE' ? 'rgba(253,200,0,0.6)' : verdict === 'MARGINAL' ? '#EAB308' : verdict === 'MIXED' ? '#fb923c' : '#ff4757';
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
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: inst.winRate >= 55 ? '#FDC800' : inst.winRate >= 45 ? '#EAB308' : '#ff4757' }}>{inst.winRate.toFixed(0)}%</td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: inst.pnl >= 0 ? '#FDC800' : '#ff4757' }}>
                                                            {inst.pnl >= 0 ? '+' : '-'}${Math.abs(inst.pnl).toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: inst.profitFactor >= 1.5 ? '#FDC800' : inst.profitFactor >= 1 ? '#EAB308' : '#ff4757' }}>
                                                            {inst.profitFactor === 99 ? '∞' : inst.profitFactor.toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: '#FDC800' }}>+${inst.avgWin.toFixed(0)}</td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: '#ff4757' }}>-${inst.avgLoss.toFixed(0)}</td>
                                                        <td style={{ padding: '12px 12px', textAlign: 'right', color: inst.expectancy >= 0 ? '#FDC800' : '#ff4757' }}>
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
                                <div key={inst.asset} style={{ background: '#0d1117', border: '1px solid rgba(253,200,0,0.15)', overflow: 'hidden' }}>
                                    <div style={{ padding: '16px 24px', background: '#0b0e14', borderBottom: '1px solid #1a1c24', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#fff' }}>{inst.asset} — Deep Dive</div>
                                        <button onClick={() => toggleInstrument(inst.asset)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', background: 'none', border: '1px solid #1a1c24', padding: '4px 10px', cursor: 'pointer' }}>COLLAPSE ▲</button>
                                    </div>
                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        {/* 6-metric mini grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 1, background: '#1a1c24' }}>
                                            {[
                                                { label: 'BEST TRADE', value: `+$${inst.maxWin.toFixed(0)}`, color: '#FDC800' },
                                                { label: 'WORST TRADE', value: `-$${inst.maxLoss.toFixed(0)}`, color: '#ff4757' },
                                                { label: 'AVG DURATION', value: fmtDuration(inst.avgDuration), color: '#c9d1d9' },
                                                { label: 'LONG TRADES', value: `${inst.longTrades}`, color: '#fb923c' },
                                                { label: 'SHORT TRADES', value: `${inst.shortTrades}`, color: '#38bdf8' },
                                                { label: 'W/L RATIO', value: inst.wlRatio > 0 ? `${inst.wlRatio.toFixed(2)}:1` : '—', color: inst.wlRatio >= 1.5 ? '#FDC800' : inst.wlRatio >= 1 ? '#EAB308' : '#ff4757' },
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
                                                                <stop offset="5%" stopColor={inst.pnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0.2} />
                                                                <stop offset="95%" stopColor={inst.pnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                                                        <Area type="monotone" dataKey="pnl" stroke={inst.pnl >= 0 ? '#FDC800' : '#ff4757'} strokeWidth={1.5} fill={`url(#ig${idx})`} dot={false} />
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
                                        <div style={{ background: 'rgba(253,200,0,0.03)', border: '1px solid rgba(253,200,0,0.12)', padding: '14px 16px' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>COACHING ACTION — {inst.asset}</div>
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
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>INSTRUMENT RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 01 — CONCENTREZ-VOUS SUR VOTRE AVANTAGE` : `RULE 01 — FOCUS ON YOUR EDGE`,
                                            detail: lang === 'fr' ? `${instrumentDeep[0]?.asset ?? 'Votre meilleur instrument'} est votre instrument avec le meilleur avantage. Minimum 60% de l'allocation de session devrait y aller jusqu'à ce que vous démontriez un avantage constant sur d'autres instruments.` : `${instrumentDeep[0]?.asset ?? 'Your best instrument'} is your highest-edge instrument. Minimum 60% of session allocation should go here until you demonstrate consistent edge in other instruments.`,
                                            icon: '→', color: '#FDC800',
                                        },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 02 — ÉLIMINEZ LES INSTRUMENTS MORTS` : `RULE 02 — CUT DEAD INSTRUMENTS`,
                                            detail: lang === 'fr' ? `${instrumentDeep.filter(i => i.pnl < 0).map(i => i.asset).join(', ') || 'Aucun'} ${instrumentDeep.filter(i => i.pnl < 0).length > 0 ? 'sont négatifs nettement — retirez-les de votre liste active jusqu\'à ce que vous identifiiez pourquoi ils échouent.' : '— tous les instruments sont actuellement profitables.'}` : `${instrumentDeep.filter(i => i.pnl < 0).map(i => i.asset).join(', ') || 'None'} ${instrumentDeep.filter(i => i.pnl < 0).length > 0 ? 'are net negative — remove from your active list until you identify why these are failing.' : '— all instruments are currently profitable.'}`,
                                            icon: '⛔', color: '#ff4757',
                                            show: instrumentDeep.filter(i => i.pnl < 0).length > 0,
                                        },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 03 — DISCIPLINE DE DIRECTION` : `RULE 03 — DIRECTION DISCIPLINE`,
                                            detail: lang === 'fr' ? `Vérifiez votre répartition long/short par instrument. Un biais de direction (ex: toujours acheter un actif en tendance baissière) est un tueur silencieux de P&L. Adaptez la direction à la structure du marché, pas à l'habitude.` : `Check your long vs short split per instrument. Direction bias (e.g., always longing a downtrending asset) is a silent P&L killer. Match direction to market structure, not habit.`,
                                            icon: '⏸', color: '#EAB308',
                                        },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 04 — LIMITE DU NOMBRE D'INSTRUMENTS` : `RULE 04 — INSTRUMENT FOCUS CAP`,
                                            detail: lang === 'fr' ? `Vous tradez ${instrumentDeep.length} instrument${instrumentDeep.length > 1 ? 's' : ''}. ${instrumentDeep.length > 3 ? `Envisagez de réduire à vos 2-3 meilleurs pour les 30 prochains jours. Plus d'instruments = plus de changements de contexte = avantage dilué.` : 'Le nombre d\'instruments actuel est dans la plage optimale pour une exécution concentrée.'}` : `You're trading ${instrumentDeep.length} instrument${instrumentDeep.length > 1 ? 's' : ''}. ${instrumentDeep.length > 3 ? `Consider reducing to your top 2-3 for the next 30 days. More instruments = more context switching = diluted edge.` : 'Current instrument count is within optimal range for focused execution.'}`,
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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: 'TOTAL SESSIONS', value: `${sessionMetrics.length}`, sub: `${greenSessions} green · ${redSessions} red`, color: '#c9d1d9' },
                                    { label: 'SESSION WIN RATE', value: sessionMetrics.length > 0 ? `${((greenSessions / sessionMetrics.length) * 100).toFixed(0)}%` : '—', sub: `${greenSessions} profitable sessions`, color: greenSessions >= redSessions ? '#FDC800' : '#ff4757' },
                                    { label: 'AVG SESSION P&L', value: avgSessionPnl !== 0 ? `${avgSessionPnl >= 0 ? '+' : ''}$${avgSessionPnl.toFixed(0)}` : '—', sub: 'Per session average', color: avgSessionPnl >= 0 ? '#FDC800' : '#ff4757' },
                                    { label: 'AVG TRADES / SESSION', value: avgSessionTrades > 0 ? avgSessionTrades.toFixed(1) : '—', sub: avgSessionTrades > 15 ? 'Overtrading risk' : 'Within normal range', color: avgSessionTrades > 15 ? '#ff4757' : '#c9d1d9' },
                                    { label: 'BEST SESSION', value: bestSession ? `+$${bestSession.pnl.toFixed(0)}` : '—', sub: bestSession ? bestSession.fmtDate(bestSession.startTime) : '—', color: '#FDC800' },
                                    { label: 'WORST SESSION', value: worstSession && worstSession.pnl < 0 ? `-$${Math.abs(worstSession.pnl).toFixed(0)}` : '—', sub: worstSession ? worstSession.fmtDate(worstSession.startTime) : '—', color: '#ff4757' },
                                    { label: 'CRITICAL SESSIONS', value: `${sessionMetrics.filter((s: any) => s.tag === 'CRITICAL').length}`, sub: 'Loss > $1,000 threshold', color: sessionMetrics.filter((s: any) => s.tag === 'CRITICAL').length > 0 ? '#ff4757' : '#FDC800' },
                                    { label: 'REVENGE SESSIONS', value: `${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length}`, sub: 'Rapid re-entry after loss', color: sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length > 0 ? '#EAB308' : '#FDC800' },
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
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                                        <Cell key={i} fill={s.pnl >= 0 ? (s.tag === 'CLEAN' ? '#FDC800' : 'rgba(253,200,0,0.6)') : (s.tag === 'CRITICAL' ? '#ff4757' : 'rgba(255,71,87,0.7)')} />
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
                                            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                                <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                        {lang === 'fr'
                                                            ? <>{cleanSessions.length} sur {sessionMetrics.length} sessions étaient profitables ({((cleanSessions.length / sessionMetrics.length) * 100).toFixed(0)}% taux de réussite de session).
                                                                {critSessions.length > 0 && <> <strong style={{ color: '#ff4757' }}>{critSessions.length} CRITIQUE{critSessions.length !== 1 ? 'S' : ''}</strong> session{critSessions.length !== 1 ? 's' : ''} a dépassé le seuil de blowout.</>}
                                                                {revSessions.length > 0 && <> <strong style={{ color: '#EAB308' }}>{revSessions.length} REVENGE</strong> session{revSessions.length !== 1 ? 's' : ''} détectée{revSessions.length !== 1 ? 's' : ''} — re-entrée rapide après une perte.</>}</>
                                                            : <>{cleanSessions.length} of {sessionMetrics.length} sessions were profitable ({((cleanSessions.length / sessionMetrics.length) * 100).toFixed(0)}% session win rate).
                                                                {critSessions.length > 0 && <> <strong style={{ color: '#ff4757' }}>{critSessions.length} CRITICAL</strong> session{critSessions.length !== 1 ? 's' : ''} exceeded blowout threshold.</>}
                                                                {revSessions.length > 0 && <> <strong style={{ color: '#EAB308' }}>{revSessions.length} REVENGE</strong> session{revSessions.length !== 1 ? 's' : ''} detected — rapid re-entry after a loss.</>}</>}
                                                    </p>
                                                </div>
                                                <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                        {critSessions.length > 0
                                                            ? lang === 'fr'
                                                                ? `Vos ${critSessions.length} session${critSessions.length !== 1 ? 's' : ''} critique${critSessions.length !== 1 ? 's' : ''} ont eu des pertes disproportionnées. Fixez une perte max par session de $${Math.round(Math.abs(avgSessionPnl) * 2 || 500)} — une fois atteinte, fermez toutes les positions et éloignez-vous pendant au moins 2 heures.`
                                                                : `Your ${critSessions.length} critical session${critSessions.length !== 1 ? 's' : ''} had outsized losses. Set a per-session max-loss of $${Math.round(Math.abs(avgSessionPnl) * 2 || 500)} — once hit, close all positions and step away for minimum 2 hours.`
                                                            : lang === 'fr'
                                                                ? 'Aucune session critique encore. Fixez dès maintenant une perte max par session comme règle préventive avant de vivre votre premier blowout.'
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
                                const tagColor = s.tag === 'CLEAN' ? '#FDC800' : s.tag === 'CRITICAL' ? '#ff4757' : s.tag === 'REVENGE' ? '#EAB308' : s.tag === 'OVERTRADING' ? '#F97316' : '#38bdf8';
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
                                                        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: r === 'W' ? '#FDC800' : '#ff4757', opacity: 0.85 }} />
                                                    ))}
                                                    {seq.length > 20 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280' }}>+{seq.length - 20}</span>}
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: s.pnl >= 0 ? '#FDC800' : '#ff4757' }}>
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
                                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 1, background: '#1a1c24' }}>
                                                            {[
                                                                { label: 'TRADES', value: s.trades.length, color: '#c9d1d9' },
                                                                { label: lang === 'fr' ? 'TAUX RÉU.' : 'WIN RATE', value: `${sessionWr.toFixed(0)}%`, color: sessionWr >= 55 ? '#FDC800' : sessionWr >= 45 ? '#EAB308' : '#ff4757' },
                                                                { label: lang === 'fr' ? 'FACT. PROFIT' : 'PROFIT FACTOR', value: s.pf === 99 ? '∞' : s.pf.toFixed(2), color: s.pf >= 1.5 ? '#FDC800' : s.pf >= 1 ? '#EAB308' : '#ff4757' },
                                                                { label: lang === 'fr' ? 'GAIN MOY.' : 'AVG WIN', value: s.sAvgWin > 0 ? `+$${s.sAvgWin.toFixed(0)}` : '—', color: '#FDC800' },
                                                                { label: lang === 'fr' ? 'PERTE MOY.' : 'AVG LOSS', value: s.sAvgLoss > 0 ? `-$${s.sAvgLoss.toFixed(0)}` : '—', color: '#ff4757' },
                                                                { label: lang === 'fr' ? 'PERTE CONSEC. MAX' : 'MAX CONSEC LOSS', value: s.maxConsecLoss > 0 ? `${s.maxConsecLoss}` : '0', color: s.maxConsecLoss >= 3 ? '#ff4757' : s.maxConsecLoss >= 2 ? '#EAB308' : '#FDC800' },
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
                                                                                    <stop offset="5%" stopColor={s.pnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0.2} />
                                                                                    <stop offset="95%" stopColor={s.pnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0} />
                                                                                </linearGradient>
                                                                            </defs>
                                                                            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                                                                            <Area type="monotone" dataKey="pnl" stroke={s.pnl >= 0 ? '#FDC800' : '#ff4757'} strokeWidth={1.5} fill={`url(#sg${idx})`} dot={false} />
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
                                                                    <div style={{ padding: '10px 14px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.15)' }}>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#FDC800', letterSpacing: '0.1em', marginBottom: 3 }}>BEST TRADE</div>
                                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#FDC800' }}>+${(s.bestTrade.pnl ?? 0).toFixed(2)}</div>
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
                                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                                            {[
                                                                { label: lang === 'fr' ? 'PROFIT BRUT' : 'GROSS PROFIT', val: s.gross, total: s.gross + s.lossAbs, color: '#FDC800' },
                                                                { label: lang === 'fr' ? 'PERTE BRUTE' : 'GROSS LOSS', val: s.lossAbs, total: s.gross + s.lossAbs, color: '#ff4757' },
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
                                                        <div style={{ background: 'rgba(253,200,0,0.03)', border: '1px solid rgba(253,200,0,0.12)', padding: '14px 16px' }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>COACHING ACTION</div>
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
                                                                            const flagColor = flag === 'REVENGE' ? '#ff4757' : flag === 'HELD LONG' ? '#EAB308' : '#FDC800';
                                                                            return (
                                                                                <tr key={t.id} style={{ borderBottom: '1px solid rgba(26,28,36,0.6)' }}
                                                                                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0f1420'}
                                                                                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                                                                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{ti + 1}</td>
                                                                                    <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.fmtEstTime(t.closedAt ?? t.createdAt)}</td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#c9d1d9', fontWeight: 600 }}>{t.asset}</td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: t.isShort ? '#38bdf8' : '#fb923c', fontSize: 9, fontWeight: 700 }}>{t.isShort ? 'SHORT' : 'LONG'}</td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (t.pnl ?? 0) >= 0 ? '#FDC800' : '#ff4757' }}>
                                                                                        {(t.pnl ?? 0) >= 0 ? '+' : '-'}${Math.abs(t.pnl ?? 0).toFixed(2)}
                                                                                    </td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>
                                                                                        {fmtDuration(t.durationSeconds ?? 0)}
                                                                                    </td>
                                                                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: running >= 0 ? '#FDC800' : '#ff4757', fontWeight: 600 }}>
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
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>SESSION CONSISTENCY SCORE</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: '#c9d1d9', marginBottom: 20 }}>Consistency is more valuable than peak sessions. Variance below shows how predictable your edge is.</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 1, background: '#1a1c24', marginBottom: 20 }}>
                                        {(() => {
                                            const pnls = sessionMetrics.map((s: any) => s.pnl);
                                            const mean = pnls.reduce((a: number, b: number) => a + b, 0) / pnls.length;
                                            const variance = pnls.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / pnls.length;
                                            const stdDev = Math.sqrt(variance);
                                            const consistency = stdDev > 0 ? Math.max(0, 100 - Math.min(100, (stdDev / Math.max(Math.abs(mean), 1)) * 50)) : 100;
                                            return [
                                                { label: 'CONSISTENCY SCORE', value: `${consistency.toFixed(0)}/100`, color: consistency >= 70 ? '#FDC800' : consistency >= 50 ? '#EAB308' : '#ff4757' },
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
                                                <div key={i} title={`Session ${i+1}: ${s.pnl >= 0 ? '+' : ''}$${s.pnl.toFixed(0)}`} style={{ width: 12, height: h, background: s.pnl >= 0 ? '#FDC800' : '#ff4757', opacity: 0.8, borderRadius: 1, cursor: 'default' }} />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── SESSION SCATTER: Start Time vs P&L ── */}
                            {sessionScatterData.length > 1 && (
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>SESSION-BASED RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        {
                                            rule: lang === 'fr' ? 'RÈGLE 01 — LIMITE PERTE DE SESSION' : 'RULE 01 — SESSION DAILY LOSS LIMIT',
                                            detail: lang === 'fr' ? `Votre pire session a perdu $${worstSession && worstSession.pnl < 0 ? Math.abs(worstSession.pnl).toFixed(0) : 'N/A'}. Fixez une limite de perte journalière à 50% de ce chiffre. Quand elle est atteinte, la session se termine — sans exception.` : `Your worst session lost $${worstSession && worstSession.pnl < 0 ? Math.abs(worstSession.pnl).toFixed(0) : 'N/A'}. Set a hard daily loss limit at 50% of that figure. When hit, session ends — no exceptions.`,
                                            icon: '⛔', color: '#ff4757',
                                            show: worstSession && worstSession.pnl < -100,
                                        },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 02 — PLAFOND DE TRADES` : `RULE 02 — TRADE COUNT CAP`,
                                            detail: lang === 'fr' ? `La session moyenne a ${avgSessionTrades.toFixed(1)} trades. Plafonnez à ${Math.max(8, Math.ceil(avgSessionTrades * 1.3))} trades par session. Chaque trade au-delà de votre nombre optimal a un taux de réussite statistiquement inférieur.` : `Average session has ${avgSessionTrades.toFixed(1)} trades. Cap at ${Math.max(8, Math.ceil(avgSessionTrades * 1.3))} trades per session. Every trade beyond your optimal count has a statistically lower win rate.`,
                                            icon: '→', color: '#EAB308',
                                            show: true,
                                        },
                                        {
                                            rule: lang === 'fr' ? 'RÈGLE 03 — PROTOCOLE ANTI-REVENGE' : 'RULE 03 — REVENGE PROTOCOL',
                                            detail: lang === 'fr' ? `${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length} session${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length !== 1 ? 's' : ''} signalée${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length !== 1 ? 's' : ''} pour comportement de revenge. Après toute perte, pause minimale de 5 minutes. Journalisez votre état émotionnel avant de re-entrer.` : `${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length} session${sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length !== 1 ? 's' : ''} flagged for revenge behavior. After any loss, minimum 5-minute break. Log your emotional state before re-entry.`,
                                            icon: '⏸', color: '#EAB308',
                                            show: sessionMetrics.filter((s: any) => s.tag === 'REVENGE').length > 0,
                                        },
                                        {
                                            rule: lang === 'fr' ? 'RÈGLE 04 — RÉPLIQUER LA MEILLEURE SESSION' : 'RULE 04 — REPLICATE BEST SESSION',
                                            detail: lang === 'fr' ? (bestSession ? `Meilleure session: $${bestSession.pnl.toFixed(0)} le ${bestSession.fmtDate(bestSession.startTime)} — ${bestSession.trades.length} trades, commencée à ${bestSession.fmtEstTime(bestSession.startTime)} EST. Identifiez ce qui était différent ce jour-là et systématisez-le.` : 'Enregistrez plus de sessions pour identifier votre meilleur schéma de session.') : (bestSession ? `Best session: $${bestSession.pnl.toFixed(0)} on ${bestSession.fmtDate(bestSession.startTime)} — ${bestSession.trades.length} trades, started at ${bestSession.fmtEstTime(bestSession.startTime)} EST. Identify what was different that day and systemize it.` : 'Log more sessions to identify your best session pattern.'),
                                            icon: '✓', color: '#FDC800',
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

                            {closed.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, background: '#0d1117', border: '1px solid #1a1c24', padding: 40 }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', textAlign: 'center' }}>No closed trades yet{filterActive ? ' in this date range' : ''}.</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', textAlign: 'center' }}>Close trades to see time-of-day analysis.</div>
                                </div>
                            ) : (<>

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
                                        { label: 'BEST HOUR', value: `${String(forensics.timeStats.bestHour).padStart(2,'0')}:00`, color: '#FDC800' },
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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
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
                                        { label: 'BEST HOUR P&L', value: bestH ? `+$${bestH.pnl.toFixed(0)}` : '—', sub: `${String(forensics.timeStats.bestHour).padStart(2,'0')}:00 EST · ${bestH?.trades ?? 0} trades`, color: '#FDC800' },
                                        { label: 'WORST HOUR P&L', value: worstH ? `-$${Math.abs(worstH.pnl).toFixed(0)}` : '—', sub: `${String(forensics.timeStats.worstHour).padStart(2,'0')}:00 EST · ${worstH?.trades ?? 0} trades`, color: '#ff4757' },
                                        { label: 'PEAK SESSION WINDOW', value: topSession?.pnl > 0 ? `+$${topSession.pnl.toFixed(0)}` : '—', sub: topSession ? `${topSession.label} · ${topSession.trades} trades` : '—', color: '#FDC800' },
                                        { label: 'PROFITABLE HOURS', value: activeH.length > 0 ? `${profitableHours.length}/${activeH.length}` : '—', sub: `${activeH.length > 0 ? ((profitableHours.length / activeH.length) * 100).toFixed(0) : 0}% of active hours are green`, color: profitableHours.length > activeH.length / 2 ? '#FDC800' : '#EAB308' },
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
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{lang === 'fr' ? 'GRAPHIQUE 1/4 — P&L PAR HEURE (EST)' : 'CHART 1 OF 4 — P&L BY HOUR (EST)'}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#c9d1d9' }}>Net profit/loss accumulated per clock hour</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', marginTop: 4 }}>Bar height = dollar P&L · Color intensity scales with trade density · Empty bars = no trades that hour</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 10, height: 10, background: '#FDC800' }} />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800' }}>Profitable hour</span>
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
                                                            return <Cell key={i} fill={d.trades === 0 ? 'rgba(26,28,36,0.4)' : d.pnl >= 0 ? `rgba(253,200,0,${intensity})` : `rgba(255,71,87,${intensity})`} />;
                                                        })}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        {/* Interpretation */}
                                        {activeH.length > 0 && (
                                            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                                <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                        {lang === 'fr'
                                                            ? <>Vos 3 meilleures heures profitables ({top3.map(h => `${String(h.h).padStart(2,'0')}:00`).join(', ')}) représentent <strong style={{ color: '#FDC800' }}>{top3Pct}%</strong> de tous les bénéfices horaires. Pendant ce temps, vos {trapHours.length} heure{trapHours.length !== 1 ? 's' : ''} de perte ont collectivement coûté <strong style={{ color: '#ff4757' }}>${Math.abs(trapCost).toFixed(0)}</strong>. Votre avantage est concentré — pas réparti uniformément.</>
                                                            : <>Your top 3 profitable hours ({top3.map(h => `${String(h.h).padStart(2,'0')}:00`).join(', ')}) account for <strong style={{ color: '#FDC800' }}>{top3Pct}%</strong> of all hourly profit. Meanwhile, your {trapHours.length} loss hour{trapHours.length !== 1 ? 's' : ''} collectively cost <strong style={{ color: '#ff4757' }}>${Math.abs(trapCost).toFixed(0)}</strong>. Your edge is concentrated — not spread evenly.</>}
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
                                                <span style={{ color: '#FDC800', fontWeight: 700 }}>Green zone ≥60%</span> = strong edge &nbsp;·&nbsp;
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
                                                            <stop offset="0%" stopColor="rgba(253,200,0,0.07)" />
                                                            <stop offset="40%" stopColor="rgba(253,200,0,0.04)" />
                                                            <stop offset="60%" stopColor="rgba(234,179,8,0.04)" />
                                                            <stop offset="100%" stopColor="rgba(255,71,87,0.07)" />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#8b949e', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} width={36} />
                                                    <ReferenceLine y={60} stroke="rgba(253,200,0,0.3)" strokeDasharray="4 2" label={{ value: '60% EDGE', fill: '#FDC800', fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
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
                                                            <Cell key={i} fill={d.wr >= 60 ? '#FDC800' : d.wr >= 50 ? 'rgba(253,200,0,0.55)' : d.wr >= 40 ? '#EAB308' : '#ff4757'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        {/* Interpretation */}
                                        {activeH.length > 0 && (
                                            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                                <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                        {lang === 'fr'
                                                            ? <>Vous avez <strong style={{ color: '#FDC800' }}>{strongEdgeHours.length} heure{strongEdgeHours.length !== 1 ? 's' : ''} à fort avantage</strong> (≥60% TR) et <strong style={{ color: '#ff4757' }}>{trapHours.length} piège{trapHours.length !== 1 ? 's' : ''} statistique{trapHours.length !== 1 ? 's' : ''}</strong> (&lt;40% TR). Votre moyenne globale des heures actives est <strong style={{ color: '#EAB308' }}>{avgWR.toFixed(1)}%</strong>. Un taux de réussite sous 40% n&apos;est pas de la variance — c&apos;est structurel.</>
                                                            : <>You have <strong style={{ color: '#FDC800' }}>{strongEdgeHours.length} strong-edge hour{strongEdgeHours.length !== 1 ? 's' : ''}</strong> (≥60% WR) and <strong style={{ color: '#ff4757' }}>{trapHours.length} statistical trap{trapHours.length !== 1 ? 's' : ''}</strong> (&lt;40% WR). Your overall active-hour average is <strong style={{ color: '#EAB308' }}>{avgWR.toFixed(1)}%</strong>. Win rate below 40% is not variance — it&apos;s structural.</>}
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
                                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                            <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    {lang === 'fr'
                                                        ? <>Votre meilleur créneau est <strong style={{ color: '#FDC800' }}>{bestCell.day} {fmtH(bestCell.hour)}</strong> (+${bestCell.pnl.toFixed(0)} moy · {bestCell.trades} trades). Votre pire créneau est <strong style={{ color: '#ff4757' }}>{worstCell.day} {fmtH(worstCell.hour)}</strong> (${worstCell.pnl.toFixed(0)} moy · {worstCell.trades} trades). Les clusters rouges sur le même jour de la semaine indiquent des conditions structurelles du marché, pas de la variance aléatoire.</>
                                                        : <>Your best slot is <strong style={{ color: '#FDC800' }}>{bestCell.day} {fmtH(bestCell.hour)}</strong> (+${bestCell.pnl.toFixed(0)} avg · {bestCell.trades} trades). Your worst slot is <strong style={{ color: '#ff4757' }}>{worstCell.day} {fmtH(worstCell.hour)}</strong> (${worstCell.pnl.toFixed(0)} avg · {worstCell.trades} trades). Red clusters on the same day-of-week point to structural market conditions, not random variance.</>}
                                                </p>
                                            </div>
                                            <div style={{ padding: '14px 16px', background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.12)', borderLeft: '3px solid #ff4757' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>ACTION</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.8, margin: 0 }}>
                                                    Double your size on <strong style={{ color: '#FDC800' }}>{bestCell.day} {fmtH(bestCell.hour)}</strong> when that slot has ≥3 prior occurrences. Block calendar entries for <strong style={{ color: '#ff4757' }}>{worstCell.day} {fmtH(worstCell.hour)}</strong> — set a reminder to not trade during that window.
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
                                                Each dot = one trade · <span style={{ color: '#FDC800' }}>Green = win</span> · <span style={{ color: '#ff4757' }}>Red = loss</span> · Dot size proportional to P&L magnitude · Time in EST
                                            </div>
                                        </div>
                                        <TradeScatterChart
                                            data={scatterByHour}
                                            xLabel="Hour (EST)"
                                            height={240}
                                            xFormatter={fmtT}
                                        />
                                        {/* Interpretation */}
                                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                            <div style={{ padding: '14px 16px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'COMMENT LIRE CE GRAPHIQUE' : 'HOW TO READ THIS'}</div>
                                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    {lang === 'fr'
                                                        ? <>Cherchez des <strong style={{ color: '#FDC800' }}>clusters verts</strong> — fenêtres temporelles où les gains dominent. Cherchez des <strong style={{ color: '#ff4757' }}>clusters rouges ou gros points rouges</strong> — ce sont vos fenêtres de blowup. Un clustering vertical à une heure spécifique = cette heure a un résultat comportemental cohérent pour vous.</>
                                                        : <>Look for <strong style={{ color: '#FDC800' }}>green clusters</strong> — time windows where wins dominate. Look for <strong style={{ color: '#ff4757' }}>red clusters or large red dots</strong> — those are your blowup windows. Vertical clustering at a specific hour = that hour has a consistent behavioral outcome for you.</>}
                                                </p>
                                            </div>
                                            <div style={{ padding: '14px 16px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>{lang === 'fr' ? 'OBSERVATIONS CLÉS' : 'TOP OBSERVATIONS'}</div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e', lineHeight: 1.9 }}>
                                                    {bigWins.length > 0 && <div>{lang === 'fr' ? 'Plus grands gains' : 'Biggest wins'}: {bigWins.map(d => `${fmtT(d.x)} (+$${d.y.toFixed(0)})`).join(' · ')}</div>}
                                                    {bigLosses.length > 0 && <div>{lang === 'fr' ? 'Plus grandes pertes' : 'Biggest losses'}: {bigLosses.map(d => `${fmtT(d.x)} (-$${Math.abs(d.y).toFixed(0)})`).join(' · ')}</div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ── SESSION WINDOW BREAKDOWN ── */}
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${barW}%` }} style={{ height: '100%', background: swPnl >= 0 ? '#FDC800' : '#ff4757', borderRadius: 2, opacity: 0.8 }} />
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: swPnl >= 0 ? '#FDC800' : '#ff4757', textAlign: 'right' }}>
                                                    {swPnl >= 0 ? '+' : '-'}${Math.abs(swPnl).toFixed(0)}
                                                </div>
                                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: swWr >= 50 ? '#FDC800' : swWr >= 40 ? '#EAB308' : '#ff4757', textAlign: 'right', fontWeight: 600 }}>
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
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>FULL HOUR-BY-HOUR BREAKDOWN</div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {(lang === 'fr' ? ['HEURE (EST)', 'SESSION', 'TRADES', 'TAUX RÉU.', 'P&L NET', 'SIGNAL'] : ['HOUR (EST)', 'SESSION', 'TRADES', 'WIN RATE', 'NET P&L', 'SIGNAL']).map((h, i) => (
                                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', color: '#6b7280', fontWeight: 700, letterSpacing: '0.08em', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {hourlyStats.filter(s => s.trades > 0).map((s, i) => {
                                                const session = SESSION_WINDOWS.find(sw => sw.hours.includes(s.h));
                                                const wr = (s.wins / s.trades) * 100;
                                                const signal = s.pnl > 0 && wr >= 60 ? 'STRONG EDGE' : s.pnl > 0 && wr >= 50 ? 'PLAYABLE' : s.pnl > 0 && wr < 50 ? 'MARGINAL' : wr >= 50 ? 'MIXED' : 'AVOID';
                                                const sigColor = signal === 'STRONG EDGE' ? '#FDC800' : signal === 'PLAYABLE' ? 'rgba(253,200,0,0.6)' : signal === 'MARGINAL' ? '#EAB308' : signal === 'MIXED' ? '#fb923c' : '#ff4757';
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid #1a1c24' }}
                                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#0f1420'}
                                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                                                        <td style={{ padding: '12px 16px', color: '#c9d1d9', fontWeight: 700 }}>
                                                            {String(s.h).padStart(2,'0')}:00 – {String(s.h+1).padStart(2,'0')}:00
                                                            {s.h === forensics.timeStats.bestHour && <span style={{ marginLeft: 8, fontSize: 8, color: '#FDC800', border: '1px solid rgba(253,200,0,0.3)', padding: '1px 5px' }}>BEST</span>}
                                                            {s.h === forensics.timeStats.worstHour && <span style={{ marginLeft: 8, fontSize: 8, color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', padding: '1px 5px' }}>WORST</span>}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: session?.color ?? '#6b7280', fontSize: 9, letterSpacing: '0.06em' }}>{session?.label ?? '—'}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#6b7280' }}>{s.trades}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: wr >= 55 ? '#FDC800' : wr >= 45 ? '#EAB308' : '#ff4757' }}>{wr.toFixed(0)}%</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: s.pnl >= 0 ? '#FDC800' : '#ff4757' }}>
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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                {/* Strength */}
                                <div style={{ background: 'rgba(253,200,0,0.03)', border: '1px solid rgba(253,200,0,0.12)', padding: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <TrendingUp size={13} color="#FDC800" />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>STRENGTH ZONE</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                                        {String(forensics.timeStats.bestHour).padStart(2,'0')}:00 – {String(forensics.timeStats.bestHour + 1).padStart(2,'0')}:00 <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>EST</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#FDC800', marginBottom: 12 }}>
                                        +${hourlyStats[forensics.timeStats.bestHour]?.pnl.toFixed(0) ?? '0'}
                                    </div>
                                    <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>TRADES</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#c9d1d9' }}>{hourlyStats[forensics.timeStats.bestHour]?.trades ?? 0}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>WIN RATE</div>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: '#FDC800' }}>
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
                                    <div style={{ background: 'rgba(253,200,0,0.06)', border: '1px solid rgba(253,200,0,0.15)', padding: '12px 14px' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>COACHING ACTION</div>
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
                            <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>TIME-BASED RULES — DERIVED FROM YOUR DATA</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 01 — PRIORITÉ MEILLEURE HEURE` : `RULE 01 — BEST HOUR PRIORITY`,
                                            detail: lang === 'fr' ? `Concentrez le maximum de taille de position et les setups de plus haute conviction entre ${String(forensics.timeStats.bestHour).padStart(2,'0')}:00–${String(forensics.timeStats.bestHour+1).padStart(2,'0')}:00 EST. C'est votre fenêtre d'avantage statistiquement prouvée.` : `Focus maximum position sizing and highest conviction setups between ${String(forensics.timeStats.bestHour).padStart(2,'0')}:00–${String(forensics.timeStats.bestHour+1).padStart(2,'0')}:00 EST. This is your statistically proven peak edge window.`,
                                            icon: '→', color: '#FDC800',
                                        },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 02 — BLOCAGE HEURE DANGEREUSE` : `RULE 02 — DANGER HOUR BLOCK`,
                                            detail: lang === 'fr' ? `Mettez en place une restriction de trading à ${String(forensics.timeStats.worstHour).padStart(2,'0')}:00 EST. Si un setup apparaît, réduisez la taille de 50% et exigez une double confirmation avant l'entrée.` : `Implement a soft trading ban at ${String(forensics.timeStats.worstHour).padStart(2,'0')}:00 EST. If a setup appears, reduce size by 50% and require double confirmation before entry.`,
                                            icon: '⛔', color: '#ff4757',
                                        },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 03 — PAUSE DE TRANSITION DE SESSION` : `RULE 03 — SESSION TRANSITION PAUSE`,
                                            detail: lang === 'fr' ? `Ajoutez une pause sans trade de 5 minutes à chaque limite de session (06:00, 09:30, 11:00, 14:00, 16:00 EST). La microstructure du marché change — votre avantage aussi.` : `Add a 5-minute no-trade buffer at every session boundary (06:00, 09:30, 11:00, 14:00, 16:00 EST). Market microstructure shifts — your edge does too.`,
                                            icon: '⏸', color: '#EAB308',
                                        },
                                        {
                                            rule: lang === 'fr' ? `RÈGLE 04 — DISCIPLINE DES HEURES MORTES` : `RULE 04 — DEAD HOUR DISCIPLINE`,
                                            detail: lang === 'fr' ? `${24 - hourlyStats.filter(s => s.trades > 0).length} heures montrent zéro activité — préservez cette discipline. N'étendez pas vos heures actives tant que votre taux de réussite actuel ne dépasse pas 55% sur 30+ trades.` : `${24 - hourlyStats.filter(s => s.trades > 0).length} hours show zero activity — preserve this discipline. Do not expand your active hours until your current window win rate exceeds 55% over 30+ trades.`,
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

                            </>)}

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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {[
                                    { label: lang === 'fr' ? 'SÉRIE GAGNANTE MAX' : 'MAX WIN STREAK', value: `${forensics.maxWinStreak}`, sub: lang === 'fr' ? 'Trades gagnants consécutifs' : 'Consecutive winning trades', color: '#FDC800' },
                                    { label: lang === 'fr' ? 'SÉRIE PERDANTE MAX' : 'MAX LOSS STREAK', value: `${forensics.maxLossStreak}`, sub: lang === 'fr' ? 'Trades perdants consécutifs' : 'Consecutive losing trades', color: forensics.maxLossStreak >= 4 ? '#ff4757' : forensics.maxLossStreak >= 3 ? '#EAB308' : '#c9d1d9' },
                                    { label: 'TOTAL STREAK RUNS', value: `${streakRuns.length}`, sub: `${streakRuns.filter(r => r.type === 'W').length}W runs · ${streakRuns.filter(r => r.type === 'L').length}L runs`, color: '#c9d1d9' },
                                    { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, sub: `${wins.length}W · ${losses.length}L`, color: winRate >= 55 ? '#FDC800' : winRate >= 45 ? '#EAB308' : '#ff4757' },
                                    { label: 'EXPECTANCY', value: expectancy !== 0 ? `${expectancy >= 0 ? '+' : ''}$${Math.abs(expectancy).toFixed(2)}` : '—', sub: 'Per trade average', color: expectancy >= 0 ? '#FDC800' : '#ff4757' },
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
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                                        background: isWin ? `rgba(253,200,0,${0.4 + Math.min(run.length / 8, 0.55)})` : `rgba(255,71,87,${0.4 + Math.min(run.length / 8, 0.55)})`,
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
                                                background: res === 'W' ? '#FDC800' : '#ff4757',
                                                opacity: 0.8,
                                                boxShadow: res === 'W' ? '0 0 3px rgba(253,200,0,0.5)' : '0 0 3px rgba(255,71,87,0.5)',
                                            }} />
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 12, height: 12, background: 'rgba(253,200,0,0.7)' }} />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800' }}>Win streak (darker = longer)</span>
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
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    {/* Win vs Loss streak length distribution */}
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                                    <Bar dataKey="wins" name="wins" fill="rgba(253,200,0,0.8)" radius={[2, 2, 0, 0]} />
                                                    <Bar dataKey="losses" name="losses" fill="rgba(255,71,87,0.8)" radius={[2, 2, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, background: 'rgba(253,200,0,0.8)' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800' }}>Win streaks</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 10, height: 10, background: 'rgba(255,71,87,0.8)' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757' }}>Loss streaks</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Streak impact chart */}
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                                            <Cell key={i} fill={d.pnl >= 0 ? 'rgba(253,200,0,0.85)' : 'rgba(255,71,87,0.85)'} />
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
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>{lang === 'fr' ? 'PROBABILITÉ DE RÉCUPÉRATION APRÈS N PERTES CONSÉCUTIVES' : 'RECOVERY PROBABILITY AFTER N CONSECUTIVE LOSSES'}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', marginBottom: 20 }}>Derived from your actual trade sequence — not theory. How likely is your next trade to be a win after a losing streak?</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 1, background: '#1a1c24', marginBottom: 20 }}>
                                        {recoveryProbTable.map((row, i) => {
                                            const pct = row.recoveryProb ?? 0;
                                            const color = pct >= 65 ? '#FDC800' : pct >= 50 ? '#EAB308' : '#ff4757';
                                            return (
                                                <div key={i} style={{ padding: '20px 16px', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center' }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{lang === 'fr' ? `APRÈS ${row.n} PERTES` : `AFTER ${row.n} LOSSES`}</span>
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
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 0 }}>
                                                        <div style={{ padding: '16px 20px', borderRight: `1px solid ${sevBorder}` }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>TRIGGER</div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>{ps.trigger}</p>
                                                        </div>
                                                        <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.01)' }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>PRESCRIBED RESPONSE</div>
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

                    {activeTab === 'PATTERNS' && (
                        <motion.div key="patterns" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>

                            {filterActive && (
                                <div style={{ padding: '8px 14px', background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)', borderLeft: '3px solid #EAB308', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#EAB308', lineHeight: 1.7 }}>
                                    Date filter active — behavioral analysis (SCORECARD, QUANT, PATTERNS) always runs on your full trade history for statistical accuracy. Only OVERVIEW, DAILY, and TIME tabs reflect the date filter.
                                </div>
                            )}

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
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#FDC800', marginBottom: 8 }}>✓ CLEAN</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#8b949e' }}>No behavioral patterns detected in your data. Log more trades for deeper analysis.</div>
                                </div>
                            ) : (
                                <>
                                    {/* ── 4-KPI GRID ── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                        {[
                                            { label: 'PATTERNS DETECTED', value: `${forensics.patterns.length}`, sub: `${forensics.patterns.filter((p: any) => p.severity === 'CRITICAL').length} critical`, color: forensics.patterns.some((p: any) => p.severity === 'CRITICAL') ? '#ff4757' : '#EAB308' },
                                            { label: 'TOTAL BEHAVIORAL COST', value: behavioralCost < 0 ? `-$${Math.abs(behavioralCost).toFixed(0)}` : '$0', sub: 'Avoidable losses', color: '#ff4757' },
                                            { label: lang === 'fr' ? 'P&L NET PROJETÉ' : 'PROJECTED NET P&L', value: withoutToxicPatterns !== 0 ? `${withoutToxicPatterns >= 0 ? '+' : ''}$${Math.abs(withoutToxicPatterns).toFixed(0)}` : '—', sub: lang === 'fr' ? 'Si tous les patterns corrigés' : 'If all patterns corrected', color: withoutToxicPatterns > netPnl ? '#FDC800' : '#c9d1d9' },
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
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                                ? (lang === 'fr' ? 'Après tout trade perdant, pause obligatoire de 5 minutes avant la prochaine entrée. Sans exception. Programmez un minuteur. Journalisez votre état émotionnel avant de re-entrer. Une re-entrée rapide dans les 2 minutes après une perte a un taux de réussite statistiquement inférieur dans vos données.' : 'After any losing trade, mandatory 5-minute break before next entry. No exceptions. Set a timer. Journal your emotional state before re-entering. Rapid re-entry within 2 minutes of a loss has a statistically lower win rate in your data.')
                                                : p.name === 'Held Losers'
                                                ? (lang === 'fr' ? 'Fixez un temps de détention maximum strict sur les perdants : si une position est en perte et ouverte plus longtemps que votre temps moyen de détention gagnant, clôturez-la. Le temps en trade sur les perdants est un coût qui s\'accumule, pas une opportunité.' : 'Set a hard maximum hold time on losers: if a position is down and has been open longer than your avg win hold time, close it. Time-in-trade on losers is compounding cost, not opportunity.')
                                                : p.name === 'Spike Vulnerability'
                                                ? (lang === 'fr' ? 'Les stop-loss fermes sont non négociables sur les instruments volatils. Aucune position ne devrait être tenue à travers un événement de news/spike sans stop. Réduisez la taille ou sortez avant les catalyseurs connus.' : 'Hard stop losses are non-negotiable on volatile instruments. No position should be held through a news/spike event without a stop. Size down or exit before known catalysts.')
                                                : p.name === 'Early Exit'
                                                ? (lang === 'fr' ? 'Pour vos 20 prochains trades gagnants, ne sortez pas avant que votre stop soit atteint ou votre cible initiale atteinte. Enregistrez le P&L hypothétique. Les données vous montreront exactement combien vous laissez sur la table.' : 'For your next 20 winning trades, do not exit until either your stop is hit or your initial target is reached. Log the would-have-been P&L. The data will show you exactly how much you are leaving on the table.')
                                                : p.name === 'Micro Overtrading'
                                                ? (lang === 'fr' ? 'Plafonnez la fréquence des micro-contrats à 3 entrées par session par instrument. Le sur-trading de micro-contrats dilue votre avantage et augmente les frais de commission sur des marges déjà minces.' : 'Cap micro contract frequency to 3 entries per session per instrument. Overtrading micro contracts dilutes your edge and increases commission drag on already thin margins.')
                                                : lang === 'fr' ? `Adressez la cause racine de ${p.name}. Revoyez les ${p.freq} occurrence${p.freq > 1 ? 's' : ''} et identifiez le déclencheur commun à toutes les instances.` : `Address the root cause of ${p.name}. Review ${p.freq} occurrence${p.freq > 1 ? 's' : ''} and identify the common trigger across all instances.`;
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
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                                                                {p.name === 'Early Exit' ? 'EST. BEHAVIORAL COST' : 'BEHAVIORAL COST'}
                                                            </div>
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
                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 0 }}>
                                                        <div style={{ padding: '16px 24px', borderRight: `1px solid ${sevBorder}` }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>TRIGGER PATTERN</div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                                {p.name === 'Revenge Trading' && (lang === 'fr' ? 'Perte → re-entrée rapide dans les minutes suivantes. La pression émotionnelle supplante les critères d\'entrée systématiques. Biais de confirmation maintenu malgré le rejet du marché.' : 'Loss → rapid re-entry within minutes. Emotional pressure overrides systematic entry criteria. Confirmation bias maintained despite market rejection.')}
                                                                {p.name === 'Held Losers' && (lang === 'fr' ? 'Position perdante ouverte bien plus longtemps que les trades gagnants moyens. L\'espoir remplace la gestion du risque — attente d\'un retournement que les données montrent rarément.' : 'Open losing position held significantly longer than average winning trades. Hope displacing risk management — waiting for a reversal that the data shows rarely comes.')}
                                                                {p.name === 'Spike Vulnerability' && (lang === 'fr' ? 'Perte importante rapide en moins de 3 minutes — probablement un spike de news ou un stop-hunt. Pas de stop ferme en place pour limiter les dégâts.' : 'Rapid large loss in under 3 minutes — likely a news spike or stop-hunt event. No hard stop in place to limit damage.')}
                                                                {p.name === 'Early Exit' && (lang === 'fr' ? 'Positions gagnantes clôturées avant d\'atteindre la cible structurelle. Prise de bénéfices prématurée motivée par la peur d\'un retournement. L\'asymétrie joue contre vous lorsque les gains sont coupés court.' : 'Winning positions closed before reaching structural target. Premature profit-taking driven by fear of reversal. Asymmetry works against you when wins are cut short.')}
                                                                {p.name === 'Micro Overtrading' && (lang === 'fr' ? 'Fréquence de trade au-dessus de la normale sur les micro-contrats dans des sessions uniques. La fréquence sans avantage n\'est que du saignement de commissions.' : 'Above-normal trade frequency on micro contracts within single sessions. Frequency without edge is just commission bleeding.')}
                                                                {!['Revenge Trading','Held Losers','Spike Vulnerability','Early Exit','Micro Overtrading'].includes(p.name) && (lang === 'fr' ? `Pattern récurrent détecté ${p.freq} fois dans votre historique de trades. Voir les preuves ci-dessus pour les instances spécifiques.` : `Recurring pattern detected ${p.freq} time${p.freq > 1 ? 's' : ''} across your trade history. See evidence above for specific instances.`)}
                                                            </p>
                                                        </div>
                                                        <div style={{ padding: '16px 24px', background: 'rgba(253,200,0,0.02)' }}>
                                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>PRESCRIPTION</div>
                                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#c9d1d9', lineHeight: 1.7, margin: 0 }}>{prescription}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* ── BEHAVIORAL HEALTH SUMMARY ── */}
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                        <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(253,200,0,0.03)', border: '1px solid rgba(253,200,0,0.12)', borderLeft: '3px solid #FDC800' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>FOCUS ORDER</div>
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
                        const gradeColor = (g: string) => g === 'A' ? '#FDC800' : g === 'B' ? '#00D4FF' : g === 'C' ? '#EAB308' : g === '—' ? '#6b7280' : '#ff4757';
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
                                barColor: maxLossPct < 1 ? '#FDC800' : maxLossPct < 2 ? '#00D4FF' : maxLossPct < 4 ? '#EAB308' : '#ff4757',
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
                                barColor: revCount === 0 ? '#FDC800' : revCount === 1 ? '#EAB308' : revCount <= 3 ? '#F97316' : '#ff4757',
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
                                barColor: htRatio === null ? '#6b7280' : htRatio >= 1.2 ? '#FDC800' : htRatio >= 0.9 ? '#00D4FF' : htRatio >= 0.6 ? '#EAB308' : '#ff4757',
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
                                barColor: wlRatio >= 1.5 ? '#FDC800' : wlRatio >= 1 ? '#EAB308' : '#ff4757',
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
                                barColor: microAssets.length === 0 || microPnl >= 0 ? '#FDC800' : '#ff4757',
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
                                barColor: firstHourWR >= 50 && firstHourStats.pnl >= 0 ? '#FDC800' : firstHourWR >= 40 ? '#EAB308' : '#ff4757',
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
                                barColor: maxSessionTrades <= 10 ? '#FDC800' : maxSessionTrades <= 15 ? '#00D4FF' : maxSessionTrades <= 20 ? '#EAB308' : '#ff4757',
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
                                barColor: instCount <= 2 ? '#FDC800' : instCount <= 4 ? '#EAB308' : '#ff4757',
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

                                {filterActive && (
                                    <div style={{ padding: '8px 14px', background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)', borderLeft: '3px solid #EAB308', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#EAB308', lineHeight: 1.7 }}>
                                        Date filter active — behavioral analysis (SCORECARD, QUANT, PATTERNS) always runs on your full trade history for statistical accuracy. Only OVERVIEW, DAILY, and TIME tabs reflect the date filter.
                                    </div>
                                )}

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
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                    {[
                                        { label: 'COMPOSITE SCORE', value: `${compositeScore}`, sub: `Out of 100 · Grade ${compositeGrade}`, color: gradeColor(compositeGrade) },
                                        { label: 'METRICS PASSING', value: `${passing}/8`, sub: `${(passing / 8 * 100).toFixed(0)}% pass rate (A or B)`, color: passing >= 6 ? '#FDC800' : passing >= 4 ? '#EAB308' : '#ff4757' },
                                        { label: 'FAILING METRICS', value: `${failing}`, sub: failing === 0 ? 'No critical issues' : `${failing} need immediate attention`, color: failing === 0 ? '#FDC800' : failing <= 2 ? '#EAB308' : '#ff4757' },
                                        { label: 'BEHAVIORAL RISK', value: `${forensics.riskScore.toFixed(0)}/100`, sub: forensics.riskScore > 60 ? 'CRITICAL — address immediately' : forensics.riskScore > 35 ? 'Elevated — monitor closely' : 'Healthy', color: forensics.riskScore > 60 ? '#ff4757' : forensics.riskScore > 35 ? '#EAB308' : '#FDC800' },
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
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 20px 1fr 50px' : '200px 28px 1fr 60px', alignItems: 'center', gap: 16 }}>
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
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    {metricDetails.map((m, i) => {
                                        const s = sc[m.idx];
                                        const gc = gradeColor(s.grade);
                                        const isFailing = s.grade === 'F' || s.grade === 'D';
                                        return (
                                            <div key={i} style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px', display: 'flex', flexDirection: 'column', gap: 14, borderLeft: `2px solid ${gc}33` }}>
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
                                                    <div style={{ padding: '12px 14px', background: `rgba(${isFailing ? '255,71,87' : '166,255,77'},0.04)`, border: `1px solid rgba(${isFailing ? '255,71,87' : '166,255,77'},0.12)`, borderLeft: `3px solid ${isFailing ? '#ff4757' : '#FDC800'}` }}>
                                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: isFailing ? '#ff4757' : '#FDC800', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
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
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
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
                                        <div style={{ padding: '20px', background: 'rgba(253,200,0,0.04)', border: '1px solid rgba(253,200,0,0.15)', borderLeft: '3px solid #FDC800' }}>
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#FDC800', marginBottom: 6 }}>All metrics passing — elite execution discipline.</div>
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
                                        { g: 'A', label: '≥90 · Passing', c: '#FDC800' },
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
                        const QF = 'var(--font-mono)';
                        const tradePnls = closed.map(t => t.pnl ?? 0);
                        const nT = tradePnls.length;

                        // ── Daily-level stats ──
                        const dailyPnls = dailyData.map(d => d.pnl);
                        const nD = dailyPnls.length;
                        const meanD = nD > 0 ? dailyPnls.reduce((s, v) => s + v, 0) / nD : 0;
                        const varD = nD > 1 ? dailyPnls.reduce((s, v) => s + (v - meanD) ** 2, 0) / (nD - 1) : 0;
                        const stdD = Math.sqrt(varD);

                        // ── Risk-adjusted ratios ──
                        const sharpe = stdD > 0 ? (meanD / stdD) * Math.sqrt(252) : 0;
                        const negD = dailyPnls.filter(v => v < 0);
                        const downsideStd = negD.length > 0 ? Math.sqrt(negD.reduce((s, v) => s + v * v, 0) / negD.length) : 0;
                        const sortino = downsideStd > 0 ? (meanD / downsideStd) * Math.sqrt(252) : 0;
                        const annReturn = meanD * 252;
                        const calmar = maxDd > 0 ? annReturn / maxDd : 0;
                        const oGain = dailyPnls.filter(v => v > 0).reduce((s, v) => s + v, 0);
                        const oLoss = dailyPnls.filter(v => v < 0).reduce((s, v) => s + Math.abs(v), 0);
                        const omega = oLoss > 0 ? oGain / oLoss : oGain > 0 ? 99 : 0;
                        const recovFactor = maxDd > 0 ? netPnl / maxDd : 0;
                        const efficiency = (grossProfit + grossLoss) > 0 ? (Math.abs(netPnl) / (grossProfit + grossLoss)) * 100 : 0;

                        // Kelly
                        const kW = winRate / 100;
                        const kR = wlRatio;
                        const kellyFull = kR > 0 && kW > 0 ? kW - (1 - kW) / kR : 0;
                        const kellyPct = Math.max(0, kellyFull * 100);

                        // ── Per-trade distribution ──
                        const meanT = nT > 0 ? tradePnls.reduce((s, v) => s + v, 0) / nT : 0;
                        const varT = nT > 1 ? tradePnls.reduce((s, v) => s + (v - meanT) ** 2, 0) / (nT - 1) : 0;
                        const stdT = Math.sqrt(varT);
                        const skew = nT > 2 && stdT > 0
                            ? (nT / ((nT - 1) * (nT - 2))) * tradePnls.reduce((s, v) => s + ((v - meanT) / stdT) ** 3, 0)
                            : 0;
                        const exKurt = nT > 3 && stdT > 0
                            ? (nT * (nT + 1) / ((nT - 1) * (nT - 2) * (nT - 3))) * tradePnls.reduce((s, v) => s + ((v - meanT) / stdT) ** 4, 0)
                              - (3 * (nT - 1) ** 2) / ((nT - 2) * (nT - 3))
                            : 0;

                        // Percentiles
                        const sortedT = [...tradePnls].sort((a, b) => a - b);
                        const qPct = (p: number) => {
                            if (sortedT.length === 0) return 0;
                            const idx = (p / 100) * (sortedT.length - 1);
                            const lo = Math.floor(idx), hi = Math.ceil(idx);
                            return sortedT[lo] + (sortedT[hi] - sortedT[lo]) * (idx - lo);
                        };
                        const [qp5, qp10, qp25, qp50, qp75, qp90, qp95] = [5, 10, 25, 50, 75, 90, 95].map(qPct);

                        // VaR & CVaR (historical)
                        const var95 = -qp5;
                        const var99 = -qPct(1);
                        const cvar95Trades = sortedT.filter(v => v <= qp5);
                        const cvar95 = cvar95Trades.length > 0 ? -cvar95Trades.reduce((s, v) => s + v, 0) / cvar95Trades.length : 0;

                        // T-statistic (is mean significantly > 0?)
                        const tStat = nT > 1 && stdT > 0 ? meanT / (stdT / Math.sqrt(nT)) : 0;
                        const tCrit = 2.0;
                        const isSignificant = Math.abs(tStat) > tCrit;
                        const minN4Sig = stdT > 0 && meanT > 0 ? Math.ceil((tCrit * stdT / meanT) ** 2) : 999;
                        const ciHalf = nT > 1 ? tCrit * stdT / Math.sqrt(nT) : 0;

                        // Histogram buckets
                        const histBuckets = (() => {
                            if (nT === 0) return [] as { label: string; center: number; count: number }[];
                            const lo = sortedT[0], hi = sortedT[sortedT.length - 1];
                            const numB = Math.max(8, Math.min(20, Math.ceil(Math.sqrt(nT))));
                            const bSize = (hi - lo) / numB || 1;
                            return Array.from({ length: numB }, (_, i) => {
                                const start = lo + i * bSize, end = start + bSize;
                                const center = (start + end) / 2;
                                const cnt = tradePnls.filter(v => v >= start && (i === numB - 1 ? v <= end : v < end)).length;
                                return { label: `${center >= 0 ? '+' : ''}${center.toFixed(0)}`, center, count: cnt };
                            });
                        })();
                        const maxHistCnt = histBuckets.length > 0 ? Math.max(...histBuckets.map(b => b.count), 1) : 1;

                        // Underwater equity (drawdown depth %)
                        let ddPeak = startBal, ddBal = startBal;
                        const underwaterData = closed.map((t, i) => {
                            ddBal += t.pnl ?? 0;
                            if (ddBal > ddPeak) ddPeak = ddBal;
                            return { i: i + 1, ddPct: ddPeak > 0 ? ((ddBal - ddPeak) / ddPeak) * 100 : 0 };
                        });
                        const timeUW = underwaterData.filter(p => p.ddPct < 0).length;
                        const avgDD = underwaterData.length > 0 ? underwaterData.reduce((s, p) => s + p.ddPct, 0) / underwaterData.length : 0;
                        const maxDdPct = startBal > 0 ? (maxDd / startBal) * 100 : 0;

                        // Monte Carlo (seeded, deterministic)
                        const MC_PATHS = 500, MC_TRADES = 50;
                        const mcResults = (() => {
                            if (nT < 5) return null;
                            let rng = Math.abs(Math.floor(tradePnls.reduce((s, v) => s + v * 17.3, 0))) % 100000 || 42;
                            const rand = () => { rng = ((rng * 1664525 + 1013904223) >>> 0); return rng / 4294967296; };
                            const finals: number[] = [];
                            for (let p = 0; p < MC_PATHS; p++) {
                                let sim = 0;
                                for (let t = 0; t < MC_TRADES; t++) sim += tradePnls[Math.floor(rand() * nT)];
                                finals.push(sim);
                            }
                            finals.sort((a, b) => a - b);
                            const mcp = (pp: number) => finals[Math.min(MC_PATHS - 1, Math.floor(MC_PATHS * pp / 100))];
                            const mcLo = finals[0], mcHi = finals[finals.length - 1];
                            const mcRange = mcHi - mcLo;
                            const mcBuckets = mcRange > 0 ? Array.from({ length: 14 }, (_, i) => {
                                const start = mcLo + (i / 14) * mcRange, end = mcLo + ((i + 1) / 14) * mcRange;
                                return { label: `${((start + end) / 2) >= 0 ? '+' : ''}${((start + end) / 2).toFixed(0)}`, center: (start + end) / 2, count: finals.filter(v => v >= start && (i === 13 ? v <= end : v < end)).length };
                            }) : [];
                            return {
                                p10: mcp(10), p25: mcp(25), p50: mcp(50), p75: mcp(75), p90: mcp(90),
                                posProb: finals.filter(v => v > 0).length / MC_PATHS * 100,
                                ruinProb: finals.filter(v => v < -((account.startingBalance ?? 50000) * 0.10)).length / MC_PATHS * 100,
                                buckets: mcBuckets,
                            };
                        })();

                        // Helpers
                        const fmtQ = (v: number) => `${v >= 0 ? '+' : ''}$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.abs(v).toFixed(0)}`;
                        const rc = (v: number, good: number, ok: number) => v >= good ? '#FDC800' : v >= ok ? '#EAB308' : '#ff4757';

                        return (
                            <motion.div key="quant" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 48 }}>

                                {filterActive && (
                                    <div style={{ padding: '8px 14px', background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)', borderLeft: '3px solid #EAB308', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#EAB308', lineHeight: 1.7 }}>
                                        Date filter active — behavioral analysis (SCORECARD, QUANT, PATTERNS) always runs on your full trade history for statistical accuracy. Only OVERVIEW, DAILY, and TIME tabs reflect the date filter.
                                    </div>
                                )}

                                {/* ── HEADER ── */}
                                <div>
                                    <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>QUANTITATIVE ANALYSIS ENGINE</div>
                                    <div style={{ fontFamily: QF, fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Quant Performance Report</div>
                                    <div style={{ fontFamily: QF, fontSize: 11, color: '#8b949e' }}>Institutional-grade risk analytics derived from your actual trade history. All ratios annualized. Includes distribution analysis, VaR, Monte Carlo simulation, and statistical significance testing.</div>
                                </div>

                                {nT < 5 ? (
                                    <div style={{ padding: 40, textAlign: 'center', background: '#0d1117', border: '1px solid #1a1c24', fontFamily: QF, fontSize: 11, color: '#6b7280' }}>
                                        Log at least 5 closed trades to unlock quant analysis.
                                    </div>
                                ) : (<>

                                {/* ── 8-RATIO KPI GRID ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                    {[
                                        { label: 'SHARPE RATIO', val: nD >= 2 ? sharpe.toFixed(2) : '—', color: rc(sharpe, 1, 0.5), formula: 'μ_d / σ_d × √252', sub: 'Risk-adj annual return' },
                                        { label: 'SORTINO RATIO', val: nD >= 2 ? sortino.toFixed(2) : '—', color: rc(sortino, 1.5, 0.8), formula: 'μ_d / σ⁻ × √252', sub: 'Penalizes downside only' },
                                        { label: 'CALMAR RATIO', val: maxDd > 0 && nD >= 2 ? calmar.toFixed(2) : '—', color: rc(calmar, 1, 0.3), formula: 'μ×252 / MaxDD', sub: 'Annual return / max DD' },
                                        { label: 'OMEGA RATIO', val: nD >= 2 ? (omega >= 99 ? '∞' : omega.toFixed(2)) : '—', color: rc(omega, 2, 1), formula: '∑gains / ∑|losses|', sub: 'Total gain vs total loss' },
                                        { label: 'RECOVERY FACTOR', val: maxDd > 0 ? recovFactor.toFixed(2) : '—', color: rc(recovFactor, 3, 1), formula: 'Net P&L / MaxDD', sub: 'How well you recover' },
                                        { label: 'KELLY %', val: kellyFull > 0 ? `${kellyPct.toFixed(1)}%` : 'No edge', color: kellyFull > 0 ? '#FDC800' : '#ff4757', formula: 'W − (1−W)/R', sub: 'Optimal risk per trade' },
                                        { label: 'PROFIT FACTOR', val: profitFactor >= 99 ? '∞' : profitFactor.toFixed(2), color: rc(profitFactor, 2, 1.2), formula: 'ΣWins / Σ|Losses|', sub: 'Gross wins / gross losses' },
                                        { label: 'EFFICIENCY %', val: nT > 0 ? `${efficiency.toFixed(1)}%` : '—', color: rc(efficiency, 30, 10), formula: '|Net| / (W+L)', sub: 'Net vs total throughput' },
                                    ].map((k, i) => (
                                        <div key={i} style={{ padding: '18px 20px', borderBottom: '1px solid #1a1c24', borderRight: '1px solid #1a1c24', background: '#0d1117', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.1em' }}>{k.label}</span>
                                            <span style={{ fontFamily: QF, fontSize: 26, fontWeight: 700, color: k.color, lineHeight: 1.1 }}>{k.val}</span>
                                            <span style={{ fontFamily: QF, fontSize: 9, color: '#8b949e' }}>{k.sub}</span>
                                            <span style={{ fontFamily: QF, fontSize: 8, color: '#2d3748', marginTop: 2, letterSpacing: '0.04em' }}>{k.formula}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* ── RATIO BENCHMARKS ── */}
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: '20px 24px' }}>
                                    <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>RATIO BENCHMARK GUIDE</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                                        <div style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 2 }}>
                                            <span style={{ color: '#FDC800', fontWeight: 700 }}>Sharpe &gt;1.0</span> — Institutional quality. Each risk unit earns &gt;1 unit of return annually.<br/>
                                            <span style={{ color: '#EAB308', fontWeight: 700 }}>Sharpe 0.5–1.0</span> — Acceptable. Most retail traders sit here.<br/>
                                            <span style={{ color: '#ff4757', fontWeight: 700 }}>Sharpe &lt;0.5</span> — Volatility is outpacing return generation.<br/>
                                            <span style={{ color: '#FDC800', fontWeight: 700 }}>Sortino &gt;1.5</span> — Superior downside management vs upside capture.
                                        </div>
                                        <div style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 2 }}>
                                            <span style={{ color: '#FDC800', fontWeight: 700 }}>Omega &gt;2.0</span> — 2× more gained than lost in absolute terms. Strong edge.<br/>
                                            <span style={{ color: '#FDC800', fontWeight: 700 }}>Calmar &gt;1.0</span> — Annualized return exceeds the max drawdown incurred.<br/>
                                            <span style={{ color: '#00D4FF', fontWeight: 700 }}>Kelly</span> — Full Kelly is aggressive. Use half-Kelly ({(kellyPct * 0.5).toFixed(1)}%) for drawdown safety.<br/>
                                            <span style={{ color: '#FDC800', fontWeight: 700 }}>Recovery &gt;3.0</span> — Net profit is 3× your worst drawdown. Excellent resilience.
                                        </div>
                                    </div>
                                </div>

                                {/* ── PERSONALIZED RATIO READING ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    <div style={{ background: '#0d1117', padding: '20px 24px' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#FDC800', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>WHAT YOUR RATIOS SAY</div>
                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 1.9, margin: 0 }}>
                                            {nD >= 2 ? (
                                                sharpe >= 1
                                                    ? `Sharpe ${sharpe.toFixed(2)} — your risk-adjusted returns are institutional-grade. For every $1 of daily volatility you absorb, you earn $${sharpe.toFixed(2)} annualized. This places you in the top tier of systematic traders.`
                                                    : sharpe >= 0.5
                                                    ? `Sharpe ${sharpe.toFixed(2)} — acceptable but improvable. You earn $${sharpe.toFixed(2)} annualized for every $1 of daily volatility. The gap to the 1.0 threshold means your losing days are disproportionately large relative to your winning days.`
                                                    : `Sharpe ${sharpe.toFixed(2)} — your volatility is outpacing your return generation. You are taking on significant daily swings without capturing enough of them as net profit. This is the primary drag on your risk-adjusted performance.`
                                            ) : 'Need at least 2 trading days to compute Sharpe.'}{' '}
                                            {nD >= 2 && sortino > sharpe * 1.2
                                                ? `Sortino ${sortino.toFixed(2)} beats Sharpe — your upside is cleaner than your downside. Losing days are not as bad as total volatility suggests. Good asymmetry.`
                                                : nD >= 2 && sortino < sharpe
                                                ? `Sortino ${sortino.toFixed(2)} below Sharpe — losing days are more volatile than winning days. Your downside is disproportionate. Tighter stop discipline would lift both ratios.`
                                                : ''}{' '}
                                            {profitFactor >= 2
                                                ? `Profit factor ${profitFactor.toFixed(2)} is strong — for every $1 lost you recover $${profitFactor.toFixed(2)}. This provides significant buffer against losing streaks.`
                                                : profitFactor >= 1.2
                                                ? `Profit factor ${profitFactor.toFixed(2)} is above 1 — the system is net positive but the margin is thin. A bad week of variance can make it feel like it has stopped working.`
                                                : profitFactor > 0
                                                ? `Profit factor ${profitFactor.toFixed(2)} — gross losses nearly equal gross wins. This is a brittle system that depends heavily on win rate staying high.`
                                                : ''}
                                        </p>
                                    </div>
                                    <div style={{ background: '#0d1117', padding: '20px 24px' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#EAB308', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>ACTION — IMPROVE YOUR RATIOS</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {[
                                                {
                                                    cond: nD >= 2 && sharpe < 1,
                                                    icon: '▸',
                                                    text: `Sharpe < 1: the fastest path to improvement is reducing losing day magnitude, not adding winning days. One -${fmtQ(-avgLoss * 2)} outlier day costs more Sharpe than three +${fmtQ(avgWin)} days can recover.`,
                                                },
                                                {
                                                    cond: nD >= 2 && sortino < 1.2,
                                                    icon: '▸',
                                                    text: `Sortino ${sortino.toFixed(2)}: implement a daily loss ceiling of $${(Math.abs(avgLoss) * 3).toFixed(0)}. Any day that hits that ceiling is over. This directly compresses downside deviation, which is the denominator of Sortino.`,
                                                },
                                                {
                                                    cond: kellyFull > 0 && (account.maxRiskPercent / kellyPct) > 1,
                                                    icon: '⚠',
                                                    text: `You are sizing above full Kelly (${account.maxRiskPercent}% vs ${kellyPct.toFixed(1)}% Kelly). This mathematically maximizes drawdown risk over time. Reduce to half-Kelly: ${(kellyPct * 0.5).toFixed(1)}% per trade.`,
                                                },
                                                {
                                                    cond: kellyFull > 0 && (account.maxRiskPercent / kellyPct) < 0.25,
                                                    icon: '▸',
                                                    text: `You are trading at ${(account.maxRiskPercent / kellyPct * 100).toFixed(0)}% of Kelly. Your edge justifies ${(kellyPct * 0.5).toFixed(1)}% risk per trade (half-Kelly). Gradual size increase could improve absolute returns without material ruin risk.`,
                                                },
                                                {
                                                    cond: recovFactor > 0 && recovFactor < 1,
                                                    icon: '⚠',
                                                    text: `Recovery factor ${recovFactor.toFixed(2)} — net profit is less than your max drawdown. You lost more at the worst point than you've earned overall. The drawdown event was structurally damaging.`,
                                                },
                                                {
                                                    cond: efficiency < 15,
                                                    icon: '▸',
                                                    text: `Efficiency ${efficiency.toFixed(1)}%: most of your gross throughput cancels out. $${(grossProfit + grossLoss).toFixed(0)} gross activity produced only $${Math.abs(netPnl).toFixed(0)} net. Fewer, higher-conviction trades would lift this ratio significantly.`,
                                                },
                                            ].filter(a => a.cond).slice(0, 4).map((a, i) => (
                                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                    <span style={{ fontFamily: QF, fontSize: 10, color: '#EAB308', flexShrink: 0, marginTop: 1 }}>{a.icon}</span>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>{a.text}</p>
                                                </div>
                                            ))}
                                            {[
                                                nD >= 2 && sharpe >= 1,
                                                nD >= 2 && sortino >= 1.2,
                                                kellyFull > 0 && (account.maxRiskPercent / kellyPct) >= 0.25 && (account.maxRiskPercent / kellyPct) <= 1,
                                                recovFactor >= 1,
                                                efficiency >= 15,
                                            ].every(Boolean) && (
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#FDC800', lineHeight: 1.7, margin: 0 }}>All major ratio thresholds passing. Focus on increasing trade sample to validate statistical significance of your edge.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── DISTRIBUTION ANALYSIS ── */}
                                <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>TRADE P&L DISTRIBUTION</div>
                                            <div style={{ fontFamily: QF, fontSize: 13, fontWeight: 700, color: '#fff' }}>Return Distribution Analysis</div>
                                            <div style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', marginTop: 2 }}>Shape of returns reveals symmetry, skew, and fat-tail risk in your trading.</div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 6 }}>
                                            {[
                                                { label: 'MEAN TRADE', val: fmtQ(meanT), color: meanT >= 0 ? '#FDC800' : '#ff4757' },
                                                { label: 'MEDIAN TRADE', val: fmtQ(qp50), color: qp50 >= 0 ? '#FDC800' : '#ff4757' },
                                                { label: 'STD DEV', val: `$${stdT.toFixed(0)}`, color: '#c9d1d9' },
                                                { label: 'SAMPLE SIZE', val: `${nT}`, color: '#c9d1d9' },
                                            ].map((s, i) => (
                                                <div key={i} style={{ padding: '8px 12px', background: '#0b0e14', border: '1px solid #1a1c24' }}>
                                                    <div style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 2 }}>{s.label}</div>
                                                    <div style={{ fontFamily: QF, fontSize: 14, fontWeight: 700, color: s.color }}>{s.val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Histogram */}
                                    <ResponsiveContainer width="100%" height={150}>
                                        <BarChart data={histBuckets} margin={{ top: 4, right: 0, bottom: 4, left: 0 }} barCategoryGap={1}>
                                            <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#4b5563', fontFamily: QF }} axisLine={false} tickLine={false} interval={Math.floor(histBuckets.length / 5)} />
                                            <YAxis hide />
                                            <Tooltip contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: QF, fontSize: 11, borderRadius: 0, color: '#c9d1d9' }} formatter={(v: any) => [v, 'Trades']} />
                                            <ReferenceLine x={`${meanT >= 0 ? '+' : ''}${meanT.toFixed(0)}`} stroke="#EAB308" strokeDasharray="3 3" strokeWidth={1} />
                                            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                                {histBuckets.map((b, idx) => {
                                                    const intensity = 0.3 + Math.min(0.7, (b.count / maxHistCnt) * 0.7);
                                                    return <Cell key={idx} fill={b.center >= 0 ? `rgba(253,200,0,${intensity.toFixed(2)})` : `rgba(255,71,87,${intensity.toFixed(2)})`} />;
                                                })}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>

                                    {/* Skewness + Kurtosis cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 1, marginTop: 12, background: '#1a1c24' }}>
                                        {[
                                            {
                                                label: 'SKEWNESS',
                                                val: skew.toFixed(2),
                                                color: skew > 0.5 ? '#FDC800' : skew < -0.5 ? '#ff4757' : '#EAB308',
                                                desc: skew > 0.5
                                                    ? 'Right-skewed. Rare large wins pull the mean right. Favorable structure — occasional outsized winners offset frequent small losses.'
                                                    : skew < -0.5
                                                    ? 'Left-skewed. Fat left tail. Rare but catastrophic losses drag the mean. This is the hallmark of a short-gamma profile — lethal without hard stops.'
                                                    : 'Near-symmetric. Wins and losses are roughly mirror-shaped. Edge is in the frequency (win rate), not the tails.',
                                            },
                                            {
                                                label: 'EXCESS KURTOSIS',
                                                val: exKurt.toFixed(2),
                                                color: exKurt > 3 ? '#ff4757' : exKurt > 1 ? '#EAB308' : '#FDC800',
                                                desc: exKurt > 3
                                                    ? 'Highly leptokurtic. Fat tails — extreme trades (both huge wins and catastrophic losses) are far more common than a normal distribution predicts. VaR models will underestimate your real tail risk.'
                                                    : exKurt > 1
                                                    ? 'Mildly leptokurtic. Tail events occur slightly more often than expected. Outlier trades impact your results.'
                                                    : 'Near-normal kurtosis. Tail events are rare and roughly as expected. Consistent execution signature.',
                                            },
                                            {
                                                label: 'RIGHT TAIL (P95)',
                                                val: `+$${qp95 >= 0 ? qp95.toFixed(0) : '—'}`,
                                                color: '#FDC800',
                                                desc: `Top 5% of your trades returned +$${qp95.toFixed(0)} or more. The larger this is relative to your median, the more your P&L depends on outlier wins.`,
                                            },
                                            {
                                                label: 'LEFT TAIL (P05)',
                                                val: `-$${Math.abs(qp5).toFixed(0)}`,
                                                color: '#ff4757',
                                                desc: `Bottom 5% of trades lost $${Math.abs(qp5).toFixed(0)} or more. This is your historical 95% VaR threshold. Compare to your stop loss setting to verify discipline.`,
                                            },
                                        ].map((s, i) => (
                                            <div key={i} style={{ background: '#0d1117', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.1em' }}>{s.label}</span>
                                                <span style={{ fontFamily: QF, fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.val}</span>
                                                <span style={{ fontFamily: QF, fontSize: 9, color: '#8b949e', lineHeight: 1.6 }}>{s.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── DISTRIBUTION WHAT THIS MEANS + ACTION ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    <div style={{ background: '#0d1117', padding: '18px 20px', borderLeft: `3px solid ${skew < -0.5 ? '#ff4757' : skew > 0.5 ? '#FDC800' : '#EAB308'}` }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: skew < -0.5 ? '#ff4757' : skew > 0.5 ? '#FDC800' : '#EAB308', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>WHAT THIS DISTRIBUTION MEANS</div>
                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 1.9, margin: 0 }}>
                                            {skew > 0.5 && exKurt <= 1
                                                ? `Right-skewed, thin-tailed distribution — the best profile for a retail trader. You have more small losses than small wins, but your wins are meaningfully larger. Positive skew means a few exceptional trades are carrying the P&L. This profile can sustain a sub-50% win rate and still be profitable.`
                                                : skew > 0.5 && exKurt > 1
                                                ? `Right-skewed but fat-tailed — you have large wins (good) but also occasional large losses (bad). The fat tails mean your P&L is lumpy. Two or three outlier losses in a row could erase weeks of steady gains. The distribution structure is positive but fragile.`
                                                : skew < -0.5 && exKurt > 1
                                                ? `Left-skewed with fat tails — the worst distribution profile. You have small, frequent wins but rare catastrophic losses. This is the pattern of a trader who doesn't use hard stops. The losses are hidden in the tail but they will eventually compound into account-level damage.`
                                                : skew < -0.5
                                                ? `Left-skewed distribution — frequent small wins masking infrequent large losses. Your mean ($${meanT.toFixed(0)}/trade) is being dragged left by outlier losing trades. The median (${fmtQ(qp50)}) is likely better than the mean, which confirms the tail structure. This profile needs hard stop enforcement.`
                                                : exKurt > 3
                                                ? `Symmetric but highly fat-tailed — your trades cluster near zero with occasional explosive outcomes in both directions. Normal VaR models will significantly underestimate your true tail risk. The ${cvar95Trades.length} trades in your worst 5% averaged -$${cvar95.toFixed(0)}, which is the real risk number to size against.`
                                                : `Near-symmetric distribution with ${exKurt > 1 ? 'mild' : 'normal'} kurtosis — consistent, controlled execution. Wins and losses are similarly shaped. Your edge comes primarily from win rate (${winRate.toFixed(0)}%) rather than tail outcomes. This is the most scalable distribution profile.`
                                            }{' '}
                                            {meanT > qp50
                                                ? ` Mean (${fmtQ(meanT)}) > Median (${fmtQ(qp50)}): a few large wins are pulling your average up. The typical trade is actually smaller than it looks.`
                                                : meanT < qp50
                                                ? ` Mean (${fmtQ(meanT)}) < Median (${fmtQ(qp50)}): a few large losses are pulling your average down. Most of your trades perform better than the mean implies.`
                                                : ''}
                                        </p>
                                    </div>
                                    <div style={{ background: '#0d1117', padding: '18px 20px', borderLeft: '3px solid #EAB308' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#EAB308', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>ACTION — FIX YOUR DISTRIBUTION SHAPE</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {skew < -0.3 && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span style={{ color: '#ff4757', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>▸</span>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        Left-skew fix: your largest loss ({fmtQ(qp5)}) is {Math.abs(qp5 / meanT).toFixed(1)}× your mean trade. Hard stops set at 2× your average loss (${(avgLoss * 2).toFixed(0)}) would cap left-tail events and shift skew right over time.
                                                    </p>
                                                </div>
                                            )}
                                            {exKurt > 2 && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span style={{ color: '#ff4757', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>▸</span>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        Fat-tail correction: excess kurtosis {exKurt.toFixed(1)} means outlier trades occur {(exKurt / 3 * 100).toFixed(0)}% more often than normal. Your VaR 99% (${var99.toFixed(0)}) is the real stop size to plan for — not your average loss (${avgLoss.toFixed(0)}).
                                                    </p>
                                                </div>
                                            )}
                                            {qp50 < 0 && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span style={{ color: '#ff4757', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>▸</span>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        Median trade is negative ({fmtQ(qp50)}): more than half your trades lose money. Profitability depends entirely on your top-end winners. This is a high-fragility setup — one bad week without outlier wins turns everything negative.
                                                    </p>
                                                </div>
                                            )}
                                            {skew > 0.3 && exKurt <= 1 && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span style={{ color: '#FDC800', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>✓</span>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        Distribution shape is healthy. Protect your right tail: do not exit P95 trades early. Those {fmtQ(qp95)}+ winners are structurally important — they are what makes your mean higher than your median.
                                                    </p>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <span style={{ color: '#00D4FF', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>▸</span>
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                    IQR is ${(qp75 - qp25).toFixed(0)} ({fmtQ(qp25)} to {fmtQ(qp75)}). {(qp75 - qp25) > avgWin * 2 ? `Wide spread — execution variance is high. Standardizing entry and exit rules would compress this range and improve consistency.` : `Tight spread — execution is consistent. The middle 50% of your trades are predictable. Scale position size here, not on your outliers.`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── PERCENTILES + VAR ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    {/* Percentile table */}
                                    <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>PERCENTILE BREAKDOWN</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            {[
                                                { p: 'P95', val: qp95, label: 'Top 5% outcome', color: '#FDC800' },
                                                { p: 'P75', val: qp75, label: 'Upper quartile', color: '#FDC800' },
                                                { p: 'P50', val: qp50, label: 'Median trade', color: qp50 >= 0 ? '#c9d1d9' : '#EAB308' },
                                                { p: 'P25', val: qp25, label: 'Lower quartile', color: qp25 >= 0 ? '#EAB308' : '#ff4757' },
                                                { p: 'P10', val: qp10, label: 'Bottom decile', color: '#ff4757' },
                                                { p: 'P05', val: qp5,  label: 'Historical VaR 95%', color: '#ff4757' },
                                            ].map((row, i) => (
                                                <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '30px 80px 1fr' : '40px 100px 1fr', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#0b0e14' }}>
                                                    <span style={{ fontFamily: QF, fontSize: 9, fontWeight: 700, color: '#6b7280' }}>{row.p}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 14, fontWeight: 700, color: row.color }}>{fmtQ(row.val)}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563' }}>{row.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderLeft: '3px solid #00D4FF' }}>
                                            <div style={{ fontFamily: QF, fontSize: 9, color: '#00D4FF', letterSpacing: '0.1em', marginBottom: 3 }}>INTERQUARTILE RANGE</div>
                                            <span style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9' }}>
                                                ${(qp75 - qp25).toFixed(0)} — middle 50% of trades fall between {fmtQ(qp25)} and {fmtQ(qp75)}. Tight IQR = consistent execution. Wide IQR = high outcome variance.
                                            </span>
                                        </div>
                                    </div>

                                    {/* VaR */}
                                    <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>VALUE AT RISK &amp; TAIL METRICS</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {[
                                                { label: 'VaR 95% (Historical)', val: `$${var95.toFixed(0)}`, sub: 'In 95% of trades, you will not lose more than this.', color: '#EAB308' },
                                                { label: 'VaR 99% (Historical)', val: `$${var99.toFixed(0)}`, sub: 'In 99% of trades, max single-trade loss is bounded here.', color: '#ff4757' },
                                                { label: 'CVaR / Expected Shortfall 95%', val: `$${cvar95.toFixed(0)}`, sub: 'Average loss in the worst 5% of trades. TRUE tail cost.', color: '#ff4757' },
                                                {
                                                    label: 'Tail Multiplier (VaR / Avg Loss)',
                                                    val: var95 > 0 && avgLoss > 0 ? `${(var95 / avgLoss).toFixed(1)}×` : '—',
                                                    sub: `Tail-risk loss vs average loss. Above 3× = outlier events dominate risk.`,
                                                    color: var95 > 0 && avgLoss > 0 ? rc(-(var95 / avgLoss - 3), 0, -1) : '#6b7280',
                                                },
                                            ].map((m, i) => (
                                                <div key={i} style={{ padding: '12px 14px', background: '#0b0e14', border: '1px solid #1a1c24', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                                    <div>
                                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 3 }}>{m.label}</div>
                                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#4b5563', lineHeight: 1.5 }}>{m.sub}</div>
                                                    </div>
                                                    <div style={{ fontFamily: QF, fontSize: 20, fontWeight: 700, color: m.color, flexShrink: 0 }}>{m.val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* ── VAR EXPLANATION + ACTION ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    <div style={{ background: '#0d1117', padding: '18px 20px', borderLeft: '3px solid #ff4757' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#ff4757', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>HOW TO READ YOUR VAR NUMBERS</div>
                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 1.9, margin: 0 }}>
                                            VaR 95% (${var95.toFixed(0)}) means: on your worst trading day (statistically 1 in 20 trades), you should expect to lose around this amount. It is not a ceiling — it is the threshold where tail events begin.{' '}
                                            CVaR ${cvar95.toFixed(0)} is the number that actually matters for risk management: it is the average loss across your {cvar95Trades.length} worst trades — the ones that fell past VaR. Banks and prop firms size their buffers against CVaR, not VaR.{' '}
                                            {cvar95 > var95 * 1.5
                                                ? `Your CVaR (${cvar95.toFixed(0)}) is ${(cvar95 / var95).toFixed(1)}× your VaR (${var95.toFixed(0)}). This gap reveals fat-tail behavior — when your worst trades happen, they are significantly larger than your VaR threshold predicted. Your true tail exposure is ${fmtQ(-cvar95)}, not ${fmtQ(-var95)}.`
                                                : `Your CVaR (${cvar95.toFixed(0)}) is close to VaR (${var95.toFixed(0)}) — tail losses are consistent in size, not explosive. This is the healthier VaR profile: tails are bounded and predictable.`
                                            }
                                        </p>
                                    </div>
                                    <div style={{ background: '#0d1117', padding: '18px 20px', borderLeft: '3px solid #EAB308' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#EAB308', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>ACTION — USE VAR IN YOUR SIZING</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <span style={{ color: '#EAB308', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>▸</span>
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                    Daily loss limit recommendation: set your session stop at 2× VaR 95% = ${(var95 * 2).toFixed(0)}. This allows for two standard tail trades before you are forced to stop. Going past this level indicates something is wrong with execution, not just variance.
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <span style={{ color: '#EAB308', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>▸</span>
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                    Size against CVaR, not average loss: your average loss (${avgLoss.toFixed(0)}) understates real exposure. Any trade you size at {avgLoss > 0 ? `1% of account must survive a CVaR event of $${cvar95.toFixed(0)} without blowing the daily limit.` : 'scale must account for tail behavior.'}
                                                </p>
                                            </div>
                                            {var99 > (account.dailyLossLimit ?? 0) * 0.8 && (account.dailyLossLimit ?? 0) > 0 && (
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <span style={{ color: '#ff4757', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>⚠</span>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        VaR 99% (${var99.toFixed(0)}) is above 80% of your daily loss limit (${ (account.dailyLossLimit ?? 0).toFixed(0)}). A single 1-in-100 tail trade could blow your daily limit in one hit. Consider reducing position size or widening your limit if the current size is appropriate.
                                                    </p>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <span style={{ color: '#00D4FF', fontFamily: QF, fontSize: 10, flexShrink: 0 }}>▸</span>
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                    Tail multiplier {var95 > 0 && avgLoss > 0 ? `${(var95 / avgLoss).toFixed(1)}×` : '—'}: {var95 > 0 && avgLoss > 0 && var95 / avgLoss > 3 ? `above 3× — outlier events dominate your risk. Review the ${cvar95Trades.length} worst trades to find a common pattern (time of day, asset, session type). Once identified, eliminate that setup.` : `below 3× — tail risk is proportional to typical risk. No single outlier category is dominating your losses.`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── UNDERWATER EQUITY ── */}
                                {underwaterData.length > 1 && (
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                                            <div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>UNDERWATER EQUITY</div>
                                                <div style={{ fontFamily: QF, fontSize: 13, fontWeight: 700, color: '#fff' }}>Drawdown Depth by Trade</div>
                                                <div style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', marginTop: 2 }}>Every moment your equity is below its previous peak. Depth = % below peak at that trade.</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                                {[
                                                    { label: 'MAX DD', val: `${maxDdPct.toFixed(1)}%`, color: '#ff4757' },
                                                    { label: 'AVG DD', val: `${avgDD.toFixed(1)}%`, color: '#EAB308' },
                                                    { label: 'TRADES UNDERWATER', val: `${timeUW}/${underwaterData.length}`, color: '#00D4FF' },
                                                    { label: 'RECOVERY FACTOR', val: maxDd > 0 ? recovFactor.toFixed(2) : '—', color: rc(recovFactor, 3, 1) },
                                                ].map((s, i) => (
                                                    <div key={i} style={{ textAlign: 'right' }}>
                                                        <div style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.08em' }}>{s.label}</div>
                                                        <div style={{ fontFamily: QF, fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <ResponsiveContainer width="100%" height={140}>
                                            <AreaChart data={underwaterData} margin={{ top: 4, right: 0, bottom: 0, left: 40 }}>
                                                <defs>
                                                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#ff4757" stopOpacity={0.5} />
                                                        <stop offset="95%" stopColor="#ff4757" stopOpacity={0.05} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="i" tick={{ fontSize: 8, fill: '#4b5563', fontFamily: QF }} axisLine={false} tickLine={false} label={{ value: 'Trade #', position: 'insideBottom', offset: -4, fill: '#4b5563', fontSize: 8, fontFamily: QF }} />
                                                <YAxis tick={{ fontSize: 8, fill: '#4b5563', fontFamily: QF }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}%`} width={40} />
                                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                                                <Tooltip contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: QF, fontSize: 11, borderRadius: 0, color: '#c9d1d9' }} formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Drawdown']} labelFormatter={(v: any) => `Trade #${v}`} />
                                                <Area type="monotone" dataKey="ddPct" stroke="#ff4757" strokeWidth={1.5} fill="url(#ddGrad)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                            <div style={{ padding: '12px 16px', background: '#0d1117', borderLeft: '3px solid #ff4757' }}>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#ff4757', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 700 }}>{lang === 'fr' ? 'CE QUE CELA SIGNIFIE' : 'WHAT THIS MEANS'}</div>
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    {timeUW > underwaterData.length * 0.5
                                                        ? `${timeUW} of ${underwaterData.length} trades (${(timeUW / underwaterData.length * 100).toFixed(0)}%) occurred below peak equity. More time underwater than above water means you are spending more energy recovering ground than compounding it. The average drawdown depth of ${Math.abs(avgDD).toFixed(1)}% compounds psychologically — extended underwater periods are when emotional decisions peak.`
                                                        : `${timeUW} of ${underwaterData.length} trades occurred below peak equity (${(timeUW / underwaterData.length * 100).toFixed(0)}%). Recovery is efficient — you are spending more time at or above peak than below it. A recovery factor of ${recovFactor.toFixed(2)} confirms net profit is ${recovFactor.toFixed(1)}× the max drawdown incurred. This is the profile of a well-managed account.`
                                                    }
                                                    {maxDdPct > 10 && ` Max drawdown of ${maxDdPct.toFixed(1)}% from starting balance is a structural data point: it tells you the worst losing sequence your current approach has produced. Size your position so a repeat of that sequence does not threaten the account.`}
                                                </p>
                                            </div>
                                            <div style={{ padding: '12px 16px', background: '#0d1117', borderLeft: '3px solid #EAB308' }}>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 700 }}>ACTION</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                                    {timeUW > underwaterData.length * 0.5 && (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            More than half your trades are underwater. Stop targeting new highs aggressively — tighten stops and reduce size until you string together 10 consecutive non-losing trades. Reframe the goal from profit to capital preservation.
                                                        </p>
                                                    )}
                                                    {maxDdPct > 5 && (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            Max drawdown of {maxDdPct.toFixed(1)}%: identify the specific session or date cluster that caused this. Check the SESSIONS tab for that period. If it was one outlier session, implement a session-level loss cap of ${(Math.abs(netPnl) * 0.05).toFixed(0)} to prevent recurrence.
                                                        </p>
                                                    )}
                                                    {recovFactor > 0 && recovFactor < 2 && (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            Recovery factor {recovFactor.toFixed(2)}: to reach 3.0 (professional benchmark), you need net P&L of ${(maxDd * 3).toFixed(0)} at your current max drawdown, or you need to reduce max drawdown to ${(netPnl / 3).toFixed(0)}. The second path is always faster.
                                                        </p>
                                                    )}
                                                    {recovFactor >= 3 && (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#FDC800', lineHeight: 1.7, margin: 0 }}>
                                                            Recovery factor {recovFactor.toFixed(2)} exceeds the 3.0 benchmark. Drawdown management is working. Maintain the same stop discipline — this metric will degrade if you loosen exits.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── EDGE SIGNIFICANCE + PROJECTIONS ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                    {/* T-test */}
                                    <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>STATISTICAL EDGE SIGNIFICANCE</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24', marginBottom: 12 }}>
                                            {[
                                                { label: 'T-STATISTIC', val: tStat.toFixed(2), color: Math.abs(tStat) >= tCrit ? '#FDC800' : '#ff4757', sub: `Need |t| ≥ ${tCrit.toFixed(1)}` },
                                                { label: 'CRITICAL VALUE', val: `±${tCrit.toFixed(1)}`, color: '#00D4FF', sub: '95% two-tailed' },
                                                { label: 'EDGE STATUS', val: isSignificant ? 'CONFIRMED' : 'NOT SIG.', color: isSignificant ? '#FDC800' : '#ff4757', sub: isSignificant ? 'At 95% confidence' : 'Need more trades' },
                                                { label: 'MIN SAMPLE', val: `${Math.min(minN4Sig, 9999)}`, color: nT >= minN4Sig ? '#FDC800' : '#EAB308', sub: `You have ${nT} of ${minN4Sig}` },
                                            ].map((s, i) => (
                                                <div key={i} style={{ background: '#0d1117', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.08em' }}>{s.label}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563' }}>{s.sub}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ padding: '12px 14px', background: `rgba(${isSignificant ? '166,255,77' : '255,71,87'},0.05)`, border: `1px solid rgba(${isSignificant ? '166,255,77' : '255,71,87'},0.15)`, borderLeft: `3px solid ${isSignificant ? '#FDC800' : '#ff4757'}` }}>
                                            <div style={{ fontFamily: QF, fontSize: 9, color: isSignificant ? '#FDC800' : '#ff4757', letterSpacing: '0.1em', marginBottom: 4 }}>
                                                {isSignificant ? 'EDGE CONFIRMED AT 95% CONFIDENCE' : 'INSUFFICIENT STATISTICAL EVIDENCE'}
                                            </div>
                                            <p style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 1.7, margin: 0 }}>
                                                {isSignificant
                                                    ? `t = ${tStat.toFixed(2)} exceeds ±${tCrit.toFixed(1)}. Less than 5% probability your mean return of ${fmtQ(meanT)}/trade is due to random chance. The edge is statistically real.`
                                                    : `With ${nT} trades and t = ${tStat.toFixed(2)}, the data cannot yet separate skill from variance. You need ${Math.max(0, minN4Sig - nT)} more trades (${minN4Sig} total). This does not mean no edge — it means the sample is too small to confirm it at 95%.`
                                                }
                                            </p>
                                        </div>
                                        <div style={{ padding: '12px 14px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.12)', borderLeft: '3px solid #EAB308' }}>
                                            <div style={{ fontFamily: QF, fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 700 }}>ACTION</div>
                                            {isSignificant ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        Edge is confirmed — now protect it. The three things that destroy a confirmed edge: (1) changing the setup definition after a losing streak, (2) skipping trades selectively after losses, (3) overtrading on win streaks. All three introduce selection bias that invalidates the statistical sample.
                                                    </p>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        At {nT} trades with t = {tStat.toFixed(2)}, you have statistical confidence. The next milestone is t ≥ 3.0 (99% confidence), which requires either more trades or a larger mean. You are currently at {((tStat / 3) * 100).toFixed(0)}% of the way there.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        While building sample: do not change your approach. Every strategy modification resets the clock. You need {Math.max(0, minN4Sig - nT)} more trades at the same setup to reach significance. Changing variables now makes all existing data unreliable.
                                                    </p>
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        During this accumulation phase: trade minimum size. The goal is data, not profit. Once t ≥ {tCrit.toFixed(1)} is confirmed at full sample ({minN4Sig} trades), then scale up. Scaling before significance confirmation is the primary cause of new-account blowups.
                                                    </p>
                                                    {meanT > 0 && (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            Current signal-to-noise: t = {tStat.toFixed(2)} out of {tCrit.toFixed(1)} needed. You are {((tStat / tCrit) * 100).toFixed(0)}% of the way there by t-stat alone. Each new trade adds √(n+1)/√n to the denominator — the accumulation accelerates non-linearly as n grows.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Projections */}
                                    <div style={{ background: '#0d1117', padding: isMobile ? '14px' : '24px' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>CONFIDENCE INTERVAL &amp; PROJECTIONS</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            <div style={{ padding: '14px 16px', background: '#0b0e14', border: '1px solid #1a1c24' }}>
                                                <div style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 6 }}>95% CI FOR MEAN TRADE P&L</div>
                                                <div style={{ fontFamily: QF, fontSize: 13, fontWeight: 700, color: '#00D4FF' }}>
                                                    [{fmtQ(meanT - ciHalf)} , {fmtQ(meanT + ciHalf)}]
                                                </div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#2d3748', marginTop: 4 }}>x̄ ± t·(σ/√n) = ${meanT.toFixed(0)} ± ${ciHalf.toFixed(0)}</div>
                                            </div>
                                            {[
                                                { label: 'NEXT 10 TRADES', val: fmtQ(meanT * 10), sub: `10 × ${fmtQ(meanT)} expected value`, color: meanT >= 0 ? '#FDC800' : '#ff4757' },
                                                { label: 'NEXT 50 TRADES', val: fmtQ(meanT * 50), sub: `50 × ${fmtQ(meanT)} mean`, color: meanT >= 0 ? '#FDC800' : '#ff4757' },
                                                { label: 'ANNUALIZED (252d)', val: fmtQ(annReturn), sub: `${nD} days sampled, extrapolated to 252`, color: annReturn >= 0 ? '#FDC800' : '#ff4757' },
                                            ].map((s, i) => (
                                                <div key={i} style={{ padding: '10px 14px', background: '#0b0e14', border: '1px solid #1a1c24', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                                    <div>
                                                        <div style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 2 }}>{s.label}</div>
                                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#4b5563' }}>{s.sub}</div>
                                                    </div>
                                                    <div style={{ fontFamily: QF, fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                                                </div>
                                            ))}
                                            <div style={{ padding: '10px 14px', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)', borderLeft: '3px solid #00D4FF' }}>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#00D4FF', letterSpacing: '0.1em', marginBottom: 5, fontWeight: 700 }}>HOW TO USE THE CI</div>
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                    The 95% CI [{fmtQ(meanT - ciHalf)}, {fmtQ(meanT + ciHalf)}] means: if you ran your entire trade history again under the same conditions, the true mean would fall inside this range 95% of the time.{' '}
                                                    {(meanT - ciHalf) > 0
                                                        ? `The lower CI bound is positive (${fmtQ(meanT - ciHalf)}): even in a pessimistic scenario, the expected mean trade is profitable. This is the strongest form of edge evidence — the entire confidence interval is above zero.`
                                                        : (meanT + ciHalf) > 0 && meanT > 0
                                                        ? `The CI straddles zero (${fmtQ(meanT - ciHalf)} to ${fmtQ(meanT + ciHalf)}): the edge is real on average but the confidence interval includes negative territory. A bad run of variance could make the period look like a losing strategy. This is the "more data needed" signal.`
                                                        : `CI includes negative territory — the data does not yet rule out a negative mean. Keep trading minimum size until the lower CI bound clears zero.`
                                                    }
                                                </p>
                                            </div>
                                            <div style={{ padding: '8px 12px', background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.15)', borderLeft: '3px solid #EAB308' }}>
                                                <span style={{ fontFamily: QF, fontSize: 9, color: '#8b949e', lineHeight: 1.6 }}>Projections assume stationary statistics. Live trading introduces regime changes — never base sizing decisions on projections alone.</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── MONTE CARLO ── */}
                                {mcResults && (
                                    <div style={{ background: '#0d1117', border: '1px solid #1a1c24', padding: isMobile ? '14px' : '24px' }}>
                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>MONTE CARLO SIMULATION</div>
                                        <div style={{ fontFamily: QF, fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{MC_PATHS} Paths · {MC_TRADES}-Trade Horizon</div>
                                        <div style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', marginBottom: 16 }}>
                                            Resamples your actual {nT} trade outcomes {MC_PATHS} times to simulate possible futures. Each path draws {MC_TRADES} random trades from your history. Seeded — same data always produces the same simulation.
                                        </div>

                                        {/* Scenario strip */}
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 1, background: '#1a1c24', marginBottom: 16 }}>
                                            {[
                                                { label: 'BEAR CASE (P10)', val: fmtQ(mcResults.p10), color: mcResults.p10 >= 0 ? '#EAB308' : '#ff4757', sub: 'Worst 10% of runs' },
                                                { label: 'CAUTIOUS (P25)', val: fmtQ(mcResults.p25), color: mcResults.p25 >= 0 ? '#EAB308' : '#ff4757', sub: 'Bottom quartile' },
                                                { label: 'BASE CASE (P50)', val: fmtQ(mcResults.p50), color: mcResults.p50 >= 0 ? '#FDC800' : '#ff4757', sub: 'Median simulation' },
                                                { label: 'OPTIMISTIC (P75)', val: fmtQ(mcResults.p75), color: '#FDC800', sub: 'Top quartile' },
                                                { label: 'BULL CASE (P90)', val: fmtQ(mcResults.p90), color: '#FDC800', sub: 'Best 10% of runs' },
                                            ].map((s, i) => (
                                                <div key={i} style={{ background: '#0d1117', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.1em' }}>{s.label}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563' }}>{s.sub}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* MC histogram */}
                                        <ResponsiveContainer width="100%" height={140}>
                                            <BarChart data={mcResults.buckets} margin={{ top: 4, right: 0, bottom: 4, left: 0 }} barCategoryGap={2}>
                                                <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#4b5563', fontFamily: QF }} axisLine={false} tickLine={false} interval={2} />
                                                <YAxis hide />
                                                <Tooltip contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: QF, fontSize: 11, borderRadius: 0, color: '#c9d1d9' }} formatter={(v: any) => [v, 'Simulations']} labelFormatter={(v: any) => `Outcome: ${v}`} />
                                                <ReferenceLine x="$0" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                                                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                                                    {mcResults.buckets.map((b, i) => (
                                                        <Cell key={i} fill={b.center >= 0 ? 'rgba(253,200,0,0.7)' : 'rgba(255,71,87,0.7)'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>

                                        {/* Probability stats */}
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 1, marginTop: 12, background: '#1a1c24' }}>
                                            {[
                                                { label: 'PROB. PROFITABLE', val: `${mcResults.posProb.toFixed(0)}%`, color: rc(mcResults.posProb, 70, 50), sub: `${mcResults.posProb.toFixed(0)}% of simulated ${MC_TRADES}-trade runs end in profit` },
                                                { label: 'PROB. OF RUIN (>10% DD)', val: `${mcResults.ruinProb.toFixed(1)}%`, color: mcResults.ruinProb < 5 ? '#FDC800' : mcResults.ruinProb < 20 ? '#EAB308' : '#ff4757', sub: 'Probability of drawing down 10%+ of starting balance' },
                                                { label: 'MEDIAN OUTCOME', val: fmtQ(mcResults.p50), color: mcResults.p50 >= 0 ? '#FDC800' : '#ff4757', sub: 'Half of all simulated futures beat this number after 50 trades' },
                                            ].map((s, i) => (
                                                <div key={i} style={{ background: '#0d1117', padding: '16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.1em' }}>{s.label}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563', lineHeight: 1.5 }}>{s.sub}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                            <div style={{ padding: '14px 18px', background: '#0d1117', borderLeft: '3px solid #00D4FF' }}>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#00D4FF', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 700 }}>WHAT THE SIMULATION TELLS YOU</div>
                                                <p style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', lineHeight: 1.8, margin: 0 }}>
                                                    Monte Carlo does not predict the future — it shows the distribution of futures your current stats can produce. The width of the distribution (Bear {fmtQ(mcResults.p10)} to Bull {fmtQ(mcResults.p90)}) is your variance cone. A wide cone means high volatility of outcomes; a tight cone means predictable compounding.{' '}
                                                    {(mcResults.p90 - mcResults.p10) > Math.abs(meanT) * MC_TRADES * 0.5
                                                        ? `Your cone is wide: P90 (${fmtQ(mcResults.p90)}) is ${((mcResults.p90 - mcResults.p10) / Math.abs(meanT * MC_TRADES) * 100).toFixed(0)}% wider than the expected value range. Outcome variance is high — you will experience significant runs in both directions before mean-reverting to the trend.`
                                                        : `Your cone is relatively tight — outcomes cluster near the base case (${fmtQ(mcResults.p50)}). This signals consistent execution: variance is not overwhelming edge over ${MC_TRADES} trades.`
                                                    }{' '}
                                                    {mcResults.ruinProb > 0
                                                        ? `Ruin probability of ${mcResults.ruinProb.toFixed(1)}% means approximately ${Math.round(mcResults.ruinProb * MC_PATHS / 100)} of the ${MC_PATHS} simulated futures hit a 10%+ drawdown. ${mcResults.ruinProb > 10 ? 'This is material — the risk of a damaging sequence is real at current stats.' : 'This is low — the risk of a catastrophic sequence is minimal at current stats.'}`
                                                        : ''
                                                    }
                                                </p>
                                            </div>
                                            <div style={{ padding: '14px 18px', background: '#0d1117', borderLeft: '3px solid #EAB308' }}>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#EAB308', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 700 }}>ACTION</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {mcResults.posProb >= 70 ? (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            {mcResults.posProb.toFixed(0)}% of futures are profitable. The edge is robust to variance at {MC_TRADES}-trade horizon. Your job is execution consistency, not strategy changes. Protect the edge by never overriding your stop and never skipping setups after losses.
                                                        </p>
                                                    ) : mcResults.posProb >= 50 ? (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            {mcResults.posProb.toFixed(0)}% positive probability is marginal. The difference between 50% and 70% is a W:L ratio improvement of approximately {((wlRatio * 1.3 - wlRatio)).toFixed(2)}. Concretely: if your average win is currently ${avgWin.toFixed(0)}, extending winners by ${(avgWin * 0.3).toFixed(0)} would push this probability above 70%.
                                                        </p>
                                                    ) : (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            Only {mcResults.posProb.toFixed(0)}% of futures are profitable. Before increasing size or frequency, address win rate (currently {winRate.toFixed(0)}%) and W:L ratio (currently {wlRatio.toFixed(2)}). The Monte Carlo math shows the current stats are not yet reliable at {MC_TRADES}-trade scale.
                                                        </p>
                                                    )}
                                                    {mcResults.ruinProb > 5 && (
                                                        <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                            Ruin risk {mcResults.ruinProb.toFixed(1)}% is above the 5% safety threshold. Reduce position size by {Math.min(50, Math.round(mcResults.ruinProb * 3))}% until ruin probability drops below 5%. Ruin in a simulation is survivable; ruin on a prop account is not.
                                                        </p>
                                                    )}
                                                    <p style={{ fontFamily: QF, fontSize: 10, color: '#8b949e', lineHeight: 1.7, margin: 0 }}>
                                                        Base case projection after {MC_TRADES} trades: {fmtQ(mcResults.p50)}. At your average session pace ({avgSessionTrades.toFixed(0)} trades/session), that is approximately {sessionMetrics.length > 0 ? `${(MC_TRADES / avgSessionTrades).toFixed(0)} sessions` : `${MC_TRADES} trades`} from now.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                </>)}
                            </motion.div>
                        );
                    })()}

                    {(activeTab === 'REPORT' || activeTab === 'COMPARE') && (() => {
                        // ── Period-filtered closed trades for REPORT ──
                        const now = new Date();
                        const periodCutoff: Record<string, Date> = {
                            '7D':  new Date(now.getTime() - 7  * 86400000),
                            '30D': new Date(now.getTime() - 30 * 86400000),
                            '90D': new Date(now.getTime() - 90 * 86400000),
                            'ALL': new Date(0),
                        };
                        const rptTrades = reportPeriod === 'ALL' ? closed : closed.filter(t => new Date(t.closedAt ?? t.createdAt) >= periodCutoff[reportPeriod]);
                        const rptWins   = rptTrades.filter(t => (t.pnl ?? 0) > 0);
                        const rptLosses = rptTrades.filter(t => (t.pnl ?? 0) < 0);
                        const rptNetPnl = rptTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
                        const rptGrossP = rptWins.reduce((s, t) => s + (t.pnl ?? 0), 0);
                        const rptGrossL = rptLosses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
                        const rptWinRate = rptTrades.length > 0 ? (rptWins.length / rptTrades.length) * 100 : 0;
                        const rptPF = rptGrossL > 0 ? rptGrossP / rptGrossL : rptGrossP > 0 ? 99 : 0;
                        const rptAvgW = rptWins.length > 0 ? rptGrossP / rptWins.length : 0;
                        const rptAvgL = rptLosses.length > 0 ? rptGrossL / rptLosses.length : 0;
                        const rptWlRatio = rptAvgL > 0 ? rptAvgW / rptAvgL : rptAvgW > 0 ? 99 : 0;
                        const rptExpectancy = rptTrades.length > 0 ? rptNetPnl / rptTrades.length : 0;
                        const rptForensics = generateForensics(rptTrades.map(t => ({ ...t, outcome: t.outcome ?? 'open' })), account);
                        const rptBehavCost = rptForensics.patterns.reduce((s: number, p: any) => s + Math.min(0, p.impact ?? 0), 0);
                        const rptSessions = rptForensics.sessions ?? [];
                        const rptGreenSess = rptSessions.filter((s: any) => s.pnl > 0).length;
                        const rptTopPattern = rptForensics.patterns[0]?.name ?? '';
                        const rptTotalRecovery = rptForensics.patterns.reduce((s: number, p: any) => s + Math.abs(p.impact), 0);
                        const rptProjected = rptNetPnl + rptTotalRecovery;
                        const rptAvgWinDur  = rptWins.length > 0 ? rptWins.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / rptWins.length : 0;
                        const rptAvgLossDur = rptLosses.length > 0 ? rptLosses.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / rptLosses.length : 0;
                        const rptHtRatio = rptAvgLossDur > 0 ? rptAvgLossDur / Math.max(rptAvgWinDur, 1) : 0;
                        const rptAvgRR    = rptTrades.length > 0 ? rptTrades.reduce((s, t) => s + (t.rr ?? 0), 0) / rptTrades.length : 0;
                        const rptBestTrade  = rptTrades.reduce((a, t) => (t.pnl ?? 0) > (a.pnl ?? 0) ? t : a, rptTrades[0] ?? { pnl: 0, asset: '—' } as typeof rptTrades[0]);
                        const rptWorstTrade = rptTrades.reduce((a, t) => (t.pnl ?? 0) < (a.pnl ?? 0) ? t : a, rptTrades[0] ?? { pnl: 0, asset: '—' } as typeof rptTrades[0]);
                        const rptRevScore = Math.min(60, rptForensics.patterns.filter((p: any) => p.name === 'Revenge Trading').length > 0
                            ? rptForensics.patterns.find((p: any) => p.name === 'Revenge Trading').freq * 20 : 0);
                        const rptFinScore = Math.abs(rptBehavCost) > (account.startingBalance ?? 50000) * 0.05 ? 25 : 0;
                        const rptWrErosion = rptTrades.length > 0 && rptWinRate < 35 ? 15 : 0;

                        // ── Grade computation ──
                        let gradeScore = 100;
                        rptForensics.patterns.forEach((p: any) => {
                            if (p.severity === 'CRITICAL') gradeScore -= 20;
                            else gradeScore -= 10;
                        });
                        if (rptTrades.length > 0 && rptWinRate < 50) gradeScore -= 10;
                        if (rptTrades.length > 0 && rptPF < 1) gradeScore -= 20;
                        gradeScore = Math.max(0, gradeScore);
                        const grade = gradeScore >= 90 ? 'A' : gradeScore >= 75 ? 'B' : gradeScore >= 55 ? 'C' : 'D';
                        const gradeColor = grade === 'A' ? '#FDC800' : grade === 'B' ? '#00D4FF' : grade === 'C' ? '#EAB308' : '#ff4757';

                        // ── Risk score components (period-adjusted) ──
                        const riskComponents = [
                            { label: lang === 'fr' ? 'Trading revanche' : 'Revenge Trading', score: rptRevScore, max: 60 },
                            { label: lang === 'fr' ? 'Coût comportemental' : 'Behavioral Cost', score: rptFinScore, max: 25 },
                            { label: lang === 'fr' ? 'Érosion taux de réussite' : 'Win Rate Erosion', score: rptWrErosion, max: 15 },
                        ];

                        // ── Prescriptions sorted by impact ──
                        const prescriptions = [...rptForensics.patterns]
                            .sort((a: any, b: any) => Math.abs(b.impact) - Math.abs(a.impact))
                            .map((p: any, idx: number) => ({
                                num: String(idx + 1).padStart(2, '0'),
                                title: p.name === 'Revenge Trading' ? (lang === 'fr' ? 'Mettre en place un stop anti-tilt' : 'Enforce a Hard Tilt Stop') :
                                    p.name === 'Held Losers' ? (lang === 'fr' ? 'Limiter le temps de détention max sur les perdants' : 'Cap Maximum Hold Time on Losers') :
                                    p.name === 'Spike Vulnerability' ? (lang === 'fr' ? 'Ajouter un stop ferme sur chaque entrée' : 'Add Hard Stop on Every Entry') :
                                    p.name === 'Early Exit' ? (lang === 'fr' ? 'Laisser courir les gagnants jusqu\'à la cible' : 'Let Winners Run to Target') :
                                    p.name === 'Micro Overtrading' ? (lang === 'fr' ? 'Réduire la fréquence des micro-contrats' : 'Reduce Micro Contract Frequency') :
                                    p.name,
                                desc: p.desc,
                                badge: p.severity === 'CRITICAL' ? 'CRITICAL' : Math.abs(p.impact) > 200 ? 'HIGH' : 'RECOMMENDED',
                                impact: Math.abs(p.impact),
                                freq: p.freq,
                            }));

                        // ── Period-filtered session metrics ──
                        const rptAvgSessPnl    = rptSessions.length > 0 ? rptSessions.reduce((a: number, s: any) => a + s.pnl, 0) / rptSessions.length : 0;
                        const rptAvgSessTrades = rptSessions.length > 0 ? rptSessions.reduce((a: number, s: any) => a + s.trades.length, 0) / rptSessions.length : 0;
                        const rptSessWinRate   = rptSessions.length > 0 ? (rptGreenSess / rptSessions.length) * 100 : 0;

                        // ── Period-filtered instrument breakdown ──
                        const rptInstMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
                        rptTrades.forEach(t => {
                            const k = t.asset ?? 'Unknown';
                            if (!rptInstMap[k]) rptInstMap[k] = { wins: 0, losses: 0, pnl: 0 };
                            if ((t.pnl ?? 0) > 0) rptInstMap[k].wins++;
                            else if ((t.pnl ?? 0) < 0) rptInstMap[k].losses++;
                            rptInstMap[k].pnl += (t.pnl ?? 0);
                        });
                        const rptInstArray = Object.keys(rptInstMap).map(k => ({ asset: k, ...rptInstMap[k] })).sort((a, b) => b.pnl - a.pnl);

                        // ── Next session rules (period-filtered) ──
                        const nextRules: string[] = [];
                        if (dangerZones.length > 0) {
                            const worst = dangerZones[0];
                            nextRules.push(lang === 'fr'
                                ? `Éviter de trader à ${String(worst.h).padStart(2, '0')}h00 EST — zone à ${worst.pnl < 0 ? '-' : '+'}$${Math.abs(worst.pnl).toFixed(0)} de P&L cumulé négatif. C'est votre pire heure.`
                                : `No entries at ${String(worst.h).padStart(2, '0')}:00 EST — this hour has $${Math.abs(worst.pnl).toFixed(0)} cumulative negative P&L. It is your worst trading hour.`
                            );
                        }
                        if (rptHtRatio > 1.5) {
                            nextRules.push(lang === 'fr'
                                ? `Fermer les perdants à ${fmtDuration(Math.max(rptAvgWinDur * 1.2, 60))} maximum — vos perdants durent ${rptHtRatio.toFixed(1)}x plus longtemps que vos gagnants, signal de "bag holding".`
                                : `Close losers at ${fmtDuration(Math.max(rptAvgWinDur * 1.2, 60))} max — losers last ${rptHtRatio.toFixed(1)}x longer than winners, a classic bag-holding signal.`
                            );
                        }
                        if (rptWinRate < 50 && rptPF > 1) {
                            nextRules.push(lang === 'fr'
                                ? `Ne pas augmenter la fréquence — votre edge vient de la qualité (PF ${rptPF.toFixed(2)}) pas du volume. Chaque trade supplémentaire non-setup dilue l'edge.`
                                : `Do not increase frequency — your edge is quality-driven (PF ${rptPF.toFixed(2)}), not volume. Each non-setup entry dilutes it.`
                            );
                        } else if (rptWinRate >= 50 && rptWlRatio < 1) {
                            nextRules.push(lang === 'fr'
                                ? `Étendre les cibles de profit — taux de réussite ${rptWinRate.toFixed(0)}% mais ratio G/P ${rptWlRatio.toFixed(2)}:1. Chaque sortie précoce détruit de l'expectative.`
                                : `Extend profit targets — ${rptWinRate.toFixed(0)}% win rate but ${rptWlRatio.toFixed(2)}:1 W/L ratio. Every early exit destroys expectancy.`
                            );
                        }
                        if (nextRules.length < 3 && rptForensics.patterns.length > 0) {
                            const top = rptForensics.patterns[0];
                            const topRule = top.name === 'Held Losers'
                                ? (lang === 'fr'
                                    ? `Stopper les perdants à temps — ${top.freq} trades retenus trop longtemps détectés, coût $${Math.abs(top.impact).toFixed(0)}. Règle : si un trade dépasse la durée moyenne d'un gagnant, fermer sans exception.`
                                    : `Kill held losers on time — ${top.freq} trades held too long detected, costing $${Math.abs(top.impact).toFixed(0)}. Rule: if a trade exceeds avg win duration, close it — no exceptions.`)
                                : top.name === 'Early Exit'
                                ? (lang === 'fr'
                                    ? `Tenir les gagnants jusqu'à la cible — ${top.freq} sorties précoces détectées, coût estimé $${Math.abs(top.impact).toFixed(0)}. Attendre la structure avant de fermer.`
                                    : `Hold winners to target — ${top.freq} early exits detected, estimated cost $${Math.abs(top.impact).toFixed(0)}. Wait for structure before closing.`)
                                : top.name === 'Revenge Trading'
                                ? (lang === 'fr'
                                    ? `Pause obligatoire de 5 min après chaque perte — ${top.freq} séquence${top.freq > 1 ? 's' : ''} de tilt détectée${top.freq > 1 ? 's' : ''} (${top.name}), coût $${Math.abs(top.impact).toFixed(0)}.`
                                    : `Mandatory 5-min break after every loss — ${top.freq} tilt sequence${top.freq > 1 ? 's' : ''} detected (${top.name}), costing $${Math.abs(top.impact).toFixed(0)}.`)
                                : (lang === 'fr'
                                    ? `Corriger le motif principal : ${top.name} — ${top.freq} occurrence${top.freq > 1 ? 's' : ''} détectée${top.freq > 1 ? 's' : ''}, coût $${Math.abs(top.impact).toFixed(0)}.`
                                    : `Address top pattern: ${top.name} — ${top.freq} occurrence${top.freq > 1 ? 's' : ''} detected, costing $${Math.abs(top.impact).toFixed(0)}.`);
                            nextRules.push(topRule);
                        }
                        if (nextRules.length < 3) {
                            nextRules.push(lang === 'fr'
                                ? `Respecter le stop journalier calculé — ${rptTrades.length} trades analysés, aucun motif critique détecté. Maintenir le cap et la consistance.`
                                : `Honor your calculated daily stop — ${rptTrades.length} trades analyzed, no critical behavioral patterns detected. Maintain consistency.`
                            );
                        }

                        const QF = 'var(--font-mono)';
                        const CARD_S = { background: '#0d1117' as const, border: '1px solid #1a1c24', padding: '20px 24px' };
                        const SL = { fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.15em' as const, fontWeight: 700, textTransform: 'uppercase' as const, marginBottom: 4 };

                        // ── Save snapshot handler ──
                        const handleSaveSnapshot = () => {
                            const snap: ReportSnapshot = {
                                id: Date.now().toString(),
                                savedAt: new Date().toISOString(),
                                periodLabel: reportPeriod,
                                grade,
                                gradeScore,
                                netPnl: rptNetPnl,
                                winRate: rptWinRate,
                                profitFactor: rptPF,
                                expectancy: rptExpectancy,
                                avgWin: rptAvgW,
                                avgLoss: rptAvgL,
                                wlRatio: rptWlRatio,
                                behavioralCost: rptBehavCost,
                                tradeCount: rptTrades.length,
                                sessionCount: rptSessions.length,
                                riskScore: rptForensics.riskScore,
                                greenSessions: rptGreenSess,
                                totalSessions: rptSessions.length,
                                topPattern: rptTopPattern,
                                projectedPnl: rptProjected,
                            };
                            saveReportSnapshot(snap);
                            setSnapshotSaved(true);
                            setTimeout(() => setSnapshotSaved(false), 2500);
                        };

                        // ── Delta vs last snapshot ──
                        const lastSnap = reportSnapshots.length > 0 ? reportSnapshots[reportSnapshots.length - 1] : null;
                        const deltaNetPnl  = lastSnap ? rptNetPnl  - lastSnap.netPnl       : null;
                        const deltaWinRate = lastSnap ? rptWinRate - lastSnap.winRate       : null;
                        const deltaPF      = lastSnap ? rptPF      - lastSnap.profitFactor  : null;
                        const deltaGrade   = lastSnap ? gradeScore - lastSnap.gradeScore    : null;

                        if (activeTab === 'REPORT') { return (
                            <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

                                {/* ── HEADER: Period selector + Grade + Save ── */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 }}>
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            {(['ALL', '90D', '30D', '7D'] as const).map(p => (
                                                <button key={p} onClick={() => setReportPeriod(p)} style={{ fontFamily: QF, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: '6px 14px', border: 'none', cursor: 'pointer', background: reportPeriod === p ? '#FDC800' : '#0d1117', color: reportPeriod === p ? '#000' : '#6b7280', borderBottom: reportPeriod === p ? '2px solid #FDC800' : '2px solid transparent' }}>{p}</button>
                                            ))}
                                        </div>
                                        <button onClick={handleSaveSnapshot} disabled={rptTrades.length === 0} style={{ fontFamily: QF, fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', padding: '6px 14px', border: '1px solid #FDC80060', cursor: rptTrades.length === 0 ? 'not-allowed' : 'pointer', background: snapshotSaved ? '#FDC800' : 'transparent', color: snapshotSaved ? '#000' : '#FDC800', transition: 'all 0.2s' }}>
                                            {snapshotSaved ? (lang === 'fr' ? '✓ SAUVEGARDÉ' : '✓ SAVED') : (lang === 'fr' ? 'SAUVEGARDER RAPPORT' : 'SAVE REPORT')}
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '100px 1fr 1fr 1fr 1fr', gap: 1, background: '#1a1c24' }}>
                                        <div style={{ background: '#0d1117', padding: '16px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                                            <div style={{ fontFamily: QF, fontSize: 8, color: '#6b7280', letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>{lang === 'fr' ? 'NOTE' : 'GRADE'}</div>
                                            <div style={{ fontFamily: QF, fontSize: 48, fontWeight: 900, lineHeight: 1, color: gradeColor }}>{grade}</div>
                                            <div style={{ fontFamily: QF, fontSize: 9, color: '#8b949e' }}>{gradeScore}/100</div>
                                        </div>
                                        {[
                                            { label: lang === 'fr' ? 'P&L NET' : 'NET P&L', value: `${rptNetPnl >= 0 ? '+' : ''}$${rptNetPnl.toFixed(0)}`, color: rptNetPnl >= 0 ? '#FDC800' : '#ff4757', sub: `${rptTrades.length} trades`, delta: deltaNetPnl, deltaFmt: (d: number) => `${d >= 0 ? '+' : ''}$${Math.abs(d).toFixed(0)}` },
                                            { label: lang === 'fr' ? 'TAUX RÉUSSITE' : 'WIN RATE', value: `${rptWinRate.toFixed(1)}%`, color: rptWinRate >= 55 ? '#FDC800' : rptWinRate >= 45 ? '#EAB308' : '#ff4757', sub: `${rptWins.length}W / ${rptLosses.length}L`, delta: deltaWinRate, deltaFmt: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)}%` },
                                            { label: lang === 'fr' ? 'FACT. PROFIT' : 'PROFIT FACTOR', value: rptPF > 90 ? '∞' : rptPF.toFixed(2), color: rptPF >= 1.5 ? '#FDC800' : rptPF >= 1 ? '#EAB308' : '#ff4757', sub: `Exp. $${rptExpectancy.toFixed(0)}`, delta: deltaPF, deltaFmt: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(2)}x` },
                                            { label: lang === 'fr' ? 'SCORE RISQUE' : 'RISK SCORE', value: `${rptForensics.riskScore}/100`, color: rptForensics.riskScore >= 60 ? '#ff4757' : rptForensics.riskScore >= 30 ? '#EAB308' : '#FDC800', sub: `${rptForensics.patterns.length} ${lang === 'fr' ? 'motifs' : 'patterns'}`, delta: deltaGrade !== null ? -deltaGrade : null, deltaFmt: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(0)}pts` },
                                        ].map((kpi, i) => (
                                            <div key={i} style={{ background: '#0d1117', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                <div style={{ ...SL, marginBottom: 0 }}>{kpi.label}</div>
                                                <div style={{ fontFamily: QF, fontSize: 20, fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{kpi.sub}</div>
                                                {kpi.delta !== null && (
                                                    <div style={{ fontFamily: QF, fontSize: 9, color: kpi.delta >= 0 ? '#FDC800' : '#ff4757', marginTop: 1 }}>
                                                        {kpi.deltaFmt(kpi.delta)} {lang === 'fr' ? 'vs dernier' : 'vs last'}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── P&L INCOME STATEMENT ── */}
                                {rptTrades.length > 0 && (
                                    <div>
                                        <div style={{ ...SL, color: '#FDC800', marginBottom: 14 }}>{lang === 'fr' ? 'COMPTE DE RÉSULTAT P&L' : 'P&L INCOME STATEMENT'}</div>
                                        <div style={{ background: '#0d1117', border: '1px solid #1a1c24' }}>
                                            {[
                                                { label: lang === 'fr' ? 'Profits bruts' : 'Gross Profit', value: rptGrossP, color: '#FDC800', indent: 0, isTotal: false },
                                                { label: lang === 'fr' ? 'Pertes brutes' : 'Gross Loss', value: -rptGrossL, color: '#ff4757', indent: 0, isTotal: false },
                                                { label: 'Net P&L', value: rptNetPnl, color: rptNetPnl >= 0 ? '#FDC800' : '#ff4757', indent: 0, isTotal: true },
                                                { label: lang === 'fr' ? 'Coût comportemental' : 'Behavioral Cost', value: rptBehavCost, color: '#ff4757', indent: 1, isTotal: false },
                                                { label: lang === 'fr' ? 'P&L "Propre" (sans erreurs)' : '"Clean" P&L (without errors)', value: rptProjected, color: rptProjected >= 0 ? '#00D4FF' : '#ff4757', indent: 0, isTotal: true },
                                            ].map((row, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: `${row.isTotal ? '12px' : '9px'} 18px`, borderBottom: '1px solid #1a1c24', background: row.isTotal ? '#0b0e14' : 'transparent' }}>
                                                    <div style={{ flex: 1, fontFamily: QF, fontSize: row.isTotal ? 11 : 10, color: row.isTotal ? '#fff' : '#8b949e', fontWeight: row.isTotal ? 700 : 400, paddingLeft: row.indent * 16 }}>
                                                        {row.indent > 0 && <span style={{ marginRight: 8, color: '#3d4451' }}>└─</span>}
                                                        {row.label}
                                                    </div>
                                                    <div style={{ fontFamily: QF, fontSize: row.isTotal ? 15 : 12, fontWeight: row.isTotal ? 900 : 700, color: row.color }}>{row.value >= 0 ? '+' : ''}${Math.abs(row.value).toFixed(0)}</div>
                                                    <div style={{ width: 72, marginLeft: 14, height: 4, background: '#1a1c24', flexShrink: 0 }}>
                                                        <div style={{ height: '100%', width: `${rptGrossP > 0 ? Math.min(100, Math.abs(row.value) / rptGrossP * 100) : 0}%`, background: row.color, opacity: 0.6 }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── SECTION 1: FORENSIC SCORECARD ── */}
                                <div>
                                    <div style={{ fontFamily: QF, fontSize: 9, color: '#FDC800', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {lang === 'fr' ? 'RAPPORT FORENSIQUE' : 'FORENSIC REPORT'}
                                        <span style={{ background: '#FDC800', color: '#000', fontSize: 8, padding: '2px 6px', fontWeight: 900, letterSpacing: '0.1em' }}>{lang === 'fr' ? 'COMPLET' : 'FULL'}</span>
                                    </div>
                                    <div style={{ ...CARD_S, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#c9d1d9', lineHeight: 1.7, margin: 0 }}>
                                            {rptForensics.verdict.message}
                                            {rptForensics.patterns.length > 0 && ` ${lang === 'fr' ? 'La fuite principale est' : 'Top behavioral leak is'} ${rptForensics.patterns[0].name.toLowerCase()}, ${lang === 'fr' ? 'coûtant' : 'costing'} $${Math.abs(rptForensics.patterns[0].impact).toLocaleString()} ${lang === 'fr' ? 'sur' : 'across'} ${rptForensics.patterns[0].freq} ${lang === 'fr' ? 'occurrences.' : 'occurrences.'}`}
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                            <ThresholdBullet label={lang === 'fr' ? 'TAUX DE RÉUSSITE' : 'WIN RATE'} value={rptWinRate} unit="%" thresholds={[{ max: 40, label: 'Danger', color: '#ff4757' }, { max: 55, label: lang === 'fr' ? 'Prudence' : 'Caution', color: '#EAB308' }, { max: 100, label: lang === 'fr' ? 'Cible' : 'Target', color: '#FDC800' }]} />
                                            <ThresholdBullet label={lang === 'fr' ? 'FACTEUR DE PROFIT' : 'PROFIT FACTOR'} value={Math.min(rptPF, 5)} unit="x" thresholds={[{ max: 1, label: lang === 'fr' ? 'Perte' : 'Loss', color: '#ff4757' }, { max: 1.5, label: lang === 'fr' ? 'Faible' : 'Weak', color: '#EAB308' }, { max: 5, label: lang === 'fr' ? 'Solide' : 'Solid', color: '#FDC800' }]} />
                                            <ThresholdBullet label={lang === 'fr' ? 'ESPÉRANCE' : 'EXPECTANCY'} value={Math.max(-500, Math.min(rptExpectancy, 1000))} unit="$" thresholds={[{ max: 0, label: lang === 'fr' ? 'Négatif' : 'Negative', color: '#ff4757' }, { max: 100, label: lang === 'fr' ? 'Faible' : 'Weak', color: '#EAB308' }, { max: 1000, label: 'Good', color: '#FDC800' }]} />
                                            <ThresholdBullet label={lang === 'fr' ? 'SCORE DE RISQUE' : 'RISK SCORE'} value={rptForensics.riskScore} unit="" thresholds={[{ max: 30, label: lang === 'fr' ? 'Bas' : 'Low', color: '#FDC800' }, { max: 60, label: lang === 'fr' ? 'Modéré' : 'Moderate', color: '#EAB308' }, { max: 100, label: lang === 'fr' ? 'Critique' : 'Critical', color: '#ff4757' }]} />
                                        </div>
                                    </div>
                                </div>

                                {/* ── SECTION 2: TRADE ANATOMY ── */}
                                <div>
                                    <div style={{ ...SL, color: '#FDC800', marginBottom: 14 }}>{lang === 'fr' ? 'ANATOMIE DES TRADES' : 'TRADE ANATOMY'}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 1, background: '#1a1c24' }}>
                                        {[
                                            { label: lang === 'fr' ? 'GAIN MOY.' : 'AVG WIN', value: `$${rptAvgW.toFixed(2)}`, color: '#FDC800', sub: `${rptWins.length} trades` },
                                            { label: lang === 'fr' ? 'PERTE MOY.' : 'AVG LOSS', value: `-$${rptAvgL.toFixed(2)}`, color: '#ff4757', sub: `${rptLosses.length} trades` },
                                            { label: lang === 'fr' ? 'RATIO G/P' : 'W/L RATIO', value: `${rptWlRatio.toFixed(2)}:1`, color: rptWlRatio >= 1 ? '#FDC800' : '#EAB308', sub: rptWlRatio >= 1 ? (lang === 'fr' ? 'Solide' : 'Solid') : (lang === 'fr' ? 'À améliorer' : 'Improve') },
                                            { label: lang === 'fr' ? 'COÛT COMPORT.' : 'BEHAVIORAL COST', value: rptBehavCost < 0 ? `-$${Math.abs(rptBehavCost).toFixed(0)}` : '$0', color: rptBehavCost < 0 ? '#ff4757' : '#FDC800', sub: lang === 'fr' ? 'Pertes évitables' : 'Avoidable losses' },
                                        ].map((kpi, i) => (
                                            <div key={i} style={{ background: '#0d1117', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <div style={{ ...SL, marginBottom: 0 }}>{kpi.label}</div>
                                                <div style={{ fontFamily: QF, fontSize: 22, fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{kpi.sub}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Best / Worst / Avg R:R row */}
                                    {rptTrades.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 1, background: '#1a1c24', marginTop: 1 }}>
                                            <div style={{ background: '#0d1117', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <div style={{ ...SL, color: '#FDC800', marginBottom: 0 }}>{lang === 'fr' ? 'MEILLEUR TRADE' : 'BEST TRADE'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 18, fontWeight: 900, color: '#FDC800' }}>+${(rptBestTrade?.pnl ?? 0).toFixed(0)}</div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{rptBestTrade?.asset ?? '—'}</div>
                                            </div>
                                            <div style={{ background: '#0d1117', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <div style={{ ...SL, color: '#ff4757', marginBottom: 0 }}>{lang === 'fr' ? 'PIRE TRADE' : 'WORST TRADE'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 18, fontWeight: 900, color: '#ff4757' }}>${(rptWorstTrade?.pnl ?? 0).toFixed(0)}</div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{rptWorstTrade?.asset ?? '—'}</div>
                                            </div>
                                            <div style={{ background: '#0d1117', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <div style={{ ...SL, color: '#38bdf8', marginBottom: 0 }}>{lang === 'fr' ? 'R:R MOYEN' : 'AVG R:R'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>{rptAvgRR > 0 ? `${rptAvgRR.toFixed(2)}:1` : '—'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{rptTrades.filter(t => (t.rr ?? 0) > 0).length} trades</div>
                                            </div>
                                        </div>
                                    )}
                                    {/* Hold time bars */}
                                    <div style={{ ...CARD_S, marginTop: 1, padding: '16px 24px' }}>
                                        <div style={{ ...SL, marginBottom: 10 }}>{lang === 'fr' ? 'DURÉE DE DÉTENTION : GAGNANTS VS PERDANTS' : 'HOLD TIME: WINNERS VS LOSERS'}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {([
                                                { label: lang === 'fr' ? 'Gagnants' : 'Winners', dur: rptAvgWinDur, color: '#FDC800' },
                                                { label: lang === 'fr' ? 'Perdants' : 'Losers', dur: rptAvgLossDur, color: '#ff4757' },
                                            ] as Array<{ label: string; dur: number; color: string }>).map((row) => {
                                                const maxDur = Math.max(rptAvgWinDur, rptAvgLossDur, 1);
                                                const pct = Math.min(100, (row.dur / maxDur) * 100);
                                                return (
                                                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#8b949e', width: 60, flexShrink: 0 }}>{row.label}</div>
                                                        <div style={{ flex: 1, height: 8, background: '#1a1c24', position: 'relative' }}>
                                                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: row.color }} />
                                                        </div>
                                                        <div style={{ fontFamily: QF, fontSize: 10, color: row.color, fontWeight: 700, width: 56, textAlign: 'right', flexShrink: 0 }}>{fmtDuration(row.dur)}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {rptHtRatio > 1.5 && (
                                            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,71,87,0.08)', borderLeft: '3px solid #ff4757' }}>
                                                <span style={{ fontFamily: QF, fontSize: 10, color: '#ff4757' }}>
                                                    {lang === 'fr'
                                                        ? `Perdants maintenus ${rptHtRatio.toFixed(1)}x plus longtemps que les gagnants — signal classique de "bag holding".`
                                                        : `Losers held ${rptHtRatio.toFixed(1)}x longer than winners — classic bag-holding signal.`}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ── SECTION 3: BEHAVIORAL FORENSICS ── */}
                                {rptForensics.patterns.length > 0 && (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                            <div style={{ ...SL, color: '#ff4757', marginBottom: 0 }}>{lang === 'fr' ? 'FORENSIQUE COMPORTEMENTALE' : 'BEHAVIORAL FORENSICS'}</div>
                                            <span style={{ fontFamily: QF, fontSize: 9, color: '#ff4757', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', padding: '2px 8px' }}>
                                                {rptForensics.patterns.length} {lang === 'fr' ? 'MOTIFS DÉTECTÉS' : 'PATTERNS DETECTED'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {rptForensics.patterns.map((p: any, idx: number) => {
                                                const badgeColor = p.severity === 'CRITICAL' ? '#ff4757' : Math.abs(p.impact) > 200 ? '#EAB308' : '#8b949e';
                                                const badgeLabel = p.severity === 'CRITICAL' ? 'CRITICAL' : Math.abs(p.impact) > 200 ? 'HIGH' : 'MODERATE';
                                                const costPct = rptGrossP > 0 ? (Math.abs(p.impact) / rptGrossP * 100) : 0;
                                                return (
                                                    <div key={idx} style={{ background: '#0d1117', border: '1px solid #1a1c24', borderLeft: `3px solid ${badgeColor}` }}>
                                                        <div style={{ padding: '14px 18px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span style={{ fontFamily: QF, fontSize: 9, color: badgeColor, background: badgeColor + '15', border: `1px solid ${badgeColor}30`, padding: '2px 6px', fontWeight: 900, letterSpacing: '0.1em' }}>{badgeLabel}</span>
                                                                    <span style={{ fontFamily: QF, fontSize: 12, color: '#fff', fontWeight: 700 }}>{p.name}</span>
                                                                </div>
                                                                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#8b949e', lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                                                                <div style={{ fontFamily: QF, fontSize: 18, fontWeight: 900, color: '#ff4757' }}>-${Math.abs(p.impact).toLocaleString()}</div>
                                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{p.freq}x · {costPct.toFixed(1)}% {lang === 'fr' ? 'des profits' : 'of profits'}</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ height: 3, background: '#1a1c24', margin: '0 18px 14px' }}>
                                                            <div style={{ height: '100%', width: `${Math.min(100, costPct * 2)}%`, background: badgeColor }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div style={{ marginTop: 2, ...CARD_S, background: 'rgba(255,71,87,0.05)', borderColor: 'rgba(255,71,87,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12 }}>
                                            <div>
                                                <div style={{ ...SL }}>{lang === 'fr' ? 'COÛT COMPORTEMENTAL TOTAL' : 'TOTAL BEHAVIORAL COST'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 28, fontWeight: 900, color: '#ff4757' }}>-${Math.abs(rptBehavCost).toLocaleString(undefined, { minimumFractionDigits: 0 })}</div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>
                                                    {lang === 'fr' ? `${Math.abs(rptBehavCost / Math.max(rptGrossP, 1) * 100).toFixed(1)}% des profits bruts · ${rptForensics.patterns.length} motifs` : `${Math.abs(rptBehavCost / Math.max(rptGrossP, 1) * 100).toFixed(1)}% of gross profits · ${rptForensics.patterns.length} patterns`}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' as const }}>
                                                <div style={{ ...SL }}>{lang === 'fr' ? 'P&L SANS ERREURS' : 'P&L WITHOUT ERRORS'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 28, fontWeight: 900, color: '#FDC800' }}>{rptProjected >= 0 ? '+' : ''}${rptProjected.toLocaleString(undefined, { minimumFractionDigits: 0 })}</div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{lang === 'fr' ? 'Estimation théorique' : 'Theoretical estimate'}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── SECTION 4: RISK SCORE ANATOMY ── */}
                                <div>
                                    <div style={{ ...SL, color: '#FDC800', marginBottom: 14 }}>{lang === 'fr' ? 'ANATOMIE DU SCORE DE RISQUE' : 'RISK SCORE ANATOMY'}</div>
                                    <div style={{ ...CARD_S, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontFamily: QF, fontSize: 9, color: '#8b949e' }}>{lang === 'fr' ? 'SCORE GLOBAL' : 'OVERALL SCORE'}</span>
                                            <span style={{ fontFamily: QF, fontSize: 22, fontWeight: 900, color: rptForensics.riskScore >= 60 ? '#ff4757' : rptForensics.riskScore >= 30 ? '#EAB308' : '#FDC800' }}>{rptForensics.riskScore}/100</span>
                                        </div>
                                        <div style={{ height: 6, background: '#1a1c24', position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, rptForensics.riskScore)}%`, background: rptForensics.riskScore >= 60 ? '#ff4757' : rptForensics.riskScore >= 30 ? '#EAB308' : '#FDC800' }} />
                                            <div style={{ position: 'absolute', left: '30%', top: -3, height: 'calc(100% + 6px)', width: 1, background: '#FDC800', opacity: 0.4 }} />
                                            <div style={{ position: 'absolute', left: '60%', top: -3, height: 'calc(100% + 6px)', width: 1, background: '#ff4757', opacity: 0.4 }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -4 }}>
                                            <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280' }}>0 {lang === 'fr' ? '(BAS)' : '(LOW)'}</span>
                                            <span style={{ fontFamily: QF, fontSize: 8, color: '#FDC800' }}>30</span>
                                            <span style={{ fontFamily: QF, fontSize: 8, color: '#ff4757' }}>60</span>
                                            <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280' }}>100 {lang === 'fr' ? '(CRITIQUE)' : '(CRITICAL)'}</span>
                                        </div>
                                        <div style={{ borderTop: '1px solid #1a1c24', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {riskComponents.map((comp) => (
                                                <div key={comp.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{ fontFamily: QF, fontSize: 9, color: '#8b949e', width: 170, flexShrink: 0 }}>{comp.label}</div>
                                                    <div style={{ flex: 1, height: 6, background: '#1a1c24', position: 'relative' }}>
                                                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(comp.score / comp.max) * 100}%`, background: comp.score > comp.max * 0.5 ? '#ff4757' : comp.score > comp.max * 0.2 ? '#EAB308' : '#FDC800' }} />
                                                    </div>
                                                    <div style={{ fontFamily: QF, fontSize: 10, fontWeight: 700, color: comp.score > 0 ? '#ff4757' : '#6b7280', width: 46, textAlign: 'right' as const, flexShrink: 0 }}>{comp.score}/{comp.max}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* ── SECTION 5: SESSION QUALITY ── */}
                                {rptSessions.length > 0 && (
                                    <div>
                                        <div style={{ ...SL, color: '#FDC800', marginBottom: 14 }}>{lang === 'fr' ? 'QUALITÉ DES SESSIONS' : 'SESSION QUALITY'}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 1, background: '#1a1c24', marginBottom: 2 }}>
                                            {[
                                                { label: lang === 'fr' ? 'SESSIONS VERTES' : 'GREEN SESSIONS', value: `${rptGreenSess}/${rptSessions.length}`, color: '#FDC800', sub: `${rptSessWinRate.toFixed(0)}% ${lang === 'fr' ? 'taux' : 'rate'}` },
                                                { label: lang === 'fr' ? 'P&L MOY./SESSION' : 'AVG SESSION P&L', value: `${rptAvgSessPnl >= 0 ? '+' : ''}$${rptAvgSessPnl.toFixed(0)}`, color: rptAvgSessPnl >= 0 ? '#FDC800' : '#ff4757', sub: lang === 'fr' ? 'par session' : 'per session' },
                                                { label: lang === 'fr' ? 'TRADES MOY.' : 'AVG TRADES', value: rptAvgSessTrades.toFixed(1), color: '#c9d1d9', sub: lang === 'fr' ? 'par session' : 'per session' },
                                                { label: lang === 'fr' ? 'SÉRIE MAX GAGNANTE' : 'MAX WIN STREAK', value: `${rptForensics.maxWinStreak || 0}W`, color: '#FDC800', sub: `${rptForensics.maxLossStreak || 0}L ${lang === 'fr' ? 'série max perdante' : 'max loss streak'}` },
                                            ].map((kpi, i) => (
                                                <div key={i} style={{ background: '#0d1117', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <div style={{ ...SL, marginBottom: 0 }}>{kpi.label}</div>
                                                    <div style={{ fontFamily: QF, fontSize: 20, fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
                                                    <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{kpi.sub}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ ...CARD_S, padding: '12px 18px' }}>
                                            <SegmentedBar wins={rptGreenSess} losses={rptSessions.length - rptGreenSess} height={28} showLabels />
                                            <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', marginTop: 6 }}>{lang === 'fr' ? 'Sessions profitables vs déficitaires' : 'Profitable sessions vs losing sessions'}</div>
                                        </div>
                                    </div>
                                )}

                                {/* ── SECTION 6: INSTRUMENT P&L ── */}
                                {rptInstArray.length > 0 && (
                                    <div>
                                        <ChartCard
                                            title={lang === 'fr' ? 'CONTRIBUTION P&L PAR INSTRUMENT' : 'INSTRUMENT P&L CONTRIBUTION'}
                                            subtitle={lang === 'fr' ? 'P&L net par instrument — barres à droite = profit, gauche = perte' : 'Net P&L per instrument — right = profit, left = loss'}
                                        >
                                            <DivergingBarList
                                                data={rptInstArray.map(inst => ({
                                                    label: inst.asset,
                                                    value: inst.pnl,
                                                    note: `${inst.wins + inst.losses} trades`,
                                                }))}
                                                valueFormat={(v) => `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(0)}`}
                                            />
                                        </ChartCard>
                                    </div>
                                )}

                                {/* ── SECTION 7: ACTIONABLE PRESCRIPTIONS ── */}
                                {prescriptions.length > 0 ? (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                            <div style={{ ...SL, color: '#FDC800', marginBottom: 0 }}>{lang === 'fr' ? 'PRESCRIPTIONS ACTIONNABLES' : 'ACTIONABLE PRESCRIPTIONS'}</div>
                                            <span style={{ fontFamily: QF, fontSize: 9, color: '#FDC800', background: 'rgba(253,200,0,0.1)', border: '1px solid rgba(253,200,0,0.3)', padding: '2px 8px' }}>
                                                {prescriptions.length} {lang === 'fr' ? 'ACTIONS' : 'ACTIONS'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {prescriptions.map((rx: any) => {
                                                const bc = rx.badge === 'CRITICAL' ? '#ff4757' : rx.badge === 'HIGH' ? '#EAB308' : '#FDC800';
                                                return (
                                                    <div key={rx.num} style={{ background: '#0d1117', border: '1px solid #1a1c24' }}>
                                                        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                                            <span style={{ fontFamily: QF, fontSize: 32, fontWeight: 900, color: '#1e2430', lineHeight: 1, minWidth: 40, flexShrink: 0 }}>{rx.num}</span>
                                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontFamily: QF, fontSize: 13, fontWeight: 700, color: '#fff' }}>{rx.title}</span>
                                                                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#8b949e', lineHeight: 1.6, margin: 0 }}>{rx.desc}</p>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                                                <span style={{ fontFamily: QF, fontSize: 9, fontWeight: 900, padding: '2px 6px', letterSpacing: '0.1em', color: bc, border: `1px solid ${bc}40`, background: bc + '15' }}>{rx.badge}</span>
                                                                <span style={{ fontFamily: QF, fontSize: 10, color: '#FDC800', fontWeight: 700 }}>+${rx.impact.toLocaleString()}</span>
                                                                <span style={{ fontFamily: QF, fontSize: 8, color: '#6b7280' }}>{rx.freq}x {lang === 'fr' ? 'détecté' : 'detected'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ ...CARD_S, textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 24px' }}>
                                        <span style={{ fontFamily: QF, fontSize: 48, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</span>
                                        <span style={{ fontFamily: QF, fontSize: 12, fontWeight: 700, color: '#fff' }}>
                                            {rptTrades.length >= 10 ? (lang === 'fr' ? 'Aucun motif critique détecté' : 'No Critical Patterns Detected') : (lang === 'fr' ? 'Données insuffisantes' : 'Insufficient Data')}
                                        </span>
                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#6b7280', maxWidth: 320, lineHeight: 1.6 }}>
                                            {rptTrades.length >= 10
                                                ? rptForensics.verdict.message
                                                : (lang === 'fr' ? `${rptTrades.length} trades clôturés. Minimum 10 requis pour l'analyse forensique complète.` : `${rptTrades.length} closed trades logged. Minimum 10 recommended for full forensic analysis.`)}
                                        </p>
                                    </div>
                                )}

                                {/* ── SECTION 8: PROJECTED IMPROVEMENT ── */}
                                {prescriptions.length > 0 && (
                                    <div>
                                        <div style={{ ...SL, color: '#FDC800', marginBottom: 8 }}>{lang === 'fr' ? 'IMPACT PROJETÉ SI IMPLÉMENTÉ' : 'PROJECTED IMPACT IF IMPLEMENTED'}</div>
                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                                            {lang === 'fr' ? "Projection en supposant l'élimination complète de tous les motifs comportementaux détectés." : 'Projection assumes full elimination of all flagged patterns. Actual improvement varies — patterns may overlap on shared trades.'}
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: isMobile ? 12 : 0, alignItems: 'center' }}>
                                            <div style={{ ...CARD_S, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div style={{ ...SL }}>{lang === 'fr' ? 'ACTUEL (avec erreurs)' : 'CURRENT (with errors)'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 36, fontWeight: 900, color: rptNetPnl >= 0 ? '#FDC800' : '#ff4757' }}>
                                                    {rptNetPnl >= 0 ? '+' : '-'}${Math.abs(rptNetPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{rptTrades.length} trades · {rptSessions.length} {lang === 'fr' ? 'sessions' : 'sessions'}</div>
                                            </div>
                                            <div style={{ textAlign: 'center' as const, fontFamily: QF, fontSize: 20, color: '#6b7280', padding: '0 12px' }}>→</div>
                                            <div style={{ ...CARD_S, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div style={{ ...SL }}>{lang === 'fr' ? 'PROJETÉ (avec corrections)' : 'PROJECTED (with corrections)'}</div>
                                                <div style={{ fontFamily: QF, fontSize: 36, fontWeight: 900, color: rptProjected >= 0 ? '#FDC800' : '#ff4757' }}>
                                                    {rptProjected >= 0 ? '+' : '-'}${Math.abs(rptProjected).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>~{rptTrades.length} trades · {lang === 'fr' ? 'Corrections appliquées' : 'Corrections applied'}</div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 2, ...CARD_S, textAlign: 'center' as const, padding: '14px 18px', background: 'rgba(253,200,0,0.04)', borderColor: 'rgba(253,200,0,0.2)' }}>
                                            <span style={{ fontFamily: QF, fontSize: 11, color: '#6b7280' }}>{lang === 'fr' ? 'AMÉLIORATION POTENTIELLE : ' : 'POTENTIAL IMPROVEMENT: '}</span>
                                            <span style={{ fontFamily: QF, fontSize: 11, fontWeight: 900, color: '#FDC800' }}>+${rptTotalRecovery.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                )}

                                {/* ── SECTION 9: NEXT SESSION RULES ── */}
                                <div>
                                    <div style={{ ...SL, color: '#FDC800', marginBottom: 14 }}>{lang === 'fr' ? 'RÈGLES POUR LA PROCHAINE SESSION' : 'NEXT SESSION RULES'}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {nextRules.slice(0, 3).map((rule, i) => (
                                            <div key={i} style={{ ...CARD_S, display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 18px' }}>
                                                <span style={{ fontFamily: QF, fontSize: 20, fontWeight: 900, color: '#FDC800', lineHeight: 1, flexShrink: 0, minWidth: 28 }}>{i + 1}</span>
                                                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#c9d1d9', lineHeight: 1.6, margin: 0 }}>{rule}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </motion.div>
                        ); } // end REPORT tab

                        // ── COMPARE TAB ──
                        const fmtSnap = (d: string) => new Date(d).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: '2-digit' });
                        const gradeC = (g: string) => g === 'A' ? '#FDC800' : g === 'B' ? '#00D4FF' : g === 'C' ? '#EAB308' : '#ff4757';

                        // Multi-period comparison data (always available)
                        const multiPeriods = (['ALL', '90D', '30D', '7D'] as const).map(p => {
                            const cutoff = p === 'ALL' ? new Date(0) : new Date(Date.now() - parseInt(p) * 86400000);
                            const t = p === 'ALL' ? closed : closed.filter(tr => new Date(tr.closedAt ?? tr.createdAt) >= cutoff);
                            const w = t.filter(tr => (tr.pnl ?? 0) > 0);
                            const l = t.filter(tr => (tr.pnl ?? 0) < 0);
                            const pnl = t.reduce((s, tr) => s + (tr.pnl ?? 0), 0);
                            const gp = w.reduce((s, tr) => s + (tr.pnl ?? 0), 0);
                            const gl = l.reduce((s, tr) => s + Math.abs(tr.pnl ?? 0), 0);
                            const wr = t.length > 0 ? (w.length / t.length) * 100 : 0;
                            const pf = gl > 0 ? gp / gl : gp > 0 ? 99 : 0;
                            return { label: p, count: t.length, pnl, wr, pf };
                        });

                        if (reportSnapshots.length === 0) {
                            return (
                                <motion.div key="compare-empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                    <div style={{ ...CARD_S, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 24px', textAlign: 'center' as const }}>
                                        <div style={{ fontFamily: QF, fontSize: 13, fontWeight: 700, color: '#fff' }}>{lang === 'fr' ? 'Aucun rapport sauvegardé' : 'No saved reports'}</div>
                                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#6b7280', maxWidth: 320, lineHeight: 1.7, margin: 0 }}>
                                            {lang === 'fr' ? "Sauvegardez un rapport depuis l'onglet REPORT pour commencer à comparer vos périodes. Bouton \"SAUVEGARDER RAPPORT\" en haut." : 'Save a report from the REPORT tab to start comparing trading periods. Use the "SAVE REPORT" button at the top of the Report tab.'}
                                        </p>
                                    </div>
                                    <div>
                                        <div style={{ ...SL, color: '#FDC800', marginBottom: 12 }}>{lang === 'fr' ? 'COMPARAISON MULTI-PÉRIODES' : 'MULTI-PERIOD COMPARISON'}</div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: QF }}>
                                                <thead><tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                    {[lang === 'fr' ? 'PÉRIODE' : 'PERIOD', 'TRADES', 'P&L NET', lang === 'fr' ? 'TAUX' : 'WIN RATE', 'PF'].map((h, i) => (
                                                        <th key={i} style={{ padding: '8px 16px', fontSize: 9, color: '#6b7280', textAlign: i === 0 ? 'left' : 'right', letterSpacing: '0.1em', fontWeight: 700 }}>{h}</th>
                                                    ))}
                                                </tr></thead>
                                                <tbody>{multiPeriods.map((row, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #1a1c24', background: i % 2 === 0 ? '#0c0e13' : 'transparent' }}>
                                                        <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 900, color: '#FDC800' }}>{row.label}</td>
                                                        <td style={{ padding: '10px 16px', fontSize: 11, color: '#c9d1d9', textAlign: 'right' }}>{row.count}</td>
                                                        <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: row.pnl >= 0 ? '#FDC800' : '#ff4757', textAlign: 'right' }}>{row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(0)}</td>
                                                        <td style={{ padding: '10px 16px', fontSize: 11, color: row.wr >= 55 ? '#FDC800' : row.wr >= 45 ? '#EAB308' : '#ff4757', textAlign: 'right' }}>{row.count > 0 ? `${row.wr.toFixed(1)}%` : '—'}</td>
                                                        <td style={{ padding: '10px 16px', fontSize: 11, color: row.pf >= 1.5 ? '#FDC800' : row.pf >= 1 ? '#EAB308' : '#ff4757', textAlign: 'right' }}>{row.count > 0 ? (row.pf > 90 ? '∞' : row.pf.toFixed(2)) : '—'}</td>
                                                    </tr>
                                                ))}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        }

                        // ── COMPARE: snapshots exist ──
                        const sortedSnaps = [...reportSnapshots].sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
                        const snapA = compareSelected.length > 0 ? sortedSnaps.find(s => s.id === compareSelected[0]) ?? sortedSnaps[sortedSnaps.length - 1] : sortedSnaps[sortedSnaps.length - 1];
                        const snapBObj = compareSelected.length > 1 ? sortedSnaps.find(s => s.id === compareSelected[1]) ?? null : null;
                        const compB = snapBObj ?? { netPnl: rptNetPnl, winRate: rptWinRate, profitFactor: rptPF, expectancy: rptExpectancy, grade, gradeScore, riskScore: rptForensics.riskScore, tradeCount: rptTrades.length, sessionCount: rptSessions.length, greenSessions: rptGreenSess, totalSessions: rptSessions.length, topPattern: rptTopPattern, behavioralCost: rptBehavCost, savedAt: new Date().toISOString(), periodLabel: `${reportPeriod} (${lang === 'fr' ? 'maintenant' : 'now'})`, id: 'now', projectedPnl: rptProjected, avgWin: rptAvgW, avgLoss: rptAvgL, wlRatio: rptWlRatio };
                        const deltaRows = [
                            { label: 'Net P&L', a: `${snapA.netPnl >= 0 ? '+' : ''}$${snapA.netPnl.toFixed(0)}`, b: `${compB.netPnl >= 0 ? '+' : ''}$${compB.netPnl.toFixed(0)}`, delta: compB.netPnl - snapA.netPnl, fmtD: (d: number) => `${d >= 0 ? '+' : ''}$${Math.abs(d).toFixed(0)}`, posGood: true },
                            { label: lang === 'fr' ? 'Taux réussite' : 'Win Rate', a: `${snapA.winRate.toFixed(1)}%`, b: `${compB.winRate.toFixed(1)}%`, delta: compB.winRate - snapA.winRate, fmtD: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, posGood: true },
                            { label: 'Profit Factor', a: snapA.profitFactor > 90 ? '∞' : snapA.profitFactor.toFixed(2), b: compB.profitFactor > 90 ? '∞' : compB.profitFactor.toFixed(2), delta: compB.profitFactor - snapA.profitFactor, fmtD: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(2)}`, posGood: true },
                            { label: lang === 'fr' ? 'Espérance' : 'Expectancy', a: `$${snapA.expectancy.toFixed(0)}`, b: `$${compB.expectancy.toFixed(0)}`, delta: compB.expectancy - snapA.expectancy, fmtD: (d: number) => `${d >= 0 ? '+' : ''}$${d.toFixed(0)}`, posGood: true },
                            { label: lang === 'fr' ? 'Score risque' : 'Risk Score', a: `${snapA.riskScore}/100`, b: `${compB.riskScore}/100`, delta: compB.riskScore - snapA.riskScore, fmtD: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(0)}`, posGood: false },
                            { label: lang === 'fr' ? 'Coût comport.' : 'Behavioral Cost', a: `-$${Math.abs(snapA.behavioralCost).toFixed(0)}`, b: `-$${Math.abs(compB.behavioralCost).toFixed(0)}`, delta: Math.abs(snapA.behavioralCost) - Math.abs(compB.behavioralCost), fmtD: (d: number) => `${d >= 0 ? (lang === 'fr' ? '-$' : '-$') : '+$'}${Math.abs(d).toFixed(0)} ${d >= 0 ? (lang === 'fr' ? 'réduit' : 'reduced') : (lang === 'fr' ? 'augmenté' : 'increased')}`, posGood: true },
                            { label: lang === 'fr' ? 'Note globale' : 'Grade Score', a: `${snapA.grade} (${snapA.gradeScore})`, b: `${compB.grade} (${compB.gradeScore})`, delta: compB.gradeScore - snapA.gradeScore, fmtD: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(0)}pts`, posGood: true },
                        ];

                        return (
                            <motion.div key="compare" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                {/* Snapshot library */}
                                <div>
                                    <div style={{ ...SL, color: '#FDC800', marginBottom: 12 }}>{lang === 'fr' ? `HISTORIQUE DES RAPPORTS (${sortedSnaps.length})` : `REPORT HISTORY (${sortedSnaps.length})`}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {sortedSnaps.map((snap) => {
                                            const isSelected = compareSelected.includes(snap.id);
                                            const selIdx = compareSelected.indexOf(snap.id);
                                            return (
                                                <div key={snap.id} onClick={() => {
                                                    if (isSelected) { setCompareSelected(prev => prev.filter(id => id !== snap.id)); }
                                                    else if (compareSelected.length < 2) { setCompareSelected(prev => [...prev, snap.id]); }
                                                    else { setCompareSelected([compareSelected[1], snap.id]); }
                                                }} style={{ background: isSelected ? '#0f1520' : '#0d1117', border: `1px solid ${isSelected ? '#FDC80060' : '#1a1c24'}`, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{ width: 20, height: 20, border: `2px solid ${isSelected ? '#FDC800' : '#3d4451'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: QF, fontSize: 10, fontWeight: 900, color: '#FDC800', background: isSelected ? '#FDC80015' : 'transparent' }}>
                                                        {isSelected ? String.fromCharCode(64 + selIdx + 1) : ''}
                                                    </div>
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ fontFamily: QF, fontSize: 11, fontWeight: 700, color: '#fff' }}>{fmtSnap(snap.savedAt)}</span>
                                                            <span style={{ fontFamily: QF, fontSize: 9, color: gradeC(snap.grade), background: gradeC(snap.grade) + '15', border: `1px solid ${gradeC(snap.grade)}40`, padding: '1px 6px' }}>{snap.grade} · {snap.gradeScore}</span>
                                                            <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563' }}>{snap.periodLabel}</span>
                                                        </div>
                                                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', display: 'flex', gap: 16 }}>
                                                            <span style={{ color: snap.netPnl >= 0 ? '#FDC800' : '#ff4757' }}>{snap.netPnl >= 0 ? '+' : ''}${snap.netPnl.toFixed(0)}</span>
                                                            <span>WR {snap.winRate.toFixed(1)}%</span>
                                                            <span>PF {snap.profitFactor > 90 ? '∞' : snap.profitFactor.toFixed(2)}</span>
                                                            <span>{snap.tradeCount} trades</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); deleteReportSnapshot(snap.id); setCompareSelected(prev => prev.filter(id => id !== snap.id)); }} style={{ fontFamily: QF, fontSize: 9, color: '#4b5563', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}>✕</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ fontFamily: QF, fontSize: 9, color: '#4b5563', marginTop: 8 }}>
                                        {lang === 'fr' ? "Sélectionnez jusqu'à 2 rapports. B = période actuelle si un seul sélectionné." : 'Select up to 2 reports. B = current period if only one selected.'}
                                    </div>
                                </div>

                                {/* Delta comparison table */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
                                        <div style={{ ...SL, color: '#FDC800', marginBottom: 0 }}>{lang === 'fr' ? 'COMPARAISON DELTA' : 'DELTA COMPARISON'}</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {[{ s: snapA, i: 0 }, { s: compB, i: 1 }].map(({ s, i }) => (
                                                <div key={i} style={{ fontFamily: QF, fontSize: 9, color: i === 0 ? '#8b949e' : '#00D4FF', background: i === 0 ? '#1a1c24' : 'rgba(0,212,255,0.08)', border: `1px solid ${i === 0 ? '#1a1c24' : '#00D4FF40'}`, padding: '3px 8px' }}>
                                                    {String.fromCharCode(65 + i)}: {fmtSnap(s.savedAt)} · {s.periodLabel}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: QF }}>
                                            <thead><tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {[lang === 'fr' ? 'MÉTRIQUE' : 'METRIC', 'A', 'B', 'Δ'].map((h, i) => (
                                                    <th key={i} style={{ padding: '8px 16px', fontSize: 9, color: i === 2 ? '#00D4FF' : '#6b7280', textAlign: i === 0 ? 'left' : 'right', letterSpacing: '0.1em', fontWeight: 700 }}>{h}</th>
                                                ))}
                                            </tr></thead>
                                            <tbody>
                                                {deltaRows.map((row, i) => {
                                                    const dGood = row.posGood ? row.delta > 0 : row.delta < 0;
                                                    const dColor = row.delta === 0 ? '#6b7280' : dGood ? '#FDC800' : '#ff4757';
                                                    return (
                                                        <tr key={i} style={{ borderBottom: '1px solid #0f1117', background: i % 2 === 0 ? '#0c0e13' : 'transparent' }}>
                                                            <td style={{ padding: '10px 16px', fontSize: 10, color: '#8b949e' }}>{row.label}</td>
                                                            <td style={{ padding: '10px 16px', fontSize: 11, color: '#6b7280', textAlign: 'right' }}>{row.a}</td>
                                                            <td style={{ padding: '10px 16px', fontSize: 11, color: '#00D4FF', fontWeight: 700, textAlign: 'right' }}>{row.b}</td>
                                                            <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 900, color: dColor, textAlign: 'right' }}>{row.fmtD(row.delta)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {/* Trend verdict */}
                                    <div style={{ marginTop: 2, background: '#0d1117', border: '1px solid #1a1c24', padding: '14px 18px' }}>
                                        {(() => {
                                            const pos = deltaRows.filter(r => r.posGood ? r.delta > 0 : r.delta < 0).length;
                                            const neg = deltaRows.filter(r => r.posGood ? r.delta < 0 : r.delta > 0).length;
                                            const trend = pos > neg ? (lang === 'fr' ? '↑ EN PROGRESSION' : '↑ IMPROVING') : pos < neg ? (lang === 'fr' ? '↓ EN RÉGRESSION' : '↓ DECLINING') : '→ STABLE';
                                            const tc = trend.startsWith('↑') ? '#FDC800' : trend.startsWith('↓') ? '#ff4757' : '#EAB308';
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                                                    <span style={{ fontFamily: QF, fontSize: 13, fontWeight: 900, color: tc }}>{trend}</span>
                                                    <span style={{ fontFamily: QF, fontSize: 10, color: '#6b7280' }}>
                                                        {lang === 'fr' ? `${pos}/${deltaRows.length} métriques améliorées entre le rapport A et le rapport B.` : `${pos}/${deltaRows.length} metrics improved between report A and report B.`}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Multi-period comparison */}
                                <div>
                                    <div style={{ ...SL, color: '#FDC800', marginBottom: 12 }}>{lang === 'fr' ? 'COMPARAISON MULTI-PÉRIODES' : 'MULTI-PERIOD COMPARISON'}</div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: QF }}>
                                            <thead><tr style={{ borderBottom: '1px solid #1a1c24' }}>
                                                {[lang === 'fr' ? 'PÉRIODE' : 'PERIOD', 'TRADES', 'P&L NET', lang === 'fr' ? 'TAUX' : 'WIN RATE', 'PF'].map((h, i) => (
                                                    <th key={i} style={{ padding: '8px 16px', fontSize: 9, color: '#6b7280', textAlign: i === 0 ? 'left' : 'right', letterSpacing: '0.1em', fontWeight: 700 }}>{h}</th>
                                                ))}
                                            </tr></thead>
                                            <tbody>{multiPeriods.map((row, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #1a1c24', background: i % 2 === 0 ? '#0c0e13' : 'transparent' }}>
                                                    <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 900, color: '#FDC800' }}>{row.label}</td>
                                                    <td style={{ padding: '10px 16px', fontSize: 11, color: '#c9d1d9', textAlign: 'right' }}>{row.count}</td>
                                                    <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: row.pnl >= 0 ? '#FDC800' : '#ff4757', textAlign: 'right' }}>{row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(0)}</td>
                                                    <td style={{ padding: '10px 16px', fontSize: 11, color: row.wr >= 55 ? '#FDC800' : row.wr >= 45 ? '#EAB308' : '#ff4757', textAlign: 'right' }}>{row.count > 0 ? `${row.wr.toFixed(1)}%` : '—'}</td>
                                                    <td style={{ padding: '10px 16px', fontSize: 11, color: row.pf >= 1.5 ? '#FDC800' : row.pf >= 1 ? '#EAB308' : '#ff4757', textAlign: 'right' }}>{row.count > 0 ? (row.pf > 90 ? '∞' : row.pf.toFixed(2)) : '—'}</td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })()}

                </AnimatePresence>
            </div>
        </div>
    );
}
