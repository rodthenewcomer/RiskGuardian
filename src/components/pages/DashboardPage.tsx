'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useAppStore, getTradingDay, computeDrawdownFloor } from '@/store/appStore';
import { generateForensics } from '@/ai/EdgeForensics';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
    TrendingUp, TrendingDown, Activity, Calculator, Zap,
    AlertTriangle, Shield, Clock, Ban, CalendarDays,
    ArrowRight, ChevronRight,
} from 'lucide-react';
import PnLChart from '@/components/analytics/PnLChart';

const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1] as const, duration: 0.45 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const tradeRowVariant = {
    hidden: { opacity: 0, x: -10 },
    show:  { opacity: 1,  x: 0,  transition: { ease: [0.16, 1, 0.3, 1] as const, duration: 0.35 } },
};
const tradeListStagger = { hidden: {}, show: { transition: { staggerChildren: 0.055 } } };

/** Counts up from 0 → target on mount */
function useCountUp(target: number, duration = 950) {
    const [val, setVal] = useState(0);
    const raf = useRef<number>(0);
    useEffect(() => {
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            setVal(target * ease);
            if (t < 1) raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf.current);
    }, [target, duration]);
    return val;
}

export default function DashboardPage() {
    const [mounted, setMounted] = useState(false);
    const [hoveredTrade, setHoveredTrade] = useState<string | null>(null);
    const isMobile = useIsMobile();
    // eslint-disable-next-line
    useEffect(() => { setMounted(true); }, []);

    const { account, trades, getTodayRiskUsed, setActiveTab } = useAppStore();

    // ── Today's trading day string (EST) ───────────────────────
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // ── Today's actual realized losses from trade history ──────
    const todayActualLoss = useMemo(() => {
        const net = trades
            .filter(t => t.outcome !== 'open' && getTradingDay(t.closedAt ?? t.createdAt) === todayStr)
            .reduce((s, t) => s + (t.pnl ?? 0), 0);
        return Math.max(0, -net);
    }, [trades, todayStr]);

    // ── Daily Guard ────────────────────────────────────────────
    // Use actual realized P&L if trades exist; fall back to manual session tracking
    const manualUsed = mounted ? getTodayRiskUsed() : 0;
    const used       = mounted ? Math.max(manualUsed, todayActualLoss) : 0;
    const remaining  = mounted ? Math.max(0, account.dailyLossLimit - used) : account.dailyLossLimit;
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

    // Newest-first for the recent trades list
    const recentTrades = useMemo(() =>
        [...trades]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 6),
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

    // ── Open trades alert ─────────────────────────────────────
    const openTrades = useMemo(() => trades.filter(t => t.outcome === 'open'), [trades]);

    // Weekend gap risk: warn if there are open crypto trades on Friday after 5PM or Saturday/Sunday
    const weekendGapAlert = useMemo(() => {
        if (openTrades.length === 0) return false;
        const now = new Date();
        const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = estNow.getDay(); // 0=Sun, 5=Fri, 6=Sat
        const hour = estNow.getHours();
        const isFridayEvening = day === 5 && hour >= 16;
        const isWeekend = day === 6 || day === 0;
        if (!isFridayEvening && !isWeekend) return false;
        return openTrades.some(t => t.assetType === 'crypto');
    }, [openTrades]);

    const isTradeify      = account.propFirm?.toLowerCase().includes('tradeify');
    const isInstantFunded = account.propFirmType === 'Instant Funding';
    const isEval          = account.propFirmType === '1-Step Evaluation' || account.propFirmType === '2-Step Evaluation';

    // ── Drawdown floor (computed from full trade history) ──────
    const drawdownInfo = useMemo(() =>
        computeDrawdownFloor(account, closedTrades),
    [account, closedTrades]);
    const floorDanger  = drawdownInfo.usedPct >= 80;
    const floorWarning = drawdownInfo.usedPct >= 50;


    // ── Count-up animated values ───────────────────────────────
    const animBalance   = useCountUp(mounted ? account.balance : 0, 1100);
    const animPnl       = useCountUp(mounted ? Math.abs(totalPnl) : 0, 950);
    const animUsed      = useCountUp(mounted ? used : 0, 800);
    const animRemaining = useCountUp(mounted ? remaining : 0, 800);
    const animSafeNext  = useCountUp(mounted ? safeNextRisk : 0, 800);
    const animBestDayPct  = useCountUp(mounted ? consistencyScore : 0, 900);
    const animBestDayAmt  = useCountUp(mounted ? bestDayPnl : 0, 900);
    const animTotalProfit = useCountUp(mounted ? totalPnl : 0, 900);
    const animFloor       = useCountUp(mounted ? drawdownInfo.floor : 0, 900);
    const animBuffer      = useCountUp(mounted ? Math.max(0, drawdownInfo.buffer) : 0, 900);

    // ── Stat colors ────────────────────────────────────────────
    const pnlColor    = totalPnl >= 0 ? '#A6FF4D' : '#ff4757';
    const wrColor     = winRate >= 55 ? '#A6FF4D' : winRate >= 45 ? '#EAB308' : '#ff4757';
    const streakColor = streakType === 'W' ? '#A6FF4D' : '#ff4757';
    const pfColor     = profitFactor >= 1.5 ? '#A6FF4D' : profitFactor >= 1 ? '#EAB308' : '#ff4757';

    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
    const lbl: React.CSSProperties  = { ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block' };
    const divider = '1px solid #1a1c24';
    const card: React.CSSProperties = {
        margin: isMobile ? '0 0 8px' : '0 12px 8px',
        background: '#0c0e13',
        borderRadius: isMobile ? 0 : 8,
        border: divider,
        overflow: 'hidden',
    };

    if (!mounted) return null;

    if (!account.startingBalance || account.startingBalance === 0) {
        return (
            <motion.div variants={stagger} initial="hidden" animate="show"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090909', minHeight: '100vh', padding: '20px', textAlign: 'center' }}
            >
                <motion.div variants={fadeUp}>
                    <Shield size={42} style={{ color: '#4b5563', marginBottom: 16 }} />
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>Account Not Setup</h2>
                    <p style={{ ...mono, fontSize: 13, color: '#8b949e', marginBottom: 24, maxWidth: 300 }}>
                        Complete setup in Settings to see your live dashboard — add your starting balance and prop firm rules.
                    </p>
                    <button
                        onClick={() => setActiveTab('settings')}
                        style={{ padding: '12px 24px', background: '#A6FF4D', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                        Go to Settings
                    </button>
                </motion.div>
            </motion.div>
        );
    }

    return (
        <motion.div variants={stagger} initial="hidden" animate="show"
            style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh' }}
        >
            {/* ── 1. LIVE STATUS BAR ─────────────────────────────── */}
            <motion.div variants={fadeUp} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: isMobile ? '8px 14px' : '10px 20px', borderBottom: divider, flexWrap: 'wrap', gap: 6,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Pulsing live dot */}
                    <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                        <motion.div
                            animate={{ scale: [1, 2.4, 1], opacity: [0.6, 0, 0.6] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                            style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#A6FF4D' }}
                        />
                        <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: '#A6FF4D', boxShadow: '0 0 8px #A6FF4D' }} />
                    </div>
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>LIVE</span>
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
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
            <motion.div variants={fadeUp} style={{ padding: isMobile ? '16px 14px' : '24px 20px 20px', borderBottom: divider }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={lbl}>Account Balance</span>
                    <span style={{ ...mono, fontSize: 8, padding: '2px 6px', background: 'rgba(166,255,77,0.1)', color: '#A6FF4D', borderRadius: 4, letterSpacing: '0.04em', border: '1px solid rgba(166,255,77,0.2)' }}>AUTO-COMPUTED</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                    <motion.span
                        key={account.balance}
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.5 }}
                        style={{ ...mono, fontSize: isMobile ? 32 : 42, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}
                    >
                        ${animBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </motion.span>
                    {closedTrades.length > 0 && (
                        <motion.span
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.4 }}
                            style={{ ...mono, fontSize: 13, color: pnlColor, fontWeight: 700 }}
                        >
                            {totalPnl >= 0 ? '+' : '-'}${animPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} net&nbsp;·&nbsp;{closedTrades.length} closed
                        </motion.span>
                    )}
                </div>
                {pnlChartData.length > 1 && (
                    <motion.div
                        initial={{ opacity: 0, scaleX: 0.6 }} animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.7, delay: 0.15 }}
                        style={{ marginTop: 16, height: 90, transformOrigin: 'left' }}
                    >
                        <PnLChart data={pnlChartData} />
                    </motion.div>
                )}
            </motion.div>

            {/* ── 3. STAT STRIP ──────────────────────────────────── */}
            {closedTrades.length > 0 && (
                <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', borderBottom: divider }}>
                    {[
                        { lbl: 'NET P&L',       val: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, clr: pnlColor,    sub: `${wins.length}W · ${losses.length}L` },
                        { lbl: 'WIN RATE',       val: `${winRate}%`,                   clr: wrColor,     sub: `${closedTrades.length} trades` },
                        { lbl: 'STREAK',         val: `${streakCount}${streakType}`,   clr: streakColor, sub: streakType === 'W' ? 'on fire' : 'drawdown' },
                        { lbl: 'PROFIT FACTOR',  val: profitFactor > 0 ? profitFactor.toFixed(2) : '—', clr: pfColor, sub: '≥1.5 = edge' },
                    ].map((s, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.08 + i * 0.07 }}
                            style={{
                                padding: isMobile ? '12px 12px' : '14px 12px',
                                borderRight: isMobile ? (i % 2 === 0 ? divider : 'none') : (i < 3 ? divider : 'none'),
                                borderBottom: isMobile && i < 2 ? divider : 'none',
                                display: 'flex', flexDirection: 'column', gap: 3,
                            }}
                        >
                            <span style={lbl}>{s.lbl}</span>
                            <span style={{ ...mono, fontSize: isMobile ? 16 : 18, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.val}</span>
                            <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{s.sub}</span>
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {/* ── 4. REVENGE ALERT ───────────────────────────────── */}
            {revengeAlert && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: '1px solid rgba(255,71,87,0.3)', background: 'rgba(255,71,87,0.06)' }}>
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                        <AlertTriangle size={13} color="#ff4757" />
                    </motion.div>
                    <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        REVENGE RISK — Last loss was oversized. Reduce next position.
                    </span>
                </motion.div>
            )}

            {/* ── CONSISTENCY ALERT ───────────────────────────────── */}
            {totalPnl > 0 && consistencyScore > 20 && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.06)' }}>
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                        <AlertTriangle size={13} color="#EAB308" />
                    </motion.div>
                    <span style={{ ...mono, fontSize: 11, color: '#EAB308', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        CONSISTENCY WARNING — Best day ({bestTradingDay}) is {consistencyScore.toFixed(1)}% of total profit (Max 20%).
                    </span>
                </motion.div>
            )}

            {/* ── OPEN TRADES ALERT ───────────────────────────────── */}
            {openTrades.length > 0 && (() => {
                const agedTrades = openTrades.filter(t => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 3600000) >= 4);
                const hasAged = agedTrades.length > 0;
                return (
                    <motion.div variants={fadeUp}
                        onClick={() => setActiveTab('journal')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: `1px solid ${hasAged ? 'rgba(234,179,8,0.3)' : 'rgba(0,212,255,0.3)'}`, background: hasAged ? 'rgba(234,179,8,0.06)' : 'rgba(0,212,255,0.06)', cursor: 'pointer', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                                <AlertTriangle size={13} color={hasAged ? '#EAB308' : '#00D4FF'} />
                            </motion.div>
                            <span style={{ ...mono, fontSize: 11, color: hasAged ? '#EAB308' : '#00D4FF', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                {hasAged
                                    ? `⚠ ${agedTrades.length} trade${agedTrades.length > 1 ? 's' : ''} have been open for 4h+ — log your outcome`
                                    : `${openTrades.length} OPEN TRADE${openTrades.length > 1 ? 'S' : ''} — Log outcome to unlock analysis.`
                                }
                            </span>
                        </div>
                        <ArrowRight size={13} color={hasAged ? '#EAB308' : '#00D4FF'} />
                    </motion.div>
                );
            })()}

            {weekendGapAlert && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.06)' }}>
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                        <AlertTriangle size={13} color="#EAB308" />
                    </motion.div>
                    <span style={{ ...mono, fontSize: 11, color: '#EAB308', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        WEEKEND GAP RISK — Open crypto position over weekend. Wider spreads and liquidity gaps on Sunday open.
                    </span>
                </motion.div>
            )}

            <div style={{ height: 12 }} />

            {/* ── 5. DAILY GUARD ─────────────────────────────────── */}
            <motion.div variants={fadeUp} style={card}>
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: divider }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Shield size={12} color="#4b5563" />
                        <span style={lbl}>Daily Loss Guard</span>
                        <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>/ ${account.dailyLossLimit.toLocaleString()}</span>
                    </div>
                    <motion.span
                        animate={isDanger ? { opacity: [1, 0.5, 1] } : {}}
                        transition={{ duration: 0.9, repeat: Infinity }}
                        style={{
                            ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', textTransform: 'uppercase', borderRadius: 3,
                            color: isDanger ? '#ff4757' : isWarning ? '#EAB308' : '#A6FF4D',
                            border: `1px solid ${isDanger ? 'rgba(255,71,87,0.5)' : isWarning ? 'rgba(234,179,8,0.4)' : 'rgba(166,255,77,0.3)'}`,
                            background: isDanger ? 'rgba(255,71,87,0.1)' : isWarning ? 'rgba(234,179,8,0.08)' : 'rgba(166,255,77,0.06)',
                        }}
                    >
                        {isDanger ? 'DANGER' : isWarning ? 'WARNING' : 'SAFE'}
                    </motion.span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '14px 16px' }}>
                    {[
                        { lbl: 'USED',      val: `$${animUsed.toFixed(0)}`,           clr: used > 0 ? '#ff4757' : '#4b5563' },
                        { lbl: 'REMAINING', val: `$${animRemaining.toFixed(0)}`,       clr: remaining === 0 ? '#ff4757' : '#A6FF4D' },
                        { lbl: 'SAFE NEXT', val: `$${animSafeNext.toFixed(0)}`,        clr: '#A6FF4D' },
                    ].map((s, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.12 + i * 0.07 }}
                            style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 14 : 0, paddingLeft: i > 0 ? 14 : 0 }}
                        >
                            <span style={lbl}>{s.lbl}</span>
                            <span style={{ ...mono, fontSize: 22, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em', display: 'block', marginTop: 4 }}>
                                {s.val}
                            </span>
                        </motion.div>
                    ))}
                </div>
                {isDanger && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ padding: '10px 16px', background: 'rgba(255,71,87,0.08)', borderTop: '1px solid rgba(255,71,87,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <AlertTriangle size={12} color="#ff4757" />
                        <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>STOP — Daily limit almost reached</span>
                    </motion.div>
                )}
            </motion.div>

            {/* ── 6. MAX DRAWDOWN FLOOR ──────────────────────────── */}
            {account.startingBalance > 0 && (
                <motion.div variants={fadeUp} style={card}>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: divider }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Shield size={12} color="#4b5563" />
                            <span style={lbl}>Max Drawdown Floor</span>
                            <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                / {account.drawdownType === 'Static' ? 'Static' : account.drawdownType === 'EOD' ? 'EOD Trailing' : 'EOT Trailing'}
                                {drawdownInfo.isLocked ? ' · LOCKED' : ''}
                            </span>
                        </div>
                        <motion.span
                            animate={floorDanger ? { opacity: [1, 0.5, 1] } : {}}
                            transition={{ duration: 0.9, repeat: Infinity }}
                            style={{
                                ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', textTransform: 'uppercase', borderRadius: 3,
                                color: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#A6FF4D',
                                border: `1px solid ${floorDanger ? 'rgba(255,71,87,0.5)' : floorWarning ? 'rgba(234,179,8,0.4)' : 'rgba(166,255,77,0.3)'}`,
                                background: floorDanger ? 'rgba(255,71,87,0.1)' : floorWarning ? 'rgba(234,179,8,0.08)' : 'rgba(166,255,77,0.06)',
                            }}
                        >
                            {floorDanger ? 'DANGER' : floorWarning ? 'WARNING' : 'SAFE'}
                        </motion.span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '14px 16px' }}>
                        {[
                            { lbl: 'FLOOR',   val: `$${animFloor.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,  clr: '#e2e8f0' },
                            { lbl: 'BUFFER',  val: `$${animBuffer.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, clr: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#A6FF4D' },
                            { lbl: 'USED',    val: `${drawdownInfo.usedPct.toFixed(1)}%`, clr: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#A6FF4D' },
                        ].map((s, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.12 + i * 0.07 }}
                                style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 14 : 0, paddingLeft: i > 0 ? 14 : 0 }}
                            >
                                <span style={lbl}>{s.lbl}</span>
                                <span style={{ ...mono, fontSize: 22, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em', display: 'block', marginTop: 4 }}>{s.val}</span>
                            </motion.div>
                        ))}
                    </div>
                    {/* Explain what the floor means */}
                    <div style={{ padding: '10px 16px', borderTop: divider, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                            {account.drawdownType === 'Static'
                                ? `Fixed floor: $${account.startingBalance.toLocaleString()} − ${account.maxDrawdownLimit ? `$${account.maxDrawdownLimit.toLocaleString()}` : '6%'}`
                                : account.drawdownType === 'EOD'
                                    ? 'Trails up at 17:00 EST · locks at starting balance'
                                    : 'Trails up after each closed trade · locks at starting balance'}
                        </span>
                        {account.payoutLockActive && (
                            <span style={{ ...mono, fontSize: 9, fontWeight: 800, color: '#EAB308', padding: '2px 8px', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 3, textTransform: 'uppercase' }}>
                                Payout Locked
                            </span>
                        )}
                    </div>
                    {floorDanger && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ padding: '10px 16px', background: 'rgba(255,71,87,0.08)', borderTop: '1px solid rgba(255,71,87,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                            <AlertTriangle size={12} color="#ff4757" />
                            <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>CRITICAL — Account floor dangerously close</span>
                        </motion.div>
                    )}
                </motion.div>
            )}

            {/* ── 7. TRADEIFY CONSISTENCY — INSTANT FUNDING ONLY ─── */}
            {isInstantFunded && totalPnl > 0 && (
                <motion.div variants={fadeUp} style={card}>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: divider }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={12} color="#4b5563" />
                            <span style={lbl}>Consistency Rule</span>
                            <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>/ best day ≤ 20%</span>
                        </div>
                        <motion.span
                            animate={!consistencyPassing ? { opacity: [1, 0.5, 1] } : {}}
                            transition={{ duration: 1.1, repeat: Infinity }}
                            style={{
                                ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', textTransform: 'uppercase', borderRadius: 3,
                                color: consistencyPassing ? '#A6FF4D' : '#ff4757',
                                border: `1px solid ${consistencyPassing ? 'rgba(166,255,77,0.5)' : 'rgba(255,71,87,0.5)'}`,
                                background: consistencyPassing ? 'rgba(166,255,77,0.06)' : 'rgba(255,71,87,0.1)',
                            }}
                        >
                            {consistencyPassing ? 'PASSING' : 'FAILING'}
                        </motion.span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '14px 16px' }}>
                        {[
                            { lbl: 'Best Day %',   val: `${animBestDayPct.toFixed(1)}%`, clr: consistencyPassing ? '#A6FF4D' : '#ff4757' },
                            { lbl: 'Best Day $',   val: `$${animBestDayAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, clr: '#e2e8f0' },
                            { lbl: 'Total Profit', val: `$${animTotalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, clr: '#A6FF4D' },
                        ].map((s, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.1 + i * 0.07 }}
                                style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 14 : 0, paddingLeft: i > 0 ? 14 : 0 }}
                            >
                                <span style={lbl}>{s.lbl}</span>
                                <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.clr, lineHeight: 1.2, display: 'block', marginTop: 4, letterSpacing: '-0.02em' }}>
                                    {s.val}
                                </span>
                            </motion.div>
                        ))}
                    </div>

                    {/* Consistency target — no progress bar, clean numeric row */}
                    {(() => {
                        const target = bestDayPnl / 0.20;
                        const stillNeeded = Math.max(0, target - totalPnl);
                        const buffer = totalPnl - target;
                        return (
                            <div style={{
                                padding: '12px 16px',
                                background: consistencyPassing ? 'rgba(166,255,77,0.04)' : 'rgba(255,71,87,0.04)',
                                borderTop: `1px solid ${consistencyPassing ? 'rgba(166,255,77,0.12)' : 'rgba(255,71,87,0.15)'}`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                            }}>
                                <div>
                                    <span style={{ ...mono, fontSize: 10, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                                        {consistencyPassing ? 'Buffer above limit' : 'Target total profit'}
                                    </span>
                                    {!consistencyPassing && (
                                        <span style={{ ...mono, fontSize: 10, color: '#ff4757' }}>
                                            Need <strong>${stillNeeded.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> more — {bestTradingDay} ≤ 20%
                                        </span>
                                    )}
                                </div>
                                <motion.span
                                    key={target}
                                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                    transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.2 }}
                                    style={{ ...mono, fontSize: 18, fontWeight: 900, color: consistencyPassing ? '#A6FF4D' : '#EAB308', letterSpacing: '-0.03em', flexShrink: 0 }}
                                >
                                    {consistencyPassing
                                        ? `+$${buffer.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                        : `$${target.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                </motion.span>
                            </div>
                        );
                    })()}
                </motion.div>
            )}

            {/* ── 8. SESSION INTELLIGENCE ────────────────────────── */}
            {closedTrades.length >= 5 && (
                <motion.div variants={fadeUp} style={card}>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: divider }}>
                        <Zap size={11} color="#4b5563" />
                        <span style={lbl}>Session Intelligence</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)' }}>
                        {[
                            { icon: <Clock size={14} color="#A6FF4D" />,          lbl: 'Peak Hour',     val: `${bestHour}:00`,              sub: 'highest P&L window' },
                            { icon: <TrendingUp size={14} color={streakColor} />, lbl: 'Streak',        val: `${streakCount}${streakType}`,  sub: streakType === 'W' ? 'momentum' : 'reset now' },
                            { icon: <Shield size={14} color="#A6FF4D" />,         lbl: 'Max Next Risk', val: `$${safeNextRisk.toFixed(0)}`,  sub: `${account.maxRiskPercent}% of bal` },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.1 + i * 0.08 }}
                                style={{
                                padding: '14px',
                                borderRight: isMobile ? (i % 2 === 0 ? divider : 'none') : (i < 2 ? divider : 'none'),
                                borderBottom: isMobile && i < 2 ? divider : 'none',
                                display: 'flex', flexDirection: 'column', gap: 5,
                            }}
                            >
                                {item.icon}
                                <span style={lbl}>{item.lbl}</span>
                                <span style={{ ...mono, fontSize: 18, fontWeight: 800, color: '#e2e8f0', lineHeight: 1, letterSpacing: '-0.02em' }}>{item.val}</span>
                                <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{item.sub}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── 8. PROP RULES ──────────────────────────────────── */}
            {account.propFirm && (
                <motion.div variants={fadeUp} style={card}>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: divider }}>
                        <Shield size={11} color="#4b5563" />
                        <span style={lbl}>Rule Compliance</span>
                        <span style={{
                            marginLeft: 'auto', ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                            padding: '2px 8px', textTransform: 'uppercase', borderRadius: 3,
                            color: (isDanger || floorDanger) ? '#ff4757' : '#A6FF4D',
                            border: `1px solid ${(isDanger || floorDanger) ? 'rgba(255,71,87,0.3)' : 'rgba(166,255,77,0.3)'}`,
                            background: (isDanger || floorDanger) ? 'rgba(255,71,87,0.06)' : 'rgba(166,255,77,0.04)',
                        }}>
                            {(isDanger || floorDanger) ? 'AT RISK' : 'COMPLIANT'}
                        </span>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {([
                            // ── Daily Loss Limit (all accounts) ─────────────────
                            { dot: isDanger ? 'red' : isWarning ? 'yellow' : 'green',
                              text: `Daily loss limit: $${account.dailyLossLimit.toLocaleString()} (3% of account) — ${usedPct.toFixed(1)}% used today` },

                            // ── Max Drawdown ─────────────────────────────────────
                            account.startingBalance > 0 ? {
                              dot: floorDanger ? 'red' : floorWarning ? 'yellow' : 'green',
                              text: isTradeify
                                ? account.drawdownType === 'Static'
                                    ? `Max drawdown: 6% static — floor locked at $${(account.startingBalance - (account.maxDrawdownLimit ?? account.startingBalance * 0.06)).toLocaleString()}`
                                    : account.drawdownType === 'EOD'
                                        ? `Max drawdown: 6% EOD trailing — snapshots at 17:00 EST · floor $${drawdownInfo.floor.toLocaleString()}`
                                        : `Max drawdown: 6% EOT trailing — trails after each closed trade · floor $${drawdownInfo.floor.toLocaleString()}`
                                : `Max drawdown: $${(account.maxDrawdownLimit ?? 0).toLocaleString()}`,
                            } : null,

                            // ── Leverage (Tradeify) ──────────────────────────────
                            isTradeify ? {
                              dot: 'green',
                              text: isInstantFunded
                                ? 'Leverage: 2:1 on all pairs (including BTC & ETH)'
                                : 'Leverage: 5:1 BTC/ETH · 2:1 all other crypto pairs',
                            } : { dot: 'green', text: `Leverage: ${account.leverage || 2}:1` },

                            // ── Microscalping (Tradeify only) ────────────────────
                            isTradeify ? { icon: 'clock', text: 'Min hold time: 20 seconds per trade (microscalping rule)' } : null,

                            // ── Consistency (Instant Funding only) ──────────────
                            isInstantFunded ? {
                              dot: consistencyPassing ? 'green' : 'yellow',
                              text: `Consistency score: ${consistencyScore.toFixed(1)}% — must be ≤ 20% to request payout`,
                            } : null,

                            // ── Payout Lock (Instant Funding only) ──────────────
                            isInstantFunded ? {
                              dot: account.payoutLockActive ? 'yellow' : 'green',
                              text: account.payoutLockActive
                                ? 'Payout lock: ACTIVE — floor permanently locked at starting balance'
                                : 'Payout lock: not triggered — activate on first payout request',
                            } : null,

                            // ── Anti-hedging ─────────────────────────────────────
                            isTradeify ? { icon: 'ban', text: 'No hedging — offsetting positions not allowed (auto-detected)' } : null,

                            // ── Inactivity ────────────────────────────────────────
                            isTradeify ? { icon: 'cal', text: 'Inactivity: must trade at least once every 30 days' } : null,

                            // ── Non-Tradeify fallback ────────────────────────────
                            !isTradeify ? { dot: 'green', text: `Max trade risk: $${maxPerTrade.toFixed(0)} (${account.maxRiskPercent}%)` } : null,
                        ] as any[]).filter(Boolean).map((rule: any, i: number) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35, delay: 0.04 + i * 0.05 }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                {rule.icon === 'ban'   ? <Ban size={11} color="#ff4757" />
                                    : rule.icon === 'cal'   ? <CalendarDays size={11} color="#EAB308" />
                                    : rule.icon === 'clock' ? <Clock size={11} color="#EAB308" />
                                    : <div style={{
                                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                                        background: rule.dot === 'green' ? '#A6FF4D' : rule.dot === 'yellow' ? '#EAB308' : '#ff4757',
                                        boxShadow: `0 0 5px ${rule.dot === 'green' ? '#A6FF4D40' : rule.dot === 'yellow' ? '#EAB30840' : '#ff475740'}`,
                                    }} />}
                                <span style={{ ...mono, fontSize: 11, color: '#8b949e' }}>{rule.text}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── 9. RECENT TRADES ───────────────────────────────── */}
            {recentTrades.length > 0 ? (
                <motion.div variants={fadeUp} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: divider }}>
                        <span style={lbl}>Recent Trades</span>
                        <button onClick={() => setActiveTab('journal')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, ...mono, fontSize: 10, color: '#A6FF4D', letterSpacing: '0.06em', textTransform: 'uppercase', padding: 0 }}>
                            View All <ChevronRight size={11} />
                        </button>
                    </div>
                    <motion.div variants={tradeListStagger} initial="hidden" animate="show">
                        {recentTrades.map((trade) => (
                            <motion.div
                                key={trade.id}
                                variants={tradeRowVariant}
                                onHoverStart={() => setHoveredTrade(trade.id)}
                                onHoverEnd={() => setHoveredTrade(null)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '11px 16px', borderBottom: divider,
                                    background: hoveredTrade === trade.id ? 'rgba(255,255,255,0.025)' : 'transparent',
                                    transition: 'background 0.15s ease',
                                    cursor: 'default',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: trade.outcome === 'win' ? 'rgba(166,255,77,0.1)' : trade.outcome === 'loss' ? 'rgba(255,71,87,0.1)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${trade.outcome === 'win' ? 'rgba(166,255,77,0.2)' : trade.outcome === 'loss' ? 'rgba(255,71,87,0.2)' : 'rgba(255,255,255,0.06)'}`,
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
                                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {trade.outcome === 'win' ? 'WIN' : trade.outcome === 'loss' ? 'LOSS' : 'OPEN'}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
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

            <div style={{ height: 12 }} />

            {/* ── 10. QUICK ACTIONS ──────────────────────────────── */}
            <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: divider, marginTop: 'auto' }}>
                <motion.button
                    onClick={() => setActiveTab('terminal')}
                    whileTap={{ scale: 0.97 }}
                    style={{ padding: '18px', background: '#A6FF4D', border: 'none', borderRight: '1px solid #090909', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...mono, fontSize: 12, fontWeight: 800, color: '#000', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                    <Calculator size={14} /> Calculate
                </motion.button>
                <motion.button
                    onClick={() => setActiveTab('analytics')}
                    whileTap={{ scale: 0.97 }}
                    style={{ padding: '18px', background: '#0d1117', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...mono, fontSize: 12, fontWeight: 800, color: '#A6FF4D', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                    Analytics <ArrowRight size={14} />
                </motion.button>
            </motion.div>
        </motion.div>
    );
}
