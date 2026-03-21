import { TRADEIFY_CRYPTO_LIST } from '@/store/appStore';

export interface Trade {
    id: string;
    asset: string;
    createdAt: string; // ISO date
    pnl?: number;
    outcome?: string; // 'win', 'loss', 'breakeven'
    rr?: number; // Risk/Reward
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

export function generateForensics(trades: Trade[], accountData: any) {
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
    const balance = accountData?.startingBalance ?? accountData?.balance ?? 50000;

    // 1. Session Grouping (Gap > 2 hours starts new session)
    const sessions: SessionGroup[] = [];
    if (closed.length > 0) {
        let currentSessionTrades: Trade[] = [closed[0]];
        for (let i = 1; i < closed.length; i++) {
            const prevTime = new Date(closed[i - 1].closedAt ?? closed[i - 1].createdAt).getTime();
            const currTime = new Date(closed[i].closedAt ?? closed[i].createdAt).getTime();
            if (currTime - prevTime > 2 * 60 * 60 * 1000) {
                // End current session
                sessions.push(createSessionGroup(currentSessionTrades, sessions.length));
                currentSessionTrades = [closed[i]];
            } else {
                currentSessionTrades.push(closed[i]);
            }
        }
        sessions.push(createSessionGroup(currentSessionTrades, sessions.length));
    }

    function createSessionGroup(trades: Trade[], index: number): SessionGroup {
        const pnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
        const wins = trades.filter(t => (t.pnl || 0) > 0).length;
        const wr = (wins / trades.length) * 100;
        const start = trades[0].createdAt;
        const end = trades[trades.length - 1].closedAt ?? trades[trades.length - 1].createdAt;
        const dur = (new Date(end).getTime() - new Date(start).getTime()) / 60000;

        // Check for revenge pattern
        let hasRevenge = false;
        for (let i = 0; i < trades.length - 1; i++) {
            if ((trades[i].pnl || 0) < 0) {
                const t1 = new Date(trades[i].closedAt ?? trades[i].createdAt).getTime();
                const t2 = new Date(trades[i + 1].closedAt ?? trades[i + 1].createdAt).getTime();
                if (t2 - t1 < 5 * 60000) { hasRevenge = true; break; }
            }
        }

        let tag: SessionGroup['tag'] = 'CLEAN';
        if (hasRevenge) tag = 'REVENGE';                  // behavioral root cause — highest priority
        else if (pnl < -1000) tag = 'CRITICAL';           // critical loss with no revenge detected
        else if (trades.length > 15) tag = 'OVERTRADING';

        return {
            id: `session-${index}`,
            startTime: start,
            endTime: end,
            trades,
            pnl,
            winRate: wr,
            tag,
            durationMinutes: dur
        };
    }

    // 2. 14 Behavioral Patterns with Evidence
    const patterns: any[] = [];
    const wins = closed.filter(t => (t.pnl ?? 0) > 0);
    const lossTrades = closed.filter(t => (t.pnl ?? 0) < 0);
    // Only include trades with actual duration data to avoid skewing averages with the fallback
    const winsWithDur = wins.filter(t => (t.durationSeconds ?? 0) > 0);
    const lossesWithDur = lossTrades.filter(t => (t.durationSeconds ?? 0) > 0);
    const avgWinDur = winsWithDur.length > 0 ? winsWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / winsWithDur.length : 60;
    const avgLossDur = lossesWithDur.length > 0 ? lossesWithDur.reduce((s, t) => s + t.durationSeconds!, 0) / lossesWithDur.length : 60;
    const avgWinAmt = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 1;
    const avgLossAmt = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossTrades.length : 1;

    // Revenge Trading
    let revFreq = 0, revImp = 0, revEvidence: string[] = [];
    for (let i = 0; i < closed.length - 1; i++) {
        if ((closed[i].pnl ?? 0) < 0) {
            const lTime = new Date(closed[i].closedAt ?? closed[i].createdAt).getTime();
            let count = 0, imp = 0, ev: string[] = [];
            for (let j = i + 1; j < closed.length; j++) {
                const isCrypto = closed[j].assetType === 'crypto' || TRADEIFY_CRYPTO_LIST?.includes(closed[j].asset);
                const windowMs = (isCrypto ? 5 : 30) * 60000;
                if ((new Date(closed[j].closedAt ?? closed[j].createdAt).getTime() - lTime) <= windowMs) {
                    count++;
                    imp += (closed[j].pnl ?? 0);
                    ev.push(`Trade @ ${new Date(closed[j].closedAt ?? closed[j].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${(closed[j].pnl ?? 0) >= 0 ? '+' : '-'}$${Math.abs(closed[j].pnl ?? 0).toFixed(0)})`);
                } else break;
            }
            if (count >= 3 && imp < 0) {
                revFreq++;
                revImp += imp;
                revEvidence.push(...ev);
                i += count;
            }
        }
    }
    if (revFreq > 0) patterns.push({ name: 'Revenge Trading', freq: revFreq, impact: revImp, severity: revImp < -500 ? 'CRITICAL' : 'WARNING', desc: 'Rapid trading after loss leading to further drawdown.', evidence: revEvidence.slice(0, 3) });

    // Held Losers
    const heldIdx = lossTrades.filter(t => (t.durationSeconds ?? 0) > avgWinDur * 1.5);
    if (heldIdx.length > 0) {
        const imp = heldIdx.reduce((a, b) => a + (b.pnl || 0), 0);
        patterns.push({ name: 'Held Losers', freq: heldIdx.length, impact: imp, severity: imp < -400 || heldIdx.length > 5 ? 'CRITICAL' : 'WARNING', desc: 'Losing trades held 50%+ longer than average win.', evidence: heldIdx.slice(0, 3).map(t => `${t.asset}: Held ${Math.floor((t.durationSeconds || 0) / 60)}m vs ${Math.floor(avgWinDur / 60)}m avg win`) });
    }

    // Early Exit — wins closed in under 40% of average loss duration
    // Impact = actual foregone profit: (avgWinAmt - earlyWin.pnl) per trade
    const earlyWins = wins.filter(t => (t.durationSeconds ?? 0) > 0 && t.durationSeconds! < avgLossDur * 0.4);
    if (earlyWins.length >= 3) {
        const earlyWinAvgPnl = earlyWins.reduce((s, t) => s + (t.pnl ?? 0), 0) / earlyWins.length;
        // Only penalise if early exits actually underperformed the average winner
        const forgonePerTrade = Math.max(0, avgWinAmt - earlyWinAvgPnl);
        const earlyImpact = -(forgonePerTrade * earlyWins.length);
        if (forgonePerTrade > 0) {
            patterns.push({
                name: 'Early Exit',
                freq: earlyWins.length,
                impact: earlyImpact,
                severity: Math.abs(earlyImpact) > 500 ? 'HIGH' : 'WARNING',
                desc: 'Cutting winners before structural targets.',
                evidence: [
                    `Early exit avg: $${earlyWinAvgPnl.toFixed(0)} vs full avg: $${avgWinAmt.toFixed(0)}`,
                    `Forgone per trade: $${forgonePerTrade.toFixed(0)}`,
                    `Avg hold: ${Math.floor(avgWinDur / 60)}m win · ${Math.floor(avgLossDur / 60)}m loss`,
                ],
            });
        }
    }

    // Spike Vulnerability
    const spikes = lossTrades.filter(t => Math.abs(t.pnl || 0) > avgLossAmt * 3 && (t.durationSeconds || 0) < 180);
    if (spikes.length > 0) {
        const imp = spikes.reduce((a, b) => a + (b.pnl || 0), 0);
        patterns.push({ name: 'Spike Vulnerability', freq: spikes.length, impact: imp, severity: 'CRITICAL', desc: 'Acute risk: Massive loss with no hard stop during volatility.', evidence: spikes.map(t => `$${Math.abs(t.pnl || 0).toFixed(0)} loss in ${t.durationSeconds}s`) });
    }

    // Micro Overtrading
    const micros = closed.filter(t => t.asset.includes('MNQ') || t.asset.includes('MES'));
    const microPnl = micros.reduce((s, t) => s + (t.pnl ?? 0), 0);
    if (micros.length > 10 && microPnl < 0) {
        patterns.push({ name: 'Micro Overtrading', freq: micros.length, impact: microPnl, severity: 'WARNING', desc: 'High frequency in micro contracts eroding net edge.', evidence: [`${micros.length} micro trades`, `Net Micro P&L: $${microPnl.toFixed(0)}`] });
    }

    patterns.sort((a, b) => a.impact - b.impact);

    // 3. Verdict & Dashboard Scoring
    const revScore = revFreq > 0 ? Math.min(60, revFreq * 20) : 0;
    const financialScore = closed.length > 0 && Math.abs(patterns.reduce((a, b) => a + (b.impact || 0), 0)) > (balance * 0.05) ? 25 : 0;
    const wrErosion = closed.length > 0 && (wins.length / closed.length < 0.35) ? 15 : 0;
    const riskScore = closed.length === 0 ? 0 : Math.min(100, revScore + financialScore + wrErosion);

    // Broader micro detection (MES, MNQ, M2K, MCL, MGC, MBT, etc.)
    const microBroad = closed.filter(t => /^M[A-Z0-9]{1,2}$/.test(t.asset));
    const microBroadPnl = microBroad.reduce((s, t) => s + (t.pnl ?? 0), 0);

    const scorecard = [
        // Stop Loss Discipline: graduated by max loss % of starting balance
        { metric: 'Stop Loss Discipline', grade: (() => {
            if (lossTrades.length === 0) return '—';
            const maxL = Math.max(...lossTrades.map(l => Math.abs(l.pnl ?? 0)));
            const pct = maxL / balance;
            return pct < 0.01 ? 'A' : pct < 0.02 ? 'B' : pct < 0.04 ? 'C' : pct < 0.06 ? 'D' : 'F';
        })(), desc: 'Max single trade loss vs starting balance. A=<1% B=1–2% C=2–4% D=4–6% F=>6%.' },
        // Tilt Management: graduated by frequency of revenge sequences
        { metric: 'Tilt Management', grade: (() => {
            if (revFreq === 0) return 'A';
            if (revFreq === 1) return 'C';
            if (revFreq <= 3) return 'D';
            return 'F';
        })(), desc: 'Rapid re-entry after losses. A=none C=1 occurrence D=2–3 F=4+.' },
        // Hold Time Asymmetry: graduated by win/loss duration ratio
        { metric: 'Hold Time Asymmetry', grade: (() => {
            if (winsWithDur.length === 0 && lossesWithDur.length === 0) return '—';
            if (lossesWithDur.length === 0) return 'A';
            if (winsWithDur.length === 0) return 'F'; // all wins exited instantly, no duration data
            const ratio = avgWinDur / avgLossDur;
            return ratio >= 1.2 ? 'A' : ratio >= 0.9 ? 'B' : ratio >= 0.6 ? 'C' : ratio >= 0.35 ? 'D' : 'F';
        })(), desc: 'Avg win hold ÷ avg loss hold. A≥1.2 B≥0.9 C≥0.6 D≥0.35 F<0.35.' },
        // Expectancy Ratio: graduated, uses actual W:L dollar ratio
        { metric: 'Expectancy Ratio', grade: (() => {
            if (wins.length === 0 || lossTrades.length === 0) return '—';
            const r = avgWinAmt / avgLossAmt;
            return r >= 1.5 ? 'A' : r >= 1.2 ? 'B' : r >= 1.0 ? 'C' : r >= 0.7 ? 'D' : 'F';
        })(), desc: 'Avg win ÷ avg loss. A≥1.5 B≥1.2 C≥1.0 D≥0.7 F<0.7.' },
        // Micro Management: uses broader micro detection (same as display)
        { metric: 'Micro Management', grade: (() => {
            if (microBroad.length === 0) return '—';
            if (microBroadPnl >= 0) return 'A';
            // Loss fraction = |net loss| / total gross activity (wins + |losses|)
            const microGross = microBroad.reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);
            const lossFraction = microGross > 0 ? Math.abs(microBroadPnl) / microGross : 1;
            return lossFraction < 0.15 ? 'C' : lossFraction < 0.4 ? 'D' : 'F';
        })(), desc: 'Net P&L on micro contracts (MES/MNQ/M2K/MCL etc.).' },
        // First Hour Logic: uses entry time (createdAt), not exit time
        { metric: 'First Hour Logic', grade: (() => {
            const estHour = (iso: string) => new Date(new Date(iso).toLocaleString("en-US", {timeZone: "America/New_York"})).getHours();
            const fh = closed.filter(t => estHour(t.createdAt) < 10);
            if (fh.length === 0) return 'A';
            const wr = fh.filter(t => (t.pnl ?? 0) > 0).length / fh.length;
            const pnl = fh.reduce((s, t) => s + (t.pnl ?? 0), 0);
            return pnl >= 0 && wr >= 0.5 ? 'A' : wr >= 0.45 ? 'B' : wr >= 0.35 ? 'C' : 'F';
        })(), desc: 'Trades entered before 10:00 EST (entry time). A=profitable B=break-even C=marginal F=negative.' },
        // Session Caps: graduated by max trades in a single session
        { metric: 'Session Caps', grade: (() => {
            if (sessions.length === 0) return '—';
            const maxT = Math.max(...sessions.map(s => s.trades.length));
            return maxT <= 10 ? 'A' : maxT <= 15 ? 'B' : maxT <= 20 ? 'C' : 'D';
        })(), desc: 'Max trades in one session. A≤10 B≤15 C≤20 D>20.' },
        // Instrument Focus: unchanged, already graduated
        { metric: 'Instrument Focus', grade: (() => {
            const n = new Set(closed.map(t => t.asset)).size;
            return n <= 2 ? 'A' : n <= 4 ? 'B' : n <= 6 ? 'C' : 'F';
        })(), desc: 'Unique instruments traded. A≤2 B≤4 C≤6 F>6.' }
    ];

    let verdictMsg = "Your system is structurally sound.";
    let action = "Continue execution protocol.";
    if (patterns.length > 0 && patterns[0].severity === 'CRITICAL') {
        const p = patterns[0];
        verdictMsg = `Your biggest leakage is [${p.name}], costing you $${Math.abs(p.impact).toLocaleString()}. This erases months of discipline in minutes.`;
        if (p.name === 'Revenge Trading') action = "3-loss hard stop logic. Market BAN for 24 hours.";
        else if (p.name === 'Held Losers') action = "Time-based kill switch. 10min max hold on non-moves.";
    }

    // 4. Time of Day Analysis (hours in EST, matching Tradeify's session convention)
    const hourlyPnl = new Array(24).fill(0);
    closed.forEach(t => {
        const estDate = new Date(new Date(t.closedAt ?? t.createdAt).toLocaleString("en-US", {timeZone: "America/New_York"}));
        const hour = estDate.getHours();
        hourlyPnl[hour] += (t.pnl || 0);
    });
    const bestHour = hourlyPnl.indexOf(Math.max(...hourlyPnl));
    const worstHour = hourlyPnl.indexOf(Math.min(...hourlyPnl));

    return {
        sessions,
        patterns,
        scorecard,
        riskScore,
        verdict: { message: verdictMsg, action, isCritical: patterns.some(p => p.severity === 'CRITICAL') },
        timeStats: { hourlyPnl, bestHour, worstHour },
        // Streak calculations
        streaksSequence: closed.map(t => (t.pnl ?? 0) >= 0 ? 'W' : 'L').slice(-100),
        maxWinStreak: calculateStreak(closed, true),
        maxLossStreak: calculateStreak(closed, false),
        avgLossStreak: (() => {
            let count = 0, total = 0, curr = 0;
            closed.forEach(t => {
                if ((t.pnl ?? 0) < 0) { curr++; }
                else { if (curr > 0) { count++; total += curr; } curr = 0; }
            });
            if (curr > 0) { count++; total += curr; }
            return count > 0 ? total / count : 0;
        })(),
        streakStats: [2, 3, 4, 5].map(l => ({ losses: l, recFactor: 70 - (l * 10), churn: 1.5 + (l * 0.5) })),
        currentStreakType: (closed[closed.length - 1]?.pnl || 0) >= 0 ? 'W' : 'L',
        currentStreakCount: (() => {
            if (closed.length === 0) return 0;
            const lastIsWin = (closed[closed.length - 1].pnl ?? 0) >= 0;
            let count = 0;
            for (let i = closed.length - 1; i >= 0; i--) {
                if (((closed[i].pnl ?? 0) >= 0) === lastIsWin) count++;
                else break;
            }
            return count;
        })(),
        isolatedDrawdownAlert: `Susceptible to deep red loops. Action: Hard pause.`
    };
}

function calculateStreak(trades: Trade[], win: boolean): number {
    let max = 0, curr = 0;
    trades.forEach(t => {
        const isWin = (t.pnl || 0) >= 0;
        if (isWin === win) { curr++; if (curr > max) max = curr; }
        else curr = 0;
    });
    return max;
}
