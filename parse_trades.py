import json

data = """
56066BTC/USDBUY05/03/2026 16:54:43$71,214.6105/03/2026 17:03:42$71,517.948m 59s+$49.20
56065BTC/USDBUY05/03/2026 16:54:29$71,239.1605/03/2026 17:03:41$71,528.499m 12s+$278.51
56051BTC/USDBUY05/03/2026 16:50:52$71,324.4105/03/2026 16:52:13$71,208.141m 20s-$207.89
55828BTC/USDSELL05/03/2026 15:06:02$72,175.0405/03/2026 15:32:12$71,184.7126m 10s+$840.03
55727BTC/USDBUY05/03/2026 15:00:30$72,658.8605/03/2026 15:05:16$72,168.594m 46s-$493.23
55728BTC/USDBUY05/03/2026 14:58:46$72,627.6605/03/2026 15:05:18$72,159.146m 31s-$10.54
55689BTC/USDSELL05/03/2026 14:52:26$72,320.5905/03/2026 14:54:39$72,541.962m 13s-$83.84
55688BTC/USDSELL05/03/2026 14:31:34$72,417.0405/03/2026 14:54:38$72,534.6623m 04s-$158.10
53071SOL/USDBUY04/03/2026 17:29:46$91.0804/03/2026 18:03:29$91.3733m 42s+$16.92
53069SOL/USDBUY04/03/2026 17:29:44$91.1004/03/2026 18:03:22$91.4233m 37s+$19.23
53070SOL/USDBUY04/03/2026 17:29:34$91.0804/03/2026 18:03:28$91.3733m 54s+$60.90
52838XRP/USDBUY04/03/2026 17:29:13$1.4404/03/2026 17:43:19$1.4514m 06s+$129.46
52837XRP/USDBUY04/03/2026 17:29:07$1.4404/03/2026 17:43:18$1.4514m 11s+$127.46
52775XRP/USDBUY04/03/2026 17:16:29$1.4504/03/2026 17:19:11$1.442m 41s-$164.50
52776XRP/USDBUY04/03/2026 17:16:29$1.4504/03/2026 17:19:11$1.442m 41s-$164.50
52774XRP/USDBUY04/03/2026 17:16:28$1.4504/03/2026 17:19:06$1.442m 37s-$153.50
52762XRP/USDBUY04/03/2026 17:10:29$1.4504/03/2026 17:14:26$1.453m 57s-$34.62
52764XRP/USDBUY04/03/2026 17:10:25$1.4504/03/2026 17:14:33$1.454m 08s-$22.62
52765XRP/USDBUY04/03/2026 17:10:22$1.4504/03/2026 17:14:34$1.454m 11s-$24.62
52734XRP/USDBUY04/03/2026 16:39:26$1.4504/03/2026 17:08:37$1.4529m 10s-$178.10
52735XRP/USDBUY04/03/2026 16:39:12$1.4504/03/2026 17:08:39$1.4529m 26s-$175.02
52344DOGE/USDBUY04/03/2026 14:56:21$0.1004/03/2026 15:02:52$0.106m 31s+$222.36
52345XRP/USDBUY04/03/2026 14:52:59$1.4104/03/2026 15:02:56$1.429m 57s+$72.27
52271BTC/USDBUY04/03/2026 14:38:44$71,937.6604/03/2026 14:42:31$71,708.243m 47s-$258.12
49312BTC/USDSELL03/03/2026 14:32:55$67,127.4403/03/2026 14:42:51$66,513.569m 55s+$504.59
45143XRP/USDBUY02/03/2026 02:31:54$1.3602/03/2026 04:04:42$1.371h 32m+$148.22
45142XRP/USDBUY02/03/2026 02:31:09$1.3602/03/2026 04:04:40$1.371h 33m+$329.02
41591DOGE/USDBUY01/03/2026 01:29:18$0.0901/03/2026 02:03:08$0.1033m 49s+$856.68
41590DOGE/USDBUY01/03/2026 01:26:35$0.0901/03/2026 02:03:02$0.1036m 27s+$834.20
40179DOGE/USDSELL28/02/2026 15:32:57$0.0928/02/2026 18:10:58$0.092h 38m-$403.98
39711DOGE/USDSELL28/02/2026 15:12:59$0.0928/02/2026 15:29:23$0.0916m 23s-$590.55
36923DOGE/USDSELL27/02/2026 08:20:21$0.1027/02/2026 10:22:06$0.102h 1m+$879.68
36924BTC/USDSELL27/02/2026 07:39:45$67,472.7927/02/2026 10:22:09$66,805.912h 42m+$294.44
"""
lines = data.strip().split('\n')
out = []

import datetime

for line in lines:
    parts = line.split('\t')
    if len(parts) >= 9:
        tid = parts[0]
        sym = parts[1].replace('/USD', '')
        side = parts[2]
        isShort = (side == 'SELL')
        
        # parse dates: DD/MM/YYYY HH:MM:SS
        def parse_date(dstr):
            # 05/03/2026 16:54:43
            day, month, rest = dstr.split('/')
            year_time = rest.split(' ')
            year = year_time[0]
            time = year_time[1]
            return f"{year}-{month}-{day}T{time}"
            
        created = parse_date(parts[3])
        entry = float(parts[4].replace('$', '').replace(',', ''))
        closedAt = parse_date(parts[5])
        closedPrice = float(parts[6].replace('$', '').replace(',', ''))
        pnl_str = parts[8].replace('$', '').replace(',', '').replace('+', '')
        pnl = float(pnl_str)
        
        outcome = 'win' if pnl > 0 else 'loss'
        
        # calculate size
        diff = entry - closedPrice if isShort else closedPrice - entry
        if diff != 0:
            size = abs(pnl / diff)
        else:
            size = 0.0
            
        risk = abs(diff) * size if outcome == 'loss' else size * (entry * 0.005) # dummy risk if win
        reward = abs(diff) * size if outcome == 'win' else size * (entry * 0.005)
        rr = reward / risk if risk > 0 else 0
        
        obj = {
            'id': tid,
            'asset': sym,
            'assetType': 'crypto',
            'entry': round(entry, 5),
            'sl': round(entry * (1.005 if isShort else 0.995), 5),
            'tp': round(entry * (0.99 if isShort else 1.01), 5),
            'size': round(size, 4),
            'risk': round(risk, 2),
            'reward': round(reward, 2),
            'rr': round(rr, 2),
            'outcome': outcome,
            'created': created,
            'closedAt': closedAt,
            'pnl': round(pnl, 2),
            'isShort': isShort
        }
        out.append(obj)

# JS code
js_string = f"export const SEED_TRADES = {json.dumps(out, indent=4)};\n"
js_string = js_string.replace('"crypto"', "'crypto'").replace('"win"', "'win'").replace('"loss"', "'loss'")
# Fix the keys
import re
js_string = re.sub(r'"(\w+)":', r'\1:', js_string)

with open('src/data/seedTrades.ts', 'w') as f:
    f.write(js_string)

