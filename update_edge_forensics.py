import re

with open('src/ai/EdgeForensics.ts', 'r') as f:
    text = f.read()

replacement = """
    // Streaks logic
    const sequence = closed.map(t => (t.pnl ?? 0) > 0 ? 'W' : (t.pnl ?? 0) < 0 ? 'L' : 'B');
    
    // Calculate global streak metrics
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let currentStreakType = sequence.length > 0 ? sequence[sequence.length - 1] : '';
    let currentStreakCount = 0;
    
    let totalLossStreaks = 0;
    let lossStreakCountAcc = 0;
    let inLossStreak = false;
    let currentLossChain = 0;

    for (let i = 0; i < sequence.length; i++) {
        if (sequence[i] === 'W') {
            currentWinStreak++;
            if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
            currentLossStreak = 0;
            
            if (inLossStreak) {
                totalLossStreaks++;
                lossStreakCountAcc += currentLossChain;
                inLossStreak = false;
                currentLossChain = 0;
            }
        } else if (sequence[i] === 'L') {
            currentLossStreak++;
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
            currentWinStreak = 0;
            
            inLossStreak = true;
            currentLossChain++;
        } else {
            currentWinStreak = 0;
            currentLossStreak = 0;
        }
    }
    
    // Add final loss streak if sequence ended on a loss
    if (inLossStreak) {
        totalLossStreaks++;
        lossStreakCountAcc += currentLossChain;
    }

    // Determine current streak counting backwards
    for (let i = sequence.length - 1; i >= 0; i--) {
        if (sequence[i] === currentStreakType) {
            currentStreakCount++;
        } else {
            break;
        }
    }
    
    const avgLossStreak = totalLossStreaks > 0 ? lossStreakCountAcc / totalLossStreaks : 0;
    const streaksSequence = sequence.slice(-100); // Last 100 for visually stacking

    const streakStats = [1, 2, 3, 4, 5].map(losses => {
"""

# Replace `// Streaks logic` block
text = re.sub(r"\s+// Streaks logic.*?const streakStats = \[1, 2, 3, 4, 5\]\.map\(losses => \{", replacement, text, flags=re.DOTALL)

# Add elements to the return object
text = re.sub(r"return \{\n\s+streakStats,", r"return {\n        streaksSequence,\n        maxWinStreak,\n        maxLossStreak,\n        currentStreakType,\n        currentStreakCount,\n        avgLossStreak,\n        streakStats,", text)


with open('src/ai/EdgeForensics.ts', 'w') as f:
    f.write(text)

