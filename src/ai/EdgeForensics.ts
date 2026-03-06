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

export function generateForensics(trades: Trade[], accountData: any) {
    const closed = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Streaks logic
    const sequence = closed.map(t => (t.pnl ?? 0) >= 0 ? 'W' : 'L');
    const streakStats = [1, 2, 3, 4, 5].map(losses => {
        let occurrences = 0;
        let recoveryWins = 0;
        let totalChurn = 0;

        const pattern = 'L'.repeat(losses);
        for (let i = 0; i < sequence.length - losses; i++) {
            const slice = sequence.slice(i, i + losses).join('');
            if (slice === pattern && (i === 0 || sequence[i - 1] === 'W')) {
                occurrences++;
                const next5 = sequence.slice(i + losses, i + losses + 5);
                if (next5.includes('W')) recoveryWins++;
                const winIdx = next5.indexOf('W');
                if (winIdx !== -1) {
                    totalChurn += (winIdx + 1);
                } else {
                    totalChurn += 5;
                }
            }
        }

        const recFactor = occurrences > 0 ? (recoveryWins / occurrences) * 100 : 100;
        const churn = occurrences > 0 && recoveryWins > 0 ? totalChurn / recoveryWins : 5;

        return {
            losses,
            recFactor,
            churn
        };
    });

    const patterns = [];

    // Example: Revenge Trading
    let revengeFreq = 0, revengeImpact = 0;
    for (let i = 0; i < closed.length - 1; i++) {
        if ((closed[i].pnl ?? 0) < 0) {
            const lossTime = new Date(closed[i].createdAt).getTime();
            let nextLossesImpact = 0;
            let count = 0;
            for (let j = i + 1; j < closed.length; j++) {
                const diffMins = (new Date(closed[j].createdAt).getTime() - lossTime) / 60000;
                if (diffMins <= 15) {
                    count++;
                    nextLossesImpact += (closed[j].pnl ?? 0);
                } else {
                    break;
                }
            }
            if (count >= 3 && nextLossesImpact < 0) {
                revengeFreq++;
                revengeImpact += nextLossesImpact;
                i += count; // skip
            } else if ((closed[i].pnl ?? 0) < -300) {
                if (i + 1 < closed.length) {
                    const diffMins = (new Date(closed[i + 1].createdAt).getTime() - lossTime) / 60000;
                    if (diffMins <= 5 && (closed[i + 1].pnl ?? 0) < 0) {
                        revengeFreq++;
                        revengeImpact += (closed[i + 1].pnl ?? 0);
                        i++;
                    }
                }
            }
        }
    }
    if (revengeFreq > 0) patterns.push({ name: 'Revenge Trading', freq: revengeFreq, impact: revengeImpact, severity: revengeImpact < -500 ? 'CRITICAL' : 'WARNING', desc: 'Rapid trading after loss leading to further drawdown.' });

    // Held Losers
    const wins = closed.filter(t => (t.pnl ?? 0) > 0);
    const lossTrades = closed.filter(t => (t.pnl ?? 0) < 0);
    const avgWinDur = wins.length > 0 ? wins.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / wins.length : 1;
    let heldFreq = 0;
    let heldImpact = 0;
    lossTrades.forEach(t => {
        if ((t.durationSeconds ?? 0) > avgWinDur * 1.5) {
            heldFreq++;
            heldImpact += (t.pnl ?? 0);
        }
    });
    if (heldFreq > 0) patterns.push({ name: 'Held Losers', freq: heldFreq, impact: heldImpact, severity: heldImpact < -500 || heldFreq >= 10 ? 'CRITICAL' : 'WARNING', desc: 'Losing trades held 50%+ longer than average win.' });

    // Early Exit
    const avgLossDur = lossTrades.length > 0 ? lossTrades.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) / lossTrades.length : 1;
    const avgWinAmt = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 1;
    const avgLossAmt = lossTrades.length > 0 ? Math.abs(lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0)) / lossTrades.length : 1;
    let earlyFreq = 0, earlyImpact = 0; // estimate missed
    if (avgWinDur < avgLossDur * 0.4 && avgWinAmt < avgLossAmt * 0.8) {
        earlyFreq = wins.filter(t => (t.durationSeconds ?? 0) < avgLossDur * 0.4).length;
        patterns.push({ name: 'Early Exit', freq: earlyFreq, impact: -earlyFreq * avgLossAmt * 0.5, severity: earlyFreq > 10 ? 'CRITICAL' : 'WARNING', desc: 'Average win held <40% duration of average loss.' });
    }

    // Micro Overtrading
    const micros = closed.filter(t => t.asset.includes('MNQ') || t.asset.includes('MES'));
    const microWins = micros.filter(t => (t.pnl ?? 0) > 0).length;
    const microWinRate = micros.length > 0 ? (microWins / micros.length) * 100 : 0;
    const totalWinRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const microPnl = micros.reduce((s, t) => s + (t.pnl ?? 0), 0);
    if (micros.length / closed.length > 0.2 && microPnl < 0 && microWinRate < totalWinRate - 10) {
        patterns.push({ name: 'Micro Overtrading', freq: micros.length, impact: microPnl, severity: microPnl < -200 ? 'WARNING' : 'INFO', desc: 'High frequency in micro contracts with negative net edge.' });
    }

    // Default missing patterns
    if (patterns.length === 0) {
        patterns.push({ name: 'Optimal Execution', freq: closed.length, impact: 0, severity: 'INFO', desc: 'No negative psychological patterns detected.' });
    }

    // Sort patterns by impact
    patterns.sort((a, b) => a.impact - b.impact); // impact is negative, so lowest first

    // Scorecard Generation
    const scorecard = [
        { metric: 'Stop Loss Discipline', grade: Math.max(...lossTrades.map(l => Math.abs(l.pnl ?? 0))) < accountData.balance * 0.02 ? 'A' : 'C', desc: 'Checks if max loss per trade contained to < 2% of equity.' },
        { metric: 'Tilt Management', grade: revengeFreq === 0 ? 'A' : revengeFreq < 3 ? 'C' : 'F', desc: 'Evaluates sizing increases immediately following localized drawdowns.' },
        { metric: 'Hold Time Asymmetry', grade: avgWinDur >= avgLossDur ? 'A' : avgWinDur >= avgLossDur * 0.5 ? 'C' : 'F', desc: 'Evaluates whether winners are held longer than losers.' },
        { metric: 'Micro Management', grade: microPnl >= 0 ? 'A' : microPnl > -100 ? 'C' : 'F', desc: 'Evaluates overtrading on micro products.' }
    ];

    // Verdict Logic
    let primaryAction = "Continue strict risk management practices.";
    let criticalMsg = "Your system is operating cleanly.";
    if (patterns.length > 0 && patterns[0].severity === 'CRITICAL') {
        const worst = patterns[0];
        criticalMsg = `Your biggest behavioral leakage is ${worst.name}, costing you $${Math.abs(worst.impact).toFixed(0)}.`;
        if (worst.name === 'Revenge Trading') primaryAction = "Implement a strict 3-loss hard stop logic. Once triggered, you must halt execution for 24 hours.";
        if (worst.name === 'Held Losers') primaryAction = "Implement a strict time-based stop. If trade hasn't moved structurally in 10 minutes, cut it.";
        if (worst.name === 'Early Exit') primaryAction = "Remove your hand from the mouse. Set TP orders and allow price to hit targets.";
    }

    return {
        streakStats,
        patterns,
        scorecard,
        verdict: {
            message: criticalMsg,
            action: primaryAction,
            isCritical: patterns.some(p => p.severity === 'CRITICAL')
        }
    };
}
