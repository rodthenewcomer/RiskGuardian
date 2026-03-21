'use client';

/**
 * DayOfWeekChart — horizontal bar chart showing P&L and win rate per weekday.
 * RadarChart alternative considered but horizontal bars are more readable for
 * exactly 5 categories with large numeric labels. Uses diverging bars (green/red)
 * centered on zero so negative days are instantly visible.
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Cell } from 'recharts';

export interface DayStats {
    day: string;   // 'Mon', 'Tue', etc.
    pnl: number;
    trades: number;
    wins: number;
    wr: number;    // 0-100
}

interface Props {
    data: DayStats[];
    height?: number;
    metric?: 'pnl' | 'wr';
}

const FONT = 'var(--font-mono)';
const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DayOfWeekChart({ data, height = 160, metric = 'pnl' }: Props) {
    const raw = DAYS_ORDER.map(d => data.find(x => x.day === d) ?? { day: d, pnl: 0, trades: 0, wins: 0, wr: 0 }).filter(d => d.trades > 0 || metric === 'pnl');
    // Strip non-metric numeric fields to prevent Recharts rendering ghost bars for extra keys
    const ordered = raw.map(d => ({ day: d.day, [metric]: metric === 'pnl' ? d.pnl : d.wr, _trades: d.trades, _wr: d.wr }));

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={ordered} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="25%">
                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                    type="number"
                    tick={{ fontSize: 9, fill: '#8b949e', fontFamily: FONT }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => metric === 'pnl' ? `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}` : `${v.toFixed(0)}%`}
                />
                <YAxis
                    type="category"
                    dataKey="day"
                    tick={{ fontSize: 10, fill: '#c9d1d9', fontFamily: FONT, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                />
                {metric === 'pnl' && <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />}
                {metric === 'wr' && <ReferenceLine x={50} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 2" label={{ value: '50%', fill: '#8b949e', fontSize: 9, fontFamily: FONT }} />}
                <Tooltip
                    contentStyle={{ backgroundColor: '#13151a', border: '1px solid #2d3748', fontFamily: FONT, fontSize: 11, borderRadius: 0, color: '#c9d1d9' }}
                    formatter={(v: number | undefined, _name: string | undefined, props: { payload?: { _trades?: number; _wr?: number } }) => {
                        if (v === undefined) return ['—', ''];
                        const d = props.payload;
                        if (metric === 'pnl') return [`${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)} · ${d?._trades ?? 0} trades · ${d?._wr?.toFixed(0) ?? 0}% WR`, 'P&L'];
                        return [`${v.toFixed(1)}% · ${d?._trades ?? 0} trades`, 'Win Rate'];
                    }}
                    labelFormatter={(l: unknown) => `${l}`}
                />
                <Bar dataKey={metric} radius={[0, 2, 2, 0]}>
                    {ordered.map((d, i) => {
                        const val = d[metric as keyof typeof d] as number;
                        const color = metric === 'pnl'
                            ? (val >= 0 ? 'rgba(253,200,0,0.85)' : 'rgba(255,71,87,0.85)')
                            : (val >= 60 ? '#FDC800' : val >= 50 ? 'rgba(253,200,0,0.6)' : val >= 40 ? '#EAB308' : '#ff4757');
                        return <Cell key={i} fill={color} />;
                    })}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
