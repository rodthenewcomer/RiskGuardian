'use client';

import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, ReferenceLine
} from 'recharts';

interface TradeData {
    id: string;
    pnl: number;
    cumulative: number;
    asset: string;
}

export default function PnLChart({ data }: { data: TradeData[] }) {
    if (data.length === 0) return null;

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="pnlColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#FDC800" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#FDC800" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                        dataKey="id"
                        hide
                    />
                    <YAxis
                        tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const val = payload[0].value as number;
                                return (
                                    <div className="bg-[#1A1F2C] border border-white/10 p-2 rounded shadow-xl">
                                        <p className="text-[10px] text-muted uppercase font-bold tracking-wider">Equity Result</p>
                                        <p className={`text-[14px] font-extrabold ${val >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {val >= 0 ? '+' : ''}${val.toLocaleString()}
                                        </p>
                                        <p className="text-[9px] text-muted italic">{payload[0].payload.asset}</p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                    <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="#FDC800"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#pnlColor)"
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
