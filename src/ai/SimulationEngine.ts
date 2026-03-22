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
    allowedHoursEST:       number[]; // open-hour whitelist (empty = all)
    allowedAssets:         string[]; // asset whitelist (empty = all)
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
    winRate:       number;
    profitFactor:  number;
    maxDrawdown:   number;
    tradeCount:    number;
    avgWin:        number;
    avgLoss:       number;
}

export interface EquityPoint {
    i:         number;
    date:      string;
    actual:    number;
    simulated: number;
}

export interface SimulationResult {
    config:        SimulationConfig;
    simTrades:     SimTrade[];
    actual:        SimMetrics;
    simulated:     SimMetrics;
    delta:         number;
    equityCurve:   EquityPoint[];
    blockedCount:  number;
    modifiedCount: number;
    savedCapital:  number;  // absolute value of losses avoided by blocking
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

    return {
        pnl:          pnls.reduce((s, v) => s + v, 0),
        winRate:      pnls.length ? (wins.length / pnls.length) * 100 : 0,
        profitFactor: gl > 0 ? gw / gl : gw > 0 ? 99 : 0,
        maxDrawdown:  -maxDD,
        tradeCount:   pnls.length,
        avgWin:       wins.length   ? gw / wins.length               : 0,
        avgLoss:      losses.length ? -(gl / losses.length)          : 0,
    };
}

function getESTHour(iso: string): number {
    return new Date(
        new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })
    ).getHours();
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function runSimulation(
    allTrades:  TradeSession[],
    account:    AccountSettings,
    config:     SimulationConfig,
): SimulationResult {
    const sorted = [...allTrades]
        .filter(t => (t.outcome === 'win' || t.outcome === 'loss') && t.pnl != null)
        .sort((a, b) =>
            new Date(a.closedAt ?? a.createdAt).getTime() -
            new Date(b.closedAt ?? b.createdAt).getTime()
        );

    if (sorted.length === 0) {
        const empty: SimMetrics = { pnl: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0, tradeCount: 0, avgWin: 0, avgLoss: 0 };
        return { config, simTrades: [], actual: empty, simulated: empty, delta: 0, equityCurve: [], blockedCount: 0, modifiedCount: 0, savedCapital: 0 };
    }

    // ── Pre-compute base profile ───────────────────────────────────────────────
    const allWins    = sorted.filter(t => (t.pnl ?? 0) > 0);
    const allLosses  = sorted.filter(t => (t.pnl ?? 0) < 0);
    const winsWithDur = allWins.filter(t => (t.durationSeconds ?? 0) > 0);
    const avgWinDur  = winsWithDur.length
        ? winsWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / winsWithDur.length
        : 3600;

    const startBal  = account.startingBalance ?? account.balance ?? 10000;
    const targetRiskUSD = startBal * (config.targetRiskPercent / 100);

    // ── Build pre-computed block sets for behavioral mode ─────────────────────

    const revengeBlocked = new Set<string>();
    if (config.removeRevengeTrades && config.mode === 'BEHAVIORAL') {
        for (let i = 0; i < sorted.length - 1; i++) {
            if ((sorted[i].pnl ?? 0) >= 0) continue;
            const lossClose = new Date(sorted[i].closedAt ?? sorted[i].createdAt).getTime();
            let count = 0;
            for (let j = i + 1; j < sorted.length; j++) {
                const jOpen    = new Date(sorted[j].createdAt).getTime();
                if (jOpen < lossClose) continue;                          // parallel — skip
                const elapsed  = jOpen - lossClose;
                const windowMs = 5 * 60_000;
                if (elapsed <= windowMs) { count++; revengeBlocked.add(sorted[j].id); }
                else break;
            }
            if (count > 0) i += count;
        }
    }

    const heldLoserIds = new Set<string>();
    if (config.capHeldLosers && config.mode === 'BEHAVIORAL') {
        sorted.forEach(t => {
            if ((t.pnl ?? 0) < 0 && (t.durationSeconds ?? 0) > avgWinDur * 1.5)
                heldLoserIds.add(t.id);
        });
    }

    // Session groups (2h gap) for bleed lock & escalation
    const sessions: TradeSession[][] = [];
    if (sorted.length > 0) {
        let cur = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            const prev = new Date(sorted[i - 1].closedAt ?? sorted[i - 1].createdAt).getTime();
            const curr = new Date(sorted[i].closedAt ?? sorted[i].createdAt).getTime();
            if (curr - prev > 2 * 3_600_000) { sessions.push(cur); cur = [sorted[i]]; }
            else cur.push(sorted[i]);
        }
        sessions.push(cur);
    }

    const bleedBlocked = new Set<string>();
    if (config.applySessionBleedLock && config.mode === 'BEHAVIORAL') {
        sessions.forEach(sess => {
            let cum = 0, peak = 0, peakIdx = -1;
            sess.forEach((t, k) => {
                cum += (t.pnl ?? 0);
                if (cum > peak) { peak = cum; peakIdx = k; }
            });
            if (peak > 0 && peakIdx >= 0) {
                let postCum = peak;
                for (let k = peakIdx + 1; k < sess.length; k++) {
                    postCum += (sess[k].pnl ?? 0);
                    if (postCum < peak * 0.5) {
                        for (let m = k; m < sess.length; m++) bleedBlocked.add(sess[m].id);
                        break;
                    }
                }
            }
        });
    }

    const escalationBlocked = new Set<string>();
    if (config.removeEscalation && config.mode === 'BEHAVIORAL') {
        // Collapse parallel positions into clusters, then find 3+ escalating sequences
        const seq: { id: string; pnl: number; closeMs: number }[] = [];
        for (let i = 0; i < sorted.length; i++) {
            if ((sorted[i].pnl ?? 0) >= 0) continue;
            const closeMs = new Date(sorted[i].closedAt ?? sorted[i].createdAt).getTime();
            const openMs  = new Date(sorted[i].createdAt).getTime();
            if (seq.length > 0 && openMs < seq[seq.length - 1].closeMs) {
                seq[seq.length - 1].pnl += (sorted[i].pnl ?? 0); continue;
            }
            seq.push({ id: sorted[i].id, pnl: sorted[i].pnl ?? 0, closeMs });
        }
        let j = 0;
        while (j < seq.length - 2) {
            let end = j, prev = Math.abs(seq[j].pnl), k = j + 1;
            while (k < seq.length && seq[k].pnl < 0 && Math.abs(seq[k].pnl) > prev) {
                prev = Math.abs(seq[k].pnl); end = k; k++;
            }
            if (end - j + 1 >= 3 && k < seq.length) {
                escalationBlocked.add(seq[k].id); j = k + 1; continue;
            }
            j++;
        }
    }

    // ── Main simulation walk ───────────────────────────────────────────────────
    const simTrades: SimTrade[]                                                  = [];
    const dayState: Record<string, { pnl: number; count: number; consec: number }> = {};
    let globalConsec = 0;

    for (const t of sorted) {
        const pnl    = t.pnl ?? 0;
        const day    = getTradingDay(t.closedAt ?? t.createdAt);
        if (!dayState[day]) dayState[day] = { pnl: 0, count: 0, consec: 0 };
        const ds     = dayState[day];

        let blocked  = false;
        let reason   = '';
        let adjPnl   = pnl;
        let status: TradeStatus = 'included';

        switch (config.mode) {
            case 'FILTER':
                if (config.minRR > 0 && (t.rr ?? 0) < config.minRR && pnl < 0) {
                    blocked = true; reason = `R:R ${(t.rr ?? 0).toFixed(2)} below min ${config.minRR}`;
                }
                if (!blocked && config.allowedHoursEST.length > 0) {
                    const h = getESTHour(t.createdAt);
                    if (!config.allowedHoursEST.includes(h)) {
                        blocked = true; reason = `Opened at ${h}:00 EST — outside allowed window`;
                    }
                }
                if (!blocked && config.allowedAssets.length > 0 && !config.allowedAssets.includes(t.asset)) {
                    blocked = true; reason = `${t.asset} not in asset whitelist`;
                }
                break;

            case 'RISK_SIZING':
                if ((t.riskUSD ?? 0) > 0) {
                    const factor = targetRiskUSD / t.riskUSD;
                    adjPnl       = pnl * factor;
                    if (Math.abs(factor - 1) > 0.02) {
                        status = 'capped';
                        reason = `Risk scaled ${(factor).toFixed(2)}× (${(config.targetRiskPercent).toFixed(1)}% target)`;
                    }
                }
                break;

            case 'RULE_COMPLIANCE':
                if (config.applyDailyLossLimit && account.dailyLossLimit > 0) {
                    if (ds.pnl <= -account.dailyLossLimit) {
                        blocked = true; reason = `Daily loss limit $${account.dailyLossLimit.toFixed(0)} hit`;
                    }
                }
                if (!blocked && config.applyMaxConsecLosses && (account.maxConsecutiveLosses ?? 0) > 0) {
                    if (globalConsec >= (account.maxConsecutiveLosses ?? 3)) {
                        blocked = true; reason = `${account.maxConsecutiveLosses} consecutive losses — cooldown`;
                    }
                }
                if (!blocked && config.applyMaxTradesPerDay && (account.maxTradesPerDay ?? 0) > 0) {
                    if (ds.count >= (account.maxTradesPerDay ?? 99)) {
                        blocked = true; reason = `Max ${account.maxTradesPerDay} trades/day reached`;
                    }
                }
                break;

            case 'BEHAVIORAL':
            default:
                if (revengeBlocked.has(t.id)) {
                    blocked = true; reason = 'Re-entry < 5min after a loss — Revenge pattern';
                } else if (bleedBlocked.has(t.id)) {
                    blocked = true; reason = 'Session dropped below 50% of peak — Bleed Lock';
                } else if (escalationBlocked.has(t.id)) {
                    blocked = true; reason = '3+ escalating losses — session halted';
                } else if (heldLoserIds.has(t.id) && (t.durationSeconds ?? 0) > 0) {
                    status  = 'capped';
                    adjPnl  = pnl * (avgWinDur / t.durationSeconds!);
                    reason  = `Held loser capped at ${Math.round(avgWinDur / 60)}min avg win duration`;
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

        // Update state for rule-compliance cascade
        const effective = blocked ? 0 : adjPnl;
        ds.pnl   += effective;
        ds.count += 1;
        if (effective < 0) { globalConsec++; ds.consec++; }
        else if (effective > 0) { globalConsec = 0; ds.consec = 0; }
    }

    // ── Equity curves ──────────────────────────────────────────────────────────
    let actualCum = 0, simCum = 0;
    const rawCurve: EquityPoint[] = simTrades.map((st, i) => {
        actualCum += (st.original.pnl ?? 0);
        simCum    += st.included ? st.adjPnl : 0;
        return {
            i:         i + 1,
            date:      (st.original.closedAt ?? st.original.createdAt).slice(5, 10),
            actual:    Math.round(actualCum * 100) / 100,
            simulated: Math.round(simCum   * 100) / 100,
        };
    });

    // Sample down to ≤ 120 points for chart performance
    const step        = Math.max(1, Math.ceil(rawCurve.length / 120));
    const equityCurve = rawCurve.filter((_, i) => i % step === 0 || i === rawCurve.length - 1);

    // ── Final metrics ──────────────────────────────────────────────────────────
    const actual    = metricsFromPnls(sorted.map(t => t.pnl ?? 0));
    // Simulated: blocked trades contribute 0 (preserve chronological order for DD)
    const simulated = metricsFromPnls(simTrades.map(st => st.included ? st.adjPnl : 0).filter(p => p !== 0));
    // But tradeCount should reflect actual included count
    simulated.tradeCount = simTrades.filter(st => st.included).length;

    const blocked   = simTrades.filter(st => st.status === 'blocked');
    const modified  = simTrades.filter(st => st.status === 'capped');
    const savedCap  = Math.abs(blocked.filter(st => (st.original.pnl ?? 0) < 0).reduce((s, st) => s + (st.original.pnl ?? 0), 0));

    return {
        config,
        simTrades,
        actual,
        simulated,
        delta:         simulated.pnl - actual.pnl,
        equityCurve,
        blockedCount:  blocked.length,
        modifiedCount: modified.length,
        savedCapital:  savedCap,
    };
}
