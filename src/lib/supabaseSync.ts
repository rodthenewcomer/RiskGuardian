'use client';

import { supabase } from './supabase';
import type { TradeSession, AccountSettings, DailySession } from '@/store/appStore';

// ── Type adapters ────────────────────────────────────────────────

function tradeToRow(trade: TradeSession, userId: string) {
    return {
        id:               trade.id,
        user_id:          userId,
        asset:            trade.asset,
        asset_type:       trade.assetType,
        entry:            trade.entry,
        stop_loss:        trade.stopLoss,
        take_profit:      trade.takeProfit,
        lot_size:         trade.lotSize,
        risk_usd:         trade.riskUSD,
        reward_usd:       trade.rewardUSD,
        rr:               trade.rr,
        outcome:          trade.outcome ?? 'open',
        pnl:              trade.pnl ?? null,
        is_short:         trade.isShort ?? false,
        note:             trade.note ?? '',
        tags:             trade.tags ?? [],
        duration_seconds: trade.durationSeconds ?? null,
        created_at:       trade.createdAt,
        closed_at:        trade.closedAt ?? null,
        synced_at:        new Date().toISOString(),
    };
}

function rowToTrade(row: Record<string, unknown>): TradeSession {
    return {
        id:              row.id as string,
        asset:           row.asset as string,
        assetType:       row.asset_type as TradeSession['assetType'],
        entry:           Number(row.entry),
        stopLoss:        Number(row.stop_loss),
        takeProfit:      Number(row.take_profit),
        lotSize:         Number(row.lot_size),
        riskUSD:         Number(row.risk_usd),
        rewardUSD:       Number(row.reward_usd),
        rr:              Number(row.rr),
        outcome:         row.outcome as TradeSession['outcome'],
        pnl:             row.pnl != null ? Number(row.pnl) : undefined,
        isShort:         Boolean(row.is_short),
        note:            (row.note as string) ?? '',
        tags:            (row.tags as string[]) ?? [],
        durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : undefined,
        createdAt:       row.created_at as string,
        closedAt:        row.closed_at as string | undefined,
    };
}

// ── Trades sync ──────────────────────────────────────────────────

/**
 * Push local trades to Supabase (upsert — safe to call any time).
 * Returns the count of rows upserted.
 */
export async function pushTrades(trades: TradeSession[], userId: string): Promise<number> {
    if (trades.length === 0) return 0;
    const rows = trades.map(t => tradeToRow(t, userId));

    // Upsert in batches of 100 to stay within Supabase limits
    let total = 0;
    for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error, count } = await supabase
            .from('trades')
            .upsert(batch, { onConflict: 'id', count: 'exact' });
        if (error) throw new Error(`pushTrades: ${error.message}`);
        total += count ?? batch.length;
    }
    return total;
}

/**
 * Pull all trades for the current user from Supabase.
 * Returns them converted to TradeSession[].
 */
export async function pullTrades(userId: string): Promise<TradeSession[]> {
    const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(500);

    if (error) throw new Error(`pullTrades: ${error.message}`);
    return (data ?? []).map(row => rowToTrade(row as Record<string, unknown>));
}

/**
 * Delete a single trade from Supabase.
 */
export async function deleteTrade(tradeId: string, userId: string): Promise<void> {
    const { error } = await supabase
        .from('trades')
        .delete()
        .eq('id', tradeId)
        .eq('user_id', userId);
    if (error) throw new Error(`deleteTrade: ${error.message}`);
}

// ── Account settings sync ────────────────────────────────────────

export async function pushAccountSettings(
    account: AccountSettings,
    userId: string,
    tradingDayRollHour = 17,
    language = 'en',
): Promise<void> {
    const row = {
        user_id:                userId,
        balance:                account.balance,
        daily_loss_limit:       account.dailyLossLimit,
        max_risk_percent:       account.maxRiskPercent,
        asset_type:             account.assetType,
        currency:               account.currency,
        prop_firm:              account.propFirm ?? null,
        prop_firm_type:         account.propFirmType ?? null,
        max_drawdown_limit:     account.maxDrawdownLimit ?? null,
        drawdown_type:          account.drawdownType ?? 'EOD',
        leverage:               account.leverage ?? 2,
        starting_balance:       account.startingBalance,
        highest_balance:        account.highestBalance,
        is_consistency_active:  account.isConsistencyActive ?? false,
        max_consecutive_losses: account.maxConsecutiveLosses ?? null,
        cool_down_minutes:      account.coolDownMinutes ?? null,
        max_trades_per_day:     account.maxTradesPerDay ?? null,
        payout_lock_active:     account.payoutLockActive ?? false,
        trading_day_roll_hour:  tradingDayRollHour,
        language,
        updated_at:             new Date().toISOString(),
    };

    const { error } = await supabase
        .from('account_settings')
        .upsert(row, { onConflict: 'user_id' });
    if (error) throw new Error(`pushAccountSettings: ${error.message}`);
}

export async function pullAccountSettings(userId: string): Promise<AccountSettings | null> {
    const { data, error } = await supabase
        .from('account_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error || !data) return null;

    return {
        balance:               Number(data.balance),
        dailyLossLimit:        Number(data.daily_loss_limit),
        maxRiskPercent:        Number(data.max_risk_percent),
        assetType:             data.asset_type as AccountSettings['assetType'],
        currency:              data.currency,
        propFirm:              data.prop_firm ?? undefined,
        propFirmType:          data.prop_firm_type as AccountSettings['propFirmType'] ?? undefined,
        maxDrawdownLimit:      data.max_drawdown_limit != null ? Number(data.max_drawdown_limit) : undefined,
        drawdownType:          data.drawdown_type as AccountSettings['drawdownType'] ?? 'EOD',
        leverage:              data.leverage != null ? Number(data.leverage) : 2,
        startingBalance:       Number(data.starting_balance),
        highestBalance:        Number(data.highest_balance),
        isConsistencyActive:   Boolean(data.is_consistency_active),
        maxConsecutiveLosses:  data.max_consecutive_losses != null ? Number(data.max_consecutive_losses) : undefined,
        coolDownMinutes:       data.cool_down_minutes != null ? Number(data.cool_down_minutes) : undefined,
        maxTradesPerDay:       data.max_trades_per_day != null ? Number(data.max_trades_per_day) : undefined,
        payoutLockActive:      Boolean(data.payout_lock_active),
    };
}

// ── Waitlist ──────────────────────────────────────────────────────

export async function joinWaitlist(email: string, lang = 'en'): Promise<'ok' | 'already' | 'error'> {
    const { error } = await supabase
        .from('waitlist')
        .insert({ email: email.toLowerCase().trim(), lang, source: 'landing' });

    if (!error) return 'ok';
    if (error.code === '23505') return 'already'; // unique violation
    console.error('waitlist error:', error.message);
    return 'error';
}

// ── Full bidirectional sync ───────────────────────────────────────

/**
 * Full sync: pull remote + merge with local, then push local-only back up.
 * Returns the merged trade list.
 */
export async function fullSync(
    localTrades: TradeSession[],
    userId: string,
): Promise<TradeSession[]> {
    const remote = await pullTrades(userId);

    // Merge: remote wins on conflicts (cloud is source of truth for existing trades)
    const remoteIds = new Set(remote.map(t => t.id));
    const localOnly = localTrades.filter(t => !remoteIds.has(t.id));

    // Push local-only trades up
    if (localOnly.length > 0) {
        await pushTrades(localOnly, userId);
    }

    // Merge: remote + local-only (avoid duplicates)
    const merged = [...remote];
    localOnly.forEach(t => {
        if (!remoteIds.has(t.id)) merged.push(t);
    });

    return merged.sort(
        (a, b) => new Date(b.closedAt ?? b.createdAt).getTime() - new Date(a.closedAt ?? a.createdAt).getTime()
    );
}
