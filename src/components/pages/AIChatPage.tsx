'use client';

/**
 * AIChatPage — AI Risk Coach
 * Terminal aesthetic · 2026 redesign · Mobile-first
 * NLP v2: full instrument spec, stop-distance sizing, short detection,
 *          dollar-risk from position, payout check, strategy analysis
 */

import { useState, useRef, useEffect } from 'react';
import { useAppStore, getTradingDay, getFuturesSpec, FUTURES_SPECS } from '@/store/appStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Send, RotateCcw, ShieldCheck, Zap, Activity } from 'lucide-react';
import {
    calcSmartPositionSize, calcProfitTarget, analyzeRiskGuardian,
    analyzeBehavior, optimizeTakeProfit, generateDailyReport,
    analyzeConsistency, analyzeStrategy,
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
// Asset resolution — verbal aliases + symbol detection
// ─────────────────────────────────────────────────────────────────

const VERBAL_ASSET_MAP: Record<string, string> = {
    GOLD: 'GC', GOLD1: 'GC',
    OIL: 'CL', CRUDEOIL: 'CL', CRUDE: 'CL', WTI: 'CL',
    SILVER: 'SI',
    TBOND: 'ZB', BONDS: 'ZB', BOND: 'ZB',
    NASDAQ: 'NQ', NDX: 'NQ',
    SP500: 'ES', SPX: 'ES', SP: 'ES',
    DOW: 'YM', DJIA: 'YM',
    RUSSELL: 'RTY', RUT: 'RTY',
};

const CRYPTO_SYMBOLS = new Set([
    'BTC', 'ETH', 'SOL', 'PEPE', 'WIF', 'BONK', 'PNUT', 'DOGE', 'SUI', 'AVAX',
    'APT', 'LINK', 'UNI', 'ADA', 'XRP', 'DOT', 'NEAR', 'FET', 'LTC', 'BCH',
    'RENDER', 'TAO', 'TIA', 'SEI', 'INJ', 'JUP', 'PYTH', 'OP', 'ARB', 'STRK',
]);
const FOREX_PREFIXES = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'USD'];
const FUTURES_SET = new Set(Object.keys(FUTURES_SPECS));

function resolveAsset(raw: string): string {
    const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return VERBAL_ASSET_MAP[s] || s;
}

function detectAssetType(symbol: string): 'crypto' | 'forex' | 'futures' | 'stocks' {
    const s = resolveAsset(symbol);
    if (FUTURES_SET.has(s)) return 'futures';
    if (CRYPTO_SYMBOLS.has(s)) return 'crypto';
    if (s.length === 6 && FOREX_PREFIXES.some(p => s.startsWith(p) || s.endsWith(p))) return 'forex';
    return 'crypto';
}

// ─────────────────────────────────────────────────────────────────
// Natural Language AI Processor — v2
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
    const nums = (input.match(/[\d,]+\.?\d*/g) || [])
        .map(n => parseFloat(n.replace(/,/g, '')))
        .filter(n => !isNaN(n) && n > 0);

    // ── Asset extraction (verbal + symbol) ────────────────────────
    const assetRaw = (
        input.match(/\b(BTC|ETH|SOL|XRP|PEPE|DOGE|AVAX|LINK|ADA|SUI|APT|INJ|TAO|OP|ARB|STRK|NQ|MNQ|ES|MES|YM|MYM|RTY|M2K|GC|MGC|CL|QM|SI|ZB|GOLD|OIL|SILVER|NASDAQ|SP500|DOW|RUSSELL|WTI|EURUSD|GBPUSD|USDJPY|AUDUSD|EURUSD|EUR|GBP)\b/i)?.[0]?.toUpperCase()
    ) || 'ASSET';
    const asset     = resolveAsset(assetRaw);
    const assetType = detectAssetType(asset);
    const fSpec     = assetType === 'futures' ? getFuturesSpec(asset) : null;

    // ── Number extraction helpers ─────────────────────────────────
    const entry  = nums[0] || 0;
    const second = nums[1] || 0;
    const third  = nums[2] || 0;

    // ── Stop expressed as distance (points / ticks / pips) ───────
    const stopDistMatch = lower.match(/(\d+\.?\d*)\s*(point|points|tick|ticks|pip|pips|pt|pts)\b/i);
    const stopDistNum   = stopDistMatch ? parseFloat(stopDistMatch[1]) : 0;
    const hasStopDist   = stopDistNum > 0;

    // ── Known position size (2 contracts, 0.5 lots, …) ───────────
    const sizeUnitMatch = lower.match(/(\d+\.?\d*)\s*(contract|contracts|lot|lots|share|shares|unit|units)\b/i);
    const knownSizeNum  = sizeUnitMatch ? parseFloat(sizeUnitMatch[1]) : 0;
    const hasKnownSize  = knownSizeNum > 0;

    // ── Intent flags ──────────────────────────────────────────────
    const hasEntry    = /entry|enter|entered|@|at\s+\d|from\s+\d|bought at|sold at|filled/i.test(lower);
    const hasStop     = /\bstop\b|sl\b|stoploss|stop.loss|stop price/i.test(lower);
    const hasRisk     = /\brisk\b|risking|\$\d+/i.test(lower);
    const hasSize     = /\blot|contract|unit|size|position\b/i.test(lower);
    const hasTP       = /take.?profit|tp\b|target/i.test(lower);
    const hasBalance  = /balance|account|reach|goal/i.test(lower);
    const hasStatus   = /status|guardian|safe|how am i|check|account health/i.test(lower);
    const hasCoach    = /coach|report|today|session|how did/i.test(lower);
    const hasBehavior = /revenge|emotional|behavior|overtrading|feeling/i.test(lower);
    const hasTpOpt    = /best tp|optimal tp|probability|what tp/i.test(lower);
    const hasSpec     = /point.?value|tick.?size|tick.?value|spec|specification|pip.?value|contract.?size|dollar.?per|notional|how much.*per.?point/i.test(lower)
                     || /\b(what is|what'?s|how much)\b.*\b(nq|es|mnq|mes|gc|mgc|cl|qm|si|zb|ym|mym|rty|m2k|gold|oil|silver)\b/i.test(lower);
    const hasDollarRisk = /\bmy risk\b|what.*risk|how much.*risk|dollar.*risk|risk.*dollar|risk.*on.*\d.*contract/i.test(lower);
    const isPayout    = /payout|eligible|eligib|consistent enough|consistency.check|payout.check/i.test(lower);
    const isStrategy  = /what should.*trade|best.*trade|my edge|best.*setup|top.*asset|what.*do i.*trade|my best/i.test(lower);
    const isBreakEven = /break.?even/i.test(lower);
    const isRRCalc    = /\b(rr|r:r|risk.?reward)\b/i.test(lower) && nums.length >= 2;

    // ── Direction ─────────────────────────────────────────────────
    const isShort = /\b(short|sell|shorting|selling|sold|bear)\b/i.test(lower);

    // ─────────────────────────────────────────────────────────────
    // A. INSTRUMENT SPEC QUERY
    // "what's the point value of NQ", "ES tick size", "NQ spec", "tell me about GC"
    // ─────────────────────────────────────────────────────────────
    if (hasSpec) {
        if (fSpec) {
            const tickVal   = fSpec.pointValue * fSpec.tickSize;
            const move10    = fSpec.pointValue * 10;
            const move50    = fSpec.pointValue * 50;
            return {
                content: `Contract specification for ${asset} — ${fSpec.label} on ${fSpec.exchange}:`,
                cards: [
                    { label: 'Point Value',       value: `$${fSpec.pointValue.toFixed(2)} / point / contract`, highlight: true },
                    { label: 'Tick Size',          value: `${fSpec.tickSize} points` },
                    { label: 'Tick Value',         value: `$${tickVal.toFixed(2)} per tick per contract` },
                    { label: 'Exchange',           value: fSpec.exchange },
                    { label: '10-Point Move',      value: `$${move10.toFixed(0)} per contract` },
                    { label: '50-Point Move',      value: `$${move50.toFixed(0)} per contract` },
                    { label: 'Quick Example',      value: `Stop 20pts × 1 contract = $${fSpec.pointValue * 20} risk`, highlight: true },
                ],
            };
        }
        if (/forex|pip|eurusd|gbpusd|fx/i.test(lower)) {
            return {
                content: 'Standard forex pip values — standard lot = 100,000 units:',
                cards: [
                    { label: 'Standard Lot (1.0)',  value: '$10 per pip (USD pairs)',   highlight: true },
                    { label: 'Mini Lot (0.1)',       value: '$1 per pip' },
                    { label: 'Micro Lot (0.01)',     value: '$0.10 per pip' },
                    { label: 'JPY Pairs',            value: '~$6.80 per pip (fluctuates)' },
                    { label: 'Quick Example',        value: '20-pip stop × 0.5 lots = $100 risk', highlight: true },
                    { label: 'Formula',              value: 'Risk = Pips × PipValue × Lots' },
                ],
            };
        }
        // Show all available futures specs
        return {
            content: 'All tracked futures contract specs:',
            cards: Object.entries(FUTURES_SPECS).map(([sym, s]) => ({
                label: `${sym} — ${s.label}`,
                value: `$${s.pointValue}/pt · tick $${(s.pointValue * s.tickSize).toFixed(2)} · ${s.exchange}`,
            })),
        };
    }

    // ─────────────────────────────────────────────────────────────
    // B. POSITION SIZE — stop expressed as distance in points/ticks/pips
    // "NQ at 21450, 30 point stop, $500 risk"
    // ─────────────────────────────────────────────────────────────
    if (hasStopDist && entry > 0) {
        const riskAmt = nums.find(n => n !== entry && n !== stopDistNum && n >= 10 && n <= maxRisk * 3) || maxRisk;

        if (assetType === 'futures' && fSpec) {
            const rawContracts = riskAmt / (stopDistNum * fSpec.pointValue);
            const contracts    = Math.max(1, Math.round(rawContracts));
            const actualRisk   = contracts * stopDistNum * fSpec.pointValue;
            const slPrice      = isShort ? entry + stopDistNum : entry - stopDistNum;
            const tp2R         = isShort ? entry - stopDistNum * 2 : entry + stopDistNum * 2;
            const tp3R         = isShort ? entry - stopDistNum * 3 : entry + stopDistNum * 3;
            const ticks        = stopDistNum / fSpec.tickSize;
            return {
                content: `${asset} (${fSpec.label}) — Entry: ${entry}, Stop: ${stopDistNum} pts (${ticks.toFixed(0)} ticks), Risk: $${riskAmt}:`,
                cards: [
                    { label: 'Contracts',         value: contracts.toString(),                                          highlight: true },
                    { label: 'Stop Loss Price',   value: slPrice.toFixed(2),                                           danger: true },
                    { label: 'Actual Risk',       value: `$${actualRisk.toFixed(0)}`,                                  danger: actualRisk > maxRisk },
                    { label: 'Risk / Contract',   value: `$${(stopDistNum * fSpec.pointValue).toFixed(0)}` },
                    { label: 'TP 2R',             value: tp2R.toFixed(2),                                              highlight: true },
                    { label: 'TP 3R',             value: tp3R.toFixed(2) },
                    { label: 'Ticks to Stop',     value: `${ticks.toFixed(0)} ticks @ $${(fSpec.pointValue * fSpec.tickSize).toFixed(2)}/tick` },
                    { label: 'Guardian',          value: actualRisk > maxRisk ? `Over limit! Reduce to 1 contract` : 'Within risk parameters', danger: actualRisk > maxRisk },
                ],
            };
        }

        if (assetType === 'forex') {
            const pipValue = 10; // per standard lot for USD-quoted pairs
            const lots     = Math.round((riskAmt / (stopDistNum * pipValue)) * 100) / 100;
            return {
                content: `Forex position for ${asset} — Entry: ${entry}, Stop: ${stopDistNum} pips, Risk: $${riskAmt}:`,
                cards: [
                    { label: 'Position Size',   value: `${lots} lots`,                                    highlight: true },
                    { label: 'Stop Pips',       value: `${stopDistNum} pips` },
                    { label: 'Pip Value',       value: `$${(lots * pipValue).toFixed(2)} per pip` },
                    { label: 'Actual Risk',     value: `$${(lots * stopDistNum * pipValue).toFixed(0)}` },
                    { label: 'TP 2R',           value: `${(stopDistNum * 2).toFixed(1)} pips from entry`,  highlight: true },
                ],
            };
        }

        // Crypto/stocks with $ stop distance
        const size = stopDistNum > 0 ? Math.round((riskAmt / stopDistNum) * 100) / 100 : 0;
        const tp2R = isShort ? entry - stopDistNum * 2 : entry + stopDistNum * 2;
        return {
            content: `${asset} position — Entry: ${entry}, Stop distance: $${stopDistNum}, Risk: $${riskAmt}:`,
            cards: [
                { label: 'Position Size', value: `${size} units`,                    highlight: true },
                { label: 'Stop Distance', value: `$${stopDistNum}` },
                { label: 'Risk',          value: `$${riskAmt}` },
                { label: 'TP 2R',         value: tp2R.toFixed(4),                    highlight: true },
                { label: 'TP 3R',         value: (isShort ? entry - stopDistNum * 3 : entry + stopDistNum * 3).toFixed(4) },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // C. DOLLAR RISK FROM KNOWN POSITION
    // "I have 2 NQ contracts, stop 30 points, what's my risk?"
    // ─────────────────────────────────────────────────────────────
    if ((hasKnownSize || hasDollarRisk) && knownSizeNum > 0 && (stopDistNum > 0 || second > 0)) {
        const stopPts = stopDistNum > 0 ? stopDistNum : second;

        if (assetType === 'futures' && fSpec) {
            const totalRisk       = knownSizeNum * stopPts * fSpec.pointValue;
            const riskPerContract = stopPts * fSpec.pointValue;
            const ticks           = stopPts / fSpec.tickSize;
            const tickVal         = fSpec.pointValue * fSpec.tickSize;
            return {
                content: `Dollar risk for ${knownSizeNum} ${asset} contract${knownSizeNum > 1 ? 's' : ''}, ${stopPts}-point stop:`,
                cards: [
                    { label: 'Total Risk',         value: `$${totalRisk.toFixed(0)}`,                             highlight: totalRisk <= maxRisk, danger: totalRisk > maxRisk },
                    { label: 'Risk / Contract',    value: `$${riskPerContract.toFixed(0)}` },
                    { label: 'Stop in Ticks',      value: `${ticks.toFixed(0)} ticks` },
                    { label: 'Tick Value',         value: `$${tickVal.toFixed(2)} / tick / contract` },
                    { label: 'Point Value',        value: `$${fSpec.pointValue} / point / contract` },
                    { label: 'vs Your Max Risk',   value: totalRisk > maxRisk ? `$${(totalRisk - maxRisk).toFixed(0)} OVER your limit` : `$${(maxRisk - totalRisk).toFixed(0)} under your limit`, danger: totalRisk > maxRisk },
                ],
            };
        }

        if (assetType === 'forex') {
            const pipValue  = 10;
            const totalRisk = knownSizeNum * stopPts * pipValue;
            return {
                content: `Dollar risk: ${knownSizeNum} lots ${asset}, ${stopPts} pip stop:`,
                cards: [
                    { label: 'Total Risk',   value: `$${totalRisk.toFixed(0)}`, highlight: totalRisk <= maxRisk, danger: totalRisk > maxRisk },
                    { label: 'Pip Value',    value: `$${(knownSizeNum * pipValue).toFixed(2)} per pip` },
                    { label: 'Stop Pips',   value: `${stopPts}` },
                ],
            };
        }

        const totalRisk = knownSizeNum * stopPts;
        return {
            content: `Dollar risk for ${knownSizeNum} units ${asset}, $${stopPts} stop distance:`,
            cards: [
                { label: 'Total Risk', value: `$${totalRisk.toFixed(0)}`, highlight: totalRisk <= maxRisk, danger: totalRisk > maxRisk },
                { label: 'Per Unit',   value: `$${stopPts} risk per unit` },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // D. PAYOUT ELIGIBILITY CHECK
    // "am I consistent enough for payout", "payout eligible"
    // ─────────────────────────────────────────────────────────────
    if (isPayout) {
        const c = analyzeConsistency(trades);
        return {
            content: `Tradeify payout consistency check — best single day must be ≤ 20% of total profit:`,
            cards: [
                { label: 'Payout Eligible',    value: c.payoutEligible ? 'YES — ELIGIBLE' : 'NOT YET',                    highlight: c.payoutEligible, danger: !c.payoutEligible },
                { label: 'Best Day Share',     value: `${c.bestDayPct.toFixed(1)}% of total profit`,                       danger: c.bestDayPct > 20 },
                { label: 'Best Day P&L',       value: `$${c.bestDay.toFixed(0)}` },
                { label: 'Consistency Score',  value: `${c.score}/100`,                                                    highlight: c.score >= 70 },
                { label: 'Profit Days',        value: `${c.profitDays}G / ${c.lossDays}R` },
                { label: 'Action',             value: c.payoutEligible ? 'You can submit a payout request' : `Need best day ≤ 20% of total. Currently ${c.bestDayPct.toFixed(1)}%`, danger: !c.payoutEligible },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // E. STRATEGY / EDGE QUERY
    // "what should I trade", "my best setup", "my edge"
    // ─────────────────────────────────────────────────────────────
    if (isStrategy) {
        const s = analyzeStrategy(trades);
        if (s.personalRulebook.length === 0) {
            return { content: 'Log at least 5 closed trades to generate your personal edge profile.', cards: [] };
        }
        return {
            content: `Your personal edge profile from ${trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').length} closed trades:`,
            cards: [
                { label: 'Top Asset',         value: s.topAsset,                                               highlight: true },
                { label: 'Worst Asset',        value: s.worstAsset,                                             danger: true },
                { label: 'Best Condition',     value: s.bestConditions[0]  || 'Keep logging',                   highlight: true },
                { label: 'Avoid',              value: s.worstConditions[0] || 'None detected',                  danger: !!s.worstConditions[0] },
                { label: 'Optimal R:R Floor',  value: `${s.optimalRRFloor}R minimum`,                           highlight: true },
                { label: 'AI Summary',         value: s.aiRulesSummary },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // F. BREAK-EVEN
    // "what's my break-even on NQ at 21450"
    // ─────────────────────────────────────────────────────────────
    if (isBreakEven && entry > 0) {
        const commRate = assetType === 'crypto' ? 0.0004 : 0;
        const commPerUnit = entry * commRate;
        const be = isShort ? entry - commPerUnit * 2 : entry + commPerUnit * 2;
        return {
            content: `Break-even for ${isShort ? 'SHORT' : 'LONG'} ${asset} at ${entry}:`,
            cards: [
                { label: 'Break-even Price',   value: commRate > 0 ? be.toFixed(4) : entry.toFixed(4), highlight: true },
                { label: 'Direction',          value: isShort ? 'SHORT — exit below entry to profit' : 'LONG — exit above entry to profit' },
                { label: 'Round-trip Fee',     value: commRate > 0 ? `~$${(commPerUnit * 2).toFixed(4)}/unit` : 'Flat per contract (futures)' },
                { label: 'Note',              value: 'Move stop to entry once 1R in profit to guarantee break-even.' },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // G. R:R CALCULATOR
    // "RR for NQ entry 21450 stop 21420 TP 21510"
    // ─────────────────────────────────────────────────────────────
    if (isRRCalc && entry > 0 && second > 0) {
        const sl = second;
        const tp = third > 0 ? third : 0;
        const risk   = Math.abs(entry - sl);
        const reward = tp > 0 ? Math.abs(tp - entry) : 0;
        const rr     = risk > 0 && reward > 0 ? reward / risk : 0;
        if (rr > 0) {
            return {
                content: `R:R for ${asset}: Entry ${entry}, SL ${sl}${tp > 0 ? `, TP ${tp}` : ''}:`,
                cards: [
                    { label: 'Risk : Reward',  value: `${rr.toFixed(2)}:1`,                                              highlight: rr >= 2, danger: rr < 1 },
                    { label: 'Risk Distance',  value: `${risk.toFixed(4)} ${fSpec ? 'points' : 'units'}` },
                    { label: 'Reward Distance', value: `${reward.toFixed(4)} ${fSpec ? 'points' : 'units'}` },
                    { label: 'Risk $',          value: fSpec ? `$${(risk * fSpec.pointValue).toFixed(0)}/contract` : `Depends on size` },
                    { label: 'Verdict',         value: rr >= 2 ? 'Quality setup — minimum 2R met' : rr >= 1.5 ? 'Acceptable — consider improving' : 'Poor R:R — skip or resize', highlight: rr >= 2, danger: rr < 1.5 },
                ],
            };
        }
    }

    // ─────────────────────────────────────────────────────────────
    // H. STATUS CHECK (existing, unchanged)
    // ─────────────────────────────────────────────────────────────
    if (hasStatus || (!hasEntry && !hasRisk && !hasTP && !hasStopDist && !hasKnownSize && nums.length === 0)) {
        const guardian = analyzeRiskGuardian(account, todayUsed);
        const beh      = analyzeBehavior(trades, maxRisk);
        return {
            content: `Live account status:`,
            cards: [
                { label: 'Daily Remaining',   value: `$${guardian.remainingDaily.toFixed(0)}`,  highlight: true },
                { label: 'Safe Risk / Trade', value: `$${guardian.safeRisk.toFixed(0)}`,        highlight: true },
                { label: 'Trades Left Today', value: `${guardian.maxTradesLeft}` },
                { label: 'Survival Status',   value: guardian.survivalStatus.toUpperCase(),      danger: guardian.survivalStatus !== 'safe' },
                { label: 'Emotional State',   value: beh.emotionalState.toUpperCase(),           danger: beh.emotionalState === 'revenge' || beh.emotionalState === 'stressed' },
                { label: 'Guardian',          value: guardian.recommendation },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // I. COACHING REPORT (existing)
    // ─────────────────────────────────────────────────────────────
    if (hasCoach) {
        const report = generateDailyReport(trades, account, todayUsed);
        return {
            content: `AI coaching report for today's session:`,
            cards: [
                { label: 'Trades Today',       value: `${report.trades}` },
                { label: 'Net Profit',         value: `${report.netProfit >= 0 ? '+' : ''}$${report.netProfit.toFixed(0)}`, highlight: report.netProfit > 0, danger: report.netProfit < 0 },
                { label: 'Discipline Grade',   value: report.disciplineGrade,                                               highlight: true },
                { label: 'Revenge Trades',     value: `${report.revengeTradesDetected}`,                                   danger: report.revengeTradesDetected > 0 },
                { label: 'Strength',           value: report.strengths[0] || 'Keep logging' },
                { label: 'Tomorrow Focus',     value: report.tomorrowFocus },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // J. BEHAVIORAL ANALYSIS (existing)
    // ─────────────────────────────────────────────────────────────
    if (hasBehavior) {
        const beh = analyzeBehavior(trades, maxRisk);
        return {
            content: `Behavioral analysis:`,
            cards: [
                { label: 'Emotional State',     value: beh.emotionalState.toUpperCase(),                                              danger: beh.emotionalState !== 'disciplined' },
                { label: 'Consecutive Losses',  value: `${beh.consecutiveLosses}`,                                                    danger: beh.consecutiveLosses >= 2 },
                { label: 'Revenge Risk',        value: beh.revengeRisk ? `YES (+${beh.revengePct.toFixed(0)}% size after loss)` : 'None detected', danger: beh.revengeRisk },
                { label: 'Trades Today',        value: `${beh.tradesThisSession}`,                                                    danger: beh.overtradingAlert },
                { label: 'Recommendation',      value: beh.recommendation },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // K. TP OPTIMIZER (existing)
    // ─────────────────────────────────────────────────────────────
    if (hasTpOpt && entry > 0 && second > 0) {
        const wins  = trades.filter(t => t.outcome === 'win').length;
        const total = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').length;
        const wr    = total > 0 ? wins / total : 0.5;
        const result = optimizeTakeProfit({ entry, stopLoss: second, riskUSD: third || maxRisk, historicalWinRate: wr });
        const best   = result.tiers.find(t => t.tp === result.recommendedTP);
        return {
            content: `TP Optimizer for ${asset} @ ${entry} (SL: ${second}):`,
            cards: [
                { label: 'Recommended TP',      value: result.recommendedTP.toFixed(4), highlight: true },
                { label: 'Recommended R:R',     value: `${result.recommendedRR}R`,      highlight: true },
                { label: 'Hit Probability',     value: `~${best?.estimatedProbability || 50}%` },
                { label: 'Expected Value',      value: `$${best?.expectedValue.toFixed(0) || 0}/trade` },
                { label: 'Based On Win Rate',   value: `${(wr * 100).toFixed(0)}% historical` },
                { label: 'Reasoning',           value: result.reasoning },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // L. POSITION SIZE — entry + stop PRICE + risk (all three given)
    // "SOL at 91.65 stop 90.48 risk $800"
    // ─────────────────────────────────────────────────────────────
    if (hasEntry && hasStop && hasRisk && entry > 0 && second > 0) {
        const riskAmt  = third || maxRisk;
        const stopLoss = second;
        const result   = calcSmartPositionSize({
            entry, stopLoss, riskUSD: riskAmt,
            assetType, symbol: asset,
            includeTradeifyFee: assetType === 'crypto',
        });
        const guardian = analyzeRiskGuardian(account, todayUsed, riskAmt);
        const tp2R     = isShort
            ? entry - Math.abs(entry - stopLoss) * 2
            : entry + Math.abs(entry - stopLoss) * 2;

        const cards: ChatCard[] = [
            { label: 'Position Size',       value: `${result.size.toLocaleString()} ${result.unit}`, highlight: true },
            { label: 'Risk Amount',         value: `$${result.riskUSD.toFixed(0)}` },
            { label: 'Stop Distance',       value: `${result.stopDistance.toFixed(4)} (${result.stopPct.toFixed(2)}%)` },
            { label: 'TP 2R',              value: tp2R.toFixed(4),                                  highlight: true },
            { label: 'TP 3R',              value: (isShort ? entry - result.stopDistance * 3 : entry + result.stopDistance * 3).toFixed(4) },
        ];
        if (assetType === 'futures' && fSpec) {
            cards.push({ label: 'Point Value', value: `$${fSpec.pointValue}/pt` });
            cards.push({ label: 'Notional',    value: `$${result.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
        } else {
            cards.push({ label: 'Notional',    value: `$${result.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}` });
        }
        if (assetType === 'crypto') {
            cards.push({ label: 'Commission (0.04%)', value: `$${result.comm.toFixed(2)}` });
        }
        cards.push({ label: 'Guardian',      value: guardian.tradeWarning || 'Clear to trade', danger: !!guardian.tradeWarning });
        return { content: `Position sizing for ${isShort ? 'SHORT' : 'LONG'} ${asset} — Entry: ${entry}, SL: ${stopLoss}, Risk: $${riskAmt}:`, cards };
    }

    // ─────────────────────────────────────────────────────────────
    // M. STOP LOSS from size + risk (reverse solve)
    // ─────────────────────────────────────────────────────────────
    if (hasSize && hasRisk && entry > 0 && second > 0 && !hasStop) {
        const size    = second;
        const riskAmt = third || maxRisk;
        let   move    = 0;
        if (assetType === 'futures' && fSpec) {
            move = riskAmt / (size * fSpec.pointValue);
        } else if (assetType === 'forex') {
            move = riskAmt / (size * 100000);
        } else {
            move = size > 0 ? riskAmt / size : 0;
        }
        const sl  = isShort ? entry + move : entry - move;
        const tp2R = isShort ? entry - move * 2 : entry + move * 2;
        return {
            content: `Stop Loss for ${isShort ? 'SHORT' : 'LONG'} ${asset} — Entry: ${entry}, Size: ${size} ${fSpec ? 'contracts' : 'units'}, Risk: $${riskAmt}:`,
            cards: [
                { label: 'Stop Loss Price',   value: sl.toFixed(4),                       danger: true },
                { label: 'Stop Distance',     value: `${move.toFixed(4)} ${fSpec ? 'points' : 'units'}` },
                { label: 'Risk',             value: `$${riskAmt.toFixed(0)}` },
                { label: 'TP 2R',            value: tp2R.toFixed(4),                      highlight: true },
                { label: 'Stop %',           value: `${((move / entry) * 100).toFixed(2)}%` },
                ...(fSpec ? [{ label: 'Point Value', value: `$${fSpec.pointValue}/point` }] : []),
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // N. BALANCE TARGET TP (reverse solve for target balance)
    // ─────────────────────────────────────────────────────────────
    if (hasBalance && hasTP && entry > 0 && second > 0) {
        const targetBal  = nums.find(n => n > balance * 0.9 && n > balance) || second;
        const size       = nums.find(n => n < entry * 100 && n !== entry && n !== targetBal) || 1;
        const sl         = second < entry ? second : entry - (entry * 0.01);
        const result     = calcProfitTarget({ entry, stopLoss: sl, size, targetBalance: targetBal, currentBalance: balance });
        return {
            content: `To reach $${targetBal.toLocaleString()} with ${size} ${asset}:`,
            cards: [
                { label: 'Required Take Profit', value: result.requiredTP.toFixed(4), highlight: true },
                { label: 'Profit Needed',        value: `$${result.expectedProfit.toFixed(0)}`, highlight: true },
                { label: 'R:R Ratio',            value: `${result.rr.toFixed(2)}R` },
                { label: 'Position Value',       value: `$${result.positionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
                { label: 'Note',                value: assetType === 'futures' ? 'Futures: multiply profit by point value for accuracy.' : 'Spot P&L = (TP − entry) × size' },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // O. SIMPLE SIZE (entry only, 1% stop assumed)
    // ─────────────────────────────────────────────────────────────
    if (hasSize && entry > 0) {
        const riskAmt = second || maxRisk;
        if (assetType === 'futures' && fSpec) {
            const assumedStopPts = fSpec.tickSize * 20; // 20 ticks default
            const contracts = Math.max(1, Math.round(riskAmt / (assumedStopPts * fSpec.pointValue)));
            return {
                content: `Estimated ${asset} position (20-tick stop assumed):`,
                cards: [
                    { label: 'Contracts',    value: contracts.toString(),                           highlight: true },
                    { label: 'Stop Assumed', value: `${assumedStopPts} pts (20 ticks)`,            danger: true },
                    { label: 'Risk',         value: `$${(contracts * assumedStopPts * fSpec.pointValue).toFixed(0)}` },
                    { label: 'Point Value',  value: `$${fSpec.pointValue}/pt — provide entry + stop for exact sizing` },
                ],
            };
        }
        const stopPct = 0.01;
        const sl      = entry * (1 - stopPct);
        const result  = calcSmartPositionSize({ entry, stopLoss: sl, riskUSD: riskAmt, assetType, symbol: asset });
        return {
            content: `Estimated position for ${asset} @ ${entry} with $${riskAmt} risk (1% stop assumed):`,
            cards: [
                { label: 'Recommended Size', value: `${result.size.toLocaleString()} ${result.unit}`, highlight: true },
                { label: 'Risk',            value: `$${result.riskUSD.toFixed(0)}` },
                { label: 'Stop Loss (1%)',  value: sl.toFixed(4),                                     danger: true },
                { label: 'TP 2R',           value: result.tp2R.toFixed(4),                            highlight: true },
            ],
        };
    }

    // ─────────────────────────────────────────────────────────────
    // P. FALLBACK
    // ─────────────────────────────────────────────────────────────
    return {
        content: `I understand you're asking about risk. Here's what I can calculate:\n\n· "NQ at 21450, 30 point stop, $500 risk" — position size\n· "2 NQ contracts, stop 20 points — what's my risk?" — dollar risk\n· "NQ spec" or "point value of GC" — instrument details\n· "What's my status?" — account health\n· "Coach me on today's session" — coaching report\n· "Am I consistent enough for payout?" — payout check\n· "What should I trade?" — personal edge profile`,
        cards: [],
    };
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

    const [messages, setMessages] = useState<ChatMessage[]>([{
        id: 'welcome',
        role: 'assistant',
        content: `I'm your AI Risk Coach. I understand natural language for any trading question:\n\n· Position sizing with point/tick/pip stops\n· Dollar risk from your actual position\n· Instrument specs (point value, tick size)\n· Payout eligibility, behavioral analysis, strategy edge\n\nTry: "NQ at 21450, 30 point stop, $500 risk"`,
        cards: [],
        timestamp: new Date(),
    }]);
    const [input, setInput]       = useState('');
    const [loading, setLoading]   = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const balance    = account.balance;
    const maxRisk    = (balance * account.maxRiskPercent) / 100;
    const dailyLimit = account.dailyLossLimit;
    const todayUsed  = dailyLimit - getDailyRiskRemaining();
    const dailyLeft  = Math.max(0, dailyLimit - todayUsed);
    const dailyLeftPct = dailyLimit > 0 ? dailyLeft / dailyLimit : 1;
    const dailyColor = dailyLeftPct > 0.5 ? '#A6FF4D' : dailyLeftPct > 0.25 ? '#EAB308' : '#ff4757';

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

            {/* ── CONTEXT STRIP ───────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', borderBottom: divider, flexShrink: 0 }}>
                {([
                    { icon: <ShieldCheck size={9} color={dailyColor} />, lbl: 'Daily Left',  val: `$${dailyLeft.toFixed(0)}`,  clr: dailyColor,   sub: `${Math.round(dailyLeftPct * 100)}% of limit` },
                    { icon: <Zap size={9} color="#4b5563" />,            lbl: 'Safe Risk',   val: `$${maxRisk.toFixed(0)}`,    clr: '#e2e8f0',    sub: `${account.maxRiskPercent}% per trade` },
                    { icon: <Activity size={9} color="#4b5563" />,       lbl: 'Balance',     val: balance >= 1000 ? `$${(balance / 1000).toFixed(1)}K` : `$${balance.toFixed(0)}`, clr: '#e2e8f0', sub: 'account equity' },
                    { icon: null,                                         lbl: 'Today',       val: todayTrades.length.toString(), clr: todayPnl >= 0 ? '#A6FF4D' : '#ff4757', sub: todayTrades.length > 0 ? `${todayPnl >= 0 ? '+' : ''}$${todayPnl.toFixed(0)} P&L` : 'no trades yet' },
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
                                    gap: 10, borderBottom: divider, alignItems: 'flex-start',
                                }}
                            >
                                {!isUser && (
                                    <div style={{ width: 22, height: 22, flexShrink: 0, marginTop: 2, background: 'rgba(166,255,77,0.07)', border: '1px solid rgba(166,255,77,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Brain size={11} color="#A6FF4D" />
                                    </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: isUser ? (isMobile ? '85%' : '72%') : '100%', flex: isUser ? 'unset' : 1 }}>
                                    <span style={{ ...lbl, display: 'block', textAlign: isUser ? 'right' : 'left' }}>
                                        {isUser ? 'You' : 'AI Coach'}
                                    </span>
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
                                                    <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: card.highlight ? '#A6FF4D' : card.danger ? '#ff4757' : '#e2e8f0', textAlign: 'right', maxWidth: '65%', wordBreak: 'break-all' }}>{card.value}</span>
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
                            style={{ padding: isMobile ? '10px 14px' : '12px 20px', display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: divider }}>
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
            <div className={styles.suggestions} style={{ borderTop: divider, padding: isMobile ? '7px 14px' : '8px 20px', display: 'flex', gap: 6, flexShrink: 0, background: '#0a0a0a' }}>
                {SUGGESTIONS.map((s) => (
                    <button key={s.text} onClick={() => handleSend(s.text)}
                        style={{ ...mono, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'transparent', border: '1px solid #1a1c24', cursor: 'pointer', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(166,255,77,0.3)'; e.currentTarget.style.color = '#A6FF4D'; e.currentTarget.style.background = 'rgba(166,255,77,0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1c24'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                    >
                        <span style={{ fontSize: 11 }}>{s.icon}</span>{s.text}
                    </button>
                ))}
            </div>

            {/* ── INPUT BAR ───────────────────────────────────── */}
            <div style={{ borderTop: `1px solid ${input.trim() ? 'rgba(166,255,77,0.2)' : '#1a1c24'}`, display: 'flex', alignItems: 'center', padding: isMobile ? '10px 14px' : '12px 20px', gap: 12, flexShrink: 0, background: '#090909', transition: 'border-color 0.2s' }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={isMobile ? 'NQ at 21450, 30 pt stop, $500 risk...' : 'Try: "NQ at 21450, 30 point stop, $500 risk" or "2 NQ contracts, stop 20 points — my risk?"'}
                    autoComplete="off"
                    style={{ ...mono, flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: '#e2e8f0', lineHeight: 1.5 }}
                />
                <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                    style={{ width: 34, height: 34, flexShrink: 0, background: input.trim() ? '#A6FF4D' : '#0d1117', border: `1px solid ${input.trim() ? '#A6FF4D' : '#1a1c24'}`, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: input.trim() ? '0 0 14px rgba(166,255,77,0.22)' : 'none' }}
                >
                    <Send size={14} color={input.trim() ? '#000' : '#2d3748'} />
                </button>
            </div>
        </div>
    );
}
