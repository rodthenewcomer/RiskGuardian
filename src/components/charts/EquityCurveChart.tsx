'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';

interface Point { i: number; pnl: number; date?: string }

interface Props {
    data: Point[];
    height?: number;
    showGrid?: boolean;
    showAxis?: boolean;
    /** Gradient id must be unique per page instance */
    gradientId?: string;
}

const FONT = 'var(--font-mono)';

export default function EquityCurveChart({ data, height = 180, showGrid = true, showAxis = true, gradientId = 'eqGrad' }: Props) {
    if (data.length < 2) {
        return (
            <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 11, color: '#4b5563' }}>
                No trade data to plot
            </div>
        );
    }
    const lastPnl = data[data.length - 1]?.pnl ?? 0;
    const color = lastPnl >= 0 ? '#A6FF4D' : '#ff4757';

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                {showGrid && <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />}
                {showAxis && <XAxis dataKey="i" hide />}
                {showAxis && <YAxis tick={{ fontSize: 9, fill: '#4b5563', fontFamily: FONT }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`} width={44} />}
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                <Tooltip
                    contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: FONT, fontSize: 11, borderRadius: 0 }}
                    formatter={(v: number | undefined) => v !== undefined ? [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`, 'Cumulative P&L'] : ['—', 'Cumulative P&L']}
                    labelFormatter={(l: unknown) => `Trade #${l}`}
                />
                <Area type="monotone" dataKey="pnl" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, fill: color }} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
