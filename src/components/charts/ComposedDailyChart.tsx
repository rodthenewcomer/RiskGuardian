'use client';

/**
 * ComposedDailyChart — daily P&L bars + rolling N-day average line overlay.
 * Best-in-class for daily P&L time series: bar height = magnitude, color = sign,
 * line = trend context so the trader sees if recent sessions are improving.
 */

import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
    Tooltip, ReferenceLine, CartesianGrid, Cell
} from 'recharts';

export interface DailyPoint {
    date: string;
    pnl: number;
    count: number;
    rollingAvg?: number;
}

interface Props {
    data: DailyPoint[];
    height?: number;
    rollingWindow?: number;
}

const FONT = 'var(--font-mono)';

/** Compute N-day rolling average centered on each day */
export function addRollingAvg(data: DailyPoint[], window = 5): DailyPoint[] {
    return data.map((d, i) => {
        const slice = data.slice(Math.max(0, i - window + 1), i + 1);
        const avg = slice.reduce((s, x) => s + x.pnl, 0) / slice.length;
        return { ...d, rollingAvg: avg };
    });
}

export default function ComposedDailyChart({ data, height = 280, rollingWindow = 5 }: Props) {
    const enriched = addRollingAvg(data, rollingWindow);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={enriched} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: '#4b5563', fontFamily: FONT }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(d: string) => {
                        const dt = new Date(d + 'T12:00:00Z');
                        return dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                    }}
                />
                <YAxis
                    tick={{ fontSize: 9, fill: '#4b5563', fontFamily: FONT }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`}
                    width={44}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: FONT, fontSize: 11, borderRadius: 0 }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    labelFormatter={(l: unknown) => new Date(String(l) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    formatter={(v: number | undefined, name: string | undefined) => {
                        if (v === undefined) return ['—', name ?? ''];
                        if (name === 'rollingAvg') return [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, `${rollingWindow}d Avg`];
                        return [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, 'P&L'];
                    }}
                />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                    {enriched.map((d, i) => (
                        <Cell key={i} fill={d.pnl >= 0 ? 'rgba(166,255,77,0.85)' : 'rgba(255,71,87,0.85)'} />
                    ))}
                </Bar>
                <Line
                    type="monotone"
                    dataKey="rollingAvg"
                    stroke="#EAB308"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 2"
                    activeDot={{ r: 3, fill: '#EAB308' }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    );
}
