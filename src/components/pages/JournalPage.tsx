'use client';

import styles from './JournalPage.module.css';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Activity, Upload, LayoutList, CalendarDays,
    ChevronLeft, ChevronRight, FileDown, FileText, Loader2, Trash2,
    ChevronDown, ChevronUp,
} from 'lucide-react';
import { TRADEIFY_CRYPTO_LIST, FUTURES_SPECS, getTradingDay } from '@/store/appStore';

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
    const { trades, setTrades, deleteTrade, updateTradeNote, setActiveTab } = useAppStore();
    const csvRef = useRef<HTMLInputElement>(null);
    const pdfRef = useRef<HTMLInputElement>(null);
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [calendarDir, setCalendarDir] = useState<1 | -1>(1);
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
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // ── Design tokens ────────────────────────────────────────
    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
    const lbl: React.CSSProperties = { ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block' };
    const divider = '1px solid #1a1c24';

    // ── Calendar data ────────────────────────────────────────
    const calendarData = useMemo(() => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
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
        setPdfStatus({ loading: true, msg: 'Parsing statement…' });
        try {
            const { parseTradeifyPDF } = await import('@/lib/parseTradeifyPDF');
            const result = await parseTradeifyPDF(file);
            if (result.error) { setPdfStatus({ loading: false, msg: result.error }); return; }
            if (result.count === 0) { setPdfStatus({ loading: false, msg: 'No closed trades found in this statement.' }); return; }
            // Correct incremental merge: keep all existing non-PDF trades + old PDF trades
            // not present in the new upload. Same logic as Settings page.
            const nonPdf  = trades.filter(t => !t.id.startsWith('tradeify-'));
            const oldPdf  = trades.filter(t => t.id.startsWith('tradeify-'));
            const newIds  = new Set(result.trades.map(t => t.id));
            const oldKept = oldPdf.filter(t => !newIds.has(t.id));
            const newTrades = result.trades.map(t => ({ ...t, note: '' }));
            setTrades([...newTrades, ...oldKept, ...nonPdf]); // autoSync fires inside setTrades
            const coverage = result.coverageStart && result.coverageEnd
                ? ` · ${result.coverageStart} → ${result.coverageEnd}` : '';
            setPdfStatus({ loading: false, msg: `${newTrades.length} imported, ${oldKept.length} kept${coverage}` });
        } catch (err) {
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
                        imported.push({ id, asset: cols[4]?.toUpperCase() || 'UNKNOWN', assetType: guessAssetType(cols[4] || ''), entry, stopLoss: sl, takeProfit: tp, lotSize: size, riskUSD: risk, rewardUSD: reward, rr: risk > 0 ? reward / risk : 0, outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'open', createdAt: cols[1] || new Date().toISOString(), closedAt: cols[1] || new Date().toISOString(), pnl, isShort: type === 'sell' });
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
                        imported.push({ id, asset: cols[1]?.toUpperCase() || 'UNKNOWN', assetType: guessAssetType(cols[1] || ''), entry, stopLoss: sl || entry * 0.99, takeProfit: tp || entry * 1.01, lotSize: size, riskUSD: risk, rewardUSD: reward, rr: risk > 0 ? reward / risk : 0, outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'open', createdAt: cols[0] || new Date().toISOString(), closedAt: cols[0] || new Date().toISOString(), pnl, isShort: side === 'sell' || side === 'short' });
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

    // ── Unique assets for filter ─────────────────────────────
    const uniqueAssets = useMemo(() => [...new Set(trades.map(t => t.asset))].sort(), [trades]);

    // ── Grouped + filtered + sorted trades ───────────────────
    const groupedByDay = useMemo(() => {
        let filtered = [...trades];
        if (filter !== 'all') filtered = filtered.filter(t => t.outcome === filter);
        if (assetFilter) filtered = filtered.filter(t => t.asset === assetFilter);
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
    const pnlColor = totalPnl >= 0 ? '#A6FF4D' : '#ff4757';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh' }}>
            <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSVImport} />
            <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePDFImport} />

            {/* ── HEADER ─────────────────────────────────────── */}
            <div style={{ padding: isMobile ? '12px 14px' : '14px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ ...mono, fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>Journal</h1>
                    <span style={lbl}>Execution history · audit trail</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        onClick={() => pdfRef.current?.click()}
                        disabled={pdfStatus.loading}
                        style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 14px', background: '#A6FF4D', color: '#000', border: 'none', cursor: 'pointer', letterSpacing: '0.06em' }}
                    >
                        {pdfStatus.loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={12} />}
                        Import PDF
                    </button>
                    <button onClick={() => csvRef.current?.click()} style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'transparent', color: '#8b949e', border: '1px solid #1a1c24', cursor: 'pointer' }}>
                        <Upload size={12} /> CSV
                    </button>
                    {trades.length > 0 && (
                        <button onClick={handleExportCSV} style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'transparent', color: '#8b949e', border: '1px solid #1a1c24', cursor: 'pointer' }}>
                            <FileDown size={12} /> Export
                        </button>
                    )}
                    {trades.length > 0 && (
                        <button onClick={() => { if (window.confirm(`Delete all ${trades.length} trades? This cannot be undone.`)) setTrades([]); }}
                            style={{ ...mono, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'transparent', color: '#ff4757', border: '1px solid rgba(255,71,87,0.25)', cursor: 'pointer' }}>
                            <Trash2 size={12} /> Clear all
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
                            background: pdfStatus.msg.startsWith('Imported') ? 'rgba(166,255,77,0.06)' : 'rgba(255,71,87,0.06)',
                            borderLeft: `3px solid ${pdfStatus.msg.startsWith('Imported') ? '#A6FF4D' : '#ff4757'}`,
                        }}>
                        <span style={{ ...mono, fontSize: 12, color: pdfStatus.msg.startsWith('Imported') ? '#A6FF4D' : '#ff4757', fontWeight: 600 }}>{pdfStatus.msg}</span>
                        <button onClick={() => setPdfStatus({ loading: false, msg: '' })} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── STATS STRIP ─────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', borderBottom: divider }}>
                {[
                    {
                        lbl: 'Net P&L', val: closedTrades.length > 0 ? `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—',
                        clr: closedTrades.length > 0 ? pnlColor : '#4b5563',
                        sub: closedTrades.length > 0 ? `${wins.length}W · ${losses.length}L` : 'no trades yet'
                    },
                    {
                        lbl: 'Win Rate', val: closedTrades.length > 0 ? `${winRate}%` : '—',
                        clr: winRate >= 55 ? '#A6FF4D' : winRate >= 45 ? '#EAB308' : closedTrades.length > 0 ? '#ff4757' : '#4b5563',
                        sub: closedTrades.length > 0 ? `${closedTrades.length} closed` : '—'
                    },
                    {
                        lbl: 'Profit Factor', val: closedTrades.length > 0 ? (profitFactor > 90 ? '∞' : profitFactor.toFixed(2)) : '—',
                        clr: profitFactor >= 1.5 ? '#A6FF4D' : profitFactor >= 1 ? '#EAB308' : closedTrades.length > 0 ? '#ff4757' : '#4b5563',
                        sub: avgLossAmt > 0 ? `avg W $${avgWinAmt.toFixed(0)} / L $${avgLossAmt.toFixed(0)}` : '—'
                    },
                    {
                        lbl: 'Logged', val: trades.length.toString(),
                        clr: '#e2e8f0',
                        sub: trades.filter(t => t.outcome === 'open').length > 0 ? `${trades.filter(t => t.outcome === 'open').length} open` : 'all closed'
                    },
                ].map((s, i) => (
                    <div key={i} style={{
                        padding: isMobile ? '12px 12px' : '14px 16px',
                        borderRight: isMobile ? (i % 2 === 0 ? divider : 'none') : (i < 3 ? divider : 'none'),
                        borderBottom: isMobile && i < 2 ? divider : 'none',
                    }}>
                        <span style={lbl}>{s.lbl}</span>
                        <span style={{ ...mono, fontSize: isMobile ? 16 : 20, fontWeight: 800, color: s.clr, letterSpacing: '-0.02em', display: 'block', marginTop: 4, lineHeight: 1 }}>{s.val}</span>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>{s.sub}</span>
                    </div>
                ))}
            </div>

            {/* ── FILTER + VIEW TOGGLE ────────────────────────── */}
            {trades.length > 0 && (
                <div style={{ padding: isMobile ? '8px 14px' : '10px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* Outcome filters */}
                    {(['all', 'win', 'loss', 'open'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)} style={{
                            ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', padding: '5px 12px',
                            border: '1px solid', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.15s',
                            background: filter === f ? (f === 'win' ? '#A6FF4D' : f === 'loss' ? '#ff4757' : f === 'open' ? '#EAB308' : '#e2e8f0') : 'transparent',
                            color: filter === f ? '#000' : '#6b7280',
                            borderColor: filter === f ? (f === 'win' ? '#A6FF4D' : f === 'loss' ? '#ff4757' : f === 'open' ? '#EAB308' : '#e2e8f0') : '#1a1c24',
                        }}>
                            {f === 'all' ? `All (${trades.length})` : f === 'win' ? `Wins (${wins.length})` : f === 'loss' ? `Losses (${losses.length})` : `Open (${trades.filter(t => t.outcome === 'open').length})`}
                        </button>
                    ))}

                    {/* Asset filter */}
                    {uniqueAssets.length > 1 && (
                        <select
                            value={assetFilter}
                            onChange={e => setAssetFilter(e.target.value)}
                            style={{ ...mono, fontSize: 10, fontWeight: 700, padding: '5px 10px', background: '#0d1117', border: '1px solid #1a1c24', color: assetFilter ? '#A6FF4D' : '#6b7280', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="">All Assets</option>
                            {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    )}

                    {/* Results count */}
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', marginLeft: 4 }}>
                        {totalShown} trade{totalShown !== 1 ? 's' : ''} shown
                    </span>

                    {/* View toggle — right side */}
                    <div style={{ marginLeft: 'auto', display: 'flex', border: divider, overflow: 'hidden' }}>
                        <button onClick={() => setViewMode('list')} style={{ ...mono, fontSize: 10, fontWeight: 700, padding: '5px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: viewMode === 'list' ? '#e2e8f0' : 'transparent', color: viewMode === 'list' ? '#000' : '#6b7280' }}>
                            <LayoutList size={12} /> List
                        </button>
                        <button onClick={() => setViewMode('calendar')} style={{ ...mono, fontSize: 10, fontWeight: 700, padding: '5px 12px', border: 'none', borderLeft: divider, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, background: viewMode === 'calendar' ? '#e2e8f0' : 'transparent', color: viewMode === 'calendar' ? '#000' : '#6b7280' }}>
                            <CalendarDays size={12} /> Calendar
                        </button>
                    </div>
                </div>
            )}

            {/* ── EMPTY STATE ─────────────────────────────────── */}
            {trades.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', gap: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 40, lineHeight: 1 }}>📋</div>
                    <span style={{ ...mono, fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginTop: 8 }}>Journal is empty</span>
                    <span style={{ ...mono, fontSize: 12, color: '#4b5563', maxWidth: 280, lineHeight: 1.7 }}>
                        Import your Tradeify statement or log trades via the Risk Engine to begin your audit trail.
                    </span>
                    <button
                        onClick={() => pdfRef.current?.click()}
                        disabled={pdfStatus.loading}
                        style={{ ...mono, marginTop: 8, padding: '12px 24px', background: '#A6FF4D', color: '#000', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        {pdfStatus.loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FileText size={14} />}
                        Import Tradeify PDF
                    </button>
                    <button
                        onClick={() => setActiveTab('calculator')}
                        style={{ ...mono, marginTop: 4, padding: '12px 24px', background: 'transparent', color: '#8b949e', border: '1px solid #1a1c24', cursor: 'pointer', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        Log a Trade
                    </button>
                </div>
            )}

            {/* ── LIST VIEW ───────────────────────────────────── */}
            {trades.length > 0 && viewMode === 'list' && (
                <div>
                    {groupedByDay.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <span style={{ ...mono, fontSize: 12, color: '#4b5563' }}>No trades match the current filter.</span>
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
                                        <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: dayPnl >= 0 ? '#A6FF4D' : '#ff4757' }}>
                                            {dayPnl >= 0 ? '+' : ''}${dayPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    )}
                                    {/* Win rate badge for day */}
                                    {(dayWins + dayLosses) > 0 && (
                                        <span style={{
                                            ...mono, fontSize: 9, fontWeight: 700, padding: '2px 7px',
                                            background: dayWins > dayLosses ? 'rgba(166,255,77,0.08)' : 'rgba(255,71,87,0.08)',
                                            border: `1px solid ${dayWins > dayLosses ? 'rgba(166,255,77,0.2)' : 'rgba(255,71,87,0.2)'}`,
                                            color: dayWins > dayLosses ? '#A6FF4D' : '#ff4757',
                                        }}>
                                            {dayWins}W {dayLosses}L
                                        </span>
                                    )}
                                    {/* W/L dot sequence */}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                                        {dayTrades.slice(0, isMobile ? 10 : 30).map((t, i) => (
                                            <div key={i} title={t.outcome === 'win' ? 'Win' : t.outcome === 'loss' ? 'Loss' : 'Open'} style={{
                                                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                background: t.outcome === 'win' ? '#A6FF4D' : t.outcome === 'loss' ? '#ff4757' : '#4b5563',
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
                                    const accentColor = isWin ? '#A6FF4D' : isLoss ? '#ff4757' : '#EAB308';
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
                                                style={{ padding: isMobile ? '12px 14px' : '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}
                                                onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                                            >
                                                {/* Left: direction + asset + meta */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                                                    {/* LONG/SHORT badge */}
                                                    <span style={{
                                                        ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', flexShrink: 0,
                                                        background: trade.isShort ? 'rgba(255,71,87,0.1)' : 'rgba(166,255,77,0.08)',
                                                        color: trade.isShort ? '#ff4757' : '#A6FF4D',
                                                        border: `1px solid ${trade.isShort ? 'rgba(255,71,87,0.3)' : 'rgba(166,255,77,0.2)'}`,
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
                                                        border: `1px solid ${isWin ? 'rgba(166,255,77,0.25)' : isLoss ? 'rgba(255,71,87,0.3)' : 'rgba(234,179,8,0.3)'}`,
                                                    }}>
                                                        {(trade.outcome ?? 'OPEN').toUpperCase()}
                                                    </span>
                                                    {/* Time */}
                                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                                        {fmtTime(trade.createdAt)}{trade.closedAt ? ` → ${fmtTime(trade.closedAt)}` : ''}{holdStr !== '—' ? ` · ${holdStr}` : ''}
                                                    </span>
                                                </div>

                                                {/* Right: P&L + inline outcome for open + expand + delete */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <span style={{ ...mono, fontSize: 16, fontWeight: 800, color: accentColor, letterSpacing: '-0.02em', display: 'block' }}>
                                                            {isWin ? '+' : isLoss ? '-' : '~'}${Math.abs(pnlVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        {trade.rr > 0 && (
                                                            <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{trade.rr.toFixed(1)}R</span>
                                                        )}
                                                    </div>
                                                    {/* Inline WIN/LOSS buttons for open trades */}
                                                    {trade.outcome === 'open' && (
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
                                                                    if (inlineOutcomeId !== trade.id) { setInlineOutcomeId(trade.id); return; }
                                                                    const raw = inlineWinInput[trade.id] ?? '';
                                                                    const val = raw !== '' ? parseFloat(raw) : trade.rewardUSD;
                                                                    if (isNaN(val)) return;
                                                                    setTrades(trades.map(t => t.id === trade.id ? {
                                                                        ...t, outcome: 'win', pnl: Math.abs(val),
                                                                        closedAt: t.closedAt || new Date().toISOString(),
                                                                        durationSeconds: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000),
                                                                    } : t));
                                                                    setInlineOutcomeId(null);
                                                                    setInlineWinInput(prev => { const n = { ...prev }; delete n[trade.id]; return n; });
                                                                }}
                                                                style={{ ...mono, fontSize: 9, fontWeight: 800, padding: '4px 7px', background: 'rgba(166,255,77,0.1)', color: '#A6FF4D', border: '1px solid rgba(166,255,77,0.3)', cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0 }}
                                                            >✓ WIN</button>
                                                            <button
                                                                title="Mark as Lost"
                                                                onClick={() => {
                                                                    if (inlineOutcomeId !== trade.id) { setInlineOutcomeId(trade.id); return; }
                                                                    const raw = inlineLossInput[trade.id] ?? '';
                                                                    const val = raw !== '' ? parseFloat(raw) : trade.riskUSD;
                                                                    if (isNaN(val)) return;
                                                                    setTrades(trades.map(t => t.id === trade.id ? {
                                                                        ...t, outcome: 'loss', pnl: -Math.abs(val),
                                                                        closedAt: t.closedAt || new Date().toISOString(),
                                                                        durationSeconds: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000),
                                                                    } : t));
                                                                    setInlineOutcomeId(null);
                                                                    setInlineLossInput(prev => { const n = { ...prev }; delete n[trade.id]; return n; });
                                                                }}
                                                                style={{ ...mono, fontSize: 9, fontWeight: 800, padding: '4px 7px', background: 'rgba(255,71,87,0.1)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0 }}
                                                            >✗ LOSS</button>
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
                                                                { k: 'Entry', v: trade.entry > 0 ? trade.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—', c: '#e2e8f0' },
                                                                { k: 'Stop Loss', v: trade.stopLoss > 0 ? trade.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—', c: '#ff4757' },
                                                                { k: 'Take Profit', v: trade.takeProfit > 0 ? trade.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—', c: '#A6FF4D' },
                                                                { k: 'Risk : Reward', v: trade.rr > 0 ? `${trade.rr.toFixed(2)}R` : '—', c: '#00D4FF' },
                                                                { k: 'Size', v: trade.lotSize > 0 ? trade.lotSize.toLocaleString() : '—', c: '#e2e8f0' },
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
                                                            <span style={{ ...lbl, minWidth: 80 }}>Resolve</span>
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
                                                                    const holdMs = new Date().getTime() - new Date(trade.createdAt).getTime();
                                                                    if (holdMs < 20000) {
                                                                        alert('Micro-scalping rule: Trades must be held for at least 20 seconds. Please wait.');
                                                                        return;
                                                                    }
                                                                    const val = parseFloat(editPnls[trade.id] ?? String(Math.abs(trade.pnl ?? 0)));
                                                                    if (!isNaN(val)) setTrades(trades.map(t => t.id === trade.id ? { ...t, outcome: 'win', pnl: Math.abs(val), closedAt: t.closedAt || new Date().toISOString(), durationSeconds: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000) } : t));
                                                                }}
                                                                style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'rgba(166,255,77,0.1)', color: '#A6FF4D', border: '1px solid rgba(166,255,77,0.3)', cursor: 'pointer' }}
                                                            >Mark Won</button>
                                                            <button
                                                                onClick={() => {
                                                                    const holdMs = new Date().getTime() - new Date(trade.createdAt).getTime();
                                                                    if (holdMs < 20000) {
                                                                        alert('Micro-scalping rule: Trades must be held for at least 20 seconds. Please wait.');
                                                                        return;
                                                                    }
                                                                    const val = parseFloat(editPnls[trade.id] ?? String(Math.abs(trade.pnl ?? 0)));
                                                                    if (!isNaN(val)) setTrades(trades.map(t => t.id === trade.id ? { ...t, outcome: 'loss', pnl: -Math.abs(val), closedAt: t.closedAt || new Date().toISOString(), durationSeconds: Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 1000) } : t));
                                                                }}
                                                                style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '7px 12px', background: 'rgba(255,71,87,0.1)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', cursor: 'pointer' }}
                                                            >Mark Lost</button>
                                                        </div>

                                                        {/* Journal note */}
                                                        <div style={{ padding: '12px 16px' }}>
                                                            <span style={lbl}>Trade Note</span>
                                                            <textarea
                                                                placeholder={`What was your setup rationale?\nHow did you feel entering this trade?\nWould you take this trade again?`}
                                                                value={trade.note ?? ''}
                                                                onChange={e => updateTradeNote(trade.id, e.target.value)}
                                                                rows={3}
                                                                style={{
                                                                    ...mono, width: '100%', background: 'transparent', border: '1px solid #1a1c24', color: '#8b949e',
                                                                    fontSize: 12, padding: '10px 12px', resize: 'vertical', outline: 'none',
                                                                    marginTop: 6, lineHeight: 1.6, minHeight: 72,
                                                                    transition: 'border-color 0.15s',
                                                                }}
                                                                onFocus={e => (e.currentTarget.style.borderColor = '#A6FF4D')}
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
            {trades.length > 0 && viewMode === 'calendar' && (
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
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Wk'].map((d, i) => (
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
                                        {week.days.map((dayData: { day: number; isCurrentMonth: boolean; isToday: boolean; pnl: number; tradesCount: number; }, i: number) => (
                                            <div key={i} className={`${styles.calendarCell} ${!dayData.isCurrentMonth ? styles.calendarCellOut : ''} ${dayData.isToday ? styles.calendarCellToday : ''} ${dayData.pnl > 0 ? styles.pnlPositiveFill : dayData.pnl < 0 ? styles.pnlNegativeFill : ''}`}>
                                                <span className={styles.calendarCellDate}>{dayData.day}</span>
                                                <div className={styles.calendarCellContent}>
                                                    {dayData.tradesCount > 0 && (
                                                        <>
                                                            <span className={`${styles.calendarCellPnl} ${dayData.pnl >= 0 ? styles.pnlPositiveText : styles.pnlNegativeText}`}>
                                                                {dayData.pnl >= 0 ? '+' : '-'}${Math.abs(dayData.pnl).toFixed(2)}
                                                            </span>
                                                            <span className={styles.calendarTrades}>{dayData.tradesCount} {dayData.tradesCount === 1 ? 'trade' : 'trades'}</span>
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
            )}
        </div>
    );
}
