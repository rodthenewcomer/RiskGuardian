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
            const holdMs = new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime();
            const holdSec = holdMs / 1000;
            if (holdSec > 0 && holdSec < minHold) {
                violations.push({
                    type: 'microscalping',
                    tradeId: t.id,
                    date: t.closedAt!.slice(0, 10),
                    detail: `${t.asset}: held ${holdSec.toFixed(0)}s (min ${minHold}s required)`,
                    severity: 'breach',
                });
            }
        }
    }

    // ── 2. Daily loss limit check ──────────────────────────────────
    const dailyLimit = account.dailyLossLimit ?? 0;
    if (dailyLimit > 0) {
        // Group P&L by trading day
        const byDay = new Map<string, number>();
        for (const t of closed) {
            const day = getTradingDay(t.closedAt ?? t.createdAt);
            byDay.set(day, (byDay.get(day) ?? 0) + (t.pnl ?? 0));
        }
        for (const [day, pnl] of byDay) {
            const loss = -pnl; // positive = lost money
            if (loss > dailyLimit) {
                violations.push({
                    type: 'daily_limit',
                    date: day,
                    detail: `Lost $${loss.toFixed(0)} — exceeded $${dailyLimit.toLocaleString()} daily limit by $${(loss - dailyLimit).toFixed(0)}`,
                    severity: 'breach',
                });
            } else if (loss > dailyLimit * 0.9) {
                violations.push({
                    type: 'daily_limit',
                    date: day,
                    detail: `Lost $${loss.toFixed(0)} — within 10% of $${dailyLimit.toLocaleString()} daily limit`,
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
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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
