import os
import re

directories = ['src/ai', 'src/components']

target_pattern = r"(t\.outcome *=== *'win' *\? *t\.rewardUSD *: *-t\.riskUSD)"
replacement = r"(t.pnl ?? (\g<1>))"

# Also handle: `wins.reduce((s, t) => s + t.rewardUSD, 0) - losses.reduce((s, t) => s + t.riskUSD, 0);`
target_pattern2 = r"wins\.reduce\(\(s, *t\) *=> *s *\+ *t\.rewardUSD, *0\) *- *losses\.reduce\(\(s, *t\) *=> *s *\+ *t\.riskUSD, *0\)"
replacement2 = r"closed.reduce((s, t) => s + (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)), 0)"

target_pattern3 = r"weeklyWins\.reduce\(\(s, *t\) *=> *s *\+ *t\.rewardUSD, *0\) *- *weeklyTrades\.filter\(t *=> *t\.outcome *=== *'loss'\)\.reduce\(\(s, *t\) *=> *s *\+ *t\.riskUSD, *0\)"
replacement3 = r"weeklyTrades.reduce((s, t) => s + (t.pnl ?? (t.outcome === 'win' ? t.rewardUSD : -t.riskUSD)), 0)"

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = re.sub(target_pattern, replacement, content)
    new_content = re.sub(target_pattern2, replacement2, new_content)
    new_content = re.sub(target_pattern3, replacement3, new_content)

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for d in directories:
    for root, dirs, files in os.walk(d):
        for f in files:
            if f.endswith('.ts') or f.endswith('.tsx'):
                process_file(os.path.join(root, f))
