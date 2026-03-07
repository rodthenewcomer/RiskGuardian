'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAppStore, getTradingDay } from '@/store/appStore';
import { generateForensics } from '@/ai/EdgeForensics';
import { motion } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Activity, Calculator, Zap,
    AlertTriangle, Shield, Clock, Ban, CalendarDays,
    ArrowRight, ChevronRight,
} from 'lucide-react';
import PnLChart from '@/components/analytics/PnLChart';

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1] as const, duration: 0.4 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

export default function DashboardPage() {
    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line
    useEffect(() => { setMounted(true); }, []);

    const { account, trades, getTodayRiskUsed, setActiveTab } = useAppStore();

    // ── Daily Guard ────────────────────────────────────────────
    const used      = mounted ? getTodayRiskUsed() : 0;
    const remaining = mounted ? Math.max(0, account.dailyLossLimit - used) : account.dailyLossLimit;
    const usedPct   = account.dailyLossLimit > 0 ? Math.min(100, (used / account.dailyLossLimit) * 100) : 0;
    const isDanger  = mounted && usedPct >= 90;
    const isWarning = mounted && usedPct >= 60;
    const maxPerTrade  = (account.balance * account.maxRiskPercent) / 100;
    const safeNextRisk = mounted ? Math.min(maxPerTrade, remaining) : maxPerTrade;

    // ── Trade stats ────────────────────────────────────────────
    const closedTrades = useMemo(() =>
        trades
            .filter(t => t.outcome === 'win' || t.outcome === 'loss')
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [trades]);

    const wins   = closedTrades.filter(t => t.outcome === 'win');
    const losses = closedTrades.filter(t => t.outcome === 'loss');
    const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;

    const totalPnl = useMemo(() =>
        closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0),
    [closedTrades]);

    const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const grossLoss   = losses.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    // ── Equity curve data ──────────────────────────────────────
    const pnlChartData = useMemo(() =>
        closedTrades.reduce((acc, t) => {
            const pnl = t.pnl ?? 0;
            const cumulative = (acc.length > 0 ? acc[acc.length - 1].cumulative : 0) + pnl;
            acc.push({ id: t.id, pnl, cumulative, asset: t.asset });
            return acc;
        }, [] as { id: string; pnl: number; cumulative: number; asset: string }[]),
    [closedTrades]);

    // ── Tradeify Consistency — uses 5 PM EST trading day rollover ──
    const { consistencyScore, bestDayPnl, bestTradingDay } = useMemo(() => {
        if (totalPnl <= 0 || closedTrades.length === 0)
            return { consistencyScore: 0, bestDayPnl: 0, bestTradingDay: '' };
        const dailyPnls: Record<string, number> = {};
        closedTrades.forEach(t => {
            const day = getTradingDay(t.closedAt ?? t.createdAt);
            dailyPnls[day] = (dailyPnls[day] || 0) + (t.pnl ?? 0);
        });
        const best = Object.entries(dailyPnls).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0]);
        return {
            consistencyScore: (best[1] / totalPnl) * 100,
            bestDayPnl: best[1],
            bestTradingDay: best[0],
        };
    }, [closedTrades, totalPnl]);

    const consistencyPassing = consistencyScore <= 20 && totalPnl > 0;

    // ── Current streak ─────────────────────────────────────────
    const { streakCount, streakType } = useMemo(() => {
        if (closedTrades.length === 0) return { streakCount: 0, streakType: 'W' as 'W' | 'L' };
        const lastIsWin = (closedTrades[closedTrades.length - 1].pnl ?? 0) >= 0;
        let count = 0;
        for (let i = closedTrades.length - 1; i >= 0; i--) {
            if (((closedTrades[i].pnl ?? 0) >= 0) === lastIsWin) count++;
            else break;
        }
        return { streakCount: count, streakType: lastIsWin ? 'W' as const : 'L' as const };
    }, [closedTrades]);

    // ── Session intelligence (forensics) ──────────────────────
    const forensics = useMemo(() => generateForensics(trades, account), [trades, account]);
    const bestHour  = forensics.timeStats.bestHour;

    // ── Revenge sizing alert ───────────────────────────────────
    const revengeAlert = mounted && trades.length >= 2 &&
        trades[0].outcome === 'loss' &&
        trades[1].riskUSD > 0 &&
        trades[0].riskUSD > trades[1].riskUSD * 1.3;

    const recentTrades = trades.slice(0, 6);
    const isTradeify   = account.propFirm?.toLowerCase().includes('tradeify');

    // ── Stat colors ────────────────────────────────────────────
    const pnlColor    = totalPnl >= 0 ? '#A6FF4D' : '#ff4757';
    const wrColor     = winRate >= 55 ? '#A6FF4D' : winRate >= 45 ? '#EAB308' : '#ff4757';
    const streakColor = streakType === 'W' ? '#A6FF4D' : '#ff4757';
    const pfColor     = profitFactor >= 1.5 ? '#A6FF4D' : profitFactor >= 1 ? '#EAB308' : '#ff4757';

    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
    const label: React.CSSProperties = { ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block' };
    const divider = '1px solid #1a1c24';

    return (
        <motion.div variants={stagger} initial="hidden" animate="show"
            style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh' }}
        >
            {/* ── 1. LIVE STATUS BAR ─────────────────────────────── */}
            <motion.div variants={fadeUp} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 20px', borderBottom: divider,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#A6FF4D', boxShadow: '0 0 6px #A6FF4D' }} />
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>LIVE</span>
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', marginLeft: 8 }}>
                        {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {account.propFirm && (
                        <span style={{ ...mono, fontSize: 10, color: '#A6FF4D', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            {account.propFirm}
                        </span>
                    )}
                    <span style={{ ...mono, fontSize: 10, padding: '2px 8px', border: divider, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {account.assetType}
                    </span>
                </div>
            </motion.div>

            {/* ── 2. BALANCE HERO ────────────────────────────────── */}
            <motion.div variants={fadeUp} style={{ padding: '24px 20px 20px', borderBottom: divider }}>
                <span style={{ ...label, marginBottom: 6 }}>Account Balance</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                    <motion.span
                        key={account.balance}
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        style={{ ...mono, fontSize: 42, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}
                    >
                        ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </motion.span>
                    {closedTrades.length > 0 && (
                        <span style={{ ...mono, fontSize: 13, color: pnlColor, fontWeight: 700 }}>
                            {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} net&nbsp;·&nbsp;{closedTrades.length} closed
                        </span>
                    )}
                </div>
                {pnlChartData.length > 1 && (
                    <div style={{ marginTop: 16, height: 90 }}>
                        <PnLChart data={pnlChartData} />
                    </div>
                )}
            </motion.div>

            {/* ── 3. STAT STRIP ──────────────────────────────────── */}
            {closedTrades.length > 0 && (
                <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: divider }}>
                    {[
                        { lbl: 'NET P&L',       val: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, clr: pnlColor,    sub: `${wins.length}W · ${losses.length}L` },
                        { lbl: 'WIN RATE',       val: `${winRate}%`,                   clr: wrColor,     sub: `${closedTrades.length} trades` },
                        { lbl: 'STREAK',         val: `${streakCount}${streakType}`,   clr: streakColor, sub: streakType === 'W' ? 'on fire' : 'drawdown' },
                        { lbl: 'PROFIT FACTOR',  val: profitFactor > 0 ? profitFactor.toFixed(2) : '—', clr: pfColor, sub: '≥1.5 = edge' },
                    ].map((s, i) => (
                        <div key={i} style={{ padding: '14px 12px', borderRight: i < 3 ? divider : 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={label}>{s.lbl}</span>
                            <span style={{ ...mono, fontSize: 18, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.val}</span>
                            <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{s.sub}</span>
                        </div>
                    ))}
                </motion.div>
            )}

            {/* ── 4. REVENGE ALERT ───────────────────────────────── */}
            {revengeAlert && (
                <motion.div variants={fadeUp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.06)' }}>
                    <AlertTriangle size={13} color="#ff4757" />
                    <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        REVENGE RISK — Last loss was oversized. Reduce next position.
                    </span>
                </motion.div>
            )}

            {/* ── 5. DAILY GUARD ─────────────────────────────────── */}
            <motion.div variants={fadeUp} style={{ padding: '20px', borderBottom: divider }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Shield size={12} color="#4b5563" />
                        <span style={label}>Daily Loss Guard</span>
                        <span style={{ ...mono, fontSize: 10, color: '#6b7280' }}>/ ${account.dailyLossLimit.toLocaleString()}</span>
                    </div>
                    <span style={{
                        ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', textTransform: 'uppercase',
                        color: isDanger ? '#ff4757' : isWarning ? '#EAB308' : '#A6FF4D',
                        border: `1px solid ${isDanger ? 'rgba(255,71,87,0.4)' : isWarning ? 'rgba(234,179,8,0.4)' : 'rgba(166,255,77,0.3)'}`,
                        background: isDanger ? 'rgba(255,71,87,0.08)' : isWarning ? 'rgba(234,179,8,0.08)' : 'rgba(166,255,77,0.06)',
                    }}>
                        {isDanger ? 'DANGER' : isWarning ? 'WARNING' : 'SAFE'}
                    </span>
                </div>

                <div style={{ position: 'relative', height: 6, background: '#1a1c24', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
                    <motion.div
                        initial={{ width: 0 }} animate={{ width: `${usedPct}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        style={{
                            position: 'absolute', inset: 0, borderRadius: 3,
                            background: isDanger ? '#ff4757' : isWarning ? '#EAB308' : '#A6FF4D',
                            boxShadow: `0 0 8px ${isDanger ? 'rgba(255,71,87,0.5)' : isWarning ? 'rgba(234,179,8,0.4)' : 'rgba(166,255,77,0.4)'}`,
                        }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
                    {[
                        { lbl: 'USED',      val: `$${used.toFixed(0)}`,       clr: '#ff4757' },
                        { lbl: 'REMAINING', val: `$${remaining.toFixed(0)}`,  clr: remaining === 0 ? '#ff4757' : '#A6FF4D' },
                        { lbl: 'SAFE NEXT', val: `$${safeNextRisk.toFixed(0)}`, clr: '#A6FF4D' },
                    ].map((s, i) => (
                        <div key={i} style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 16 : 0, paddingLeft: i > 0 ? 16 : 0 }}>
                            <span style={label}>{s.lbl}</span>
                            <span style={{ ...mono, fontSize: 22, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em', display: 'block', marginTop: 3 }}>{s.val}</span>
                        </div>
                    ))}
                </div>

                {isDanger && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={12} color="#ff4757" />
                        <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>STOP — Daily limit almost reached</span>
                    </motion.div>
                )}
            </motion.div>

            {/* ── 6. TRADEIFY CONSISTENCY ────────────────────────── */}
            {isTradeify && totalPnl > 0 && (
                <motion.div variants={fadeUp} style={{ padding: '20px', borderBottom: divider }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={12} color="#4b5563" />
                            <span style={label}>Consistency Rule</span>
                            <span style={{ ...mono, fontSize: 10, color: '#6b7280' }}>/ best day ≤ 20% of profit</span>
                        </div>
                        <span style={{
                            ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', textTransform: 'uppercase',
                            color: consistencyPassing ? '#A6FF4D' : '#ff4757',
                            border: `1px solid ${consistencyPassing ? 'rgba(166,255,77,0.4)' : 'rgba(255,71,87,0.4)'}`,
                            background: consistencyPassing ? 'rgba(166,255,77,0.06)' : 'rgba(255,71,87,0.08)',
                        }}>
                            {consistencyPassing ? 'PASSING' : 'FAILING'}
                        </span>
                    </div>

                    {/* Bar — scale: 0% to 40%+ (20% limit = 50% of bar) */}
                    <div style={{ position: 'relative', height: 6, background: '#1a1c24', borderRadius: 3, marginBottom: 6 }}>
                        <motion.div
                            initial={{ width: 0 }} animate={{ width: `${Math.min(100, (consistencyScore / 40) * 100)}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            style={{ position: 'absolute', inset: 0, borderRadius: 3, background: consistencyPassing ? '#A6FF4D' : '#ff4757' }}
                        />
                        <div style={{ position: 'absolute', top: -3, left: '50%', bottom: -3, width: 1, background: 'rgba(255,255,255,0.25)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>0%</span>
                        <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>20% LIMIT</span>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>40%+</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
                        {[
                            { lbl: 'Best Day %',    val: `${consistencyScore.toFixed(1)}%`, clr: consistencyPassing ? '#A6FF4D' : '#ff4757' },
                            { lbl: 'Best Day $',    val: `$${bestDayPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, clr: '#e2e8f0' },
                            { lbl: 'Total Profit',  val: `$${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, clr: '#A6FF4D' },
                        ].map((s, i) => (
                            <div key={i} style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 14 : 0, paddingLeft: i > 0 ? 14 : 0 }}>
                                <span style={label}>{s.lbl}</span>
                                <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.clr, lineHeight: 1.2, display: 'block', marginTop: 3, letterSpacing: '-0.02em' }}>{s.val}</span>
                            </div>
                        ))}
                    </div>

                    {!consistencyPassing && (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', ...mono, fontSize: 10, color: '#ff4757', lineHeight: 1.6 }}>
                            FAILING: {bestTradingDay} accounts for {consistencyScore.toFixed(1)}% of total profit.
                            Distribute P&L across more days to pass the 20% rule.
                        </div>
                    )}
                </motion.div>
            )}

            {/* ── 7. SESSION INTELLIGENCE ────────────────────────── */}
            {closedTrades.length >= 5 && (
                <motion.div variants={fadeUp} style={{ borderBottom: divider }}>
                    <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={11} color="#4b5563" />
                        <span style={label}>Session Intelligence</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>
                        {[
                            { icon: <Clock size={14} color="#A6FF4D" />,     lbl: 'Peak Hour',      val: `${bestHour}:00`,          sub: 'highest P&L window' },
                            { icon: <TrendingUp size={14} color={streakColor} />, lbl: 'Streak',    val: `${streakCount}${streakType}`, sub: streakType === 'W' ? 'momentum' : 'reset now' },
                            { icon: <Shield size={14} color="#A6FF4D" />,    lbl: 'Max Next Risk',  val: `$${safeNextRisk.toFixed(0)}`, sub: `${account.maxRiskPercent}% of bal` },
                        ].map((item, i) => (
                            <div key={i} style={{ padding: '14px 14px', borderRight: i < 2 ? divider : 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {item.icon}
                                <span style={label}>{item.lbl}</span>
                                <span style={{ ...mono, fontSize: 18, fontWeight: 800, color: '#e2e8f0', lineHeight: 1, letterSpacing: '-0.02em' }}>{item.val}</span>
                                <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{item.sub}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── 8. PROP RULES (compact) ────────────────────────── */}
            {account.propFirm && (
                <motion.div variants={fadeUp} style={{ padding: '16px 20px', borderBottom: divider }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Shield size={11} color="#4b5563" />
                        <span style={label}>Rule Compliance</span>
                        <span style={{ marginLeft: 'auto', ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '2px 8px', textTransform: 'uppercase', color: isDanger ? '#ff4757' : '#A6FF4D', border: `1px solid ${isDanger ? 'rgba(255,71,87,0.3)' : 'rgba(166,255,77,0.3)'}` }}>
                            {isDanger ? 'AT RISK' : 'COMPLIANT'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {([
                            { dot: isDanger ? 'red' : isWarning ? 'yellow' : 'green', text: `Daily loss: ${usedPct.toFixed(1)}% used of $${account.dailyLossLimit.toLocaleString()}` },
                            { dot: 'green', text: `Max trade risk: $${maxPerTrade.toFixed(0)} (${account.maxRiskPercent}%)` },
                            { dot: 'green', text: `Leverage: ${account.leverage || 2}:1` },
                            account.maxDrawdownLimit ? { dot: 'yellow', text: `Max drawdown: ${account.drawdownType || 'EOD'} — $${account.maxDrawdownLimit.toLocaleString()}` } : null,
                            isTradeify ? { icon: 'ban', text: 'Anti-hedging: no offsetting positions' } : null,
                            isTradeify ? { icon: 'cal', text: 'Inactivity: trade at least every 30 days' } : null,
                        ] as any[]).filter(Boolean).map((rule: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {rule.icon === 'ban' ? <Ban size={11} color="#ff4757" />
                                    : rule.icon === 'cal' ? <CalendarDays size={11} color="#EAB308" />
                                        : <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: rule.dot === 'green' ? '#A6FF4D' : rule.dot === 'yellow' ? '#EAB308' : '#ff4757' }} />}
                                <span style={{ ...mono, fontSize: 11, color: '#8b949e' }}>{rule.text}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── 9. RECENT TRADES ───────────────────────────────── */}
            {recentTrades.length > 0 ? (
                <motion.div variants={fadeUp}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 8px' }}>
                        <span style={label}>Recent Trades</span>
                        <button onClick={() => setActiveTab('journal')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, ...mono, fontSize: 10, color: '#A6FF4D', letterSpacing: '0.06em', textTransform: 'uppercase', padding: 0 }}>
                            View All <ChevronRight size={11} />
                        </button>
                    </div>
                    {recentTrades.map((trade, i) => (
                        <div key={trade.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 20px', borderTop: divider }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: trade.outcome === 'win' ? 'rgba(166,255,77,0.1)' : trade.outcome === 'loss' ? 'rgba(255,71,87,0.1)' : 'rgba(255,255,255,0.04)',
                                }}>
                                    {trade.outcome === 'win' ? <TrendingUp size={14} color="#A6FF4D" />
                                        : trade.outcome === 'loss' ? <TrendingDown size={14} color="#ff4757" />
                                            : <Activity size={14} color="#6b7280" />}
                                </div>
                                <div>
                                    <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#e2e8f0', display: 'block', letterSpacing: '0.02em' }}>{trade.asset}</span>
                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', display: 'block', marginTop: 1 }}>
                                        {new Date(trade.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        {trade.isShort ? ' · SHORT' : ' · LONG'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ ...mono, fontSize: 14, fontWeight: 800, display: 'block', letterSpacing: '-0.01em', color: trade.outcome === 'win' ? '#A6FF4D' : trade.outcome === 'loss' ? '#ff4757' : '#6b7280' }}>
                                    {trade.outcome === 'win' ? '+' : trade.outcome === 'loss' ? '-' : ''}
                                    ${Math.abs(trade.pnl ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase' }}>
                                    {trade.outcome === 'win' ? 'WIN' : trade.outcome === 'loss' ? 'LOSS' : 'OPEN'}
                                </span>
                            </div>
                        </div>
                    ))}
                </motion.div>
            ) : (
                <motion.div variants={fadeUp} style={{ padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                    <span style={{ fontSize: 32 }}>📊</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', marginTop: 8 }}>No trades logged yet</span>
                    <span style={{ fontSize: 12, color: '#6b7280', maxWidth: 260, lineHeight: 1.6 }}>Open the Risk Engine, calculate your size, and log your first trade.</span>
                    <button onClick={() => setActiveTab('terminal')} className="btn btn--primary" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Calculator size={14} /> Open Risk Engine
                    </button>
                </motion.div>
            )}

            {/* ── 10. QUICK ACTIONS ──────────────────────────────── */}
            <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: divider, marginTop: 'auto' }}>
                <button onClick={() => setActiveTab('terminal')}
                    style={{ padding: '18px', background: '#A6FF4D', border: 'none', borderRight: '1px solid #090909', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...mono, fontSize: 12, fontWeight: 800, color: '#000', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <Calculator size={14} /> Calculate
                </button>
                <button onClick={() => setActiveTab('analytics')}
                    style={{ padding: '18px', background: '#0d1117', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...mono, fontSize: 12, fontWeight: 800, color: '#A6FF4D', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Analytics <ArrowRight size={14} />
                </button>
            </motion.div>
        </motion.div>
    );
}
