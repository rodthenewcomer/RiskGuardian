'use client';

import styles from './JournalPage.module.css';
import { useState, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen, TrendingUp, TrendingDown, Activity, Download, Upload,
    LayoutList, CalendarDays, ChevronLeft, ChevronRight, Edit3, Check, X
} from 'lucide-react';
import { SEED_TRADES } from '@/data/seedTrades';

export default function JournalPage() {
    const { trades, setTrades, updateTradeNote } = useAppStore();
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'win' | 'loss' | 'open'>('all');
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            const dayTrades = trades.filter(t => t.createdAt.split('T')[0] === dateStr);
            const pnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

            currentWeek.push({
                day: i,
                isCurrentMonth: true,
                pnl,
                tradesCount: dayTrades.length,
                date: dateStr,
                isToday: dateStr === todayStr
            });

            if (currentWeek.length === 7) {
                const weekPnl = currentWeek.reduce((s, d) => s + d.pnl, 0);
                const weekTrades = currentWeek.reduce((s, d) => s + d.tradesCount, 0);
                weeks.push({ days: currentWeek, weekPnl, weekTrades, weekNumber });
                currentWeek = [];
                weekNumber++;
            }
        }

        if (currentWeek.length > 0) {
            let nextDay = 1;
            while (currentWeek.length < 7) {
                currentWeek.push({ day: nextDay++, isCurrentMonth: false, pnl: 0, tradesCount: 0 });
            }
            const weekPnl = currentWeek.reduce((s, d) => s + d.pnl, 0);
            const weekTrades = currentWeek.reduce((s, d) => s + d.tradesCount, 0);
            weeks.push({ days: currentWeek, weekPnl, weekTrades, weekNumber });
        }

        return {
            year,
            month,
            weeks,
            monthName: calendarDate.toLocaleString('default', { month: 'short' })
        };
    }, [calendarDate, trades]);

    const prevMonth = () => {
        const newDate = new Date(calendarDate);
        newDate.setMonth(newDate.getMonth() - 1);
        setCalendarDate(newDate);
    };

    const nextMonth = () => {
        const newDate = new Date(calendarDate);
        newDate.setMonth(newDate.getMonth() + 1);
        setCalendarDate(newDate);
    };

    const handleImportDemo = () => {
        const mappedTrades = SEED_TRADES.map(t => ({
            id: t.id,
            asset: t.asset,
            assetType: t.assetType as 'crypto' | 'forex' | 'futures' | 'stocks',
            entry: t.entry,
            stopLoss: t.sl,
            takeProfit: t.tp,
            lotSize: t.size,
            riskUSD: t.risk,
            rewardUSD: t.reward,
            rr: t.rr,
            outcome: t.outcome as 'win' | 'loss' | 'open',
            createdAt: t.created,
            closedAt: t.created,
            pnl: t.pnl,
            isShort: t.isShort
        }));
        const existingIds = new Set(trades.map(t => t.id));
        const toAdd = mappedTrades.filter(t => !existingIds.has(t.id));
        if (toAdd.length > 0) {
            setTrades([...toAdd, ...trades]);
        }
    };

    // CSV Export
    const handleExportCSV = () => {
        const header = ['Date', 'Asset', 'Type', 'Direction', 'Entry', 'Stop Loss', 'Take Profit', 'Size', 'Risk $', 'Reward $', 'R:R', 'P&L $', 'Outcome', 'Note'];
        const rows = trades.map(t => [
            new Date(t.createdAt).toLocaleDateString(),
            t.asset,
            t.assetType,
            t.isShort ? 'SHORT' : 'LONG',
            t.entry,
            t.stopLoss,
            t.takeProfit,
            t.lotSize,
            t.riskUSD.toFixed(2),
            t.rewardUSD.toFixed(2),
            t.rr.toFixed(2),
            (t.pnl ?? 0).toFixed(2),
            t.outcome ?? 'open',
            (t.note ?? '').replace(/,/g, ';')
        ]);
        const csv = [header, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `riskguardian-trades-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // CSV Import (generic format: Date, Asset, Direction, Entry, SL, TP, Size, Outcome, P&L)
    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split('\n').filter(l => l.trim());
            const header = lines[0].toLowerCase().split(',');
            const idx = {
                asset: header.findIndex(h => h.includes('asset') || h.includes('symbol')),
                entry: header.findIndex(h => h.includes('entry')),
                sl: header.findIndex(h => h.includes('stop') || h.includes('sl')),
                tp: header.findIndex(h => h.includes('take') || h.includes('tp')),
                size: header.findIndex(h => h.includes('size') || h.includes('lot') || h.includes('qty')),
                pnl: header.findIndex(h => h.includes('pnl') || h.includes('profit') || h.includes('p&l')),
                outcome: header.findIndex(h => h.includes('outcome') || h.includes('result')),
                date: header.findIndex(h => h.includes('date') || h.includes('time')),
                direction: header.findIndex(h => h.includes('direction') || h.includes('side') || h.includes('type')),
            };
            const imported = lines.slice(1).map((line, i) => {
                const cols = line.split(',');
                const pnlVal = idx.pnl >= 0 ? parseFloat(cols[idx.pnl]) || 0 : 0;
                const outcome = idx.outcome >= 0
                    ? (cols[idx.outcome]?.toLowerCase().includes('win') ? 'win' : cols[idx.outcome]?.toLowerCase().includes('loss') ? 'loss' : 'open')
                    : pnlVal > 0 ? 'win' : pnlVal < 0 ? 'loss' : 'open';
                return {
                    id: `csv-import-${Date.now()}-${i}`,
                    asset: idx.asset >= 0 ? (cols[idx.asset]?.trim() || 'UNKNOWN') : 'UNKNOWN',
                    assetType: 'crypto' as const,
                    entry: idx.entry >= 0 ? parseFloat(cols[idx.entry]) || 0 : 0,
                    stopLoss: idx.sl >= 0 ? parseFloat(cols[idx.sl]) || 0 : 0,
                    takeProfit: idx.tp >= 0 ? parseFloat(cols[idx.tp]) || 0 : 0,
                    lotSize: idx.size >= 0 ? parseFloat(cols[idx.size]) || 1 : 1,
                    riskUSD: Math.abs(pnlVal < 0 ? pnlVal : 0),
                    rewardUSD: pnlVal > 0 ? pnlVal : 0,
                    rr: 2,
                    outcome: outcome as 'win' | 'loss' | 'open',
                    createdAt: idx.date >= 0 && cols[idx.date] ? new Date(cols[idx.date]).toISOString() : new Date().toISOString(),
                    closedAt: idx.date >= 0 && cols[idx.date] ? new Date(cols[idx.date]).toISOString() : undefined,
                    pnl: pnlVal,
                    isShort: idx.direction >= 0 ? cols[idx.direction]?.toLowerCase().includes('short') || cols[idx.direction]?.toLowerCase().includes('sell') : false,
                };
            }).filter(t => t.asset !== 'UNKNOWN' || t.entry > 0);

            const existingIds = new Set(trades.map(t => t.id));
            const toAdd = imported.filter(t => !existingIds.has(t.id));
            if (toAdd.length > 0) {
                setTrades([...toAdd, ...trades]);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const startEditNote = (id: string, currentNote: string) => {
        setEditingNoteId(id);
        setNoteText(currentNote || '');
    };

    const saveNote = (id: string) => {
        updateTradeNote(id, noteText);
        setEditingNoteId(null);
    };

    const cancelNote = () => {
        setEditingNoteId(null);
        setNoteText('');
    };

    const closedTrades = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');
    const wins = closedTrades.filter(t => t.outcome === 'win');
    const losses = closedTrades.filter(t => t.outcome === 'loss');
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
    const avgRR = closedTrades.filter(t => t.rr > 0).length > 0
        ? closedTrades.filter(t => t.rr > 0).reduce((s, t, _, arr) => s + t.rr / arr.length, 0) : 0;

    const filteredTrades = outcomeFilter === 'all' ? trades : trades.filter(t => t.outcome === outcomeFilter);

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div className={styles.pageIcon}><BookOpen size={24} /></div>
                <div>
                    <h1 className="text-subheading">Trade Log</h1>
                    <p className="text-caption">Execution history, notes &amp; audit trail</p>
                </div>
                <div className={styles.pageActions}>
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={handleExportCSV}
                        title="Export all trades as CSV"
                        disabled={trades.length === 0}
                    >
                        <Download size={14} /> Export CSV
                    </button>
                    <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => fileInputRef.current?.click()}
                        title="Import trades from CSV file"
                    >
                        <Upload size={14} /> Import CSV
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        style={{ display: 'none' }}
                        onChange={handleImportCSV}
                    />
                </div>
            </div>

            {/* Summary Grid */}
            <div className={styles.summaryGrid}>
                <div className={`${styles.summaryCard} ${totalPnl >= 0 ? styles.summaryProfit : styles.summaryLoss}`}>
                    <span className={styles.summaryLabel}>TOTAL NET</span>
                    <span className={`${styles.summaryValue} ${totalPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        {totalPnl >= 0 ? '+' : '-'}${Math.abs(totalPnl).toFixed(0)}
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>STRIKE RATE</span>
                    <span className={`${styles.summaryValue} ${winRate >= 50 ? 'text-success' : 'text-danger'}`}>
                        {winRate}%
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>AVG YIELD</span>
                    <span className={`${styles.summaryValue} ${avgRR >= 2 ? 'text-success' : 'text-warning'}`}>
                        {avgRR.toFixed(1)}R
                    </span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>TOTAL TRADES</span>
                    <span className={styles.summaryValue}>{trades.length}</span>
                </div>
            </div>

            {/* Controls: view toggle + filter */}
            {trades.length > 0 && (
                <div className={styles.controls}>
                    <div className={styles.filterRow}>
                        {(['all', 'win', 'loss', 'open'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setOutcomeFilter(f)}
                                className={`${styles.filterBtn} ${outcomeFilter === f ? styles.filterBtnActive : ''}`}
                            >
                                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                    <div className={styles.viewToggle}>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.toggleBtnActive : ''}`}
                        >
                            <LayoutList size={14} /> List
                        </button>
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={`${styles.toggleBtn} ${viewMode === 'calendar' ? styles.toggleBtnActive : ''}`}
                        >
                            <CalendarDays size={14} /> Calendar
                        </button>
                    </div>
                </div>
            )}

            {/* Trade History */}
            {trades.length === 0 ? (
                <div className={styles.emptyCard}>
                    <BookOpen size={48} strokeWidth={1} className="text-[var(--text-muted)]" />
                    <p className="text-subheading mt-3 text-[var(--text-secondary)]">No Trades Yet</p>
                    <p className="text-caption mb-4" style={{ maxWidth: 300 }}>
                        Trades logged via the Risk Engine or HUD Terminal will appear here. Add notes, track P&L, export history.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                            onClick={handleImportDemo}
                            className="btn btn--primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        >
                            <Download size={16} /> Load Demo Trades
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn--ghost"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        >
                            <Upload size={16} /> Import CSV
                        </button>
                    </div>
                </div>
            ) : viewMode === 'list' ? (
                <div className={styles.tradeList}>
                    {filteredTrades.map((trade, i) => (
                        <motion.div
                            key={trade.id}
                            className={styles.tradeCard}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                        >
                            <div className={styles.tradeTop}>
                                <div className={styles.tradeLeft}>
                                    <div className={`${styles.tradeAvatar} ${trade.outcome === 'win' ? styles.win : trade.outcome === 'loss' ? styles.loss : styles.open}`}>
                                        {trade.outcome === 'win' ? <TrendingUp size={18} /> :
                                            trade.outcome === 'loss' ? <TrendingDown size={18} /> :
                                                <Activity size={18} strokeWidth={1.5} />}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span className={styles.tradeAsset}>{trade.asset}</span>
                                            <span className={`badge ${trade.isShort ? 'badge--danger' : 'badge--primary'}`} style={{ fontSize: 9 }}>
                                                {trade.isShort ? 'SHORT' : 'LONG'}
                                            </span>
                                        </div>
                                        <span className={styles.tradeDate}>
                                            {new Date(trade.createdAt).toLocaleString()} · {trade.closedAt ? new Date(trade.closedAt).toLocaleTimeString() : 'OPEN'}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.tradeRight}>
                                    <span className={`${styles.tradePnl} ${trade.outcome === 'win' ? 'text-success' : trade.outcome === 'loss' ? 'text-danger' : 'text-secondary'}`}>
                                        {trade.outcome === 'win' ? '+' : trade.outcome === 'loss' ? '-' : '~'}
                                        ${Math.abs(trade.pnl ?? (trade.outcome === 'win' ? trade.rewardUSD : trade.riskUSD)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-caption uppercase tracking-[0.1em]">
                                        {trade.outcome === 'win' ? 'WIN' : trade.outcome === 'loss' ? 'LOSS' : 'OPEN'} · {trade.rr.toFixed(1)}R
                                    </span>
                                </div>
                            </div>

                            <div className={styles.tradeMeta}>
                                <div className={styles.metaItem}>ENTRY <strong className="text-[#fff]">{trade.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>SL <strong className="text-danger">{trade.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>TP <strong className="text-success">{trade.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>SIZE <strong className="text-cyan">{trade.lotSize.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong></div>
                            </div>

                            {/* Note Section */}
                            <div className={styles.noteSection}>
                                {editingNoteId === trade.id ? (
                                    <div className={styles.noteEdit}>
                                        <textarea
                                            className={styles.noteInput}
                                            value={noteText}
                                            onChange={e => setNoteText(e.target.value)}
                                            placeholder="What was your setup? Emotion? Lesson learned..."
                                            rows={3}
                                            autoFocus
                                        />
                                        <div className={styles.noteEditBtns}>
                                            <button
                                                className="btn btn--primary btn--sm"
                                                onClick={() => saveNote(trade.id)}
                                            >
                                                <Check size={12} /> Save Note
                                            </button>
                                            <button className="btn btn--ghost btn--sm" onClick={cancelNote}>
                                                <X size={12} /> Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className={styles.noteDisplay}
                                        onClick={() => startEditNote(trade.id, trade.note || '')}
                                    >
                                        <Edit3 size={12} className={styles.noteIcon} />
                                        <span className={trade.note ? styles.noteText : styles.notePlaceholder}>
                                            {trade.note || 'Add a note — setup, emotions, lesson...'}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={styles.calendarContainer}
                >
                    <div className={styles.calendarHeader}>
                        <div className={styles.calendarNav}>
                            <button onClick={prevMonth} className="btn btn--ghost btn--sm p-1" aria-label="Previous Month"><ChevronLeft size={16} /></button>
                            <h3 className={styles.calendarTitle}>{calendarData.monthName} {calendarData.year}</h3>
                            <button onClick={nextMonth} className="btn btn--ghost btn--sm p-1" aria-label="Next Month"><ChevronRight size={16} /></button>
                        </div>
                        <button onClick={() => setCalendarDate(new Date())} className={styles.btnToday}>Today</button>
                    </div>

                    <div className={styles.calendarGrid}>
                        <div className={styles.calendarHeaderRow}>
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Wk'].map((d, i) => (
                                <div key={i} className={styles.calendarDayName}>{d}</div>
                            ))}
                        </div>

                        {calendarData.weeks.map((week, wi) => (
                            <div key={wi} className={styles.calendarRow}>
                                {week.days.map((dayData: any, i: number) => (
                                    <div
                                        key={i}
                                        className={`${styles.calendarCell} ${!dayData.isCurrentMonth ? styles.calendarCellOut : ''} ${dayData.isToday ? styles.calendarCellToday : ''} ${dayData.pnl > 0 ? styles.pnlPositiveFill : dayData.pnl < 0 ? styles.pnlNegativeFill : ''}`}
                                    >
                                        <span className={styles.calendarCellDate}>{dayData.day}</span>
                                        <div className={styles.calendarCellContent}>
                                            {dayData.tradesCount > 0 && (
                                                <>
                                                    <span className={`${styles.calendarCellPnl} ${dayData.pnl >= 0 ? styles.pnlPositiveText : styles.pnlNegativeText}`}>
                                                        {dayData.pnl >= 0 ? '+' : '-'}${Math.abs(dayData.pnl).toFixed(0)}
                                                    </span>
                                                    <span className={styles.calendarTrades}>{dayData.tradesCount}t</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div className={`${styles.calendarCell} ${styles.calendarWeeklyCell}`}>
                                    <span className={styles.weeklyLabel}>W{week.weekNumber}</span>
                                    <span className={`${styles.calendarCellPnl} ${week.weekPnl >= 0 ? styles.pnlPositiveText : styles.pnlNegativeText}`} style={{ fontSize: 11 }}>
                                        {week.weekPnl >= 0 ? '+' : '-'}${Math.abs(week.weekPnl).toFixed(0)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
