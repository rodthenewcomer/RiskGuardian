import re

with open('src/components/pages/AnalyticsPage.tsx', 'r') as f:
    text = f.read()

tabs_array = "'OVERVIEW', 'DAILY P&L', 'INSTRUMENTS', 'SESSIONS', 'TIME OF DAY', 'STREAKS', 'PATTERNS', 'SCORECARD', 'QUANT (Pro)', 'VERDICT', 'COMPARE (Pro)'"
text = re.sub(r"const TABS = \[\n\s+(.*?)\n\];", f"const TABS = [{tabs_array}];", text, flags=re.DOTALL)

with open('src/components/pages/AnalyticsPage.tsx', 'w') as f:
    f.write(text)
