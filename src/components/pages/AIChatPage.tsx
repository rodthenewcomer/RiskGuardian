'use client';

/**
 * AIChatPage — AI Risk Coach
 * Terminal aesthetic · 2026 redesign · Mobile-first
 * NLP v2: full instrument spec, stop-distance sizing, short detection,
 *          dollar-risk from position, payout check, strategy analysis
 */

import { useState, useRef, useEffect } from 'react';
import { useAppStore, getTradingDay } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, RotateCcw, ShieldCheck, Zap, Activity, Mic, MicOff } from 'lucide-react';
import {
    analyzeRiskGuardian, analyzeBehavior,
    ChatCard, processNaturalLanguage
} from '@/ai/RiskAI';
import styles from './AIChatPage.module.css';
import { useTranslation } from '@/i18n/useTranslation';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    cards?: ChatCard[];
    timestamp: Date;
}


// ─────────────────────────────────────────────────────────────────
// Suggestion chips
// ─────────────────────────────────────────────────────────────────
const SUGGESTIONS = [
    { icon: '🛡', text: "What's my status?" },
    { icon: '📐', text: "NQ at 21450, 30 point stop, $500 risk" },
    { icon: '📊', text: "Coach me on today's session" },
    { icon: '🧠', text: "Am I showing revenge trading?" },
    { icon: '📋', text: "Am I consistent enough for payout?" },
    { icon: '🎯', text: "NQ spec and point value" },
    { icon: '💡', text: "What should I trade?" },
    { icon: '💰', text: "2 NQ contracts, stop 20 points — my risk?" },
];

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────
export default function AIChatPage() {
    const { account, trades, getDailyRiskRemaining } = useAppStore();
    const { t } = useTranslation();
    const { language } = useAppStore();
    const lang = language ?? 'en';

    const [messages, setMessages] = useState<ChatMessage[]>([{
        id: 'welcome',
        role: 'assistant',
        content: `I'm your AI Risk Coach. I understand natural language for any trading question:\n\n· Position sizing with point/tick/pip stops\n· Dollar risk from your actual position\n· Instrument specs (point value, tick size)\n· Payout eligibility, behavioral analysis, strategy edge\n\nTry: "NQ at 21450, 30 point stop, $500 risk"`,
        cards: [],
        timestamp: new Date(),
    }]);
    const [input, setInput]       = useState('');
    const [loading, setLoading]   = useState(false);
    
    const endRef = useRef<HTMLDivElement>(null);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    const startVoiceInput = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) { alert('Voice input not supported in this browser.'); return; }
        if (recognitionRef.current) recognitionRef.current.abort();
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = false;
        recognitionRef.current = recognition;
        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (e: any) => {
            const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
            setInput(transcript);
        };
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognition.start();
    };

    const stopVoiceInput = () => {
        recognitionRef.current?.stop();
        setIsListening(false);
    };

    

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const balance    = account.balance;
    const maxRisk    = (balance * account.maxRiskPercent) / 100;
    const dailyLimit = account.dailyLossLimit;
    const todayUsed  = dailyLimit - getDailyRiskRemaining();
    const dailyLeft  = Math.max(0, dailyLimit - todayUsed);
    const dailyLeftPct = dailyLimit > 0 ? dailyLeft / dailyLimit : 1;
    const dailyColor = dailyLeftPct > 0.5 ? '#FDC800' : dailyLeftPct > 0.25 ? '#EAB308' : '#ff4757';

    const todayStr    = getTradingDay(new Date().toISOString());
    const todayTrades = trades.filter(t => getTradingDay(t.closedAt ?? t.createdAt) === todayStr);
    const todayPnl    = todayTrades.filter(t => t.outcome !== 'open').reduce((s, t) => s + (t.pnl ?? 0), 0);

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

        // Daily limit enforcement — block sizing queries when limit is blown
        const sizingKeywords = /\b(stop|risk|contract|lot|position|entry|NQ|ES|MNQ|MES|CL|MCL|RTY|NKD|GC|SI|ZB|ZN|size|how many|how much|point|tick|pip)\b/i;
        const dailyBlown = dailyLeft <= 0 && dailyLimit > 0;
        if (dailyBlown && sizingKeywords.test(q)) {
            const aiMsg: ChatMessage = {
                id: crypto.randomUUID?.() || String(Date.now() + 1),
                role: 'assistant',
                content: lang === 'fr'
                    ? `⛔ LIMITE JOURNALIÈRE ATTEINTE — Aucun nouveau trade aujourd'hui.\n\nVous avez utilisé $${todayUsed.toFixed(0)} de votre limite journalière de $${dailyLimit.toFixed(0)}. Aucun calcul de taille de position ou d'entrée ne sera fourni jusqu'à la prochaine session.\n\nVotre seule action maintenant : clôturez toutes les positions ouvertes et arrêtez de trader pour aujourd'hui. Cette limite existe pour protéger votre compte contre une perte catastrophique.\n\nJe peux encore répondre aux questions sur votre historique de trading, vos comportements ou vos règles — mais je ne calculerai pas la taille d'un trade que vous ne devriez pas prendre.`
                    : `⛔ DAILY LOSS LIMIT REACHED — No new trade sizing allowed.\n\nYou have used $${todayUsed.toFixed(0)} of your $${dailyLimit.toFixed(0)} daily limit. No position sizing or entry calculations will be provided until tomorrow's session.\n\nYour only action now: close any open positions and stop trading for today. This limit exists to protect your account from catastrophic loss.\n\nI can still answer questions about your trading history, behavioral patterns, or rules — but I will not calculate size for a trade you should not be taking.`,
                cards: [],
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMsg]);
            setLoading(false);
            return;
        }

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
        <div className={`${styles.page} ${styles.header}`} style={{ display: 'flex', flexDirection: 'column', background: '#090909' }}>

            {/* ── HEADER ──────────────────────────────────────── */}
            <div style={{
                borderBottom: divider,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative', width: 30, height: 30, background: 'rgba(253,200,0,0.07)', border: '1px solid rgba(253,200,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Brain size={15} color="#FDC800" />
                        <span className={styles.pulseDot} />
                    </div>
                    <div>
                        <span style={{ ...mono, fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.04em', display: 'block', lineHeight: 1 }}>{lang === 'fr' ? 'COACH IA' : 'ALGORITHMIC RISK COPILOT'}</span>
                        <span style={{ ...lbl, display: 'block', marginTop: 3 }}>{lang === 'fr' ? 'Langage naturel · Intelligence temps réel' : 'Natural language · Real-time intelligence'}</span>
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
                    <span style={{ ...mono, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{lang === 'fr' ? 'EFFACER' : 'RESET'}</span>
                </button>
            </div>

            {/* ── CONTEXT STRIP ───────────────────────────────── */}
            <div className={styles.contextStrip} style={{ borderBottom: divider, flexShrink: 0 }}>
                {([
                    { icon: <ShieldCheck size={9} color={dailyColor} />, lbl: lang === 'fr' ? 'Reste jour' : 'Daily Left',  val: `$${dailyLeft.toFixed(0)}`,  clr: dailyColor,   sub: `${Math.round(dailyLeftPct * 100)}% ${lang === 'fr' ? 'de la limite' : 'of limit'}` },
                    { icon: <Zap size={9} color="#4b5563" />,            lbl: lang === 'fr' ? 'Risque sûr' : 'Safe Risk',   val: `$${maxRisk.toFixed(0)}`,    clr: '#e2e8f0',    sub: `${account.maxRiskPercent}% ${lang === 'fr' ? 'par trade' : 'per trade'}` },
                    { icon: <Activity size={9} color="#4b5563" />,       lbl: lang === 'fr' ? 'Solde' : 'Balance',     val: balance >= 1000 ? `$${(balance / 1000).toFixed(1)}K` : `$${balance.toFixed(0)}`, clr: '#e2e8f0', sub: lang === 'fr' ? 'équité du compte' : 'account equity' },
                    { icon: null,                                         lbl: lang === 'fr' ? 'Aujourd\'hui' : 'Today',       val: todayTrades.length.toString(), clr: todayPnl >= 0 ? '#FDC800' : '#ff4757', sub: todayTrades.length > 0 ? `${todayPnl >= 0 ? '+' : ''}$${todayPnl.toFixed(0)} P&L` : (lang === 'fr' ? 'aucun trade' : 'no trades yet') },
                ] as const).map((s, i) => (
                    <div key={i} className={styles.contextCard}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            {s.icon}
                            <span style={lbl}>{s.lbl}</span>
                        </div>
                        <span className={styles.contextCardValue} style={{ ...mono, fontWeight: 800, color: s.clr, display: 'block', lineHeight: 1, letterSpacing: '-0.02em' }}>{s.val}</span>
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
                                className={styles.messageRow}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.16 }}
                                style={{
                                    display: 'flex',
                                    flexDirection: isUser ? 'row-reverse' : 'row',
                                    gap: 10, borderBottom: divider, alignItems: 'flex-start',
                                }}
                            >
                                {!isUser && (
                                    <div style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2, background: 'rgba(253,200,0,0.07)', border: '1px solid rgba(253,200,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Brain size={11} color="#FDC800" />
                                    </div>
                                )}
                                <div className={isUser ? styles.messageContentUser : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: isUser ? 'unset' : 1 }}>
                                    <span style={{ ...lbl, display: 'block', textAlign: isUser ? 'right' : 'left' }}>
                                        {isUser ? (lang === 'fr' ? 'Vous' : 'You') : (lang === 'fr' ? 'Coach IA' : 'AI Coach')}
                                    </span>
                                    <div className={styles.messageBubble} style={{
                                        background: isUser ? 'rgba(253,200,0,0.04)' : '#0d1117',
                                        borderTop: `1px solid ${isUser ? 'rgba(253,200,0,0.12)' : '#1a1c24'}`,
                                        borderRight: `1px solid ${isUser ? 'rgba(253,200,0,0.12)' : '#1a1c24'}`,
                                        borderBottom: `1px solid ${isUser ? 'rgba(253,200,0,0.12)' : '#1a1c24'}`,
                                        borderLeft: `2px solid ${isUser ? '#FDC800' : '#1f2937'}`,
                                    }}>
                                        <p style={{ ...mono, fontSize: 12, color: isUser ? '#d1fae5' : '#8b949e', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>
                                            {msg.content}
                                        </p>
                                    </div>
                                    {msg.cards && msg.cards.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {msg.cards.map((card, ci) => (
                                                <div key={ci} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 12px', gap: 12,
                                                    background: card.highlight ? 'rgba(253,200,0,0.04)' : card.danger ? 'rgba(255,71,87,0.04)' : '#0a0a0a',
                                                    border: `1px solid ${card.highlight ? 'rgba(253,200,0,0.14)' : card.danger ? 'rgba(255,71,87,0.18)' : '#1a1c24'}`,
                                                    borderLeft: `3px solid ${card.highlight ? '#FDC800' : card.danger ? '#ff4757' : '#1f2937'}`,
                                                }}>
                                                    <span style={{ ...lbl, flex: 1, letterSpacing: '0.07em' }}>{card.label}</span>
                                                    <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: card.highlight ? '#FDC800' : card.danger ? '#ff4757' : '#e2e8f0', textAlign: 'right', maxWidth: '65%', wordBreak: 'break-all' }}>{card.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <span style={{ ...mono, fontSize: 8, color: '#2d3748', textAlign: isUser ? 'right' : 'left', display: 'block' }}>
                                        {msg.timestamp.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} EST
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}
                    {loading && (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className={styles.messageRow}
                            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: divider }}>
                            <div style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2, background: 'rgba(253,200,0,0.07)', border: '1px solid rgba(253,200,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Brain size={11} color="#FDC800" />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={{ ...lbl, display: 'block' }}>{lang === 'fr' ? 'Coach IA' : 'AI Coach'}</span>
                                <div className={styles.messageBubble} style={{ background: '#0d1117', border: '1px solid #1a1c24', borderLeft: '2px solid #1f2937' }}>
                                    <div className={styles.typingDots}><span /><span /><span /></div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={endRef} />
            </div>

            {/* ── SUGGESTIONS ─────────────────────────────────── */}
            <div className={styles.suggestions} style={{ borderTop: divider, display: 'flex', gap: 6, flexShrink: 0, background: '#0a0a0a', padding: '8px 20px' }}>
                {SUGGESTIONS.map((s) => (
                    <button key={s.text} onClick={() => setInput(s.text)}
                        style={{ ...mono, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'transparent', border: '1px solid #1a1c24', cursor: 'pointer', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(253,200,0,0.3)'; e.currentTarget.style.color = '#FDC800'; e.currentTarget.style.background = 'rgba(253,200,0,0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1c24'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                    >
                        <span style={{ fontSize: 11 }}>{s.icon}</span>{s.text}
                    </button>
                ))}
            </div>

            {/* ── INPUT BAR ───────────────────────────────────── */}
            <div className={styles.inputBar} style={{ borderTop: `1px solid ${input.trim() ? 'rgba(253,200,0,0.2)' : '#1a1c24'}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: '#090909', transition: 'border-color 0.2s' }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={lang === 'fr' ? 'Tapez : NQ à 21450, stop 30 points, risque $500...' : 'Type: NQ at 21450, 30 point stop, $500 risk...'}
                    autoComplete="off"
                    style={{ ...mono, flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 16, color: '#e2e8f0', lineHeight: 1.5 }}
                />
                <button
                    onClick={isListening ? stopVoiceInput : startVoiceInput}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                    style={{
                        width: 44, height: 44, flexShrink: 0,
                        background: isListening ? 'rgba(255,71,87,0.15)' : 'transparent',
                        border: `1px solid ${isListening ? '#ff4757' : '#1a1c24'}`,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                        animation: isListening ? 'pulse-mic 1s infinite' : 'none',
                    }}
                >
                    {isListening
                        ? <MicOff size={14} color="#ff4757" />
                        : <Mic size={14} color="#4b5563" />}
                </button>
                <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                    style={{ width: 44, height: 44, flexShrink: 0, background: input.trim() ? '#FDC800' : '#0d1117', border: `1px solid ${input.trim() ? '#FDC800' : '#1a1c24'}`, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: input.trim() ? '0 0 14px rgba(253,200,0,0.22)' : 'none' }}
                >
                    <Send size={14} color={input.trim() ? '#000' : '#2d3748'} />
                </button>
            </div>
        </div>
    );
}
