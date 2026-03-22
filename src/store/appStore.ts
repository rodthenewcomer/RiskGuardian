'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PropFirmPreset {
    name: string;
    short: string;
    dailyPct: number;   // daily loss limit as % of balance
    maxDrawPct: number; // overall max drawdown %
    color: string;
    propFirmType?: '2-Step Evaluation' | '1-Step Evaluation' | 'Instant Funding';
    drawdownType?: 'EOD' | 'Trailing' | 'Static';
}

export const PROP_FIRMS: PropFirmPreset[] = [
    // ── Tradeify Crypto ────────────────────────────────────────────
    // 1-Step: EOT (End-of-Trade) trailing drawdown — floor moves after every closed trade
    { name: 'Tradeify 1-Step Eval', short: 'Trdfy1S', dailyPct: 3, maxDrawPct: 6, color: '#FDC800', propFirmType: '1-Step Evaluation', drawdownType: 'Trailing' },
    // 2-Step: Static drawdown — floor fixed at starting balance − 6%, never moves
    { name: 'Tradeify 2-Step Eval', short: 'Trdfy2S', dailyPct: 3, maxDrawPct: 6, color: '#FDC800', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    // Instant Funding: EOD (End-of-Day) trailing drawdown — snapshots at 17:00 EST
    // No profit target, no min days. Consistency ≤ 20% required to request payout.
    { name: 'Tradeify Instant Funding', short: 'TrdfyIF', dailyPct: 3, maxDrawPct: 6, color: '#FDC800', propFirmType: 'Instant Funding', drawdownType: 'EOD' },
    // ── Other firms ────────────────────────────────────────────────
    { name: 'Funding Pips', short: 'FPips', dailyPct: 5, maxDrawPct: 10, color: '#FDC800', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'FTMO', short: 'FTMO', dailyPct: 5, maxDrawPct: 10, color: '#FDC800', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'The5%ers', short: '5%ers', dailyPct: 4, maxDrawPct: 6, color: '#FDC800', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'Custom (Build your own)', short: 'Custom', dailyPct: 0, maxDrawPct: 0, color: '#888', drawdownType: 'Static' },
];

export interface TradeSession {
    id: string;
    asset: string;
    assetType: 'crypto' | 'forex' | 'futures' | 'stocks';
    entry: number;
    stopLoss: number;
    takeProfit: number;
    lotSize: number;      // contracts for futures, shares for stocks, lots for forex/crypto
    riskUSD: number;
    rewardUSD: number;
    rr: number;
    outcome?: 'win' | 'loss' | 'open';
    createdAt: string;
    closedAt?: string;
    pnl?: number;   // Realized PnL
    isShort?: boolean;
    note?: string;  // Manual journal note
    durationSeconds?: number;
    tags?: string[];
    source?: 'manual' | 'pdf' | 'csv' | 'dxtrade'; // undefined = manual (backward compat)
}

export interface AccountSettings {
    balance: number;
    dailyLossLimit: number;   // in USD
    maxRiskPercent: number;   // e.g. 1 = 1%
    assetType: 'crypto' | 'forex' | 'futures' | 'stocks';
    currency: string;
    propFirm?: string;        // e.g. "Tradeify"
    propFirmType?: '2-Step Evaluation' | '1-Step Evaluation' | 'Instant Funding';
    maxDrawdownLimit?: number; // % or absolute USD
    drawdownType?: 'EOD' | 'Trailing' | 'Static';
    leverage?: number;
    startingBalance: number;
    highestBalance: number;
    isConsistencyActive?: boolean;
    minHoldTimeSec?: number;
    maxTradesPerDay?: number;
    /**
     * Instant Funding only — true once the trader has requested ANY payout.
     * After this, the trailing drawdown floor permanently locks at startingBalance.
     */
    payoutLockActive?: boolean;
    /** Behavioral guard: stop trading after N consecutive losses in the same day */
    maxConsecutiveLosses?: number;
    /** Behavioral guard: mandatory cool-down (minutes) before next entry after a loss */
    coolDownMinutes?: number;
}

export interface DailySession {
    date: string;
    riskUsed: number;
    tradesPlanned: number;
    guardTriggered: boolean;
}

/** Saved simulation scenario — max 3, oldest replaced when full */
export interface SavedScenario {
    id: string;
    name: string;
    savedAt: string;          // ISO timestamp
    mode: string;             // SimMode
    delta: number;            // net P&L delta vs actual
    blockedCount: number;
    modifiedCount: number;
    savedCapital: number;
    actualPnl: number;
    simPnl: number;
    config: Record<string, unknown>;
}

/** Snapshot of key performance metrics saved when user views the Report tab */
export interface ReportSnapshot {
    id: string;
    savedAt: string;           // ISO timestamp
    periodLabel: string;       // '7D' | '30D' | '90D' | 'ALL'
    grade: string;             // 'A' | 'B' | 'C' | 'D'
    gradeScore: number;        // 0-100
    netPnl: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    avgWin: number;
    avgLoss: number;
    wlRatio: number;
    behavioralCost: number;
    tradeCount: number;
    sessionCount: number;
    riskScore: number;
    greenSessions: number;
    totalSessions: number;
    topPattern: string;
    projectedPnl: number;
}

/** Persisted DXTrade connection config (token only — no password stored) */
export interface DXTradeConfig {
    server: string;       // e.g. "live.tradeify.com"
    username: string;
    domain: string;
    accountCode: string;  // DXTrade "clearing:account" code
    token: string;        // Session token (expires on inactivity)
    password?: string;    // CAUTION: Stored plain text in this MVP for auto-reconnect
    connectedAt: string;  // ISO timestamp of last successful login
}

interface AppState {
    hasOnboarded: boolean;
    account: AccountSettings;
    trades: TradeSession[];
    dailySessions: DailySession[];
    activeTab: 'dashboard' | 'terminal' | 'calculator' | 'plan' | 'journal' | 'analytics' | 'settings' | 'simulator';

    /** DXTrade live connection (null = not connected) */
    dxtradeConfig: DXTradeConfig | null;
    /** ISO timestamp of last successful DXTrade sync */
    dxtradeLastSync: string | null;

    /** UI language — defaults to 'en' */
    language: 'en' | 'fr';
    /** Hour (0-23) EST at which the trading day rolls over — defaults to 17 */
    tradingDayRollHour: number;

    /** Supabase auth state (persisted so user stays signed in across refreshes) */
    userId: string | null;
    userEmail: string | null;
    /** Controls visibility of AuthModal — not persisted */
    showAuthModal: boolean;

    /** Saved report snapshots — persisted, max 20 */
    reportSnapshots: ReportSnapshot[];

    /** Saved simulation scenarios — persisted, max 3 */
    savedScenarios: SavedScenario[];

    // Actions
    completeOnboarding: () => void;
    resetOnboarding: () => void;
    updateAccount: (settings: Partial<AccountSettings>) => void;
    addTrade: (trade: TradeSession) => void;
    setTrades: (trades: TradeSession[]) => void;
    deleteTrade: (id: string) => void;
    updateTradeOutcome: (id: string, outcome: 'win' | 'loss' | 'open') => void;
    updateTradeNote: (id: string, note: string) => void;
    updateTradeTags: (id: string, tags: string[]) => void;
    setUserId: (id: string | null) => void;
    setUserEmail: (email: string | null) => void;
    setShowAuthModal: (show: boolean) => void;
    setActiveTab: (tab: AppState['activeTab']) => void;
    getTodayRiskUsed: () => number;
    getDailyRiskRemaining: () => number;
    addDailyRisk: (amount: number) => void;
    resetTodaySession: () => void;
    setDXTradeConfig: (config: DXTradeConfig | null) => void;
    setDXTradeLastSync: (time: string) => void;
    setLanguage: (lang: 'en' | 'fr') => void;
    setTradingDayRollHour: (hour: number) => void;
    saveReportSnapshot: (snapshot: ReportSnapshot) => void;
    deleteReportSnapshot: (id: string) => void;
    saveScenario: (scenario: SavedScenario) => void;
    deleteScenario: (id: string) => void;
    /**
     * Auto-compute balance, highestBalance, and dailyLossLimit from trade history.
     * Called automatically after setTrades / addTrade / deleteTrade.
     * Safe to call manually from Settings as a "Recalculate" action.
     * Skips update if startingBalance is not set.
     */
    autoSync: () => void;
}

/**
 * Returns current Eastern Time (EST/EDT) string: YYYY-MM-DD
 * This ensures Tradeify daily resets and session tracking align with US markets.
 */
export const getESTDate = () => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date()); // Returns YYYY-MM-DD
};

/**
 * Returns full ISO string for current Eastern Time
 */
export const getESTFull = () => {
    return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
};

/**
 * Returns the Tradeify "trading day" (YYYY-MM-DD) for a given ISO timestamp.
 *
 * Tradeify settles at rollHour EST (default 17 / 5 PM): a trade closed at or
 * after rollHour EST belongs to the NEXT calendar day.
 *
 * Examples (rollHour = 17):
 *   Feb 28 08:26 PM EST  →  trading day = Mar 1
 *   Mar  6 09:00 AM EST  →  trading day = Mar 6
 *   Mar  6 05:00 PM EST  →  trading day = Mar 7
 */
export function getTradingDay(isoDatetime: string, rollHour = 17): string {
    const d = new Date(isoDatetime);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year:   'numeric',
        month:  '2-digit',
        day:    '2-digit',
        hour:   '2-digit',
        hour12: false,
    }).formatToParts(d);

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
    const hour = parseInt(get('hour'), 10);

    if (hour >= rollHour) {
        // Roll forward one calendar day (use noon UTC on that date to avoid DST edge cases)
        const year  = parseInt(get('year'),  10);
        const month = parseInt(get('month'), 10) - 1; // 0-indexed
        const day   = parseInt(get('day'),   10);
        const next  = new Date(Date.UTC(year, month, day + 1, 12));
        return next.toISOString().slice(0, 10);
    }

    return `${get('year')}-${get('month')}-${get('day')}`;
}

const today = () => getESTDate();

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            hasOnboarded: false,
            reportSnapshots: [],
            savedScenarios: [],
            account: {
                balance: 0,
                dailyLossLimit: 0,
                maxRiskPercent: 1,
                assetType: 'crypto',
                currency: 'USD',
                propFirmType: 'Instant Funding',
                drawdownType: 'EOD',
                leverage: 2,
                startingBalance: 0,
                highestBalance: 0,
                isConsistencyActive: false,
            },
            trades: [],
            dailySessions: [],
            activeTab: 'dashboard',
            dxtradeConfig: null,
            dxtradeLastSync: null,
            language: 'en',
            tradingDayRollHour: 17,
            userId: null,
            userEmail: null,
            showAuthModal: false,

            completeOnboarding: () => set({ hasOnboarded: true }),

            resetOnboarding: () => set({
                hasOnboarded: false,
                account: { balance: 0, dailyLossLimit: 0, maxRiskPercent: 1, assetType: 'crypto', currency: 'USD', propFirmType: 'Instant Funding', drawdownType: 'EOD', leverage: 2, startingBalance: 0, highestBalance: 0, isConsistencyActive: false },
                trades: [],
                dailySessions: [],
                reportSnapshots: [],
                savedScenarios: [],
                activeTab: 'dashboard',
                dxtradeConfig: null,
                dxtradeLastSync: null,
                language: 'en',
                tradingDayRollHour: 17,
                userId: null,
                userEmail: null,
            }),

            setDXTradeConfig: (config) => set({ dxtradeConfig: config }),
            setDXTradeLastSync: (time) => set({ dxtradeLastSync: time }),

            saveReportSnapshot: (snapshot) => set((s) => ({
                reportSnapshots: [...s.reportSnapshots, snapshot].slice(-20),
            })),
            deleteReportSnapshot: (id) => set((s) => ({
                reportSnapshots: s.reportSnapshots.filter(r => r.id !== id),
            })),

            saveScenario: (scenario) => set((s) => ({
                // Keep max 3 — drop oldest if full
                savedScenarios: [...s.savedScenarios, scenario].slice(-3),
            })),
            deleteScenario: (id) => set((s) => ({
                savedScenarios: s.savedScenarios.filter(sc => sc.id !== id),
            })),

            updateAccount: (settings) =>
                set((s) => ({ account: { ...s.account, ...settings } })),

            addTrade: (trade) => {
                set((s) => ({ trades: [trade, ...s.trades] }));
                get().autoSync();
            },

            setTrades: (newTrades: TradeSession[]) => {
                set(() => ({ trades: newTrades }));
                get().autoSync();
            },

            deleteTrade: (id) => {
                set((s) => ({ trades: s.trades.filter((t) => t.id !== id) }));
                get().autoSync();
            },

            updateTradeOutcome: (id, outcome) =>
                set((s) => ({
                    trades: s.trades.map((t) => (t.id === id ? { ...t, outcome } : t)),
                })),

            updateTradeNote: (id, note) =>
                set((s) => ({
                    trades: s.trades.map((t) => (t.id === id ? { ...t, note } : t)),
                })),

            updateTradeTags: (id, tags) =>
                set((s) => ({
                    trades: s.trades.map((t) => (t.id === id ? { ...t, tags } : t)),
                })),

            setActiveTab: (tab) => set({ activeTab: tab }),

            setLanguage: (lang) => set({ language: lang }),

            setTradingDayRollHour: (hour) => set({ tradingDayRollHour: hour }),

            setUserId: (id) => set({ userId: id }),
            setUserEmail: (email) => set({ userEmail: email }),
            setShowAuthModal: (show) => set({ showAuthModal: show }),

            getTodayRiskUsed: () => {
                const state = get();
                const todayStr = today();
                const session = state.dailySessions.find((s) => s.date === todayStr);
                return session?.riskUsed ?? 0;
            },

            getDailyRiskRemaining: () => {
                const state = get();
                const used = state.getTodayRiskUsed();
                return Math.max(0, state.account.dailyLossLimit - used);
            },

            addDailyRisk: (amount) => {
                const todayStr = today();
                set((s) => {
                    const existing = s.dailySessions.find((d) => d.date === todayStr);
                    if (existing) {
                        const newUsed = existing.riskUsed + amount;
                        return {
                            dailySessions: s.dailySessions.map((d) =>
                                d.date === todayStr
                                    ? { ...d, riskUsed: newUsed, guardTriggered: newUsed >= s.account.dailyLossLimit }
                                    : d
                            ),
                        };
                    } else {
                        return {
                            dailySessions: [
                                ...s.dailySessions,
                                { date: todayStr, riskUsed: amount, tradesPlanned: 1, guardTriggered: amount >= s.account.dailyLossLimit },
                            ],
                        };
                    }
                });
            },

            resetTodaySession: () => {
                const todayStr = today();
                set((s) => ({
                    dailySessions: s.dailySessions.filter((d) => d.date !== todayStr),
                }));
            },

            autoSync: () => {
                const s = get();
                if (!s.account.startingBalance) return;

                const closed = s.trades
                    .filter(t => (t.outcome === 'win' || t.outcome === 'loss') && typeof t.pnl === 'number')
                    .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());

                if (closed.length === 0) return;

                // Running balance and peak balance over trade history
                let running = s.account.startingBalance;
                let highest = s.account.startingBalance;
                for (const t of closed) {
                    running += t.pnl ?? 0;
                    if (running > highest) highest = running;
                }
                const newBalance = Math.round(running * 100) / 100;
                const newHighest = Math.round(Math.max(highest, s.account.highestBalance ?? 0) * 100) / 100;

                // Auto-scale daily loss limit with the current balance if prop firm is set
                const firm = PROP_FIRMS.find(f => f.name === s.account.propFirm && f.dailyPct > 0);
                const newDailyLimit = firm
                    ? Math.round((newBalance * firm.dailyPct) / 100)
                    : s.account.dailyLossLimit;

                // Only write if values actually changed (avoid unnecessary re-renders)
                const changed =
                    Math.abs(newBalance - s.account.balance) > 0.01 ||
                    newHighest !== s.account.highestBalance ||
                    newDailyLimit !== s.account.dailyLossLimit;

                if (changed) {
                    set(s2 => ({
                        account: {
                            ...s2.account,
                            balance: newBalance,
                            highestBalance: newHighest,
                            dailyLossLimit: newDailyLimit,
                        },
                    }));
                }
            },
        }),
        {
            name: 'riskguardia-v2',
            partialize: (s) => ({
                hasOnboarded: s.hasOnboarded,
                account: s.account,
                trades: s.trades.slice(0, 500), // 500 trades ≈ 150KB — well within localStorage 5MB limit
                dailySessions: s.dailySessions.slice(-30),
                reportSnapshots: s.reportSnapshots.slice(-20),
                savedScenarios: s.savedScenarios,
                dxtradeConfig: s.dxtradeConfig,
                dxtradeLastSync: s.dxtradeLastSync,
                language: s.language,
                tradingDayRollHour: s.tradingDayRollHour,
                userId: s.userId,
                userEmail: s.userEmail,
            }),
        }
    )
);

// ─── Futures contract specifications ───────────────────────────
export interface FuturesSpec {
    label: string;
    pointValue: number;   // USD per 1.0 point move × 1 contract
    tickSize: number;
    exchange: string;
}

export const FUTURES_SPECS: Record<string, FuturesSpec> = {
    'ES': { label: 'E-mini S&P 500', pointValue: 50, tickSize: 0.25, exchange: 'CME' },
    'MES': { label: 'Micro E-mini S&P', pointValue: 5, tickSize: 0.25, exchange: 'CME' },
    'NQ': { label: 'E-mini Nasdaq-100', pointValue: 20, tickSize: 0.25, exchange: 'CME' },
    'MNQ': { label: 'Micro E-mini Nasdaq', pointValue: 2, tickSize: 0.25, exchange: 'CME' },
    'RTY': { label: 'E-mini Russell 2000', pointValue: 50, tickSize: 0.10, exchange: 'CME' },
    'M2K': { label: 'Micro E-mini Russell', pointValue: 5, tickSize: 0.10, exchange: 'CME' },
    'YM': { label: 'E-mini Dow Jones', pointValue: 5, tickSize: 1, exchange: 'CBOT' },
    'MYM': { label: 'Micro E-mini Dow', pointValue: 0.5, tickSize: 1, exchange: 'CBOT' },
    'CL': { label: 'Crude Oil', pointValue: 1000, tickSize: 0.01, exchange: 'NYMEX' },
    'QM': { label: 'E-mini Crude Oil', pointValue: 500, tickSize: 0.025, exchange: 'NYMEX' },
    'GC': { label: 'Gold', pointValue: 100, tickSize: 0.10, exchange: 'COMEX' },
    'MGC': { label: 'Micro Gold', pointValue: 10, tickSize: 0.10, exchange: 'COMEX' },
    'SI': { label: 'Silver', pointValue: 5000, tickSize: 0.005, exchange: 'COMEX' },
    'ZB': { label: '30-Yr T-Bond', pointValue: 1000, tickSize: 0.03125, exchange: 'CBOT' },
};

/**
 * Computes the current max-drawdown floor for any Tradeify account type.
 *
 * Returns:
 *   floor      — absolute USD level equity must stay above
 *   buffer     — current balance − floor (how much room is left)
 *   isLocked   — true when the floor is permanently at startingBalance
 *   usedPct    — % of max drawdown already consumed (0–100)
 */
export function computeDrawdownFloor(
    account: AccountSettings,
    closedTrades: TradeSession[],
): { floor: number; buffer: number; isLocked: boolean; usedPct: number } {
    const { startingBalance, balance, drawdownType, maxDrawdownLimit, payoutLockActive } = account;
    if (!startingBalance || startingBalance === 0) {
        return { floor: 0, buffer: balance, isLocked: false, usedPct: 0 };
    }

    // Max drawdown in USD (e.g. 6% of $100K = $6,000)
    const maxDrawUSD = maxDrawdownLimit ?? startingBalance * 0.06;
    const staticFloor = startingBalance - maxDrawUSD;

    // ── Payout lock (Instant Funding only) ─────────────────────
    // Any payout request locks the floor permanently at startingBalance.
    if (payoutLockActive) {
        const buf = balance - startingBalance;
        return { floor: startingBalance, buffer: buf, isLocked: true, usedPct: buf >= 0 ? 0 : 100 };
    }

    // ── Static (2-Step Eval) ─────────────────────────────────────
    if (drawdownType === 'Static') {
        const buf = balance - staticFloor;
        return { floor: staticFloor, buffer: buf, isLocked: false, usedPct: Math.min(100, ((maxDrawUSD - buf) / maxDrawUSD) * 100) };
    }

    // Sorted closed trades (oldest first)
    const sorted = [...closedTrades]
        .filter(t => t.outcome !== 'open')
        .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());

    // ── EOD Trailing (Instant Funding) ───────────────────────────
    // Floor trails up based on end-of-day balance snapshots at 17:00 EST.
    if (drawdownType === 'EOD') {
        const dailyPnl: Record<string, number> = {};
        sorted.forEach(t => {
            const day = getTradingDay(t.closedAt ?? t.createdAt);
            dailyPnl[day] = (dailyPnl[day] ?? 0) + (t.pnl ?? 0);
        });
        let peak = startingBalance;
        let running = startingBalance;
        Object.keys(dailyPnl).sort().forEach(day => {
            running += dailyPnl[day];
            if (running > peak) peak = running;
        });
        const rawFloor = peak - maxDrawUSD;
        const isLocked = rawFloor >= startingBalance;
        const floor = isLocked ? startingBalance : Math.max(staticFloor, rawFloor);
        const buf = balance - floor;
        return { floor, buffer: buf, isLocked, usedPct: Math.min(100, Math.max(0, ((maxDrawUSD - buf) / maxDrawUSD) * 100)) };
    }

    // ── EOT Trailing (1-Step Eval) ───────────────────────────────
    // Floor trails up after each individual closed trade.
    let peak = startingBalance;
    let running = startingBalance;
    sorted.forEach(t => {
        running += t.pnl ?? 0;
        if (running > peak) peak = running;
    });
    const rawFloor = peak - maxDrawUSD;
    const isLocked = rawFloor >= startingBalance;
    const floor = isLocked ? startingBalance : Math.max(staticFloor, rawFloor);
    const buf = balance - floor;
    return { floor, buffer: buf, isLocked, usedPct: Math.min(100, Math.max(0, ((maxDrawUSD - buf) / maxDrawUSD) * 100)) };
}

export function getFuturesSpec(symbol: string): FuturesSpec | null {
    const clean = symbol.toUpperCase().replace(/[^A-Z]/g, '');
    return FUTURES_SPECS[clean] ?? null;
}

// ─── Lot size / contracts calculation ─────────────────────────
// ─── Market & Fee Constants ───────────────────────────
export const TRADEIFY_COMMISSION_RATE = 0.004; // 0.4% per leg (entry + exit = 0.8% round-trip)
export const TRADEIFY_CRYPTO_LIST = [
    'BTC', 'ETH', 'SOL', 'PEPE', 'WIF', 'BONK', 'PNUT', 'DOGE', 'SUI', 'AVAX',
    'APT', 'LINK', 'UNI', 'ADA', 'XRP', 'DOT', 'NEAR', 'FET', 'LTC', 'BCH',
    'RENDER', 'TAO', 'TIA', 'SEI', 'INJ', 'JUP', 'PYTH', 'OP', 'ARB', 'STRK'
];

export function calcPositionSize(params: {
    balance: number;
    entry: number;
    stopLoss: number;
    riskAmt: number;
    assetType: 'crypto' | 'forex' | 'futures' | 'stocks';
    symbol: string;
    isShort?: boolean;
    includeFees?: boolean;
}): { size: number; unit: string; pointValue: number; comm: number; notional: number } {
    const { entry, stopLoss, riskAmt, assetType, symbol, includeFees = true } = params;
    const priceDiff = Math.abs(entry - stopLoss);
    if (priceDiff === 0) return { size: 0, unit: 'units', pointValue: 1, comm: 0, notional: 0 };

    let rawSize = 0;
    let unit = 'units';
    let pointVal = 1;

    if (assetType === 'futures') {
        const spec = getFuturesSpec(symbol);
        if (spec) {
            rawSize = riskAmt / (priceDiff * spec.pointValue);
            unit = 'contracts';
            pointVal = spec.pointValue;
        }
    } else if (assetType === 'forex') {
        rawSize = riskAmt / (100000 * priceDiff);
        unit = 'lots';
        pointVal = 10;
    } else if (assetType === 'stocks') {
        rawSize = riskAmt / priceDiff;
        unit = 'shares';
    } else {
        rawSize = riskAmt / priceDiff;
    }

    const finalSize = assetType === 'futures'
        ? Math.max(1, Math.round(rawSize * 10) / 10)
        : Math.round(rawSize * 100) / 100;

    const notional = finalSize * entry * (assetType === 'futures' ? pointVal : 1);
    let comm = 0;

    // Tradeify 0.4% per leg × 2 (entry + exit = 0.8% round-trip)
    if (includeFees) {
        comm = notional * TRADEIFY_COMMISSION_RATE * 2;
    }

    return { size: finalSize, unit, pointValue: pointVal, comm, notional };
}
