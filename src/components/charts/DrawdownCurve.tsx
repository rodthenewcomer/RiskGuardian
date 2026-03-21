'use client';

import React from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';

interface DrawdownCurveDatum {
    d: string;  // label (date or trade index)
    v: number;  // drawdown as 0 or negative dollar amount
}

interface DrawdownCurveProps {
    data: DrawdownCurveDatum[];
    limitLine?: number;   // prop firm limit as a negative number e.g. -3000
    height?: number;
}

interface TooltipPayloadEntry {
    value: number;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;
    const v = payload[0].value;
    return (
        <div
            style={{
                background: '#0d1117',
                border: '1px solid #1a1c24',
                padding: '6px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#ff4757',
                boxShadow: '2px 2px 0 #000',
            }}
        >
            <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 2 }}>{label}</div>
            <div style={{ fontWeight: 700 }}>
                Drawdown: {v <= 0 ? `-$${Math.abs(v).toFixed(2)}` : '$0.00'}
            </div>
        </div>
    );
}

export default function DrawdownCurve({ data, limitLine, height = 180 }: DrawdownCurveProps) {
    if (!data || data.length === 0) {
        return (
            <div
                style={{
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: '#4b5563',
                }}
            >
                No drawdown data
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
                <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff4757" stopOpacity={0.20} />
                        <stop offset="95%" stopColor="#ff4757" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid stroke="#1a1c24" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" hide />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#1a1c24" strokeWidth={1} />
                {limitLine !== undefined && (
                    <ReferenceLine
                        y={limitLine}
                        stroke="#EAB308"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{
                            value: `Limit -$${Math.abs(limitLine).toLocaleString()}`,
                            position: 'insideTopRight',
                            fill: '#EAB308',
                            fontSize: 9,
                            fontFamily: 'var(--font-mono)',
                        }}
                    />
                )}
                <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#ff4757"
                    strokeWidth={1.5}
                    fill="url(#ddGrad)"
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
