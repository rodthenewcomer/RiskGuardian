'use client';

import { supabase } from './supabase';
import type { TradeSession, AccountSettings, DailySession } from '@/store/appStore';

/** Full account sync payload — includes store-level fields beyond AccountSettings */
export interface FullAccountSync {
    account: AccountSettings;
    tradingDayRollHour: number;
    language: 'en' | 'fr';
}

/** Sync payload for per-day journal notes and session entries */
export interface DayDataSync {
    dayNotes: Record<string, string>;
    dayJournalEntries: Record<string, unknown>;
}

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
        source:           trade.source ?? null,
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
        source:          (row.source as TradeSession['source']) ?? undefined,
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

/**
 * Delete multiple trades from Supabase by their IDs.
 */
export async function deleteTrades(tradeIds: string[], userId: string): Promise<void> {
    if (tradeIds.length === 0) return;
    // Delete in batches of 100
    for (let i = 0; i < tradeIds.length; i += 100) {
        const batch = tradeIds.slice(i, i + 100);
        const { error } = await supabase
            .from('trades')
            .delete()
            .eq('user_id', userId)
            .in('id', batch);
        if (error) throw new Error(`deleteTrades: ${error.message}`);
    }
}

/**
 * Delete ALL trades for the current user from Supabase.
 * Used when the user triggers "Clear All Trades" — must be called explicitly
 * because the auto-push effect skips pushing empty trade arrays.
 */
export async function deleteAllTrades(userId: string): Promise<void> {
    const { error } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', userId);
    if (error) throw new Error(`deleteAllTrades: ${error.message}`);
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
        min_hold_time_sec:      account.minHoldTimeSec ?? null,
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
    const full = await pullFullAccountSettings(userId);
    return full?.account ?? null;
}

/**
 * Pull account settings + store-level fields (language, tradingDayRollHour).
 * Returns null if no row exists yet (first-time user).
 */
export async function pullFullAccountSettings(userId: string): Promise<FullAccountSync | null> {
    const { data, error } = await supabase
        .from('account_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error || !data) return null;
    // Treat a row with startingBalance = 0 as "not yet configured"
    if (Number(data.starting_balance) === 0) return null;

    return {
        account: {
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
            minHoldTimeSec:        data.min_hold_time_sec != null ? Number(data.min_hold_time_sec) : undefined,
            payoutLockActive:      Boolean(data.payout_lock_active),
        },
        tradingDayRollHour: data.trading_day_roll_hour != null ? Number(data.trading_day_roll_hour) : 17,
        language:           (data.language as 'en' | 'fr') ?? 'en',
    };
}

// ── Day notes + journal entries sync ─────────────────────────────
//
// Stored in a dedicated `user_day_data` table with schema:
//   user_id        uuid  PRIMARY KEY REFERENCES auth.users
//   day_notes      jsonb DEFAULT '{}'
//   day_journal    jsonb DEFAULT '{}'
//   updated_at     timestamptz
//
// Run this once in the Supabase SQL editor to create the table:
//
//   CREATE TABLE IF NOT EXISTS user_day_data (
//     user_id      uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
//     day_notes    jsonb NOT NULL DEFAULT '{}',
//     day_journal  jsonb NOT NULL DEFAULT '{}',
//     updated_at   timestamptz NOT NULL DEFAULT now()
//   );
//   ALTER TABLE user_day_data ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "owner" ON user_day_data USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

/**
 * Push day notes and journal entries to Supabase.
 * Uses upsert on user_id — safe to call on every change.
 * Silently succeeds even if the table doesn't exist yet (returns void on error).
 */
export async function pushDayData(
    dayNotes: Record<string, string>,
    dayJournalEntries: Record<string, unknown>,
    userId: string,
): Promise<void> {
    const { error } = await supabase
        .from('user_day_data')
        .upsert({
            user_id:     userId,
            day_notes:   dayNotes,
            day_journal: dayJournalEntries,
            updated_at:  new Date().toISOString(),
        }, { onConflict: 'user_id' });

    if (error) throw new Error(`pushDayData: ${error.message}`);
}

/**
 * Pull day notes and journal entries from Supabase.
 * Returns null if no row exists or the table doesn't exist yet.
 */
export async function pullDayData(userId: string): Promise<DayDataSync | null> {
    const { data, error } = await supabase
        .from('user_day_data')
        .select('day_notes, day_journal')
        .eq('user_id', userId)
        .single();

    if (error || !data) return null;

    return {
        dayNotes:          (data.day_notes as Record<string, string>) ?? {},
        dayJournalEntries: (data.day_journal as Record<string, unknown>) ?? {},
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

// ── Daily sessions sync ──────────────────────────────────────────

/**
 * Upsert today's daily session to Supabase.
 * Safe to call on every risk-used change — uses UNIQUE(user_id, date) for idempotency.
 */
export async function pushDailySessions(sessions: DailySession[], userId: string): Promise<void> {
    if (sessions.length === 0) return;
    const rows = sessions.map(s => ({
        user_id:         userId,
        date:            s.date,
        risk_used:       s.riskUsed,
        trades_planned:  s.tradesPlanned,
        guard_triggered: s.guardTriggered,
    }));
    // Upsert in batches of 50 (daily sessions are small)
    for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase
            .from('daily_sessions')
            .upsert(rows.slice(i, i + 50), { onConflict: 'user_id,date' });
        if (error) throw new Error(`pushDailySessions: ${error.message}`);
    }
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
