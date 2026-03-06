'use client';

/**
 * AIChatPage — Use Case 8: Smart Risk AI Assistant
 * ─────────────────────────────────────────────────
 * Natural language interface for all risk questions.
 * Zero latency. Pure algorithmic intelligence.
 * "If I enter BTC at 65,200 and risk $900 how many contracts?"
 * "Where should my stop be for $800 risk on 800 SOL?"
 * "What TP do I need to reach $53,468?"
 */

import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, RotateCcw, Zap, ShieldCheck, Target } from 'lucide-react';
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
// Natural Language AI Processor
// Parses trader questions and routes to the right AI function
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

    // ── Extract keywords ──
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

    // ── STATUS CHECK ──
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

    // ── COACHING REPORT ──
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

    // ── BEHAVIORAL ANALYSIS ──
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

    // ── TP OPTIMIZER ──
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

    // ── POSITION SIZE: entry + stop + risk ──
    if (hasEntry && hasStop && hasRisk && entry > 0 && second > 0) {
        const riskAmt = third || maxRisk;
        const result = calcSmartPositionSize({ entry, stopLoss: second, riskUSD: riskAmt, assetType: 'crypto', symbol: asset });
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
                { label: 'Guardian Warning', value: guardian.tradeWarning || '✅ Clear to trade', danger: !!guardian.tradeWarning },
            ]
        };
    }

    // ── STOP LOSS from size + risk ──
    if (hasSize && hasRisk && entry > 0 && second > 0 && !hasStop) {
        const size = second;
        const riskAmt = third || maxRisk;
        const move = size > 0 ? riskAmt / size : 0;
        const sl = entry - move; // assume long
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

    // ── BALANCE TARGET TP ──
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

    // ── SIMPLE: HOW MANY CONTRACTS ──
    if (hasSize && entry > 0) {
        const riskAmt = second || maxRisk;
        const stopPct = 0.01; // assume 1% stop
        const sl = entry * (1 - stopPct);
        const result = calcSmartPositionSize({ entry, stopLoss: sl, riskUSD: riskAmt, assetType: 'crypto', symbol: asset });
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

    // ── FALLBACK ──
    return {
        content: `I understand you're asking about risk. Try asking me:
• "How many lots for BTC at 65200 with $900 risk and stop at 64900?"
• "Where's my stop for $800 risk on 800 SOL at 91.65?"
• "What TP do I need to reach $53,468 with 800 SOL at 91.65?"
• "What's my status?" — to see your account health
• "Coach me" — for your daily coaching report`,
        cards: []
    };
}

// ─────────────────────────────────────────────────────────────────
// Suggestion Pills
// ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
    'What\'s my status?',
    'Coach me on today\'s session',
    'Am I showing revenge trading?',
    'Check if I\'m safe to trade',
    'What\'s my best TP probability?',
];

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

export default function AIChatPage() {
    const { account, trades, getDailyRiskRemaining } = useAppStore();
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: `I'm your AI Risk Copilot. Ask me anything about your trades — position sizing, stop loss, take profit, consistency, or account health.\n\nTry: "How many lots for SOL at 91.65 with stop at 90.48 and $800 risk?"`,
            cards: [],
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    const balance = account.balance;
    const maxRisk = (balance * account.maxRiskPercent) / 100;
    const dailyLimit = account.dailyLossLimit;
    const todayUsed = dailyLimit - getDailyRiskRemaining();

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = (text?: string) => {
        const q = (text || input).trim();
        if (!q) return;

        const userMsg: ChatMessage = {
            id: crypto.randomUUID?.() || String(Date.now()),
            role: 'user', content: q, cards: [], timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        // Simulate slight processing delay for feel
        setTimeout(() => {
            const result = processNaturalLanguage(q, balance, maxRisk, todayUsed, dailyLimit, trades, account);
            const aiMsg: ChatMessage = {
                id: crypto.randomUUID?.() || String(Date.now() + 1),
                role: 'assistant', content: result.content, cards: result.cards, timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
            setLoading(false);
        }, 280);
    };

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerIcon}><Brain size={20} /></div>
                <div className="flex-1">
                    <h1 className="text-subheading">AI Risk Copilot</h1>
                    <p className="text-caption">Natural language · Real-time intelligence</p>
                </div>
                <button className={styles.clearBtn} onClick={() => setMessages(m => [m[0]])} title="Clear chat">
                    <RotateCcw size={14} />
                </button>
            </div>

            {/* Account Pulse Bar */}
            <div className={styles.pulseBar}>
                {[
                    { icon: <ShieldCheck size={10} />, label: 'Remaining', value: `$${(dailyLimit - todayUsed).toFixed(0)}` },
                    { icon: <Target size={10} />, label: 'Safe Risk', value: `$${maxRisk.toFixed(0)}` },
                    { icon: <Zap size={10} />, label: 'Balance', value: `$${balance.toLocaleString()}` },
                ].map(s => (
                    <div key={s.label} className={styles.pulsePill}>
                        {s.icon}
                        <span className={styles.pillLabel}>{s.label}</span>
                        <span className={styles.pillValue}>{s.value}</span>
                    </div>
                ))}
            </div>

            {/* Messages */}
            <div className={styles.messages}>
                <AnimatePresence initial={false}>
                    {messages.map(msg => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className={`${styles.bubble} ${msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI}`}
                        >
                            {msg.role === 'assistant' && (
                                <div className={styles.aiAvatar}><Brain size={12} /></div>
                            )}
                            <div className={styles.bubbleContent}>
                                <p className={styles.bubbleText}>{msg.content}</p>
                                {msg.cards && msg.cards.length > 0 && (
                                    <div className={styles.cards}>
                                        {msg.cards.map((card, i) => (
                                            <div key={i} className={`${styles.card} ${card.highlight ? styles.cardHighlight : ''} ${card.danger ? styles.cardDanger : ''}`}>
                                                <span className={styles.cardLabel}>{card.label}</span>
                                                <span className={styles.cardValue}>{card.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <span className={styles.timestamp}>
                                    {msg.timestamp.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} EST
                                </span>
                            </div>
                        </motion.div>
                    ))}

                    {loading && (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${styles.bubble} ${styles.bubbleAI}`}>
                            <div className={styles.aiAvatar}><Brain size={12} /></div>
                            <div className={styles.bubbleContent}>
                                <div className={styles.typingDots}>
                                    <span /><span /><span />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={endRef} />
            </div>

            {/* Suggestions */}
            <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                    <button key={s} className={styles.suggestionPill} onClick={() => handleSend(s)}>
                        {s}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div className={styles.inputArea}>
                <input
                    className={styles.input}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="How many lots for SOL at 91.65 with stop 90.48 risk $800?"
                    autoComplete="off"
                />
                <button
                    className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}
