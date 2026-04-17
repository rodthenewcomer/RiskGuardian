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
import StreakBeads from '@/components/charts/StreakBeads';
import DrawdownCurve from '@/components/charts/DrawdownCurve';
import { ChartCard } from '@/components/charts/RiskGuardianPrimitives';

const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1] as const, duration: 0.45 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

// Daily guard thresholds
const DANGER_THRESHOLD  = 90; // % used — red zone
const WARNING_THRESHOLD = 60; // % used — yellow zone
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
    const { language } = useAppStore();
    const lang = language ?? 'en';
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
    const manualUsed = mounted ? getTodayRiskUsed() : 0;
    const used       = mounted ? Math.max(manualUsed, todayActualLoss) : 0;
    const remaining  = mounted ? Math.max(0, account.dailyLossLimit - used) : account.dailyLossLimit;
    const usedPct   = account.dailyLossLimit > 0 ? Math.min(100, (used / account.dailyLossLimit) * 100) : 0;
    const isDanger  = mounted && usedPct >= DANGER_THRESHOLD;
    const isWarning = mounted && usedPct >= WARNING_THRESHOLD;
    const maxPerTrade  = (account.balance * account.maxRiskPercent) / 100;
    const safeNextRisk = mounted ? Math.min(maxPerTrade, remaining) : maxPerTrade;

    // ── Trade stats ────────────────────────────────────────────
    const closedTrades = useMemo(() =>
        trades
            .filter(t => t.outcome === 'win' || t.outcome === 'loss')
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [trades]);

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

    // ── Streak beads data (last 40 closed/open trades) ────────────
    const streakBeadData = useMemo(() =>
        [...trades]
            .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime())
            .slice(-40)
            .map(t => ({
                result: t.outcome === 'win' ? 'win' as const : t.outcome === 'loss' ? 'loss' as const : 'open' as const,
                pnl: t.pnl ?? 0,
            })),
    [trades]);

    // ── Drawdown curve from equity curve ──────────────────────────
    const drawdownCurveData = useMemo(() => {
        let peak = 0;
        return pnlChartData.map((pt, i) => {
            if (pt.cumulative > peak) peak = pt.cumulative;
            const dd = pt.cumulative - peak;
            return { d: String(i + 1), v: dd };
        });
    }, [pnlChartData]);

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

    // ── Milestone detection ────────────────────────────────────
    const milestone = useMemo(() => {
        if (!mounted || closedTrades.length === 0) return null;
        const n = closedTrades.length;
        const prevN = n - 1;
        if (n === 1) return lang === 'fr' ? '🎯 Premier trade enregistré !' : '🎯 First Trade Logged!';
        if (n === 10 && prevN < 10) return lang === 'fr' ? '🔟 10 trades — bon départ !' : '🔟 10 Trades Milestone!';
        if (n === 50 && prevN < 50) return lang === 'fr' ? '📊 50 trades — pro du journal !' : '📊 50 Trades — Journaling Pro!';
        if (n === 100 && prevN < 100) return lang === 'fr' ? '🏆 100 trades — vétéran !' : '🏆 100 Trades — Veteran!';
        if (streakType === 'W' && streakCount === 5) return lang === 'fr' ? '⚡ Série gagnante de 5 !' : '⚡ 5-Trade Win Streak!';
        if (streakType === 'W' && streakCount === 10) return lang === 'fr' ? '🔥 Série gagnante de 10 !' : '🔥 10-Trade Win Streak!';
        if (n >= 10) {
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
            const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
            const thisWeekPnl = closedTrades
                .filter(t => new Date(t.closedAt ?? t.createdAt) >= oneWeekAgo)
                .reduce((s, t) => s + (t.pnl ?? 0), 0);
            const lastWeekPnl = closedTrades
                .filter(t => {
                    const d = new Date(t.closedAt ?? t.createdAt);
                    return d >= twoWeeksAgo && d < oneWeekAgo;
                })
                .reduce((s, t) => s + (t.pnl ?? 0), 0);
            if (thisWeekPnl > 0 && lastWeekPnl < 0) {
                return lang === 'fr'
                    ? `📈 Cette semaine meilleure que la dernière (+$${thisWeekPnl.toFixed(0)})`
                    : `📈 This week better than last (+$${thisWeekPnl.toFixed(0)})`;
            }
        }
        return null;
    }, [mounted, closedTrades, streakCount, streakType, lang]);

    // ── Session intelligence (forensics) ──────────────────────
    const forensics = useMemo(() => generateForensics(trades, account, lang as 'en' | 'fr'), [trades, account, lang]);
    const bestHour  = forensics.timeStats.bestHour;

    // ── Pre-session behavioral alert (P23) ────────────────────
    const preSessionAlert = useMemo(() => {
        if (trades.length < 5) return null;
        const closed = trades
            .filter(t => (t.outcome === 'win' || t.outcome === 'loss') && typeof t.pnl === 'number')
            .map(t => ({
                ...t,
                durationSeconds: t.durationSeconds ?? (t.closedAt
                    ? Math.floor((new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 1000)
                    : undefined),
            }));
        if (closed.length < 5) return null;
        try {
            const f = generateForensics(closed, account, lang as 'en' | 'fr');
            const top = f.patterns.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))[0];
            if (!top || top.severity === 'INFO') return null;
            return top;
        } catch {
            return null;
        }
    }, [trades, account, lang]);

    // ── Revenge sizing alert ───────────────────────────────────
    const revengeAlert = mounted && trades.length >= 2 &&
        trades[0].outcome === 'loss' &&
        trades[1].riskUSD > 0 &&
        trades[0].riskUSD > trades[1].riskUSD * 1.3;

    // ── Win streak overconfidence (3+ session winning streak) ────────────────
    const winStreakCaution = useMemo(() => {
        if (!mounted || closedTrades.length < 3) return false;
        // Count consecutive wins from the most recent 10 closed trades
        let count = 0;
        for (let i = closedTrades.length - 1; i >= 0; i--) {
            if ((closedTrades[i].pnl ?? 0) > 0) count++;
            else break;
        }
        return count >= 3;
    }, [mounted, closedTrades]);

    // ── Consecutive loss streak (today / most recent closed) ──
    const currentConsecLosses = useMemo(() => {
        if (closedTrades.length === 0) return 0;
        let count = 0;
        for (let i = closedTrades.length - 1; i >= 0; i--) {
            if ((closedTrades[i].pnl ?? 0) < 0) count++;
            else break;
        }
        return count;
    }, [closedTrades]);

    // ── 70% daily limit flag (predictive: size-reduction prompt) ─
    const isAt70Pct = mounted && usedPct >= 70 && usedPct < 90;

    // ── Zero daily-limit guard: warn when no protection is configured ─
    const isApex = account.propFirm?.includes('APE-X') ?? false;
    const hasNoProtection = mounted && account.dailyLossLimit === 0 && account.startingBalance > 0 && !isApex;

    // ── Payout milestone tracking ─────────────────────────────────────
    // Prop-firm profit targets (industry standard)
    const payoutProgress = useMemo(() => {
        if (!account.startingBalance || account.startingBalance === 0) return null;
        const isInstant = account.propFirmType === 'Instant Funding';
        if (isInstant) return null; // no profit target for instant funding
        const isApexAccount = account.propFirm?.includes('APE-X') ?? false;
        // APE-X: 6% eval target. 1-Step/FTMO/FundingPips: 10%. 2-Step Phase 1: 8%.
        const targetPct = isApexAccount ? 6 : account.propFirmType === '2-Step Evaluation' ? 8 : 10;
        const targetAmt = account.startingBalance * (targetPct / 100);
        const gained = Math.max(0, account.balance - account.startingBalance);
        const pct = Math.min(100, (gained / targetAmt) * 100);
        const needed = Math.max(0, targetAmt - gained);
        return { targetAmt, gained, pct, needed, targetPct };
    }, [account]);

    // ── Churn signals ─────────────────────────────────────────────────
    const churnSignals = useMemo(() => {
        if (!mounted || closedTrades.length === 0) return { inactive: false, repeatedDailyLimit: false, majorDrawdown: false };
        const now = Date.now();
        const lastTradeAt = new Date(closedTrades[closedTrades.length - 1].closedAt ?? closedTrades[closedTrades.length - 1].createdAt).getTime();
        const daysSinceLast = (now - lastTradeAt) / (1000 * 3600 * 24);
        // Balance dropped 50%+ from starting
        const majorDrawdown = account.startingBalance > 0 && account.balance < account.startingBalance * 0.5;
        return {
            inactive: daysSinceLast >= 7,
            repeatedDailyLimit: false, // requires per-day session storage — tracked via usedPct being 100% today
            majorDrawdown,
        };
    }, [mounted, closedTrades, account]);

    // ── Open trades alert ─────────────────────────────────────
    const openTrades = useMemo(() => trades.filter(t => t.outcome === 'open'), [trades]);

    // Weekend gap risk: warn if there are open crypto trades on Friday after 5PM or Saturday/Sunday
    const weekendGapAlert = useMemo(() => {
        if (openTrades.length === 0) return false;
        const now = new Date();
        const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = estNow.getDay();
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
    const pnlColor    = totalPnl >= 0 ? '#FDC800' : '#ff4757';
    const wrColor     = winRate >= 55 ? '#FDC800' : winRate >= 45 ? '#EAB308' : '#ff4757';
    const streakColor = streakType === 'W' ? '#FDC800' : '#ff4757';
    const pfColor     = profitFactor >= 1.5 ? '#FDC800' : profitFactor >= 1 ? '#EAB308' : '#ff4757';

    // ── Style constants ────────────────────────────────────────
    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
    const lbl: React.CSSProperties  = { ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block' };
    const divider = '1px solid #1a1c24';
    const card: React.CSSProperties = {
        background: '#0d1117',
        border: '2px solid #1a1c24',
        boxShadow: '4px 4px 0 #000',
        overflow: 'hidden',
    };

    // ── Badge helper ───────────────────────────────────────────
    function StatusBadge({ danger, warning, dangerLabel, warningLabel, safeLabel, pulse }: {
        danger: boolean; warning: boolean;
        dangerLabel: string; warningLabel: string; safeLabel: string;
        pulse?: boolean;
    }) {
        const color  = danger ? '#ff4757' : warning ? '#EAB308' : '#FDC800';
        const border = danger ? 'rgba(255,71,87,0.5)' : warning ? 'rgba(234,179,8,0.4)' : 'rgba(253,200,0,0.3)';
        const bg     = danger ? 'rgba(255,71,87,0.1)' : warning ? 'rgba(234,179,8,0.08)' : 'rgba(253,200,0,0.06)';
        const label  = danger ? dangerLabel : warning ? warningLabel : safeLabel;
        return (
            <motion.span
                animate={(danger || (pulse && warning)) ? { opacity: [1, 0.5, 1] } : {}}
                transition={{ duration: 0.9, repeat: Infinity }}
                style={{ ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', textTransform: 'uppercase', color, border: `1px solid ${border}`, background: bg }}
            >
                {label}
            </motion.span>
        );
    }

    if (!mounted) return null;

    if (!account.startingBalance || account.startingBalance === 0) {
        return (
            <motion.div variants={stagger} initial="hidden" animate="show"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090909', minHeight: '100vh', padding: '20px', textAlign: 'center' }}
            >
                <motion.div variants={fadeUp}>
                    <Shield size={42} style={{ color: '#4b5563', marginBottom: 16 }} />
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', marginBottom: 8 }}>{lang === 'fr' ? 'Compte non configuré' : 'Account Not Setup'}</h2>
                    <p style={{ ...mono, fontSize: 13, color: '#8b949e', marginBottom: 24, maxWidth: 300 }}>
                        {lang === 'fr' ? 'Configurez votre compte dans les Paramètres pour voir le tableau de bord.' : 'Complete setup in Settings to see your live dashboard.'}
                    </p>
                    <button
                        onClick={() => setActiveTab('settings')}
                        style={{ padding: '12px 24px', background: '#FDC800', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                        {lang === 'fr' ? 'Aller aux Paramètres' : 'Go to Settings'}
                    </button>
                </motion.div>
            </motion.div>
        );
    }

    // Suppress unused variable warning for isEval — it may be used in future rule items
    void isEval;

    return (
        <motion.div variants={stagger} initial="hidden" animate="show"
            style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh' }}
        >
            {preSessionAlert && (
                <div style={{
                    background: 'rgba(255,71,87,0.06)',
                    border: '1px solid rgba(255,71,87,0.2)',
                    padding: '12px 16px',
                    marginBottom: 16,
                    fontFamily: 'var(--font-mono)',
                }}>
                    <div style={{ fontSize: 10, color: '#ff4757', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                        {lang === 'fr' ? 'ALERTE PRÉ-SESSION' : 'PRE-SESSION ALERT'}
                    </div>
                    <div style={{ fontSize: 12, color: '#c9d1d9' }}>
                        {preSessionAlert.name}: {preSessionAlert.desc}
                    </div>
                    {preSessionAlert.action && (
                        <div style={{ fontSize: 11, color: '#FDC800', marginTop: 6 }}>
                            {lang === 'fr' ? 'Action' : 'Action'}: {preSessionAlert.action}
                        </div>
                    )}
                </div>
            )}

            {/* ── SECTION 1 — STATUS STRIP ─────────────────────── */}
            <motion.div variants={fadeUp} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 20px', borderBottom: divider, flexWrap: 'wrap', gap: 6,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                        <motion.div
                            animate={{ scale: [1, 2.4, 1], opacity: [0.6, 0, 0.6] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                            style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#FDC800' }}
                        />
                        <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: '#FDC800', boxShadow: '0 0 8px #FDC800' }} />
                    </div>
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>LIVE</span>
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                        {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {account.propFirm && (
                        <span style={{ ...mono, fontSize: 10, color: '#FDC800', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', background: 'rgba(253,200,0,0.06)', border: '1px solid rgba(253,200,0,0.2)' }}>
                            {account.propFirm}
                        </span>
                    )}
                    <span style={{ ...mono, fontSize: 10, padding: '2px 8px', border: divider, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {account.assetType}
                    </span>
                </div>
            </motion.div>

            {/* ── SECTION 2 — HERO BLOCK ───────────────────────── */}
            <motion.div variants={fadeUp} style={{
                padding: isMobile ? '20px 16px' : '28px 24px',
                borderBottom: divider,
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                }}>
                    {/* Left — balance */}
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={lbl}>{lang === 'fr' ? 'Solde du compte' : 'Account Balance'}</span>
                            <span style={{ ...mono, fontSize: 8, padding: '2px 6px', background: 'rgba(253,200,0,0.08)', color: '#FDC800', border: '1px solid rgba(253,200,0,0.2)', letterSpacing: '0.04em' }}>
                                {lang === 'fr' ? 'AUTO-CALCULÉ' : 'AUTO-COMPUTED'}
                            </span>
                        </div>
                        <motion.span
                            key={account.balance}
                            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.5 }}
                            style={{ ...mono, fontSize: isMobile ? 36 : 52, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1, display: 'block' }}
                        >
                            ${animBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </motion.span>
                        {closedTrades.length > 0 && (
                            <motion.span
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ delay: 0.3, duration: 0.4 }}
                                style={{ ...mono, fontSize: 13, color: pnlColor, fontWeight: 700, display: 'block', marginTop: 6 }}
                            >
                                {totalPnl >= 0 ? '+' : '-'}${animPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} net&nbsp;·&nbsp;{closedTrades.length} {lang === 'fr' ? 'clôturés' : 'closed'}
                            </motion.span>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* ── SECTION 3 — KPI GRID (8 cells) ──────────────── */}
            {(() => {
                const kpiItems = [
                    { lbl: 'NET P&L',                                          val: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, clr: pnlColor,                                                           sub: `${wins.length}W · ${losses.length}L` },
                    { lbl: 'WIN RATE',                                          val: `${winRate}%`,                                                                                             clr: wrColor,                                                            sub: `${closedTrades.length} trades` },
                    { lbl: 'PROFIT FACTOR',                                     val: profitFactor > 0 ? profitFactor.toFixed(2) : '—',                                                         clr: pfColor,                                                            sub: '≥1.5 = edge' },
                    { lbl: lang === 'fr' ? 'SÉRIE' : 'STREAK',                 val: closedTrades.length > 0 ? `${streakCount}${streakType}` : '—',                                             clr: streakColor,                                                        sub: streakType === 'W' ? (lang === 'fr' ? 'en feu' : 'on fire') : 'drawdown' },
                    { lbl: lang === 'fr' ? 'UTILISÉ AUJD' : 'DAILY USED',      val: `$${animUsed.toFixed(0)}`,                                                                                 clr: used > 0 ? '#ff4757' : '#4b5563',                                   sub: `${usedPct.toFixed(1)}% of limit` },
                    { lbl: lang === 'fr' ? 'RESTANT' : 'REMAINING',            val: `$${animRemaining.toFixed(0)}`,                                                                            clr: remaining === 0 ? '#ff4757' : '#FDC800',                            sub: lang === 'fr' ? 'aujourd\'hui' : 'today' },
                    { lbl: lang === 'fr' ? 'MARGE DRAWDOWN' : 'DD BUFFER',     val: `$${animBuffer.toFixed(0)}`,                                                                               clr: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#FDC800',    sub: `${drawdownInfo.usedPct.toFixed(1)}% used` },
                    { lbl: lang === 'fr' ? 'RISQUE MAX' : 'MAX NEXT RISK',     val: `$${animSafeNext.toFixed(0)}`,                                                                             clr: '#FDC800',                                                          sub: `${account.maxRiskPercent}% of bal` },
                ];
                return (
                    <motion.div variants={fadeUp} style={{ borderBottom: divider, position: 'relative' }}>
                        {isMobile ? (
                            /* ── Mobile: horizontal scroll strip ── */
                            <>
                                <div style={{
                                    display: 'flex',
                                    overflowX: 'auto',
                                    scrollSnapType: 'x mandatory',
                                    WebkitOverflowScrolling: 'touch',
                                    scrollbarWidth: 'none',
                                    msOverflowStyle: 'none',
                                } as React.CSSProperties}>
                                    {kpiItems.map((s, i) => (
                                        <div key={i} style={{
                                            flexShrink: 0,
                                            minWidth: 128,
                                            padding: '18px 16px',
                                            borderRight: divider,
                                            scrollSnapAlign: 'start',
                                            display: 'flex', flexDirection: 'column', gap: 5,
                                        }}>
                                            <span style={lbl}>{s.lbl}</span>
                                            <span style={{ ...mono, fontSize: 22, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.03em' }}>{s.val}</span>
                                            <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{s.sub}</span>
                                        </div>
                                    ))}
                                </div>
                                {/* Right-edge fade shows there are more cards */}
                                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, background: 'linear-gradient(to left, #090909 0%, transparent 100%)', pointerEvents: 'none' }} />
                            </>
                        ) : (
                            /* ── Desktop: 4-col grid ── */
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
                                {kpiItems.map((s, i) => (
                                    <div key={i} style={{
                                        padding: '16px 20px',
                                        borderRight: i % 4 < 3 ? divider : 'none',
                                        borderBottom: i < 4 ? divider : 'none',
                                        display: 'flex', flexDirection: 'column', gap: 3,
                                    }}>
                                        <span style={lbl}>{s.lbl}</span>
                                        <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em' }}>{s.val}</span>
                                        <span style={{ ...mono, fontSize: 9, color: '#6b7280' }}>{s.sub}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                );
            })()}

            {/* ── EQUITY CURVE — full width below KPI grid ─────── */}
            {pnlChartData.length > 1 && (
                <motion.div variants={fadeUp} style={{ borderBottom: divider, background: '#0d1117' }}>
                    <div style={{ padding: '14px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <span style={{ ...mono, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                                {lang === 'fr' ? 'COURBE D\'ÉQUITÉ' : 'EQUITY CURVE'}
                            </span>
                            <span style={{ ...mono, fontSize: 10, color: pnlColor, fontWeight: 700, marginLeft: 12 }}>
                                {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} {lang === 'fr' ? 'net' : 'net'}
                            </span>
                        </div>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>
                            {closedTrades.length} {lang === 'fr' ? 'trades clôturés' : 'closed trades'}
                        </span>
                    </div>
                    <motion.div
                        initial={{ opacity: 0, scaleX: 0.7 }} animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.8, delay: 0.1 }}
                        style={{ height: isMobile ? 160 : 220, transformOrigin: 'left', padding: '0 0 4px' }}
                    >
                        <PnLChart data={pnlChartData} />
                    </motion.div>
                </motion.div>
            )}

            {/* ── SECTION 4 — ALERT BANNERS ────────────────────── */}
            {milestone && (
                <motion.div
                    initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                    style={{ background: 'rgba(253,200,0,0.06)', borderLeft: '3px solid #FDC800', padding: '10px 16px', ...mono, fontSize: 12, fontWeight: 700, color: '#FDC800', letterSpacing: '0.04em' }}
                >
                    {milestone}
                </motion.div>
            )}

            {revengeAlert && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', background: 'rgba(255,71,87,0.06)', borderLeft: '3px solid #ff4757', borderBottom: divider }}
                >
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                        <AlertTriangle size={13} color="#ff4757" />
                    </motion.div>
                    <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {lang === 'fr' ? 'RISQUE REVANCHE — Dernière perte surdimensionnée. Réduisez la prochaine position.' : 'REVENGE RISK — Last loss was oversized. Reduce next position.'}
                    </span>
                </motion.div>
            )}

            {totalPnl > 0 && consistencyScore > (account.consistencyThresholdPct ?? 20) && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', background: 'rgba(234,179,8,0.06)', borderLeft: '3px solid #EAB308', borderBottom: divider }}
                >
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                        <AlertTriangle size={13} color="#EAB308" />
                    </motion.div>
                    <span style={{ ...mono, fontSize: 11, color: '#EAB308', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {lang === 'fr'
                            ? `ALERTE COHÉRENCE — Meilleur jour (${bestTradingDay}) représente ${consistencyScore.toFixed(1)}% du profit total (Max ${account.consistencyThresholdPct ?? 20}%).`
                            : `CONSISTENCY WARNING — Best day (${bestTradingDay}) is ${consistencyScore.toFixed(1)}% of total profit (Max ${account.consistencyThresholdPct ?? 20}%).`}
                    </span>
                </motion.div>
            )}

            {openTrades.length > 0 && (() => {
                const agedTrades = openTrades.filter(t => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 3600000) >= 4);
                const hasAged = agedTrades.length > 0;
                const alertColor = hasAged ? '#EAB308' : '#38bdf8';
                return (
                    <motion.div variants={fadeUp}
                        onClick={() => setActiveTab('journal')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: hasAged ? 'rgba(234,179,8,0.06)' : 'rgba(56,189,248,0.06)', borderLeft: `3px solid ${alertColor}`, borderBottom: divider, cursor: 'pointer', flexWrap: 'wrap', gap: 8 }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                                <AlertTriangle size={13} color={alertColor} />
                            </motion.div>
                            <span style={{ ...mono, fontSize: 11, color: alertColor, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                {hasAged
                                    ? lang === 'fr'
                                        ? `⚠ ${agedTrades.length} trade${agedTrades.length > 1 ? 's' : ''} ouvert${agedTrades.length > 1 ? 's' : ''} depuis 4h+ — enregistrez votre résultat`
                                        : `⚠ ${agedTrades.length} trade${agedTrades.length > 1 ? 's' : ''} have been open for 4h+ — log your outcome`
                                    : lang === 'fr'
                                        ? `${openTrades.length} TRADE${openTrades.length > 1 ? 'S' : ''} OUVERT${openTrades.length > 1 ? 'S' : ''} — Enregistrez le résultat pour débloquer l'analyse.`
                                        : `${openTrades.length} OPEN TRADE${openTrades.length > 1 ? 'S' : ''} — Log outcome to unlock analysis.`}
                            </span>
                        </div>
                        <ArrowRight size={13} color={alertColor} />
                    </motion.div>
                );
            })()}

            {weekendGapAlert && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', background: 'rgba(234,179,8,0.06)', borderLeft: '3px solid #EAB308', borderBottom: divider }}
                >
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                        <AlertTriangle size={13} color="#EAB308" />
                    </motion.div>
                    <span style={{ ...mono, fontSize: 11, color: '#EAB308', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {lang === 'fr'
                            ? 'RISQUE GAP WEEKEND — Position crypto ouverte ce weekend. Spreads élargis et gaps de liquidité à l\'ouverture dimanche.'
                            : 'WEEKEND GAP RISK — Open crypto position over weekend. Wider spreads and liquidity gaps on Sunday open.'}
                    </span>
                </motion.div>
            )}

            {/* Win-streak overconfidence caution */}
            {winStreakCaution && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(253,200,0,0.06)', borderLeft: '3px solid #FDC800', borderBottom: divider }}
                >
                    <AlertTriangle size={13} color="#FDC800" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                        <span style={{ ...mono, fontSize: 11, color: '#FDC800', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                            {streakCount >= 5
                                ? (lang === 'fr' ? `⚠ ${streakCount} VICTOIRES — Complacency risk. Vérifiez vos 3 dernières entrées.` : `⚠ ${streakCount}-WIN STREAK — Complacency risk. Audit your last 3 entries.`)
                                : (lang === 'fr' ? `⚠ ${streakCount} VICTOIRES CONSÉCUTIVES — Gardez la taille standard. Ne scalez pas encore.` : `⚠ ${streakCount} CONSECUTIVE WINS — Hold standard size. Do not scale up yet.`)}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: '#8b949e', marginTop: 3, display: 'block' }}>
                            {lang === 'fr'
                                ? 'Les traders qui ont gagné scalent trop vite — et perdent toutes leurs gains sur un seul trade.'
                                : 'Winning traders oversize too soon — and give it all back on a single trade.'}
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Predictive tilt warning: 2+ consecutive losses → cooldown prompt */}
            {currentConsecLosses >= 2 && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(255,71,87,0.08)', borderLeft: '3px solid #ff4757', borderBottom: divider }}
                >
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 0.9, repeat: Infinity }}>
                        <Ban size={13} color="#ff4757" />
                    </motion.div>
                    <div style={{ flex: 1 }}>
                        <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                            {currentConsecLosses >= 3
                                ? (lang === 'fr'
                                    ? `⛔ ${currentConsecLosses} PERTES CONSÉCUTIVES — STOP. Pause de 30 min obligatoire avant le prochain trade.`
                                    : `⛔ ${currentConsecLosses} CONSECUTIVE LOSSES — STOP. Mandatory 30-min break before next trade.`)
                                : (lang === 'fr'
                                    ? `⚠ 2 PERTES CONSÉCUTIVES — Réduisez la taille de 50%. Attendez 15 min. Votre edge se dégrade sous le stress.`
                                    : `⚠ 2 CONSECUTIVE LOSSES — Halve your size. Wait 15 min. Your edge degrades under stress.`)}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: '#8b949e', marginTop: 3, display: 'block' }}>
                            {lang === 'fr'
                                ? `Série de pertes actuelle : ${currentConsecLosses}. Un troisième loss = arrêt immédiat de la session.`
                                : `Current loss run: ${currentConsecLosses}. A third loss = immediate session stop.`}
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Predictive size-reduction prompt: 70% of daily limit used */}
            {isAt70Pct && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', borderLeft: '3px solid #F97316', borderBottom: divider }}
                >
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>
                        <AlertTriangle size={13} color="#F97316" />
                    </motion.div>
                    <div style={{ flex: 1 }}>
                        <span style={{ ...mono, fontSize: 11, color: '#F97316', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                            {lang === 'fr'
                                ? `70% DE LA LIMITE JOURNALIÈRE UTILISÉE — Réduisez la taille de 50% sur les trades restants.`
                                : `70% OF DAILY LIMIT USED — Recommend halving size for remaining trades.`}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: '#8b949e', marginTop: 3, display: 'block' }}>
                            {lang === 'fr'
                                ? `Risque restant : $${remaining.toFixed(0)}. Taille réduite recommandée : $${(safeNextRisk * 0.5).toFixed(0)} max par trade.`
                                : `Remaining headroom: $${remaining.toFixed(0)}. Reduced size recommendation: $${(safeNextRisk * 0.5).toFixed(0)} max per trade.`}
                        </span>
                    </div>
                </motion.div>
            )}

            {/* No-protection guard: dailyLossLimit = 0 with a funded account */}
            {hasNoProtection && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(255,71,87,0.06)', borderLeft: '3px solid #ff4757', borderBottom: divider }}
                    onClick={() => setActiveTab('settings')}
                >
                    <AlertTriangle size={13} color="#ff4757" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1, cursor: 'pointer' }}>
                        <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                            {lang === 'fr'
                                ? 'AUCUNE PROTECTION JOURNALIÈRE — Limite de perte journalière non configurée. Aucun garde-fou actif.'
                                : 'NO DAILY PROTECTION — Daily loss limit is $0. No guardrail is active.'}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: '#8b949e', marginTop: 3, display: 'block' }}>
                            {lang === 'fr'
                                ? 'Configurez une limite journalière dans les Paramètres → onglet Risque. Tap pour ouvrir.'
                                : 'Set a daily loss limit in Settings → Risk tab. Tap to open.'}
                        </span>
                    </div>
                    <ChevronRight size={13} color="#ff4757" style={{ flexShrink: 0 }} />
                </motion.div>
            )}

            {/* Payout milestone tracker */}
            {payoutProgress && account.propFirm && (
                <motion.div variants={fadeUp}
                    style={{ padding: '12px 16px', background: '#0d1117', borderBottom: divider }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            {lang === 'fr' ? 'PROGRESSION VERS LE PAYOUT' : 'PAYOUT TARGET PROGRESS'}
                        </span>
                        <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: payoutProgress.pct >= 100 ? '#FDC800' : '#c9d1d9' }}>
                            {payoutProgress.pct >= 100
                                ? (lang === 'fr' ? '✓ OBJECTIF ATTEINT' : '✓ TARGET HIT')
                                : `${payoutProgress.pct.toFixed(0)}% — ${lang === 'fr' ? 'encore' : 'need'} $${payoutProgress.needed.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                        </span>
                    </div>
                    <div style={{ height: 4, background: '#1a1c24' }}>
                        <div style={{ height: '100%', width: `${payoutProgress.pct}%`, background: payoutProgress.pct >= 100 ? '#FDC800' : '#38bdf8', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>{lang === 'fr' ? 'Gains' : 'Gained'}: +${payoutProgress.gained.toFixed(0)}</span>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>{lang === 'fr' ? 'Objectif' : 'Target'}: +${payoutProgress.targetAmt.toFixed(0)} ({payoutProgress.targetPct}%)</span>
                    </div>
                </motion.div>
            )}

            {/* Churn signal: 7-day inactivity */}
            {churnSignals.inactive && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(56,189,248,0.05)', borderLeft: '3px solid #38bdf8', borderBottom: divider }}
                    onClick={() => setActiveTab('journal')}
                >
                    <Clock size={13} color="#38bdf8" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1, cursor: 'pointer' }}>
                        <span style={{ ...mono, fontSize: 11, color: '#38bdf8', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                            {lang === 'fr' ? '7 JOURS SANS TRADE — Votre journal vous attend.' : '7 DAYS WITHOUT A TRADE — Your journal is waiting.'}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: '#8b949e', marginTop: 3, display: 'block' }}>
                            {lang === 'fr' ? 'Enregistrez un trade ou passez en revue vos patterns pour maintenir la continuité.' : 'Log a trade or review your patterns to maintain momentum.'}
                        </span>
                    </div>
                </motion.div>
            )}

            {/* Churn signal: major drawdown (50%+ from start) */}
            {churnSignals.majorDrawdown && (
                <motion.div variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(255,71,87,0.08)', borderLeft: '3px solid #ff4757', borderBottom: divider }}
                >
                    <AlertTriangle size={13} color="#ff4757" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                        <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                            {lang === 'fr' ? 'DRAWDOWN CRITIQUE — Solde en baisse de 50%+ depuis le début.' : 'CRITICAL DRAWDOWN — Balance is 50%+ below starting capital.'}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: '#8b949e', marginTop: 3, display: 'block' }}>
                            {lang === 'fr'
                                ? 'Réduisez la taille à 25% de la normale. Revoyez vos patterns dans Analytics avant de continuer.'
                                : 'Reduce size to 25% of normal. Review your patterns in Analytics before continuing.'}
                        </span>
                    </div>
                </motion.div>
            )}

            {/* ── SECTION 5 — RISK CARDS (2-col desktop) ──────── */}
            <motion.div variants={fadeUp} style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                borderTop: divider,
            }}>
                {/* Card A: Daily Guard */}
                <div style={{
                    ...card,
                    margin: isMobile ? '12px 0 0' : '12px 8px 12px 12px',
                    borderLeft: isMobile ? 'none' : undefined,
                    borderRight: isMobile ? 'none' : undefined,
                }}>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: divider }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Shield size={12} color="#4b5563" />
                            <span style={lbl}>{isApex ? (lang === 'fr' ? 'Garde perte max' : 'Max Loss Guard') : (lang === 'fr' ? 'Garde perte journalière' : 'Daily Loss Guard')}</span>
                            <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                {isApex ? `/ EOD ${account.maxDrawdownLimit ? `$${account.maxDrawdownLimit.toLocaleString()}` : '4%'}` : `/ $${account.dailyLossLimit.toLocaleString()}`}
                            </span>
                        </div>
                        <StatusBadge
                            danger={isApex ? floorDanger : isDanger}
                            warning={isApex ? floorWarning : isWarning}
                            pulse
                            dangerLabel={lang === 'fr' ? 'DANGER' : 'DANGER'}
                            warningLabel={lang === 'fr' ? 'ALERTE' : 'WARNING'}
                            safeLabel={lang === 'fr' ? 'SÉCURISÉ' : 'SAFE'}
                        />
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 4, background: '#0b0e14', position: 'relative' }}>
                        <motion.div
                            animate={{ width: `${Math.min(100, isApex ? drawdownInfo.usedPct : usedPct)}%` }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }}
                            style={{ height: '100%', background: (isApex ? floorDanger : isDanger) ? '#ff4757' : (isApex ? floorWarning : isWarning) ? '#EAB308' : '#FDC800', position: 'absolute', left: 0, top: 0 }}
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '14px 16px' }}>
                        {(isApex ? [
                            { lbl: lang === 'fr' ? 'PLANCHER' : 'FLOOR',     val: `$${animFloor.toFixed(0)}`,                       clr: floorDanger ? '#ff4757' : '#FDC800' },
                            { lbl: lang === 'fr' ? 'TAMPON' : 'BUFFER',      val: `$${animBuffer.toFixed(0)}`,                      clr: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#FDC800' },
                            { lbl: lang === 'fr' ? 'UTILISÉ' : 'DD USED',    val: `${drawdownInfo.usedPct.toFixed(1)}%`,            clr: floorDanger ? '#ff4757' : '#8b949e' },
                        ] : [
                            { lbl: lang === 'fr' ? 'UTILISÉ' : 'USED',       val: `$${animUsed.toFixed(0)}`,                        clr: used > 0 ? '#ff4757' : '#4b5563' },
                            { lbl: lang === 'fr' ? 'RESTANT' : 'REMAINING',  val: `$${animRemaining.toFixed(0)}`,                   clr: remaining === 0 ? '#ff4757' : '#FDC800' },
                            { lbl: lang === 'fr' ? 'RISQUE MAX' : 'SAFE NEXT', val: `$${animSafeNext.toFixed(0)}`,                  clr: '#FDC800' },
                        ]).map((s, i) => (
                            <motion.div key={i}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.12 + i * 0.07 }}
                                style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 12 : 0, paddingLeft: i > 0 ? 12 : 0 }}
                            >
                                <span style={lbl}>{s.lbl}</span>
                                <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em', display: 'block', marginTop: 4 }}>{s.val}</span>
                            </motion.div>
                        ))}
                    </div>
                    {isDanger && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            style={{ padding: '10px 16px', background: 'rgba(255,71,87,0.08)', borderTop: '1px solid rgba(255,71,87,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                            <AlertTriangle size={12} color="#ff4757" />
                            <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                {lang === 'fr' ? 'STOP — Limite journalière presque atteinte' : 'STOP — Daily limit almost reached'}
                            </span>
                        </motion.div>
                    )}
                </div>

                {/* Card B: Drawdown Floor */}
                {account.startingBalance > 0 && (
                    <div style={{
                        ...card,
                        margin: isMobile ? '8px 0 12px' : '12px 12px 12px 8px',
                        borderLeft: isMobile ? 'none' : undefined,
                        borderRight: isMobile ? 'none' : undefined,
                    }}>
                        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: divider }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Shield size={12} color="#4b5563" />
                                <span style={lbl}>{lang === 'fr' ? 'Plancher drawdown max' : 'Max Drawdown Floor'}</span>
                                <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                    / {account.drawdownType === 'Static' ? 'Static' : account.drawdownType === 'EOD' ? 'EOD' : 'EOT'}
                                    {drawdownInfo.isLocked ? ' · LOCKED' : ''}
                                </span>
                            </div>
                            <StatusBadge
                                danger={floorDanger} warning={floorWarning} pulse
                                dangerLabel={lang === 'fr' ? 'DANGER' : 'DANGER'}
                                warningLabel={lang === 'fr' ? 'ALERTE' : 'WARNING'}
                                safeLabel={lang === 'fr' ? 'SÉCURISÉ' : 'SAFE'}
                            />
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: 4, background: '#0b0e14', position: 'relative' }}>
                            <motion.div
                                animate={{ width: `${Math.min(100, drawdownInfo.usedPct)}%` }}
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }}
                                style={{ height: '100%', background: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#FDC800', position: 'absolute', left: 0, top: 0 }}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '14px 16px' }}>
                            {[
                                { lbl: lang === 'fr' ? 'PLANCHER' : 'FLOOR',  val: `$${animFloor.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,  clr: '#e2e8f0' },
                                { lbl: lang === 'fr' ? 'MARGE' : 'BUFFER',    val: `$${animBuffer.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, clr: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#FDC800' },
                                { lbl: lang === 'fr' ? 'UTILISÉ' : 'USED',    val: `${drawdownInfo.usedPct.toFixed(1)}%`,                                   clr: floorDanger ? '#ff4757' : floorWarning ? '#EAB308' : '#FDC800' },
                            ].map((s, i) => (
                                <motion.div key={i}
                                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.12 + i * 0.07 }}
                                    style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 12 : 0, paddingLeft: i > 0 ? 12 : 0 }}
                                >
                                    <span style={lbl}>{s.lbl}</span>
                                    <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.clr, lineHeight: 1, letterSpacing: '-0.02em', display: 'block', marginTop: 4 }}>{s.val}</span>
                                </motion.div>
                            ))}
                        </div>
                        <div style={{ padding: '10px 16px', borderTop: divider, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                {account.drawdownType === 'Static'
                                    ? `Fixed floor: $${account.startingBalance.toLocaleString()} − ${account.maxDrawdownLimit ? `$${account.maxDrawdownLimit.toLocaleString()}` : '6%'}`
                                    : account.drawdownType === 'EOD'
                                        ? (lang === 'fr' ? 'Remonte à 17h00 EST · se bloque au solde initial' : 'Trails up at 17:00 EST · locks at starting balance')
                                        : (lang === 'fr' ? 'Remonte après chaque trade · se bloque au solde initial' : 'Trails up after each closed trade · locks at starting balance')}
                            </span>
                            {account.payoutLockActive && (
                                <span style={{ ...mono, fontSize: 9, fontWeight: 800, color: '#EAB308', padding: '2px 8px', border: '1px solid rgba(234,179,8,0.3)', textTransform: 'uppercase' }}>
                                    {lang === 'fr' ? 'Paiement verrouillé' : 'Payout Locked'}
                                </span>
                            )}
                        </div>
                        {floorDanger && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                style={{ padding: '10px 16px', background: 'rgba(255,71,87,0.08)', borderTop: '1px solid rgba(255,71,87,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                <AlertTriangle size={12} color="#ff4757" />
                                <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                    {lang === 'fr' ? 'CRITIQUE — Plancher du compte dangereusement proche' : 'CRITICAL — Account floor dangerously close'}
                                </span>
                            </motion.div>
                        )}
                    </div>
                )}
            </motion.div>

            {/* ── SECTION 6 — STREAK BEADS ─────────────────────── */}
            {trades.length > 0 && (
                <motion.div variants={fadeUp} style={{ padding: '16px 20px', borderTop: divider }}>
                    <span style={{ ...lbl, marginBottom: 10, display: 'block' }}>
                        {lang === 'fr' ? 'SÉRIE DE TRADES' : 'TRADE STREAK'}
                    </span>
                    <StreakBeads data={streakBeadData} height={44} maxBeads={40} />
                </motion.div>
            )}

            {/* ── SECTION 7 — DRAWDOWN CURVE ───────────────────── */}
            {drawdownCurveData.length > 2 && (
                <motion.div variants={fadeUp} style={{ background: '#0d1117', borderTop: divider }}>
                    <ChartCard
                        title={lang === 'fr' ? 'COURBE DE DRAWDOWN' : 'DRAWDOWN CURVE'}
                        subtitle={lang === 'fr' ? 'Profondeur de drawdown depuis le pic' : 'Depth from peak equity'}
                    >
                        <DrawdownCurve
                            data={drawdownCurveData}
                            limitLine={account.dailyLossLimit > 0 ? -account.dailyLossLimit : undefined}
                            height={160}
                        />
                    </ChartCard>
                </motion.div>
            )}

            {/* ── SECTION 8 — CONSISTENCY CARD ─────────────────── */}
            {isInstantFunded && totalPnl > 0 && (
                <motion.div variants={fadeUp} style={{ ...card, margin: isMobile ? '0' : '0 12px 0', borderLeft: isMobile ? 'none' : undefined, borderRight: isMobile ? 'none' : undefined }}>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: divider }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={12} color="#4b5563" />
                            <span style={lbl}>{lang === 'fr' ? 'Règle de cohérence' : 'Consistency Rule'}</span>
                            <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>/ best day ≤ 20%</span>
                        </div>
                        <motion.span
                            animate={!consistencyPassing ? { opacity: [1, 0.5, 1] } : {}}
                            transition={{ duration: 1.1, repeat: Infinity }}
                            style={{
                                ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 8px', textTransform: 'uppercase',
                                color: consistencyPassing ? '#FDC800' : '#ff4757',
                                border: `1px solid ${consistencyPassing ? 'rgba(253,200,0,0.5)' : 'rgba(255,71,87,0.5)'}`,
                                background: consistencyPassing ? 'rgba(253,200,0,0.06)' : 'rgba(255,71,87,0.1)',
                            }}
                        >
                            {consistencyPassing ? (lang === 'fr' ? 'VALIDÉ' : 'PASSING') : (lang === 'fr' ? 'ÉCHOUÉ' : 'FAILING')}
                        </motion.span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '14px 16px' }}>
                        {[
                            { lbl: lang === 'fr' ? 'Meilleur jour %' : 'Best Day %',  val: `${animBestDayPct.toFixed(1)}%`, clr: consistencyPassing ? '#FDC800' : '#ff4757' },
                            { lbl: lang === 'fr' ? 'Meilleur jour $' : 'Best Day $',  val: `$${animBestDayAmt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, clr: '#e2e8f0' },
                            { lbl: lang === 'fr' ? 'Profit total' : 'Total Profit',   val: `$${animTotalProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, clr: '#FDC800' },
                        ].map((s, i) => (
                            <motion.div key={i}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4, delay: 0.1 + i * 0.07 }}
                                style={{ borderRight: i < 2 ? divider : 'none', paddingRight: i < 2 ? 12 : 0, paddingLeft: i > 0 ? 12 : 0 }}
                            >
                                <span style={lbl}>{s.lbl}</span>
                                <span style={{ ...mono, fontSize: 20, fontWeight: 800, color: s.clr, lineHeight: 1.2, display: 'block', marginTop: 4, letterSpacing: '-0.02em' }}>{s.val}</span>
                            </motion.div>
                        ))}
                    </div>
                    {(() => {
                        const target = bestDayPnl / 0.20;
                        const stillNeeded = Math.max(0, target - totalPnl);
                        const buffer = totalPnl - target;
                        return (
                            <div style={{
                                padding: '12px 16px',
                                background: consistencyPassing ? 'rgba(253,200,0,0.04)' : 'rgba(255,71,87,0.04)',
                                borderTop: `1px solid ${consistencyPassing ? 'rgba(253,200,0,0.12)' : 'rgba(255,71,87,0.15)'}`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                            }}>
                                <div>
                                    <span style={{ ...mono, fontSize: 10, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                                        {consistencyPassing ? (lang === 'fr' ? 'Marge au-dessus de la limite' : 'Buffer above limit') : (lang === 'fr' ? 'Objectif de profit total' : 'Target total profit')}
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
                                    style={{ ...mono, fontSize: 18, fontWeight: 900, color: consistencyPassing ? '#FDC800' : '#EAB308', letterSpacing: '-0.03em', flexShrink: 0 }}
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

            {/* ── SECTION 9 — SESSION INTELLIGENCE ────────────── */}
            {closedTrades.length >= 5 && (
                <motion.div variants={fadeUp} style={{ ...card, margin: isMobile ? '12px 0 0' : '12px 12px 0', borderLeft: isMobile ? 'none' : undefined, borderRight: isMobile ? 'none' : undefined }}>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: divider }}>
                        <Zap size={11} color="#4b5563" />
                        <span style={lbl}>{lang === 'fr' ? 'Intelligence de session' : 'Session Intelligence'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)' }}>
                        {[
                            { icon: <Clock size={14} color="#FDC800" />,          lbl: lang === 'fr' ? 'Meilleure heure' : 'Peak Hour',   val: `${bestHour}:00`,             sub: lang === 'fr' ? 'meilleure fenêtre P&L' : 'highest P&L window' },
                            { icon: <TrendingUp size={14} color={streakColor} />, lbl: lang === 'fr' ? 'Série' : 'Streak',                val: closedTrades.length > 0 ? `${streakCount}${streakType}` : '—', sub: streakType === 'W' ? 'momentum' : (lang === 'fr' ? 'réinitialiser' : 'reset now') },
                            { icon: <Shield size={14} color="#FDC800" />,         lbl: lang === 'fr' ? 'Risque max suivant' : 'Max Next Risk', val: `$${safeNextRisk.toFixed(0)}`, sub: `${account.maxRiskPercent}% of bal` },
                        ].map((item, i) => (
                            <motion.div key={i}
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

            {/* ── SECTION 10 — RULE COMPLIANCE ─────────────────── */}
            {account.propFirm && (
                <motion.div variants={fadeUp} style={{ ...card, margin: isMobile ? '12px 0 0' : '12px 12px 0', borderLeft: isMobile ? 'none' : undefined, borderRight: isMobile ? 'none' : undefined }}>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: divider }}>
                        <Shield size={11} color="#4b5563" />
                        <span style={lbl}>{lang === 'fr' ? 'Conformité règles' : 'Rule Compliance'}</span>
                        <span style={{
                            marginLeft: 'auto', ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                            padding: '2px 8px', textTransform: 'uppercase',
                            color: (isDanger || floorDanger) ? '#ff4757' : '#FDC800',
                            border: `1px solid ${(isDanger || floorDanger) ? 'rgba(255,71,87,0.3)' : 'rgba(253,200,0,0.3)'}`,
                            background: (isDanger || floorDanger) ? 'rgba(255,71,87,0.06)' : 'rgba(253,200,0,0.04)',
                        }}>
                            {(isDanger || floorDanger) ? (lang === 'fr' ? 'À RISQUE' : 'AT RISK') : (lang === 'fr' ? 'CONFORME' : 'COMPLIANT')}
                        </span>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {([
                            isApex
                              ? { dot: 'green', text: lang === 'fr' ? 'Pas de limite journalière — règle APE-X (EOD Balance uniquement)' : 'No daily drawdown — APE-X rule (EOD Balance only)' }
                              : { dot: isDanger ? 'red' : isWarning ? 'yellow' : 'green',
                                  text: lang === 'fr' ? `Limite journalière : $${account.dailyLossLimit.toLocaleString()} (3% du compte) — ${usedPct.toFixed(1)}% utilisé aujourd'hui` : `Daily loss limit: $${account.dailyLossLimit.toLocaleString()} (3% of account) — ${usedPct.toFixed(1)}% used today` },
                            account.startingBalance > 0 ? {
                              dot: floorDanger ? 'red' : floorWarning ? 'yellow' : 'green',
                              text: isTradeify
                                ? account.drawdownType === 'Static'
                                    ? (lang === 'fr' ? `Drawdown max : 6% statique — plancher fixé à $${(account.startingBalance - (account.maxDrawdownLimit ?? account.startingBalance * 0.06)).toLocaleString()}` : `Max drawdown: 6% static — floor locked at $${(account.startingBalance - (account.maxDrawdownLimit ?? account.startingBalance * 0.06)).toLocaleString()}`)
                                    : account.drawdownType === 'EOD'
                                        ? (lang === 'fr' ? `Drawdown max : 6% EOD trailing — snapshot à 17h00 EST · plancher $${drawdownInfo.floor.toLocaleString()}` : `Max drawdown: 6% EOD trailing — snapshots at 17:00 EST · floor $${drawdownInfo.floor.toLocaleString()}`)
                                        : (lang === 'fr' ? `Drawdown max : 6% EOT trailing — suit chaque trade fermé · plancher $${drawdownInfo.floor.toLocaleString()}` : `Max drawdown: 6% EOT trailing — trails after each closed trade · floor $${drawdownInfo.floor.toLocaleString()}`)
                                : `Max drawdown: $${(account.maxDrawdownLimit ?? 0).toLocaleString()}`,
                            } : null,
                            isApex ? { dot: 'green', text: lang === 'fr' ? 'Levier : 5:1 sur tous les actifs' : 'Leverage: 5:1 on all assets' }
                              : isTradeify ? {
                              dot: 'green',
                              text: isInstantFunded
                                ? (lang === 'fr' ? 'Levier : 2:1 sur toutes les paires (BTC & ETH inclus)' : 'Leverage: 2:1 on all pairs (including BTC & ETH)')
                                : (lang === 'fr' ? 'Levier : 5:1 BTC/ETH · 2:1 toutes autres paires crypto' : 'Leverage: 5:1 BTC/ETH · 2:1 all other crypto pairs'),
                            } : { dot: 'green', text: lang === 'fr' ? `Levier : ${account.leverage || 2}:1` : `Leverage: ${account.leverage || 2}:1` },
                            isApex ? { dot: floorDanger ? 'red' : floorWarning ? 'yellow' : 'green', text: lang === 'fr' ? `Objectif eval : 6% — progression $${Math.max(0, account.balance - account.startingBalance).toFixed(0)} / $${((account.startingBalance || 0) * 0.06).toFixed(0)}` : `Eval target: 6% — progress $${Math.max(0, account.balance - account.startingBalance).toFixed(0)} / $${((account.startingBalance || 0) * 0.06).toFixed(0)}` } : null,
                            isApex ? { dot: 'green', text: lang === 'fr' ? 'Partage des gains : 80% trader · 20% APE-X (sur demande)' : 'Profit split: 80% trader · 20% APE-X (on demand payout)' } : null,
                            isApex && account.isConsistencyActive ? {
                              dot: consistencyScore <= (account.consistencyThresholdPct ?? 40) ? 'green' : 'yellow',
                              text: lang === 'fr' ? `Cohérence (funded) : ${consistencyScore.toFixed(1)}% — doit être ≤ ${account.consistencyThresholdPct ?? 40}% pour paiement` : `Consistency (funded): ${consistencyScore.toFixed(1)}% — must be ≤ ${account.consistencyThresholdPct ?? 40}% to request payout`,
                            } : null,
                            !isApex && isTradeify ? { icon: 'clock', text: lang === 'fr' ? 'Durée min : 20 secondes par trade (règle anti-microscalping)' : 'Min hold time: 20 seconds per trade (microscalping rule)' } : null,
                            !isApex && isInstantFunded ? {
                              dot: consistencyPassing ? 'green' : 'yellow',
                              text: lang === 'fr' ? `Score cohérence : ${consistencyScore.toFixed(1)}% — doit être ≤ 20% pour demander un paiement` : `Consistency score: ${consistencyScore.toFixed(1)}% — must be ≤ 20% to request payout`,
                            } : null,
                            !isApex && isInstantFunded ? {
                              dot: account.payoutLockActive ? 'yellow' : 'green',
                              text: account.payoutLockActive
                                ? (lang === 'fr' ? 'Verrou paiement : ACTIF — plancher définitivement verrouillé au solde initial' : 'Payout lock: ACTIVE — floor permanently locked at starting balance')
                                : (lang === 'fr' ? "Verrou paiement : non déclenché — s'active à la première demande" : 'Payout lock: not triggered — activate on first payout request'),
                            } : null,
                            !isApex && isTradeify ? { icon: 'ban', text: lang === 'fr' ? 'Pas de hedging — positions compensatoires interdites (détection auto)' : 'No hedging — offsetting positions not allowed (auto-detected)' } : null,
                            !isApex && isTradeify ? { icon: 'cal', text: lang === 'fr' ? 'Inactivité : trader au moins une fois tous les 30 jours' : 'Inactivity: must trade at least once every 30 days' } : null,
                            !isApex && !isTradeify ? { dot: 'green', text: `Max trade risk: $${maxPerTrade.toFixed(0)} (${account.maxRiskPercent}%)` } : null,
                        ] as any[]).filter(Boolean).map((rule: any, i: number) => (
                            <motion.div key={i}
                                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35, delay: 0.04 + i * 0.05 }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                {rule.icon === 'ban'   ? <Ban size={11} color="#ff4757" />
                                    : rule.icon === 'cal'   ? <CalendarDays size={11} color="#EAB308" />
                                    : rule.icon === 'clock' ? <Clock size={11} color="#EAB308" />
                                    : <div style={{
                                        width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                                        background: rule.dot === 'green' ? '#FDC800' : rule.dot === 'yellow' ? '#EAB308' : '#ff4757',
                                        boxShadow: `0 0 5px ${rule.dot === 'green' ? '#FDC80040' : rule.dot === 'yellow' ? '#EAB30840' : '#ff475740'}`,
                                    }} />}
                                <span style={{ ...mono, fontSize: 11, color: '#8b949e' }}>{rule.text}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── SECTION 11 — RECENT TRADES ───────────────────── */}
            <motion.div variants={fadeUp} style={{ ...card, margin: isMobile ? '12px 0 0' : '12px 12px 0', borderLeft: isMobile ? 'none' : undefined, borderRight: isMobile ? 'none' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: divider }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {totalPnl >= 0 ? <TrendingUp size={11} color="#FDC800" /> : <TrendingDown size={11} color="#ff4757" />}
                        <span style={lbl}>{lang === 'fr' ? 'TRADES RÉCENTS' : 'RECENT TRADES'}</span>
                    </div>
                    <button onClick={() => setActiveTab('journal')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, ...mono, fontSize: 10, color: '#FDC800', letterSpacing: '0.06em', textTransform: 'uppercase', padding: 0 }}>
                        {lang === 'fr' ? 'VOIR TOUT' : 'VIEW ALL'} <ChevronRight size={11} />
                    </button>
                </div>

                {trades.length === 0 ? (
                    <div style={{ padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
                        <Shield size={32} style={{ color: '#4b5563', marginBottom: 4 }} />
                        <span style={{ ...mono, fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>{lang === 'fr' ? 'Aucun trade pour l\'instant' : 'No trades yet'}</span>
                        <span style={{ ...mono, fontSize: 12, color: '#6b7280', maxWidth: 260, lineHeight: 1.6 }}>
                            {lang === 'fr' ? 'Ouvrez le Moteur de Risque, calculez votre taille et enregistrez votre premier trade.' : 'Open the Risk Engine, calculate your size, and log your first trade.'}
                        </span>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button onClick={() => setActiveTab('terminal')}
                                style={{ padding: '10px 20px', background: '#FDC800', color: '#000', border: 'none', cursor: 'pointer', ...mono, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Calculator size={12} /> {lang === 'fr' ? 'Calculer' : 'Calculate'}
                            </button>
                            <button onClick={() => setActiveTab('analytics')}
                                style={{ padding: '10px 20px', background: 'transparent', color: '#FDC800', border: '1px solid rgba(253,200,0,0.3)', cursor: 'pointer', ...mono, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {lang === 'fr' ? 'Analytiques' : 'Analytics'} <ArrowRight size={12} />
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <motion.div variants={tradeListStagger} initial="hidden" animate="show">
                            {recentTrades.map((trade) => (
                                <motion.div key={trade.id} variants={tradeRowVariant}
                                    onHoverStart={() => setHoveredTrade(trade.id)}
                                    onHoverEnd={() => setHoveredTrade(null)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 16px', borderBottom: divider,
                                        background: hoveredTrade === trade.id ? 'rgba(255,255,255,0.025)' : 'transparent',
                                        transition: 'background 0.15s ease', cursor: 'default',
                                    }}
                                >
                                    {/* Asset + direction */}
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>{trade.asset}</span>
                                        <span style={{ ...mono, fontSize: 9, padding: '2px 6px', border: divider, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {trade.isShort ? (lang === 'fr' ? 'COURT' : 'SHORT') : 'LONG'}
                                        </span>
                                        {/* Outcome badge */}
                                        <span style={{
                                            ...mono, fontSize: 9, fontWeight: 800, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.04em',
                                            color: trade.outcome === 'win' ? '#FDC800' : trade.outcome === 'loss' ? '#ff4757' : '#6b7280',
                                            background: trade.outcome === 'win' ? 'rgba(253,200,0,0.1)' : trade.outcome === 'loss' ? 'rgba(255,71,87,0.1)' : 'transparent',
                                            border: `1px solid ${trade.outcome === 'win' ? 'rgba(253,200,0,0.3)' : trade.outcome === 'loss' ? 'rgba(255,71,87,0.3)' : 'rgba(107,114,128,0.3)'}`,
                                        }}>
                                            {trade.outcome === 'win' ? 'WIN' : trade.outcome === 'loss' ? 'LOSS' : 'OPEN'}
                                        </span>
                                    </div>
                                    {/* P&L + date */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <span style={{ ...mono, fontSize: 14, fontWeight: 800, display: 'block', letterSpacing: '-0.01em', color: trade.outcome === 'win' ? '#FDC800' : trade.outcome === 'loss' ? '#ff4757' : '#6b7280' }}>
                                            {trade.outcome === 'win' ? '+' : trade.outcome === 'loss' ? '-' : ''}
                                            ${Math.abs(trade.pnl ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>
                                            {new Date(trade.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                        {trades.length > 6 && (
                            <button onClick={() => setActiveTab('journal')}
                                style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', borderTop: divider, cursor: 'pointer', ...mono, fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
                                {lang === 'fr' ? `Voir les ${trades.length} trades →` : `View all ${trades.length} trades →`}
                            </button>
                        )}
                    </>
                )}
            </motion.div>

            {/* ── QUICK ACTIONS ─────────────────────────────────── */}
            <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: divider, marginTop: 12 }}>
                <motion.button
                    onClick={() => setActiveTab('terminal')}
                    whileTap={{ scale: 0.97 }}
                    style={{ padding: '18px', background: '#FDC800', border: 'none', borderRight: '1px solid #090909', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...mono, fontSize: 12, fontWeight: 800, color: '#000', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                    <Calculator size={14} /> {lang === 'fr' ? 'Calculer' : 'Calculate'}
                </motion.button>
                <motion.button
                    onClick={() => setActiveTab('analytics')}
                    whileTap={{ scale: 0.97 }}
                    style={{ padding: '18px', background: '#0d1117', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...mono, fontSize: 12, fontWeight: 800, color: '#FDC800', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                    {lang === 'fr' ? 'Analytiques' : 'Analytics'} <ArrowRight size={14} />
                </motion.button>
            </motion.div>

            <div style={{ height: isMobile ? 80 : 12 }} />
        </motion.div>
    );
}
