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

export async function POST(req: NextRequest) {
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
                const text = await res.text();
                if (!res.ok) {
                    let desc = `Login failed (HTTP ${res.status})`;
                    try { desc = JSON.parse(text).description || desc; } catch { /* */ }
                    return NextResponse.json({ error: desc }, { status: 401 });
                }
                const data = JSON.parse(text);
                // DXTrade may return the session token under different field names
                const token = data.token ?? data.userSession ?? data.sessionToken ?? data.sessionId ?? data.access_token;
                if (!token) {
                    console.error('[DXTrade login] Unexpected response shape:', JSON.stringify(data));
                    return NextResponse.json({ error: 'No token in login response', _raw: data }, { status: 502 });
                }
                return NextResponse.json({ token });
            }

            case 'ping': {
                if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 });
                await dxFetch(`${base}/ping`, { method: 'POST', headers: authHeader(token) });
                return NextResponse.json({ ok: true });
            }

            /* ── User / account discovery ─────────────────────────── */
            case 'users': {
                if (!token || !username) return NextResponse.json({ error: 'Token and username required' }, { status: 400 });
                const res = await dxFetch(`${base}/users/${encodeURIComponent(username)}`, {
                    headers: authHeader(token),
                });
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
                if (!res.ok) {
                    if (res.status === 429) return NextResponse.json({ error: 'Rate limited by DXTrade — please wait a few minutes and try again' }, { status: 429 });
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
                if (!res.ok) {
                    const err = await res.json().catch(() => ({})) as { description?: string };
                    return NextResponse.json({ error: err.description || 'Failed to fetch positions' }, { status: res.status });
                }
                return NextResponse.json(await res.json());
            }

            case 'history': {
                if (!token || !accountCode) return NextResponse.json({ error: 'Token and accountCode required' }, { status: 400 });
                const { fromDate, limit = '500' } = rest;
                const params = new URLSearchParams({ 'in-status': 'COMPLETED', limit });
                if (fromDate) params.set('transaction-from', fromDate);
                const res = await dxFetch(
                    `${base}/accounts/${encodeAccount(accountCode)}/orders/history?${params}`,
                    { headers: authHeader(token) },
                );
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
