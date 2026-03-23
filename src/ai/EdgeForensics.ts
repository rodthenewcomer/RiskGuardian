import { TRADEIFY_CRYPTO_LIST } from '@/store/appStore';

export interface Trade {
    id: string;
    asset: string;
    createdAt: string;
    pnl?: number;
    outcome?: string;
    rr?: number;
    isShort?: boolean;
    entry?: number;
    size?: number;
    durationSeconds?: number;
    closedAt?: string;
    assetType?: string;
}

export interface SessionGroup {
    id: string;
    startTime: string;
    endTime: string;
    trades: Trade[];
    pnl: number;
    winRate: number;
    tag: 'CLEAN' | 'REVENGE' | 'SIZING UP' | 'OVERTRADING' | 'CRITICAL';
    durationMinutes: number;
}

/** Structured trade-level proof attached to each behavioral pattern */
export interface EvidenceTrade {
    timestamp: string;       // e.g. "Mar 12, 14:32"
    asset: string;
    pnl: number;
    durationLabel?: string;  // e.g. "47m"
    context: string;         // one-line explanation of why this trade is proof
}

export interface PatternResult {
    name: string;
    freq: number;
    impact: number;
    severity: string;
    desc: string;
    evidence: string[];
    evidenceTrades: EvidenceTrade[];
    action?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtTs = (iso: string): string => {
    const d = new Date(iso);
    const estDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return estDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        + ' ' + estDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtDur = (s: number): string =>
    s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;

const estHour = (iso: string): number =>
    new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();

// EST calendar date string — avoids UTC-date slicing which misassigns trades after 7 PM EST
const estDateStr = (iso: string): string => {
    const d = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const estDay = (iso: string): number =>
    new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

// ── Main engine ───────────────────────────────────────────────────────────────

export function generateForensics(trades: Trade[], accountData: any, lang: 'en' | 'fr' = 'en') {
    const closed = trades
        .filter(t => t.outcome === 'win' || t.outcome === 'loss')
        .sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
    const balance = accountData?.startingBalance ?? accountData?.balance ?? 50000;

    // ── 1. Session grouping (gap > 2h = new session) ─────────────────────────
    const sessions: SessionGroup[] = [];
    if (closed.length > 0) {
        let cur: Trade[] = [closed[0]];
        for (let i = 1; i < closed.length; i++) {
            const prev = new Date(closed[i - 1].closedAt ?? closed[i - 1].createdAt).getTime();
            const curr = new Date(closed[i].closedAt ?? closed[i].createdAt).getTime();
            if (curr - prev > 2 * 3600 * 1000) { sessions.push(mkSession(cur, sessions.length)); cur = [closed[i]]; }
            else cur.push(closed[i]);
        }
        sessions.push(mkSession(cur, sessions.length));
    }

    function mkSession(ts: Trade[], idx: number): SessionGroup {
        const pnl = ts.reduce((s, t) => s + (t.pnl ?? 0), 0);
        const wins = ts.filter(t => (t.pnl ?? 0) > 0).length;
        const wr = (wins / ts.length) * 100;
        const start = ts[0].createdAt;
        const end = ts[ts.length - 1].closedAt ?? ts[ts.length - 1].createdAt;
        const dur = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
        let hasRevenge = false;
        for (let i = 0; i < ts.length - 1; i++) {
            if ((ts[i].pnl ?? 0) < 0) {
                const isCrypto = ts[i].assetType === 'crypto' || TRADEIFY_CRYPTO_LIST.includes(ts[i].asset);
                const windowMs = (isCrypto ? 5 : 30) * 60000;
                const t1 = new Date(ts[i].closedAt ?? ts[i].createdAt).getTime();
                const t2 = new Date(ts[i + 1].createdAt).getTime();
                if (t2 - t1 < windowMs) { hasRevenge = true; break; }
            }
        }
        let tag: SessionGroup['tag'] = 'CLEAN';
        if (hasRevenge) tag = 'REVENGE';
        else if (pnl < -1000) tag = 'CRITICAL';
        else if (ts.length > 15) tag = 'OVERTRADING';
        return { id: `session-${idx}`, startTime: start, endTime: end, trades: ts, pnl, winRate: wr, tag, durationMinutes: dur };
    }

    // ── 2. Base metrics ───────────────────────────────────────────────────────
    const wins = closed.filter(t => (t.pnl ?? 0) > 0);
    const lossTrades = closed.filter(t => (t.pnl ?? 0) < 0);
    const winsWithDur = wins.filter(t => (t.durationSeconds ?? 0) > 0);
    const lossesWithDur = lossTrades.filter(t => (t.durationSeconds ?? 0) > 0);
    // avgWinDur / avgLossDur used by the scorecard (mean is fine for ratios)
    const avgWinDur = winsWithDur.length > 0 ? winsWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / winsWithDur.length : 60;
    const avgLossDur = lossesWithDur.length > 0 ? lossesWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / lossesWithDur.length : 60;
    const avgWinAmt = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 1;
    const avgLossAmt = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossTrades.length : 1;

    // ── Session-aware hold duration baseline ──────────────────────────────────
    // Trades taken during US session (9am-4pm EST) are faster than overnight crypto.
    // Using a global mean would flag slow off-hours trades as "held too long" incorrectly.
    // We compute the MEDIAN (robust to outliers) per session type and use it per trade.
    const medianOf = (arr: number[]): number => {
        if (arr.length === 0) return 60;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
    };
    const usWinsWithDur  = winsWithDur.filter(t => { const h = estHour(t.createdAt); return h >= 9 && h < 17; });
    const offWinsWithDur = winsWithDur.filter(t => { const h = estHour(t.createdAt); return h < 9  || h >= 17; });
    const usMedianWinDur  = medianOf(usWinsWithDur.length  >= 3 ? usWinsWithDur.map(t => t.durationSeconds!)  : winsWithDur.map(t => t.durationSeconds!));
    const offMedianWinDur = medianOf(offWinsWithDur.length >= 3 ? offWinsWithDur.map(t => t.durationSeconds!) : winsWithDur.map(t => t.durationSeconds!));
    // Returns the appropriate median win hold for a trade entered at `iso`
    const contextualWinDur = (iso: string): number => {
        const h = estHour(iso);
        return (h >= 9 && h < 17) ? usMedianWinDur : offMedianWinDur;
    };

    const patterns: PatternResult[] = [];

    // ── PATTERN 1: Revenge Trading ────────────────────────────────────────────
    {
        let freq = 0, impact = 0;
        const evidenceTrades: EvidenceTrade[] = [];
        const evidenceStr: string[] = [];
        for (let i = 0; i < closed.length - 1; i++) {
            if ((closed[i].pnl ?? 0) < 0) {
                // lossClose = when the losing trade CLOSED (the trigger moment)
                const lossClose = new Date(closed[i].closedAt ?? closed[i].createdAt).getTime();
                let count = 0, seqImp = 0, jMax = i;
                // lastDecisionOpenMs tracks the open time of the most recent INDEPENDENT re-entry
                // so that simultaneous split entries (±30s same open) are grouped as one decision.
                let lastDecisionOpenMs = -Infinity;
                for (let j = i + 1; j < closed.length; j++) {
                    // Use OPEN TIME of the next trade to measure elapsed time since the loss.
                    // Skip if the trade opened BEFORE OR AT the same moment the loss closed —
                    // that's a parallel/split entry, not an emotional re-entry.
                    const jOpenTime = new Date(closed[j].createdAt).getTime();
                    if (jOpenTime <= lossClose) continue; // parallel or simultaneous split — not revenge

                    const isCrypto = closed[j].assetType === 'crypto' || TRADEIFY_CRYPTO_LIST.includes(closed[j].asset);
                    const windowMs = (isCrypto ? 5 : 30) * 60000;
                    const elapsed = jOpenTime - lossClose; // time from loss close → next open
                    if (elapsed <= windowMs) {
                        seqImp += (closed[j].pnl ?? 0);
                        jMax = j;
                        const isSplit = lastDecisionOpenMs >= 0 && (jOpenTime - lastDecisionOpenMs) <= 30000;
                        if (!isSplit) {
                            // Independent re-entry decision
                            count++;
                            lastDecisionOpenMs = jOpenTime;
                            const minAfter = Math.round(elapsed / 60000);
                            evidenceTrades.push({
                                timestamp: fmtTs(closed[j].closedAt ?? closed[j].createdAt),
                                asset: closed[j].asset,
                                pnl: closed[j].pnl ?? 0,
                                durationLabel: closed[j].durationSeconds ? fmtDur(closed[j].durationSeconds!) : undefined,
                                context: `Re-entry ${minAfter}min after -$${Math.abs(closed[i].pnl ?? 0).toFixed(0)} loss on ${closed[i].asset}`,
                            });
                            evidenceStr.push(`${closed[j].asset} @ ${fmtTs(closed[j].closedAt ?? closed[j].createdAt)}: ${minAfter}min after loss, P&L ${(closed[j].pnl ?? 0) >= 0 ? '+' : ''}$${(closed[j].pnl ?? 0).toFixed(0)}`);
                        } else if (evidenceTrades.length > 0) {
                            // Split entry of same decision — fold P&L into the last evidence card
                            evidenceTrades[evidenceTrades.length - 1].pnl += (closed[j].pnl ?? 0);
                        }
                    } else break;
                }
                // ≥1 rapid re-entry is revenge regardless of sequence length; seqImp<0 ensures net-negative cost only
                // Advance i past ALL trades in this window (including splits) via jMax
                if (count >= 1 && seqImp < 0) { freq++; impact += seqImp; i = jMax; }
            }
        }
        if (freq > 0) patterns.push({
            name: 'Revenge Trading', freq, impact,
            severity: impact < -500 ? 'CRITICAL' : 'WARNING',
            desc: 'Rapid re-entry after a loss within a short window, driven by emotion rather than setup quality. Each instance compounds the drawdown.',
            evidence: evidenceStr.slice(0, 4),
            evidenceTrades: evidenceTrades.slice(0, 5),
        });
    }

    // ── PATTERN 2: Held Losers ────────────────────────────────────────────────
    {
        // A "held loser" requires BOTH conditions to be true for the analysis period:
        //   1. Hold duration exceeds the trader's own avg losing trade duration
        //   2. Loss amount is ≥20% worse than the trader's avg loss
        // This prevents flagging trades that fall within the trader's normal loss profile.
        const held = lossTrades.filter(t =>
            (t.durationSeconds ?? 0) > 0 &&
            t.durationSeconds! > avgLossDur &&
            Math.abs(t.pnl ?? 0) > avgLossAmt * 1.2
        );
        if (held.length > 0) {
            const impact = held.reduce((a, b) => a + (b.pnl ?? 0), 0);
            patterns.push({
                name: 'Held Losers', freq: held.length, impact,
                severity: impact < -400 || held.length > 5 ? 'CRITICAL' : 'WARNING',
                desc: 'Losing trades held beyond the trader\'s avg loss duration AND resulting in 20%+ above-average loss — holding hope past the normal exit point.',
                evidence: held.slice(0, 3).map(t => `${t.asset}: held ${fmtDur(t.durationSeconds ?? 0)} (avg loss hold: ${fmtDur(avgLossDur)}) · -$${Math.abs(t.pnl ?? 0).toFixed(0)} vs avg -$${avgLossAmt.toFixed(0)}`),
                evidenceTrades: held.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: fmtDur(t.durationSeconds ?? 0),
                    context: `Held ${fmtDur(t.durationSeconds ?? 0)} (avg loss: ${fmtDur(avgLossDur)}) — loss $${Math.abs(t.pnl ?? 0).toFixed(0)} is ${((Math.abs(t.pnl ?? 0) / avgLossAmt - 1) * 100).toFixed(0)}% above avg`,
                })),
            });
        }
    }

    // ── PATTERN 3: Early Exit ─────────────────────────────────────────────────
    {
        // Threshold: duration < 50% of session-type median win duration.
        // Using session-aware median prevents off-hours trades (naturally slower markets)
        // from being falsely flagged as early exits against a US-session benchmark.
        // Exclude any win that earned ≥50% of avgWinAmt — meaningful capture regardless of speed.
        // A win at 50%+ of the trader's average is not an early exit, it's an efficient trim.
        const earlyWins = wins.filter(t =>
            (t.durationSeconds ?? 0) > 0 &&
            t.durationSeconds! < contextualWinDur(t.createdAt) * 0.5 &&
            (t.pnl ?? 0) < avgWinAmt * 0.5
        );
        if (earlyWins.length >= 3) {
            const earlyAvgPnl = earlyWins.reduce((s, t) => s + (t.pnl ?? 0), 0) / earlyWins.length;
            const forgone = Math.max(0, avgWinAmt - earlyAvgPnl);
            const impact = -(forgone * earlyWins.length);
            if (forgone > 0) {
                patterns.push({
                    name: 'Early Exit', freq: earlyWins.length, impact,
                    severity: Math.abs(impact) > 500 ? 'HIGH' : 'WARNING',
                    desc: 'Winning trades cut short before structural targets — leaving significant P&L on the table through premature profit-taking.',
                    evidence: [
                        `Early exit avg: $${earlyAvgPnl.toFixed(0)} vs full avg win: $${avgWinAmt.toFixed(0)}`,
                        `Est. foregone per trade: $${forgone.toFixed(0)}`,
                        `Avg hold on early exits: ${fmtDur(earlyWins.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / earlyWins.length)} — session-type median win: ${fmtDur(usMedianWinDur)}`,
                    ],
                    evidenceTrades: earlyWins.slice(0, 5).map(t => ({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        durationLabel: fmtDur(t.durationSeconds ?? 0),
                        context: `Held ${fmtDur(t.durationSeconds ?? 0)} — session avg winner runs ${fmtDur(contextualWinDur(t.createdAt))}, est. $${forgone.toFixed(0)} left on table`,
                    })),
                });
            }
        }
    }

    // ── PATTERN 4: Spike Vulnerability ───────────────────────────────────────
    {
        const spikes = lossTrades.filter(t => Math.abs(t.pnl ?? 0) > avgLossAmt * 3 && (t.durationSeconds ?? 0) < 180);
        if (spikes.length > 0) {
            const impact = spikes.reduce((a, b) => a + (b.pnl ?? 0), 0);
            patterns.push({
                name: 'Spike Vulnerability', freq: spikes.length, impact,
                severity: 'CRITICAL',
                desc: 'Massive loss in under 3 minutes — no hard stop during a news spike or stop-hunt. Single worst category of risk.',
                evidence: spikes.map(t => `${t.asset}: -$${Math.abs(t.pnl ?? 0).toFixed(0)} in ${t.durationSeconds}s`),
                evidenceTrades: spikes.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: `${t.durationSeconds}s`,
                    context: `-$${Math.abs(t.pnl ?? 0).toFixed(0)} in ${t.durationSeconds}s — ${(Math.abs(t.pnl ?? 0) / avgLossAmt).toFixed(1)}x avg loss, no hard stop`,
                })),
            });
        }
    }

    // ── PATTERN 5: Micro Overtrading ──────────────────────────────────────────
    {
        const micros = closed.filter(t => /^M[A-Z0-9]{1,3}$/.test(t.asset));
        const microPnl = micros.reduce((s, t) => s + (t.pnl ?? 0), 0);
        if (micros.length > 10 && microPnl < 0) {
            const microLosses = micros.filter(t => (t.pnl ?? 0) < 0);
            const microWr = micros.length > 0 ? ((micros.filter(t => (t.pnl ?? 0) > 0).length / micros.length) * 100).toFixed(0) : '0';
            patterns.push({
                name: 'Micro Overtrading', freq: micros.length, impact: microPnl,
                severity: 'WARNING',
                desc: 'High-frequency trading in micro contracts with negative net — commission drag and diluted edge on thin margin instruments.',
                evidence: [`${micros.length} micro trades · Net: $${microPnl.toFixed(0)}`, `Win rate on micros: ${microWr}%`],
                evidenceTrades: microLosses.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: t.durationSeconds ? fmtDur(t.durationSeconds) : undefined,
                    context: `Micro trade loss — 1 of ${micros.length} total entries, cumulative drag`,
                })),
            });
        }
    }

    // ── PATTERN 6: Overtrading Sessions ──────────────────────────────────────
    {
        const otSessions = sessions.filter(s => s.trades.length > 15);
        if (otSessions.length > 0) {
            const impact = otSessions.reduce((s, sess) => s + sess.pnl, 0);
            patterns.push({
                name: 'Overtrading', freq: otSessions.length, impact,
                severity: otSessions.length >= 3 ? 'CRITICAL' : 'WARNING',
                desc: 'Sessions exceeding 15 trades — psychological discipline breaks down past this threshold, edge degrades with each additional entry.',
                evidence: otSessions.slice(0, 3).map(s => `${fmtTs(s.startTime)}: ${s.trades.length} trades, P&L ${s.pnl >= 0 ? '+' : ''}$${s.pnl.toFixed(0)}`),
                evidenceTrades: otSessions.slice(0, 3).flatMap(s => {
                    const lastTwo = s.trades.slice(-2);
                    return lastTwo.map(t => ({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        context: `Trade #${s.trades.indexOf(t) + 1} of ${s.trades.length} in session — overtrading territory`,
                    }));
                }).slice(0, 5),
            });
        }
    }

    // ── PATTERN 7: Loss Escalation ────────────────────────────────────────────
    {
        // Build CONSECUTIVE loss runs — any WIN between two losses breaks the sequence.
        // Losses within a run are de-duplicated for parallel positions (same as before).
        // Escalation can only be detected within a single uninterrupted loss streak.
        type LossEntry = { pnl: number; trade: Trade };
        const lossRuns: LossEntry[][] = [];
        let currentRun: LossEntry[] = [];
        for (let i = 0; i < closed.length; i++) {
            if ((closed[i].pnl ?? 0) >= 0) {
                // Win — break the current run
                if (currentRun.length > 0) { lossRuns.push(currentRun); currentRun = []; }
                continue;
            }
            // Loss: check if parallel to the previous loss in the current run
            if (currentRun.length > 0) {
                const prev = currentRun[currentRun.length - 1].trade;
                const prevClose = new Date(prev.closedAt ?? prev.createdAt).getTime();
                const iOpen = new Date(closed[i].createdAt).getTime();
                if (iOpen < prevClose) {
                    // Parallel — merge into last cluster
                    currentRun[currentRun.length - 1].pnl += (closed[i].pnl ?? 0);
                    continue;
                }
            }
            currentRun.push({ pnl: closed[i].pnl ?? 0, trade: closed[i] });
        }
        if (currentRun.length > 0) lossRuns.push(currentRun);

        let freq = 0, impact = 0;
        const evidenceTrades: EvidenceTrade[] = [];
        const evidenceStr: string[] = [];

        // Search for escalation sequences within each consecutive loss run
        for (const run of lossRuns) {
            let i = 0;
            while (i < run.length - 2) {
                let seqEnd = i;
                let prev = Math.abs(run[i].pnl);
                let j = i + 1;
                // Require ≥25% step — filters out normal execution variance
                while (j < run.length && Math.abs(run[j].pnl) >= prev * 1.25) {
                    prev = Math.abs(run[j].pnl);
                    seqEnd = j;
                    j++;
                }
                const seqLen = seqEnd - i + 1;
                if (seqLen >= 3) {
                    freq++;
                    const seqSlice = run.slice(i, seqEnd + 1);
                    impact += seqSlice.reduce((s, e) => s + e.pnl, 0);
                    seqSlice.forEach((e, k) => {
                        const prevAmt = k > 0 ? Math.abs(seqSlice[k - 1].pnl) : 0;
                        const pct = prevAmt > 0 ? ((Math.abs(e.pnl) / prevAmt - 1) * 100).toFixed(0) : '—';
                        evidenceTrades.push({
                            timestamp: fmtTs(e.trade.closedAt ?? e.trade.createdAt),
                            asset: e.trade.asset,
                            pnl: e.pnl,
                            context: k === 0 ? `Loss #1 of escalation spiral` : `Loss #${k + 1} — ${pct}% larger than previous`,
                        });
                        evidenceStr.push(`${e.trade.asset} ${fmtTs(e.trade.closedAt ?? e.trade.createdAt)}: -$${Math.abs(e.pnl).toFixed(0)}${k > 0 ? ` (+${pct}% bigger)` : ''}`);
                    });
                    i = seqEnd + 1;
                    continue;
                }
                i++;
            }
        }
        if (freq > 0) patterns.push({
            name: 'Loss Escalation', freq, impact,
            severity: freq >= 2 ? 'CRITICAL' : 'WARNING',
            desc: '3+ consecutive losses where each is larger than the previous — a spiral pattern indicating emotional position sizing.',
            evidence: evidenceStr.slice(0, 4),
            evidenceTrades: evidenceTrades.slice(0, 5),
        });
    }

    // ── PATTERN 8: Low R:R Entry ──────────────────────────────────────────────
    {
        const lowRR = lossTrades.filter(t => (t.rr ?? 0) > 0 && (t.rr ?? 99) < 1.0);
        if (lowRR.length >= 3) {
            const impact = lowRR.reduce((s, t) => s + (t.pnl ?? 0), 0);
            patterns.push({
                name: 'Low R:R Entry', freq: lowRR.length, impact,
                severity: Math.abs(impact) > 500 ? 'HIGH' : 'WARNING',
                desc: 'Losing trades entered with R:R below 1.0 — risk exceeded potential reward at the moment of entry.',
                evidence: lowRR.slice(0, 3).map(t => `${t.asset}: entered ${(t.rr ?? 0).toFixed(2)}:1 R:R, lost $${Math.abs(t.pnl ?? 0).toFixed(0)}`),
                evidenceTrades: lowRR.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    context: `Entry R:R was ${(t.rr ?? 0).toFixed(2)}:1 — risk > reward at entry, loss was statistically expected`,
                })),
            });
        }
    }

    // ── PATTERN 9: Session Bleed ──────────────────────────────────────────────
    {
        // Minimum meaningful peak: 25% of the trader's avg winning session P&L.
        // A session peaking at +$94 when your avg winning session is +$800 is not
        // worth flagging — stopping at $94 would be leaving 90% of potential on the table.
        // Only flag if the peak was a genuine profit milestone worth protecting.
        const winningSessions = sessions.filter(s => s.pnl > 0);
        const avgWinSessPnl = winningSessions.length > 0
            ? winningSessions.reduce((s, sess) => s + sess.pnl, 0) / winningSessions.length
            : 100;
        // Peak must reach at least 65% of avg winning session — avoids noise from trivial early spikes.
        const minMeaningfulPeak = Math.max(avgWinSessPnl * 0.65, 50);
        const bleedSessions = sessions.filter(s => {
            let cum = 0, peak = 0;
            for (const t of s.trades) { cum += (t.pnl ?? 0); if (cum > peak) peak = cum; }
            return peak >= minMeaningfulPeak && s.pnl < 0;
        });
        if (bleedSessions.length > 0) {
            // Behavioral cost = how much was surrendered from the peak, not the full session loss.
            // A session peaking +$500 and ending -$300 costs $800 in foregone P&L — NOT just -$300.
            const bleedCost = (sess: SessionGroup): number => {
                let cum = 0, peak = 0;
                sess.trades.forEach(t => { cum += (t.pnl ?? 0); if (cum > peak) peak = cum; });
                return sess.pnl - peak; // always ≤ 0: peak lost + final loss
            };
            const impact = bleedSessions.reduce((s, sess) => s + bleedCost(sess), 0);
            const evidenceTrades: EvidenceTrade[] = [];
            bleedSessions.slice(0, 3).forEach(s => {
                let cum = 0, peak = 0, peakIdx = 0;
                s.trades.forEach((t, k) => { cum += (t.pnl ?? 0); if (cum > peak) { peak = cum; peakIdx = k; } });
                s.trades.slice(peakIdx + 1, peakIdx + 4).forEach(t => {
                    evidenceTrades.push({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        context: `Session peaked +$${peak.toFixed(0)} — this trade contributed to the reversal back to $${s.pnl.toFixed(0)}`,
                    });
                });
            });
            patterns.push({
                name: 'Session Bleed', freq: bleedSessions.length, impact,
                severity: Math.abs(impact) > 800 ? 'CRITICAL' : 'WARNING',
                desc: 'Session reached profit peak then fully reversed to negative — all gains surrendered plus additional losses.',
                evidence: bleedSessions.slice(0, 3).map(s => {
                    let cum = 0, peak = 0;
                    s.trades.forEach(t => { cum += (t.pnl ?? 0); if (cum > peak) peak = cum; });
                    const surrendered = peak - s.pnl; // total given back from peak
                    return `${fmtTs(s.startTime)}: peaked +$${peak.toFixed(0)}, ended $${s.pnl.toFixed(0)} — $${surrendered.toFixed(0)} surrendered from peak`;
                }),
                evidenceTrades: evidenceTrades.slice(0, 5),
            });
        }
    }

    // ── PATTERN 10: Choppy Indecision ─────────────────────────────────────────
    {
        const choppySessions = sessions.filter(s => {
            let alt = 0;
            for (let i = 1; i < s.trades.length; i++) {
                if (((s.trades[i - 1].pnl ?? 0) >= 0) !== ((s.trades[i].pnl ?? 0) >= 0)) alt++;
            }
            return alt >= 4;
        });
        if (choppySessions.length > 0) {
            const impact = choppySessions.reduce((s, sess) => s + sess.pnl, 0);
            const evidenceTrades: EvidenceTrade[] = [];
            choppySessions.slice(0, 3).forEach(s => {
                let alt = 0;
                for (let i = 1; i < s.trades.length; i++) {
                    if (((s.trades[i - 1].pnl ?? 0) >= 0) !== ((s.trades[i].pnl ?? 0) >= 0)) alt++;
                }
                s.trades.slice(0, 4).forEach(t => {
                    evidenceTrades.push({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        context: `Part of ${alt}-alternation choppy session — W/L/W/L with no sustained direction`,
                    });
                });
            });
            patterns.push({
                name: 'Choppy Indecision', freq: choppySessions.length, impact,
                severity: choppySessions.length >= 3 ? 'HIGH' : 'WARNING',
                desc: 'Win/Loss alternates 4+ times in a session — no sustained directional edge, low-quality setups taken in both directions.',
                evidence: choppySessions.slice(0, 3).map(s => {
                    let alt = 0;
                    for (let i = 1; i < s.trades.length; i++) {
                        if (((s.trades[i - 1].pnl ?? 0) >= 0) !== ((s.trades[i].pnl ?? 0) >= 0)) alt++;
                    }
                    return `${fmtTs(s.startTime)}: ${alt} W/L alternations in ${s.trades.length} trades`;
                }),
                evidenceTrades: evidenceTrades.slice(0, 5),
            });
        }
    }

    // ── PATTERN 11: Loss Concentration ───────────────────────────────────────
    {
        const lossMap: Record<string, { total: number; count: number; trades: Trade[] }> = {};
        lossTrades.forEach(t => {
            if (!lossMap[t.asset]) lossMap[t.asset] = { total: 0, count: 0, trades: [] };
            lossMap[t.asset].total += Math.abs(t.pnl ?? 0);
            lossMap[t.asset].count++;
            lossMap[t.asset].trades.push(t);
        });
        const grossLoss = lossTrades.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
        const sorted = Object.entries(lossMap).sort(([, a], [, b]) => b.total - a.total);
        const topEntry = sorted[0];
        if (topEntry && grossLoss > 0 && (topEntry[1].total / grossLoss) > 0.55 && topEntry[1].count >= 4) {
            const [asset, data] = topEntry;
            patterns.push({
                name: 'Loss Concentration', freq: data.count, impact: -data.total,
                severity: 'HIGH',
                desc: `${asset} accounts for ${((data.total / grossLoss) * 100).toFixed(0)}% of all losses — over-exposure or structural edge gap on this instrument.`,
                evidence: [`${asset}: $${data.total.toFixed(0)} losses (${((data.total / grossLoss) * 100).toFixed(0)}% of total)`, `${data.count} losing trades on ${asset}`],
                evidenceTrades: data.trades.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: t.durationSeconds ? fmtDur(t.durationSeconds) : undefined,
                    context: `${((Math.abs(t.pnl ?? 0) / grossLoss) * 100).toFixed(1)}% of total gross loss — concentrated in one instrument`,
                })),
            });
        }
    }

    // ── PATTERN 12: Directional Bias Failure ──────────────────────────────────
    {
        const longs = closed.filter(t => t.isShort === false);
        const shorts = closed.filter(t => t.isShort === true);
        if (longs.length >= 5 && shorts.length >= 5) {
            const longPnl = longs.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const shortPnl = shorts.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const failIsLong = longPnl < shortPnl;
            const failTrades = failIsLong ? longs : shorts;
            const failPnl = failIsLong ? longPnl : shortPnl;
            const goodPnl = failIsLong ? shortPnl : longPnl;
            const failLabel = failIsLong ? 'Long' : 'Short';
            if (failPnl < -300 && failPnl < goodPnl * -2) {
                const losersInDir = failTrades.filter(t => (t.pnl ?? 0) < 0);
                patterns.push({
                    name: 'Directional Bias Failure', freq: failTrades.length, impact: failPnl,
                    severity: Math.abs(failPnl) > 1000 ? 'CRITICAL' : 'HIGH',
                    desc: `${failLabel} trades significantly underperform — your edge does not apply to both directions equally. Stop forcing ${failLabel.toLowerCase()}s.`,
                    evidence: [`${failLabel}s net: $${failPnl.toFixed(0)} vs ${failLabel === 'Long' ? 'Shorts' : 'Longs'}: $${goodPnl.toFixed(0)}`, `${failTrades.length} ${failLabel.toLowerCase()} trades total`],
                    evidenceTrades: losersInDir.slice(0, 5).map(t => ({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        durationLabel: t.durationSeconds ? fmtDur(t.durationSeconds) : undefined,
                        context: `${failLabel} trade — this direction is a structural weakness in your system`,
                    })),
                });
            }
        }
    }

    // ── PATTERN 13: Late Session Deterioration ────────────────────────────────
    {
        const lateTrades = closed.filter(t => estHour(t.createdAt) >= 15);
        const latePnl = lateTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
        if (lateTrades.length >= 4 && latePnl < -200) {
            const lateWr = lateTrades.length > 0
                ? ((lateTrades.filter(t => (t.pnl ?? 0) > 0).length / lateTrades.length) * 100).toFixed(0)
                : '0';
            const lateLosses = lateTrades.filter(t => (t.pnl ?? 0) < 0);
            patterns.push({
                name: 'Late Session Deterioration', freq: lateTrades.length, impact: latePnl,
                severity: Math.abs(latePnl) > 500 ? 'HIGH' : 'WARNING',
                desc: 'Trades entered after 3PM EST consistently negative — fatigue, low liquidity, or chasing missed moves in the final hour.',
                evidence: [`${lateTrades.length} trades after 15:00 EST, net: $${latePnl.toFixed(0)}`, `Late session win rate: ${lateWr}%`],
                evidenceTrades: lateLosses.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: t.durationSeconds ? fmtDur(t.durationSeconds) : undefined,
                    context: `Entry at ${estHour(t.createdAt)}:00 EST — past optimal session window`,
                })),
            });
        }
    }

    // ── PATTERN 14: Monday Effect ─────────────────────────────────────────────
    {
        const byDay: Record<number, Trade[]> = {};
        closed.forEach(t => { const d = estDay(t.createdAt); if (!byDay[d]) byDay[d] = []; byDay[d].push(t); });
        const monTrades = byDay[1] ?? [];
        if (monTrades.length >= 5) {
            const monPnl = monTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const otherCount = Object.keys(byDay).filter(d => d !== '1').length;
            const otherPnl = Object.entries(byDay).filter(([d]) => d !== '1').flatMap(([, ts]) => ts).reduce((s, t) => s + (t.pnl ?? 0), 0);
            const avgOtherDayPnl = otherCount > 0 ? otherPnl / otherCount : 0;
            if (monPnl < avgOtherDayPnl * -1.5 && monPnl < 0) {
                const monLosses = monTrades.filter(t => (t.pnl ?? 0) < 0);
                patterns.push({
                    name: 'Monday Effect', freq: monTrades.length, impact: monPnl,
                    severity: 'WARNING',
                    desc: 'Consistent underperformance on Mondays — psychological reset difficulty or Monday market structure mismatch with your system.',
                    evidence: [`Monday net: $${monPnl.toFixed(0)} vs avg other days: $${avgOtherDayPnl.toFixed(0)}/day`, `${monTrades.length} Monday trades logged`],
                    evidenceTrades: monLosses.slice(0, 5).map(t => ({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        context: `Monday trade — structural underperformance day for your system`,
                    })),
                });
            }
        }
    }

    // ── PATTERN 15: Catastrophic Day ─────────────────────────────────────────
    {
        const dayMap: Record<string, Trade[]> = {};
        closed.forEach(t => {
            const d = estDateStr(t.closedAt ?? t.createdAt); // EST date, not UTC
            if (!dayMap[d]) dayMap[d] = [];
            dayMap[d].push(t);
        });
        // Use the account's configured daily loss limit if set — that IS the hard stop.
        // Falling back to 3% of balance only when no explicit limit is configured.
        const dailyLossLimit = Math.abs(accountData?.dailyLossLimit ?? 0);
        const catThreshold = dailyLossLimit > 0 ? dailyLossLimit : balance * 0.03;
        const catDays = Object.entries(dayMap)
            .map(([date, ts]) => ({ date, pnl: ts.reduce((s, t) => s + (t.pnl ?? 0), 0), trades: ts }))
            .filter(d => d.pnl < 0 && Math.abs(d.pnl) > catThreshold);
        if (catDays.length > 0) {
            const impact = catDays.reduce((s, d) => s + d.pnl, 0);
            const evidenceTrades: EvidenceTrade[] = [];
            catDays.slice(0, 3).forEach(d => {
                const worst = [...d.trades].sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0)).slice(0, 2);
                worst.forEach(t => {
                    evidenceTrades.push({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        context: `Day total: -$${Math.abs(d.pnl).toFixed(0)} (${((Math.abs(d.pnl) / balance) * 100).toFixed(1)}% of account, hard stop: $${catThreshold.toFixed(0)}) — this trade: $${Math.abs(t.pnl ?? 0).toFixed(0)}`,
                    });
                });
            });
            const thresholdLabel = dailyLossLimit > 0
                ? `daily hard stop ($${dailyLossLimit.toFixed(0)})`
                : `3% of account ($${(balance * 0.03).toFixed(0)})`;
            patterns.push({
                name: 'Catastrophic Day', freq: catDays.length, impact,
                severity: 'CRITICAL',
                desc: `${catDays.length} trading day${catDays.length > 1 ? 's' : ''} where loss exceeded the ${thresholdLabel} — structural damage from ignored hard stop.`,
                evidence: catDays.slice(0, 3).map(d => `${d.date}: -$${Math.abs(d.pnl).toFixed(0)} vs limit $${catThreshold.toFixed(0)} (${((Math.abs(d.pnl) / catThreshold) * 100).toFixed(0)}% of limit)`),
                evidenceTrades: evidenceTrades.slice(0, 5),
            });
        }
    }

    // ── PATTERN 16: Averaging Down ────────────────────────────────────────────
    // Same-asset entry while a previous trade on that asset is still open (no
    // intervening close on that asset) — adding to a losing position.
    {
        const avgDownTrades: Trade[] = [];
        // Build a per-asset open/close timeline
        const assetTimelines: Record<string, { opens: Trade[]; closes: Trade[] }> = {};
        for (const t of closed) {
            if (!assetTimelines[t.asset]) assetTimelines[t.asset] = { opens: [], closes: [] };
            assetTimelines[t.asset].opens.push(t);
            assetTimelines[t.asset].closes.push(t);
        }
        // For each asset, find entries where a trade opened before the previous one closed.
        // Exclude SPLIT ENTRIES: when a trader intentionally splits their risk across
        // 2-3 simultaneous orders (same setup, same direction), they all open within
        // seconds/minutes of each other. Require a meaningful gap (≥3 min) between the
        // original entry and the add-on to distinguish planned splits from averaging down.
        const SPLIT_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
        for (const [, timeline] of Object.entries(assetTimelines)) {
            const byOpen = [...timeline.opens].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            for (let i = 1; i < byOpen.length; i++) {
                const prev = byOpen[i - 1];
                const curr = byOpen[i];
                const prevOpen  = new Date(prev.createdAt).getTime();
                const prevClose = prev.closedAt ? new Date(prev.closedAt).getTime() : null;
                const currOpen  = new Date(curr.createdAt).getTime();
                // curr opened before prev closed AND at least 3 min after prev opened
                if (prevClose && currOpen < prevClose && (prev.pnl ?? 0) < 0
                    && (currOpen - prevOpen) >= SPLIT_THRESHOLD_MS) {
                    avgDownTrades.push(curr);
                }
            }
        }
        if (avgDownTrades.length >= 2) {
            const impact = avgDownTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
            patterns.push({
                name: 'Averaging Down', freq: avgDownTrades.length, impact,
                severity: impact < -500 ? 'CRITICAL' : 'HIGH',
                desc: 'Adding to a losing position before it closes — the fastest way to turn a controlled loss into an account-threatening drawdown.',
                evidence: avgDownTrades.slice(0, 3).map(t => `${t.asset}: new entry while previous position was still open and losing`),
                evidenceTrades: avgDownTrades.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: t.durationSeconds ? fmtDur(t.durationSeconds) : undefined,
                    context: `Added to ${t.asset} while previous loss was still open — averaging down`,
                })),
            });
        }
    }

    // ── PATTERN 17: Tilt Cascade ──────────────────────────────────────────────
    // 3+ consecutive losses where EACH is followed by a re-entry within 15 min —
    // escalating urgency pattern (distinct from single revenge trade).
    {
        let cascadeCount = 0;
        const cascadeTrades: Trade[] = [];
        const evidenceStr: string[] = [];
        let i = 0;
        while (i < closed.length - 2) {
            if ((closed[i].pnl ?? 0) >= 0) { i++; continue; }
            // Start of a potential cascade — track distinct re-entry DECISIONS, not raw trades.
            // Entries within 30s of each other (same close time) are one split decision.
            let j = i;
            let cascadeLen = 0;
            let lastDecisionCloseMs = -Infinity;
            while (j < closed.length - 1) {
                if ((closed[j].pnl ?? 0) >= 0) break; // win breaks the loss streak
                // Use CLOSE time of the current loss as the reference for elapsed measurement.
                const lossClose = new Date(closed[j].closedAt ?? closed[j].createdAt).getTime();
                const nextOpen  = new Date(closed[j + 1].createdAt).getTime();
                const elapsed   = (nextOpen - lossClose) / 60000; // minutes from loss close → next open
                if (elapsed <= 0) {
                    // Parallel/simultaneous entry (was already open) — skip without counting
                    j++;
                    continue;
                }
                // If this loss's close is within 30s of the previous cascade decision's close,
                // it's part of the same split decision — don't count as a new cascade step.
                const isSplitStep = lastDecisionCloseMs >= 0 && (lossClose - lastDecisionCloseMs) <= 30000;
                if (!isSplitStep) {
                    lastDecisionCloseMs = lossClose;
                }
                if (elapsed <= 15) {
                    if (!isSplitStep) cascadeLen++;
                    j++;
                } else break;
            }
            if (cascadeLen >= 2) { // 3+ distinct loss decisions each followed by quick re-entry
                cascadeCount++;
                const slice = closed.slice(i, j + 1);
                slice.forEach((t, k) => {
                    cascadeTrades.push(t);
                    evidenceStr.push(`Loss #${k + 1}: ${t.asset} → -$${Math.abs(t.pnl ?? 0).toFixed(0)}, re-entered in <15min`);
                });
                i = j + 1;
                continue;
            }
            i++;
        }
        if (cascadeCount > 0) {
            const impact = cascadeTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
            patterns.push({
                name: 'Tilt Cascade', freq: cascadeCount, impact,
                severity: 'CRITICAL',
                desc: '3+ consecutive losses each followed by rapid re-entry (<15 min) — escalating urgency that compounds the drawdown with each attempt to recover.',
                evidence: evidenceStr.slice(0, 4),
                evidenceTrades: cascadeTrades.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: t.durationSeconds ? fmtDur(t.durationSeconds) : undefined,
                    context: `Part of tilt cascade — rapid re-entry after consecutive losses`,
                })),
            });
        }
    }

    // ── PATTERN 18: Sunday Trading ────────────────────────────────────────────
    // Crypto entries on Sunday — illiquid, no US market structure, high-loss pattern.
    {
        const sundayTrades = closed.filter(t => estDay(t.createdAt) === 0 && (t.assetType === 'crypto' || TRADEIFY_CRYPTO_LIST.includes(t.asset)));
        if (sundayTrades.length >= 3) {
            const impact = sundayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const sundayWr = ((sundayTrades.filter(t => (t.pnl ?? 0) > 0).length / sundayTrades.length) * 100).toFixed(0);
            const sundayLosses = sundayTrades.filter(t => (t.pnl ?? 0) < 0);
            if (impact < 0) {
                patterns.push({
                    name: 'Sunday Trading', freq: sundayTrades.length, impact,
                    severity: Math.abs(impact) > 300 ? 'HIGH' : 'WARNING',
                    desc: 'Crypto trades on Sunday — no US market structure established, spreads widened, liquidity thin. Historically the highest-loss trading window.',
                    evidence: [
                        `${sundayTrades.length} Sunday crypto trades · Net: $${impact.toFixed(0)}`,
                        `Sunday win rate: ${sundayWr}% vs overall market structure days`,
                    ],
                    evidenceTrades: sundayLosses.slice(0, 5).map(t => ({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        durationLabel: t.durationSeconds ? fmtDur(t.durationSeconds) : undefined,
                        context: `Sunday crypto trade — no institutional market structure, thin order book`,
                    })),
                });
            }
        }
    }

    // ── PATTERN 19: Account Blow Precursor ────────────────────────────────────
    // 3 consecutive red sessions, each worse than the last — highest statistical
    // predictor of account termination.
    {
        let precursorCount = 0;
        const precursorSessions: typeof sessions = [];
        let i = 0;
        while (i < sessions.length - 2) {
            if (sessions[i].pnl >= 0) { i++; continue; }
            let j = i;
            while (j < sessions.length - 1 && sessions[j + 1].pnl < sessions[j].pnl) j++;
            const runLen = j - i + 1;
            if (runLen >= 3) {
                precursorCount++;
                precursorSessions.push(...sessions.slice(i, j + 1));
                i = j + 1;
                continue;
            }
            i++;
        }
        if (precursorCount > 0) {
            const impact = precursorSessions.reduce((s, sess) => s + sess.pnl, 0);
            const evidenceTrades: EvidenceTrade[] = [];
            precursorSessions.slice(0, 3).forEach((sess, k) => {
                const worst = [...sess.trades].sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0)).slice(0, 1);
                worst.forEach(t => evidenceTrades.push({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    context: `Session #${k + 1} of cascade: net $${sess.pnl.toFixed(0)} — each session worse than last`,
                }));
            });
            patterns.push({
                name: 'Account Blow Precursor', freq: precursorCount, impact,
                severity: 'CRITICAL',
                desc: '3+ consecutive red sessions, each worse than the previous — the highest-probability pattern preceding account blow. Immediate rule review required.',
                evidence: precursorSessions.slice(0, 3).map((s, k) => `Session #${k + 1}: $${s.pnl.toFixed(0)} (${s.trades.length} trades)`),
                evidenceTrades: evidenceTrades.slice(0, 5),
            });
        }
    }

    // ── PATTERN 20: FOMO Entry ────────────────────────────────────────────────
    {
        const fomoTrades = closed.filter(t => (t as any).biasTag === 'FOMO');
        const fomoByChasing = closed.filter((t, i) => {
            if (i === 0) return false;
            const prev = closed[i - 1];
            if (prev.outcome !== 'win') return false;
            const gap = new Date(t.createdAt).getTime() - new Date(prev.closedAt ?? prev.createdAt).getTime();
            return gap > 0 && gap < 2 * 60 * 1000;
        });
        const allFomoIds = [...new Set([...fomoTrades.map(t => t.id), ...fomoByChasing.map(t => t.id)])];
        const allFomo = allFomoIds.map(id => closed.find(t => t.id === id)!).filter(Boolean);
        if (allFomo.length >= 2) {
            const cost = allFomo.filter(t => t.outcome === 'loss').reduce((sum, t) => sum + Math.abs(t.pnl ?? 0), 0);
            patterns.push({
                name: lang === 'fr' ? 'Entrée FOMO' : 'FOMO Entry',
                freq: allFomo.length,
                severity: allFomo.length >= 4 ? 'CRITICAL' : 'HIGH',
                impact: -cost,
                desc: lang === 'fr'
                    ? `${allFomo.length} entrées FOMO détectées — trades pris par peur de rater un mouvement, sans confirmation de setup.`
                    : `${allFomo.length} FOMO entries detected — trades taken from fear of missing a move, without setup confirmation.`,
                evidence: allFomo.slice(0, 3).map(t => `${t.asset} ${t.createdAt.slice(0, 10)} — ${t.outcome}`),
                evidenceTrades: allFomo.slice(0, 3).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    context: lang === 'fr' ? 'Entrée FOMO sans confirmation de setup' : 'FOMO entry without setup confirmation',
                })),
            });
        }
    }

    // ── PATTERN 21: Profit Locking Anxiety ───────────────────────────────────
    {
        const winsAll = closed.filter(t => t.outcome === 'win' && typeof t.pnl === 'number');
        const avgWinAmtPL = winsAll.length > 0 ? winsAll.reduce((s, t) => s + (t.pnl ?? 0), 0) / winsAll.length : 0;
        const avgWinDurPL = winsAll.length > 0 ? winsAll.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / winsAll.length : 0;
        const profitLocked = winsAll.filter(t =>
            (t.pnl ?? 0) < avgWinAmtPL * 0.4 &&
            (t.durationSeconds ?? 0) < avgWinDurPL * 0.3 &&
            avgWinAmtPL > 0 && avgWinDurPL > 0
        );
        if (profitLocked.length >= 3) {
            const lostUpside = profitLocked.reduce((s, t) => s + (avgWinAmtPL - (t.pnl ?? 0)), 0);
            const avgCapturePct = profitLocked.length > 0
                ? (((profitLocked.reduce((s, t) => s + (t.pnl ?? 0), 0) / profitLocked.length) / avgWinAmtPL) * 100).toFixed(0)
                : '0';
            patterns.push({
                name: lang === 'fr' ? 'Anxiété de gains' : 'Profit Locking Anxiety',
                freq: profitLocked.length,
                severity: 'HIGH',
                impact: -lostUpside,
                desc: lang === 'fr'
                    ? `${profitLocked.length} trades fermés prématurément — gain moyen ${avgCapturePct}% de votre gain habituel. Aversion à la perte cognitive.`
                    : `${profitLocked.length} trades exited early — capturing only ${avgCapturePct}% of your average win. Classic loss aversion bias.`,
                evidence: profitLocked.slice(0, 3).map(t => `${t.asset} +$${(t.pnl ?? 0).toFixed(0)} (avg win: $${avgWinAmtPL.toFixed(0)})`),
                evidenceTrades: profitLocked.slice(0, 3).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    context: lang === 'fr'
                        ? `Clôturé à ${((t.pnl ?? 0) / avgWinAmtPL * 100).toFixed(0)}% du gain moyen — sortie prématurée`
                        : `Closed at ${((t.pnl ?? 0) / avgWinAmtPL * 100).toFixed(0)}% of avg win — premature exit`,
                })),
            });
        }
    }

    // ── PATTERN 22: Overconfidence ────────────────────────────────────────────
    {
        const overconfidenceInstances: typeof closed = [];
        for (let i = 3; i < closed.length; i++) {
            const recentWins = closed.slice(Math.max(0, i - 3), i).every(t => t.outcome === 'win');
            if (!recentWins) continue;
            const trailing10 = closed.slice(Math.max(0, i - 10), i);
            const avgLot = trailing10.reduce((s, t) => s + ((t as any).lotSize ?? 1), 0) / trailing10.length;
            if (avgLot > 0 && ((closed[i] as any).lotSize ?? 1) > avgLot * 1.5) {
                overconfidenceInstances.push(closed[i]);
            }
        }
        if (overconfidenceInstances.length >= 2) {
            const cost = overconfidenceInstances.filter(t => t.outcome === 'loss').reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
            patterns.push({
                name: lang === 'fr' ? 'Surconfiance' : 'Overconfidence',
                freq: overconfidenceInstances.length,
                severity: cost > 300 ? 'CRITICAL' : 'HIGH',
                impact: -cost,
                desc: lang === 'fr'
                    ? `${overconfidenceInstances.length} augmentations de taille après des séries gagnantes — biais de surconfiance classique.`
                    : `${overconfidenceInstances.length} position size spikes after winning streaks — classic overconfidence bias.`,
                evidence: overconfidenceInstances.slice(0, 3).map(t => `${t.asset} ${(t as any).lotSize ?? '?'} lots — ${t.outcome}`),
                evidenceTrades: overconfidenceInstances.slice(0, 3).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    context: lang === 'fr' ? 'Taille de position augmentée après série gagnante' : 'Position size spiked after winning streak',
                })),
            });
        }
    }

    // ── PATTERN 23: Session State Collapse ───────────────────────────────────
    {
        const stateCollapses: string[] = [];
        const daySessionMap: Record<string, { hasWin: boolean; hasCritical: boolean }> = {};
        sessions.forEach(s => {
            const day = s.trades[0]?.createdAt?.slice(0, 10) ?? '';
            if (!day) return;
            if (!daySessionMap[day]) daySessionMap[day] = { hasWin: false, hasCritical: false };
            if (s.pnl > 0) daySessionMap[day].hasWin = true;
            if (s.tag === 'CRITICAL') daySessionMap[day].hasCritical = true;
        });
        Object.entries(daySessionMap).forEach(([day, { hasWin, hasCritical }]) => {
            if (hasWin && hasCritical) stateCollapses.push(day);
        });
        if (stateCollapses.length >= 2) {
            patterns.push({
                name: lang === 'fr' ? 'Effondrement de session' : 'Session State Collapse',
                freq: stateCollapses.length,
                severity: 'HIGH',
                impact: 0,
                desc: lang === 'fr'
                    ? `${stateCollapses.length} jours où une session gagnante a été suivie d'une session critique. Signal de sur-trading après une victoire.`
                    : `${stateCollapses.length} days where a winning session was followed by a critical loss session. Over-trading after success pattern.`,
                evidence: stateCollapses.slice(0, 3),
                evidenceTrades: stateCollapses.slice(0, 3).map(day => ({
                    timestamp: day,
                    asset: '—',
                    pnl: 0,
                    context: lang === 'fr'
                        ? 'Session gagnante suivie d\'une session critique le même jour'
                        : 'Winning session followed by critical loss session same day',
                })),
            });
        }
    }

    // Sort worst impact first
    patterns.sort((a, b) => a.impact - b.impact);

    // ── 3. Risk score ─────────────────────────────────────────────────────────
    const revFreq = patterns.find(p => p.name === 'Revenge Trading')?.freq ?? 0;
    const revScore = revFreq > 0 ? Math.min(60, revFreq * 20) : 0;
    // Only count negative-impact patterns — net-positive behavior should not raise risk score
    const behavDrag = Math.abs(patterns.reduce((a, b) => a + Math.min(0, b.impact ?? 0), 0));
    const financialScore = closed.length > 0 && behavDrag > balance * 0.05 ? 25 : 0;
    const wrErosion = closed.length > 0 && (wins.length / Math.max(closed.length, 1) < 0.35) ? 15 : 0;
    const riskScore = closed.length === 0 ? 0 : Math.min(100, revScore + financialScore + wrErosion);

    // ── 4. Verdict ────────────────────────────────────────────────────────────
    let verdictMsg = 'Your system is structurally sound.';
    let action = 'Continue execution protocol.';
    if (patterns.length > 0 && patterns[0].severity === 'CRITICAL') {
        const p = patterns[0];
        verdictMsg = `Primary leakage: [${p.name}] — $${Math.abs(p.impact).toLocaleString()} erased across ${p.freq} occurrence${p.freq > 1 ? 's' : ''}.`;
        if (p.name === 'Revenge Trading') action = '3-loss hard stop. Market BAN for 24 hours after trigger.';
        else if (p.name === 'Held Losers') action = 'Time-based kill switch: max hold = avg win duration.';
        else if (p.name === 'Catastrophic Day') action = 'Daily hard stop is non-negotiable. Session ends at limit — no exceptions.';
        else if (p.name === 'Loss Escalation') action = 'Reduce size after every loss. Never increase during drawdown.';
        else if (p.name === 'Directional Bias Failure') action = 'Suspend losing direction until edge is re-established with backtested data.';
    }

    // ── 5. Scorecard ──────────────────────────────────────────────────────────
    const microBroad = closed.filter(t => /^M[A-Z0-9]{1,2}$/.test(t.asset));
    const microBroadPnl = microBroad.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const scorecard = [
        { metric: 'Stop Loss Discipline', grade: (() => {
            if (lossTrades.length === 0) return '—';
            const maxL = Math.max(...lossTrades.map(l => Math.abs(l.pnl ?? 0)));
            const pct = maxL / balance;
            return pct < 0.01 ? 'A' : pct < 0.02 ? 'B' : pct < 0.04 ? 'C' : pct < 0.06 ? 'D' : 'F';
        })(), desc: 'Max single trade loss vs starting balance. A=<1% B=1–2% C=2–4% D=4–6% F=>6%.' },
        { metric: 'Tilt Management', grade: (() => {
            if (revFreq === 0) return 'A';
            if (revFreq === 1) return 'C';
            if (revFreq <= 3) return 'D';
            return 'F';
        })(), desc: 'Rapid re-entry after losses. A=none C=1 D=2–3 F=4+.' },
        { metric: 'Hold Time Asymmetry', grade: (() => {
            if (winsWithDur.length === 0 && lossesWithDur.length === 0) return '—';
            if (lossesWithDur.length === 0) return 'A';
            if (winsWithDur.length === 0) return 'F';
            const ratio = avgWinDur / avgLossDur;
            return ratio >= 1.2 ? 'A' : ratio >= 0.9 ? 'B' : ratio >= 0.6 ? 'C' : ratio >= 0.35 ? 'D' : 'F';
        })(), desc: 'Avg win hold ÷ avg loss hold. A≥1.2 B≥0.9 C≥0.6 D≥0.35 F<0.35.' },
        { metric: 'Expectancy Ratio', grade: (() => {
            if (wins.length === 0 || lossTrades.length === 0) return '—';
            const r = avgWinAmt / avgLossAmt;
            return r >= 1.5 ? 'A' : r >= 1.2 ? 'B' : r >= 1.0 ? 'C' : r >= 0.7 ? 'D' : 'F';
        })(), desc: 'Avg win ÷ avg loss. A≥1.5 B≥1.2 C≥1.0 D≥0.7 F<0.7.' },
        { metric: 'Micro Management', grade: (() => {
            if (microBroad.length === 0) return '—';
            if (microBroadPnl >= 0) return 'A';
            const microGross = microBroad.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
            const lossFraction = microGross > 0 ? Math.abs(microBroadPnl) / microGross : 1;
            return lossFraction < 0.05 ? 'B' : lossFraction < 0.2 ? 'C' : lossFraction < 0.4 ? 'D' : 'F';
        })(), desc: 'Net P&L on micro contracts (MES/MNQ/M2K/MCL etc.). A=profitable B=<5% net drag C=<20% D=<40% F=≥40%.' },
        { metric: 'First Hour Logic', grade: (() => {
            const fh = closed.filter(t => estHour(t.createdAt) < 10);
            if (fh.length === 0) return 'A';
            const wr = fh.filter(t => (t.pnl ?? 0) > 0).length / fh.length;
            const pnl = fh.reduce((s, t) => s + (t.pnl ?? 0), 0);
            return pnl >= 0 && wr >= 0.5 ? 'A' : wr >= 0.45 ? 'B' : wr >= 0.35 ? 'C' : 'F';
        })(), desc: 'Trades entered before 10:00 EST. A=profitable B=break-even C=marginal F=negative.' },
        { metric: 'Session Caps', grade: (() => {
            if (sessions.length === 0) return '—';
            const maxT = Math.max(...sessions.map(s => s.trades.length));
            return maxT <= 10 ? 'A' : maxT <= 15 ? 'B' : maxT <= 25 ? 'C' : maxT <= 35 ? 'D' : 'F';
        })(), desc: 'Max trades in one session. A≤10 B≤15 C≤25 D≤35 F>35.' },
        { metric: 'Instrument Focus', grade: (() => {
            const n = new Set(closed.map(t => t.asset)).size;
            return n <= 2 ? 'A' : n <= 4 ? 'B' : n <= 6 ? 'C' : 'F';
        })(), desc: 'Unique instruments traded. A≤2 B≤4 C≤6 F>6.' },
    ];

    return {
        sessions, patterns, scorecard, riskScore,
        verdict: { message: verdictMsg, action, isCritical: patterns.some(p => p.severity === 'CRITICAL') },
        timeStats: {
            hourlyPnl: (() => {
                const h = new Array(24).fill(0);
                closed.forEach(t => {
                    const d = new Date(new Date(t.closedAt ?? t.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }));
                    h[d.getHours()] += (t.pnl ?? 0);
                });
                return h;
            })(),
            bestHour: 0, worstHour: 0,
        },
        streaksSequence: closed.map(t => (t.pnl ?? 0) >= 0 ? 'W' : 'L').slice(-100),
        maxWinStreak: calculateStreak(closed, true),
        maxLossStreak: calculateStreak(closed, false),
        avgLossStreak: (() => {
            let count = 0, total = 0, curr = 0;
            closed.forEach(t => { if ((t.pnl ?? 0) < 0) curr++; else { if (curr > 0) { count++; total += curr; } curr = 0; } });
            if (curr > 0) { count++; total += curr; }
            return count > 0 ? total / count : 0;
        })(),
        streakStats: [2, 3, 4, 5].map(l => ({ losses: l, recFactor: 70 - (l * 10), churn: 1.5 + (l * 0.5) })),
        currentStreakType: (closed[closed.length - 1]?.pnl ?? 0) >= 0 ? 'W' : 'L',
        currentStreakCount: (() => {
            if (closed.length === 0) return 0;
            const lastIsWin = (closed[closed.length - 1].pnl ?? 0) >= 0;
            let count = 0;
            for (let i = closed.length - 1; i >= 0; i--) {
                if (((closed[i].pnl ?? 0) >= 0) === lastIsWin) count++; else break;
            }
            return count;
        })(),
        isolatedDrawdownAlert: 'Susceptible to deep red loops. Action: Hard pause.',
    };
}

function calculateStreak(trades: Trade[], win: boolean): number {
    let max = 0, curr = 0;
    trades.forEach(t => {
        const isWin = (t.pnl ?? 0) >= 0;
        if (isWin === win) { curr++; if (curr > max) max = curr; } else curr = 0;
    });
    return max;
}
