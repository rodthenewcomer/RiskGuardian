import type { TradeSession, AccountSettings } from '@/store/appStore';
import { getTradingDay } from '@/store/appStore';

export type SimMode = 'BEHAVIORAL' | 'RULE_COMPLIANCE' | 'RISK_SIZING' | 'FILTER';

export interface SimulationConfig {
    mode: SimMode;
    // BEHAVIORAL — remove patterns one-by-one from history
    removeRevengeTrades:   boolean;  // block re-entry < 5min after a loss
    capHeldLosers:         boolean;  // cap losing trade pnl at proportional avgWinDur cost
    applySessionBleedLock: boolean;  // stop when session drops to 50% of its peak
    removeEscalation:      boolean;  // halt after 3 escalating consecutive losses
    // RULE COMPLIANCE — replay with account rules enforced
    applyDailyLossLimit:   boolean;  // uses account.dailyLossLimit
    applyMaxConsecLosses:  boolean;  // uses account.maxConsecutiveLosses
    applyMaxTradesPerDay:  boolean;  // uses account.maxTradesPerDay
    // RISK SIZING — rescale all P&L to a target risk %
    targetRiskPercent:     number;   // applied as % of startingBalance per trade
    // FILTER — only include trades meeting entry criteria
    minRR:                 number;   // minimum R:R at entry (0 = no filter)
    allowedHoursEST:       number[]; // open-hour whitelist (empty = all hours)
    allowedAssets:         string[]; // asset whitelist (empty = all assets)
}

export const DEFAULT_CONFIG: SimulationConfig = {
    mode:                  'BEHAVIORAL',
    removeRevengeTrades:   true,
    capHeldLosers:         true,
    applySessionBleedLock: true,
    removeEscalation:      true,
    applyDailyLossLimit:   true,
    applyMaxConsecLosses:  false,
    applyMaxTradesPerDay:  false,
    targetRiskPercent:     1,
    minRR:                 0,
    allowedHoursEST:       [],
    allowedAssets:         [],
};

export type TradeStatus = 'included' | 'blocked' | 'capped';

export interface SimTrade {
    original: TradeSession;
    included: boolean;
    status:   TradeStatus;
    reason?:  string;
    adjPnl:   number;  // original pnl if included, 0 if blocked, scaled pnl if capped
}

export interface SimMetrics {
    pnl:           number;
    winRate:       number;   // 0–100
    profitFactor:  number;
    maxDrawdown:   number;   // negative value
    tradeCount:    number;
    avgWin:        number;
    avgLoss:       number;
    expectancy:    number;   // E[$/trade] = (winRate/100)*avgWin + (1-winRate/100)*avgLoss
    maxWinStreak:  number;   // longest consecutive win run
    maxLoseStreak: number;   // longest consecutive loss run
}

export interface EquityPoint {
    i:         number;
    date:      string;
    actual:    number;
    simulated: number;
}

export interface DayBreakdown {
    day:          string;   // getTradingDay() value
    actualPnl:    number;
    simPnl:       number;
    tradeCount:   number;   // trades taken that day (before simulation)
    blockedCount: number;   // trades blocked by simulation
    delta:        number;   // simPnl - actualPnl
}

export interface AutoOptimizeRule {
    rule:        string;    // e.g. 'removeRevengeTrades'
    label:       string;    // human-readable
    labelFr:     string;
    delta:       number;    // P&L improvement over actual
    blockedCount:number;
    savedCapital:number;
}

export interface SimulationResult {
    config:          SimulationConfig;
    simTrades:       SimTrade[];
    actual:          SimMetrics;
    simulated:       SimMetrics;
    delta:           number;
    equityCurve:     EquityPoint[];
    blockedCount:    number;
    modifiedCount:   number;
    savedCapital:    number;     // absolute losses avoided by blocking
    dailyBreakdown:  DayBreakdown[];
    avgWinDurMin:    number;     // avg winning trade duration in minutes (from actual trades)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeStreaks(pnls: number[]): { maxWinStreak: number; maxLoseStreak: number } {
    let maxWin = 0, maxLose = 0, curWin = 0, curLose = 0;
    for (const p of pnls) {
        if (p > 0) { curWin++; curLose = 0; if (curWin > maxWin) maxWin = curWin; }
        else if (p < 0) { curLose++; curWin = 0; if (curLose > maxLose) maxLose = curLose; }
        else { curWin = 0; curLose = 0; }
    }
    return { maxWinStreak: maxWin, maxLoseStreak: maxLose };
}

function metricsFromPnls(pnls: number[]): SimMetrics {
    const wins   = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p < 0);
    const gw     = wins.reduce((s, v) => s + v, 0);
    const gl     = Math.abs(losses.reduce((s, v) => s + v, 0));

    let peak = 0, cum = 0, maxDD = 0;
    pnls.forEach(p => {
        cum += p;
        if (cum > peak) peak = cum;
        if (peak - cum > maxDD) maxDD = peak - cum;
    });

    const avgWin  = wins.length   ? gw / wins.length          : 0;
    const avgLoss = losses.length ? -(gl / losses.length)      : 0;
    const winRate = pnls.length   ? (wins.length / pnls.length) * 100 : 0;
    // Expectancy: E[$/trade]
    const expectancy = (winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss;

    const { maxWinStreak, maxLoseStreak } = computeStreaks(pnls);

    return {
        pnl:          pnls.reduce((s, v) => s + v, 0),
        winRate,
        // profitFactor = Infinity represented as 99 when no losses (prevents display issues)
        profitFactor: gl > 0 ? gw / gl : gw > 0 ? 99 : 0,
        maxDrawdown:  -maxDD,
        tradeCount:   pnls.length,
        avgWin,
        avgLoss,
        expectancy,
        maxWinStreak,
        maxLoseStreak,
    };
}

function getESTHour(iso: string): number {
    return new Date(
        new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })
    ).getHours();
}

// ── Block-set builders (reused by main engine + auto-optimize) ────────────────

function buildRevengeSet(sorted: TradeSession[]): Set<string> {
    const set = new Set<string>();
    const WINDOW_MS = 5 * 60_000; // 5 minutes
    for (let i = 0; i < sorted.length - 1; i++) {
        if ((sorted[i].pnl ?? 0) >= 0) continue;
        const lossClose = new Date(sorted[i].closedAt ?? sorted[i].createdAt).getTime();
        let count = 0;
        for (let j = i + 1; j < sorted.length; j++) {
            const jOpen = new Date(sorted[j].createdAt).getTime();
            if (jOpen < lossClose) continue; // parallel position — not revenge
            const elapsed = jOpen - lossClose;
            if (elapsed <= WINDOW_MS) { count++; set.add(sorted[j].id); }
            else break;
        }
        if (count > 0) i += count;
    }
    return set;
}

function buildHeldLoserSet(sorted: TradeSession[], avgWinDur: number): Set<string> {
    const set = new Set<string>();
    sorted.forEach(t => {
        if ((t.pnl ?? 0) < 0 && (t.durationSeconds ?? 0) > avgWinDur * 1.5)
            set.add(t.id);
    });
    return set;
}

function buildSessions(sorted: TradeSession[]): TradeSession[][] {
    const sessions: TradeSession[][] = [];
    if (sorted.length === 0) return sessions;
    const SESSION_GAP_MS = 2 * 3_600_000; // 2-hour gap = new session
    let cur = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].closedAt ?? sorted[i - 1].createdAt).getTime();
        const curr = new Date(sorted[i].closedAt ?? sorted[i].createdAt).getTime();
        if (curr - prev > SESSION_GAP_MS) { sessions.push(cur); cur = [sorted[i]]; }
        else cur.push(sorted[i]);
    }
    sessions.push(cur);
    return sessions;
}

function buildBleedSet(sessions: TradeSession[][]): Set<string> {
    const set = new Set<string>();
    sessions.forEach(sess => {
        let cum = 0, peak = 0, peakIdx = -1;
        sess.forEach((t, k) => {
            cum += (t.pnl ?? 0);
            if (cum > peak) { peak = cum; peakIdx = k; }
        });
        // Only apply if session had a meaningful profitable peak
        if (peak > 0 && peakIdx >= 0) {
            let postCum = peak;
            for (let k = peakIdx + 1; k < sess.length; k++) {
                postCum += (sess[k].pnl ?? 0);
                if (postCum < peak * 0.5) {
                    for (let m = k; m < sess.length; m++) set.add(sess[m].id);
                    break;
                }
            }
        }
    });
    return set;
}

function buildEscalationSet(sorted: TradeSession[]): Set<string> {
    const set = new Set<string>();
    // Collapse parallel positions into sequential loss clusters first
    const seq: { id: string; pnl: number; closeMs: number }[] = [];
    for (let i = 0; i < sorted.length; i++) {
        if ((sorted[i].pnl ?? 0) >= 0) continue;
        const closeMs = new Date(sorted[i].closedAt ?? sorted[i].createdAt).getTime();
        const openMs  = new Date(sorted[i].createdAt).getTime();
        if (seq.length > 0 && openMs < seq[seq.length - 1].closeMs) {
            // Parallel position — merge into previous cluster
            seq[seq.length - 1].pnl += (sorted[i].pnl ?? 0);
            continue;
        }
        seq.push({ id: sorted[i].id, pnl: sorted[i].pnl ?? 0, closeMs });
    }
    // Find 3+ escalating consecutive loss clusters; block the next trade
    let j = 0;
    while (j < seq.length - 2) {
        let end = j;
        const startAbs = Math.abs(seq[j].pnl);
        let prev = startAbs;
        let k = j + 1;
        while (k < seq.length && seq[k].pnl < 0 && Math.abs(seq[k].pnl) > prev) {
            prev = Math.abs(seq[k].pnl); end = k; k++;
        }
        if (end - j + 1 >= 3 && k < seq.length) {
            set.add(seq[k].id); j = k + 1; continue;
        }
        j++;
    }
    return set;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runSimulation(
    allTrades: TradeSession[],
    account:   AccountSettings,
    config:    SimulationConfig,
): SimulationResult {
    const sorted = [...allTrades]
        .filter(t => (t.outcome === 'win' || t.outcome === 'loss') && t.pnl != null)
        .sort((a, b) =>
            new Date(a.closedAt ?? a.createdAt).getTime() -
            new Date(b.closedAt ?? b.createdAt).getTime()
        );

    if (sorted.length === 0) {
        const empty: SimMetrics = { pnl: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0, tradeCount: 0, avgWin: 0, avgLoss: 0, expectancy: 0, maxWinStreak: 0, maxLoseStreak: 0 };
        return { config, simTrades: [], actual: empty, simulated: empty, delta: 0, equityCurve: [], blockedCount: 0, modifiedCount: 0, savedCapital: 0, dailyBreakdown: [], avgWinDurMin: 0 };
    }

    // ── Trader profile ────────────────────────────────────────────────────────
    const winsWithDur = sorted.filter(t => (t.pnl ?? 0) > 0 && (t.durationSeconds ?? 0) > 0);
    const avgWinDur   = winsWithDur.length
        ? winsWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / winsWithDur.length
        : 3600; // default 60min if no duration data

    const startBal      = account.startingBalance || account.balance || 10_000;
    const targetRiskUSD = startBal * (config.targetRiskPercent / 100);

    // ── Pre-compute block sets for BEHAVIORAL mode ────────────────────────────
    let revengeBlocked    = new Set<string>();
    let heldLoserIds      = new Set<string>();
    let bleedBlocked      = new Set<string>();
    let escalationBlocked = new Set<string>();

    if (config.mode === 'BEHAVIORAL') {
        if (config.removeRevengeTrades)   revengeBlocked    = buildRevengeSet(sorted);
        if (config.capHeldLosers)         heldLoserIds      = buildHeldLoserSet(sorted, avgWinDur);
        if (config.applySessionBleedLock) bleedBlocked      = buildBleedSet(buildSessions(sorted));
        if (config.removeEscalation)      escalationBlocked = buildEscalationSet(sorted);
    }

    // ── Main simulation walk ───────────────────────────────────────────────────
    const simTrades: SimTrade[] = [];
    // day → { actual pnl, sim pnl, trade count, blocked count }
    const actualDayMap: Record<string, { pnl: number; count: number }> = {};
    const simDayMap:    Record<string, { pnl: number; blocked: number; countIncluded: number }> = {};
    let globalConsec = 0;

    for (const t of sorted) {
        const pnl = t.pnl ?? 0;
        const day = getTradingDay(t.closedAt ?? t.createdAt);

        if (!actualDayMap[day]) actualDayMap[day] = { pnl: 0, count: 0 };
        if (!simDayMap[day])    simDayMap[day]    = { pnl: 0, blocked: 0, countIncluded: 0 };
        actualDayMap[day].pnl   += pnl;
        actualDayMap[day].count += 1;

        let blocked: boolean     = false;
        let reason:  string      = '';
        let adjPnl:  number      = pnl;
        let status:  TradeStatus = 'included';

        // Day-level state for RULE_COMPLIANCE cascade
        const ds = simDayMap[day];

        switch (config.mode) {

            case 'FILTER':
                // Block LOSING trades that don't meet the filter (winning ones pass)
                if (config.minRR > 0 && (t.rr ?? 0) < config.minRR && pnl < 0) {
                    blocked = true;
                    reason  = `R:R ${(t.rr ?? 0).toFixed(2)} below min ${config.minRR}`;
                }
                if (!blocked && config.allowedHoursEST.length > 0) {
                    const h = getESTHour(t.createdAt);
                    if (!config.allowedHoursEST.includes(h)) {
                        blocked = true;
                        reason  = `Opened at ${h}:00 EST — outside allowed window`;
                    }
                }
                if (!blocked && config.allowedAssets.length > 0 && !config.allowedAssets.includes(t.asset)) {
                    blocked = true;
                    reason  = `${t.asset} not in asset whitelist`;
                }
                break;

            case 'RISK_SIZING':
                if ((t.riskUSD ?? 0) > 0) {
                    const factor = targetRiskUSD / t.riskUSD!;
                    adjPnl       = pnl * factor;
                    if (Math.abs(factor - 1) > 0.02) {
                        status = 'capped';
                        reason = `Risk scaled ${factor.toFixed(2)}× → $${Math.abs(adjPnl).toFixed(0)} (${config.targetRiskPercent}% target)`;
                    }
                }
                // Trades with no riskUSD data pass through unchanged
                break;

            case 'RULE_COMPLIANCE':
                if (config.applyDailyLossLimit && account.dailyLossLimit > 0) {
                    if (ds.pnl <= -account.dailyLossLimit) {
                        blocked = true;
                        reason  = `Daily loss limit $${account.dailyLossLimit.toFixed(0)} hit`;
                    }
                }
                if (!blocked && config.applyMaxConsecLosses && (account.maxConsecutiveLosses ?? 0) > 0) {
                    if (globalConsec >= (account.maxConsecutiveLosses ?? 3)) {
                        blocked = true;
                        reason  = `${account.maxConsecutiveLosses} consecutive losses — cooldown required`;
                    }
                }
                if (!blocked && config.applyMaxTradesPerDay && (account.maxTradesPerDay ?? 0) > 0) {
                    if (ds.countIncluded >= (account.maxTradesPerDay ?? 99)) {
                        blocked = true;
                        reason  = `Max ${account.maxTradesPerDay} trades/day reached`;
                    }
                }
                break;

            case 'BEHAVIORAL':
            default:
                if (revengeBlocked.has(t.id)) {
                    blocked = true;
                    reason  = 'Re-entry < 5min after a loss — Revenge pattern';
                } else if (bleedBlocked.has(t.id)) {
                    blocked = true;
                    reason  = 'Session dropped below 50% of peak — Bleed Lock';
                } else if (escalationBlocked.has(t.id)) {
                    blocked = true;
                    reason  = '3+ escalating losses — session halted';
                } else if (heldLoserIds.has(t.id) && (t.durationSeconds ?? 0) > 0) {
                    status  = 'capped';
                    adjPnl  = (t.riskUSD ?? 0) > 0 ? -t.riskUSD! : pnl;
                    reason  = `Held loser: replaced with planned stop-loss -$${Math.abs(adjPnl).toFixed(0)}`;
                }
                break;
        }

        simTrades.push({
            original: t,
            included: !blocked,
            status:   blocked ? 'blocked' : status,
            reason:   blocked || status === 'capped' ? reason : undefined,
            adjPnl:   blocked ? 0 : adjPnl,
        });

        // Update state for RULE_COMPLIANCE day cascade
        const effective = blocked ? 0 : adjPnl;
        ds.pnl   += effective;
        if (blocked) ds.blocked += 1;
        else ds.countIncluded += 1;
        if (effective < 0) globalConsec++;
        else if (effective > 0) globalConsec = 0;
    }

    // ── Daily breakdown ────────────────────────────────────────────────────────
    const dailyBreakdown: DayBreakdown[] = Object.keys(actualDayMap)
        .sort()
        .map(day => ({
            day,
            actualPnl:    actualDayMap[day].pnl,
            simPnl:       simDayMap[day]?.pnl ?? actualDayMap[day].pnl,
            tradeCount:   actualDayMap[day].count,
            blockedCount: simDayMap[day]?.blocked ?? 0,
            delta:        (simDayMap[day]?.pnl ?? actualDayMap[day].pnl) - actualDayMap[day].pnl,
        }));

    // ── Equity curves ──────────────────────────────────────────────────────────
    let actualCum = 0, simCum = 0;
    const rawCurve: EquityPoint[] = simTrades.map((st, i) => {
        actualCum += (st.original.pnl ?? 0);
        simCum    += st.included ? st.adjPnl : 0;
        return {
            i:         i + 1,
            date:      (st.original.closedAt ?? st.original.createdAt).slice(5, 10),
            actual:    Math.round(actualCum * 100) / 100,
            simulated: Math.round(simCum    * 100) / 100,
        };
    });

    // Sample to ≤ 120 points for chart performance while preserving local extrema
    const step = Math.max(1, Math.ceil(rawCurve.length / 120));
    const sampled = new Set<number>();
    // Always include stride points and last point
    rawCurve.forEach((_, i) => { if (i % step === 0 || i === rawCurve.length - 1) sampled.add(i); });
    // Also preserve local extrema (peaks and troughs on actual curve)
    for (let i = 1; i < rawCurve.length - 1; i++) {
        const prev = rawCurve[i - 1].actual;
        const curr = rawCurve[i].actual;
        const next = rawCurve[i + 1].actual;
        if ((curr >= prev && curr >= next) || (curr <= prev && curr <= next)) sampled.add(i);
    }
    const equityCurve = rawCurve.filter((_, i) => sampled.has(i)).sort((a, b) => a.i - b.i);

    // ── Final metrics ──────────────────────────────────────────────────────────
    const actual    = metricsFromPnls(sorted.map(t => t.pnl ?? 0));
    // Simulated: blocked = 0, capped = adjPnl; filter zeros for DD but keep order
    const simPnls   = simTrades.map(st => st.included ? st.adjPnl : 0);
    const simulated = metricsFromPnls(simPnls.filter(p => p !== 0));
    simulated.tradeCount = simTrades.filter(st => st.included).length;

    const blocked  = simTrades.filter(st => st.status === 'blocked');
    const modified = simTrades.filter(st => st.status === 'capped');
    // Saved capital = absolute sum of LOSING trades that were blocked
    const savedCap = Math.abs(
        blocked
            .filter(st => (st.original.pnl ?? 0) < 0)
            .reduce((s, st) => s + (st.original.pnl ?? 0), 0)
    );

    return {
        config,
        simTrades,
        actual,
        simulated,
        delta:          simulated.pnl - actual.pnl,
        equityCurve,
        blockedCount:   blocked.length,
        modifiedCount:  modified.length,
        savedCapital:   savedCap,
        dailyBreakdown,
        avgWinDurMin:   Math.round(avgWinDur / 60),
    };
}

// ── Auto-optimize: run each behavioral rule individually ───────────────────────
// Returns rules sorted by P&L improvement (best first)

const BEHAVIORAL_RULES: Array<{
    rule:    keyof SimulationConfig;
    label:   string;
    labelFr: string;
}> = [
    { rule: 'removeRevengeTrades',   label: 'Remove Revenge Trades',    labelFr: 'Supprimer Revenge Trades'   },
    { rule: 'capHeldLosers',         label: 'Cap Held Losers',          labelFr: 'Plafonner Losers Tenus'     },
    { rule: 'applySessionBleedLock', label: 'Session Bleed Lock',       labelFr: 'Session Bleed Lock'         },
    { rule: 'removeEscalation',      label: 'Stop Loss Escalation',     labelFr: 'Stopper Escalade de Pertes' },
];

export function autoOptimize(
    allTrades: TradeSession[],
    account:   AccountSettings,
): AutoOptimizeRule[] {
    const base: SimulationConfig = {
        ...DEFAULT_CONFIG,
        mode:                  'BEHAVIORAL',
        removeRevengeTrades:   false,
        capHeldLosers:         false,
        applySessionBleedLock: false,
        removeEscalation:      false,
    };

    return BEHAVIORAL_RULES
        .map(({ rule, label, labelFr }) => {
            const cfg = { ...base, [rule]: true };
            const r   = runSimulation(allTrades, account, cfg);
            return {
                rule:         String(rule),
                label,
                labelFr,
                delta:        r.delta,
                blockedCount: r.blockedCount,
                savedCapital: r.savedCapital,
            };
        })
        .sort((a, b) => b.delta - a.delta);
}
