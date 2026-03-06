import json

trades = [
    { "id": "56066", "risk": 32.40, "outcome": "win" },
    { "id": "56065", "risk": 230.88, "outcome": "win" },
    { "id": "56051", "risk": 221.43, "outcome": "loss" },
    { "id": "55828", "risk": 272.96, "outcome": "win" },
    { "id": "55727", "risk": 558.86, "outcome": "loss" },
    { "id": "55728", "risk": 23.88, "outcome": "loss" },
    { "id": "55689", "risk": 106.13, "outcome": "loss" },
    { "id": "55688", "risk": 245.22, "outcome": "loss" },
    { "id": "53071", "risk": 63.00, "outcome": "win" },
    { "id": "53069", "risk": 66.09, "outcome": "win" },
    { "id": "53070", "risk": 226.8, "outcome": "win" },
    { "id": "52838", "risk": 517.84, "outcome": "win" },
    { "id": "52837", "risk": 509.84, "outcome": "win" },
    { "id": "52775", "risk": 164.50, "outcome": "loss" },
    { "id": "52776", "risk": 164.50, "outcome": "loss" },
    { "id": "52774", "risk": 153.50, "outcome": "loss" },
    { "id": "52762", "risk": 50.0, "outcome": "loss" },
    { "id": "52764", "risk": 40.0, "outcome": "loss" },
    { "id": "52765", "risk": 40.0, "outcome": "loss" },
    { "id": "52734", "risk": 150.0, "outcome": "loss" },
    { "id": "52735", "risk": 150.0, "outcome": "loss" },
    { "id": "52344", "risk": 500.0, "outcome": "win" },
    { "id": "52345", "risk": 90.0, "outcome": "win" },
    { "id": "52271", "risk": 378.18, "outcome": "loss" },
    { "id": "49312", "risk": 305.50, "outcome": "win" },
    { "id": "45143", "risk": 889.32, "outcome": "win" },
    { "id": "45142", "risk": 1974.12, "outcome": "win" },
    { "id": "41591", "risk": 856.68, "outcome": "win" },
    { "id": "41590", "risk": 834.20, "outcome": "win" },
    { "id": "40179", "risk": 500.0, "outcome": "loss" },
    { "id": "39711", "risk": 500.0, "outcome": "loss" },
    { "id": "36923", "risk": 1000.0, "outcome": "win" },
    { "id": "36924", "risk": 231.97, "outcome": "win" }
]

wins = sum(1 for t in trades if t['outcome'] == 'win')
losses = sum(1 for t in trades if t['outcome'] == 'loss')
win_rate = round((wins/(wins+losses)) * 100)
print("Win Rate:", win_rate)

balance = 50000.0
risks = [(t['risk']/balance)*100 for t in trades]
avg = sum(risks) / len(risks)
import math
variance = sum((r - avg)**2 for r in risks) / len(risks)
stdDev = math.sqrt(variance)
riskConsistency = max(0, round(100 - stdDev * 20))
print("riskConsistency:", riskConsistency)
