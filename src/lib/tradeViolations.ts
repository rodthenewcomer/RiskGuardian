/**
 * Trade Violation Scanner
 * ─────────────────────────────────────────────────────────────────
 * Runs entirely on local trade data — zero API calls.
 * Detects rule breaches in imported or manually-logged trades.
 */

import type { TradeSession, AccountSettings } from '@/store/appStore';
import { getTradingDay } from '@/store/appStore';

export interface TradeViolation {
    type: 'microscalping' | 'daily_limit' | 'drawdown_floor';
    tradeId?: string;
    date: string;           // YYYY-MM-DD trading day
    detail: string;
    severity: 'warning' | 'breach';
}

/**
 * Scan a trade list for rule violations.
 * Only checks rules that are configured (minHoldTimeSec, dailyLossLimit).
 */
export function scanViolations(
    trades: TradeSession[],
    account: Pick<AccountSettings, 'minHoldTimeSec' | 'dailyLossLimit' | 'startingBalance' | 'maxDrawdownLimit' | 'drawdownType'>
): TradeViolation[] {
    const violations: TradeViolation[] = [];
    const closed = trades.filter(t => (t.outcome === 'win' || t.outcome === 'loss') && t.closedAt);

    // ── 1. Microscalping check ─────────────────────────────────────
    const minHold = account.minHoldTimeSec ?? 0;
    if (minHold > 0) {
        for (const t of closed) {
            const holdMs = new Date(t.closedAt ?? t.createdAt).getTime() - new Date(t.createdAt).getTime();
            const holdSec = holdMs / 1000;
            if (holdSec > 0 && holdSec < minHold) {
                violations.push({
                    type: 'microscalping',
                    tradeId: t.id,
                    date: getTradingDay(t.closedAt ?? t.createdAt),
                    detail: `${t.asset}: held ${holdSec.toFixed(0)}s (min ${minHold}s required)`,
                    severity: 'breach',
                });
            }
        }
    }

    // ── 2. Daily loss limit check ──────────────────────────────────
    const dailyLimit = account.dailyLossLimit ?? 0;
    if (dailyLimit > 0) {
        // Group trades by trading day (sorted chronologically)
        const byDay = new Map<string, typeof closed>();
        for (const t of closed) {
            const day = getTradingDay(t.closedAt ?? t.createdAt);
            if (!byDay.has(day)) byDay.set(day, []);
            byDay.get(day)!.push(t);
        }
        for (const [day, dayTrades] of byDay) {
            // Walk trades in chronological order to find intraday breach point
            dayTrades.sort((a, b) =>
                new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime()
            );
            let runningLoss = 0;
            let breachTradeId: string | undefined;
            for (const t of dayTrades) {
                runningLoss -= t.pnl ?? 0;
                if (runningLoss > dailyLimit && !breachTradeId) {
                    breachTradeId = t.id;
                    break;
                }
            }
            const totalLoss = -dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
            if (totalLoss > dailyLimit) {
                violations.push({
                    type: 'daily_limit',
                    tradeId: breachTradeId,
                    date: day,
                    detail: `Lost $${totalLoss.toFixed(0)} — exceeded $${dailyLimit.toLocaleString()} daily limit by $${(totalLoss - dailyLimit).toFixed(0)}`,
                    severity: 'breach',
                });
            } else if (totalLoss > dailyLimit * 0.9) {
                violations.push({
                    type: 'daily_limit',
                    date: day,
                    detail: `Lost $${totalLoss.toFixed(0)} — within 10% of $${dailyLimit.toLocaleString()} daily limit`,
                    severity: 'warning',
                });
            }
        }
    }

    // Sort: breaches first, then by date descending
    return violations.sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'breach' ? -1 : 1;
        return b.date.localeCompare(a.date);
    });
}

/**
 * Compute balance, highest balance, and daily limit from trade history.
 * Returns null if startingBalance is not set.
 */
export function computeAccountFromTrades(
    trades: TradeSession[],
    startingBalance: number,
    propFirmDailyPct?: number,
): { balance: number; highestBalance: number; dailyLossLimit?: number } | null {
    if (!startingBalance) return null;

    const closed = trades
        .filter(t => (t.outcome === 'win' || t.outcome === 'loss') && typeof t.pnl === 'number')
        .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());

    let running = startingBalance;
    let highest = startingBalance;
    for (const t of closed) {
        running += t.pnl ?? 0;
        if (running > highest) highest = running;
    }

    const balance = Math.round(running * 100) / 100;
    const highestBalance = Math.round(highest * 100) / 100;

    // Auto-compute daily limit if prop firm daily % is known
    const dailyLossLimit = propFirmDailyPct
        ? Math.round((balance * propFirmDailyPct) / 100)
        : undefined;

    return { balance, highestBalance, dailyLossLimit };
}
