'use client';

/**
 * AIChatPage — AI Risk Coach
 * Terminal aesthetic · 2026 redesign · Mobile-first
 */

import { useState, useRef, useEffect } from 'react';
import { useAppStore, getTradingDay } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, RotateCcw, ShieldCheck, Zap, Activity } from 'lucide-react';
import {
    calcSmartPositionSize, calcProfitTarget, analyzeRiskGuardian,
    analyzeBehavior, optimizeTakeProfit, generateDailyReport
} from '@/ai/RiskAI';
import styles from './AIChatPage.module.css';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    cards?: ChatCard[];
    timestamp: Date;
}

interface ChatCard {
    label: string;
    value: string;
    highlight?: boolean;
    danger?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Asset type detector
// ─────────────────────────────────────────────────────────────────
const FUTURES_SYMBOLS = new Set(['ES', 'MES', 'NQ', 'MNQ', 'RTY', 'M2K', 'YM', 'MYM', 'CL', 'QM', 'GC', 'MGC', 'SI', 'ZB']);
const CRYPTO_SYMBOLS = new Set(['BTC', 'ETH', 'SOL', 'PEPE', 'WIF', 'BONK', 'PNUT', 'DOGE', 'SUI', 'AVAX', 'APT', 'LINK', 'UNI', 'ADA', 'XRP', 'DOT', 'NEAR', 'FET', 'LTC', 'BCH', 'RENDER', 'TAO', 'TIA', 'SEI', 'INJ', 'JUP', 'PYTH', 'OP', 'ARB', 'STRK']);
const FOREX_PREFIXES = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'USD'];

function detectAssetType(symbol: string): 'crypto' | 'forex' | 'futures' | 'stocks' {
    const s = symbol.toUpperCase();
    if (FUTURES_SYMBOLS.has(s)) return 'futures';
    if (CRYPTO_SYMBOLS.has(s)) return 'crypto';
    if (s.length === 6 && FOREX_PREFIXES.some(p => s.startsWith(p) || s.endsWith(p))) return 'forex';
    return 'crypto';
}

// ─────────────────────────────────────────────────────────────────
// Natural Language AI Processor
// ─────────────────────────────────────────────────────────────────
function processNaturalLanguage(
    input: string,
    balance: number,
    maxRisk: number,
    todayUsed: number,
    dailyLimit: number,
    trades: Parameters<typeof analyzeBehavior>[0],
    account: Parameters<typeof analyzeRiskGuardian>[0]
): { content: string; cards: ChatCard[] } {
    const lower = input.toLowerCase().trim();
    const nums = (input.match(/[\d,]+\.?\d*/g) || []).map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n) && n > 0);

    const hasEntry = /entry|enter|entered|@|at\s+\d/.test(lower);
    const hasStop = /stop|sl|stoploss/.test(lower);
    const hasRisk = /risk|risking|\$\d+/.test(lower);
    const hasSize = /lot|contract|unit|size|position/.test(lower);
    const hasTP = /take profit|tp|target/.test(lower);
    const hasBalance = /balance|account|reach|goal/.test(lower);
    const hasStatus = /status|guardian|safe|how am i|check/.test(lower);
    const hasCoach = /coach|report|today|session|how did/.test(lower);
    const hasBehavior = /revenge|emotional|behavior|overtrading|feeling/.test(lower);
    const hasTpOpt = /best tp|optimal tp|probability|what tp/.test(lower);

    const asset = input.match(/\b(BTC|ETH|SOL|XRP|GOLD|NQ|ES|MNQ|AAPL|EUR|GBP)\b/i)?.[0]?.toUpperCase() || 'ASSET';
    const entry = nums[0] || 0;
    const second = nums[1] || 0;
    const third = nums[2] || 0;

    // STATUS CHECK
    if (hasStatus || (!hasEntry && !hasRisk && !hasTP && nums.length === 0)) {
        const guardian = analyzeRiskGuardian(account, todayUsed);
        const beh = analyzeBehavior(trades, maxRisk);
        return {
            content: `Here's your live account status:`,
            cards: [
                { label: 'Daily Remaining', value: `$${guardian.remainingDaily.toFixed(0)}`, highlight: true },
                { label: 'Safe Risk/Trade', value: `$${guardian.safeRisk.toFixed(0)}`, highlight: true },
                { label: 'Trades Left Today', value: `${guardian.maxTradesLeft}` },
                { label: 'Survival Status', value: guardian.survivalStatus.toUpperCase(), danger: guardian.survivalStatus !== 'safe' },
                { label: 'Emotional State', value: beh.emotionalState.toUpperCase(), danger: beh.emotionalState === 'revenge' || beh.emotionalState === 'stressed' },
                { label: 'Guardian says', value: guardian.recommendation },
            ]
        };
    }

    // COACHING REPORT
    if (hasCoach) {
        const report = generateDailyReport(trades, account, todayUsed);
        return {
            content: `Here's your AI coaching report for today:`,
            cards: [
                { label: 'Trades Today', value: `${report.trades}` },
                { label: 'Net Profit', value: `${report.netProfit >= 0 ? '+' : ''}$${report.netProfit.toFixed(0)}`, highlight: report.netProfit > 0, danger: report.netProfit < 0 },
                { label: 'Discipline Grade', value: report.disciplineGrade, highlight: true },
                { label: 'Revenge Trades', value: `${report.revengeTradesDetected}`, danger: report.revengeTradesDetected > 0 },
                { label: 'Strength', value: report.strengths[0] || 'Keep logging' },
                { label: 'Tomorrow Focus', value: report.tomorrowFocus },
            ]
        };
    }

    // BEHAVIORAL ANALYSIS
    if (hasBehavior) {
        const beh = analyzeBehavior(trades, maxRisk);
        return {
            content: `Behavioral analysis:`,
            cards: [
                { label: 'Emotional State', value: beh.emotionalState.toUpperCase(), danger: beh.emotionalState !== 'disciplined' },
                { label: 'Consecutive Losses', value: `${beh.consecutiveLosses}`, danger: beh.consecutiveLosses >= 2 },
                { label: 'Revenge Risk', value: beh.revengeRisk ? `YES (+${beh.revengePct.toFixed(0)}%)` : 'None detected', danger: beh.revengeRisk },
                { label: 'Trades Today', value: `${beh.tradesThisSession}`, danger: beh.overtradingAlert },
                { label: 'Recommendation', value: beh.recommendation },
            ]
        };
    }

    // TP OPTIMIZER
    if (hasTpOpt && entry > 0 && second > 0) {
        const wins = trades.filter(t => t.outcome === 'win').length;
        const total = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').length;
        const wr = total > 0 ? wins / total : 0.5;
        const result = optimizeTakeProfit({ entry, stopLoss: second, riskUSD: third || maxRisk, historicalWinRate: wr });
        const best = result.tiers.find(t => t.tp === result.recommendedTP);
        return {
            content: `TP Optimizer for ${asset} @ ${entry} (SL: ${second}):`,
            cards: [
                { label: 'Recommended TP', value: result.recommendedTP.toFixed(4), highlight: true },
                { label: 'Recommended R:R', value: `${result.recommendedRR}R`, highlight: true },
                { label: 'Hit Probability', value: `~${best?.estimatedProbability || 50}%` },
                { label: 'Expected Value', value: `$${best?.expectedValue.toFixed(0) || 0}/trade` },
                { label: 'Reasoning', value: result.reasoning },
            ]
        };
    }

    // POSITION SIZE: entry + stop + risk
    if (hasEntry && hasStop && hasRisk && entry > 0 && second > 0) {
        const riskAmt = third || maxRisk;
        const result = calcSmartPositionSize({ entry, stopLoss: second, riskUSD: riskAmt, assetType: detectAssetType(asset), symbol: asset });
        const guardian = analyzeRiskGuardian(account, todayUsed, riskAmt);
        return {
            content: `Position sizing for ${asset} — Entry: ${entry}, SL: ${second}, Risk: $${riskAmt}:`,
            cards: [
                { label: 'Position Size', value: `${result.size.toLocaleString()} ${result.unit}`, highlight: true },
                { label: 'Risk Amount', value: `$${result.riskUSD.toFixed(0)}` },
                { label: 'Stop Distance', value: `${result.stopDistance.toFixed(4)} (${result.stopPct.toFixed(2)}%)` },
                { label: 'TP 2R', value: result.tp2R.toFixed(4), highlight: true },
                { label: 'TP 3R', value: result.tp3R.toFixed(4) },
                { label: 'Notional', value: `$${result.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                { label: 'Commission (0.04%)', value: `$${result.comm.toFixed(2)}` },
                { label: 'Guardian Warning', value: guardian.tradeWarning || 'Clear to trade', danger: !!guardian.tradeWarning },
            ]
        };
    }

    // STOP LOSS from size + risk
    if (hasSize && hasRisk && entry > 0 && second > 0 && !hasStop) {
        const size = second;
        const riskAmt = third || maxRisk;
        const move = size > 0 ? riskAmt / size : 0;
        const sl = entry - move;
        const tp2r = entry + move * 2;
        return {
            content: `Stop Loss for ${asset} — Entry: ${entry}, Size: ${size}, Risk: $${riskAmt}:`,
            cards: [
                { label: 'Stop Loss Price', value: sl.toFixed(4), danger: true },
                { label: 'Stop Distance', value: move.toFixed(4) },
                { label: 'Max Risk', value: `$${riskAmt.toFixed(0)}` },
                { label: 'TP (2R)', value: tp2r.toFixed(4), highlight: true },
                { label: 'Risk %', value: `${((move / entry) * 100).toFixed(2)}%` },
            ]
        };
    }

    // BALANCE TARGET TP
    if (hasBalance && hasTP && entry > 0 && second > 0) {
        const targetBal = nums.find(n => n > balance * 0.9 && n > balance) || second;
        const size = nums.find(n => n < entry * 100 && n !== entry && n !== targetBal) || 1;
        const sl = second < entry ? second : entry - (entry * 0.01);
        const result = calcProfitTarget({ entry, stopLoss: sl, size, targetBalance: targetBal, currentBalance: balance });
        return {
            content: `To reach $${targetBal.toLocaleString()} with ${size} ${asset}:`,
            cards: [
                { label: 'Required Take Profit', value: result.requiredTP.toFixed(4), highlight: true },
                { label: 'Profit Needed', value: `$${result.expectedProfit.toFixed(0)}`, highlight: true },
                { label: 'R:R Ratio', value: `${result.rr.toFixed(2)}R` },
                { label: 'Position Value', value: `$${result.positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
            ]
        };
    }

    // SIMPLE: HOW MANY CONTRACTS
    if (hasSize && entry > 0) {
        const riskAmt = second || maxRisk;
        const stopPct = 0.01;
        const sl = entry * (1 - stopPct);
        const result = calcSmartPositionSize({ entry, stopLoss: sl, riskUSD: riskAmt, assetType: detectAssetType(asset), symbol: asset });
        return {
            content: `Estimated position for ${asset} @ ${entry} with $${riskAmt} risk (1% stop assumed):`,
            cards: [
                { label: 'Recommended Size', value: `${result.size.toLocaleString()} ${result.unit}`, highlight: true },
                { label: 'Risk', value: `$${result.riskUSD.toFixed(0)}` },
                { label: 'Stop Loss (1%)', value: sl.toFixed(4), danger: true },
                { label: 'TP 2R', value: result.tp2R.toFixed(4), highlight: true },
            ]
        };
    }

    // FALLBACK
    return {
        content: `I understand you're asking about risk. Try:\n· "Size NQ at 21450 stop 21400 risk $500"\n· "Where's my stop for $800 risk on 2 ES at 5820?"\n· "What's my status?" — live account health\n· "Coach me on today's session"`,
        cards: []
    };
}

// ─────────────────────────────────────────────────────────────────
// Suggestion chips — icon + text
// ─────────────────────────────────────────────────────────────────
const SUGGESTIONS = [
    { icon: '🛡', text: "What's my status?" },
    { icon: '📊', text: "Coach me on today's session" },
    { icon: '🧠', text: "Am I showing revenge trading?" },
    { icon: '✅', text: "Check if I'm safe to trade" },
    { icon: '🎯', text: "What's my best TP probability?" },
    { icon: '📐', text: "Size NQ at 21450 stop 21400 risk $500" },
];

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────
export default function AIChatPage() {
    const { account, trades, getDailyRiskRemaining } = useAppStore();

    const [messages, setMessages] = useState<ChatMessage[]>([{
        id: 'welcome',
        role: 'assistant',
        content: `I'm your AI Risk Coach. Ask me anything about your trades — position sizing, stop loss, take profit, consistency, or account health.\n\nTry: "Size NQ at 21450 stop 21400 risk $500"`,
        cards: [],
        timestamp: new Date(),
    }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const balance = account.balance;
    const maxRisk = (balance * account.maxRiskPercent) / 100;
    const dailyLimit = account.dailyLossLimit;
    const todayUsed = dailyLimit - getDailyRiskRemaining();
    const dailyLeft = Math.max(0, dailyLimit - todayUsed);
    const dailyLeftPct = dailyLimit > 0 ? dailyLeft / dailyLimit : 1;
    const dailyColor = dailyLeftPct > 0.5 ? '#A6FF4D' : dailyLeftPct > 0.25 ? '#EAB308' : '#ff4757';

    const todayStr = getTradingDay(new Date().toISOString());
    const todayTrades = trades.filter(t => getTradingDay(t.closedAt ?? t.createdAt) === todayStr);
    const todayPnl = todayTrades.filter(t => t.outcome !== 'open').reduce((s, t) => s + (t.pnl ?? 0), 0);

    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
    const divider = '1px solid #1a1c24';
    const lbl: React.CSSProperties = { ...mono, fontSize: 8, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const };

    const handleSend = (text?: string) => {
        const q = (text || input).trim();
        if (!q) return;
        const userMsg: ChatMessage = {
            id: crypto.randomUUID?.() || String(Date.now()),
            role: 'user', content: q, cards: [], timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setTimeout(() => {
            const result = processNaturalLanguage(q, balance, maxRisk, todayUsed, dailyLimit, trades, account);
            const aiMsg: ChatMessage = {
                id: crypto.randomUUID?.() || String(Date.now() + 1),
                role: 'assistant', content: result.content, cards: result.cards, timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMsg]);
            setLoading(false);
        }, 280);
    };

    return (
        <div className={styles.page} style={{ display: 'flex', flexDirection: 'column', background: '#090909' }}>

            {/* ── HEADER ──────────────────────────────────────── */}
            <div style={{
                padding: isMobile ? '10px 14px' : '13px 20px',
                borderBottom: divider,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Brain icon + pulse dot */}
                    <div style={{ position: 'relative', width: 30, height: 30, background: 'rgba(166,255,77,0.07)', border: '1px solid rgba(166,255,77,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Brain size={15} color="#A6FF4D" />
                        <span className={styles.pulseDot} />
                    </div>
                    <div>
                        <span style={{ ...mono, fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', display: 'block', lineHeight: 1 }}>AI COACH</span>
                        <span style={{ ...lbl, display: 'block', marginTop: 3 }}>Natural language · Real-time intelligence</span>
                    </div>
                </div>
                <button
                    onClick={() => setMessages(m => [m[0]])}
                    style={{ background: 'none', border: '1px solid #1a1c24', padding: '6px 10px', cursor: 'pointer', color: '#4b5563', display: 'flex', alignItems: 'center', gap: 5 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#e2e8f0'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1c24'; e.currentTarget.style.color = '#4b5563'; }}
                    title="Reset chat"
                >
                    <RotateCcw size={11} />
                    <span style={{ ...mono, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>RESET</span>
                </button>
            </div>

            {/* ── CONTEXT STRIP — 4 live KPIs ─────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
                borderBottom: divider,
                flexShrink: 0,
            }}>
                {([
                    {
                        icon: <ShieldCheck size={9} color={dailyColor} />,
                        lbl: 'Daily Left',
                        val: `$${dailyLeft.toFixed(0)}`,
                        clr: dailyColor,
                        sub: `${Math.round(dailyLeftPct * 100)}% of limit`,
                    },
                    {
                        icon: <Zap size={9} color="#4b5563" />,
                        lbl: 'Safe Risk',
                        val: `$${maxRisk.toFixed(0)}`,
                        clr: '#e2e8f0',
                        sub: `${account.maxRiskPercent}% per trade`,
                    },
                    {
                        icon: <Activity size={9} color="#4b5563" />,
                        lbl: 'Balance',
                        val: balance >= 1000 ? `$${(balance / 1000).toFixed(1)}K` : `$${balance.toFixed(0)}`,
                        clr: '#e2e8f0',
                        sub: 'account equity',
                    },
                    {
                        icon: null,
                        lbl: 'Today',
                        val: todayTrades.length.toString(),
                        clr: todayPnl >= 0 ? '#A6FF4D' : '#ff4757',
                        sub: todayTrades.length > 0 ? `${todayPnl >= 0 ? '+' : ''}$${todayPnl.toFixed(0)} P&L` : 'no trades yet',
                    },
                ] as const).map((s, i) => (
                    <div key={i} style={{
                        padding: isMobile ? '10px 12px' : '11px 16px',
                        borderRight: isMobile ? (i % 2 === 0 ? divider : 'none') : (i < 3 ? divider : 'none'),
                        borderBottom: isMobile && i < 2 ? divider : 'none',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            {s.icon}
                            <span style={lbl}>{s.lbl}</span>
                        </div>
                        <span style={{ ...mono, fontSize: isMobile ? 15 : 17, fontWeight: 800, color: s.clr, display: 'block', lineHeight: 1, letterSpacing: '-0.02em' }}>{s.val}</span>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>{s.sub}</span>
                    </div>
                ))}
            </div>

            {/* ── MESSAGES ────────────────────────────────────── */}
            <div className={styles.messages} style={{ flex: 1, minHeight: 0 }}>
                <AnimatePresence initial={false}>
                    {messages.map(msg => {
                        const isUser = msg.role === 'user';
                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.16 }}
                                style={{
                                    display: 'flex',
                                    flexDirection: isUser ? 'row-reverse' : 'row',
                                    padding: isMobile ? '10px 14px' : '12px 20px',
                                    gap: 10,
                                    borderBottom: divider,
                                    alignItems: 'flex-start',
                                }}
                            >
                                {/* AI avatar */}
                                {!isUser && (
                                    <div style={{
                                        width: 22, height: 22, flexShrink: 0, marginTop: 2,
                                        background: 'rgba(166,255,77,0.07)', border: '1px solid rgba(166,255,77,0.18)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Brain size={11} color="#A6FF4D" />
                                    </div>
                                )}

                                {/* Content block */}
                                <div style={{
                                    display: 'flex', flexDirection: 'column', gap: 5,
                                    maxWidth: isUser ? (isMobile ? '85%' : '72%') : '100%',
                                    flex: isUser ? 'unset' : 1,
                                }}>
                                    {/* Role label */}
                                    <span style={{ ...lbl, display: 'block', textAlign: isUser ? 'right' : 'left' }}>
                                        {isUser ? 'You' : 'AI Coach'}
                                    </span>

                                    {/* Message bubble */}
                                    <div style={{
                                        padding: isMobile ? '10px 12px' : '11px 14px',
                                        background: isUser ? 'rgba(166,255,77,0.04)' : '#0d1117',
                                        borderTop: `1px solid ${isUser ? 'rgba(166,255,77,0.12)' : '#1a1c24'}`,
                                        borderRight: `1px solid ${isUser ? 'rgba(166,255,77,0.12)' : '#1a1c24'}`,
                                        borderBottom: `1px solid ${isUser ? 'rgba(166,255,77,0.12)' : '#1a1c24'}`,
                                        borderLeft: `2px solid ${isUser ? '#A6FF4D' : '#1f2937'}`,
                                    }}>
                                        <p style={{ ...mono, fontSize: 12, color: isUser ? '#d1fae5' : '#8b949e', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>
                                            {msg.content}
                                        </p>
                                    </div>

                                    {/* Response cards */}
                                    {msg.cards && msg.cards.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {msg.cards.map((card, ci) => (
                                                <div key={ci} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 12px', gap: 12,
                                                    background: card.highlight ? 'rgba(166,255,77,0.04)' : card.danger ? 'rgba(255,71,87,0.04)' : '#0a0a0a',
                                                    border: `1px solid ${card.highlight ? 'rgba(166,255,77,0.14)' : card.danger ? 'rgba(255,71,87,0.18)' : '#1a1c24'}`,
                                                    borderLeft: `3px solid ${card.highlight ? '#A6FF4D' : card.danger ? '#ff4757' : '#1f2937'}`,
                                                }}>
                                                    <span style={{ ...lbl, flex: 1, letterSpacing: '0.07em' }}>{card.label}</span>
                                                    <span style={{
                                                        ...mono, fontSize: 13, fontWeight: 700,
                                                        color: card.highlight ? '#A6FF4D' : card.danger ? '#ff4757' : '#e2e8f0',
                                                        textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all',
                                                    }}>{card.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Timestamp */}
                                    <span style={{ ...mono, fontSize: 8, color: '#2d3748', textAlign: isUser ? 'right' : 'left', display: 'block' }}>
                                        {msg.timestamp.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} EST
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}

                    {/* Typing indicator */}
                    {loading && (
                        <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                padding: isMobile ? '10px 14px' : '12px 20px',
                                display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: divider,
                            }}
                        >
                            <div style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2, background: 'rgba(166,255,77,0.07)', border: '1px solid rgba(166,255,77,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Brain size={11} color="#A6FF4D" />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={{ ...lbl, display: 'block' }}>AI Coach</span>
                                <div style={{ padding: '11px 14px', background: '#0d1117', border: '1px solid #1a1c24', borderLeft: '2px solid #1f2937' }}>
                                    <div className={styles.typingDots}><span /><span /><span /></div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={endRef} />
            </div>

            {/* ── SUGGESTIONS ─────────────────────────────────── */}
            <div className={styles.suggestions} style={{
                borderTop: divider, padding: isMobile ? '7px 14px' : '8px 20px',
                display: 'flex', gap: 6, flexShrink: 0, background: '#0a0a0a',
            }}>
                {SUGGESTIONS.map((s) => (
                    <button
                        key={s.text}
                        onClick={() => handleSend(s.text)}
                        style={{
                            ...mono, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 12px', background: 'transparent', border: '1px solid #1a1c24',
                            cursor: 'pointer', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(166,255,77,0.3)'; e.currentTarget.style.color = '#A6FF4D'; e.currentTarget.style.background = 'rgba(166,255,77,0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1c24'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                    >
                        <span style={{ fontSize: 11 }}>{s.icon}</span>
                        {s.text}
                    </button>
                ))}
            </div>

            {/* ── INPUT BAR ───────────────────────────────────── */}
            <div style={{
                borderTop: `1px solid ${input.trim() ? 'rgba(166,255,77,0.2)' : '#1a1c24'}`,
                display: 'flex', alignItems: 'center',
                padding: isMobile ? '10px 14px' : '12px 20px',
                gap: 12, flexShrink: 0,
                background: '#090909',
                transition: 'border-color 0.2s',
            }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={isMobile ? 'Ask about sizing, stops, TP...' : 'How many lots for SOL at 91.65 with stop 90.48 risk $800?'}
                    autoComplete="off"
                    style={{
                        ...mono, flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        fontSize: 12, color: '#e2e8f0', lineHeight: 1.5,
                    }}
                />
                <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                    style={{
                        width: 34, height: 34, flexShrink: 0,
                        background: input.trim() ? '#A6FF4D' : '#0d1117',
                        border: `1px solid ${input.trim() ? '#A6FF4D' : '#1a1c24'}`,
                        cursor: input.trim() ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                        boxShadow: input.trim() ? '0 0 14px rgba(166,255,77,0.22)' : 'none',
                    }}
                >
                    <Send size={14} color={input.trim() ? '#000' : '#2d3748'} />
                </button>
            </div>
        </div>
    );
}
