'use client';

/**
 * HeatmapGrid — Hour × Day-of-Week P&L intensity heatmap.
 * CSS div-based (not SVG) so it fills 100% width and is fully responsive.
 * Each cell = avg P&L for that (hour, day) bucket.
 * Color: green = profit, red = loss, intensity = magnitude.
 */

interface CellData {
    hour: number;    // 0-23
    day: string;     // 'Mon'–'Sun'
    pnl: number;     // avg P&L
    trades: number;
}

interface Props {
    data: CellData[];
    height?: number;
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

function cellBg(pnl: number, maxAbs: number): string {
    if (maxAbs === 0) return 'rgba(255,255,255,0.03)';
    const ratio = Math.min(Math.abs(pnl) / maxAbs, 1);
    const alpha = 0.18 + ratio * 0.72;
    if (pnl > 0) return `rgba(253,200,0,${alpha.toFixed(2)})`;
    if (pnl < 0) return `rgba(255,71,87,${alpha.toFixed(2)})`;
    return 'rgba(255,255,255,0.03)';
}

function fmtPnl(v: number): string {
    const abs = Math.abs(v);
    const fmt = abs >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
    return `${v >= 0 ? '+' : ''}${fmt}`;
}

export default function HeatmapGrid({ data, minTrades = 0 }: Props) {
    const lookup: Record<string, Record<number, CellData>> = {};
    for (const c of data) {
        if (c.trades >= minTrades) {
            if (!lookup[c.day]) lookup[c.day] = {};
            lookup[c.day][c.hour] = c;
        }
    }

    const allPnls = data.filter(c => c.trades >= minTrades).map(c => Math.abs(c.pnl));
    const maxAbs = allPnls.length ? Math.max(...allPnls) : 1;
    const activeHours = HOURS.filter(h => DAYS.some(d => lookup[d]?.[h]));

    if (activeHours.length === 0) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', fontFamily: FONT, fontSize: 11, color: '#8b949e' }}>
                No data to display — log trades across multiple days and hours.
            </div>
        );
    }

    return (
        <div style={{ width: '100%', fontFamily: FONT }}>
            {/* Grid container: day-label column + one column per active hour */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: `40px repeat(${activeHours.length}, 1fr)`,
                gap: 2,
                width: '100%',
            }}>
                {/* Header row: blank corner + hour labels */}
                <div /> {/* corner */}
                {activeHours.map(h => (
                    <div key={h} style={{ textAlign: 'center', fontSize: 9, color: '#8b949e', fontWeight: 600, paddingBottom: 4 }}>
                        {fmtHour(h)}
                    </div>
                ))}

                {/* Data rows */}
                {DAYS.map(day => (
                    <>
                        {/* Day label */}
                        <div key={`lbl-${day}`} style={{ display: 'flex', alignItems: 'center', fontSize: 10, fontWeight: 700, color: '#c9d1d9', paddingRight: 6 }}>
                            {day}
                        </div>
                        {/* Cells */}
                        {activeHours.map(h => {
                            const cell = lookup[day]?.[h];
                            const hasData = !!cell && cell.trades > 0;
                            const bg = hasData ? cellBg(cell.pnl, maxAbs) : 'rgba(255,255,255,0.025)';
                            const textColor = hasData ? (cell.pnl >= 0 ? '#e8ffd8' : '#ffd8db') : '#2d3748';
                            return (
                                <div
                                    key={`${day}-${h}`}
                                    title={hasData ? `${day} ${fmtHour(h)}: avg ${fmtPnl(cell.pnl)} over ${cell.trades} trade${cell.trades !== 1 ? 's' : ''}` : `${day} ${fmtHour(h)}: no trades`}
                                    style={{
                                        background: bg,
                                        border: '1px solid rgba(255,255,255,0.04)',
                                        height: 38,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: hasData ? 'default' : 'default',
                                        transition: 'opacity 0.1s',
                                    }}
                                    onMouseEnter={e => { if (hasData) (e.currentTarget as HTMLDivElement).style.opacity = '0.8'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
                                >
                                    {hasData && (
                                        <>
                                            <div style={{ fontSize: 9, fontWeight: 700, color: textColor, lineHeight: 1.2 }}>
                                                {fmtPnl(cell.pnl)}
                                            </div>
                                            <div style={{ fontSize: 7, color: `${textColor}99`, lineHeight: 1 }}>
                                                {cell.trades}T
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </>
                ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontFamily: FONT, fontSize: 9 }}>
                <span style={{ color: '#8b949e' }}>Avg P&amp;L · trade count per cell</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 12, height: 12, background: 'rgba(255,71,87,0.85)' }} />
                    <span style={{ color: '#ff4757' }}>Loss</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 12, height: 12, background: 'rgba(253,200,0,0.85)' }} />
                    <span style={{ color: '#FDC800' }}>Profit</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={{ width: 12, height: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid #2d3748' }} />
                    <span style={{ color: '#00D4FF' }}>No trades</span>
                </div>
            </div>
        </div>
    );
}
