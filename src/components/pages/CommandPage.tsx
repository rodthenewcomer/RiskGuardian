'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import styles from './CommandPage.module.css';
import { useAppStore, getFuturesSpec, calcPositionSize, getESTFull } from '@/store/appStore';
import { Terminal, Brain, ShieldCheck, Target, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    analyzeRiskGuardian, analyzeBehavior, scoreTradeQuality,
    generateJournalInsights, analyzeStrategy, optimizeTakeProfit,
    generateDailyReport, calcProfitTarget
} from '@/ai/RiskAI';

type LogEntry = {
    id: string;
    cmd: string;
    asset: string;
    entry: number;
    size: number;
    risk: number;
    sl: number;
    tp: number;
    rr: number;
    comm?: number;
    notional?: number;
    approved: boolean;
    warnings: string[];
    notices: string[];
    timestamp: Date;
    // AI Layer
    aiGrade?: string;
    aiScore?: number;
    aiGuardianStatus?: string;
    aiGuardianWarning?: string;
    aiEmotionalState?: string;
    aiMeta?: string;   // special display type: 'ai' | 'grade' | 'tpopt' | 'coach' | 'strategy'
    aiData?: Record<string, unknown>;
};

export default function CommandPage() {
    const { account, getDailyRiskRemaining, addTrade, addDailyRisk, setActiveTab, trades, updateAccount, resetTodaySession } = useAppStore();
    const [input, setInput] = useState('');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIdx, setHistoryIdx] = useState(-1);
    const endRef = useRef<HTMLDivElement>(null);

    const remainingToday = useMemo(() => getDailyRiskRemaining(), [getDailyRiskRemaining]);
    const maxTradeRisk = useMemo(() => (account.balance * account.maxRiskPercent) / 100, [account.balance, account.maxRiskPercent]);



    useEffect(() => {
        // Auto scroll to latest command
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const getAssetType = (sym: string): 'crypto' | 'forex' | 'futures' | 'stocks' => {
        const clean = sym.toUpperCase();
        if (getFuturesSpec(clean)) return 'futures';
        if (clean.includes('/')) {
            const cp = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'MATIC'];
            if (cp.some(p => clean.startsWith(p))) return 'crypto';
            return 'forex';
        }
        return 'crypto'; // Default fallback assumption for HUD
    };

    const processCommand = (cmdStr: string) => {
        const trimmed = cmdStr.trim();
        if (!trimmed) return;

        // Meta Commands Parser
        const lower = trimmed.toLowerCase();
        const metaParts = lower.split(/\s+/);
        const metaCmd = metaParts[0];

        if (metaCmd === 'clear') {
            setLogs([]);
            setInput('');
            return;
        }

        if (metaCmd === 'help') {
            const helpLog: LogEntry = {
                id: Math.random().toString(36),
                cmd: 'help',
                asset: 'SYSTEM',
                entry: 0.1, // flag as system info
                size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                approved: true, warnings: [], notices: [],
                timestamp: new Date()
            };
            setLogs(prev => [...prev, helpLog]);
            setInput('');
            return;
        }

        if (metaCmd === 'rules') {
            const rulesLog: LogEntry = {
                id: Math.random().toString(36),
                cmd: 'rules',
                asset: 'RULES',
                entry: 0.2, // flag as rules info
                size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                approved: true, warnings: [], notices: [],
                timestamp: new Date()
            };
            setLogs(prev => [...prev, rulesLog]);
            setInput('');
            return;
        }

        if (metaCmd === 'stats') {
            const closed = trades.filter((t: any) => t.outcome !== 'open');
            const wins = closed.filter((t: any) => t.outcome === 'win').length;
            const pnl = closed.reduce((s: number, t: any) => s + (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD), 0);
            const statsLog: LogEntry = {
                id: Math.random().toString(36),
                cmd: 'stats',
                asset: 'PERFORMANCE',
                entry: 0.3, // Performance flag
                size: closed.length, // total trades count
                risk: pnl, // realized pnl
                sl: wins, // wins count
                tp: closed.length > 0 ? (wins / closed.length) * 100 : 0, // winrate
                rr: 0, approved: true, warnings: [], notices: [],
                timestamp: new Date()
            };
            setLogs(prev => [...prev, statsLog]);
            setInput('');
            return;
        }

        if (metaCmd === 'balance' && metaParts[1]) {
            const newBal = parseFloat(metaParts[1]);
            if (!isNaN(newBal)) {
                updateAccount({ balance: newBal });
                const log: LogEntry = {
                    id: Math.random().toString(36),
                    cmd: trimmed,
                    asset: 'ACCOUNT',
                    entry: 0.4, // generic system notification
                    size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                    approved: true, warnings: [], notices: [`Balance updated to $${newBal.toLocaleString()}`],
                    timestamp: new Date()
                };
                setLogs(prev => [...prev, log]);
                setInput('');
                return;
            }
        }

        if (metaCmd === 'daily' && metaParts[1]) {
            const newLimit = parseFloat(metaParts[1]);
            if (!isNaN(newLimit)) {
                updateAccount({ dailyLossLimit: newLimit });
                const log: LogEntry = {
                    id: Math.random().toString(36),
                    cmd: trimmed,
                    asset: 'ACCOUNT',
                    entry: 0.4,
                    size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                    approved: true, warnings: [], notices: [`Daily loss limit updated to $${newLimit.toLocaleString()}`],
                    timestamp: new Date()
                };
                setLogs(prev => [...prev, log]);
                setInput('');
                return;
            }
        }

        if (metaCmd === 'reset') {
            resetTodaySession();
            setLogs([]);
            setInput('');
            return;
        }

        if (['journal', 'plan', 'settings', 'dashboard', 'analytics', 'calc'].includes(metaCmd)) {
            setActiveTab(metaCmd === 'calc' ? 'calculator' : metaCmd as any);
            setInput('');
            return;
        }

        // ── AI Meta Commands ──
        if (metaCmd === 'ai') {
            const guardian = analyzeRiskGuardian(account, account.dailyLossLimit - getDailyRiskRemaining());
            const behavior = analyzeBehavior(trades, maxTradeRisk);
            const aiLog: LogEntry = {
                id: crypto.randomUUID?.() || Math.random().toString(36),
                cmd: trimmed, asset: 'AI', entry: 0.9, size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                approved: true, warnings: [], notices: [], timestamp: new Date(),
                aiMeta: 'ai',
                aiData: { guardian, behavior }
            };
            setLogs(prev => [...prev, aiLog]);
            setInput('');
            return;
        }

        if (metaCmd === 'coach') {
            const todayUsed = account.dailyLossLimit - getDailyRiskRemaining();
            const report = generateDailyReport(trades, account, todayUsed);
            const coachLog: LogEntry = {
                id: crypto.randomUUID?.() || Math.random().toString(36),
                cmd: trimmed, asset: 'COACH', entry: 0.95, size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                approved: true, warnings: [], notices: [], timestamp: new Date(),
                aiMeta: 'coach', aiData: { report }
            };
            setLogs(prev => [...prev, coachLog]);
            setInput('');
            return;
        }

        if (metaCmd === 'strategy') {
            const strategy = analyzeStrategy(trades);
            const stratLog: LogEntry = {
                id: crypto.randomUUID?.() || Math.random().toString(36),
                cmd: trimmed, asset: 'STRATEGY', entry: 0.96, size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                approved: true, warnings: [], notices: [], timestamp: new Date(),
                aiMeta: 'strategy', aiData: { strategy }
            };
            setLogs(prev => [...prev, stratLog]);
            setInput('');
            return;
        }

        if (metaCmd === 'journal') {
            const insights = generateJournalInsights(trades, account);
            const journalLog: LogEntry = {
                id: crypto.randomUUID?.() || Math.random().toString(36),
                cmd: trimmed, asset: 'JOURNAL', entry: 0.97, size: 0, risk: 0, sl: 0, tp: 0, rr: 0,
                approved: true, warnings: [], notices: [], timestamp: new Date(),
                aiMeta: 'journal', aiData: { insights }
            };
            setLogs(prev => [...prev, journalLog]);
            setInput('');
            return;
        }

        const parts = trimmed.split(/\s+/);
        let passet = '';
        let pentry = 0;
        let psize = 0;
        let prisk = 0;
        let pstop = 0;
        let ptarget = 0;       // raw TP price
        let ptargetBal = 0;   // target balance for reverse TP solve
        let isShort = false;

        // Extremely simple powerful parser
        parts.forEach((p, i) => {
            const num = parseFloat(p);
            const lowerp = p.toLowerCase();

            if (lowerp === 'buy' || lowerp === 'long') isShort = false;
            if (lowerp === 'sell' || lowerp === 'short') isShort = true;

            // Assume first non-number is Asset
            if (isNaN(num) && !['buy', 'sell', 'long', 'short', 'risk', 'stop', 'target', 'size'].some(k => lowerp.includes(k))) {
                if (!passet) passet = p.toUpperCase();
            }

            // Assume first raw number is Entry
            if (!isNaN(num) && i > 0 && pentry === 0 && !parts[i - 1].toLowerCase().match(/stop|size|risk|target/)) {
                pentry = num;
            } else if (!isNaN(num) && pentry !== 0 && psize === 0 && !parts[i - 1].toLowerCase().match(/stop|risk|target/)) {
                psize = num; // Assume second standalone number is Size
            }

            // Explicits
            if (lowerp.startsWith('risk')) {
                const val = parseFloat(lowerp.replace('risk', ''));
                if (!isNaN(val)) prisk = val;
            } else if (i > 0 && parts[i - 1].toLowerCase() === 'risk') {
                prisk = parseFloat(p);
            }

            if (lowerp.startsWith('stop')) {
                const val = parseFloat(lowerp.replace('stop', ''));
                if (!isNaN(val)) pstop = val;
            } else if (i > 0 && parts[i - 1].toLowerCase() === 'stop') {
                pstop = parseFloat(p);
            }

            if (lowerp.startsWith('size')) {
                const val = parseFloat(lowerp.replace('size', ''));
                if (!isNaN(val)) psize = val;
            } else if (i > 0 && parts[i - 1].toLowerCase() === 'size') {
                psize = parseFloat(p);
            }

            if (lowerp.startsWith('targetbalance') || lowerp.startsWith('targetbal')) {
                const key = lowerp.startsWith('targetbalance') ? 'targetbalance' : 'targetbal';
                const val = parseFloat(lowerp.replace(key, ''));
                if (!isNaN(val) && val > 0) ptargetBal = val;
            } else if (i > 0 && (parts[i - 1].toLowerCase() === 'targetbalance' || parts[i - 1].toLowerCase() === 'targetbal')) {
                const val = parseFloat(p);
                if (!isNaN(val) && val > 0) ptargetBal = val;
            } else if (lowerp.startsWith('target')) {
                const val = parseFloat(lowerp.replace('target', ''));
                if (!isNaN(val)) ptarget = val;
            } else if (i > 0 && parts[i - 1].toLowerCase() === 'target') {
                ptarget = parseFloat(p);
            }
        });

        if (!passet) passet = 'SYM';
        if (prisk === 0) prisk = maxTradeRisk; // Default risk if not specified

        const atype = getAssetType(passet);
        let pointVal = 1;
        if (atype === 'futures') {
            const spec = getFuturesSpec(passet);
            if (spec) pointVal = spec.pointValue;
        }

        const warnings: string[] = [];
        const notices: string[] = [];
        let r_sl = pstop;
        let r_tp = ptarget;
        let r_size = psize;
        let r_rr = 2; // Default 2R

        let r_comm = 0;
        let r_notional = 0;

        if (pentry > 0) {
            // Check direction if explicitly 'stop' not given
            if (pstop === 0 && psize > 0) {
                const move = prisk / (psize * pointVal);
                r_sl = isShort ? pentry + move : pentry - move;
                r_tp = ptarget > 0 ? ptarget : (isShort ? pentry - (move * 2) : pentry + (move * 2));
                r_size = psize;
            } else if (pstop > 0 && psize === 0) {
                const res = calcPositionSize({ balance: account.balance, entry: pentry, stopLoss: pstop, riskAmt: prisk, assetType: atype, symbol: passet, isShort });
                r_size = res.size;
                r_comm = res.comm;
                r_notional = res.notional;
                const distance = Math.abs(pentry - pstop);
                r_tp = ptarget > 0 ? ptarget : (pentry > pstop ? pentry + distance * 2 : pentry - distance * 2);
            } else if (psize > 0 && pstop > 0) {
                const distance = Math.abs(pentry - pstop);
                prisk = distance * psize * pointVal;
                r_tp = ptarget > 0 ? ptarget : (pentry > pstop ? pentry + distance * 2 : pentry - distance * 2);
                r_size = psize;
                r_notional = r_size * pentry * pointVal;
                r_comm = r_notional * 0.0004;
            }

            // ── Target Balance → Reverse TP solve (Use Case 3) ──
            if (ptargetBal > 0 && pentry > 0 && psize > 0 && pstop > 0) {
                const tpResult = calcProfitTarget({
                    entry: pentry, stopLoss: pstop, size: psize * pointVal,
                    targetBalance: ptargetBal, currentBalance: account.balance
                });
                r_tp = tpResult.requiredTP;
                r_rr = tpResult.rr;
                notices.push(`Target Balance: $${ptargetBal.toLocaleString()} | Profit needed: $${(ptargetBal - account.balance).toFixed(0)} | TP: ${r_tp.toFixed(5)} | R:R ${r_rr.toFixed(2)}`);
            } else if (ptargetBal > 0 && pentry > 0 && psize > 0) {
                // No stop given — estimate TP from balance target via move needed
                const neededProfit = ptargetBal - account.balance;
                const move = psize * pointVal > 0 ? neededProfit / (psize * pointVal) : 0;
                r_tp = pentry + move; // Assume long if no direction given
                notices.push(`Target Balance: $${ptargetBal.toLocaleString()} | Profit needed: $${neededProfit.toFixed(0)} | TP: ${r_tp.toFixed(5)}`);
            }

            if (r_sl !== 0 && r_tp !== 0 && pentry !== r_sl) {
                r_rr = Math.abs(r_tp - pentry) / Math.abs(pentry - r_sl);
            }
        }

        // Tradeify Fee Notice
        if (r_comm > 0) notices.push(`Trade Fee: $${r_comm.toFixed(2)} (0.04% commission)`);

        // Constraints Check
        if (prisk > remainingToday) warnings.push(`Risk ($${prisk.toFixed(0)}) exceeds daily limit remaining ($${remainingToday.toFixed(0)})`);
        if (prisk > maxTradeRisk) warnings.push(`Risk ($${prisk.toFixed(0)}) exceeds maximum allowed per-trade risk ($${maxTradeRisk.toFixed(0)})`);

        // Leverage Check (Tradeify Specific)
        let maxLev = account.leverage || 100;
        if (account.propFirm?.includes('Tradeify')) {
            const isBTC_ETH = passet.includes('BTC') || passet.includes('ETH');
            const isEval = account.propFirmType?.includes('Evaluation');
            if (isEval && isBTC_ETH) maxLev = 5;
            else maxLev = 2;
            notices.push(`${passet} Max Leverage: ${maxLev}:1`);
        }

        const posValue = r_notional || (r_size * pentry * pointVal);
        const maxPosValue = account.balance * maxLev;
        if ((atype === 'crypto' || passet.includes('USD')) && posValue > maxPosValue) {
            warnings.push(`Leverage Overflow: $${posValue.toLocaleString()} > $${maxPosValue.toLocaleString()} (${maxLev}:1)`);
        }

        // Max Drawdown Check
        if (account.maxDrawdownLimit && account.maxDrawdownLimit > 0) {
            let floor = account.balance - account.maxDrawdownLimit;
            if (account.drawdownType === 'Trailing') {
                floor = Math.min(account.startingBalance, (account.highestBalance || account.balance) - account.maxDrawdownLimit);
            } else if (account.drawdownType === 'Static') {
                floor = account.startingBalance - account.maxDrawdownLimit;
            } else if (account.drawdownType === 'EOD') {
                floor = (account.highestBalance || account.balance) - account.maxDrawdownLimit;
            }
            if ((account.balance - prisk) < floor) {
                warnings.push(`Breach: $${(account.balance - prisk).toLocaleString()} < Floor $${floor.toLocaleString()}`);
            }
        }

        if (account.minHoldTimeSec && account.minHoldTimeSec > 0) {
            notices.push(`Time Guard: ${account.minHoldTimeSec}s hold required.`);
        }

        // ── AI Layer: run guardian + quality + behavior on every trade ──
        const todayUsed = account.dailyLossLimit - remainingToday;
        const guardian = analyzeRiskGuardian(account, todayUsed, prisk);
        const behavior = analyzeBehavior(trades, maxTradeRisk);

        const stopDistPct = pentry > 0 && r_sl > 0
            ? (Math.abs(pentry - r_sl) / pentry) * 100
            : 1;
        const remainingDailyPct = account.dailyLossLimit > 0
            ? (remainingToday / account.dailyLossLimit) * 100
            : 100;

        const tradeQuality = pentry > 0 ? scoreTradeQuality({
            riskUSD: prisk,
            maxTradeRisk,
            rr: r_rr,
            stopDistancePct: stopDistPct,
            remainingDailyPct,
            behaviorState: behavior.emotionalState
        }) : null;

        // Embed AI warnings into warnings/notices
        if (guardian.tradeWarning) warnings.push(`🛡 Guardian: ${guardian.tradeWarning}`);
        if (behavior.stopTradingRecommended) warnings.push(`🧠 Behavioral: ${behavior.recommendation}`);
        else if (behavior.revengeRisk) notices.push(`⚠️ Revenge risk detected (+${behavior.revengePct.toFixed(0)}% size after last loss)`);

        const newLog: LogEntry = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2)),
            cmd: trimmed,
            asset: passet,
            entry: pentry,
            size: r_size,
            risk: prisk,
            sl: r_sl,
            tp: r_tp,
            rr: r_rr,
            comm: r_comm,
            notional: r_notional || (r_size * pentry * pointVal),
            approved: warnings.length === 0 && pentry > 0,
            warnings,
            notices,
            timestamp: new Date(),
            aiGrade: tradeQuality?.grade,
            aiScore: tradeQuality?.score,
            aiGuardianStatus: guardian.survivalStatus,
            aiGuardianWarning: guardian.tradeWarning,
            aiEmotionalState: behavior.emotionalState,
        };

        setLogs(prev => [...prev, newLog]);
        setHistory(prev => [trimmed, ...prev].slice(0, 50));
        setHistoryIdx(-1);
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            processCommand(input);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIdx < history.length - 1) {
                const nextIdx = historyIdx + 1;
                setHistoryIdx(nextIdx);
                setInput(history[nextIdx]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIdx > -1) {
                const nextIdx = historyIdx - 1;
                setHistoryIdx(nextIdx);
                setInput(nextIdx === -1 ? '' : history[nextIdx]);
            }
        }
    };

    const handleExecute = (log: LogEntry) => {
        addTrade({
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
            asset: log.asset,
            assetType: getAssetType(log.asset),
            entry: log.entry,
            stopLoss: log.sl,
            takeProfit: log.tp,
            lotSize: log.size,
            riskUSD: log.risk,
            rewardUSD: log.risk * log.rr,
            rr: log.rr,
            outcome: 'open',
            createdAt: getESTFull()
        });
        addDailyRisk(log.risk);
        setActiveTab('plan');
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Terminal size={18} className="text-accent" />
                    <span className={styles.headerTitle}>HUD Terminal</span>
                </div>
                <div className={styles.headerLimit}>
                    DAILY GUARD: <strong className={remainingToday < (account.dailyLossLimit * 0.2) ? styles.danger : ''}>${remainingToday.toFixed(0)}</strong> REMAINING
                </div>
            </div>

            <div className={styles.logArea}>
                {logs.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Terminal size={32} strokeWidth={1} />
                        <p>Type a command to calculate risk<br />Ex: <strong>sol 91.65 800 risk800</strong></p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {logs.map(log => (
                            <motion.div key={log.id} className={styles.block} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                <div className={styles.cmdEcho}>
                                    &gt; <span>{log.cmd}</span>
                                </div>

                                {log.aiMeta === 'ai' ? (
                                    <div className={styles.responseBox}>
                                        <span className={styles.resTitle}><Brain size={11} style={{ display: 'inline', marginRight: 4 }} />AI SYSTEM STATUS</span>
                                        {(() => {
                                            const g = (log.aiData?.guardian as any);
                                            const b = (log.aiData?.behavior as any);
                                            if (!g) return null;
                                            return (
                                                <div className={`text-[12px] mt-2 space-y-1`}>
                                                    <div className="flex justify-between"><span className="text-muted">Survival Status</span><span className={`font-bold ${g.survivalStatus === 'safe' ? 'text-success' : g.survivalStatus === 'caution' ? 'text-warning' : 'text-danger'}`}>{g.survivalStatus?.toUpperCase()}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Daily Remaining</span><span className="font-mono font-bold">${g.remainingDaily?.toFixed(0)}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Safe Risk/Trade</span><span className="font-mono font-bold text-accent">${g.safeRisk?.toFixed(0)}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Trades Left</span><span className="font-mono font-bold">{g.maxTradesLeft}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Emotional State</span><span className={`font-bold ${b?.emotionalState === 'disciplined' ? 'text-success' : b?.emotionalState === 'cautious' ? 'text-warning' : 'text-danger'}`}>{b?.emotionalState?.toUpperCase()}</span></div>
                                                    <div className="mt-2 text-muted italic text-[11px]">{g.recommendation}</div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : log.aiMeta === 'coach' ? (
                                    <div className={styles.responseBox}>
                                        <span className={styles.resTitle}><Brain size={11} style={{ display: 'inline', marginRight: 4 }} />AI COACHING REPORT</span>
                                        {(() => {
                                            const r = (log.aiData?.report as any);
                                            if (!r) return null;
                                            return (
                                                <div className="text-[12px] mt-2 space-y-1">
                                                    <div className="flex justify-between"><span className="text-muted">Session Trades</span><span className="font-mono font-bold">{r.trades}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Net P&L</span><span className={`font-mono font-bold ${r.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>{r.netProfit >= 0 ? '+' : ''}${r.netProfit?.toFixed(0)}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Discipline Grade</span><span className="font-bold text-accent">{r.disciplineGrade}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Revenge Trades</span><span className={`font-bold ${r.revengeTradesDetected > 0 ? 'text-danger' : 'text-success'}`}>{r.revengeTradesDetected}</span></div>
                                                    {r.strengths?.length > 0 && <div className="mt-1 text-success text-[11px]">✅ {r.strengths[0]}</div>}
                                                    {r.weaknesses?.length > 0 && <div className="text-danger text-[11px]">⚠️ {r.weaknesses[0]}</div>}
                                                    <div className="mt-2 text-muted italic text-[11px]">{r.tomorrowFocus}</div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : log.aiMeta === 'strategy' ? (
                                    <div className={styles.responseBox}>
                                        <span className={styles.resTitle}><Target size={11} style={{ display: 'inline', marginRight: 4 }} />PERSONAL RULEBOOK</span>
                                        {(() => {
                                            const s = (log.aiData?.strategy as any);
                                            if (!s) return null;
                                            return (
                                                <div className="text-[12px] mt-2 space-y-1">
                                                    <p className="text-muted italic text-[11px] mb-2">{s.aiRulesSummary}</p>
                                                    {s.bestConditions?.length > 0 && <div className="text-success text-[11px]">✅ Best: {s.bestConditions.join(' · ')}</div>}
                                                    {s.worstConditions?.length > 0 && <div className="text-danger text-[11px]">❌ Avoid: {s.worstConditions.join(' · ')}</div>}
                                                    <div className="flex justify-between mt-1"><span className="text-muted">Top Asset</span><span className="font-bold text-accent">{s.topAsset}</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Floor R:R</span><span className="font-bold">{s.optimalRRFloor}R</span></div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : log.aiMeta === 'journal' ? (
                                    <div className={styles.responseBox}>
                                        <span className={styles.resTitle}><Zap size={11} style={{ display: 'inline', marginRight: 4 }} />AI JOURNAL INSIGHTS</span>
                                        {(() => {
                                            const ins = (log.aiData?.insights as any);
                                            if (!ins) return null;
                                            return (
                                                <div className="text-[12px] mt-2 space-y-1">
                                                    <p className="text-muted italic text-[11px] mb-1">{ins.dailySummary}</p>
                                                    <div className="flex justify-between"><span className="text-muted">Win Rate</span><span className={`font-bold ${ins.winRate >= 55 ? 'text-success' : 'text-danger'}`}>{ins.winRate?.toFixed(0)}%</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Expectancy</span><span className={`font-bold ${ins.expectancy >= 0 ? 'text-success' : 'text-danger'}`}>{ins.expectancy >= 0 ? '+' : ''}${ins.expectancy?.toFixed(0)}/trade</span></div>
                                                    <div className="flex justify-between"><span className="text-muted">Best Setup</span><span className="font-bold text-accent">{ins.bestSetup}</span></div>
                                                    <div className="mt-2 text-[var(--color-warning)] text-[11px] italic">{ins.aiCoachMessage}</div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : log.asset === 'SYSTEM' && log.entry === 0.1 ? (
                                    <div className={styles.responseBox}>
                                        <span className={styles.resTitle}>HUD HELP & SYNTAX</span>
                                        <div className="text-[12px] mt-1 space-y-2 opacity-90">
                                            <p className="text-[10px] text-muted uppercase tracking-wider font-bold mb-1">── TRADE COMMANDS ──</p>
                                            <p><code className="text-accent">asset entry stop</code> - Calc size from stop price.</p>
                                            <p><code className="text-accent">asset entry size</code> - Calc stop from contract size.</p>
                                            <p><code className="text-accent">buy/sell</code> - Set SL direction explicitly.</p>
                                            <p className="text-[10px] text-muted uppercase tracking-wider font-bold mt-2 mb-1">── AI COMMANDS ──</p>
                                            <p><code className="text-accent">ai</code> - Full AI system status: guardian, behavior, safe risk.</p>
                                            <p><code className="text-accent">coach</code> - End-of-session coaching report + discipline grade.</p>
                                            <p><code className="text-accent">strategy</code> - Your personal AI rulebook from trade history.</p>
                                            <p><code className="text-accent">journal</code> - AI journal: insights, expectancy, best setup.</p>
                                            <p className="text-[10px] text-muted uppercase tracking-wider font-bold mt-2 mb-1">── ACCOUNT COMMANDS ──</p>
                                            <p><code className="text-accent">stats</code> - View P&L and win rate summary.</p>
                                            <p><code className="text-accent">balance [num]</code> - Update total account balance.</p>
                                            <p><code className="text-accent">daily [num]</code> - Update daily loss limit.</p>
                                            <p><code className="text-accent">reset</code> - Reset today's risk data.</p>
                                            <p><code className="text-accent">settings | analytics | calc</code> - Fast navigation.</p>
                                            <p><code className="text-accent">clear</code> - Wipes terminal logs.</p>
                                        </div>
                                    </div>
                                ) : log.asset === 'PERFORMANCE' && log.entry === 0.3 ? (
                                    <div className={styles.responseBox}>
                                        <span className={styles.resTitle}>PERFORMANCE SUMMARY</span>
                                        <div className={styles.grid2}>
                                            <div className={styles.kv}><span className={styles.kvKey}>Total Trades</span><span className={styles.kvVal}>{log.size}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Win Rate</span><span className={styles.kvVal}>{log.tp.toFixed(1)}%</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Realized PnL</span><span className={`${styles.kvVal} ${log.risk >= 0 ? 'text-success' : 'text-danger'}`}>{log.risk >= 0 ? '+' : ''}${log.risk.toFixed(2)}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Wins</span><span className={styles.kvVal} style={{ color: 'var(--color-success)' }}>{log.sl}</span></div>
                                        </div>
                                    </div>
                                ) : log.entry === 0.4 ? (
                                    <div className={styles.responseBox}>
                                        <span className={styles.resTitle}>SYSTEM UPDATE</span>
                                        <div className="text-[12px] text-accent font-bold">
                                            {log.notices[0]}
                                        </div>
                                    </div>
                                ) : log.asset === 'RULES' && log.entry === 0.2 ? (
                                    <div className={styles.responseBox}>
                                        <span className={`${styles.resTitle} ${styles.warn}`}>ACTIVE CONSTRAINTS</span>
                                        <div className={styles.grid2}>
                                            <div className={styles.kv}><span className={styles.kvKey}>Max Risk / Trade</span><span className={styles.kvVal}>${maxTradeRisk.toFixed(0)}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Daily Limit</span><span className={styles.kvVal}>${account.dailyLossLimit.toFixed(0)}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Drawdown Type</span><span className={styles.kvVal}>{account.drawdownType}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Firm Type</span><span className={styles.kvVal}>{account.propFirm || 'Default'}</span></div>
                                        </div>
                                    </div>
                                ) : log.entry === 0 ? (
                                    <div className={`${styles.responseBox} ${styles.resError}`}>
                                        <span className={`${styles.resTitle} ${styles.fail}`}>ERROR: Parse Failed</span>
                                        <div className="text-[12px] mt-1">System requires an entry price to calculate coordinates. Ensure command syntax is correct.</div>
                                    </div>
                                ) : (
                                    <div className={`${styles.responseBox} ${!log.approved ? styles.resError : ''}`}>
                                        <div className="flex justify-between items-start">
                                            <span className={`${styles.resTitle} ${log.approved ? styles.safe : styles.fail}`}>
                                                {log.approved ? 'AUTHORIZED: SAFE TO EXECUTE' : 'REJECTED: RULE VIOLATION'}
                                            </span>
                                            {log.approved && (
                                                <button
                                                    onClick={() => handleExecute(log)}
                                                    className="bg-accent/10 border border-accent/20 px-2 py-0.5 rounded text-[10px] font-bold text-accent hover:bg-accent hover:text-black transition-colors"
                                                >
                                                    EXECUTE
                                                </button>
                                            )}
                                        </div>
                                        <div className={styles.grid2}>
                                            <div className={styles.kv}><span className={styles.kvKey}>Entry</span><span className={styles.kvVal}>${log.entry.toLocaleString()}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Position Size</span><span className={styles.kvVal}>{log.size.toLocaleString(undefined, { maximumFractionDigits: 5 })} units</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Stop Loss</span><span className={`${styles.kvVal} text-danger`}>{log.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Take Profit</span><span className={`${styles.kvVal} text-success`}>{log.tp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Notional</span><span className={styles.kvVal}>${log.notional?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                                            <div className={styles.kv}><span className={styles.kvKey}>Yield</span><span className={styles.kvVal}>{log.rr.toFixed(1)}R</span></div>
                                        </div>
                                        {/* AI Quality Badge */}
                                        {log.aiGrade && (
                                            <div className={styles.aiBadgeRow}>
                                                <div className={`${styles.aiBadge} ${log.aiGrade.startsWith('A') ? styles.aiBadgeA : log.aiGrade.startsWith('B') ? styles.aiBadgeB : styles.aiBadgeC}`}>
                                                    <Brain size={10} /> Grade: {log.aiGrade} · {log.aiScore}/100
                                                </div>
                                                <div className={`${styles.aiBadge} ${log.aiGuardianStatus === 'safe' ? styles.aiBadgeA : log.aiGuardianStatus === 'caution' ? styles.aiBadgeWarn : styles.aiBadgeC}`}>
                                                    <ShieldCheck size={10} /> {log.aiGuardianStatus?.toUpperCase()}
                                                </div>
                                                <div className={`${styles.aiBadge} ${log.aiEmotionalState === 'disciplined' ? styles.aiBadgeA : log.aiEmotionalState === 'cautious' ? styles.aiBadgeWarn : styles.aiBadgeC}`}>
                                                    <Zap size={10} /> {log.aiEmotionalState?.toUpperCase()}
                                                </div>
                                            </div>
                                        )}

                                        {!log.approved && (
                                            <div className="mt-3 flex flex-col gap-1">
                                                {log.warnings.map((w, i) => (
                                                    <div key={`w-${i}`} className="text-[11px] text-[var(--color-danger)] font-semibold">• {w}</div>
                                                ))}
                                            </div>
                                        )}
                                        {log.notices.length > 0 && (
                                            <div className={`flex flex-col gap-1 ${log.approved ? 'mt-3' : 'mt-1'}`}>
                                                {log.notices.map((n, i) => (
                                                    <div key={`n-${i}`} className="text-[11px] text-[var(--color-warning)] font-semibold">ℹ {n}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
                <div ref={endRef} />
            </div>

            <div className={styles.inputArea}>
                <span className={styles.promptSymbol}>&gt;</span>
                <input
                    className={styles.input}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter command (e.g. sol 91.65 800) and press Enter"
                    autoFocus
                    autoComplete="off"
                    spellCheck="false"
                />
            </div>
        </div>
    );
}
