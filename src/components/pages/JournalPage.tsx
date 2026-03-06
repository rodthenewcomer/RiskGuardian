'use client';

import styles from './JournalPage.module.css';
import { useState, useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, TrendingUp, TrendingDown, Activity, DownloadCloud, LayoutList, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { SEED_TRADES } from '@/data/seedTrades';

export default function JournalPage() {
    const { trades, setTrades } = useAppStore();
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
            <div className={styles.pageHeader}>
                <div className={styles.pageIcon}>
                    <BookOpen size={24} />
                </div>
                <div>
                    <h1 className="text-subheading">HUD Flight Log</h1>
                    <p className="text-caption">Execution history & audit trail</p>
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
                                            {new Date(trade.createdAt).toLocaleString()} → {trade.closedAt ? new Date(trade.closedAt).toLocaleTimeString() : 'OPEN'}
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
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Sa'].map((d, i) => (
                                <div key={i} className={styles.calendarDayName}>{d === 'Sa' && i === 7 ? '' : d}</div>
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
