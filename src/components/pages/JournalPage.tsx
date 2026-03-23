'use client';

import styles from './JournalPage.module.css';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useTranslation } from '@/i18n/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Activity, Upload, LayoutList, CalendarDays,
    ChevronLeft, ChevronRight, FileDown, FileText, Loader2, Trash2,
    ChevronDown, ChevronUp, Flame, BookOpen, Brain, Target, Zap, BarChart2,
} from 'lucide-react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TRADEIFY_CRYPTO_LIST, FUTURES_SPECS, getTradingDay } from '@/store/appStore';
import { ChartCard } from '@/components/charts/RiskGuardianPrimitives';
import StreakBeads from '@/components/charts/StreakBeads';
import MonthlyCalendarHeatmap from '@/components/charts/MonthlyCalendarHeatmap';

function guessAssetType(symbol: string): 'crypto' | 'forex' | 'futures' | 'stocks' {
    const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s in FUTURES_SPECS) return 'futures';
    const base = s.replace(/USD$|USDT$/, '');
    if (TRADEIFY_CRYPTO_LIST.includes(base) || TRADEIFY_CRYPTO_LIST.includes(s)) return 'crypto';
    const FOREX_CCY = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'USD'];
    if (s.length === 6 && FOREX_CCY.some(c => s.startsWith(c) || s.endsWith(c))) return 'forex';
    return 'forex';
}

function calcHoldTime(createdAt: string, closedAt?: string): string {
    if (!closedAt) return '—';
    const ms = new Date(closedAt).getTime() - new Date(createdAt).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return '<1m';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York',
    });
}

function fmtDayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00Z');
    const isToday = dateStr === new Date().toISOString().slice(0, 10);
    if (isToday) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function JournalPage() {
    const { trades, setTrades, deleteTrade, updateTradeNote, updateTradeFields, setActiveTab, account, dayNotes, updateDayNote } = useAppStore();
    const { t } = useTranslation();
    const { language } = useAppStore();
    const lang = language ?? 'en';
    const csvRef = useRef<HTMLInputElement>(null);
    const pdfRef = useRef<HTMLInputElement>(null);
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [calendarDir, setCalendarDir] = useState<1 | -1>(1);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [dayNoteInput, setDayNoteInput] = useState('');
    const [pdfStatus, setPdfStatus] = useState<{ loading: boolean; msg: string }>({ loading: false, msg: '' });
    const [filter, setFilter] = useState<'all' | 'win' | 'loss' | 'open'>('all');
    const [assetFilter, setAssetFilter] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editPnls, setEditPnls] = useState<Record<string, string>>({});
    const [inlineWinInput, setInlineWinInput] = useState<Record<string, string>>({});
    const [inlineLossInput, setInlineLossInput] = useState<Record<string, string>>({});
    const [inlineOutcomeId, setInlineOutcomeId] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Sync day note input when selected day changes
    useEffect(() => {
        if (selectedDay) setDayNoteInput(dayNotes?.[selectedDay] ?? '');
    }, [selectedDay, dayNotes]);

    // ── EdgeForensics dashboard state ─────────────────────────
    const [journalTab, setJournalTab] = useState<'trades' | 'notes' | 'insights'>('trades');
    const [journalPreset, setJournalPreset] = useState<'TODAY'|'WEEK'|'LAST_WEEK'|'MONTH'|'30D'|'ALL'|'CUSTOM'>('ALL');
    const [journalDateFrom, setJournalDateFrom] = useState('');
    const [journalDateTo, setJournalDateTo] = useState('');
    const [showJournalPicker, setShowJournalPicker] = useState(false);
    // Compute effective date range from preset
    const { filterFrom, filterTo } = useMemo(() => {
        const now = new Date();
        const toStr = (d: Date) => d.toISOString().slice(0, 10);
        const today = toStr(now);
        switch (journalPreset) {
            case 'TODAY': return { filterFrom: today, filterTo: today };
            case 'WEEK': {
                const d = new Date(now);
                d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
                return { filterFrom: toStr(d), filterTo: today };
            }
            case 'LAST_WEEK': {
                const thisMonday = new Date(now);
                thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
                const lastMonday = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
                const lastSunday = new Date(thisMonday); lastSunday.setDate(lastSunday.getDate() - 1);
                return { filterFrom: toStr(lastMonday), filterTo: toStr(lastSunday) };
            }
            case 'MONTH': {
                return { filterFrom: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, filterTo: today };
            }
            case '30D': {
                const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                return { filterFrom: toStr(from), filterTo: today };
            }
            case 'CUSTOM': return { filterFrom: journalDateFrom, filterTo: journalDateTo };
            default: return { filterFrom: '', filterTo: '' }; // ALL
        }
    }, [journalPreset, journalDateFrom, journalDateTo]);

    const [ritualDismissed, setRitualDismissed] = useState(false);
    const [chartsExpanded, setChartsExpanded] = useState(true);

    // ── Design tokens ────────────────────────────────────────
    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
    const lbl: React.CSSProperties = { ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block' };
    const divider = '1px solid #1a1c24';

    // ── Calendar data ────────────────────────────────────────
    const calendarData = useMemo(() => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const rawFirstDay = new Date(year, month, 1).getDay(); // 0=Sun
        const firstDay = rawFirstDay === 0 ? 6 : rawFirstDay - 1; // shift: Mon=0 … Sun=6
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let currentWeek: any[] = [];
        const weeks: any[] = [];
        let weekNumber = 1;
        for (let i = 0; i < firstDay; i++) {
            const prevDate = new Date(year, month, 0).getDate() - (firstDay - 1 - i);
            currentWeek.push({ day: prevDate, isCurrentMonth: false, pnl: 0, tradesCount: 0 });
        }
        const todayStr = new Date().toISOString().split('T')[0];
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayTrades = trades.filter(t => getTradingDay(t.closedAt ?? t.createdAt) === dateStr);
            const pnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
            currentWeek.push({ day: i, isCurrentMonth: true, pnl, tradesCount: dayTrades.length, date: dateStr, isToday: dateStr === todayStr });
            if (currentWeek.length === 7) {
                const weekPnl = currentWeek.reduce((s, d) => s + d.pnl, 0);
                const weekTrades = currentWeek.reduce((s, d) => s + d.tradesCount, 0);
                weeks.push({ days: currentWeek, weekPnl, weekTrades, weekNumber });
                currentWeek = []; weekNumber++;
            }
        }
        if (currentWeek.length > 0) {
            let nextDay = 1;
            while (currentWeek.length < 7) currentWeek.push({ day: nextDay++, isCurrentMonth: false, pnl: 0, tradesCount: 0 });
            const weekPnl = currentWeek.reduce((s, d) => s + d.pnl, 0);
            const weekTrades = currentWeek.reduce((s, d) => s + d.tradesCount, 0);
            weeks.push({ days: currentWeek, weekPnl, weekTrades, weekNumber });
        }
        return { year, month, weeks, monthName: calendarDate.toLocaleString('default', { month: 'short' }) };
    }, [calendarDate, trades]);

    const prevMonth = () => {
        setCalendarDir(-1);
        const d = new Date(calendarDate); d.setMonth(d.getMonth() - 1); setCalendarDate(d);
    };
    const nextMonth = () => {
        setCalendarDir(1);
        const d = new Date(calendarDate); d.setMonth(d.getMonth() + 1); setCalendarDate(d);
    };

    // ── PDF Import ───────────────────────────────────────────
    const handlePDFImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        // Validate file type and size (max 20MB)
        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            setPdfStatus({ loading: false, msg: 'Invalid file — only PDF statements are supported.' });
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setPdfStatus({ loading: false, msg: 'File too large — max 20MB.' });
            return;
        }
        setPdfStatus({ loading: true, msg: 'Parsing statement…' });
        const timeout = setTimeout(() => setPdfStatus({ loading: false, msg: 'Timed out — statement may be unsupported.' }), 30_000);
        try {
            const { parseTradeifyPDF } = await import('@/lib/parseTradeifyPDF');
            const result = await parseTradeifyPDF(file);
            clearTimeout(timeout);
            if (result.error) { setPdfStatus({ loading: false, msg: result.error }); return; }
            if (result.count === 0) { setPdfStatus({ loading: false, msg: 'No closed trades found in this statement.' }); return; }
            // Correct incremental merge: keep all existing non-PDF trades + old PDF trades
            // not present in the new upload. Same logic as Settings page.
            const nonPdf  = trades.filter(t => !t.id.startsWith('tradeify-'));
            const oldPdf  = trades.filter(t => t.id.startsWith('tradeify-'));
            const newIds  = new Set(result.trades.map(t => t.id));
            const oldKept = oldPdf.filter(t => !newIds.has(t.id));
            const newTrades = result.trades.map(t => ({ ...t, note: '', source: 'pdf' as const }));
            setTrades([...newTrades, ...oldKept, ...nonPdf]); // autoSync fires inside setTrades
            const coverage = result.coverageStart && result.coverageEnd
                ? ` · ${result.coverageStart} → ${result.coverageEnd}` : '';
            setPdfStatus({ loading: false, msg: `${newTrades.length} imported, ${oldKept.length} kept${coverage}` });
        } catch (err) {
            clearTimeout(timeout);
            setPdfStatus({ loading: false, msg: `Import failed: ${err instanceof Error ? err.message : String(err)}` });
        }
    };

    // ── CSV Export ───────────────────────────────────────────
    const handleExportCSV = () => {
        const headers = ['Date', 'Asset', 'Type', 'Direction', 'Entry', 'SL', 'TP', 'Size', 'Risk$', 'Reward$', 'RR', 'Outcome', 'PnL', 'HoldTime', 'Note'];
        const rows = trades.map(t => [
            new Date(t.createdAt).toISOString().split('T')[0],
            t.asset, t.assetType, t.isShort ? 'SHORT' : 'LONG',
            t.entry, t.stopLoss, t.takeProfit, t.lotSize,
            t.riskUSD.toFixed(2), t.rewardUSD.toFixed(2), t.rr.toFixed(2),
            t.outcome ?? 'open', (t.pnl ?? 0).toFixed(2),
            calcHoldTime(t.createdAt, t.closedAt),
            (t.note ?? '').replace(/,/g, ';'),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `riskguardian-journal-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── CSV Import ───────────────────────────────────────────
    const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length < 2) return;
            const header = lines[0].toLowerCase();
            const isMT4 = header.includes('type') && header.includes('item');
            const imported: typeof trades = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                try {
                    if (isMT4) {
                        const type = cols[2]?.toLowerCase();
                        if (!['buy', 'sell'].includes(type)) continue;
                        const entry = parseFloat(cols[5]);
                        const sl = parseFloat(cols[6]) || entry * 0.99;
                        const tp = parseFloat(cols[7]) || entry * 1.01;
                        const pnl = parseFloat(cols[8]);
                        const size = parseFloat(cols[3]);
                        if (isNaN(entry) || isNaN(size)) continue;
                        const risk = Math.abs(entry - sl) * size;
                        const reward = Math.abs(tp - entry) * size;
                        // Deterministic ID from content — prevents duplicates on re-import
                        const id = `csv-${cols[1] ?? ''}-${cols[4] ?? ''}-${cols[5] ?? ''}-${(pnl || 0).toFixed(2)}`;
                        imported.push({ id, asset: cols[4]?.toUpperCase() || 'UNKNOWN', assetType: guessAssetType(cols[4] || ''), entry, stopLoss: sl, takeProfit: tp, lotSize: size, riskUSD: risk, rewardUSD: reward, rr: risk > 0 ? reward / risk : 0, outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'open', createdAt: cols[1] || new Date().toISOString(), closedAt: cols[1] || new Date().toISOString(), pnl, isShort: type === 'sell', source: 'csv' as const });
                    } else {
                        const side = cols[2]?.toLowerCase();
                        const entry = parseFloat(cols[4]);
                        const sl = parseFloat(cols[5]);
                        const tp = parseFloat(cols[6]);
                        const pnl = parseFloat(cols[7]);
                        const size = parseFloat(cols[3]);
                        if (isNaN(entry) || isNaN(size)) continue;
                        const risk = Math.abs(entry - (sl || entry * 0.99)) * size;
                        const reward = Math.abs((tp || entry * 1.01) - entry) * size;
                        // Deterministic ID from content — prevents duplicates on re-import
                        const id = `csv-${cols[0] ?? ''}-${cols[1] ?? ''}-${cols[4] ?? ''}-${(pnl || 0).toFixed(2)}`;
                        imported.push({ id, asset: cols[1]?.toUpperCase() || 'UNKNOWN', assetType: guessAssetType(cols[1] || ''), entry, stopLoss: sl || entry * 0.99, takeProfit: tp || entry * 1.01, lotSize: size, riskUSD: risk, rewardUSD: reward, rr: risk > 0 ? reward / risk : 0, outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'open', createdAt: cols[0] || new Date().toISOString(), closedAt: cols[0] || new Date().toISOString(), pnl, isShort: side === 'sell' || side === 'short', source: 'csv' as const });
                    }
                } catch { continue; }
            }
            if (imported.length > 0) {
                // Merge: keep all existing non-CSV trades + old CSV trades not in this new batch
                const newIds = new Set(imported.map(t => t.id));
                const nonCsv = trades.filter(t => !t.id.startsWith('csv-'));
                const oldCsv = trades.filter(t => t.id.startsWith('csv-') && !newIds.has(t.id));
                setTrades([...imported, ...oldCsv, ...nonCsv]);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // ── Computed stats ───────────────────────────────────────
    const closedTrades = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');
    const wins = closedTrades.filter(t => t.outcome === 'win');
    const losses = closedTrades.filter(t => t.outcome === 'loss');
    const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
    const avgWinAmt = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
    const avgLossAmt = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / losses.length : 0;
    const profitFactor = avgLossAmt > 0 ? avgWinAmt / avgLossAmt : avgWinAmt > 0 ? 99 : 0;

    // ── Consistency streak: consecutive trading days going back from today ──
    const consistencyStreak = useMemo(() => {
        const tradingDays = new Set(
            trades.filter(t => t.outcome !== 'open').map(t => getTradingDay(t.closedAt ?? t.createdAt))
        );
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const ds = d.toISOString().slice(0, 10);
            if (tradingDays.has(ds)) { streak++; }
            else if (i > 0) break; // allow today to be open (no closed trades yet)
        }
        return streak;
    }, [trades]);

    // ── Discipline score 0–100 (frequency-weighted, gradual penalties) ──────
    const { disciplineScore, disciplineDelta } = useMemo(() => {
        if (closedTrades.length === 0) return { disciplineScore: 0, disciplineDelta: 0 };
        const sorted = [...closedTrades].sort(
            (a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime()
        );

        // Helper to compute score for a given slice
        const computeScore = (trades: typeof sorted): number => {
            if (trades.length === 0) return 0;
            let s = 100;
            // Revenge: frequency-weighted — each instance worth 5pts, max 35pts
            // (vs old flat 10pts each regardless of frequency context)
            let revengeCount = 0;
            for (let i = 1; i < trades.length; i++) {
                if (trades[i - 1].outcome === 'loss') {
                    const gap = new Date(trades[i].createdAt).getTime()
                        - new Date(trades[i - 1].closedAt ?? trades[i - 1].createdAt).getTime();
                    if (gap < 5 * 60 * 1000) revengeCount++;
                }
            }
            // Weight by trade count: 1 revenge in 5 trades = worse than 1 in 50
            const revengePct = (revengeCount / trades.length) * 100;
            s -= Math.min(35, revengePct * 2 + revengeCount * 3);

            // Win rate: gradual penalty
            const wr = trades.length > 0 ? (trades.filter(t => t.outcome === 'win').length / trades.length) * 100 : 0;
            if (wr < 30) s -= 25;
            else if (wr < 40) s -= 18;
            else if (wr < 50) s -= 10;
            else if (wr < 55) s -= 3;

            // Profit factor: gradual penalty
            const gw = trades.filter(t => t.outcome === 'win').reduce((acc, t) => acc + (t.pnl ?? 0), 0);
            const gl = trades.filter(t => t.outcome === 'loss').reduce((acc, t) => acc + Math.abs(t.pnl ?? 0), 0);
            const pf = gl > 0 ? gw / gl : gw > 0 ? 99 : 0;
            if (pf < 0.7) s -= 25;
            else if (pf < 1.0) s -= 18;
            else if (pf < 1.2) s -= 8;
            else if (pf < 1.5) s -= 3;

            // Traceability: gradual (penalizes only <20% annotated; 20–50% gets partial credit)
            const withNotes = trades.filter(t => t.note && t.note.trim().length > 10).length;
            const tracePct = (withNotes / trades.length) * 100;
            if (tracePct < 10) s -= 10;
            else if (tracePct < 20) s -= 6;
            else if (tracePct < 40) s -= 2;

            return Math.max(0, Math.min(100, Math.round(s)));
        };

        const currentScore = computeScore(sorted);

        // Improvement velocity: compare last 10 trades vs previous 10
        let delta = 0;
        if (sorted.length >= 20) {
            const recent = sorted.slice(-10);
            const prior  = sorted.slice(-20, -10);
            delta = computeScore(recent) - computeScore(prior);
        }

        return { disciplineScore: currentScore, disciplineDelta: delta };
    }, [closedTrades]);

    // ── Traceability: % trades annotated ─────────────────────
    const traceabilityScore = useMemo(() => {
        const withNotes = trades.filter(t => t.note && t.note.trim().length > 10).length;
        const total = trades.length;
        return { pct: total > 0 ? Math.round((withNotes / total) * 100) : 0, count: withNotes, total };
    }, [trades]);

    // ── Session count (unique trading days with closed trades) ─
    const sessionCount = useMemo(() => {
        const days = new Set(closedTrades.map(t => getTradingDay(t.closedAt ?? t.createdAt)));
        return days.size;
    }, [closedTrades]);
    const AI_COACHING_THRESHOLD = 5;

    // ── Time-filtered trades for KPIs + charts ────────────────
    const timeFilteredTrades = useMemo(() => {
        return closedTrades.filter(t => {
            const d = getTradingDay(t.closedAt ?? t.createdAt);
            if (filterFrom && d < filterFrom) return false;
            if (filterTo && d > filterTo) return false;
            return true;
        });
    }, [closedTrades, filterFrom, filterTo]);

    const tfWins = timeFilteredTrades.filter(t => t.outcome === 'win');
    const tfLosses = timeFilteredTrades.filter(t => t.outcome === 'loss');
    const tfPnl = timeFilteredTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const tfWinRate = timeFilteredTrades.length > 0 ? Math.round((tfWins.length / timeFilteredTrades.length) * 100) : 0;
    const tfAvgWin = tfWins.length > 0 ? tfWins.reduce((s, t) => s + (t.pnl ?? 0), 0) / tfWins.length : 0;
    const tfAvgLoss = tfLosses.length > 0 ? Math.abs(tfLosses.reduce((s, t) => s + (t.pnl ?? 0), 0)) / tfLosses.length : 0;
    const tfPf = tfAvgLoss > 0 ? tfAvgWin / tfAvgLoss : tfAvgWin > 0 ? 99 : 0;
    const tfExpectancy = timeFilteredTrades.length > 0 ? tfPnl / timeFilteredTrades.length : 0;

    // ── Hold-time format helper ──────────────────────────────────
    const fmtSecs = (s: number): string => {
        if (s <= 0) return '—';
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60); const rem = m % 60;
        return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
    };

    // ── Extra metrics for KPI strip ──────────────────────────────
    const tfWinsWithDur = tfWins.filter(t => (t.durationSeconds ?? 0) > 0);
    const tfLossesWithDur = tfLosses.filter(t => (t.durationSeconds ?? 0) > 0);
    const tfAvgWinDur = tfWinsWithDur.length > 0 ? tfWinsWithDur.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / tfWinsWithDur.length : 0;
    const tfAvgLossDur = tfLossesWithDur.length > 0 ? tfLossesWithDur.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / tfLossesWithDur.length : 0;
    const tfBestTrade = timeFilteredTrades.length > 0 ? timeFilteredTrades.reduce((b, t) => (t.pnl ?? 0) > (b?.pnl ?? -Infinity) ? t : b, timeFilteredTrades[0]) : null;
    const tfWorstTrade = timeFilteredTrades.length > 0 ? timeFilteredTrades.reduce((b, t) => (t.pnl ?? 0) < (b?.pnl ?? Infinity) ? t : b, timeFilteredTrades[0]) : null;
    const tfDailyMap = useMemo(() => {
        const m: Record<string, number> = {};
        timeFilteredTrades.forEach(t => { const d = getTradingDay(t.closedAt ?? t.createdAt); m[d] = (m[d] ?? 0) + (t.pnl ?? 0); });
        return Object.values(m);
    }, [timeFilteredTrades]);
    const tfBestDay = tfDailyMap.length > 0 ? Math.max(...tfDailyMap) : 0;
    const tfWorstDay = tfDailyMap.length > 0 ? Math.min(...tfDailyMap) : 0;
    const tfWlRatio = tfAvgLoss > 0 ? tfAvgWin / tfAvgLoss : 0;
    // Max consecutive wins/losses in filtered period
    const [tfMaxConsecW, tfMaxConsecL] = useMemo(() => {
        let maxW = 0, maxL = 0, curW = 0, curL = 0;
        const sorted = [...timeFilteredTrades].sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
        sorted.forEach(t => {
            if ((t.pnl ?? 0) > 0) { curW++; curL = 0; if (curW > maxW) maxW = curW; }
            else if ((t.pnl ?? 0) < 0) { curL++; curW = 0; if (curL > maxL) maxL = curL; }
        });
        return [maxW, maxL];
    }, [timeFilteredTrades]);

    // ── Equity curve (cumulative P&L over time) ───────────────
    const equityCurveData = useMemo(() => {
        const sorted = [...timeFilteredTrades].sort(
            (a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime()
        );
        let cum = 0;
        return sorted.map((t, i) => {
            cum += t.pnl ?? 0;
            return { i: i + 1, pnl: Math.round(cum * 100) / 100 };
        });
    }, [timeFilteredTrades]);

    // ── Daily P&L bars ────────────────────────────────────────
    const dailyPnlData = useMemo(() => {
        const dayMap: Record<string, number> = {};
        timeFilteredTrades.forEach(t => {
            const d = getTradingDay(t.closedAt ?? t.createdAt);
            dayMap[d] = (dayMap[d] ?? 0) + (t.pnl ?? 0);
        });
        return Object.entries(dayMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-30)
            .map(([d, pnl]) => ({ d: d.slice(5), pnl: Math.round(pnl * 100) / 100 }));
    }, [timeFilteredTrades]);

    // ── By Symbol ─────────────────────────────────────────────
    const bySymbolData = useMemo(() => {
        const symMap: Record<string, { pnl: number; count: number }> = {};
        timeFilteredTrades.forEach(t => {
            if (!symMap[t.asset]) symMap[t.asset] = { pnl: 0, count: 0 };
            symMap[t.asset].pnl += t.pnl ?? 0;
            symMap[t.asset].count++;
        });
        return Object.entries(symMap)
            .map(([sym, { pnl, count }]) => ({ sym, pnl: Math.round(pnl * 100) / 100, count }))
            .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
            .slice(0, 8);
    }, [timeFilteredTrades]);

    // ── By Day of Week ────────────────────────────────────────
    const byDowData = useMemo(() => {
        const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dowMap: Record<number, { pnl: number; count: number }> = {};
        timeFilteredTrades.forEach(t => {
            const dow = new Date(t.closedAt ?? t.createdAt).getDay();
            if (!dowMap[dow]) dowMap[dow] = { pnl: 0, count: 0 };
            dowMap[dow].pnl += t.pnl ?? 0;
            dowMap[dow].count++;
        });
        return [1, 2, 3, 4, 5].map(dow => ({
            dow: DOW[dow],
            avg: dowMap[dow] ? Math.round((dowMap[dow].pnl / dowMap[dow].count) * 100) / 100 : 0,
            count: dowMap[dow]?.count ?? 0,
        }));
    }, [timeFilteredTrades]);

    // ── Unique assets for filter ─────────────────────────────
    const uniqueAssets = useMemo(() => [...new Set(trades.map(t => t.asset))].sort(), [trades]);

    // ── Grouped + filtered + sorted trades ───────────────────
    const groupedByDay = useMemo(() => {
        let filtered = [...trades];
        if (filter !== 'all') filtered = filtered.filter(t => t.outcome === filter);
        if (assetFilter) filtered = filtered.filter(t => t.asset === assetFilter);
        // Apply date range filter
        if (filterFrom || filterTo) {
            filtered = filtered.filter(t => {
                const d = getTradingDay(t.closedAt ?? t.createdAt);
                if (filterFrom && d < filterFrom) return false;
                if (filterTo && d > filterTo) return false;
                return true;
            });
        }
        // Most recent first
        filtered.sort((a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime());
        const dayMap: Record<string, typeof trades> = {};
        filtered.forEach(t => {
            const day = t.outcome === 'open' ? t.createdAt.slice(0, 10) : getTradingDay(t.closedAt ?? t.createdAt);
            if (!dayMap[day]) dayMap[day] = [];
            dayMap[day].push(t);
        });
        return Object.entries(dayMap).sort(([a], [b]) => b.localeCompare(a)).map(([day, dayTrades]) => {
            const dayPnl = dayTrades.filter(t => t.outcome !== 'open').reduce((s, t) => s + (t.pnl ?? 0), 0);
            const dayWins = dayTrades.filter(t => t.outcome === 'win').length;
            const dayLosses = dayTrades.filter(t => t.outcome === 'loss').length;
            return { day, trades: dayTrades, dayPnl, dayWins, dayLosses };
        });
    }, [trades, filter, assetFilter]);

    const totalShown = groupedByDay.reduce((s, g) => s + g.trades.length, 0);
    const pnlColor = totalPnl >= 0 ? '#FDC800' : '#ff4757';

    // ── Monthly heatmap data (current month, P&L per trading day) ──
    const heatmapData = useMemo(() => {
        const dayMap: Record<string, number> = {};
        trades.forEach(t => {
            if (t.outcome === 'open') return;
            const d = getTradingDay(t.closedAt ?? t.createdAt);
            dayMap[d] = (dayMap[d] ?? 0) + (t.pnl ?? 0);
        });
        return Object.entries(dayMap).map(([d, pnl]) => ({ d, pnl }));
    }, [trades]);

    // ── Streak beads data (last 40 trades sorted chronologically) ──
    const journalStreakData = useMemo(() =>
        [...trades]
            .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime())
            .slice(-40)
            .map(t => ({
                result: t.outcome === 'win' ? 'win' as const : t.outcome === 'loss' ? 'loss' as const : 'open' as const,
                pnl: t.pnl ?? 0,
            })),
    [trades]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh' }}>
            <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSVImport} />
            <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePDFImport} />

            {/* ── HEADER ─────────────────────────────────────── */}
            <div style={{ padding: isMobile ? '12px 14px' : '14px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ ...mono, fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{lang === 'fr' ? 'JOURNAL' : 'JOURNAL'}</h1>
                    <span style={lbl}>{lang === 'fr' ? 'Historique d\'exécution · piste d\'audit' : 'Execution history · audit trail'}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        onClick={() => pdfRef.current?.click()}
                        disabled={pdfStatus.loading}
                        style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 14px', background: '#FDC800', color: '#000', border: 'none', cursor: 'pointer', letterSpacing: '0.06em' }}
                    >
                        {pdfStatus.loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={12} />}
                        {lang === 'fr' ? 'Importer PDF' : 'Import PDF'}
                    </button>
                    <button onClick={() => csvRef.current?.click()} style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'transparent', color: '#8b949e', border: '1px solid #1a1c24', cursor: 'pointer' }}>
                        <Upload size={12} /> {lang === 'fr' ? 'Importer CSV' : 'Import CSV'}
                    </button>
                    {trades.length > 0 && (
                        <button onClick={handleExportCSV} style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'transparent', color: '#8b949e', border: '1px solid #1a1c24', cursor: 'pointer' }}>
                            <FileDown size={12} /> {lang === 'fr' ? 'Exporter JSON' : 'Export JSON'}
                        </button>
                    )}
                    {trades.length > 0 && (
                        <button onClick={() => { if (window.confirm(`Delete all ${trades.length} trades? This cannot be undone.`)) setTrades([]); }}
                            style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'transparent', color: '#ff4757', border: '1px solid rgba(255,71,87,0.25)', cursor: 'pointer' }}>
                            <Trash2 size={12} /> {lang === 'fr' ? 'Tout effacer' : 'Clear all'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── PDF STATUS TOAST ────────────────────────────── */}
            <AnimatePresence>
                {pdfStatus.msg && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{
                            padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            borderBottom: divider,
                            background: pdfStatus.msg.startsWith('Imported') ? 'rgba(253,200,0,0.06)' : 'rgba(255,71,87,0.06)',
                            borderLeft: `3px solid ${pdfStatus.msg.startsWith('Imported') ? '#FDC800' : '#ff4757'}`,
                        }}>
                        <span style={{ ...mono, fontSize: 12, color: pdfStatus.msg.startsWith('Imported') ? '#FDC800' : '#ff4757', fontWeight: 600 }}>{pdfStatus.msg}</span>
                        <button onClick={() => setPdfStatus({ loading: false, msg: '' })} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── EDGE FORENSICS DASHBOARD ─────────────────────── */}
            {/* 3-Card row: Consistency | Discipline | Traceability */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', borderBottom: divider }}>
                {/* Consistency */}
                <div style={{ padding: isMobile ? '14px' : '18px 20px', borderRight: isMobile ? 'none' : divider, borderBottom: isMobile ? divider : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Flame size={13} color={consistencyStreak >= 3 ? '#FDC800' : consistencyStreak >= 1 ? '#EAB308' : '#4b5563'} />
                        <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4b5563' }}>
                            {lang === 'fr' ? 'Régularité' : 'Consistency'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ ...mono, fontSize: 32, fontWeight: 900, color: consistencyStreak >= 3 ? '#FDC800' : consistencyStreak >= 1 ? '#EAB308' : '#4b5563', letterSpacing: '-0.04em', lineHeight: 1 }}>
                            {consistencyStreak}
                        </span>
                        <span style={{ ...mono, fontSize: 11, color: '#4b5563' }}>{lang === 'fr' ? 'jours consécutifs' : 'day streak'}</span>
                    </div>
                    {/* Progress bar toward 5-day goal */}
                    <div style={{ marginTop: 10, height: 3, background: '#1a1c24', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min((consistencyStreak / 5) * 100, 100)}%`, background: consistencyStreak >= 3 ? '#FDC800' : '#EAB308', transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 4 }}>
                        {lang === 'fr' ? `Objectif : 5 jours · ${Math.max(0, 5 - consistencyStreak)} restant${5 - consistencyStreak > 1 ? 's' : ''}` : `Goal: 5 days · ${Math.max(0, 5 - consistencyStreak)} to go`}
                    </span>
                </div>

                {/* Discipline */}
                <div style={{ padding: isMobile ? '14px' : '18px 20px', borderRight: isMobile ? 'none' : divider, borderBottom: isMobile ? divider : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Target size={13} color={disciplineScore >= 80 ? '#FDC800' : disciplineScore >= 60 ? '#EAB308' : '#ff4757'} />
                        <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4b5563' }}>
                            {lang === 'fr' ? 'Discipline' : 'Discipline'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ ...mono, fontSize: 32, fontWeight: 900, color: disciplineScore >= 80 ? '#FDC800' : disciplineScore >= 60 ? '#EAB308' : closedTrades.length > 0 ? '#ff4757' : '#4b5563', letterSpacing: '-0.04em', lineHeight: 1 }}>
                            {closedTrades.length > 0 ? disciplineScore : '—'}
                        </span>
                        {closedTrades.length > 0 && <span style={{ ...mono, fontSize: 11, color: '#4b5563' }}>/100</span>}
                    </div>
                    <div style={{ marginTop: 10, height: 3, background: '#1a1c24', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${disciplineScore}%`, background: disciplineScore >= 80 ? '#FDC800' : disciplineScore >= 60 ? '#EAB308' : '#ff4757', transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>
                            {closedTrades.length === 0
                                ? (lang === 'fr' ? 'Aucun trade clôturé' : 'No closed trades yet')
                                : disciplineScore >= 80
                                ? (lang === 'fr' ? 'Excellente discipline' : 'Excellent discipline')
                                : disciplineScore >= 60
                                ? (lang === 'fr' ? 'Quelques patterns à corriger' : 'Some patterns to correct')
                                : (lang === 'fr' ? 'Trading émotionnel détecté' : 'Emotional trading detected')}
                        </span>
                        {closedTrades.length >= 20 && (
                            <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: disciplineDelta > 5 ? '#FDC800' : disciplineDelta < -5 ? '#ff4757' : '#4b5563' }}>
                                {disciplineDelta > 0 ? `↑+${disciplineDelta}` : disciplineDelta < 0 ? `↓${disciplineDelta}` : '→'} {lang === 'fr' ? 'vs 10 prev' : 'vs prev 10'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Traceability */}
                <div style={{ padding: isMobile ? '14px' : '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <BookOpen size={13} color={traceabilityScore.pct >= 60 ? '#FDC800' : traceabilityScore.pct >= 30 ? '#EAB308' : '#4b5563'} />
                        <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#4b5563' }}>
                            {lang === 'fr' ? 'Traçabilité' : 'Traceability'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ ...mono, fontSize: 32, fontWeight: 900, color: traceabilityScore.pct >= 60 ? '#FDC800' : traceabilityScore.pct >= 30 ? '#EAB308' : '#4b5563', letterSpacing: '-0.04em', lineHeight: 1 }}>
                            {traceabilityScore.pct}
                        </span>
                        <span style={{ ...mono, fontSize: 11, color: '#4b5563' }}>%</span>
                    </div>
                    <div style={{ marginTop: 10, height: 3, background: '#1a1c24', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${traceabilityScore.pct}%`, background: traceabilityScore.pct >= 60 ? '#FDC800' : '#EAB308', transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 4 }}>
                        {lang === 'fr'
                            ? `${traceabilityScore.count}/${traceabilityScore.total} trades annotés`
                            : `${traceabilityScore.count}/${traceabilityScore.total} trades annotated`}
                    </span>
                </div>
            </div>

            {/* AI Coaching progress bar */}
            <div style={{ padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: divider, background: '#0a0a0a', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Zap size={13} color="#FDC800" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#FDC800' }}>
                            {lang === 'fr' ? 'Vers le coaching IA' : 'Path to AI Coaching'}
                        </span>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>
                            {Math.min(sessionCount, AI_COACHING_THRESHOLD)}/{AI_COACHING_THRESHOLD} {lang === 'fr' ? 'sessions' : 'sessions'}
                        </span>
                    </div>
                    <div style={{ height: 3, background: '#1a1c24', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min((sessionCount / AI_COACHING_THRESHOLD) * 100, 100)}%`, background: 'linear-gradient(90deg, #FDC800, #fb923c)', transition: 'width 0.5s ease' }} />
                    </div>
                </div>
                <span style={{ ...mono, fontSize: 9, color: '#4b5563', flexShrink: 0 }}>
                    {sessionCount >= AI_COACHING_THRESHOLD
                        ? (lang === 'fr' ? '🔓 Débloqué' : '🔓 Unlocked')
                        : lang === 'fr'
                        ? `${AI_COACHING_THRESHOLD - sessionCount} sessions pour débloquer la corrélation d'humeur`
                        : `${AI_COACHING_THRESHOLD - sessionCount} sessions to unlock mood correlation`}
                </span>
            </div>

            {/* Pre-session ritual banner */}
            <AnimatePresence>
                {!ritualDismissed && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ borderBottom: divider, borderLeft: '2px solid rgba(253,200,0,0.5)', background: 'rgba(253,200,0,0.04)', overflow: 'hidden' }}
                    >
                        <div style={{ padding: isMobile ? '10px 14px' : '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Brain size={13} color="#FDC800" style={{ flexShrink: 0 }} />
                            <span style={{ ...mono, fontSize: 11, color: '#c9d1d9', flex: 1 }}>
                                {lang === 'fr'
                                    ? 'Rituel pré-session — As-tu révisé ton plan de trading ? Définis ton biais directionnel avant d\'ouvrir le marché.'
                                    : 'Pre-session ritual — Have you reviewed your trading plan? Define your directional bias before opening the market.'}
                            </span>
                            <button onClick={() => setRitualDismissed(true)}
                                style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: '2px 6px' }}>×</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tab switcher: TRADES | NOTES | INSIGHTS */}
            <div style={{ borderBottom: divider, display: 'flex', gap: 0, background: '#090909' }}>
                {([
                    { id: 'trades', label: lang === 'fr' ? 'TRADES' : 'TRADES', icon: <Activity size={11} /> },
                    { id: 'notes', label: lang === 'fr' ? `NOTES (${trades.filter(t => t.note && t.note.trim().length > 10).length})` : `NOTES (${trades.filter(t => t.note && t.note.trim().length > 10).length})`, icon: <BookOpen size={11} /> },
                    { id: 'insights', label: lang === 'fr' ? 'APERÇUS' : 'INSIGHTS', icon: <Brain size={11} /> },
                ] as const).map(tab => (
                    <button key={tab.id} onClick={() => setJournalTab(tab.id)}
                        style={{
                            ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: isMobile ? '12px 14px' : '14px 20px',
                            background: 'transparent', border: 'none', borderBottom: journalTab === tab.id ? '2px solid #FDC800' : '2px solid transparent',
                            color: journalTab === tab.id ? '#fff' : '#4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'color 0.15s',
                        }}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Date range selector + KPI strip */}
            {(journalTab === 'trades' || journalTab === 'insights') && (
                <>
                    {/* Date range preset bar */}
                    <div style={{ padding: isMobile ? '8px 14px' : '10px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginRight: 4, flexShrink: 0 }}>
                            {lang === 'fr' ? 'Période' : 'Period'}
                        </span>
                        {([
                            { id: 'TODAY',     label: lang === 'fr' ? 'AUJ.' : 'TODAY' },
                            { id: 'WEEK',      label: lang === 'fr' ? 'CETTE SEM.' : 'THIS WEEK' },
                            { id: 'LAST_WEEK', label: lang === 'fr' ? 'SEMAINE PASS.' : 'LAST WEEK' },
                            { id: 'MONTH',     label: lang === 'fr' ? 'CE MOIS' : 'THIS MONTH' },
                            { id: '30D',       label: '30D' },
                            { id: 'ALL',       label: lang === 'fr' ? 'TOUT' : 'ALL' },
                        ] as const).map(f => (
                            <button key={f.id} onClick={() => setJournalPreset(f.id)}
                                style={{
                                    ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 10px',
                                    background: journalPreset === f.id ? '#FDC800' : 'transparent',
                                    color: journalPreset === f.id ? '#000' : '#4b5563',
                                    border: `1px solid ${journalPreset === f.id ? '#FDC800' : '#1a1c24'}`,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}>
                                {f.label}
                            </button>
                        ))}
                        <button onClick={() => { setJournalPreset('CUSTOM'); setShowJournalPicker(p => !p); }}
                            style={{
                                ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 10px',
                                background: journalPreset === 'CUSTOM' ? '#FDC800' : 'transparent',
                                color: journalPreset === 'CUSTOM' ? '#000' : '#4b5563',
                                border: `1px solid ${journalPreset === 'CUSTOM' ? '#FDC800' : '#1a1c24'}`,
                                cursor: 'pointer',
                            }}>
                            {journalPreset === 'CUSTOM' && journalDateFrom ? `${journalDateFrom.slice(5)} → ${journalDateTo.slice(5) || '...'}` : (lang === 'fr' ? 'PERSO…' : 'CUSTOM…')}
                        </button>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', marginLeft: 'auto' }}>
                            {timeFilteredTrades.length} {lang === 'fr' ? 'trades' : 'trades'}
                            {(filterFrom || filterTo) && (
                                <button onClick={() => { setJournalPreset('ALL'); setJournalDateFrom(''); setJournalDateTo(''); }}
                                    style={{ ...mono, fontSize: 9, color: '#ff4757', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>
                                    ✕ {lang === 'fr' ? 'effacer' : 'clear'}
                                </button>
                            )}
                        </span>
                        {/* Custom date picker overlay */}
                        {showJournalPicker && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200 /* custom picker z-index */ }}>
                                <DateRangePicker
                                    from={journalDateFrom}
                                    to={journalDateTo}
                                    tradeDates={new Set(trades.map(t => (t.closedAt ?? t.createdAt).slice(0, 10)))}
                                    onApply={(from, to) => { setJournalDateFrom(from); setJournalDateTo(to); setJournalPreset('CUSTOM'); }}
                                    onClose={() => setShowJournalPicker(false)}
                                    isMobile={isMobile}
                                    lang={lang}
                                />
                            </div>
                        )}
                    </div>

                    {/* KPI strip — 12 metrics */}
                    {(() => {
                        const kpis = [
                            { k: 'Net P&L',                                              v: timeFilteredTrades.length > 0 ? `${tfPnl >= 0 ? '+' : ''}$${Math.abs(tfPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—', c: timeFilteredTrades.length > 0 ? (tfPnl >= 0 ? '#FDC800' : '#ff4757') : '#4b5563', sub: timeFilteredTrades.length > 0 ? `${tfWins.length}W · ${tfLosses.length}L` : '—' },
                            { k: lang === 'fr' ? 'Taux réussite' : 'Win Rate',           v: timeFilteredTrades.length > 0 ? `${tfWinRate}%` : '—', c: tfWinRate >= 55 ? '#FDC800' : tfWinRate >= 45 ? '#EAB308' : timeFilteredTrades.length > 0 ? '#ff4757' : '#4b5563', sub: `${timeFilteredTrades.length} ${lang === 'fr' ? 'clôturés' : 'closed'}` },
                            { k: lang === 'fr' ? 'Fact. profit' : 'Profit Factor',       v: timeFilteredTrades.length > 0 ? (tfPf > 90 ? '∞' : tfPf.toFixed(2)) : '—', c: tfPf >= 1.5 ? '#FDC800' : tfPf >= 1 ? '#EAB308' : timeFilteredTrades.length > 0 ? '#ff4757' : '#4b5563', sub: tfAvgLoss > 0 ? `${tfPf.toFixed(2)}x` : '—' },
                            { k: lang === 'fr' ? 'Espérance' : 'Expectancy',             v: timeFilteredTrades.length > 0 ? `${tfExpectancy >= 0 ? '+' : ''}$${Math.abs(tfExpectancy).toFixed(2)}` : '—', c: tfExpectancy >= 0 ? '#38bdf8' : '#ff4757', sub: lang === 'fr' ? 'par trade' : 'per trade' },
                            { k: lang === 'fr' ? 'Moy. gain' : 'Avg Win',                v: tfWins.length > 0 ? `+$${tfAvgWin.toFixed(0)}` : '—', c: '#FDC800', sub: `${tfWins.length} ${lang === 'fr' ? 'gagnants' : 'winners'}` },
                            { k: lang === 'fr' ? 'Moy. perte' : 'Avg Loss',              v: tfLosses.length > 0 ? `-$${tfAvgLoss.toFixed(0)}` : '—', c: '#ff4757', sub: `${tfLosses.length} ${lang === 'fr' ? 'perdants' : 'losers'}` },
                            { k: lang === 'fr' ? 'Durée moy. gain' : 'Avg Win Hold',    v: fmtSecs(tfAvgWinDur), c: '#FDC800', sub: lang === 'fr' ? 'temps moyen gagnant' : 'avg winner hold time' },
                            { k: lang === 'fr' ? 'Durée moy. perte' : 'Avg Loss Hold',  v: fmtSecs(tfAvgLossDur), c: '#ff4757', sub: lang === 'fr' ? 'temps moyen perdant' : 'avg loser hold time' },
                            { k: lang === 'fr' ? 'Meilleur trade' : 'Best Trade',        v: tfBestTrade ? `+$${(tfBestTrade.pnl ?? 0).toFixed(0)}` : '—', c: '#FDC800', sub: tfBestTrade ? tfBestTrade.asset : '—' },
                            { k: lang === 'fr' ? 'Pire trade' : 'Worst Trade',           v: tfWorstTrade ? `-$${Math.abs(tfWorstTrade.pnl ?? 0).toFixed(0)}` : '—', c: '#ff4757', sub: tfWorstTrade ? tfWorstTrade.asset : '—' },
                            { k: lang === 'fr' ? 'Meilleure journée' : 'Best Day',       v: tfBestDay > 0 ? `+$${tfBestDay.toFixed(0)}` : '—', c: '#FDC800', sub: lang === 'fr' ? 'P&L journée max' : 'top day P&L' },
                            { k: lang === 'fr' ? 'Pire journée' : 'Worst Day',           v: tfWorstDay < 0 ? `-$${Math.abs(tfWorstDay).toFixed(0)}` : '—', c: '#ff4757', sub: lang === 'fr' ? 'P&L journée min' : 'worst day P&L' },
                            { k: lang === 'fr' ? 'Ratio G/P' : 'W/L Ratio',             v: tfWlRatio > 0 ? `${tfWlRatio.toFixed(2)}:1` : '—', c: tfWlRatio >= 1.5 ? '#FDC800' : tfWlRatio >= 1 ? '#EAB308' : '#ff4757', sub: `$${tfAvgWin.toFixed(0)} / $${tfAvgLoss.toFixed(0)}` },
                            { k: lang === 'fr' ? 'Sér. max gains' : 'Max Win Streak',    v: tfMaxConsecW > 0 ? `${tfMaxConsecW}` : '—', c: '#FDC800', sub: lang === 'fr' ? 'gains consécutifs' : 'consecutive wins' },
                            { k: lang === 'fr' ? 'Sér. max pertes' : 'Max Loss Streak',  v: tfMaxConsecL > 0 ? `${tfMaxConsecL}` : '—', c: '#ff4757', sub: lang === 'fr' ? 'pertes consécutives' : 'consecutive losses' },
                        ];
                        return isMobile ? (
                            <div style={{ borderBottom: divider, position: 'relative' }}>
                                <div style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
                                    {kpis.map((s, i) => (
                                        <div key={i} style={{ flexShrink: 0, minWidth: 120, padding: '16px 14px', borderRight: divider, scrollSnapAlign: 'start', background: '#0d1117' }}>
                                            <span style={lbl}>{s.k}</span>
                                            <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.c, letterSpacing: '-0.02em', display: 'block', marginTop: 4, lineHeight: 1 }}>{s.v}</span>
                                            <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>{s.sub}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 40, background: 'linear-gradient(to left, #0d1117 0%, transparent 100%)', pointerEvents: 'none' }} />
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: divider, borderTop: '1px solid #1a1c24', borderLeft: '1px solid #1a1c24' }}>
                                {kpis.map((s, i) => (
                                    <div key={i} style={{ padding: '14px 16px', borderRight: divider, borderBottom: '1px solid #1a1c24', background: '#0d1117' }}>
                                        <span style={lbl}>{s.k}</span>
                                        <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.c, letterSpacing: '-0.02em', display: 'block', marginTop: 4, lineHeight: 1 }}>{s.v}</span>
                                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>{s.sub}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {/* Collapsible charts section */}
                    {timeFilteredTrades.length >= 2 && (
                        <div style={{ borderBottom: divider }}>
                            {/* Charts header */}
                            <button
                                onClick={() => setChartsExpanded(p => !p)}
                                style={{ ...mono, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '10px 14px' : '10px 20px', background: '#0a0a0a', border: 'none', borderBottom: chartsExpanded ? divider : 'none', cursor: 'pointer', color: '#4b5563' }}>
                                <BarChart2 size={12} />
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
                                    {lang === 'fr' ? 'Graphiques' : 'Charts'}
                                </span>
                                {chartsExpanded ? <ChevronUp size={12} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={12} style={{ marginLeft: 'auto' }} />}
                            </button>
                            <AnimatePresence initial={false}>
                                {chartsExpanded && (
                                    <motion.div
                                        key="charts"
                                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 0 }}>
                                            {/* Equity Curve */}
                                            <div style={{ padding: isMobile ? '14px' : '18px 20px', borderRight: isMobile ? 'none' : divider, borderBottom: divider }}>
                                                <span style={lbl}>{lang === 'fr' ? 'Courbe de capital' : 'Equity Curve'}</span>
                                                <ResponsiveContainer width="100%" height={140}>
                                                    <AreaChart data={equityCurveData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                                                        <defs>
                                                            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#FDC800" stopOpacity={0.3} />
                                                                <stop offset="95%" stopColor="#FDC800" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1c24" />
                                                        <XAxis dataKey="i" tick={{ fontSize: 9, fill: '#4b5563', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
                                                        <YAxis tick={{ fontSize: 9, fill: '#4b5563', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={45} tickFormatter={v => `$${v}`} />
                                                        <RechartTooltip
                                                            contentStyle={{ background: '#0d1117', border: '1px solid #1a1c24', borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                                            labelStyle={{ color: '#4b5563' }}
                                                            formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(2)}`, lang === 'fr' ? 'Cumulé' : 'Cumulative']}
                                                        />
                                                        <Area type="monotone" dataKey="pnl" stroke="#FDC800" strokeWidth={1.5} fill="url(#equityGrad)" dot={false} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>

                                            {/* Daily P&L */}
                                            <div style={{ padding: isMobile ? '14px' : '18px 20px', borderBottom: divider }}>
                                                <span style={lbl}>{lang === 'fr' ? 'P&L journalier' : 'Daily P&L'}</span>
                                                <ResponsiveContainer width="100%" height={140}>
                                                    <BarChart data={dailyPnlData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1c24" />
                                                        <XAxis dataKey="d" tick={{ fontSize: 8, fill: '#4b5563', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
                                                        <YAxis tick={{ fontSize: 9, fill: '#4b5563', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={45} tickFormatter={v => `$${v}`} />
                                                        <RechartTooltip
                                                            contentStyle={{ background: '#0d1117', border: '1px solid #1a1c24', borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                                            formatter={(v: number | undefined) => { const n = v ?? 0; return [`${n >= 0 ? '+' : ''}$${n.toFixed(2)}`, 'P&L']; }}
                                                        />
                                                        <Bar dataKey="pnl" maxBarSize={20}>
                                                            {dailyPnlData.map((d, i) => (
                                                                <Cell key={i} fill={d.pnl >= 0 ? '#FDC800' : '#ff4757'} fillOpacity={0.85} />
                                                            ))}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>

                                            {/* By Symbol */}
                                            {bySymbolData.length > 0 && (
                                                <div style={{ padding: isMobile ? '14px' : '18px 20px', borderRight: isMobile ? 'none' : divider }}>
                                                    <span style={lbl}>{lang === 'fr' ? 'Par instrument' : 'By Symbol'}</span>
                                                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {bySymbolData.map((s, i) => {
                                                            const maxPnl = Math.max(...bySymbolData.map(x => Math.abs(x.pnl)));
                                                            const pct = maxPnl > 0 ? (Math.abs(s.pnl) / maxPnl) * 100 : 0;
                                                            return (
                                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: '#c9d1d9', width: 60, flexShrink: 0 }}>{s.sym}</span>
                                                                    <div style={{ flex: 1, height: 4, background: '#1a1c24', borderRadius: 2, overflow: 'hidden' }}>
                                                                        <div style={{ height: '100%', width: `${pct}%`, background: s.pnl >= 0 ? '#FDC800' : '#ff4757' }} />
                                                                    </div>
                                                                    <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: s.pnl >= 0 ? '#FDC800' : '#ff4757', width: 64, textAlign: 'right', flexShrink: 0 }}>
                                                                        {s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}
                                                                    </span>
                                                                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', width: 24, textAlign: 'right', flexShrink: 0 }}>{s.count}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* By Day of Week */}
                                            <div style={{ padding: isMobile ? '14px' : '18px 20px' }}>
                                                <span style={lbl}>{lang === 'fr' ? 'Par jour de semaine' : 'By Day of Week'}</span>
                                                <ResponsiveContainer width="100%" height={140}>
                                                    <BarChart data={byDowData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1c24" />
                                                        <XAxis dataKey="dow" tick={{ fontSize: 9, fill: '#4b5563', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
                                                        <YAxis tick={{ fontSize: 9, fill: '#4b5563', fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={45} tickFormatter={v => `$${v}`} />
                                                        <RechartTooltip
                                                            contentStyle={{ background: '#0d1117', border: '1px solid #1a1c24', borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                                            formatter={(v: number | undefined) => { const n = v ?? 0; return [`${n >= 0 ? '+' : ''}$${n.toFixed(2)}`, lang === 'fr' ? 'Moy.' : 'Avg']; }}
                                                        />
                                                        <Bar dataKey="avg" maxBarSize={32}>
                                                            {byDowData.map((d, i) => (
                                                                <Cell key={i} fill={d.avg >= 0 ? '#FDC800' : '#ff4757'} fillOpacity={0.85} />
                                                            ))}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </>
            )}

            {/* ── NOTES TAB ───────────────────────────────────── */}
            {journalTab === 'notes' && (
                <div style={{ padding: isMobile ? '14px' : '20px' }}>
                    {trades.filter(t => t.note && t.note.trim().length > 0).length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <BookOpen size={32} color="#1a1c24" style={{ margin: '0 auto 12px' }} />
                            <span style={{ ...mono, fontSize: 12, color: '#4b5563', display: 'block' }}>
                                {lang === 'fr' ? 'Aucune note. Développez un trade pour annoter.' : 'No notes yet. Expand a trade to annotate it.'}
                            </span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {trades
                                .filter(t => t.note && t.note.trim().length > 0)
                                .sort((a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime())
                                .map((t, i, arr) => (
                                    <div key={t.id} style={{ borderBottom: i < arr.length - 1 ? divider : 'none', padding: '16px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                            <span style={{ ...mono, fontSize: 11, fontWeight: 800, color: t.outcome === 'win' ? '#FDC800' : t.outcome === 'loss' ? '#ff4757' : '#EAB308' }}>
                                                {t.asset}
                                            </span>
                                            <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>{(t.outcome ?? 'open').toUpperCase()}</span>
                                            {t.pnl !== undefined && (
                                                <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: (t.pnl ?? 0) >= 0 ? '#FDC800' : '#ff4757' }}>
                                                    {(t.pnl ?? 0) >= 0 ? '+' : ''}${Math.abs(t.pnl ?? 0).toFixed(2)}
                                                </span>
                                            )}
                                            <span style={{ ...mono, fontSize: 9, color: '#4b5563', marginLeft: 'auto' }}>
                                                {new Date(t.closedAt ?? t.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p style={{ ...mono, fontSize: 12, color: '#8b949e', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{t.note}</p>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── INSIGHTS TAB ─────────────────────────────────── */}
            {journalTab === 'insights' && (
                <div style={{ padding: isMobile ? '14px' : '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {closedTrades.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <Brain size={32} color="#1a1c24" style={{ margin: '0 auto 12px' }} />
                            <span style={{ ...mono, fontSize: 12, color: '#4b5563', display: 'block' }}>
                                {lang === 'fr' ? 'Aucune donnée. Enregistrez vos trades pour débloquer les aperçus comportementaux.' : 'No data yet. Log trades to unlock behavioral insights.'}
                            </span>
                        </div>
                    ) : (
                        <>
                            {/* Behavioral observations — only render when the period has actual data */}
                            {timeFilteredTrades.length > 0 && (
                            <div style={{ background: '#0d1117', border: divider, padding: '16px 20px' }}>
                                <span style={{ ...lbl, marginBottom: 12, display: 'block' }}>
                                    {lang === 'fr' ? `Observations — ${timeFilteredTrades.length} trades · ${tfWins.length}W ${tfLosses.length}L` : `Observations — ${timeFilteredTrades.length} trades · ${tfWins.length}W ${tfLosses.length}L`}
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {[
                                        {
                                            icon: '→',
                                            color: tfWinRate >= 55 ? '#FDC800' : '#ff4757',
                                            text: lang === 'fr'
                                                ? `Taux de réussite ${tfWinRate}% (${tfWins.length}W/${timeFilteredTrades.length}T) — ${tfWinRate >= 55 ? 'au-dessus du seuil de rentabilité' : 'en dessous du seuil de rentabilité'}`
                                                : `${tfWinRate}% win rate (${tfWins.length}W/${timeFilteredTrades.length}T) — ${tfWinRate >= 55 ? 'above breakeven threshold' : 'below breakeven threshold'}`
                                        },
                                        {
                                            icon: '→',
                                            color: tfPf >= 1 ? '#FDC800' : '#ff4757',
                                            text: lang === 'fr'
                                                ? `Facteur de profit ${tfPf > 90 ? '∞' : tfPf.toFixed(2)}x — ${tfPf >= 1.5 ? 'excellent edge statistique' : tfPf >= 1 ? 'edge positif, à consolider' : 'edge négatif, réviser la stratégie'}`
                                                : `Profit factor ${tfPf > 90 ? '∞' : tfPf.toFixed(2)}x — ${tfPf >= 1.5 ? 'excellent statistical edge' : tfPf >= 1 ? 'positive edge, keep refining' : 'negative edge, revisit strategy'}`
                                        },
                                        ...(tfAvgWin > 0 && tfAvgLoss > 0 ? [{
                                            icon: '→',
                                            color: tfAvgWin > tfAvgLoss ? '#FDC800' : '#EAB308',
                                            text: lang === 'fr'
                                                ? `Ratio gain/perte moyen : $${tfAvgWin.toFixed(0)} / $${tfAvgLoss.toFixed(0)} — ${tfAvgWin > tfAvgLoss ? 'winners plus grands que losers' : 'losers plus grands que winners, surveiller les stops'}`
                                                : `Avg win/loss ratio: $${tfAvgWin.toFixed(0)} / $${tfAvgLoss.toFixed(0)} — ${tfAvgWin > tfAvgLoss ? 'winners larger than losers' : 'losers larger than winners, review stops'}`
                                        }] : []),
                                        ...(byDowData.length > 0 ? (() => {
                                            const best = byDowData.reduce((a, b) => a.avg > b.avg ? a : b);
                                            const worst = byDowData.reduce((a, b) => a.avg < b.avg ? a : b);
                                            return best.count > 0 ? [{
                                                icon: '→',
                                                color: '#38bdf8',
                                                text: lang === 'fr'
                                                    ? `Meilleur jour : ${best.dow} (+$${best.avg.toFixed(2)} moy.) · Pire : ${worst.dow} (${worst.avg >= 0 ? '+' : ''}$${worst.avg.toFixed(2)} moy.)`
                                                    : `Best day: ${best.dow} (+$${best.avg.toFixed(2)} avg) · Worst: ${worst.dow} (${worst.avg >= 0 ? '+' : ''}$${worst.avg.toFixed(2)} avg)`
                                            }] : [];
                                        })() : []),
                                    ].map((obs, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                            <span style={{ ...mono, fontSize: 12, color: obs.color, flexShrink: 0, marginTop: 1 }}>{obs.icon}</span>
                                            <span style={{ ...mono, fontSize: 12, color: '#c9d1d9', lineHeight: 1.6 }}>{obs.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            )}

                            {/* Actionable coaching rules — derived from ALL-TIME data so they're always meaningful */}
                            {closedTrades.length >= 3 && (
                            <div style={{ background: '#0d1117', border: divider, padding: '16px 20px' }}>
                                <span style={{ ...lbl, marginBottom: 12, display: 'block' }}>
                                    {lang === 'fr' ? `Règles de coaching — ${closedTrades.length} trades analysés` : `Coaching Rules — ${closedTrades.length} trades analysed`}
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {[
                                        winRate < 50
                                            ? (lang === 'fr' ? `⛔ Taux de réussite ${winRate}% — réduire la taille des positions jusqu'à dépasser 50% sur 20 trades.` : `⛔ Win rate ${winRate}% — reduce position size until you exceed 50% over 20 trades.`)
                                            : (lang === 'fr' ? `✓ Taux de réussite ${winRate}% — solide. Maximisez la taille sur les setups A+.` : `✓ Win rate ${winRate}% — solid. Maximise size on A+ setups.`),
                                        profitFactor < 1
                                            ? (lang === 'fr' ? `⛔ Facteur de profit ${profitFactor.toFixed(2)} — couper les pertes plus tôt ou laisser courir les gagnants.` : `⛔ Profit factor ${profitFactor.toFixed(2)} — cut losses sooner or let winners run further.`)
                                            : (lang === 'fr' ? `✓ Facteur de profit ${profitFactor.toFixed(2)} — positif. Continuez à respecter vos take profits.` : `✓ Profit factor ${profitFactor.toFixed(2)} — positive. Keep honoring your take profits.`),
                                        disciplineScore < 70
                                            ? (lang === 'fr' ? `⛔ Score de discipline ${disciplineScore}/100 — délai obligatoire de 10 min après chaque perte.` : `⛔ Discipline score ${disciplineScore}/100 — enforce a 10-minute cooling-off rule after each loss.`)
                                            : (lang === 'fr' ? `✓ Discipline ${disciplineScore}/100 — bonne régulation émotionnelle détectée.` : `✓ Discipline ${disciplineScore}/100 — good emotional regulation detected.`),
                                        traceabilityScore.pct < 50
                                            ? (lang === 'fr' ? `⛔ ${traceabilityScore.pct}% des trades annotés — documentez chaque trade : setup, biais, émotion.` : `⛔ ${traceabilityScore.pct}% of trades annotated — document every trade: setup, bias, emotion.`)
                                            : (lang === 'fr' ? `✓ ${traceabilityScore.pct}% des trades annotés — les patterns comportementaux sont détectables.` : `✓ ${traceabilityScore.pct}% of trades annotated — behavioral patterns are now detectable.`),
                                        consistencyStreak === 0
                                            ? (lang === 'fr' ? '⛔ Aucun trade fermé aujourd\'hui — la régularité est le premier pilier de la progression.' : '⛔ No closed trades today — consistency is the first pillar of improvement.')
                                            : (lang === 'fr' ? `✓ Série de ${consistencyStreak} jour${consistencyStreak > 1 ? 's' : ''} — la régularité construit l'edge de long terme.` : `✓ ${consistencyStreak}-day streak — consistency builds long-term edge.`),
                                    ].map((rule, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: i < 4 ? '1px solid #131519' : 'none' }}>
                                            <span style={{ ...mono, fontSize: 12, color: rule.startsWith('⛔') ? '#ff4757' : '#FDC800', lineHeight: 1.6 }}>{rule}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── FILTER + VIEW TOGGLE ────────────────────────── */}
            {journalTab === 'trades' && trades.length > 0 && (
                <div style={{ padding: isMobile ? '8px 14px' : '10px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* Outcome filters */}
                    {(['all', 'win', 'loss', 'open'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '5px 12px',
                            border: '1px solid', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.15s',
                            background: filter === f ? (f === 'win' ? '#FDC800' : f === 'loss' ? '#ff4757' : f === 'open' ? '#EAB308' : '#e2e8f0') : 'transparent',
                            color: filter === f ? '#000' : '#6b7280',
                            borderColor: filter === f ? (f === 'win' ? '#FDC800' : f === 'loss' ? '#ff4757' : f === 'open' ? '#EAB308' : '#e2e8f0') : '#1a1c24',
                        }}>
                            {f === 'all' ? `${lang === 'fr' ? 'Tous' : 'All'} (${trades.length})` : f === 'win' ? `${lang === 'fr' ? 'Gains' : 'Wins'} (${wins.length})` : f === 'loss' ? `${lang === 'fr' ? 'Pertes' : 'Losses'} (${losses.length})` : `${lang === 'fr' ? 'Ouvert' : 'Open'} (${trades.filter(t => t.outcome === 'open').length})`}
                        </button>
                    ))}

                    {/* Asset filter */}
                    {uniqueAssets.length > 1 && (
                        <select
                            value={assetFilter}
                            onChange={e => setAssetFilter(e.target.value)}
                            style={{ ...mono, fontSize: 10, fontWeight: 700, padding: '5px 10px', background: '#0d1117', border: '1px solid #1a1c24', color: assetFilter ? '#FDC800' : '#6b7280', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="">{lang === 'fr' ? 'Tous les actifs' : 'All Assets'}</option>
                            {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    )}

                    {/* Results count */}
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', marginLeft: 4 }}>
                        {totalShown} {lang === 'fr' ? `trade${totalShown !== 1 ? 's' : ''} trouvé${totalShown !== 1 ? 's' : ''}` : `trade${totalShown !== 1 ? 's' : ''} shown`}
                    </span>

                    {/* View toggle — right side */}
                    <div style={{ marginLeft: 'auto', display: 'flex', border: divider, overflow: 'hidden' }}>
                        <button onClick={() => setViewMode('list')} style={{ ...mono, fontSize: 10, fontWeight: 700, padding: '5px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: viewMode === 'list' ? '#e2e8f0' : 'transparent', color: viewMode === 'list' ? '#000' : '#6b7280' }}>
                            <LayoutList size={12} /> {lang === 'fr' ? 'Liste' : 'List'}
                        </button>
                        <button onClick={() => setViewMode('calendar')} style={{ ...mono, fontSize: 10, fontWeight: 700, padding: '5px 12px', border: 'none', borderLeft: divider, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: viewMode === 'calendar' ? '#e2e8f0' : 'transparent', color: viewMode === 'calendar' ? '#000' : '#6b7280' }}>
                            <CalendarDays size={12} /> {lang === 'fr' ? 'Calendrier' : 'Calendar'}
                        </button>
                    </div>
                </div>
            )}


            {/* ── STREAK BEADS ────────────────────────────────── */}
            {journalTab === 'trades' && trades.length > 0 && (
                <div style={{ padding: isMobile ? '8px 14px' : '10px 20px', borderBottom: '1px solid #1a1c24' }}>
                    <ChartCard
                        title={lang === 'fr' ? 'SÉRIE' : 'STREAK'}
                        subtitle={lang === 'fr' ? 'Derniers 40 trades — jaune = gain, rouge = perte' : 'Last 40 trades — yellow = win, red = loss'}
                    >
                        <StreakBeads data={journalStreakData} height={44} maxBeads={40} />
                    </ChartCard>
                </div>
            )}

            {/* ── EMPTY STATE ─────────────────────────────────── */}
            {journalTab === 'trades' && trades.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', gap: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 40, lineHeight: 1 }}>📋</div>
                    <span style={{ ...mono, fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginTop: 8 }}>{lang === 'fr' ? 'Aucun trade enregistré' : 'No trades logged yet'}</span>
                    <span style={{ ...mono, fontSize: 12, color: '#4b5563', maxWidth: 280, lineHeight: 1.7 }}>
                        {lang === 'fr' ? 'Importez votre relevé Tradeify ou enregistrez des trades via le Moteur de Risque.' : 'Import your Tradeify statement or log trades via the Risk Engine to begin your audit trail.'}
                    </span>
                    <button
                        onClick={() => pdfRef.current?.click()}
                        disabled={pdfStatus.loading}
                        style={{ ...mono, marginTop: 8, padding: '12px 24px', background: '#FDC800', color: '#000', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        {pdfStatus.loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={14} />}
                        {lang === 'fr' ? 'Importer PDF Tradeify' : 'Import Tradeify PDF'}
                    </button>
                    <button
                        onClick={() => setActiveTab('calculator')}
                        style={{ ...mono, marginTop: 4, padding: '12px 24px', background: 'transparent', color: '#8b949e', border: '1px solid #1a1c24', cursor: 'pointer', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        {lang === 'fr' ? 'Enregistrer un trade' : 'Log a Trade'}
                    </button>
                </div>
            )}

            {/* ── LIST VIEW ───────────────────────────────────── */}
            {journalTab === 'trades' && trades.length > 0 && viewMode === 'list' && (
                <div>
                    {groupedByDay.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <span style={{ ...mono, fontSize: 12, color: '#4b5563' }}>{lang === 'fr' ? 'Aucun trade ne correspond aux filtres.' : 'No trades match your filters.'}</span>
                        </div>
                    ) : (
                        groupedByDay.map(({ day, trades: dayTrades, dayPnl, dayWins, dayLosses }) => (
                            <div key={day}>
                                {/* Day group header */}
                                <div style={{
                                    padding: '10px 20px', background: '#0d1117', borderBottom: divider, borderTop: divider,
                                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                                }}>
                                    <span style={{ ...mono, fontSize: 11, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                                        {fmtDayLabel(day)}
                                    </span>
                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>{dayTrades.length} trade{dayTrades.length !== 1 ? 's' : ''}</span>
                                    {dayTrades.some(t => t.outcome !== 'open') && (
                                        <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: dayPnl >= 0 ? '#FDC800' : '#ff4757' }}>
                                            {dayPnl >= 0 ? '+' : ''}${dayPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    )}
                                    {/* Win rate badge for day */}
                                    {(dayWins + dayLosses) > 0 && (
                                        <span style={{
                                            ...mono, fontSize: 9, fontWeight: 700, padding: '2px 7px',
                                            background: dayWins > dayLosses ? 'rgba(253,200,0,0.08)' : 'rgba(255,71,87,0.08)',
                                            border: `1px solid ${dayWins > dayLosses ? 'rgba(253,200,0,0.2)' : 'rgba(255,71,87,0.2)'}`,
                                            color: dayWins > dayLosses ? '#FDC800' : '#ff4757',
                                        }}>
                                            {dayWins}W {dayLosses}L
                                        </span>
                                    )}
                                    {/* W/L dot sequence */}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {dayTrades.slice(0, isMobile ? 10 : 30).map((t, i) => (
                                            <div key={i} title={t.outcome === 'win' ? 'Win' : t.outcome === 'loss' ? 'Loss' : 'Open'} style={{
                                                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                background: t.outcome === 'win' ? '#FDC800' : t.outcome === 'loss' ? '#ff4757' : '#4b5563',
                                                opacity: 0.9,
                                            }} />
                                        ))}
                                        {isMobile && dayTrades.length > 10 && (
                                            <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>+{dayTrades.length - 10}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Trade cards */}
                                {dayTrades.map((trade) => {
                                    const isWin = trade.outcome === 'win';
                                    const isLoss = trade.outcome === 'loss';
                                    const accentColor = isWin ? '#FDC800' : isLoss ? '#ff4757' : '#EAB308';
                                    const pnlVal = trade.pnl ?? 0;
                                    const holdStr = calcHoldTime(trade.createdAt, trade.closedAt);
                                    const isExpanded = expandedId === trade.id;

                                    return (
                                        <motion.div
                                            key={trade.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            style={{
                                                borderBottom: divider,
                                                borderLeft: `3px solid ${accentColor}`,
                                                display: 'flex', flexDirection: 'column',
                                            }}
                                        >
                                            {/* Main row */}
                                            <div
                                                style={{ padding: isMobile ? '12px 14px' : '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}
                                                onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                                            >
                                                {/* Left: direction + asset + meta */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                                                    {/* LONG/SHORT badge */}
                                                    <span style={{
                                                        ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', flexShrink: 0,
                                                        background: trade.isShort ? 'rgba(255,71,87,0.1)' : 'rgba(253,200,0,0.08)',
                                                        color: trade.isShort ? '#ff4757' : '#FDC800',
                                                        border: `1px solid ${trade.isShort ? 'rgba(255,71,87,0.3)' : 'rgba(253,200,0,0.2)'}`,
                                                    }}>
                                                        {trade.isShort ? 'SHORT' : 'LONG'}
                                                    </span>
                                                    {/* Asset name */}
                                                    <span style={{ ...mono, fontSize: 15, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.02em', flexShrink: 0 }}>
                                                        {trade.asset}
                                                    </span>
                                                    {/* Outcome badge */}
                                                    <span style={{
                                                        ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '2px 7px', flexShrink: 0,
                                                        color: accentColor,
                                                        border: `1px solid ${isWin ? 'rgba(253,200,0,0.25)' : isLoss ? 'rgba(255,71,87,0.3)' : 'rgba(234,179,8,0.3)'}`,
                                                    }}>
                                                        {(trade.outcome ?? 'OPEN').toUpperCase()}
                                                    </span>
                                                    {/* Time */}
                                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                                        {fmtTime(trade.createdAt)}{trade.closedAt ? ` → ${fmtTime(trade.closedAt)}` : ''}{holdStr !== '—' ? ` · ${holdStr}` : ''}
                                                    </span>
                                                </div>

                                                {/* Right: P&L + inline outcome for open + expand + delete */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexShrink: 1, flexWrap: 'wrap', minWidth: isMobile ? 120 : 200, justifyContent: 'flex-end' }}>
                                                    <div
                                                        style={{ textAlign: 'right', cursor: trade.source && trade.source !== 'manual' ? 'default' : 'pointer', padding: '4px', borderRadius: 4 }}
                                                        onClick={(e) => { if (trade.source && trade.source !== 'manual') return; e.stopPropagation(); setInlineOutcomeId(trade.id); }}
                                                        title={trade.source && trade.source !== 'manual' ? undefined : 'Tap to edit outcome/P&L'}
                                                    >
                                                        <span style={{ ...mono, fontSize: 16, fontWeight: 800, color: accentColor, letterSpacing: '-0.02em', display: 'block' }}>
                                                            {isWin ? '+' : isLoss ? '-' : '~'}${Math.abs(pnlVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        {trade.rr > 0 && (
                                                            <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{trade.rr.toFixed(1)}R</span>
                                                        )}
                                                    </div>
                                                    {/* Inline WIN/LOSS buttons — manual trades only */}
                                                    {(!trade.source || trade.source === 'manual') && (trade.outcome === 'open' || inlineOutcomeId === trade.id) && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                                                            {inlineOutcomeId === trade.id && (
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder="P&L"
                                                                    autoFocus
                                                                    value={inlineWinInput[trade.id] ?? ''}
                                                                    onChange={e => {
                                                                        setInlineWinInput(prev => ({ ...prev, [trade.id]: e.target.value }));
                                                                        setInlineLossInput(prev => ({ ...prev, [trade.id]: e.target.value }));
                                                                    }}
                                                                    onKeyDown={e => { if (e.key === 'Escape') setInlineOutcomeId(null); }}
                                                                    style={{ ...mono, width: 68, background: '#0d1117', border: '1px solid #1a1c24', color: '#e2e8f0', padding: '4px 6px', fontSize: 11, outline: 'none' }}
                                                                />
                                                            )}
                                                            <button
                                                                title="Mark as Won"
                                                                onClick={() => {
                                                                    const minHoldMs = ((account.minHoldTimeSec ?? 20)) * 1000;
                                                                    // Only enforce hold-time for still-open trades (not re-labelling a closed one)
                                                                    if (trade.outcome === 'open' && !trade.closedAt) {
                                                                        const holdMs = Date.now() - new Date(trade.createdAt).getTime();
                                                                        if (holdMs < minHoldMs) {
                                                                            alert(`Minimum hold time is ${account.minHoldTimeSec ?? 20}s (prop-firm rule). Wait ${Math.ceil((minHoldMs - holdMs) / 1000)}s more.`);
                                                                            return;
                                                                        }
                                                                    }
                                                                    const holdMs = trade.closedAt
                                                                        ? new Date(trade.closedAt).getTime() - new Date(trade.createdAt).getTime()
                                                                        : Date.now() - new Date(trade.createdAt).getTime();
                                                                    const raw = inlineWinInput[trade.id] ?? '';
                                                                    const val = raw !== '' ? parseFloat(raw) : trade.rewardUSD;
                                                                    if (isNaN(val)) return;
                                                                    setTrades(trades.map(t => t.id === trade.id ? {
                                                                        ...t, outcome: 'win', pnl: Math.abs(val),
                                                                        closedAt: t.closedAt || new Date().toISOString(),
                                                                        durationSeconds: Math.floor(holdMs / 1000),
                                                                    } : t));
                                                                    setInlineOutcomeId(null);
                                                                    setInlineWinInput(prev => { const n = { ...prev }; delete n[trade.id]; return n; });
                                                                }}
                                                                style={{ ...mono, fontSize: 9, fontWeight: 800, padding: '4px 7px', background: 'rgba(253,200,0,0.1)', color: '#FDC800', border: '1px solid rgba(253,200,0,0.3)', cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0 }}
                                                            >✓ {lang === 'fr' ? 'GAIN' : 'WIN'}</button>
                                                            <button
                                                                title="Mark as Lost"
                                                                onClick={() => {
                                                                    const minHoldMs2 = ((account.minHoldTimeSec ?? 20)) * 1000;
                                                                    if (trade.outcome === 'open' && !trade.closedAt) {
                                                                        const holdMs = Date.now() - new Date(trade.createdAt).getTime();
                                                                        if (holdMs < minHoldMs2) {
                                                                            alert(`Minimum hold time is ${account.minHoldTimeSec ?? 20}s (prop-firm rule). Wait ${Math.ceil((minHoldMs2 - holdMs) / 1000)}s more.`);
                                                                            return;
                                                                        }
                                                                    }
                                                                    const holdMs2 = trade.closedAt
                                                                        ? new Date(trade.closedAt).getTime() - new Date(trade.createdAt).getTime()
                                                                        : Date.now() - new Date(trade.createdAt).getTime();
                                                                    const raw = inlineLossInput[trade.id] ?? '';
                                                                    const val = raw !== '' ? parseFloat(raw) : trade.riskUSD;
                                                                    if (isNaN(val)) return;
                                                                    setTrades(trades.map(t => t.id === trade.id ? {
                                                                        ...t, outcome: 'loss', pnl: -Math.abs(val),
                                                                        closedAt: t.closedAt || new Date().toISOString(),
                                                                        durationSeconds: Math.floor(holdMs2 / 1000),
                                                                    } : t));
                                                                    setInlineOutcomeId(null);
                                                                    setInlineLossInput(prev => { const n = { ...prev }; delete n[trade.id]; return n; });
                                                                }}
                                                                style={{ ...mono, fontSize: 9, fontWeight: 800, padding: '4px 7px', background: 'rgba(255,71,87,0.1)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0 }}
                                                            >✗ {lang === 'fr' ? 'PERTE' : 'LOSS'}</button>
                                                        </div>
                                                    )}
                                                    {isExpanded ? <ChevronUp size={14} color="#4b5563" /> : <ChevronDown size={14} color="#4b5563" />}
                                                    <button
                                                        onClick={e => { e.stopPropagation(); deleteTrade(trade.id); }}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: '2px', lineHeight: 1, flexShrink: 0 }}
                                                        onMouseEnter={e => (e.currentTarget.style.color = '#ff4757')}
                                                        onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
                                                        title="Delete trade"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded detail panel */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        style={{ overflow: 'hidden', borderTop: divider, background: '#0a0a0a' }}
                                                    >
                                                        {/* Meta grid: ENTRY | SL | TP | R:R | SIZE */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', borderBottom: divider }}>
                                                            {[
                                                                { k: lang === 'fr' ? 'Entrée' : 'Entry', v: trade.entry > 0 ? trade.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—', c: '#e2e8f0' },
                                                                { k: 'Stop Loss', v: trade.stopLoss > 0 ? trade.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—', c: '#ff4757' },
                                                                { k: 'Take Profit', v: trade.takeProfit > 0 ? trade.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—', c: '#FDC800' },
                                                                { k: lang === 'fr' ? 'Risque/Récompense' : 'Risk : Reward', v: trade.rr > 0 ? `${trade.rr.toFixed(2)}R` : '—', c: '#00D4FF' },
                                                                { k: lang === 'fr' ? 'Taille' : 'Size', v: trade.lotSize > 0 ? trade.lotSize.toLocaleString() : '—', c: '#e2e8f0' },
                                                            ].map((m, i, arr) => {
                                                                const cols = isMobile ? 2 : 5;
                                                                const col = i % cols;
                                                                const isLastCol = col === cols - 1 || i === arr.length - 1;
                                                                const isLastRow = i >= arr.length - cols;
                                                                return (
                                                                    <div key={i} style={{
                                                                        padding: isMobile ? '10px 12px' : '12px 14px',
                                                                        borderRight: isLastCol ? 'none' : divider,
                                                                        borderBottom: isMobile && !isLastRow ? divider : 'none',
                                                                    }}>
                                                                        <span style={lbl}>{m.k}</span>
                                                                        <span style={{ ...mono, fontSize: isMobile ? 13 : 14, fontWeight: 700, color: m.c, display: 'block', marginTop: 3 }}>{m.v}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        
                                                        {/* Outcome Editor */}
                                                        <div style={{ padding: '12px 14px', borderBottom: divider, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <span style={{ ...lbl, minWidth: 80 }}>{lang === 'fr' ? 'Résoudre' : 'Resolve'}</span>
                                                            <div style={{ display: 'flex', alignItems: 'center', background: '#0d1117', border: '1px solid #1a1c24', padding: '0 8px' }}>
                                                                <span style={{ ...mono, color: '#4b5563', fontSize: 13 }}>$</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder="P&L"
                                                                    value={editPnls[trade.id] ?? (trade.pnl !== undefined ? String(Math.abs(trade.pnl)) : '')}
                                                                    onChange={e => setEditPnls(prev => ({ ...prev, [trade.id]: e.target.value }))}
                                                                    style={{ ...mono, background: 'transparent', border: 'none', color: '#e2e8f0', padding: '8px 4px', width: 80, fontSize: 13, outline: 'none' }}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                     const minHold = (account.minHoldTimeSec ?? 20) * 1000;
                                                                     if (trade.outcome === 'open' && !trade.closedAt) {
                                                                         const holdMs = Date.now() - new Date(trade.createdAt).getTime();
                                                                         if (holdMs < minHold) { alert(`Hold time: ${Math.ceil((minHold - holdMs) / 1000)}s remaining (prop-firm rule).`); return; }
                                                                     }
                                                                     const holdMs = trade.closedAt
                                                                         ? new Date(trade.closedAt).getTime() - new Date(trade.createdAt).getTime()
                                                                         : Date.now() - new Date(trade.createdAt).getTime();
                                                                     const val = parseFloat(editPnls[trade.id] ?? String(Math.abs(trade.pnl ?? 0)));
                                                                     if (!isNaN(val)) setTrades(trades.map(t => t.id === trade.id ? { ...t, outcome: 'win', pnl: Math.abs(val), closedAt: t.closedAt || new Date().toISOString(), durationSeconds: Math.floor(holdMs / 1000) } : t));
                                                                }}
                                                                style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'rgba(253,200,0,0.1)', color: '#FDC800', border: '1px solid rgba(253,200,0,0.3)', cursor: 'pointer' }}
                                                            >{lang === 'fr' ? 'Marquer Gain' : 'Mark Won'}</button>
                                                            <button
                                                                onClick={() => {
                                                                     const minHold = (account.minHoldTimeSec ?? 20) * 1000;
                                                                     if (trade.outcome === 'open' && !trade.closedAt) {
                                                                         const holdMs = Date.now() - new Date(trade.createdAt).getTime();
                                                                         if (holdMs < minHold) { alert(`Hold time: ${Math.ceil((minHold - holdMs) / 1000)}s remaining (prop-firm rule).`); return; }
                                                                     }
                                                                     const holdMs = trade.closedAt
                                                                         ? new Date(trade.closedAt).getTime() - new Date(trade.createdAt).getTime()
                                                                         : Date.now() - new Date(trade.createdAt).getTime();
                                                                     const val = parseFloat(editPnls[trade.id] ?? String(Math.abs(trade.pnl ?? 0)));
                                                                     if (!isNaN(val)) setTrades(trades.map(t => t.id === trade.id ? { ...t, outcome: 'loss', pnl: -Math.abs(val), closedAt: t.closedAt || new Date().toISOString(), durationSeconds: Math.floor(holdMs / 1000) } : t));
                                                                }}
                                                                style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'rgba(255,71,87,0.1)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', cursor: 'pointer' }}
                                                            >{lang === 'fr' ? 'Marquer Perte' : 'Mark Lost'}</button>
                                                        </div>

                                                        {/* Bias / Setup / Exit classifiers */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: '#1a1c24', borderTop: '1px solid #1a1c24' }}>
                                                            {[
                                                                {
                                                                    label: lang === 'fr' ? 'BIAIS COGNITIF' : 'COGNITIVE BIAS',
                                                                    field: 'biasTag' as const,
                                                                    options: ['Planned', 'FOMO', 'Revenge', 'Overconfidence', 'Loss Aversion'] as const,
                                                                    current: trade.biasTag,
                                                                    colors: { Planned: '#FDC800', FOMO: '#F97316', Revenge: '#ff4757', Overconfidence: '#EAB308', 'Loss Aversion': '#8b5cf6' },
                                                                },
                                                                {
                                                                    label: lang === 'fr' ? 'QUALITÉ SETUP' : 'SETUP QUALITY',
                                                                    field: 'setupType' as const,
                                                                    options: ['A+', 'B', 'Impulse'] as const,
                                                                    current: trade.setupType,
                                                                    colors: { 'A+': '#FDC800', B: '#EAB308', Impulse: '#ff4757' },
                                                                },
                                                                {
                                                                    label: lang === 'fr' ? 'RAISON SORTIE' : 'EXIT REASON',
                                                                    field: 'exitReason' as const,
                                                                    options: ['TP', 'SL', 'Manual', 'Margin'] as const,
                                                                    current: trade.exitReason,
                                                                    colors: { TP: '#FDC800', SL: '#ff4757', Manual: '#EAB308', Margin: '#ff4757' },
                                                                },
                                                            ].map(({ label, field, options, current, colors }) => (
                                                                <div key={field} style={{ background: '#0b0e14', padding: '8px 10px' }}>
                                                                    <div style={{ ...mono, fontSize: 8, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                        {options.map(opt => (
                                                                            <button
                                                                                key={opt}
                                                                                onClick={() => updateTradeFields(trade.id, { [field]: current === opt ? undefined : opt })}
                                                                                style={{
                                                                                    ...mono, fontSize: 9, fontWeight: 700, padding: '2px 7px',
                                                                                    border: `1px solid ${current === opt ? (colors as unknown as Record<string, string>)[opt] : '#1a1c24'}`,
                                                                                    background: current === opt ? `${(colors as unknown as Record<string, string>)[opt]}18` : 'transparent',
                                                                                    color: current === opt ? (colors as unknown as Record<string, string>)[opt] : '#6b7280',
                                                                                    cursor: 'pointer', letterSpacing: '0.04em',
                                                                                }}
                                                                            >{opt}</button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Journal note */}
                                                        <div style={{ padding: isMobile ? '10px 12px' : '12px 16px' }}>
                                                            <span style={lbl}>{lang === 'fr' ? 'Note de trade' : 'Trade Note'}</span>
                                                            <textarea
                                                                placeholder={`What was your setup rationale?\nHow did you feel entering this trade?\nWould you take this trade again?`}
                                                                value={trade.note ?? ''}
                                                                onChange={e => updateTradeNote(trade.id, e.target.value)}
                                                                rows={3}
                                                                style={{
                                                                    ...mono, width: '100%', background: 'transparent', border: '1px solid #1a1c24', color: '#8b949e',
                                                                    fontSize: isMobile ? 14 : 12, padding: '10px 12px', resize: 'vertical', outline: 'none',
                                                                    marginTop: 6, lineHeight: 1.6, minHeight: 72, boxSizing: 'border-box',
                                                                    transition: 'border-color 0.15s',
                                                                }}
                                                                onFocus={e => (e.currentTarget.style.borderColor = '#FDC800')}
                                                                onBlur={e => (e.currentTarget.style.borderColor = '#1a1c24')}
                                                            />
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ── CALENDAR VIEW ───────────────────────────────── */}
            {journalTab === 'trades' && trades.length > 0 && viewMode === 'calendar' && (
                <>
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={styles.calendarContainer} style={isMobile ? { borderRadius: 0, margin: 0 } : {}}>
                    <div className={styles.calendarHeader}>
                        <div className={styles.calendarNav}>
                            <button onClick={prevMonth} aria-label="Previous Month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', padding: '4px', display: 'flex', alignItems: 'center' }}><ChevronLeft size={16} /></button>
                            <h3 className={styles.calendarTitle}>{calendarData.monthName} {calendarData.year}</h3>
                            <button onClick={nextMonth} aria-label="Next Month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', padding: '4px', display: 'flex', alignItems: 'center' }}><ChevronRight size={16} /></button>
                        </div>
                        <button onClick={() => setCalendarDate(new Date())} className={styles.btnToday}>Today</button>
                    </div>
                    <div className={styles.calendarGrid}>
                        <div className={styles.calendarHeaderRow}>
                            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su', 'Wk'].map((d, i) => (
                                <div key={i} className={styles.calendarDayName}>{d}</div>
                            ))}
                        </div>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={`${calendarData.year}-${calendarData.month}`}
                                initial={{ opacity: 0, x: calendarDir * 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: calendarDir * -30 }}
                                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            >
                                {calendarData.weeks.map((week, wi) => (
                                    <div key={wi} className={styles.calendarRow}>
                                        {week.days.map((dayData: { day: number; isCurrentMonth: boolean; isToday: boolean; pnl: number; tradesCount: number; date?: string; }, i: number) => (
                                            <div
                                                key={i}
                                                className={`${styles.calendarCell} ${!dayData.isCurrentMonth ? styles.calendarCellOut : ''} ${dayData.isToday ? styles.calendarCellToday : ''} ${dayData.pnl > 0 ? styles.pnlPositiveFill : dayData.pnl < 0 ? styles.pnlNegativeFill : ''} ${dayData.isCurrentMonth && dayData.tradesCount > 0 ? styles.calendarCellClickable : ''} ${dayData.date && selectedDay === dayData.date ? styles.calendarCellSelected : ''}`}
                                                onClick={() => {
                                                    if (dayData.isCurrentMonth && dayData.date) {
                                                        setSelectedDay(prev => prev === dayData.date ? null : dayData.date!);
                                                    }
                                                }}
                                                style={dayData.isCurrentMonth && dayData.tradesCount > 0 ? { cursor: 'pointer' } : undefined}
                                            >
                                                <span className={styles.calendarCellDate}>{dayData.day}</span>
                                                <div className={styles.calendarCellContent}>
                                                    {dayData.tradesCount > 0 && (
                                                        <>
                                                            <span className={`${styles.calendarCellPnl} ${dayData.pnl >= 0 ? styles.pnlPositiveText : styles.pnlNegativeText}`}>
                                                                {dayData.pnl >= 0 ? '+' : '-'}${Math.abs(dayData.pnl).toFixed(2)}
                                                            </span>
                                                            <span className={styles.calendarTrades}>{dayData.tradesCount} {dayData.tradesCount === 1 ? 'trade' : 'trades'}</span>
                                                            {dayNotes?.[dayData.date ?? ''] && (
                                                                <span style={{ display: 'block', marginTop: 2, width: 5, height: 5, borderRadius: '50%', background: '#FDC800', margin: '2px auto 0' }} />
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        <div className={`${styles.calendarCell} ${styles.calendarWeeklyCell}`}>
                                            <span className={styles.weeklyLabel}>Wk {week.weekNumber}</span>
                                            <span className={`${styles.calendarCellPnl} ${week.weekPnl >= 0 ? styles.pnlPositiveText : styles.pnlNegativeText}`}>
                                                {week.weekPnl >= 0 ? '+' : '-'}${Math.abs(week.weekPnl).toFixed(2)}
                                            </span>
                                            <span className={styles.calendarTrades}>{week.weekTrades}t</span>
                                        </div>
                                    </div>
                                ))}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </motion.div>

            {/* Day detail panel */}
            <AnimatePresence>
                {selectedDay && (() => {
                    const dayTrades = trades
                        .filter(t => getTradingDay(t.closedAt ?? t.createdAt) === selectedDay)
                        .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
                    const dayPnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
                    const wins = dayTrades.filter(t => t.outcome === 'win').length;
                    const losses = dayTrades.filter(t => t.outcome === 'loss').length;
                    const winRate = dayTrades.length > 0 ? Math.round((wins / dayTrades.length) * 100) : 0;
                    const bestTrade = dayTrades.reduce((b, t) => (t.pnl ?? 0) > (b?.pnl ?? -Infinity) ? t : b, dayTrades[0]);
                    const worstTrade = dayTrades.reduce((b, t) => (t.pnl ?? 0) < (b?.pnl ?? Infinity) ? t : b, dayTrades[0]);
                    // Intraday equity curve
                    let cumPnl = 0;
                    const curveData = dayTrades.map(t => {
                        cumPnl += t.pnl ?? 0;
                        return {
                            label: fmtTime(t.closedAt ?? t.createdAt),
                            pnl: Math.round(cumPnl * 100) / 100,
                            trade: t,
                        };
                    });
                    // Format date label
                    const d = new Date(selectedDay + 'T12:00:00Z');
                    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                    return (
                        <motion.div
                            key={selectedDay}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            style={{ background: '#0d1117', border: '1px solid #1a1c24', borderTop: 'none', padding: isMobile ? '16px 14px' : '20px 24px' }}
                        >
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div>
                                    <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: '#fff', display: 'block' }}>{dateLabel}</span>
                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                        {lang === 'fr' ? `${dayTrades.length} trade${dayTrades.length !== 1 ? 's' : ''}` : `${dayTrades.length} trade${dayTrades.length !== 1 ? 's' : ''}`}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setSelectedDay(null)}
                                    style={{ background: 'none', border: '1px solid #1a1c24', color: '#4b5563', cursor: 'pointer', padding: '4px 10px', ...mono, fontSize: 11 }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Day KPI row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                                {[
                                    { label: lang === 'fr' ? 'P&L Net' : 'Net P&L', value: `${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}`, color: dayPnl >= 0 ? '#FDC800' : '#ff4757' },
                                    { label: lang === 'fr' ? 'Taux gain' : 'Win Rate', value: `${winRate}%`, color: winRate >= 60 ? '#FDC800' : winRate >= 40 ? '#EAB308' : '#ff4757' },
                                    { label: lang === 'fr' ? 'Gains / Pertes' : 'W / L', value: `${wins} / ${losses}`, color: '#c9d1d9' },
                                    { label: lang === 'fr' ? 'Trades' : 'Trades', value: String(dayTrades.length), color: '#c9d1d9' },
                                ].map(k => (
                                    <div key={k.label} style={{ background: '#0b0e14', border: '1px solid #1a1c24', padding: '10px 12px' }}>
                                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>{k.label}</span>
                                        <span style={{ ...mono, fontSize: 16, fontWeight: 900, color: k.color }}>{k.value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Best / Worst */}
                            {dayTrades.length > 1 && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                                    <div style={{ background: '#0b0e14', border: '1px solid #1a1c24', padding: '10px 12px' }}>
                                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>
                                            {lang === 'fr' ? 'Meilleur trade' : 'Best Trade'}
                                        </span>
                                        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#FDC800' }}>{bestTrade?.asset} +${(bestTrade?.pnl ?? 0).toFixed(2)}</span>
                                    </div>
                                    <div style={{ background: '#0b0e14', border: '1px solid #1a1c24', padding: '10px 12px' }}>
                                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>
                                            {lang === 'fr' ? 'Pire trade' : 'Worst Trade'}
                                        </span>
                                        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#ff4757' }}>{worstTrade?.asset} ${(worstTrade?.pnl ?? 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Intraday equity curve */}
                            {curveData.length > 1 && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                                        {lang === 'fr' ? 'Courbe intraday' : 'Intraday Curve'}
                                    </span>
                                    <ResponsiveContainer width="100%" height={90}>
                                        <AreaChart data={curveData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="dayGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={dayPnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor={dayPnl >= 0 ? '#FDC800' : '#ff4757'} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                            <XAxis dataKey="label" tick={{ fill: '#4b5563', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fill: '#4b5563', fontSize: 9, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={42}
                                                tickFormatter={(v: number) => `$${v >= 0 ? '+' : ''}${v}`} />
                                            <RechartTooltip
                                                contentStyle={{ background: '#0d1117', border: '1px solid #1a1c24', borderRadius: 2 }}
                                                labelStyle={{ color: '#8b949e', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                                                itemStyle={{ color: '#FDC800', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                                                formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(2)}`, 'Cumulative P&L']}
                                            />
                                            <Area type="monotone" dataKey="pnl" stroke={dayPnl >= 0 ? '#FDC800' : '#ff4757'} strokeWidth={2} fill="url(#dayGrad)" dot={false} activeDot={{ r: 4 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Trade list */}
                            {dayTrades.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                                        {lang === 'fr' ? 'Trades du jour' : 'Trades'}
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {dayTrades.map(t => (
                                            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 70px 60px', gap: 8, alignItems: 'center', padding: '8px 10px', background: '#090909', border: '1px solid #1a1c24' }}>
                                                <div>
                                                    <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: '#fff' }}>{t.asset}</span>
                                                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', marginLeft: 6 }}>{t.isShort ? '▼ SHORT' : '▲ LONG'}</span>
                                                </div>
                                                <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{fmtTime(t.closedAt ?? t.createdAt)}</span>
                                                <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{calcHoldTime(t.createdAt, t.closedAt)}</span>
                                                <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: (t.pnl ?? 0) >= 0 ? '#FDC800' : '#ff4757', textAlign: 'right' as const }}>
                                                    {(t.pnl ?? 0) >= 0 ? '+' : ''}${(t.pnl ?? 0).toFixed(2)}
                                                </span>
                                                <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: t.outcome === 'win' ? '#FDC800' : t.outcome === 'loss' ? '#ff4757' : '#F97316', textAlign: 'center' as const, border: `1px solid ${t.outcome === 'win' ? '#FDC800' : t.outcome === 'loss' ? '#ff4757' : '#F97316'}`, padding: '1px 4px' }}>
                                                    {t.outcome?.toUpperCase() ?? 'OPEN'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Day journal note */}
                            <div>
                                <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                                    {lang === 'fr' ? 'Note du jour' : 'Day Journal Entry'}
                                </span>
                                <textarea
                                    value={dayNoteInput}
                                    onChange={e => setDayNoteInput(e.target.value)}
                                    onBlur={() => updateDayNote(selectedDay, dayNoteInput)}
                                    placeholder={lang === 'fr'
                                        ? 'Biais directionnel, qualité des setups, émotions, leçons retenues…'
                                        : 'Directional bias, setup quality, emotions, lessons learned…'}
                                    rows={4}
                                    style={{
                                        width: '100%', boxSizing: 'border-box', background: '#090909', border: '1px solid #1a1c24',
                                        color: '#c9d1d9', padding: '10px 12px', resize: 'vertical', outline: 'none',
                                        ...mono, fontSize: 12, lineHeight: 1.6,
                                    }}
                                />
                                {dayNoteInput !== (dayNotes?.[selectedDay] ?? '') && (
                                    <button
                                        onClick={() => updateDayNote(selectedDay, dayNoteInput)}
                                        style={{ marginTop: 6, ...mono, fontSize: 10, fontWeight: 700, padding: '5px 14px', background: '#FDC800', color: '#000', border: 'none', cursor: 'pointer' }}
                                    >
                                        {lang === 'fr' ? 'Sauvegarder' : 'Save Note'}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>
                </>
            )}
        </div>
    );
}
