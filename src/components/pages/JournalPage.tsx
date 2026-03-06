'use client';

import styles from './JournalPage.module.css';
import { useState, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, TrendingUp, TrendingDown, Activity, DownloadCloud, Upload, LayoutList, CalendarDays, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { SEED_TRADES } from '@/data/seedTrades';
import { TRADEIFY_CRYPTO_LIST, FUTURES_SPECS } from '@/store/appStore';

function guessAssetType(symbol: string): 'crypto' | 'forex' | 'futures' | 'stocks' {
    const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s in FUTURES_SPECS) return 'futures';
    const base = s.replace(/USD$|USDT$/, '');
    if (TRADEIFY_CRYPTO_LIST.includes(base) || TRADEIFY_CRYPTO_LIST.includes(s)) return 'crypto';
    const FOREX_CCY = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'USD'];
    if (s.length === 6 && FOREX_CCY.some(c => s.startsWith(c) || s.endsWith(c))) return 'forex';
    return 'forex';
}

export default function JournalPage() {
    const { trades, setTrades, updateTradeNote } = useAppStore();
    const csvRef = useRef<HTMLInputElement>(null);
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [calendarDate, setCalendarDate] = useState(new Date());

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

    const handleImportTrades = () => {
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
        // Merge: only add seed trades that aren't already in the store (match by id)
        const existingIds = new Set(trades.map(t => t.id));
        const toAdd = mappedTrades.filter(t => !existingIds.has(t.id));
        if (toAdd.length > 0) {
            setTrades([...toAdd, ...trades]);
        }
    };

    // CSV Export
    const handleExportCSV = () => {
        const headers = ['Date', 'Asset', 'Type', 'Direction', 'Entry', 'SL', 'TP', 'Size', 'Risk$', 'Reward$', 'RR', 'Outcome', 'PnL', 'Note'];
        const rows = trades.map(t => [
            new Date(t.createdAt).toISOString().split('T')[0],
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
            t.outcome ?? 'open',
            (t.pnl ?? 0).toFixed(2),
            (t.note ?? '').replace(/,/g, ';'),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `riskguardian-trades-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // CSV Import — handles MT4/MT5/DXTrade formats
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
                        // MT4/MT5: #,Time,Type,Size,Item,Price,S/L,T/P,Profit,Balance
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
                        imported.push({
                            id: `csv-${i}-${Date.now()}`,
                            asset: cols[4]?.toUpperCase() || 'UNKNOWN',
                            assetType: guessAssetType(cols[4] || ''),
                            entry, stopLoss: sl, takeProfit: tp, lotSize: size,
                            riskUSD: risk, rewardUSD: reward,
                            rr: risk > 0 ? reward / risk : 0,
                            outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'open',
                            createdAt: cols[1] || new Date().toISOString(),
                            closedAt: cols[1] || new Date().toISOString(),
                            pnl, isShort: type === 'sell',
                        });
                    } else {
                        // DXTrade/Generic: Date,Symbol,Side,Qty,Price,Stop Loss,Take Profit,PnL
                        const side = cols[2]?.toLowerCase();
                        const entry = parseFloat(cols[4]);
                        const sl = parseFloat(cols[5]);
                        const tp = parseFloat(cols[6]);
                        const pnl = parseFloat(cols[7]);
                        const size = parseFloat(cols[3]);
                        if (isNaN(entry) || isNaN(size)) continue;
                        const risk = Math.abs(entry - (sl || entry * 0.99)) * size;
                        const reward = Math.abs((tp || entry * 1.01) - entry) * size;
                        imported.push({
                            id: `csv-${i}-${Date.now()}`,
                            asset: cols[1]?.toUpperCase() || 'UNKNOWN',
                            assetType: guessAssetType(cols[1] || ''),
                            entry, stopLoss: sl || entry * 0.99, takeProfit: tp || entry * 1.01, lotSize: size,
                            riskUSD: risk, rewardUSD: reward,
                            rr: risk > 0 ? reward / risk : 0,
                            outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'open',
                            createdAt: cols[0] || new Date().toISOString(),
                            closedAt: cols[0] || new Date().toISOString(),
                            pnl, isShort: side === 'sell' || side === 'short',
                        });
                    }
                } catch { continue; }
            }

            if (imported.length > 0) setTrades([...trades, ...imported]);
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Use only closed trades to assess absolute win rate/pnl
    const closedTrades = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');

    // Total P&L
    const wins = closedTrades.filter(t => t.outcome === 'win');
    const losses = closedTrades.filter(t => t.outcome === 'loss');
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    // Win Rate
    const winRate = closedTrades.length > 0
        ? Math.round((wins.length / closedTrades.length) * 100)
        : 0;

    // Avg RR is best computed from confirmed data
    const avgRR = closedTrades.filter(t => t.rr > 0).length > 0
        ? closedTrades.filter(t => t.rr > 0).reduce((s, t, _, arr) => s + t.rr / arr.length, 0)
        : 0;

    return (
        <div className={styles.page}>
            <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSVImport} />
            <div className={styles.pageHeader}>
                <div className={styles.pageIcon}>
                    <BookOpen size={24} />
                </div>
                <div style={{ flex: 1 }}>
                    <h1 className="text-subheading">HUD Flight Log</h1>
                    <p className="text-caption">Execution history & audit trail</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                        onClick={() => csvRef.current?.click()}
                        className="btn btn--ghost btn--sm"
                        title="Import CSV (MT4/MT5/DXTrade)"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
                    >
                        <Upload size={13} /> Import CSV
                    </button>
                    {trades.length > 0 && (
                        <button
                            onClick={handleExportCSV}
                            className="btn btn--ghost btn--sm"
                            title="Export all trades as CSV"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
                        >
                            <FileDown size={13} /> Export
                        </button>
                    )}
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
                    <span className={styles.summaryLabel}>EXECUTIONS</span>
                    <span className={styles.summaryValue}>{trades.length}</span>
                </div>
            </div>

            {/* View Toggle */}
            {trades.length > 0 && (
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
            )}

            {/* Trade History */}
            {trades.length === 0 ? (
                <div className={styles.emptyCard}>
                    <BookOpen size={48} strokeWidth={1} className="text-[var(--text-muted)]" />
                    <p className="text-subheading mt-3 text-[var(--text-secondary)]">Log Empty</p>
                    <p className="text-caption mb-6">Commit trades via the Risk Engine to populate HUD Flight Log.</p>

                    <button
                        onClick={handleImportTrades}
                        className="btn btn--primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                        <DownloadCloud size={16} /> Import Tradeify History
                    </button>
                </div>
            ) : viewMode === 'list' ? (
                <div className={styles.tradeList}>
                    {trades.map((trade, i) => (
                        <motion.div
                            key={trade.id}
                            className={styles.tradeCard}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05, duration: 0.2 }}
                        >
                            <div className={styles.tradeTop}>
                                <div className={styles.tradeLeft}>
                                    <div className={`${styles.tradeAvatar} ${trade.outcome === 'win' ? styles.win :
                                        trade.outcome === 'loss' ? styles.loss : styles.open
                                        }`}>
                                        {trade.outcome === 'win' ? <TrendingUp size={20} /> :
                                            trade.outcome === 'loss' ? <TrendingDown size={20} /> :
                                                <Activity size={20} strokeWidth={1.5} />}
                                    </div>
                                    <div>
                                        <span className={styles.tradeAsset}>{trade.asset}</span>
                                        <span className={styles.tradeDate}>
                                            {new Date(trade.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {new Date(trade.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} {trade.closedAt ? `→ ${new Date(trade.closedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '· OPEN'}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.tradeRight}>
                                    <span className={`${styles.tradePnl} ${trade.outcome === 'win' ? 'text-success' :
                                        trade.outcome === 'loss' ? 'text-danger' : 'text-secondary'
                                        }`}>
                                        {trade.outcome === 'win' ? '+' : trade.outcome === 'loss' ? '-' : '~'}
                                        ${Math.abs(trade.pnl ?? (trade.outcome === 'win' ? trade.rewardUSD : trade.riskUSD)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-caption uppercase tracking-[0.1em]">
                                        {trade.outcome === 'win' ? 'WIN' : trade.outcome === 'loss' ? 'LOSS' : 'OPEN'}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.tradeMeta}>
                                <div className={styles.metaItem}>ENTRY<strong className="text-[#fff]">{trade.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>SL<strong className="text-danger">{trade.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>TP<strong className="text-success">{trade.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</strong></div>
                                <div className={styles.metaItem}>YIELD<strong className="text-cyan">{trade.rr.toFixed(1)}R</strong></div>
                            </div>
                            <textarea
                                className={styles.tradeNote}
                                placeholder="Add a note — setup, emotions, mistakes…"
                                value={trade.note ?? ''}
                                onChange={e => updateTradeNote(trade.id, e.target.value)}
                                rows={2}
                            />
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
                            <button onClick={prevMonth} className="btn btn--ghost btn--sm p-1" title="Previous Month" aria-label="Previous Month"><ChevronLeft size={16} /></button>
                            <h3 className={styles.calendarTitle}>{calendarData.monthName} {calendarData.year}</h3>
                            <button onClick={nextMonth} className="btn btn--ghost btn--sm p-1" title="Next Month" aria-label="Next Month"><ChevronRight size={16} /></button>
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
                                                        {dayData.pnl >= 0 ? '+' : '-'}${Math.abs(dayData.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                    <span className={styles.calendarTrades}>{dayData.tradesCount} {dayData.tradesCount === 1 ? 'trade' : 'trades'}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div className={`${styles.calendarCell} ${styles.calendarWeeklyCell}`}>
                                    <span className={styles.weeklyLabel}>Week {week.weekNumber}</span>
                                    <span className={`${styles.calendarCellPnl} ${week.weekPnl >= 0 ? styles.pnlPositiveText : styles.pnlNegativeText}`}>
                                        {week.weekPnl >= 0 ? '+' : '-'}${Math.abs(week.weekPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className={styles.calendarTrades}>{week.weekTrades} {week.weekTrades === 1 ? 'trade' : 'trades'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
