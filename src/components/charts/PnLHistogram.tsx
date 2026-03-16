'use client';

/**
 * PnLHistogram — frequency distribution of trade P&L values.
 * Better than a list: shows where P&L clusters, reveals fat tails and outliers,
 * and visually separates win distribution from loss distribution.
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Cell } from 'recharts';

interface Props {
    pnlValues: number[];
    buckets?: number;
    height?: number;
}

const FONT = 'var(--font-mono)';

function buildHistogram(values: number[], buckets: number) {
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return [{ label: `$${min.toFixed(0)}`, from: min, to: max, count: values.length, pnl: min }];
    const step = (max - min) / buckets;
    return Array.from({ length: buckets }, (_, i) => {
        const from = min + i * step;
        const to = from + step;
        const count = values.filter(v => i === buckets - 1 ? v >= from && v <= to : v >= from && v < to).length;
        const midpoint = (from + to) / 2;
        return {
            label: `$${midpoint >= 0 ? '' : ''}${midpoint.toFixed(0)}`,
            from,
            to,
            count,
            pnl: midpoint,
        };
    });
}

export default function PnLHistogram({ pnlValues, buckets = 20, height = 160 }: Props) {
    const data = buildHistogram(pnlValues, buckets);
    const maxCount = Math.max(...data.map(d => d.count), 1);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="5%">
                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                <XAxis
                    dataKey="label"
                    tick={{ fontSize: 8, fill: '#4b5563', fontFamily: FONT }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.floor(buckets / 6)}
                />
                <YAxis
                    tick={{ fontSize: 8, fill: '#4b5563', fontFamily: FONT }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                />
                <ReferenceLine x="$0" stroke="rgba(255,255,255,0.15)" />
                <Tooltip
                    contentStyle={{ backgroundColor: '#0b0e14', border: '1px solid #1a1c24', fontFamily: FONT, fontSize: 10, borderRadius: 0 }}
                    formatter={(v: number | undefined) => v !== undefined ? [`${v} trades`, 'Frequency'] : ['—', 'Frequency']}
                    labelFormatter={(l: unknown) => `Around ${l}`}
                />
                <Bar dataKey="count" radius={[1, 1, 0, 0]}>
                    {data.map((d, i) => (
                        <Cell key={i} fill={d.pnl >= 0 ? `rgba(166,255,77,${0.4 + (d.count / maxCount) * 0.5})` : `rgba(255,71,87,${0.4 + (d.count / maxCount) * 0.5})`} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
