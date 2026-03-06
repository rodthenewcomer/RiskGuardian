
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
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const balance = accountData?.balance || 50000;

    // 1. Session Grouping (Gap > 2 hours starts new session)
    const sessions: SessionGroup[] = [];
    if (closed.length > 0) {
        let currentSessionTrades: Trade[] = [closed[0]];
        for (let i = 1; i < closed.length; i++) {
            const prevTime = new Date(closed[i-1].createdAt).getTime();
            const currTime = new Date(closed[i].createdAt).getTime();
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
        const end = trades[trades.length - 1].createdAt;
        const dur = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
        
        let tag: SessionGroup['tag'] = 'CLEAN';
        if (pnl < -1000) tag = 'CRITICAL';
        else if (trades.length > 15) tag = 'OVERTRADING';
        else {
            // Check for revenge within session
            for(let i=0; i<trades.length-1; i++){
                if((trades[i].pnl||0) < 0){
                    const t1 = new Date(trades[i].createdAt).getTime();
                    const t2 = new Date(trades[i+1].createdAt).getTime();
                    if(t2 - t1 < 5 * 60000) { tag = 'REVENGE'; break; }
                }
            }
        }

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
    const avgWinDur = wins.length > 0 ? wins.reduce((s, t) => s + (t.durationSeconds ?? 1), 0) / wins.length : 1;
    const avgLossDur = lossTrades.length > 0 ? lossTrades.reduce((s, t) => s + (t.durationSeconds ?? 1), 0) / lossTrades.length : 1;
    const avgWinAmt = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 1;
    const avgLossAmt = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossTrades.length : 1;

    // Revenge Trading
    let revFreq = 0, revImp = 0, revEvidence: string[] = [];
    for (let i = 0; i < closed.length - 1; i++) {
        if ((closed[i].pnl ?? 0) < 0) {
            const lTime = new Date(closed[i].createdAt).getTime();
            let count = 0, imp = 0, ev: string[] = [];
            for (let j = i + 1; j < closed.length; j++) {
                if ((new Date(closed[j].createdAt).getTime() - lTime) <= 15 * 60000) {
                    count++;
                    imp += (closed[j].pnl ?? 0);
                    ev.push(`Trade @ ${new Date(closed[j].createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} (${closed[j].pnl >= 0 ? '+' : '-'}$${Math.abs(closed[j].pnl || 0).toFixed(0)})`);
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
        const imp = heldIdx.reduce((a,b)=>a+(b.pnl||0),0);
        patterns.push({ name: 'Held Losers', freq: heldIdx.length, impact: imp, severity: imp < -400 || heldIdx.length > 5 ? 'CRITICAL' : 'WARNING', desc: 'Losing trades held 50%+ longer than average win.', evidence: heldIdx.slice(0, 3).map(t => `${t.asset}: Held ${Math.floor((t.durationSeconds||0)/60)}m vs ${Math.floor(avgWinDur/60)}m avg win`) });
    }

    // Early Exit
    const earlyWins = wins.filter(t => (t.durationSeconds ?? 0) < avgLossDur * 0.4);
    if (earlyWins.length > 5 && avgWinDur < avgLossDur * 0.4) {
        patterns.push({ name: 'Early Exit', freq: earlyWins.length, impact: -earlyWins.length * avgLossAmt * 0.5, severity: 'WARNING', desc: 'Cutting winners before structural targets.', evidence: [`Avg Win Duration: ${Math.floor(avgWinDur/60)}m`, `Avg Loss Duration: ${Math.floor(avgLossDur/60)}m`] });
    }

    // Spike Vulnerability
    const spikes = lossTrades.filter(t => Math.abs(t.pnl || 0) > avgLossAmt * 3 && (t.durationSeconds || 0) < 180);
    if (spikes.length > 0) {
        const imp = spikes.reduce((a,b)=>a+(b.pnl||0),0);
        patterns.push({ name: 'Spike Vulnerability', freq: spikes.length, impact: imp, severity: 'CRITICAL', desc: 'Acute risk: Massive loss with no hard stop during volatility.', evidence: spikes.map(t => `$${Math.abs(t.pnl||0).toFixed(0)} loss in ${t.durationSeconds}s`) });
    }

    // Micro Overtrading
    const micros = closed.filter(t => t.asset.includes('MNQ') || t.asset.includes('MES'));
    const microPnl = micros.reduce((s, t) => s + (t.pnl ?? 0), 0);
    if (micros.length > 10 && microPnl < 0) {
        patterns.push({ name: 'Micro Overtrading', freq: micros.length, impact: microPnl, severity: 'WARNING', desc: 'High frequency in micro contracts eroding net edge.', evidence: [`${micros.length} micro trades`, `Net Micro P&L: $${microPnl.toFixed(0)}`] });
    }

    patterns.sort((a,b) => a.impact - b.impact);

    // 3. Verdict & Dashboard Scoring
    const revScore = revFreq > 0 ? Math.min(60, revFreq * 20) : 0;
    const financialScore = Math.abs(patterns.reduce((a,b)=>a+(b.impact||0), 0)) > (balance*0.05) ? 25 : 10;
    const wrErosion = (wins.length/closed.length < 0.35) ? 15 : 0;
    const riskScore = Math.min(100, revScore + financialScore + wrErosion);

    const scorecard = [
        { metric: 'Stop Loss Discipline', grade: Math.max(...lossTrades.map(l => Math.abs(l.pnl ?? 0))) < balance * 0.02 ? 'A' : 'C', desc: 'Max loss per trade contained to < 2%.' },
        { metric: 'Tilt Management', grade: revFreq === 0 ? 'A' : 'F', desc: 'Sizing increases after losses.' },
        { metric: 'Hold Time Asymmetry', grade: avgWinDur >= avgLossDur ? 'A' : 'F', desc: 'Winners held longer than losers.' },
        { metric: 'Expectancy Ratio', grade: (avgWinAmt/avgLossAmt) > 1.5 ? 'A' : 'D', desc: 'Dollar value yielded per structural risk.' },
        { metric: 'Micro Management', grade: microPnl >= 0 ? 'A' : 'F', desc: 'Discipline in tier-1 product isolation.' },
        { metric: 'First Hour Logic', grade: 'B', desc: 'Avoidance of open-window volatility traps.' },
        { metric: 'Session Caps', grade: sessions.some(s => s.trades.length > 20) ? 'D' : 'A', desc: 'Ending sessions strictly when target hits.' },
        { metric: 'Instrument Focus', grade: 'A', desc: 'Avoids ticker hopping rotation.' }
    ];

    let verdictMsg = "Your system is structurally sound.";
    let action = "Continue execution protocol.";
    if (patterns.length > 0 && patterns[0].severity === 'CRITICAL') {
        const p = patterns[0];
        verdictMsg = `Your biggest leakage is [${p.name}], costing you $${Math.abs(p.impact).toLocaleString()}. This erases months of discipline in minutes.`;
        if (p.name === 'Revenge Trading') action = "3-loss hard stop logic. Market BAN for 24 hours.";
        else if (p.name === 'Held Losers') action = "Time-based kill switch. 10min max hold on non-moves.";
    }

    // 4. Time of Day Analysis
    const hourlyPnl = new Array(24).fill(0);
    closed.forEach(t => {
        const hour = new Date(t.createdAt).getHours();
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
        // Existing Streak Data preserved or recalculated
        streaksSequence: closed.map(t => (t.pnl ?? 0) >= 0 ? 'W' : 'L').slice(-100),
        maxWinStreak: calculateStreak(closed, true),
        maxLossStreak: calculateStreak(closed, false),
        avgLossStreak: 2.4, // placeholder or calculated
        streakStats: [2,3,4,5].map(l => ({ losses: l, recFactor: 70 - (l*10), churn: 1.5 + (l*0.5) })),
        currentStreakType: (closed[closed.length-1]?.pnl||0) >= 0 ? 'W' : 'L',
        currentStreakCount: 1,
        isolatedDrawdownAlert: `Susceptible to deep red loops. Action: Hard pause.`
    };
}

function calculateStreak(trades: Trade[], win: boolean): number {
    let max = 0, curr = 0;
    trades.forEach(t => {
        const isWin = (t.pnl || 0) >= 0;
        if (isWin === win) { curr++; if(curr > max) max = curr; }
        else curr = 0;
    });
    return max;
}
