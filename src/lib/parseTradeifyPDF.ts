/**
 * Tradeify PDF Statement Parser
 * ────────────────────────────────────────────────────────────
 * Parses the "Single-Currency account statement" PDF exported
 * from Tradeify and returns TradeSession objects for the journal.
 *
 * Tradeify PDF structure:
 *   Transactions table columns:
 *   TxID | Date/Time (EST) | Direction | Size | Symbol | Price | OrderID | Settled PnL | Commission | Desc
 *
 *   - Opening trades:  Settled PnL column = "—" (em dash)
 *   - Closing trades:  Settled PnL column = numeric value
 *
 * Strategy: pair OPENS with CLOSES via FIFO per symbol.
 */

import type { TradeSession } from '@/store/appStore';

interface RawTx {
    txId: string;
    dateISO: string;       // YYYY-MM-DDTHH:MM:00 (EST)
    direction: 'Buy' | 'Sell';
    size: number;
    baseSymbol: string;    // 'BTC', 'DOGE', 'SOL', etc.
    price: number;
    settledPnl: number | null; // null = opening transaction
}

// ── Helpers ────────────────────────────────────────────────────

function parseDateISO(dateStr: string, timeStr: string): string {
    // dateStr: MM/DD/YYYY  timeStr: HH:MM
    const [m, d, y] = dateStr.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timeStr}:00`;
}

const KNOWN_SYMBOLS = [
    'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'PEPE', 'WIF', 'BONK', 'PNUT',
    'SUI', 'AVAX', 'APT', 'LINK', 'UNI', 'ADA', 'DOT', 'NEAR', 'FET',
    'LTC', 'BCH', 'RENDER', 'TAO', 'TIA', 'SEI', 'INJ', 'JUP', 'PYTH',
    'OP', 'ARB', 'STRK',
];

const SYMBOL_RE = new RegExp(`\\b(${KNOWN_SYMBOLS.join('|')})\\b`, 'i');

// ── Row parser ─────────────────────────────────────────────────

function tryParseRow(text: string): RawTx | null {
    // Transaction ID: NNNNN:NNNNNN
    const idM = text.match(/(\d{5})\s*:\s*(\d{6})/);
    if (!idM) return null;

    const dateM = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    const timeM = text.match(/\b(\d{2}:\d{2})\b/);
    const dirM = text.match(/\b(Buy|Sell)\b/);
    const symM = text.match(SYMBOL_RE);
    if (!dateM || !timeM || !dirM || !symM) return null;

    // Numbers that appear after the direction keyword
    const afterDir = text.slice(text.search(/\b(Buy|Sell)\b/) + dirM[1].length);
    const nums = [...afterDir.matchAll(/(-?[\d,]+\.?\d+)/g)]
        .map(m => parseFloat(m[1].replace(/,/g, '')))
        .filter(n => !isNaN(n) && isFinite(n));

    if (nums.length < 2) return null;

    const size = nums[0];   // largest first number = units traded
    const price = nums[1];  // entry/exit price

    // ── Determine if OPENING (—) or CLOSING (has PnL) ──────────
    // After the 6-digit Order ID: opening has "—" before commission,
    // closing has the PnL number first.
    // Order ID = a 6-digit integer surrounded by spaces (not part of a decimal like 0.090071)
    const orderM = afterDir.match(/\s(\d{6})(?=\s|$)/);
    let settledPnl: number | null = null;

    if (orderM) {
        const matchStart = afterDir.indexOf(orderM[0]);
        const afterOrder = afterDir.slice(matchStart + orderM[0].length).trimStart();

        // Em dash or en dash = opening (no PnL)
        if (/^[—–]/.test(afterOrder)) {
            settledPnl = null;
        } else {
            // Extract the first number — that's the Settled PnL
            const pnlM = afterOrder.match(/^(-?[\d,]+\.?\d{2})/);
            if (pnlM) {
                settledPnl = parseFloat(pnlM[1].replace(/,/g, ''));
            }
        }
    }

    return {
        txId: `${idM[1]}:${idM[2]}`,
        dateISO: parseDateISO(dateM[1], timeM[1]),
        direction: dirM[1] as 'Buy' | 'Sell',
        size,
        baseSymbol: symM[1].toUpperCase(),
        price,
        settledPnl,
    };
}

// ── Main parser ────────────────────────────────────────────────

export async function parseTradeifyPDF(
    file: File
): Promise<{ trades: Omit<TradeSession, 'note'>[]; count: number; error?: string }> {
    try {
        // Dynamic import — client-side only, avoids SSR issues
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

        // ── Step 1: Extract text items with absolute Y position ──
        type TI = { text: string; x: number; absY: number };
        const allItems: TI[] = [];

        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const vp = page.getViewport({ scale: 1 });
            const content = await page.getTextContent();

            for (const item of content.items) {
                if ('str' in item && item.str.trim().length > 0) {
                    allItems.push({
                        text: item.str.trim(),
                        x: item.transform[4],
                        // Offset each page by 20000px so rows never overlap across pages
                        absY: (p - 1) * 20000 + (vp.height - item.transform[5]),
                    });
                }
            }
        }

        // ── Step 2: Group items into visual rows (Y ±5px) ───────
        const YTOL = 5;
        const rows: TI[][] = [];
        for (const item of allItems) {
            const row = rows.find(r => Math.abs(r[0].absY - item.absY) < YTOL);
            if (row) row.push(item);
            else rows.push([item]);
        }
        rows.sort((a, b) => a[0].absY - b[0].absY);
        rows.forEach(r => r.sort((a, b) => a.x - b.x));

        const rowTexts = rows.map(r => r.map(i => i.text).join(' '));

        // ── Step 3: Locate the "Transactions" section header ────
        const txIdx = rowTexts.findIndex(r => /^transactions$/i.test(r.trim()));
        const start = txIdx >= 0 ? txIdx + 1 : 0;

        // ── Step 4: Parse rows, buffering cross-page splits ─────
        // A transaction whose row spans a page break will appear as:
        //   "83251: [date] [symbol]" at page bottom  +  "864078 [time] Buy ..." at page top
        // We buffer until we see the next txId, then attempt a parse.
        const rawTxs: RawTx[] = [];
        let bufId = '';
        let bufText = '';

        const flush = () => {
            if (bufId && bufText) {
                const tx = tryParseRow(bufText);
                if (tx) rawTxs.push(tx);
            }
            bufId = '';
            bufText = '';
        };

        for (let i = start; i < rowTexts.length; i++) {
            const row = rowTexts[i];

            // Stop conditions
            if (/^totals\b/i.test(row) || /^financing\b/i.test(row)) { flush(); break; }
            // Skip header rows
            if (/transaction id|transaction time|settled pnl/i.test(row)) continue;
            // Skip deposit/footer rows
            if (/deposit|withdrawal|adjustment|disclaimer/i.test(row)) continue;

            const idM = row.match(/(\d{5})\s*:\s*(\d{6})/);
            if (idM) {
                flush();
                bufId = `${idM[1]}:${idM[2]}`;
                bufText = row;
            } else if (bufId) {
                // Possible continuation of a cross-page split row
                if (/\d{2}\/\d{2}\/\d{4}|Buy|Sell|\/USD/i.test(row) || SYMBOL_RE.test(row)) {
                    bufText += ' ' + row;
                }
            }
        }
        flush();

        if (rawTxs.length === 0) {
            return {
                trades: [], count: 0,
                error: 'No transactions found. Make sure this is a Tradeify single-currency account statement.',
            };
        }

        // ── Step 5: FIFO match opens → closes per symbol ────────
        const sorted = [...rawTxs].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
        const stacks = new Map<string, RawTx[]>();
        const trades: Omit<TradeSession, 'note'>[] = [];

        for (const tx of sorted) {
            const key = tx.baseSymbol;

            if (tx.settledPnl !== null) {
                // ── Closing transaction ──────────────────────────
                const stack = stacks.get(key) ?? [];

                // Find nearest open: opposite direction, size within 5%
                const idx = stack.findIndex(o =>
                    o.direction !== tx.direction &&
                    Math.abs(o.size - tx.size) / Math.max(o.size, tx.size) < 0.05
                );
                const open = idx >= 0 ? stack.splice(idx, 1)[0] : stack.shift();
                if (stack.length > 0) stacks.set(key, stack); else stacks.delete(key);

                const pnl = tx.settledPnl;
                const isShort = open ? open.direction === 'Sell' : tx.direction === 'Buy';

                trades.push({
                    id: `tradeify-${tx.txId.replace(':', '-')}-${Date.now() + trades.length}`,
                    asset: tx.baseSymbol,
                    assetType: 'crypto',
                    entry: open?.price ?? tx.price,
                    stopLoss: 0,           // not available in statement
                    takeProfit: tx.price,  // exit price
                    lotSize: tx.size,
                    riskUSD: pnl < 0 ? Math.abs(pnl) : 0,
                    rewardUSD: pnl > 0 ? pnl : 0,
                    rr: 0,                 // not calculable without true SL
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

        return { trades, count: trades.length };

    } catch (e) {
        return {
            trades: [], count: 0,
            error: `Parse failed: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}
