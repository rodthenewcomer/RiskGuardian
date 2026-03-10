/**
 * PropGuard Bridge API — Vercel-Production-Ready
 * ─────────────────────────────────────────────────────────────────
 * Uses Vercel KV (Redis) when available, falls back to in-memory
 * for local dev. Zero env vars needed for local dev.
 * For production: connect a KV store in the Vercel dashboard.
 *
 * POST /api/bridge  — Ingest trade from bridge client
 * GET  /api/bridge  — Poll status + recent trades
 * DELETE /api/bridge — Clear session
 */

import { NextRequest, NextResponse } from 'next/server';

// ── In-memory rate limiter: max 20 req / 60s per IP ──────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
        return true;
    }
    if (entry.count >= 20) return false;
    entry.count++;
    return true;
}

// Prune stale entries every 5 minutes to prevent memory leak
setInterval(() => {
    const now = Date.now();
    rateLimitMap.forEach((v, k) => { if (now > v.resetAt) rateLimitMap.delete(k); });
}, 5 * 60_000);

// ── Types ──────────────────────────────────────────────────────────
export interface BridgeTrade {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL' | 'UNKNOWN';
    lots: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    accountBalance: number;
    dailyLossLimit: number;
    maxDrawdownLimit: number;
    platform: string;
    method: 'log' | 'memory' | 'screen' | 'manual' | 'api';
    timestamp: string;
    ai?: {
        riskUSD: number;
        riskPct: number;
        remainingDailyUSD: number;
        rrRatio: number;
        survivalStatus: 'safe' | 'caution' | 'danger' | 'critical';
        approved: boolean;
        warnings: string[];
        recommendation: string;
    };
}

// ── Storage: Vercel KV (production) OR in-memory (local dev) ──────
// Local dev requires NO env vars — uses the fallback automatically.
// Production: In Vercel dashboard → Storage → Create KV → link project.
// Vercel auto-injects KV_URL + KV_REST_API_URL + KV_REST_API_TOKEN.

const MAX_TRADES = 50;
const STALE_MS = 30_000;

// The single API key for personal use — change this to something secret
// Set BRIDGE_API_KEY env var on Vercel to override this default
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || 'rg-bridge-local-dev';

// ── In-memory fallback (local dev) ────────────────────────────────
declare global {
    // eslint-disable-next-line no-var
    var _bridgeMem: { trades: BridgeTrade[]; lastPing: number } | undefined;
}
if (!global._bridgeMem) {
    global._bridgeMem = { trades: [], lastPing: 0 };
}

// ── Storage helpers: in-memory (local dev + production serverless) ─
// @vercel/kv removed — use in-memory global which persists across warm
// lambda invocations. For durable KV, add your own adapter here.
async function getTrades(): Promise<BridgeTrade[]> {
    return global._bridgeMem!.trades;
}

async function saveTrades(trades: BridgeTrade[]): Promise<void> {
    global._bridgeMem!.trades = trades;
    global._bridgeMem!.lastPing = Date.now();
}

async function getLastPing(): Promise<number> {
    return global._bridgeMem!.lastPing;
}

// ── AI Risk Analyzer ──────────────────────────────────────────────
function analyzeIncoming(trade: BridgeTrade): BridgeTrade['ai'] {
    const stopDist = Math.abs(trade.entry - trade.stopLoss);
    const riskUSD = stopDist * trade.lots;
    const riskPct = trade.accountBalance > 0 ? (riskUSD / trade.accountBalance) * 100 : 0;
    const tpDist = trade.takeProfit > 0 ? Math.abs(trade.takeProfit - trade.entry) : stopDist * 2;
    const rrRatio = stopDist > 0 ? tpDist / stopDist : 0;
    const remainingDailyUSD = Math.max(0, trade.dailyLossLimit - riskUSD);

    const warnings: string[] = [];
    if (riskUSD > trade.dailyLossLimit) warnings.push(`Risk $${riskUSD.toFixed(0)} exceeds daily limit $${trade.dailyLossLimit}`);
    if (riskPct > 3) warnings.push(`Risk ${riskPct.toFixed(1)}% exceeds 3% threshold`);
    if (rrRatio > 0 && rrRatio < 1.5) warnings.push(`R:R ${rrRatio.toFixed(1)} is below 1.5 minimum`);
    if (riskUSD > (trade.accountBalance || 0) * 0.05) warnings.push('Trade risk exceeds 5% of balance');

    const survivalStatus =
        warnings.length === 0 ? 'safe' as const :
            warnings.length === 1 ? 'caution' as const :
                warnings.length === 2 ? 'danger' as const : 'critical' as const;

    return {
        riskUSD: Math.round(riskUSD * 100) / 100,
        riskPct: Math.round(riskPct * 100) / 100,
        remainingDailyUSD: Math.round(remainingDailyUSD * 100) / 100,
        rrRatio: Math.round(rrRatio * 100) / 100,
        survivalStatus,
        approved: warnings.length === 0,
        warnings,
        recommendation: survivalStatus === 'safe'
            ? `Approved. Risk $${riskUSD.toFixed(0)} (${riskPct.toFixed(1)}%). Daily remaining: $${remainingDailyUSD.toFixed(0)}.`
            : `${warnings[0]} — reduce size to stay within rules.`
    };
}

// ── Auth ──────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
    const auth = req.headers.get('authorization');
    if (!auth) return false;
    const key = auth.replace('Bearer ', '').trim();
    return key === BRIDGE_API_KEY;
}

// ── POST — Receive trade ──────────────────────────────────────────
export async function POST(req: NextRequest) {
    // Rate limit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(ip)) {
        return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
    }
    // Request size guard (max 50KB)
    const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
    if (contentLength > 50_000) {
        return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized. Include Authorization: Bearer ' + BRIDGE_API_KEY }, { status: 401 });
    }

    let body: Partial<BridgeTrade>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    if (!body.symbol || !body.entry) {
        return NextResponse.json({ error: 'Required: symbol, entry' }, { status: 400 });
    }

    const trade: BridgeTrade = {
        id: crypto.randomUUID?.() || String(Date.now()),
        symbol: (body.symbol || 'UNKNOWN').toUpperCase(),
        direction: body.direction || 'UNKNOWN',
        lots: body.lots || 0,
        entry: body.entry || 0,
        stopLoss: body.stopLoss || 0,
        takeProfit: body.takeProfit || 0,
        accountBalance: body.accountBalance || 0,
        dailyLossLimit: body.dailyLossLimit || 0,
        maxDrawdownLimit: body.maxDrawdownLimit || 0,
        platform: body.platform || 'Unknown',
        method: body.method || 'api',
        timestamp: new Date().toISOString(),
    };

    if (trade.entry > 0 && trade.stopLoss > 0 && trade.lots > 0) {
        trade.ai = analyzeIncoming(trade);
    }

    const existing = await getTrades();
    const updated = [trade, ...existing].slice(0, MAX_TRADES);
    await saveTrades(updated);

    return NextResponse.json({ success: true, tradeId: trade.id, ai: trade.ai }, { status: 201 });
}

// ── GET — Poll status ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const [trades, lastPing] = await Promise.all([getTrades(), getLastPing()]);
    const connected = (Date.now() - lastPing) < STALE_MS;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);

    return NextResponse.json({
        connected,
        lastPing,
        tradeCount: trades.length,
        trades: trades.slice(0, limit),
        storage: 'in-memory'
    });
}

// ── DELETE — Clear session ────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await saveTrades([]);
    return NextResponse.json({ success: true, message: 'Session cleared.' });
}
