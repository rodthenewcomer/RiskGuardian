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
    { name: 'Tradeify Crypto Eval', short: 'TrdfyE', dailyPct: 3, maxDrawPct: 6, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'EOD' },
    { name: 'Tradeify Crypto Instant', short: 'TrdfyI', dailyPct: 3, maxDrawPct: 6, color: '#A6FF4D', propFirmType: 'Instant Funding', drawdownType: 'Static' },
    { name: 'Funding Pips', short: 'FPips', dailyPct: 5, maxDrawPct: 10, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'FTMO', short: 'FTMO', dailyPct: 5, maxDrawPct: 10, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'The5%ers', short: '5%ers', dailyPct: 4, maxDrawPct: 6, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'Custom (Build your own)', short: 'Custom', dailyPct: 0, maxDrawPct: 0, color: '#888', drawdownType: 'EOD' },
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
}

export interface DailySession {
    date: string;
    riskUsed: number;
    tradesPlanned: number;
    guardTriggered: boolean;
}

interface AppState {
    hasOnboarded: boolean;
    account: AccountSettings;
    trades: TradeSession[];
    dailySessions: DailySession[];
    activeTab: 'dashboard' | 'terminal' | 'bridge' | 'calculator' | 'plan' | 'journal' | 'analytics' | 'settings';

    // Actions
    completeOnboarding: () => void;
    resetOnboarding: () => void;
    updateAccount: (settings: Partial<AccountSettings>) => void;
    addTrade: (trade: TradeSession) => void;
    updateTradeOutcome: (id: string, outcome: 'win' | 'loss') => void;
    setActiveTab: (tab: AppState['activeTab']) => void;
    getTodayRiskUsed: () => number;
    getDailyRiskRemaining: () => number;
    addDailyRisk: (amount: number) => void;
    resetTodaySession: () => void;
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

const today = () => getESTDate();

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            hasOnboarded: false,
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

            completeOnboarding: () => set({ hasOnboarded: true }),

            resetOnboarding: () => set({
                hasOnboarded: false,
                account: { balance: 0, dailyLossLimit: 0, maxRiskPercent: 1, assetType: 'crypto', currency: 'USD', propFirmType: 'Instant Funding', drawdownType: 'EOD', leverage: 2, startingBalance: 0, highestBalance: 0, isConsistencyActive: false },
                trades: [],
                dailySessions: [],
                activeTab: 'dashboard',
            }),

            updateAccount: (settings) =>
                set((s) => ({ account: { ...s.account, ...settings } })),

            addTrade: (trade) =>
                set((s) => ({ trades: [trade, ...s.trades] })),

            updateTradeOutcome: (id, outcome) =>
                set((s) => ({
                    trades: s.trades.map((t) => (t.id === id ? { ...t, outcome } : t)),
                })),

            setActiveTab: (tab) => set({ activeTab: tab }),

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
        }),
        {
            name: 'riskguardia-v2',
            partialize: (s) => ({
                hasOnboarded: s.hasOnboarded,
                account: s.account,
                trades: s.trades.slice(0, 100),
                dailySessions: s.dailySessions.slice(-30),
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

export function getFuturesSpec(symbol: string): FuturesSpec | null {
    const clean = symbol.toUpperCase().replace(/[^A-Z]/g, '');
    return FUTURES_SPECS[clean] ?? null;
}

// ─── Lot size / contracts calculation ─────────────────────────
// ─── Market & Fee Constants ───────────────────────────
export const TRADEIFY_COMMISSION_RATE = 0.0004; // 0.04%
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
    const { entry, stopLoss, riskAmt, assetType, symbol, isShort = false, includeFees = true } = params;
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

    // Tradeify 0.04% Fee Logic
    if (includeFees) {
        comm = notional * TRADEIFY_COMMISSION_RATE;
    }

    return { size: finalSize, unit, pointValue: pointVal, comm, notional };
}
