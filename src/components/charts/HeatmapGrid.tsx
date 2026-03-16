'use client';

/**
 * HeatmapGrid — Hour × Day-of-Week P&L intensity heatmap.
 * Each cell = avg P&L for that (hour, day) bucket. Color: green = profit, red = loss,
 * intensity = magnitude. Best chart for finding exact time × session patterns.
 */

interface Cell {
    hour: number;    // 0-23
    day: string;     // 'Mon'–'Sun'
    pnl: number;     // avg P&L for this bucket
    trades: number;  // number of trades
}

interface Props {
    data: Cell[];
    height?: number;
    /** Filter to only show hours with at least minTrades */
    minTrades?: number;
}

const FONT = 'var(--font-mono)';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtHour(h: number): string {
    if (h === 0) return '12a';
    if (h < 12) return `${h}a`;
    if (h === 12) return '12p';
    return `${h - 12}p`;
}

function interpolateColor(pnl: number, max: number): string {
    if (max === 0) return 'rgba(255,255,255,0.04)';
    const ratio = Math.min(Math.abs(pnl) / max, 1);
    const alpha = 0.15 + ratio * 0.75;
    if (pnl > 0) return `rgba(166,255,77,${alpha.toFixed(2)})`;
    if (pnl < 0) return `rgba(255,71,87,${alpha.toFixed(2)})`;
    return 'rgba(255,255,255,0.04)';
}

export default function HeatmapGrid({ data, height = 200, minTrades = 0 }: Props) {
    // Build lookup: day → hour → cell
    const lookup: Record<string, Record<number, Cell>> = {};
    for (const c of data) {
        if (c.trades >= minTrades) {
            if (!lookup[c.day]) lookup[c.day] = {};
            lookup[c.day][c.hour] = c;
        }
    }

    // Find max abs pnl for color scaling
    const allPnls = data.filter(c => c.trades >= minTrades).map(c => Math.abs(c.pnl));
    const maxAbs = allPnls.length ? Math.max(...allPnls) : 1;

    // Only render hours that have any data
    const activeHours = HOURS.filter(h => DAYS.some(d => lookup[d]?.[h]));

    if (activeHours.length === 0) {
        return (
            <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 11, color: '#8b949e' }}>
                No data
            </div>
        );
    }

    const cellW = Math.max(24, Math.floor(560 / activeHours.length));
    const cellH = 28;
    const labelW = 32;
    const headerH = 20;
    const totalW = labelW + activeHours.length * cellW;
    const totalH = headerH + DAYS.length * cellH;

    return (
        <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
            <svg width={totalW} height={Math.max(totalH, height)} style={{ fontFamily: FONT, display: 'block' }}>
                {/* Hour headers */}
                {activeHours.map((h, xi) => (
                    <text
                        key={h}
                        x={labelW + xi * cellW + cellW / 2}
                        y={headerH - 4}
                        textAnchor="middle"
                        fontSize={8}
                        fill="#8b949e"
                    >
                        {fmtHour(h)}
                    </text>
                ))}

                {/* Day rows */}
                {DAYS.map((day, yi) => (
                    <g key={day}>
                        {/* Day label */}
                        <text
                            x={labelW - 4}
                            y={headerH + yi * cellH + cellH / 2 + 4}
                            textAnchor="end"
                            fontSize={9}
                            fill="#c9d1d9"
                            fontWeight={600}
                        >
                            {day}
                        </text>

                        {/* Cells */}
                        {activeHours.map((h, xi) => {
                            const cell = lookup[day]?.[h];
                            const bg = cell ? interpolateColor(cell.pnl, maxAbs) : 'rgba(255,255,255,0.02)';
                            const hasData = !!cell && cell.trades > 0;
                            return (
                                <g key={h}>
                                    <rect
                                        x={labelW + xi * cellW + 1}
                                        y={headerH + yi * cellH + 1}
                                        width={cellW - 2}
                                        height={cellH - 2}
                                        fill={bg}
                                        rx={2}
                                    />
                                    {hasData && (
                                        <text
                                            x={labelW + xi * cellW + cellW / 2}
                                            y={headerH + yi * cellH + cellH / 2 + 3}
                                            textAnchor="middle"
                                            fontSize={7}
                                            fill={cell.pnl >= 0 ? '#A6FF4D' : '#ff4757'}
                                            fontWeight={700}
                                        >
                                            {cell.pnl >= 0 ? '+' : ''}{Math.abs(cell.pnl) >= 1000 ? `${(cell.pnl / 1000).toFixed(1)}k` : cell.pnl.toFixed(0)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                ))}
            </svg>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, paddingLeft: labelW, fontFamily: FONT, fontSize: 9, color: '#8b949e' }}>
                <span>Avg P&amp;L per cell</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, background: 'rgba(255,71,87,0.9)', borderRadius: 1 }} />
                    <span>Loss</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, background: 'rgba(166,255,77,0.9)', borderRadius: 1 }} />
                    <span>Profit</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 10, height: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid #2d3748', borderRadius: 1 }} />
                    <span>No trades</span>
                </div>
            </div>
        </div>
    );
}
