'use client';

/**
 * InstrumentRadar — RadarChart for multi-dimensional instrument comparison.
 * Each axis is normalized 0-100 so metrics with different scales can be compared.
 * Axes: Win Rate · Profit Factor · Expectancy · Avg Win/Loss Ratio · Trade Volume
 *
 * Best chart for: "which instrument is strongest across ALL dimensions?" — a bar
 * chart can only answer one dimension at a time, a radar answers all 5 at once.
 */

import {
    ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
    PolarRadiusAxis, Radar, Legend, Tooltip
} from 'recharts';

export interface InstrumentMetric {
    asset: string;
    winRate: number;       // 0-100
    profitFactor: number;  // raw, will be normalized
    expectancy: number;    // raw dollar, will be normalized
    wlRatio: number;       // raw, will be normalized
    tradeCount: number;    // raw, will be normalized
    pnl: number;
}

interface Props {
    instruments: InstrumentMetric[];
    /** Highlight a specific instrument */
    highlight?: string;
    height?: number;
}

const COLORS = ['#FDC800', '#00D4FF', '#EAB308', '#ff4757', '#fb923c'];
const FONT = 'var(--font-mono)';

function normalize(val: number, min: number, max: number): number {
    if (max === min) return 50;
    return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
}

export default function InstrumentRadar({ instruments, height = 320 }: Props) {
    if (instruments.length === 0) {
        return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 11, color: '#6b7280' }}>No instrument data</div>;
    }

    const minPF = Math.min(...instruments.map(i => i.profitFactor));
    const maxPF = Math.max(...instruments.map(i => i.profitFactor));
    const minExp = Math.min(...instruments.map(i => i.expectancy));
    const maxExp = Math.max(...instruments.map(i => i.expectancy));
    const minWL = Math.min(...instruments.map(i => i.wlRatio));
    const maxWL = Math.max(...instruments.map(i => i.wlRatio));
    const minTC = Math.min(...instruments.map(i => i.tradeCount));
    const maxTC = Math.max(...instruments.map(i => i.tradeCount));

    // Radar needs: array of axis subjects, each instrument is a separate <Radar>
    const axes = ['WIN RATE', 'PROFIT FACTOR', 'EXPECTANCY', 'W/L RATIO', 'VOLUME'];

    // Build per-instrument data in radar format: array of { subject, [asset]: normalizedVal }
    const radarData = axes.map((subject, ai) => {
        const entry: Record<string, string | number> = { subject };
        instruments.slice(0, 5).forEach(inst => {
            let val = 0;
            if (ai === 0) val = inst.winRate;
            if (ai === 1) val = normalize(inst.profitFactor, minPF, maxPF);
            if (ai === 2) val = normalize(inst.expectancy, minExp, maxExp);
            if (ai === 3) val = normalize(inst.wlRatio, minWL, maxWL);
            if (ai === 4) val = normalize(inst.tradeCount, minTC, maxTC);
            entry[inst.asset] = Math.round(val);
        });
        return entry;
    });

    return (
        <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={radarData} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
                <PolarGrid stroke="#2d3748" />
                <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: '#c9d1d9', fontSize: 9, fontFamily: FONT, fontWeight: 700 }}
                />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: FONT, fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                    formatter={(v: number | undefined, name: string | undefined) => v !== undefined ? [`${v.toFixed(0)}/100`, name ?? ''] : ['—', name ?? '']}
                />
                {instruments.slice(0, 5).map((inst, i) => (
                    <Radar
                        key={inst.asset}
                        name={inst.asset}
                        dataKey={inst.asset}
                        stroke={COLORS[i % COLORS.length]}
                        fill={COLORS[i % COLORS.length]}
                        fillOpacity={instruments.length === 1 ? 0.15 : 0.08}
                        strokeWidth={instruments.length === 1 ? 2 : 1.5}
                    />
                ))}
                {instruments.length > 1 && (
                    <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontFamily: FONT, fontSize: 10, color: '#c9d1d9' }}
                    />
                )}
            </RadarChart>
        </ResponsiveContainer>
    );
}
