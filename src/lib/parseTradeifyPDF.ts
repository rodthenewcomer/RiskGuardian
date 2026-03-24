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
        const numPattern = /([\d,]+\.?\d*)/g;
        const numTokens: number[] = [];
        let numMatch;
        while ((numMatch = numPattern.exec(afterDir)) !== null) {
            const n = parseFloat(numMatch[1].replace(/,/g, ''));
            if (!isNaN(n) && isFinite(n) && n > 0) {
                numTokens.push(n);
            }
        }

        if (numTokens.length < 2) continue;

        const size  = numTokens[0];
        const price = numTokens[1];

        // ── Determine open vs close, extract commission ────────
        // Columns after direction: Size Symbol Price OrderID SettledPnl Commission Financing
        // Find the 6-digit Order ID (space-delimited, not part of a decimal)
        const orderM = afterDir.match(/\s(\d{6,8})(?=\s|$)/);
        let settledPnl: number | null = null;
        let commission = 0;

        if (orderM) {
            // Normalize all non-ASCII minus/dash variants to ASCII '-'.
            // pdfjs sometimes emits U+2010, U+2212, etc. for negative numbers.
            // Em-dash U+2014 (—) is kept intentionally as the "no value" sentinel.
            const afterOrder = afterDir
                .slice(afterDir.indexOf(orderM[0]) + orderM[0].length)
                .trimStart()
                .replace(/[\u00AD\u2010\u2011\u2012\u2013\u2212]/g, '-');

            let restForCommission: string;

            // Em dash → opening leg (no PnL).
            // '-' not followed by optional-spaces-then-digit → also opener (lone dash).
            // IMPORTANT: "- 140.58" (space between sign and digits) IS a negative PnL —
            // pdfjs often emits the minus sign as a separate text item from the number.
            if (/^—/.test(afterOrder) || /^-(?!\s*\d)/.test(afterOrder)) {
                settledPnl = null;
                restForCommission = afterOrder.replace(/^(?:—|-)\s*/, '');
            } else {
                // Settled PnL: optional '+'/'-', optional whitespace, then the number.
                // Handles "-140.58", "- 140.58", "+140.58", "200" (integer PnL — no decimal).
                const pnlM = afterOrder.match(/^([+-]?)\s*([\d,]+\.?\d*)/);
                if (pnlM && pnlM[2]) {
                    settledPnl = parseFloat((pnlM[1] + pnlM[2]).replace(/,/g, ''));
                    restForCommission = afterOrder.slice(pnlM[0].length).trimStart();
                } else {
                    restForCommission = afterOrder;
                }
            }

            // Commission: first number in restForCommission.
            // Order-ID suffixes are ≥ 6 digits (≥ 100 000) so the < 100 000 guard
            // safely excludes them while capturing realistic commission amounts (even large accounts).
            const commM = restForCommission.match(/([\d,]+\.?\d*)/);
            if (commM) {
                const val = parseFloat(commM[1].replace(/,/g, ''));
                if (val < 100000) commission = val;
            }
        }

        results.push({
            txId: `${dateStr.replace(/\//g, '')}-${timeM[1].replace(':', '')}-${dirM[1]}-${symM[1]}-${results.length}`,
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
    const sorted = rawTxs.slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const stacks = new Map<string, RawTx[]>();
    const trades: Omit<TradeSession, 'note'>[] = [];

    for (let _i = 0; _i < sorted.length; _i++) {
        const tx = sorted[_i];
        const key = tx.baseSymbol;

        if (tx.settledPnl !== null) {
            // ── Closing transaction ──────────────────────────
            const stack = stacks.get(key) ?? [];
            const idx = stack.findIndex(o =>
                o.direction !== tx.direction &&
                Math.abs(o.size - tx.size) / Math.max(o.size, tx.size) < 0.005
            );
            const open = idx >= 0 ? stack.splice(idx, 1)[0] : stack.shift();
            if (stack.length > 0) stacks.set(key, stack); else stacks.delete(key);

            // Net PnL = gross settled PnL − commission on close leg − commission on open leg
            const pnl = tx.settledPnl - tx.commission - (open?.commission ?? 0);
            const isShort = open ? open.direction === 'Sell' : tx.direction === 'Buy';
            const createdAt = open?.dateISO ?? tx.dateISO;
            const closedAt = tx.dateISO;
            const durationSeconds = open ? Math.max(1, Math.round((new Date(closedAt).getTime() - new Date(createdAt).getTime()) / 1000)) : 1;

            // ID is deterministic: same trade always produces the same ID → real dedup on re-import
            trades.push({
                id: `tradeify-${tx.txId}`,
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
                createdAt,
                closedAt,
                pnl,
                isShort,
                durationSeconds,
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
): Promise<{
    trades: Omit<TradeSession, 'note'>[];
    count: number;
    error?: string;
    closingBalance?: number;   // extracted from PDF summary if present
    coverageStart?: string;    // YYYY-MM-DD of earliest trade
    coverageEnd?: string;      // YYYY-MM-DD of latest trade
}> {
    try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
        // Setting a standard unpkg worker URL which solves mobile parsing issues
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.js`;

        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

        // ── Extract all text items with absolute position ────
        type TI = { str: string; x: number; absY: number };
        const items: TI[] = [];

        let pageYOffset = 0;
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const vp   = page.getViewport({ scale: 1 });
            const content = await page.getTextContent();

            for (let i = 0; i < content.items.length; i++) {
                const item = content.items[i];
                if ('str' in item && item.str.trim()) {
                    items.push({
                        str: item.str.trim(),
                        x: item.transform[4],
                        absY: pageYOffset + (vp.height - item.transform[5]),
                    });
                }
            }
            pageYOffset += vp.height;
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

        // Trim at footer markers (NOT "Financing" — that's a column header in every row)
        const footerIdx = txText.search(/\bTotals\b|\bSummary\b|\bPage\s+\d|\bGenerated\b/i);
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

        // ── Extract closing balance from summary section ──────
        // The Tradeify statement header (before the Transactions table) contains
        // lines like "Closing Balance 52,600.00" or "Balance: 52600.00"
        const headerText = txIdx >= 0 ? fullText.slice(0, txIdx) : '';
        let closingBalance: number | undefined;
        const balM = headerText.match(
            /(?:closing|ending|final|current)\s+balance[:\s]*\$?\s*([\d,]+\.?\d*)/i
        ) ?? headerText.match(
            /balance[:\s]+\$?\s*([\d,]+\.?\d{2})\b/i
        );
        if (balM) {
            const parsed = parseFloat(balM[1].replace(/,/g, ''));
            if (parsed > 0) closingBalance = parsed;
        }

        // ── Coverage dates ────────────────────────────────────
        const dates = rawTxs.map(t => t.dateISO).sort();
        const coverageStart = dates[0]?.slice(0, 10);
        const coverageEnd   = dates[dates.length - 1]?.slice(0, 10);

        return { trades, count: trades.length, closingBalance, coverageStart, coverageEnd };

    } catch (e) {
        return {
            trades: [], count: 0,
            error: `Parse failed: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}
