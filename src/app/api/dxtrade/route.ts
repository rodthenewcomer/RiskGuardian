/**
 * DXTrade REST API — Server-Side Proxy
 * ─────────────────────────────────────────────────────────────────
 * All DXTrade calls go through here so:
 *   1. Credentials and tokens are proxied, not CORS-blocked
 *   2. We can add server-level caching / rate-limit protection later
 *
 * Supported actions (POST body):
 *   login      → POST /login                          (username, domain, password)
 *   users      → GET  /users/{username}               (token, username)
 *   metrics    → GET  /accounts/{code}/metrics        (token, accountCode)
 *   positions  → GET  /accounts/{code}/positions      (token, accountCode)
 *   history    → GET  /accounts/{code}/orders/history (token, accountCode, fromDate?)
 *   ping       → POST /ping                           (token)
 */

import { NextRequest, NextResponse } from 'next/server';

// ── In-memory rate limiter: max 20 req / 60s per IP ──────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
        return true; // allowed
    }
    if (entry.count >= 20) return false; // rate limited
    entry.count++;
    return true;
}

// Prune stale entries every 5 minutes to prevent memory leak
setInterval(() => {
    const now = Date.now();
    rateLimitMap.forEach((v, k) => { if (now > v.resetAt) rateLimitMap.delete(k); });
}, 5 * 60_000);

const DXTRADE_PATH = '/dxsca-web';

/** Encode for URL path — keeps colons unencoded (safe in path segments per RFC 3986) */
function encodeAccount(code: string) {
    return encodeURIComponent(code).replace(/%3A/gi, ':');
}

function authHeader(token: string) {
    return { 'Authorization': `DXAPI ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' };
}

async function dxFetch(url: string, init: RequestInit = {}) {
    const res = await fetch(url, {
        ...init,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    return res;
}

/** Standard 429 response — shown on ALL actions, not just metrics */
const rateLimitError = NextResponse.json({
    error: 'RATE LIMITED by DXTrade. STOP retrying — every attempt resets the ban timer. Wait 30–60 minutes without touching the Connect button, then try once.',
}, { status: 429 });

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
    // CORS — only allow same origin
    const origin = req.headers.get('origin');
    const host = req.headers.get('host') ?? '';
    const allowedOrigins = [`http://${host}`, `https://${host}`, 'http://localhost:3000'];
    if (origin && !allowedOrigins.some(o => origin.startsWith(o))) {
        return NextResponse.json({ error: 'CORS: origin not allowed' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action, server, token, accountCode, username, ...rest } = body as Record<string, string>;

    if (!server) return NextResponse.json({ error: 'DXTrade server URL is required' }, { status: 400 });
    const base = `https://${server}${DXTRADE_PATH}`;

    try {
        switch (action) {

            /* ── Auth ─────────────────────────────────────────────── */
            case 'login': {
                const { domain, password } = rest;
                if (!username || !password) {
                    return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
                }
                const res = await dxFetch(`${base}/login`, {
                    method: 'POST',
                    body: JSON.stringify({ username, domain: domain || 'default', password }),
                });
                // ⚠ Detect 429 BEFORE trying to parse — a rate-limited login looks like
                // "Login failed" otherwise and causes the user to retry, resetting the timer.
                if (res.status === 429) return rateLimitError;
                const text = await res.text();
                if (!res.ok) {
                    let desc = `Login failed (HTTP ${res.status})`;
                    try { desc = JSON.parse(text).description || desc; } catch { /* */ }
                    return NextResponse.json({ error: desc }, { status: 401 });
                }
                const data = JSON.parse(text);
                // DXTrade may return the session token under different field names
                const sessionToken = data.token ?? data.userSession ?? data.sessionToken ?? data.sessionId ?? data.access_token;
                if (!sessionToken) {
                    console.error('[DXTrade login] Unexpected response shape:', JSON.stringify(data));
                    return NextResponse.json({ error: 'No token in login response', _raw: data }, { status: 502 });
                }
                return NextResponse.json({ token: sessionToken });
            }

            case 'ping': {
                if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 });
                const res = await dxFetch(`${base}/ping`, { method: 'POST', headers: authHeader(token) });
                if (res.status === 429) return rateLimitError;
                return NextResponse.json({ ok: true });
            }

            /* ── User / account discovery ─────────────────────────── */
            case 'users': {
                if (!token || !username) return NextResponse.json({ error: 'Token and username required' }, { status: 400 });
                const res = await dxFetch(`${base}/users/${encodeURIComponent(username)}`, {
                    headers: authHeader(token),
                });
                if (res.status === 429) return rateLimitError;
                if (!res.ok) {
                    const err = await res.json().catch(() => ({})) as { description?: string };
                    return NextResponse.json({ error: err.description || 'Failed to fetch user info' }, { status: res.status });
                }
                return NextResponse.json(await res.json());
            }

            /* ── Account data ─────────────────────────────────────── */
            case 'metrics': {
                if (!token || !accountCode) return NextResponse.json({ error: 'Token and accountCode required' }, { status: 400 });
                const res = await dxFetch(
                    `${base}/accounts/${encodeAccount(accountCode)}/metrics`,
                    { headers: authHeader(token) },
                );
                if (res.status === 429) return rateLimitError;
                if (!res.ok) {
                    const err = await res.json().catch(() => ({})) as { description?: string };
                    return NextResponse.json({ error: err.description || 'Failed to fetch metrics' }, { status: res.status });
                }
                return NextResponse.json(await res.json());
            }

            case 'positions': {
                if (!token || !accountCode) return NextResponse.json({ error: 'Token and accountCode required' }, { status: 400 });
                const res = await dxFetch(
                    `${base}/accounts/${encodeAccount(accountCode)}/positions`,
                    { headers: authHeader(token) },
                );
                if (res.status === 429) return rateLimitError;
                if (!res.ok) {
                    const err = await res.json().catch(() => ({})) as { description?: string };
                    return NextResponse.json({ error: err.description || 'Failed to fetch positions' }, { status: res.status });
                }
                return NextResponse.json(await res.json());
            }

            case 'history': {
                if (!token || !accountCode) return NextResponse.json({ error: 'Token and accountCode required' }, { status: 400 });
                const { fromDate, limit = '200' } = rest; // reduced from 500 — large payloads can trigger rate limits
                const params = new URLSearchParams({ 'in-status': 'COMPLETED', limit });
                if (fromDate) params.set('transaction-from', fromDate);
                const res = await dxFetch(
                    `${base}/accounts/${encodeAccount(accountCode)}/orders/history?${params}`,
                    { headers: authHeader(token) },
                );
                if (res.status === 429) return rateLimitError;
                if (!res.ok) {
                    const err = await res.json().catch(() => ({})) as { description?: string };
                    return NextResponse.json({ error: err.description || 'Failed to fetch order history' }, { status: res.status });
                }
                return NextResponse.json(await res.json());
            }

            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (e) {
        console.error('[DXTrade proxy]', e);
        return NextResponse.json(
            { error: `Proxy error: ${e instanceof Error ? e.message : String(e)}` },
            { status: 502 },
        );
    }
}
