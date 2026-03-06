import re
with open('src/components/pages/AnalyticsPage.tsx', 'r') as f:
    text = f.read()

# Replace assignments: += t.pnl -> += (t.pnl ?? 0)
text = text.replace('+= t.pnl', '+= (t.pnl ?? 0)')

# Replace rendering loops
text = text.replace('t.pnl >= 0', '(t.pnl ?? 0) >= 0')
text = text.replace('Math.abs(t.pnl)', 'Math.abs(t.pnl ?? 0)')
text = text.replace('acc[t.asset].pnl += t.pnl', 'acc[t.asset].pnl += (t.pnl ?? 0)')

with open('src/components/pages/AnalyticsPage.tsx', 'w') as f:
    f.write(text)
