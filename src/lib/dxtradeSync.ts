/**
 * DXTrade ↔ RiskGuardian sync utilities
 * ─────────────────────────────────────────────────────────────────
 * Handles:
 *   • Logging in and discovering the account code
 *   • Converting DXTrade Order objects → TradeSession
 *   • Converting DXTrade Position objects → TradeSession (open)
 *   • Fetching live metrics, positions, and order history
 */

import type { TradeSession } from '@/store/appStore';

// ── DXTrade API response shapes (subset) ─────────────────────────

export interface DXMetrics {
    account: string;
    equity: number;
    balance: number;
    availableBalance: number;
    availableFunds: number;
    openPl: number;
    totalPl: number;
    margin: number;
    openPositionsCount: number;
    openOrdersCount: number;
}

export interface DXAccountDetail {
    account: string;
    baseCurrency: string;
    accountStatus: string;
    registrationTime: string;
}

export interface DXUser {
    login: string;
    domain: string;
    username: string;
    fullName: string;
    accounts: DXAccountDetail[];
}

interface DXLeg {
    instrument: string;
    positionEffect?: 'OPEN' | 'CLOSE';
    positionCode?: string;
    price?: number;
    quantity: number;
    filledQuantity: number;
    averagePrice: number;
}

interface DXCashTx {
    type: 'SETTLEMENT' | 'COMMISSION' | 'FINANCING' | 'DEPOSIT' | 'WITHDRAWAL' | string;
    value: number;
    currency: string;
    transactionTime: string;
}

interface DXOrder {
    orderId: number;
    orderCode: string;
    clientOrderId?: string;
    instrument: string;
    side: 'BUY' | 'SELL';
    status: string;
    finalStatus: boolean;
    issueTime: string;
    transactionTime: string;
    legs: DXLeg[];
    cashTransactions?: DXCashTx[];
}

export interface DXPosition {
    positionCode: string;
    symbol: string;
    quantity: number;
    side: 'BUY' | 'SELL';
    openTime: string;
    openPrice: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
}

// ── Symbol normalization ──────────────────────────────────────────

/** "BTCUSD" → "BTC", "ETHUSD" → "ETH", "SOLUSDT" → "SOL" */
function normalizeSymbol(raw: string): string {
    return raw.replace(/USDT$/, '').replace(/USDC$/, '').replace(/USD$/, '');
}

// ── DXTrade Order → TradeSession ─────────────────────────────────

/**
 * Converts a completed DXTrade order to a RiskGuardian TradeSession.
 *
 * Position-based accounts:
 *   - OPEN orders open a position (no realized P&L yet) → skip
 *   - CLOSE orders close a position and carry SETTLEMENT cash transactions → convert
 *
 * Net-based accounts:
 *   - All COMPLETED orders can carry P&L → convert if cash transactions exist
 */
export function dxOrderToTrade(order: DXOrder): TradeSession | null {
    if (!order.finalStatus || order.status !== 'COMPLETED') return null;

    const leg = order.legs?.[0];
    if (!leg || leg.filledQuantity === 0) return null;

    // For position-based: skip pure OPEN orders (no P&L yet)
    if (leg.positionEffect === 'OPEN') return null;

    const txs = order.cashTransactions ?? [];

    // Net P&L = sum of all SETTLEMENT + COMMISSION values (both are signed)
    const pnl = txs
        .filter(tx => tx.type === 'SETTLEMENT' || tx.type === 'COMMISSION')
        .reduce((sum, tx) => sum + tx.value, 0);

    // If no cash transactions, we can't determine P&L reliably → skip
    if (txs.length === 0) return null;

    const asset = normalizeSymbol(order.instrument);

    // When closing a position:
    //   BUY to close → was SHORT (isShort = true)
    //   SELL to close → was LONG (isShort = false)
    const isShort = order.side === 'BUY';

    return {
        id: `dxtrade-${order.orderId}`,
        asset,
        assetType: 'crypto',
        entry: leg.averagePrice || leg.price || 0,
        stopLoss: 0,
        takeProfit: 0,
        lotSize: leg.filledQuantity,
        riskUSD: pnl < 0 ? Math.abs(pnl) : 0,
        rewardUSD: pnl > 0 ? pnl : 0,
        rr: 0,
        outcome: pnl >= 0 ? 'win' : 'loss',
        createdAt: order.issueTime,
        closedAt: order.transactionTime,
        pnl,
        isShort,
        note: `[DXTrade] ${order.orderCode}`,
    };
}

// ── DXTrade Position → open TradeSession ─────────────────────────

export function dxPositionToTrade(pos: DXPosition): TradeSession {
    return {
        id: `dxtrade-pos-${pos.positionCode}`,
        asset: normalizeSymbol(pos.symbol),
        assetType: 'crypto',
        entry: pos.openPrice,
        stopLoss: pos.stopLossPrice ?? 0,
        takeProfit: pos.takeProfitPrice ?? 0,
        lotSize: pos.quantity,
        riskUSD: 0,
        rewardUSD: 0,
        rr: 0,
        outcome: 'open',
        createdAt: pos.openTime,
        isShort: pos.side === 'SELL',
        pnl: 0,
        note: '[DXTrade] open position',
    };
}

// ── API proxy helpers ─────────────────────────────────────────────

export interface DXConfig {
    server: string;
    token: string;
    accountCode: string;
    username: string;
}

async function proxyCall(config: Partial<DXConfig> & { server: string }, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch('/api/dxtrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action,
            server: config.server,
            token: config.token,
            accountCode: config.accountCode,
            username: config.username,
            ...extra,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `DXTrade error ${res.status}`);
    return data;
}

// ── Public API ────────────────────────────────────────────────────

/** Step 1 of connect flow: authenticate and get session token */
export async function dxLogin(server: string, username: string, domain: string, password: string): Promise<string> {
    const data = await proxyCall({ server }, 'login', { username, domain, password });
    if (!data.token) throw new Error(`No token returned from DXTrade${data._raw ? ` — raw response: ${JSON.stringify(data._raw)}` : ''}`);
    return data.token as string;
}

/** Step 2: discover accounts owned by this user */
export async function dxGetUser(server: string, token: string, username: string): Promise<DXUser> {
    return proxyCall({ server, token, username }, 'users') as Promise<DXUser>;
}

/** Fetch live account metrics (balance, equity, P&L) */
export async function dxGetMetrics(config: DXConfig): Promise<DXMetrics> {
    return proxyCall(config, 'metrics') as Promise<DXMetrics>;
}

/** Fetch all open positions */
export async function dxGetPositions(config: DXConfig): Promise<TradeSession[]> {
    const data = await proxyCall(config, 'positions');
    const positions: DXPosition[] = (data.positions as DXPosition[]) ?? [];
    return positions.map(dxPositionToTrade);
}

/** Fetch closed trade history, optionally from a start date */
export async function dxGetHistory(config: DXConfig, fromDate?: string): Promise<TradeSession[]> {
    const data = await proxyCall(config, 'history', fromDate ? { fromDate } : {});
    const orders: DXOrder[] = (data.orders as DXOrder[]) ?? [];
    return orders.map(dxOrderToTrade).filter((t): t is TradeSession => t !== null);
}

/** Keep session alive */
export async function dxPing(config: Pick<DXConfig, 'server' | 'token'>) {
    await proxyCall(config, 'ping');
}

// ── Full connect & initial sync ───────────────────────────────────

export interface DXConnectResult {
    token: string;
    accountCode: string;
    fullName: string;
    balance: number;
    equity: number;
    openPl: number;
    trades: TradeSession[];
    positions: TradeSession[];
}

/**
 * Full connect flow:
 *   1. Login → token
 *   2. Get user → account code
 *   3. Get metrics → live balance
 *   4. Get history → closed trades (last 90 days)
 *   5. Get positions → open trades
 */
export async function dxConnect(
    server: string,
    username: string,
    domain: string,
    password: string,
    onProgress?: (msg: string) => void,
): Promise<DXConnectResult> {
    onProgress?.('Authenticating with DXTrade…');
    const token = await dxLogin(server, username, domain, password);

    onProgress?.('Fetching account info…');
    const user = await dxGetUser(server, token, username);
    const activeAccount = user.accounts?.find(a => a.accountStatus === 'FULL_TRADING') ?? user.accounts?.[0];
    if (!activeAccount) throw new Error('No active trading accounts found on this DXTrade account');
    const accountCode = activeAccount.account;

    const config: DXConfig = { server, token, accountCode, username };

    onProgress?.('Fetching live balance…');
    const metrics = await dxGetMetrics(config);

    onProgress?.('Syncing trade history…');
    // Fetch last 90 days by default
    const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const trades = await dxGetHistory(config, fromDate);

    onProgress?.('Fetching open positions…');
    const positions = await dxGetPositions(config);

    return {
        token,
        accountCode,
        fullName: user.fullName || username,
        balance: metrics.balance,
        equity: metrics.equity,
        openPl: metrics.openPl,
        trades,
        positions,
    };
}
