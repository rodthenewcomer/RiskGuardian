import json

trades = [
    { "id": "56066", "riskUSD": 32.40, "outcome": "win", "pnl": 49.20, "createdAt": "2026-03-05T16:54:43" },
    { "id": "56065", "riskUSD": 230.88, "outcome": "win", "pnl": 278.51, "createdAt": "2026-03-05T16:54:29" },
    { "id": "56051", "riskUSD": 221.43, "outcome": "loss", "pnl": -207.89, "createdAt": "2026-03-05T16:50:52" },
    { "id": "55828", "riskUSD": 272.96, "outcome": "win", "pnl": 840.03, "createdAt": "2026-03-05T15:06:02" },
    { "id": "55727", "riskUSD": 558.86, "outcome": "loss", "pnl": -493.23, "createdAt": "2026-03-05T15:00:30" },
    { "id": "55728", "riskUSD": 23.88, "outcome": "loss", "pnl": -10.54, "createdAt": "2026-03-05T14:58:46" },
    { "id": "55689", "riskUSD": 106.13, "outcome": "loss", "pnl": -83.84, "createdAt": "2026-03-05T14:52:26" },
    { "id": "55688", "riskUSD": 245.22, "outcome": "loss", "pnl": -158.10, "createdAt": "2026-03-05T14:31:34" },
    { "id": "53071", "riskUSD": 63.00, "outcome": "win", "pnl": 16.92, "createdAt": "2026-03-04T17:29:46" },
    { "id": "53069", "riskUSD": 66.09, "outcome": "win", "pnl": 19.23, "createdAt": "2026-03-04T17:29:44" },
    { "id": "53070", "riskUSD": 226.8, "outcome": "win", "pnl": 60.90, "createdAt": "2026-03-04T17:29:34" },
    { "id": "52838", "riskUSD": 517.84, "outcome": "win", "pnl": 129.46, "createdAt": "2026-03-04T17:29:13" },
    { "id": "52837", "riskUSD": 509.84, "outcome": "win", "pnl": 127.46, "createdAt": "2026-03-04T17:29:07" },
    { "id": "52775", "riskUSD": 164.50, "outcome": "loss", "pnl": -164.50, "createdAt": "2026-03-04T17:16:29" },
    { "id": "52776", "riskUSD": 164.50, "outcome": "loss", "pnl": -164.50, "createdAt": "2026-03-04T17:16:29" },
    { "id": "52774", "riskUSD": 153.50, "outcome": "loss", "pnl": -153.50, "createdAt": "2026-03-04T17:16:28" },
    { "id": "52762", "riskUSD": 50.0, "outcome": "loss", "pnl": -34.62, "createdAt": "2026-03-04T17:10:29" },
    { "id": "52764", "riskUSD": 40.0, "outcome": "loss", "pnl": -22.62, "createdAt": "2026-03-04T17:10:25" },
    { "id": "52765", "riskUSD": 40.0, "outcome": "loss", "pnl": -24.62, "createdAt": "2026-03-04T17:10:22" },
    { "id": "52734", "riskUSD": 150.0, "outcome": "loss", "pnl": -178.10, "createdAt": "2026-03-04T16:39:26" },
    { "id": "52735", "riskUSD": 150.0, "outcome": "loss", "pnl": -175.02, "createdAt": "2026-03-04T16:39:12" },
    { "id": "52344", "riskUSD": 500.0, "outcome": "win", "pnl": 222.36, "createdAt": "2026-03-04T14:56:21" },
    { "id": "52345", "riskUSD": 90.0, "outcome": "win", "pnl": 72.27, "createdAt": "2026-03-04T14:52:59" },
    { "id": "52271", "riskUSD": 378.18, "outcome": "loss", "pnl": -258.12, "createdAt": "2026-03-04T14:38:44" },
    { "id": "49312", "riskUSD": 305.50, "outcome": "win", "pnl": 504.59, "createdAt": "2026-03-03T14:32:55" },
    { "id": "45143", "riskUSD": 889.32, "outcome": "win", "pnl": 148.22, "createdAt": "2026-03-02T02:31:54" },
    { "id": "45142", "riskUSD": 1974.12, "outcome": "win", "pnl": 329.02, "createdAt": "2026-03-02T02:31:09" },
    { "id": "41591", "riskUSD": 856.68, "outcome": "win", "pnl": 856.68, "createdAt": "2026-03-01T01:29:18" },
    { "id": "41590", "riskUSD": 834.20, "outcome": "win", "pnl": 834.20, "createdAt": "2026-03-01T01:26:35" },
    { "id": "40179", "riskUSD": 500.0, "outcome": "loss", "pnl": -403.98, "createdAt": "2026-02-28T15:32:57" },
    { "id": "39711", "riskUSD": 500.0, "outcome": "loss", "pnl": -590.55, "createdAt": "2026-02-28T15:12:59" },
    { "id": "36923", "riskUSD": 1000.0, "outcome": "win", "pnl": 879.68, "createdAt": "2026-02-27T08:20:21" },
    { "id": "36924", "riskUSD": 231.97, "outcome": "win", "pnl": 294.44, "createdAt": "2026-02-27T07:39:45" }
]

days = {}

for t in trades:
    d = t["createdAt"].split('T')[0]
    days[d] = days.get(d, 0) + t["pnl"]
    
totalPnl = sum([t["pnl"] for t in trades])

bestDay = max(days.values())

consistencyScore = (bestDay / totalPnl) * 100

print("Best day:", bestDay)
print("totalPnl:", totalPnl)
print("consistencyScore:", consistencyScore)
print("Days:", days)
