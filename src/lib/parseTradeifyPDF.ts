/**
 * Tradeify PDF Statement Parser — v3
 * ────────────────────────────────────────────────────────────
 * Parses the "Single-Currency account statement" PDF from Tradeify.
 *
 * Key observations from real statements:
 *  • Date format is DD/MM/YYYY (e.g. 06/03/2026 = 6 March 2026)
 *  • Transaction IDs like "83251:864078" are split across two visual
 *    lines in the PDF table cell — row-grouping approaches fail.
 *  • Opening trades have "—" (em dash) in the Settled PnL column.
 *  • Closing trades have a numeric Settled PnL value.
 *  • Column order after Order ID: Settled PnL | Commission | Financing
 *  • Commission is charged on BOTH the open and close leg.
 *  • True net PnL = Settled PnL − commission_close − commission_open
 *
 * Strategy: extract ALL text as a flat token stream, anchor on
 * DD/MM/YYYY date patterns, then extract direction / symbol /
 * size / price / PnL / commission from the surrounding context window.
 * No row grouping needed — works regardless of PDF cell wrapping.
 */

import type { TradeSession } from '@/store/appStore';

// ── Types ──────────────────────────────────────────────────────

interface RawTx {
    txId: string;
    dateISO: string;            // YYYY-MM-DDTHH:MM:00
    direction: 'Buy' | 'Sell';
    size: number;
    baseSymbol: string;
    price: number;
    settledPnl: number | null;  // null = opening transaction
    commission: number;         // always present for both legs
}

// ── Constants ──────────────────────────────────────────────────

const KNOWN_SYMBOLS = [
    'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'PEPE', 'WIF', 'BONK', 'PNUT',
    'SUI', 'AVAX', 'APT', 'LINK', 'UNI', 'ADA', 'DOT', 'NEAR', 'FET',
    'LTC', 'BCH', 'RENDER', 'TAO', 'TIA', 'SEI', 'INJ', 'JUP', 'PYTH',
    'OP', 'ARB', 'STRK',
];
const SYMBOL_RE = new RegExp(`\\b(${KNOWN_SYMBOLS.join('|')})\\b`, 'i');

// ── Date helper (DD/MM/YYYY) ───────────────────────────────────

function toISO(dateStr: string, timeStr: string): string {
    const [d, m, y] = dateStr.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timeStr}:00`;
}

// ── Transaction extractor ──────────────────────────────────────

function extractTransactions(tableText: string): RawTx[] {
    const results: RawTx[] = [];
    // Tradeify dates: DD/MM/YYYY
    const DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/g;
    let dm: RegExpExecArray | null;

    while ((dm = DATE_RE.exec(tableText)) !== null) {
        const dateStr = dm[1];
        const [, , y] = dateStr.split('/');
        if (parseInt(y) < 2020 || parseInt(y) > 2035) continue;

        // Context: 10 chars before (to catch time on same row) + 250 after
        const ctx = tableText.slice(Math.max(0, dm.index - 10), dm.index + 250);

        const timeM = ctx.match(/\b(\d{2}:\d{2})\b/);
        const dirM  = ctx.match(/\b(Buy|Sell)\b/);
        const symM  = ctx.match(SYMBOL_RE);
        if (!timeM || !dirM || !symM) continue;

        // Everything after the direction keyword
        const dirIdx = ctx.indexOf(dirM[1]) + dirM[1].length;
        const afterDir = ctx.slice(dirIdx);

        // Extract all positive numbers (size, price, optional order ID, optional PnL, commission)
        const numTokens = [...afterDir.matchAll(/([\d,]+\.?\d*)/g)]
            .map(n => parseFloat(n[1].replace(/,/g, '')))
            .filter(n => !isNaN(n) && isFinite(n) && n > 0);

        if (numTokens.length < 2) continue;

        const size  = numTokens[0];
        const price = numTokens[1];

        // ── Determine open vs close, extract commission ────────
        // Columns after direction: Size Symbol Price OrderID SettledPnl Commission Financing
        // Find the 6-digit Order ID (space-delimited, not part of a decimal)
        const orderM = afterDir.match(/\s(\d{6})(?=\s|$)/);
        let settledPnl: number | null = null;
        let commission = 0;

        if (orderM) {
            const afterOrder = afterDir
                .slice(afterDir.indexOf(orderM[0]) + orderM[0].length)
                .trimStart();

            let restForCommission: string;

            // Em dash, en dash, or minus-sign NOT followed by digit → opening (no PnL)
            if (/^[—–−]/.test(afterOrder) || /^-(?!\d)/.test(afterOrder)) {
                settledPnl = null;
                // Skip the em-dash; commission is the next number
                restForCommission = afterOrder.replace(/^[—–−]\s*/, '');
            } else {
                // First token = Settled PnL (can be negative)
                const pnlM = afterOrder.match(/^(-?[\d,]+\.?\d{1,2})/);
                if (pnlM) {
                    settledPnl = parseFloat(pnlM[1].replace(/,/g, ''));
                    restForCommission = afterOrder.slice(pnlM[0].length).trimStart();
                } else {
                    restForCommission = afterOrder;
                }
            }

            // Commission: first number in restForCommission.
            // Order-ID suffixes are ≥ 6 digits (≥ 100 000) so the < 10 000 guard
            // safely excludes them while capturing realistic commission amounts.
            const commM = restForCommission.match(/([\d,]+\.?\d*)/);
            if (commM) {
                const val = parseFloat(commM[1].replace(/,/g, ''));
                if (val < 10000) commission = val;
            }
        }

        results.push({
            txId: `${dateStr.replace(/\//g, '')}-${timeM[1].replace(':', '')}-${dirM[1]}-${symM[1]}`,
            dateISO: toISO(dateStr, timeM[1]),
            direction: dirM[1] as 'Buy' | 'Sell',
            size,
            baseSymbol: symM[1].toUpperCase(),
            price,
            settledPnl,
            commission,
        });
    }

    return results;
}

// ── FIFO trade builder ─────────────────────────────────────────

function buildTrades(rawTxs: RawTx[]): Omit<TradeSession, 'note'>[] {
    const sorted = [...rawTxs].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const stacks = new Map<string, RawTx[]>();
    const trades: Omit<TradeSession, 'note'>[] = [];

    for (const tx of sorted) {
        const key = tx.baseSymbol;

        if (tx.settledPnl !== null) {
            // ── Closing transaction ──────────────────────────
            const stack = stacks.get(key) ?? [];
            const idx = stack.findIndex(o =>
                o.direction !== tx.direction &&
                Math.abs(o.size - tx.size) / Math.max(o.size, tx.size) < 0.05
            );
            const open = idx >= 0 ? stack.splice(idx, 1)[0] : stack.shift();
            if (stack.length > 0) stacks.set(key, stack); else stacks.delete(key);

            // Net PnL = gross settled PnL − commission on close leg − commission on open leg
            const pnl = tx.settledPnl - tx.commission - (open?.commission ?? 0);
            const isShort = open ? open.direction === 'Sell' : tx.direction === 'Buy';

            trades.push({
                id: `tradeify-${tx.txId}-${Date.now() + trades.length}`,
                asset: tx.baseSymbol,
                assetType: 'crypto',
                entry: open?.price ?? tx.price,
                stopLoss: 0,
                takeProfit: tx.price,
                lotSize: tx.size,
                riskUSD: pnl < 0 ? Math.abs(pnl) : 0,
                rewardUSD: pnl > 0 ? pnl : 0,
                rr: 0,
                outcome: pnl > 0 ? 'win' : 'loss',
                createdAt: open?.dateISO ?? tx.dateISO,
                closedAt: tx.dateISO,
                pnl,
                isShort,
            });
        } else {
            // ── Opening transaction ──────────────────────────
            if (!stacks.has(key)) stacks.set(key, []);
            stacks.get(key)!.push(tx);
        }
    }

    return trades;
}

// ── Public API ─────────────────────────────────────────────────

export async function parseTradeifyPDF(
    file: File
): Promise<{ trades: Omit<TradeSession, 'note'>[]; count: number; error?: string }> {
    try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

        // ── Extract all text items with absolute position ────
        type TI = { str: string; x: number; absY: number };
        const items: TI[] = [];

        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const vp   = page.getViewport({ scale: 1 });
            const content = await page.getTextContent();

            for (const item of content.items) {
                if ('str' in item && item.str.trim()) {
                    items.push({
                        str: item.str.trim(),
                        x: item.transform[4],
                        absY: (p - 1) * 20000 + (vp.height - item.transform[5]),
                    });
                }
            }
        }

        // Sort top-to-bottom, left-to-right; merge adjacent items
        items.sort((a, b) =>
            Math.abs(a.absY - b.absY) < 4 ? a.x - b.x : a.absY - b.absY
        );

        const fullText = items.map(i => i.str).join(' ');

        // ── Locate the Transactions table ────────────────────
        // Look for "Transactions" header; fall back to full text
        const txIdx = fullText.search(/\bTransactions\b/i);
        const txText = txIdx >= 0 ? fullText.slice(txIdx) : fullText;

        // Trim at footer markers
        const footerIdx = txText.search(/\bTotals\b|\bFinancing\b/i);
        const tableText = footerIdx > 0 ? txText.slice(0, footerIdx) : txText;

        // ── Parse and build trades ───────────────────────────
        const rawTxs = extractTransactions(tableText);

        if (rawTxs.length === 0) {
            return {
                trades: [], count: 0,
                error: 'No transactions found. Make sure this is a Tradeify single-currency account statement.',
            };
        }

        const trades = buildTrades(rawTxs);
        return { trades, count: trades.length };

    } catch (e) {
        return {
            trades: [], count: 0,
            error: `Parse failed: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}
