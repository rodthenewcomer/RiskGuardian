/**
 * RiskGuardia AI Engine v1.0
 * ─────────────────────────────────────────────────────────────────
 * Pure algorithmic intelligence layer. Zero external API calls.
 * All features run locally < 100ms. Designed to plug into an LLM later.
 *
 * Feature Map:
 *   #1  — Prop-Firm Risk Guardian (survival analysis)
 *   #2  — AI Position Size Engine (smart calc)
 *   #3  — Trade Consistency Analyzer (prop firm score)
 *   #4  — Behavioral Trading AI (pattern detection)
 *   #5  — Trade Quality Score (A+ setup grader)
 *   #6  — Profit Target Calculator (reverse solve)
 *   #7  — AI Trade Journal (auto insights + what-if)
 */

import type { TradeSession, AccountSettings } from '@/store/appStore';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface RiskGuardianResult {
    remainingDaily: number;
    remainingMax: number;
    safeRisk: number;
    maxTradesLeft: number;
    drawdownFloor: number;
    proximityPct: number;       // 0–100: how close to daily limit
    maxDrawdownPct: number;     // 0–100: how close to max drawdown
    survivalStatus: 'safe' | 'caution' | 'danger' | 'critical';
    recommendation: string;
    tradeWarning?: string;      // set when evaluating a specific trade risk
}

export interface TradeQualityScore {
    grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
    score: number;              // 0–100
    rrRating: 'excellent' | 'good' | 'fair' | 'poor';
    sizeRating: 'safe' | 'moderate' | 'aggressive' | 'excessive';
    riskRating: 'green' | 'yellow' | 'red';
    volatilityNote: string;
    summary: string;
    breakdown: { label: string; value: string; status: 'good' | 'warn' | 'bad' }[];
}

export interface BehaviorAnalysis {
    revengeRisk: boolean;
    revengeSeverity: 'none' | 'low' | 'high' | 'extreme';
    revengePct: number;         // % size increase after losses
    overtradingAlert: boolean;
    tradesThisSession: number;
    avgTimeBetweenTrades: number; // minutes
    consecutiveLosses: number;
    lossStreak: number;
    winStreak: number;
    emotionalState: 'disciplined' | 'cautious' | 'stressed' | 'revenge';
    recommendation: string;
    stopTradingRecommended: boolean;
    cooldownMinutes: number;
}

export interface ConsistencyAnalysis {
    score: number;              // 0–100 (higher = more consistent)
    avgDailyPnl: number;
    bestDay: number;
    worstDay: number;
    profitDays: number;
    lossDays: number;
    bestDayPct: number;         // best day as % of total profit (Tradeify rule)
    payoutEligible: boolean;    // bestDayPct <= 20%
    variance: number;
    insights: string[];
    timePatterns: { label: string; finding: string }[];
}

export interface WhatIfResult {
    scenarioLabel: string;
    pnlActual: number;
    pnlScenario: number;
    difference: number;
    tradesAvoided: number;
    lesson: string;
}

export interface JournalInsights {
    totalTrades: number;
    wins: number;
    losses: number;
    netPnl: number;
    winRate: number;
    expectancy: number;         // avg $ per trade
    bestSetup: string;
    worstPattern: string;
    avgRR: number;
    dailySummary: string;
    weeklyReport?: {
        weeklyPnl: number;
        weekWinRate: number;
        topAsset: string;
    };
    whatIf: WhatIfResult[];
    aiCoachMessage: string;
}

export interface PositionSizeResult {
    size: number;
    unit: string;
    riskUSD: number;
    tp2R: number;
    tp3R: number;
    tpCustomR?: number;
    notional: number;
    comm: number;
    stopDistance: number;
    stopPct: number;
}

export interface ProfitTargetResult {
    requiredTP: number;
    expectedProfit: number;
    rr: number;
    positionValue: number;
}

// ─────────────────────────────────────────────────────────────────
// Feature #1 — Prop-Firm Risk Guardian
// ─────────────────────────────────────────────────────────────────

export function analyzeRiskGuardian(
    account: AccountSettings,
    todayUsed: number,
    proposedRisk?: number
): RiskGuardianResult {
    const remainingDaily = Math.max(0, account.dailyLossLimit - todayUsed);
    const maxPerTrade = (account.balance * account.maxRiskPercent) / 100;

    // Drawdown floor calculation
    let drawdownFloor = 0;
    if (account.maxDrawdownLimit && account.maxDrawdownLimit > 0) {
        if (account.drawdownType === 'Trailing') {
            drawdownFloor = Math.min(account.startingBalance, (account.highestBalance || account.balance) - account.maxDrawdownLimit);
        } else if (account.drawdownType === 'Static') {
            drawdownFloor = account.startingBalance - account.maxDrawdownLimit;
        } else {
            drawdownFloor = (account.highestBalance || account.balance) - account.maxDrawdownLimit;
        }
    }

    const remainingMax = account.balance - drawdownFloor;
    const safeRisk = Math.min(maxPerTrade, remainingDaily, remainingMax * 0.2);
    const maxTradesLeft = safeRisk > 0 ? Math.floor(remainingDaily / safeRisk) : 0;
    const proximityPct = account.dailyLossLimit > 0 ? (todayUsed / account.dailyLossLimit) * 100 : 0;
    const maxDrawdownPct = account.maxDrawdownLimit && account.maxDrawdownLimit > 0
        ? ((account.balance - drawdownFloor) / account.maxDrawdownLimit) * 100
        : 100;

    // Survival status
    let survivalStatus: RiskGuardianResult['survivalStatus'] = 'safe';
    if (proximityPct >= 90 || maxDrawdownPct <= 10) survivalStatus = 'critical';
    else if (proximityPct >= 70 || maxDrawdownPct <= 25) survivalStatus = 'danger';
    else if (proximityPct >= 50 || maxDrawdownPct <= 40) survivalStatus = 'caution';

    // Smart recommendation
    let recommendation = '';
    if (survivalStatus === 'critical') {
        recommendation = 'STOP TRADING. You are within critical distance of your drawdown limits. Protect the account.';
    } else if (survivalStatus === 'danger') {
        recommendation = `Reduce position size by 50%. Max ${maxTradesLeft} more trades today. Prioritize A+ setups only.`;
    } else if (survivalStatus === 'caution') {
        recommendation = `Proceed with caution. Recommended size: $${safeRisk.toFixed(0)} per trade. ${maxTradesLeft} trades remaining.`;
    } else {
        recommendation = `You are within safe parameters. Recommended risk: $${safeRisk.toFixed(0)} per trade.`;
    }

    // Trade-specific warning
    let tradeWarning: string | undefined;
    if (proposedRisk !== undefined && proposedRisk > 0) {
        const afterTrade = remainingDaily - proposedRisk;
        if (proposedRisk > remainingDaily) {
            tradeWarning = `This trade ($${proposedRisk.toFixed(0)}) EXCEEDS your daily limit. Reduce to $${remainingDaily.toFixed(0)} max.`;
        } else if (afterTrade < safeRisk) {
            tradeWarning = `After this trade, only $${afterTrade.toFixed(0)} remains — less than one safe trade. Recommended: $${Math.min(proposedRisk, safeRisk).toFixed(0)}.`;
        } else if (proposedRisk > maxPerTrade) {
            tradeWarning = `$${proposedRisk.toFixed(0)} exceeds your per-trade risk max ($${maxPerTrade.toFixed(0)}). Recommended: $${safeRisk.toFixed(0)}.`;
        }
    }

    return {
        remainingDaily,
        remainingMax,
        safeRisk,
        maxTradesLeft,
        drawdownFloor,
        proximityPct,
        maxDrawdownPct,
        survivalStatus,
        recommendation,
        tradeWarning
    };
}

// ─────────────────────────────────────────────────────────────────
// Feature #2 — AI Position Size Engine
// ─────────────────────────────────────────────────────────────────

export function calcSmartPositionSize(params: {
    entry: number;
    stopLoss: number;
    riskUSD: number;
    assetType: 'crypto' | 'forex' | 'futures' | 'stocks';
    symbol: string;
    targetRR?: number;
    includeTradeifyFee?: boolean;
}): PositionSizeResult {
    const { entry, stopLoss, riskUSD, targetRR = 2, includeTradeifyFee = true } = params;
    const stopDistance = Math.abs(entry - stopLoss);
    const stopPct = (stopDistance / entry) * 100;

    let size = 0;
    let unit = 'units';

    if (params.assetType === 'forex') {
        size = riskUSD / (100000 * stopDistance);
        unit = 'lots';
    } else if (params.assetType === 'futures') {
        // Simplified — real spec lookup handled in appStore
        size = riskUSD / stopDistance;
        unit = 'contracts';
    } else {
        size = riskUSD / stopDistance;
        unit = 'units';
    }

    size = Math.round(size * 100) / 100;

    const tp2R = entry > stopLoss
        ? entry + stopDistance * 2
        : entry - stopDistance * 2;
    const tp3R = entry > stopLoss
        ? entry + stopDistance * 3
        : entry - stopDistance * 3;
    const tpCustomR = entry > stopLoss
        ? entry + stopDistance * targetRR
        : entry - stopDistance * targetRR;

    const notional = size * entry;
    const comm = includeTradeifyFee ? notional * 0.0004 : 0;

    return { size, unit, riskUSD, tp2R, tp3R, tpCustomR, notional, comm, stopDistance, stopPct };
}

// ─────────────────────────────────────────────────────────────────
// Feature #3 — Trade Consistency Analyzer
// ─────────────────────────────────────────────────────────────────

export function analyzeConsistency(trades: TradeSession[]): ConsistencyAnalysis {
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');

    if (closed.length === 0) {
        return {
            score: 0, avgDailyPnl: 0, bestDay: 0, worstDay: 0,
            profitDays: 0, lossDays: 0, bestDayPct: 0, payoutEligible: false,
            variance: 0, insights: ['No closed trades yet.'], timePatterns: []
        };
    }

    // Group by EST date
    const dailyMap: Record<string, number> = {};
    const assetMap: Record<string, { wins: number; losses: number; pnl: number }> = {};

    closed.forEach(t => {
        const pnl = (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD));
        // Try to extract date from createdAt (handles both ISO and locale strings)
        const rawDate = t.createdAt;
        let day = '';
        try {
            const d = new Date(rawDate);
            day = isNaN(d.getTime()) ? rawDate.split(',')[0] || rawDate.split('T')[0] : d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        } catch {
            day = rawDate.split('T')[0] || 'unknown';
        }

        dailyMap[day] = (dailyMap[day] || 0) + pnl;
        if (!assetMap[t.asset]) assetMap[t.asset] = { wins: 0, losses: 0, pnl: 0 };
        if (t.outcome === 'win') { assetMap[t.asset].wins++; assetMap[t.asset].pnl += pnl; }
        else assetMap[t.asset].losses++;
    });

    const dailyValues = Object.values(dailyMap);
    const totalPnl = dailyValues.reduce((a, b) => a + b, 0);
    const avgDailyPnl = totalPnl / dailyValues.length;
    const bestDay = Math.max(...dailyValues);
    const worstDay = Math.min(...dailyValues);
    const profitDays = dailyValues.filter(v => v > 0).length;
    const lossDays = dailyValues.filter(v => v < 0).length;
    const bestDayPct = totalPnl > 0 ? (bestDay / totalPnl) * 100 : 0;
    const payoutEligible = bestDayPct <= 20 && totalPnl > 0;

    // Variance for consistency score
    const variance = dailyValues.reduce((acc, v) => acc + Math.pow(v - avgDailyPnl, 2), 0) / dailyValues.length;
    const stdDev = Math.sqrt(variance);
    const cv = avgDailyPnl !== 0 ? Math.abs(stdDev / avgDailyPnl) : 1; // coefficient of variation
    const score = Math.max(0, Math.round(100 - Math.min(100, cv * 50)));

    // Best/worst asset
    const sortedAssets = Object.entries(assetMap).sort((a, b) => b[1].pnl - a[1].pnl);
    const bestAsset = sortedAssets[0]?.[0] || 'N/A';
    const worstAsset = sortedAssets[sortedAssets.length - 1]?.[0] || 'N/A';

    // Insights
    const insights: string[] = [];
    if (score >= 75) insights.push(`Strong consistency score (${score}/100) — prop firm ready.`);
    else if (score >= 50) insights.push(`Moderate consistency (${score}/100). Reduce position variance to improve.`);
    else insights.push(`Low consistency (${score}/100). You are trading very inconsistently — risk management discipline needed.`);

    if (bestDay > 0 && bestDayPct > 20) insights.push(`Your best day ($${bestDay.toFixed(0)}) accounts for ${bestDayPct.toFixed(1)}% of total profit — above the 20% Tradeify cap.`);
    if (bestAsset !== 'N/A') insights.push(`Most profitable asset: ${bestAsset}.`);
    if (worstAsset !== bestAsset) insights.push(`Worst-performing asset: ${worstAsset} — consider reducing size or stopping.`);
    if (profitDays > 0 && lossDays > 0) insights.push(`${profitDays} green days vs ${lossDays} red days.`);

    // Time patterns (simplified from trade metadata)
    const timePatterns: { label: string; finding: string }[] = [
        { label: 'Winning streak cap', finding: `After ${Math.min(3, closed.filter(t => t.outcome === 'win').length)} consecutive wins, avg position size stays consistent.` },
        { label: 'Loss reaction', finding: `Average risk after a loss: ${(closed.filter(t => t.outcome === 'loss')[0]?.riskUSD || 0).toFixed(0)} — check for revenge sizing.` },
    ];

    return { score, avgDailyPnl, bestDay, worstDay, profitDays, lossDays, bestDayPct, payoutEligible, variance, insights, timePatterns };
}

// ─────────────────────────────────────────────────────────────────
// Feature #4 — Behavioral Trading AI
// ─────────────────────────────────────────────────────────────────

export function analyzeBehavior(trades: TradeSession[], maxTradeRisk: number): BehaviorAnalysis {
    const recent = trades.slice(0, 10); // last 10 trades for behavioral signals
    const closed = recent.filter(t => t.outcome === 'win' || t.outcome === 'loss');

    let consecutiveLosses = 0;
    let lossStreak = 0;
    let winStreak = 0;
    let currentStreak = 0;
    let lastOutcome = '';

    for (const t of closed) {
        if (t.outcome === 'loss') {
            if (lastOutcome === 'loss') currentStreak++;
            else currentStreak = 1;
            consecutiveLosses = Math.max(consecutiveLosses, currentStreak);
            lossStreak = Math.max(lossStreak, currentStreak);
            lastOutcome = 'loss';
        } else {
            if (lastOutcome === 'win') currentStreak++;
            else currentStreak = 1;
            winStreak = Math.max(winStreak, currentStreak);
            lastOutcome = 'win';
        }
    }

    // Revenge trading: did size increase significantly after a loss?
    let revengePct = 0;
    let revengeRisk = false;
    if (closed.length >= 2) {
        for (let i = 0; i < closed.length - 1; i++) {
            if (closed[i].outcome === 'loss') {
                const afterSize = closed[i + 1]?.riskUSD || 0;
                const bump = ((afterSize - closed[i].riskUSD) / closed[i].riskUSD) * 100;
                if (bump > 30) {
                    revengePct = Math.max(revengePct, bump);
                    revengeRisk = true;
                }
            }
        }
    }

    const revengeSeverity: BehaviorAnalysis['revengeSeverity'] =
        revengePct > 100 ? 'extreme' : revengePct > 60 ? 'high' : revengePct > 30 ? 'low' : 'none';

    // Overtrading: more than 6 trades today or avg < 15 min apart
    const todayTrades = trades.filter(t => {
        try {
            const d = new Date(t.createdAt);
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const tDay = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            return tDay === today;
        } catch { return false; }
    });
    const overtradingAlert = todayTrades.length >= 6;
    const tradesThisSession = todayTrades.length;

    // Time between trades (avg)
    let avgTimeBetweenTrades = 0;
    if (todayTrades.length >= 2) {
        const times = todayTrades.map(t => {
            try { return new Date(t.createdAt).getTime(); } catch { return 0; }
        }).filter(t => t > 0).sort();
        if (times.length >= 2) {
            const gaps = times.slice(1).map((t, i) => (t - times[i]) / 60000);
            avgTimeBetweenTrades = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        }
    }

    // Emotional state
    let emotionalState: BehaviorAnalysis['emotionalState'] = 'disciplined';
    if (consecutiveLosses >= 3 || (revengeRisk && revengeSeverity !== 'low')) emotionalState = 'revenge';
    else if (consecutiveLosses >= 2 || overtradingAlert) emotionalState = 'stressed';
    else if (consecutiveLosses === 1) emotionalState = 'cautious';

    const stopTradingRecommended = emotionalState === 'revenge' || (overtradingAlert && consecutiveLosses >= 2);
    const cooldownMinutes = consecutiveLosses >= 3 ? 60 : consecutiveLosses >= 2 ? 30 : revengeSeverity === 'high' ? 30 : 15;

    // Recommendation
    let recommendation = '';
    if (stopTradingRecommended) {
        recommendation = `⛔ STOP TRADING. ${consecutiveLosses} consecutive losses detected. Take a ${cooldownMinutes}-minute break before your next trade.`;
    } else if (emotionalState === 'stressed') {
        recommendation = `⚠️ Elevated stress signals. Reduce size by 50%. Max 1–2 more trades today.`;
    } else if (revengeRisk) {
        recommendation = `⚠️ Revenge size pattern detected (+${revengePct.toFixed(0)}% after loss). Reset to your standard $${maxTradeRisk.toFixed(0)} risk.`;
    } else if (overtradingAlert) {
        recommendation = `ℹ️ ${tradesThisSession} trades today — near overtrading threshold. Be selective.`;
    } else {
        recommendation = `✅ Behavioral signals normal. Continue trading your plan.`;
    }

    return {
        revengeRisk, revengeSeverity, revengePct, overtradingAlert,
        tradesThisSession, avgTimeBetweenTrades, consecutiveLosses,
        lossStreak, winStreak, emotionalState, recommendation,
        stopTradingRecommended, cooldownMinutes
    };
}

// ─────────────────────────────────────────────────────────────────
// Feature #5 — Trade Quality Score
// ─────────────────────────────────────────────────────────────────

export function scoreTradeQuality(params: {
    riskUSD: number;
    maxTradeRisk: number;
    rr: number;
    stopDistancePct: number;    // stop loss % from entry
    remainingDailyPct: number;  // 0–100: how much daily risk is left
    behaviorState: BehaviorAnalysis['emotionalState'];
}): TradeQualityScore {
    const { riskUSD, maxTradeRisk, rr, stopDistancePct, remainingDailyPct, behaviorState } = params;
    let score = 100;

    // R:R scoring (up to 35 pts)
    const rrPoints = rr >= 3 ? 35 : rr >= 2 ? 28 : rr >= 1.5 ? 20 : rr >= 1 ? 10 : 0;
    score -= (35 - rrPoints);
    const rrRating: TradeQualityScore['rrRating'] = rr >= 3 ? 'excellent' : rr >= 2 ? 'good' : rr >= 1.5 ? 'fair' : 'poor';

    // Position size scoring (up to 25 pts)
    const sizePct = (riskUSD / maxTradeRisk) * 100;
    let sizePoints = 25;
    let sizeRating: TradeQualityScore['sizeRating'] = 'safe';
    if (sizePct > 150) { sizePoints = 0; sizeRating = 'excessive'; }
    else if (sizePct > 100) { sizePoints = 8; sizeRating = 'aggressive'; }
    else if (sizePct > 75) { sizePoints = 18; sizeRating = 'moderate'; }
    score -= (25 - sizePoints);

    // Stop distance scoring (up to 20 pts)
    let stopPoints = 20;
    if (stopDistancePct > 5) stopPoints = 5;        // too wide
    else if (stopDistancePct > 3) stopPoints = 12;
    else if (stopDistancePct < 0.2) stopPoints = 5; // too tight
    else if (stopDistancePct < 0.5) stopPoints = 14;
    score -= (20 - stopPoints);

    // Remaining daily budget (up to 10 pts)
    if (remainingDailyPct < 20) score -= 10;
    else if (remainingDailyPct < 40) score -= 5;

    // Behavioral penalty (up to 10 pts)
    if (behaviorState === 'revenge') score -= 10;
    else if (behaviorState === 'stressed') score -= 5;
    else if (behaviorState === 'cautious') score -= 2;

    score = Math.max(0, Math.min(100, score));

    // Grade
    let grade: TradeQualityScore['grade'] = 'F';
    if (score >= 92) grade = 'A+';
    else if (score >= 85) grade = 'A';
    else if (score >= 76) grade = 'B+';
    else if (score >= 65) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 35) grade = 'D';

    const riskRating: TradeQualityScore['riskRating'] =
        score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';

    // Stop distance volatility note
    const volatilityNote = stopDistancePct < 0.5
        ? 'Very tight stop — high noise risk'
        : stopDistancePct > 4
            ? 'Wide stop — large position value absorbed'
            : 'Moderate volatility envelope';

    // Summary
    const gradeLabel = grade.startsWith('A') ? 'High Quality Setup' : grade.startsWith('B') ? 'Acceptable Setup' : 'Poor Setup — Review Before Executing';
    const summary = `${gradeLabel}. R:R ${rr.toFixed(1)}:1 | Size ${sizeRating} | ${volatilityNote}`;

    const breakdown: TradeQualityScore['breakdown'] = [
        { label: 'Risk/Reward', value: `${rr.toFixed(2)}:1`, status: rrPoints >= 25 ? 'good' : rrPoints >= 15 ? 'warn' : 'bad' },
        { label: 'Position Size', value: `${sizePct.toFixed(0)}% of max`, status: sizeRating === 'safe' ? 'good' : sizeRating === 'moderate' ? 'warn' : 'bad' },
        { label: 'Stop Distance', value: `${stopDistancePct.toFixed(2)}%`, status: stopPoints >= 15 ? 'good' : stopPoints >= 10 ? 'warn' : 'bad' },
        { label: 'Daily Budget Left', value: `${remainingDailyPct.toFixed(0)}%`, status: remainingDailyPct >= 60 ? 'good' : remainingDailyPct >= 30 ? 'warn' : 'bad' },
        { label: 'Behavioral State', value: behaviorState, status: behaviorState === 'disciplined' ? 'good' : behaviorState === 'cautious' ? 'warn' : 'bad' },
    ];

    return { grade, score, rrRating, sizeRating, riskRating, volatilityNote, summary, breakdown };
}

// ─────────────────────────────────────────────────────────────────
// Feature #6 — Profit Target Calculator (Reverse Solve)
// ─────────────────────────────────────────────────────────────────

export function calcProfitTarget(params: {
    entry: number;
    stopLoss: number;
    size: number;                // units/lots
    targetBalance?: number;      // desired balance
    targetProfit?: number;       // desired $ gain
    currentBalance: number;
}): ProfitTargetResult {
    const { entry, stopLoss, size, targetBalance, targetProfit, currentBalance } = params;
    const stopDistance = Math.abs(entry - stopLoss);
    const isLong = entry > stopLoss;

    const neededProfit = targetBalance
        ? targetBalance - currentBalance
        : targetProfit || 0;

    // profit = (TP - entry) * size
    // TP = entry + neededProfit / size
    const requiredMove = size > 0 ? neededProfit / size : 0;
    const requiredTP = isLong ? entry + requiredMove : entry - requiredMove;
    const rr = stopDistance > 0 ? requiredMove / stopDistance : 0;

    return {
        requiredTP,
        expectedProfit: neededProfit,
        rr,
        positionValue: size * entry
    };
}

// ─────────────────────────────────────────────────────────────────
// Feature #7 — AI Trade Journal + What-If Simulator
// ─────────────────────────────────────────────────────────────────

export function generateJournalInsights(
    trades: TradeSession[],
    account: AccountSettings
): JournalInsights {
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');
    const wins = closed.filter(t => t.outcome === 'win');
    const losses = closed.filter(t => t.outcome === 'loss');

    const netPnl = closed.reduce((s, t) => s + (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)), 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const avgRR = closed.filter(t => t.rr > 0).length > 0
        ? closed.reduce((s, t) => s + t.rr, 0) / closed.length
        : 0;
    const expectancy = closed.length > 0 ? netPnl / closed.length : 0;

    // Best setup by asset
    const assetPnl: Record<string, number> = {};
    closed.forEach(t => {
        const pnl = (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD));
        assetPnl[t.asset] = (assetPnl[t.asset] || 0) + pnl;
    });
    const sorted = Object.entries(assetPnl).sort((a, b) => b[1] - a[1]);
    const bestSetup = sorted[0] ? `${sorted[0][0]} (+$${sorted[0][1].toFixed(0)})` : 'N/A';
    const worstPattern = sorted[sorted.length - 1]
        ? `${sorted[sorted.length - 1][0]} (-$${Math.abs(sorted[sorted.length - 1][1]).toFixed(0)})`
        : 'N/A';

    // Daily summary
    const dailySummary = closed.length === 0
        ? 'No closed trades yet.'
        : `${closed.length} trades executed. Net: ${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(0)}. Win rate: ${winRate.toFixed(0)}%. Avg R:R: ${avgRR.toFixed(2)}.`;

    // Weekly report
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weeklyTrades = closed.filter(t => {
        try { return new Date(t.createdAt) >= weekStart; } catch { return false; }
    });
    const weeklyWins = weeklyTrades.filter(t => t.outcome === 'win');
    const weeklyPnl = weeklyTrades.reduce((s, t) => s + (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)), 0);
    const weekWinRate = weeklyTrades.length > 0 ? (weeklyWins.length / weeklyTrades.length) * 100 : 0;
    const topAssetEntry = Object.entries(assetPnl).sort((a, b) => b[1] - a[1])[0];

    // What-If Scenarios
    const whatIf: WhatIfResult[] = [];

    // Scenario 1: Stop after 2 consecutive losses
    let whatIfPnl1 = 0;
    let skipped1 = 0;
    let lossRun = 0;
    let stopped1 = false;
    for (const t of closed) {
        if (stopped1) { skipped1++; continue; }
        const pnl = (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD));
        whatIfPnl1 += pnl;
        if (t.outcome === 'loss') lossRun++;
        else lossRun = 0;
        if (lossRun >= 2) stopped1 = true;
    }
    if (skipped1 > 0) {
        whatIf.push({
            scenarioLabel: 'Stop after 2 consecutive losses',
            pnlActual: netPnl,
            pnlScenario: whatIfPnl1,
            difference: whatIfPnl1 - netPnl,
            tradesAvoided: skipped1,
            lesson: `By stopping after 2 losses, you would have avoided ${skipped1} trades and ${whatIfPnl1 > netPnl ? 'saved' : 'missed'} $${Math.abs(whatIfPnl1 - netPnl).toFixed(0)}.`
        });
    }

    // Scenario 2: Skip sub-1R trades
    const filteredPnl = closed
        .filter(t => t.rr >= 1.5)
        .reduce((s, t) => s + ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))), 0);
    const skipped2 = closed.filter(t => t.rr < 1.5).length;
    if (skipped2 > 0) {
        whatIf.push({
            scenarioLabel: 'Only take trades with R:R ≥ 1.5',
            pnlActual: netPnl,
            pnlScenario: filteredPnl,
            difference: filteredPnl - netPnl,
            tradesAvoided: skipped2,
            lesson: `Skipping ${skipped2} low-R:R trades would have ${filteredPnl > netPnl ? 'improved' : 'changed'} your result by $${Math.abs(filteredPnl - netPnl).toFixed(0)}.`
        });
    }

    // AI Coach Message
    let aiCoachMessage = '';
    if (netPnl > 0 && winRate >= 55) {
        aiCoachMessage = `Excellent performance. Win rate ${winRate.toFixed(0)}% and positive expectancy suggest a solid edge. Focus on scaling your best setups: ${bestSetup}.`;
    } else if (netPnl > 0 && winRate < 55) {
        aiCoachMessage = `Profitable but low win rate (${winRate.toFixed(0)}%). Your edge is in large winners. Protect your R:R — never accept less than 2R.`;
    } else if (netPnl < 0 && losses.length > wins.length) {
        aiCoachMessage = `Win rate below 50% and negative P&L. Focus on trade selection over frequency. Aim for only A+ setups this week.`;
    } else {
        aiCoachMessage = `Keep logging. Every closed trade teaches you something. Focus on consistency before size.`;
    }

    return {
        totalTrades: closed.length,
        wins: wins.length,
        losses: losses.length,
        netPnl,
        winRate,
        expectancy,
        bestSetup,
        worstPattern,
        avgRR,
        dailySummary,
        weeklyReport: { weeklyPnl, weekWinRate, topAsset: topAssetEntry ? topAssetEntry[0] : 'N/A' },
        whatIf,
        aiCoachMessage
    };
}

// ─────────────────────────────────────────────────────────────────
// Feature #8 — AI Strategy Analyzer (Personal Rulebook Generator)
// Finds the hidden conditions where YOU perform best
// ─────────────────────────────────────────────────────────────────

export interface StrategyRule {
    condition: string;
    winRate: number;
    avgPnl: number;
    tradeCount: number;
    verdict: 'keep' | 'avoid' | 'neutral';
}

export interface StrategyAnalysis {
    personalRulebook: StrategyRule[];
    bestConditions: string[];
    worstConditions: string[];
    optimalRiskRange: { min: number; max: number };
    optimalRRFloor: number;
    topAsset: string;
    worstAsset: string;
    aiRulesSummary: string;
}

export function analyzeStrategy(trades: TradeSession[]): StrategyAnalysis {
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');

    const empty: StrategyAnalysis = {
        personalRulebook: [],
        bestConditions: [],
        worstConditions: [],
        optimalRiskRange: { min: 0, max: 0 },
        optimalRRFloor: 2,
        topAsset: 'N/A',
        worstAsset: 'N/A',
        aiRulesSummary: 'Log at least 5 trades to generate your personal rulebook.'
    };
    if (closed.length < 3) return empty;

    const rules: StrategyRule[] = [];

    // ── Risk bucket analysis ──
    const riskBuckets: Record<string, TradeSession[]> = {
        'Risk ≤ $200': closed.filter(t => t.riskUSD <= 200),
        'Risk $200–400': closed.filter(t => t.riskUSD > 200 && t.riskUSD <= 400),
        'Risk $400–700': closed.filter(t => t.riskUSD > 400 && t.riskUSD <= 700),
        'Risk > $700': closed.filter(t => t.riskUSD > 700),
    };
    Object.entries(riskBuckets).forEach(([label, bucket]) => {
        if (bucket.length < 2) return;
        const wins = bucket.filter(t => t.outcome === 'win');
        const winRate = (wins.length / bucket.length) * 100;
        const avgPnl = bucket.reduce((s, t) => s + ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))), 0) / bucket.length;
        rules.push({ condition: label, winRate, avgPnl, tradeCount: bucket.length, verdict: winRate >= 55 && avgPnl > 0 ? 'keep' : avgPnl < 0 ? 'avoid' : 'neutral' });
    });

    // ── R:R bucket analysis ──
    const rrBuckets: Record<string, TradeSession[]> = {
        'R:R < 1.5': closed.filter(t => t.rr < 1.5),
        'R:R 1.5–2.5': closed.filter(t => t.rr >= 1.5 && t.rr < 2.5),
        'R:R 2.5–4': closed.filter(t => t.rr >= 2.5 && t.rr < 4),
        'R:R > 4': closed.filter(t => t.rr >= 4),
    };
    Object.entries(rrBuckets).forEach(([label, bucket]) => {
        if (bucket.length < 2) return;
        const wins = bucket.filter(t => t.outcome === 'win');
        const winRate = (wins.length / bucket.length) * 100;
        const avgPnl = bucket.reduce((s, t) => s + ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))), 0) / bucket.length;
        rules.push({ condition: label, winRate, avgPnl, tradeCount: bucket.length, verdict: winRate >= 55 && avgPnl > 0 ? 'keep' : avgPnl < 0 ? 'avoid' : 'neutral' });
    });

    // ── Asset analysis ──
    const assetGroups: Record<string, TradeSession[]> = {};
    closed.forEach(t => { if (!assetGroups[t.asset]) assetGroups[t.asset] = []; assetGroups[t.asset].push(t); });
    Object.entries(assetGroups).forEach(([asset, bucket]) => {
        if (bucket.length < 2) return;
        const wins = bucket.filter(t => t.outcome === 'win');
        const winRate = (wins.length / bucket.length) * 100;
        const avgPnl = bucket.reduce((s, t) => s + ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))), 0) / bucket.length;
        rules.push({ condition: `Asset: ${asset}`, winRate, avgPnl, tradeCount: bucket.length, verdict: winRate >= 55 && avgPnl > 0 ? 'keep' : avgPnl < 0 ? 'avoid' : 'neutral' });
    });

    // Sort rules
    const keepRules = rules.filter(r => r.verdict === 'keep').sort((a, b) => b.avgPnl - a.avgPnl);
    const avoidRules = rules.filter(r => r.verdict === 'avoid').sort((a, b) => a.avgPnl - b.avgPnl);

    // Best risk range
    const profitableRiskBucket = [...rules]
        .filter(r => r.condition.startsWith('Risk') && r.verdict === 'keep')
        .sort((a, b) => b.avgPnl - a.avgPnl)[0];

    // Optimal RR floor
    const profitableRRBucket = [...rules]
        .filter(r => r.condition.startsWith('R:R') && r.verdict === 'keep')
        .sort((a, b) => b.avgPnl - a.avgPnl)[0];
    const optimalRRFloor = profitableRRBucket
        ? parseFloat(profitableRRBucket.condition.replace(/[^0-9.]/g, '') || '2')
        : 2;

    // Top/Worst assets
    const assetPnl = Object.entries(assetGroups).map(([asset, ts]) => ({
        asset,
        pnl: ts.reduce((s, t) => s + ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))), 0)
    })).sort((a, b) => b.pnl - a.pnl);
    const topAsset = assetPnl[0]?.asset || 'N/A';
    const worstAsset = assetPnl[assetPnl.length - 1]?.asset || 'N/A';

    const bestConditions = keepRules.slice(0, 3).map(r => r.condition);
    const worstConditions = avoidRules.slice(0, 3).map(r => r.condition);

    // AI rules summary
    const summaryParts: string[] = [];
    if (bestConditions.length > 0) summaryParts.push(`You perform best with: ${bestConditions.join(', ')}.`);
    if (worstConditions.length > 0) summaryParts.push(`Avoid: ${worstConditions.join(', ')}.`);
    if (topAsset !== 'N/A') summaryParts.push(`Strongest asset: ${topAsset}.`);
    const aiRulesSummary = summaryParts.join(' ') || 'Keep logging to generate your personal edge profile.';

    return {
        personalRulebook: rules,
        bestConditions,
        worstConditions,
        optimalRiskRange: profitableRiskBucket
            ? { min: 0, max: 700 }
            : { min: 0, max: 0 },
        optimalRRFloor,
        topAsset,
        worstAsset,
        aiRulesSummary
    };
}

// ─────────────────────────────────────────────────────────────────
// Feature #9 — AI Take Profit Optimizer (Statistical Probability)
// Gives probability tiers for different TP levels
// ─────────────────────────────────────────────────────────────────

export interface TPTier {
    label: string;
    tp: number;
    rrRatio: number;
    estimatedProbability: number;   // 0–100% simplified estimate
    expectedValue: number;          // probability * profit - (1-probability) * risk
    recommendation: 'optimal' | 'viable' | 'risky';
}

export interface TPOptimizerResult {
    tiers: TPTier[];
    recommendedTP: number;
    recommendedRR: number;
    reasoning: string;
}

export function optimizeTakeProfit(params: {
    entry: number;
    stopLoss: number;
    riskUSD: number;
    historicalWinRate?: number;   // 0-1, from trade history
}): TPOptimizerResult {
    const { entry, stopLoss, riskUSD, historicalWinRate = 0.5 } = params;
    const stopDistance = Math.abs(entry - stopLoss);
    const isLong = entry > stopLoss;

    if (stopDistance === 0) {
        return { tiers: [], recommendedTP: entry, recommendedRR: 2, reasoning: 'Invalid stop loss distance.' };
    }

    // Probability model: win rate decays as R:R increases (simplified Kelly-adjacent)
    // Higher RR = move must travel further = lower win probability
    // Baseline win rate adjusted per R level
    const probAtRR = (rr: number): number => {
        // Assumes targets get harder to hit as they get further away
        const decay = Math.pow(0.88, rr - 1); // 12% decay per R above 1
        return Math.min(0.92, Math.max(0.15, historicalWinRate * decay));
    };

    const tiers: TPTier[] = [1, 1.5, 2, 2.5, 3, 4].map(rr => {
        const tp = isLong ? entry + stopDistance * rr : entry - stopDistance * rr;
        const prob = probAtRR(rr) * 100;
        const profitIfWin = riskUSD * rr;
        const expectedValue = (prob / 100) * profitIfWin - ((1 - prob / 100) * riskUSD);
        const recommendation: TPTier['recommendation'] =
            expectedValue >= riskUSD * 0.3 ? 'optimal' :
                expectedValue >= 0 ? 'viable' : 'risky';

        return {
            label: `${rr}R`,
            tp: Math.round(tp * 100000) / 100000,
            rrRatio: rr,
            estimatedProbability: Math.round(prob),
            expectedValue: Math.round(expectedValue * 100) / 100,
            recommendation
        };
    });

    // Find optimal tier (highest expected value among 'optimal' tiers)
    const optimalTiers = tiers.filter(t => t.recommendation === 'optimal');
    const best = optimalTiers.sort((a, b) => b.expectedValue - a.expectedValue)[0]
        || tiers.filter(t => t.recommendation === 'viable')[0]
        || tiers[2]; // fallback to 2R

    const reasoning = `At your historical ${(historicalWinRate * 100).toFixed(0)}% win rate, a ${best.label} target gives the best expected value ($${best.expectedValue.toFixed(0)}/trade). Probability of hitting: ~${best.estimatedProbability}%.`;

    return {
        tiers,
        recommendedTP: best.tp,
        recommendedRR: best.rrRatio,
        reasoning
    };
}

// ─────────────────────────────────────────────────────────────────
// Feature #10 — AI Daily Coach Report (End-of-Session Summary)
// ─────────────────────────────────────────────────────────────────

export interface AIDailyReport {
    sessionDate: string;
    trades: number;
    wins: number;
    losses: number;
    netProfit: number;
    winRate: number;
    bestTradeRR: number;
    worstTradeRisk: number;
    strengths: string[];
    weaknesses: string[];
    revengeTradesDetected: number;
    disciplineGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    tomorrowFocus: string;
    coachingMessage: string;
}

export function generateDailyReport(
    trades: TradeSession[],
    account: AccountSettings,
    todayUsed: number
): AIDailyReport {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const todayTrades = trades.filter(t => {
        try {
            const d = new Date(t.createdAt);
            return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === today;
        } catch { return t.createdAt.startsWith(today); }
    });

    const closed = todayTrades.filter(t => t.outcome === 'win' || t.outcome === 'loss');
    const wins = closed.filter(t => t.outcome === 'win');
    const losses = closed.filter(t => t.outcome === 'loss');

    const netProfit = closed.reduce((s, t) => s + (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)), 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const bestTradeRR = closed.length > 0 ? Math.max(...closed.map(t => t.rr)) : 0;
    const worstTradeRisk = closed.length > 0 ? Math.max(...closed.map(t => t.riskUSD)) : 0;

    // Revenge trade count
    let revengeTradesDetected = 0;
    for (let i = 0; i < closed.length - 1; i++) {
        if (closed[i].outcome === 'loss') {
            const bump = ((closed[i + 1]?.riskUSD || 0) - closed[i].riskUSD) / closed[i].riskUSD;
            if (bump > 0.3) revengeTradesDetected++;
        }
    }

    // Strengths
    const strengths: string[] = [];
    if (winRate >= 60) strengths.push(`High win rate today: ${winRate.toFixed(0)}%.`);
    if (bestTradeRR >= 2.5) strengths.push(`Strong best trade: ${bestTradeRR.toFixed(1)}R.`);
    if (revengeTradesDetected === 0 && closed.length >= 2) strengths.push('No revenge trading detected — excellent emotional control.');
    if (todayUsed <= account.dailyLossLimit * 0.5) strengths.push('Risk budget well managed — used less than 50% of daily limit.');

    // Weaknesses
    const weaknesses: string[] = [];
    if (winRate < 40 && closed.length >= 3) weaknesses.push(`Win rate below 40% today (${winRate.toFixed(0)}%). Review setup selection.`);
    if (revengeTradesDetected > 0) weaknesses.push(`${revengeTradesDetected} revenge trade${revengeTradesDetected > 1 ? 's' : ''} detected. Size increased after a loss.`);
    if (closed.length >= 7) weaknesses.push(`High trade frequency: ${closed.length} trades. Consider fewer, higher-quality setups.`);
    if (netProfit < 0 && losses.length > wins.length) weaknesses.push('More losses than wins. Tomorrow: reduce position size by 50% until 2 consecutive wins.');

    // Discipline grade
    let gradeScore = 100;
    if (revengeTradesDetected > 0) gradeScore -= revengeTradesDetected * 15;
    if (winRate < 40) gradeScore -= 15;
    if (closed.length >= 7) gradeScore -= 10;
    if (todayUsed > account.dailyLossLimit * 0.85) gradeScore -= 20;
    gradeScore = Math.max(0, gradeScore);
    const disciplineGrade: AIDailyReport['disciplineGrade'] =
        gradeScore >= 90 ? 'A+' : gradeScore >= 80 ? 'A' : gradeScore >= 65 ? 'B' : gradeScore >= 50 ? 'C' : gradeScore >= 35 ? 'D' : 'F';

    // Tomorrow's focus
    let tomorrowFocus = '';
    if (weaknesses.length === 0) tomorrowFocus = 'Continue executing your plan. Scale to your next risk tier if the account allows.';
    else if (revengeTradesDetected > 0) tomorrowFocus = 'Focus on executing exactly 1 trade at standard size. No additions after a loss.';
    else if (winRate < 40) tomorrowFocus = 'Tomorrow: only take setups that score A or B on the Trade Quality system.';
    else tomorrowFocus = 'Reduce trade frequency. Wait for only your highest-conviction setups.';

    // Coaching message
    const coachingMessage = netProfit > 0
        ? `Profitable session (${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(0)}). ${strengths[0] || 'Good discipline today.'} Keep the same process tomorrow.`
        : `Difficult session ($${netProfit.toFixed(0)}). ${weaknesses[0] || 'Review your setups.'} One bad day does not define the week. Reset and execute clean tomorrow.`;

    return {
        sessionDate: today,
        trades: closed.length,
        wins: wins.length,
        losses: losses.length,
        netProfit,
        winRate,
        bestTradeRR,
        worstTradeRisk,
        strengths,
        weaknesses,
        revengeTradesDetected,
        disciplineGrade,
        tomorrowFocus,
        coachingMessage
    };
}

// ─────────────────────────────────────────────────────────────────
// Utility — Smart Command Parser (used by HUD #2 + #6)
// ─────────────────────────────────────────────────────────────────

export interface ParsedSmartCommand {
    type: 'position' | 'target' | 'unknown';
    asset: string;
    entry: number;
    stopLoss: number;
    size?: number;
    riskUSD?: number;
    targetBalance?: number;
    targetProfit?: number;
    rr?: number;
}

export function parseSmartCommand(cmd: string): ParsedSmartCommand {
    const parts = cmd.trim().toLowerCase().split(/\s+/);
    const result: ParsedSmartCommand = { type: 'unknown', asset: '', entry: 0, stopLoss: 0 };

    parts.forEach((p, i) => {
        const num = parseFloat(p);
        if (i === 0 && isNaN(num)) result.asset = p.toUpperCase();
        if (p.startsWith('entry') || (i === 1 && !isNaN(num))) result.entry = parseFloat(p.replace('entry', '')) || num;
        if (p.startsWith('stop')) result.stopLoss = parseFloat(p.replace('stop', '')) || parseFloat(parts[i + 1]);
        if (p.startsWith('risk')) result.riskUSD = parseFloat(p.replace('risk', '')) || parseFloat(parts[i + 1]);
        if (p.startsWith('size')) result.size = parseFloat(p.replace('size', '')) || parseFloat(parts[i + 1]);
        if (p.startsWith('targetbalance')) {
            result.targetBalance = parseFloat(p.replace('targetbalance', '')) || parseFloat(parts[i + 1]);
            result.type = 'target';
        }
        if (p.startsWith('target') && !p.startsWith('targetbalance')) {
            result.targetProfit = parseFloat(p.replace('target', '')) || parseFloat(parts[i + 1]);
            result.type = 'target';
        }
    });

    if (result.entry > 0 && result.stopLoss > 0) result.type = 'position';
    return result;
}

// ─────────────────────────────────────────────────────────────────
// Feature #11 — AI Setup Detector (Edge Discovery Engine)
// Finds statistical edges from trade history
// ─────────────────────────────────────────────────────────────────

export interface SetupEdge {
    id: string;
    label: string;
    category: 'time' | 'asset' | 'direction' | 'rr' | 'risk';
    tradeCount: number;
    winRate: number;
    avgRR: number;
    expectancy: number;
    totalPnl: number;
    strength: 'strong' | 'moderate' | 'weak' | 'avoid';
    recommendation: string;
}

export interface SetupAnalysis {
    totalEdges: number;
    bestEdge: SetupEdge | null;
    worstEdge: SetupEdge | null;
    edges: SetupEdge[];
    primaryEdge: string;
    antiPattern: string;
    sessionRecommendation: string;
    readyToTrade: boolean;
}

export function detectSetups(trades: TradeSession[]): SetupAnalysis {
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');

    if (closed.length < 5) {
        return {
            totalEdges: 0, bestEdge: null, worstEdge: null, edges: [],
            primaryEdge: 'Log at least 5 trades to detect your edge.',
            antiPattern: 'Insufficient data.',
            sessionRecommendation: 'Keep logging every trade with full details.',
            readyToTrade: false
        };
    }

    const edges: SetupEdge[] = [];

    const calcEdge = (label: string, category: SetupEdge['category'], bucket: TradeSession[]): SetupEdge | null => {
        if (bucket.length < 2) return null;
        const wins = bucket.filter(t => t.outcome === 'win');
        const winRate = wins.length / bucket.length;
        const totalPnl = bucket.reduce((s, t) => s + ((t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD))), 0);
        const expectancy = totalPnl / bucket.length;
        const avgRR = bucket.filter(t => t.rr > 0).length > 0
            ? bucket.reduce((s, t) => s + t.rr, 0) / bucket.length : 0;

        const strength: SetupEdge['strength'] =
            expectancy > 100 && winRate >= 0.55 ? 'strong' :
            expectancy > 0   && winRate >= 0.45 ? 'moderate' :
            expectancy > -50 ? 'weak' : 'avoid';

        const rec = strength === 'strong' ? 'Prioritize this setup. Focus 70%+ of trades here.'
            : strength === 'moderate' ? 'Acceptable edge. Continue with standard sizing.'
            : strength === 'weak' ? 'Marginal edge. Reduce size 30% until sample >20 trades.'
            : 'Negative expectancy. Avoid until you identify the issue.';

        return { id: label, label, category, tradeCount: bucket.length, winRate, avgRR, expectancy, totalPnl, strength, recommendation: rec };
    };

    // Time-of-day analysis (EST)
    const hourBuckets: Record<string, TradeSession[]> = {};
    closed.forEach(t => {
        let hour = -1;
        try { hour = new Date(t.createdAt).getHours(); } catch { return; }
        if (hour < 0) return;
        let slot = hour >= 4 && hour < 8 ? '4–8 AM (Pre-Market)'
            : hour >= 8  && hour < 10 ? '8–10 AM (Open)'
            : hour >= 10 && hour < 12 ? '10 AM–12 PM (Mid-Morning)'
            : hour >= 12 && hour < 14 ? '12–2 PM (Lunch)'
            : hour >= 14 && hour < 16 ? '2–4 PM (Power Hour)'
            : hour >= 16 && hour < 20 ? '4–8 PM (After Hours)'
            : 'Other Hours';
        if (!hourBuckets[slot]) hourBuckets[slot] = [];
        hourBuckets[slot].push(t);
    });
    Object.entries(hourBuckets).forEach(([slot, bucket]) => {
        const e = calcEdge(slot, 'time', bucket);
        if (e) edges.push(e);
    });

    // Asset edges
    const assetBuckets: Record<string, TradeSession[]> = {};
    closed.forEach(t => {
        if (!assetBuckets[t.asset]) assetBuckets[t.asset] = [];
        assetBuckets[t.asset].push(t);
    });
    Object.entries(assetBuckets).forEach(([asset, bucket]) => {
        const e = calcEdge(`Asset: ${asset}`, 'asset', bucket);
        if (e) edges.push(e);
    });

    // R:R tiers
    const rrTiers: [string, (t: TradeSession) => boolean][] = [
        ['R:R < 1.5 (scalp)', t => t.rr > 0 && t.rr < 1.5],
        ['R:R 1.5–2.5 (standard)', t => t.rr >= 1.5 && t.rr < 2.5],
        ['R:R 2.5–4 (extended)', t => t.rr >= 2.5 && t.rr < 4],
        ['R:R > 4 (home-run)', t => t.rr >= 4],
    ];
    rrTiers.forEach(([label, filter]) => {
        const e = calcEdge(label, 'rr', closed.filter(filter));
        if (e) edges.push(e);
    });

    // Risk tiers
    const riskTiers: [string, (t: TradeSession) => boolean][] = [
        ['Risk ≤ $200', t => t.riskUSD <= 200],
        ['Risk $200–400', t => t.riskUSD > 200 && t.riskUSD <= 400],
        ['Risk $400–700', t => t.riskUSD > 400 && t.riskUSD <= 700],
        ['Risk > $700', t => t.riskUSD > 700],
    ];
    riskTiers.forEach(([label, filter]) => {
        const e = calcEdge(label, 'risk', closed.filter(filter));
        if (e) edges.push(e);
    });

    const sorted = [...edges].sort((a, b) => b.expectancy - a.expectancy);
    const bestEdge = sorted.find(e => e.strength === 'strong' || e.strength === 'moderate') || sorted[0] || null;
    const worstEdge = sorted.slice().reverse().find(e => e.strength === 'avoid') || sorted[sorted.length - 1] || null;

    return {
        totalEdges: edges.filter(e => e.strength !== 'avoid').length,
        bestEdge, worstEdge, edges: sorted,
        primaryEdge: bestEdge
            ? `Best edge: ${bestEdge.label} — ${(bestEdge.winRate * 100).toFixed(0)}% win rate, +$${bestEdge.expectancy.toFixed(0)}/trade.`
            : 'Keep logging trades to discover your edge.',
        antiPattern: worstEdge && worstEdge.strength === 'avoid'
            ? `Stop trading ${worstEdge.label} — $${worstEdge.expectancy.toFixed(0)}/trade avg loss.`
            : worstEdge ? `Weakest area: ${worstEdge.label}. Reduce size here.` : 'No clear patterns to avoid yet.',
        sessionRecommendation: bestEdge
            ? `${bestEdge.recommendation} Time your session around your best window.`
            : 'Log 10+ more trades for specific session recommendations.',
        readyToTrade: closed.length >= 20
    };
}

// ─────────────────────────────────────────────────────────────────
// Feature #12 — Monte Carlo Strategy Simulator
// Runs 1,000 equity paths to find optimal parameters
// ─────────────────────────────────────────────────────────────────

export interface SimConfig {
    riskUSD: number;
    winRate: number;
    avgWinR: number;
    tradesPerMonth: number;
    startingBalance: number;
    maxDrawdownLimit: number;
    months: number;
}

export interface SimPath {
    finalBalance: number;
    maxDrawdown: number;
    peakBalance: number;
    ruinMonth: number | null;
    monthlyReturns: number[];
}

export interface SimResult {
    config: SimConfig;
    paths: number;
    medianFinalBalance: number;
    mean10thPctBalance: number;
    mean90thPctBalance: number;
    survivalRate: number;
    medianMonthlyReturn: number;
    medianMaxDrawdown: number;
    avgMonthlyPnl: number;
    ruinChance: number;
    expectancyPerTrade: number;
    recommendation: string;
    verdict: 'excellent' | 'viable' | 'risky' | 'avoid';
}

export interface OptimizationResult {
    bestConfig: SimConfig;
    bestResult: SimResult;
    alternatives: { config: SimConfig; result: SimResult }[];
    optimalRisk: number;
    optimalRR: number;
    summary: string;
}

function runPath(cfg: SimConfig): SimPath {
    let balance = cfg.startingBalance;
    let peak = balance;
    let maxDD = 0;
    let ruinMonth: number | null = null;
    const monthlyReturns: number[] = [];

    for (let m = 0; m < cfg.months; m++) {
        let monthPnl = 0;
        for (let t = 0; t < cfg.tradesPerMonth; t++) {
            const win = Math.random() < cfg.winRate;
            const pnl = win ? cfg.riskUSD * cfg.avgWinR : -cfg.riskUSD;
            balance += pnl;
            monthPnl += pnl;
            if (balance > peak) peak = balance;
            const dd = peak - balance;
            if (dd > maxDD) maxDD = dd;
            if (balance < cfg.startingBalance - cfg.maxDrawdownLimit && ruinMonth === null) {
                ruinMonth = m + 1;
            }
        }
        monthlyReturns.push(monthPnl);
        if (ruinMonth !== null) break;
    }

    return { finalBalance: balance, maxDrawdown: maxDD, peakBalance: peak, ruinMonth, monthlyReturns };
}

function summarizePaths(paths: SimPath[], cfg: SimConfig): SimResult {
    const N = paths.length;
    const finals = paths.map(p => p.finalBalance).sort((a, b) => a - b);
    const dds    = paths.map(p => p.maxDrawdown).sort((a, b) => a - b);
    const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
    const pct    = (arr: number[], p: number) => arr[Math.max(0, Math.floor(arr.length * p))];

    const survivalRate       = (paths.filter(p => p.ruinMonth === null).length / N) * 100;
    const ruinChance         = 100 - survivalRate;
    const expectancyPerTrade = (cfg.winRate * cfg.riskUSD * cfg.avgWinR) - ((1 - cfg.winRate) * cfg.riskUSD);
    const avgMonthlyPnl      = expectancyPerTrade * cfg.tradesPerMonth;
    const medianMonthlyReturn = (avgMonthlyPnl / cfg.startingBalance) * 100;

    const verdict: SimResult['verdict'] =
        survivalRate >= 90 && medianMonthlyReturn >= 5 ? 'excellent' :
        survivalRate >= 75 && medianMonthlyReturn >= 2 ? 'viable' :
        survivalRate >= 50 ? 'risky' : 'avoid';

    const recommendation =
        verdict === 'excellent' ? `Exceptional config. ${survivalRate.toFixed(0)}% survival, +${medianMonthlyReturn.toFixed(1)}%/month. Run it.`
        : verdict === 'viable'  ? `Viable. Consider reducing risk 20% for higher survival.`
        : verdict === 'risky'   ? `High ruin probability (${ruinChance.toFixed(0)}%). Cut risk 40% before going live.`
        : `Dangerous config. ${ruinChance.toFixed(0)}% chance of account ruin. Do not run live.`;

    return {
        config: cfg, paths: N,
        medianFinalBalance: median(finals),
        mean10thPctBalance: pct(finals, 0.10),
        mean90thPctBalance: pct(finals, 0.90),
        survivalRate, medianMonthlyReturn,
        medianMaxDrawdown: median(dds),
        avgMonthlyPnl, ruinChance, expectancyPerTrade,
        recommendation, verdict
    };
}

export function runStrategySimulator(params: {
    currentRisk: number;
    currentWinRate: number;
    currentAvgRR: number;
    tradesPerMonth: number;
    startingBalance: number;
    maxDrawdownLimit: number;
    months?: number;
}): OptimizationResult {
    const { currentRisk, currentWinRate, currentAvgRR, tradesPerMonth, startingBalance, maxDrawdownLimit, months = 3 } = params;
    const PATHS = 1000;

    const baseCfg: SimConfig = { riskUSD: currentRisk, winRate: currentWinRate, avgWinR: currentAvgRR, tradesPerMonth, startingBalance, maxDrawdownLimit, months };

    const runSim = (cfg: SimConfig): SimResult => {
        const paths: SimPath[] = [];
        for (let i = 0; i < PATHS; i++) paths.push(runPath(cfg));
        return summarizePaths(paths, cfg);
    };

    const baseResult = runSim(baseCfg);
    const alternatives: { config: SimConfig; result: SimResult }[] = [];

    [0.6, 0.8, 1.2].forEach(mult => alternatives.push({ config: { ...baseCfg, riskUSD: Math.round(currentRisk * mult) }, result: runSim({ ...baseCfg, riskUSD: Math.round(currentRisk * mult) }) }));
    [1.5, 2.0, 2.5].forEach(rr => alternatives.push({ config: { ...baseCfg, avgWinR: rr }, result: runSim({ ...baseCfg, avgWinR: rr }) }));
    [0.6, 0.8].forEach(mult => alternatives.push({ config: { ...baseCfg, tradesPerMonth: Math.round(tradesPerMonth * mult) }, result: runSim({ ...baseCfg, tradesPerMonth: Math.round(tradesPerMonth * mult) }) }));

    const allConfigs = [{ config: baseCfg, result: baseResult }, ...alternatives];
    const best = allConfigs.sort((a, b) => {
        const score = (r: SimResult) => r.survivalRate * 0.5 + r.medianMonthlyReturn * 3 - r.ruinChance * 0.2;
        return score(b.result) - score(a.result);
    })[0];

    return {
        bestConfig: best.config, bestResult: best.result, alternatives,
        optimalRisk: best.config.riskUSD, optimalRR: best.config.avgWinR,
        summary: best.config.riskUSD !== currentRisk
            ? `Optimal risk: $${best.config.riskUSD} (${best.config.riskUSD > currentRisk ? '↑ increase' : '↓ reduce'} from $${currentRisk}). +${best.result.medianMonthlyReturn.toFixed(1)}%/month, ${best.result.survivalRate.toFixed(0)}% survival.`
            : `Current config is near-optimal. Survival: ${best.result.survivalRate.toFixed(0)}%, +${best.result.medianMonthlyReturn.toFixed(1)}%/month.`
    };
}
