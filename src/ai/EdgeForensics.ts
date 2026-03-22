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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtTs = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtDur = (s: number): string =>
    s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;

const estHour = (iso: string): number =>
    new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();

const estDay = (iso: string): number =>
    new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

// ── Main engine ───────────────────────────────────────────────────────────────

export function generateForensics(trades: Trade[], accountData: any) {
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
                const t1 = new Date(ts[i].closedAt ?? ts[i].createdAt).getTime();
                const t2 = new Date(ts[i + 1].closedAt ?? ts[i + 1].createdAt).getTime();
                if (t2 - t1 < 5 * 60000) { hasRevenge = true; break; }
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
    const avgWinDur = winsWithDur.length > 0 ? winsWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / winsWithDur.length : 60;
    const avgLossDur = lossesWithDur.length > 0 ? lossesWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / lossesWithDur.length : 60;
    const avgWinAmt = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 1;
    const avgLossAmt = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossTrades.length : 1;

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
                let count = 0, seqImp = 0;
                for (let j = i + 1; j < closed.length; j++) {
                    // Use OPEN TIME of the next trade to measure elapsed time since the loss.
                    // If the next trade opened BEFORE the loss closed, it's a parallel position
                    // (opened simultaneously) — NOT a re-entry. Skip it.
                    const jOpenTime = new Date(closed[j].createdAt).getTime();
                    if (jOpenTime < lossClose) continue; // parallel position — not revenge

                    const isCrypto = closed[j].assetType === 'crypto' || TRADEIFY_CRYPTO_LIST?.includes(closed[j].asset);
                    const windowMs = (isCrypto ? 5 : 30) * 60000;
                    const elapsed = jOpenTime - lossClose; // time from loss close → next open
                    if (elapsed <= windowMs) {
                        count++;
                        seqImp += (closed[j].pnl ?? 0);
                        const minAfter = Math.round(elapsed / 60000);
                        evidenceTrades.push({
                            timestamp: fmtTs(closed[j].closedAt ?? closed[j].createdAt),
                            asset: closed[j].asset,
                            pnl: closed[j].pnl ?? 0,
                            durationLabel: closed[j].durationSeconds ? fmtDur(closed[j].durationSeconds!) : undefined,
                            context: `Re-entry ${minAfter}min after -$${Math.abs(closed[i].pnl ?? 0).toFixed(0)} loss on ${closed[i].asset}`,
                        });
                        evidenceStr.push(`${closed[j].asset} @ ${fmtTs(closed[j].closedAt ?? closed[j].createdAt)}: ${minAfter}min after loss, P&L ${(closed[j].pnl ?? 0) >= 0 ? '+' : ''}$${(closed[j].pnl ?? 0).toFixed(0)}`);
                    } else break;
                }
                if (count >= 3 && seqImp < 0) { freq++; impact += seqImp; i += count; }
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
        const held = lossTrades.filter(t => (t.durationSeconds ?? 0) > avgWinDur * 1.5);
        if (held.length > 0) {
            const impact = held.reduce((a, b) => a + (b.pnl ?? 0), 0);
            patterns.push({
                name: 'Held Losers', freq: held.length, impact,
                severity: impact < -400 || held.length > 5 ? 'CRITICAL' : 'WARNING',
                desc: 'Losing trades held 50%+ longer than average winning trade — holding hope instead of executing stop.',
                evidence: held.slice(0, 3).map(t => `${t.asset}: held ${fmtDur(t.durationSeconds ?? 0)} vs ${fmtDur(avgWinDur)} avg win`),
                evidenceTrades: held.slice(0, 5).map(t => ({
                    timestamp: fmtTs(t.closedAt ?? t.createdAt),
                    asset: t.asset,
                    pnl: t.pnl ?? 0,
                    durationLabel: fmtDur(t.durationSeconds ?? 0),
                    context: `Held ${fmtDur(t.durationSeconds ?? 0)} — avg winner exits at ${fmtDur(avgWinDur)}`,
                })),
            });
        }
    }

    // ── PATTERN 3: Early Exit ─────────────────────────────────────────────────
    {
        // Threshold: duration < 50% of avg winning trade duration.
        // Exclude any win that beats avgWinAmt — a trade that exceeds your avg win
        // in dollar terms is efficient, not premature, regardless of how fast it ran.
        const earlyWins = wins.filter(t =>
            (t.durationSeconds ?? 0) > 0 &&
            t.durationSeconds! < avgWinDur * 0.5 &&
            (t.pnl ?? 0) < avgWinAmt
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
                        `Avg hold on early exits: ${fmtDur(earlyWins.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / earlyWins.length)} vs ${fmtDur(avgWinDur)} avg win duration`,
                    ],
                    evidenceTrades: earlyWins.slice(0, 5).map(t => ({
                        timestamp: fmtTs(t.closedAt ?? t.createdAt),
                        asset: t.asset,
                        pnl: t.pnl ?? 0,
                        durationLabel: fmtDur(t.durationSeconds ?? 0),
                        context: `Held ${fmtDur(t.durationSeconds ?? 0)} — avg winner runs ${fmtDur(avgWinDur)}, est. $${forgone.toFixed(0)} left on table`,
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
        // Build a de-duplicated sequential loss list.
        // Parallel trades (multiple positions opened simultaneously) are collapsed
        // into a single cluster so they don't generate fake "escalation" signals.
        // Two trades are parallel if trade[j] opened BEFORE trade[i] closed.
        const seqLosses: { pnl: number; trade: Trade }[] = [];
        for (let i = 0; i < closed.length; i++) {
            if ((closed[i].pnl ?? 0) >= 0) continue;
            const iClose = new Date(closed[i].closedAt ?? closed[i].createdAt).getTime();
            // Check if this trade is parallel to the previous loss (overlapping time window)
            if (seqLosses.length > 0) {
                const prev = seqLosses[seqLosses.length - 1].trade;
                const prevClose = new Date(prev.closedAt ?? prev.createdAt).getTime();
                const iOpen = new Date(closed[i].createdAt).getTime();
                if (iOpen < prevClose) {
                    // Parallel position — merge into the cluster (add to last entry's pnl)
                    seqLosses[seqLosses.length - 1].pnl += (closed[i].pnl ?? 0);
                    continue;
                }
            }
            seqLosses.push({ pnl: closed[i].pnl ?? 0, trade: closed[i] });
        }

        let freq = 0, impact = 0;
        const evidenceTrades: EvidenceTrade[] = [];
        const evidenceStr: string[] = [];
        let i = 0;
        while (i < seqLosses.length - 2) {
            let seqEnd = i;
            let prev = Math.abs(seqLosses[i].pnl);
            let j = i + 1;
            while (j < seqLosses.length && seqLosses[j].pnl < 0 && Math.abs(seqLosses[j].pnl) > prev) {
                prev = Math.abs(seqLosses[j].pnl);
                seqEnd = j;
                j++;
            }
            const seqLen = seqEnd - i + 1;
            if (seqLen >= 3) {
                freq++;
                const seqSlice = seqLosses.slice(i, seqEnd + 1);
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
        const bleedSessions = sessions.filter(s => {
            let cum = 0, peak = 0;
            for (const t of s.trades) { cum += (t.pnl ?? 0); if (cum > peak) peak = cum; }
            return peak > 0 && s.pnl < 0;
        });
        if (bleedSessions.length > 0) {
            const impact = bleedSessions.reduce((s, sess) => s + sess.pnl, 0);
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
                    return `${fmtTs(s.startTime)}: peaked +$${peak.toFixed(0)}, ended $${s.pnl.toFixed(0)}`;
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
            const d = (t.closedAt ?? t.createdAt).slice(0, 10);
            if (!dayMap[d]) dayMap[d] = [];
            dayMap[d].push(t);
        });
        const catDays = Object.entries(dayMap)
            .map(([date, ts]) => ({ date, pnl: ts.reduce((s, t) => s + (t.pnl ?? 0), 0), trades: ts }))
            .filter(d => d.pnl < 0 && Math.abs(d.pnl) > balance * 0.03);
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
                        context: `Day total: -$${Math.abs(d.pnl).toFixed(0)} (${((Math.abs(d.pnl) / balance) * 100).toFixed(1)}% of account) — this trade: $${Math.abs(t.pnl ?? 0).toFixed(0)}`,
                    });
                });
            });
            patterns.push({
                name: 'Catastrophic Day', freq: catDays.length, impact,
                severity: 'CRITICAL',
                desc: `${catDays.length} trading day${catDays.length > 1 ? 's' : ''} with loss >3% of account — structural damage requiring immediate hard-stop enforcement.`,
                evidence: catDays.slice(0, 3).map(d => `${d.date}: -$${Math.abs(d.pnl).toFixed(0)} (${((Math.abs(d.pnl) / balance) * 100).toFixed(1)}% of account)`),
                evidenceTrades: evidenceTrades.slice(0, 5),
            });
        }
    }

    // Sort worst impact first
    patterns.sort((a, b) => a.impact - b.impact);

    // ── 3. Risk score ─────────────────────────────────────────────────────────
    const revFreq = patterns.find(p => p.name === 'Revenge Trading')?.freq ?? 0;
    const revScore = revFreq > 0 ? Math.min(60, revFreq * 20) : 0;
    const financialScore = closed.length > 0 && Math.abs(patterns.reduce((a, b) => a + (b.impact ?? 0), 0)) > (balance * 0.05) ? 25 : 0;
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
            return lossFraction < 0.15 ? 'C' : lossFraction < 0.4 ? 'D' : 'F';
        })(), desc: 'Net P&L on micro contracts (MES/MNQ/M2K/MCL etc.).' },
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
            return maxT <= 10 ? 'A' : maxT <= 15 ? 'B' : maxT <= 20 ? 'C' : 'D';
        })(), desc: 'Max trades in one session. A≤10 B≤15 C≤20 D>20.' },
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
