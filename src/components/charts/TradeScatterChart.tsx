'use client';

/**
 * TradeScatterChart — Scatter plot of individual trades.
 * X axis: entry hour (0-23) or hold duration (minutes)
 * Y axis: P&L ($)
 * Dot size: proportional to abs(P&L), color: green/red
 * Best for: "is there a time or duration sweet spot?" — instantly visible clustering.
 */

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, ZAxis } from 'recharts';

export interface ScatterPoint {
    x: number;    // hour (0-23) or duration (minutes)
    y: number;    // P&L
    z: number;    // abs(P&L) for bubble size
    label?: string;
}

interface Props {
    data: ScatterPoint[];
    xLabel?: string;
    height?: number;
    xFormatter?: (v: number) => string;
}

const FONT = 'var(--font-mono)';

function defaultXFmt(v: number): string {
    if (v < 12) return `${v}:00`;
    if (v === 12) return '12:00';
    return `${v}:00`;
}

export default function TradeScatterChart({ data, xLabel = 'Hour', height = 220, xFormatter = defaultXFmt }: Props) {
    if (data.length === 0) {
        return (
            <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 11, color: '#8b949e' }}>
                No scatter data
            </div>
        );
    }

    const wins = data.filter(d => d.y >= 0);
    const losses = data.filter(d => d.y < 0);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: 0 }}>
                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" />
                <XAxis
                    type="number"
                    dataKey="x"
                    name={xLabel}
                    tick={{ fontSize: 9, fill: '#8b949e', fontFamily: FONT }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={xFormatter}
                    label={{ value: xLabel, position: 'insideBottom', offset: -8, fill: '#8b949e', fontSize: 9, fontFamily: FONT }}
                />
                <YAxis
                    type="number"
                    dataKey="y"
                    name="P&L"
                    tick={{ fontSize: 9, fill: '#8b949e', fontFamily: FONT }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`}
                    width={44}
                />
                <ZAxis type="number" dataKey="z" range={[20, 200]} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: FONT, fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                    cursor={{ strokeDasharray: '3 3', stroke: '#2d3748' }}
                    formatter={(v: number | string | undefined, name: string | undefined) => {
                        if (v === undefined) return ['—', name ?? ''];
                        if (name === 'P&L') return [`${Number(v) >= 0 ? '+' : ''}$${Math.abs(Number(v)).toFixed(2)}`, 'P&L'];
                        if (name === xLabel) return [xFormatter(Number(v)), xLabel];
                        return [`${v}`, name ?? ''];
                    }}
                />
                {/* Winning trades — green */}
                <Scatter
                    name="Win"
                    data={wins}
                    fill="rgba(253,200,0,0.7)"
                    stroke="rgba(253,200,0,0.3)"
                    strokeWidth={1}
                />
                {/* Losing trades — red */}
                <Scatter
                    name="Loss"
                    data={losses}
                    fill="rgba(255,71,87,0.7)"
                    stroke="rgba(255,71,87,0.3)"
                    strokeWidth={1}
                />
            </ScatterChart>
        </ResponsiveContainer>
    );
}
