'use client';

import React, { useState, useMemo } from 'react';

interface MonthlyCalendarHeatmapDatum {
    d: string;   // "YYYY-MM-DD"
    pnl: number;
}

interface MonthlyCalendarHeatmapProps {
    data: MonthlyCalendarHeatmapDatum[];
    height?: number;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CELL_SIZE = 28;
const CELL_GAP = 2;

function cellColor(pnl: number, maxAbsPnl: number): string {
    if (pnl === 0 || maxAbsPnl === 0) return '#1a1c24';
    if (pnl > 0) {
        // Yellow gradient: dim at low, bright at high
        const intensity = Math.min(1, pnl / maxAbsPnl);
        const alpha = 0.25 + intensity * 0.75;
        return `rgba(253, 200, 0, ${alpha.toFixed(2)})`;
    }
    // Red with varying opacity
    const intensity = Math.min(1, Math.abs(pnl) / maxAbsPnl);
    const alpha = 0.25 + intensity * 0.65;
    return `rgba(255, 71, 87, ${alpha.toFixed(2)})`;
}

export default function MonthlyCalendarHeatmap({ data, height = 240 }: MonthlyCalendarHeatmapProps) {
    const [hoveredDay, setHoveredDay] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed

    // Build a lookup map
    const pnlMap = useMemo(() => {
        const m: Record<string, number> = {};
        data.forEach((d) => { m[d.d] = d.pnl; });
        return m;
    }, [data]);

    // maxAbsPnl for color scaling
    const maxAbsPnl = useMemo(() => {
        const vals = data.map((d) => Math.abs(d.pnl));
        return vals.length > 0 ? Math.max(...vals) : 1;
    }, [data]);

    // Build grid: weeks × 7 days (Mon=0 … Sun=6)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
    // Shift so Mon=0: Sun(0)->6, Mon(1)->0, ...
    const firstOffset = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);

    const cells: Array<{ date: string | null; dayNum: number | null; pnl: number }> = [];

    // Padding before month start
    for (let i = 0; i < firstOffset; i++) {
        cells.push({ date: null, dayNum: null, pnl: 0 });
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({ date: dateStr, dayNum: d, pnl: pnlMap[dateStr] ?? 0 });
    }

    // Pad to full weeks
    while (cells.length % 7 !== 0) {
        cells.push({ date: null, dayNum: null, pnl: 0 });
    }

    const rows: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
        rows.push(cells.slice(i, i + 7));
    }

    const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const gridW = 7 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const headerH = 32;
    const rowH = CELL_SIZE + CELL_GAP;
    const svgH = headerH + rows.length * rowH;
    void height; // height prop reserved for future use; SVG is self-sizing

    const fmtPnl = (pnl: number) => {
        const sign = pnl >= 0 ? '+' : '-';
        return `${sign}$${Math.abs(pnl).toFixed(2)}`;
    };

    return (
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg
                width={gridW}
                height={svgH}
                style={{ display: 'block' }}
                onMouseLeave={() => setHoveredDay(null)}
            >
                {/* Month label */}
                <text
                    x={0}
                    y={14}
                    fill="#8b949e"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    letterSpacing="0.08em"
                    style={{ textTransform: 'uppercase' }}
                >
                    {monthName.toUpperCase()}
                </text>

                {/* Day-of-week headers */}
                {DAY_LABELS.map((dl, i) => (
                    <text
                        key={dl}
                        x={i * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2}
                        y={28}
                        fill="#4b5563"
                        fontSize={8}
                        fontFamily="var(--font-mono)"
                        textAnchor="middle"
                        letterSpacing="0.06em"
                    >
                        {dl.toUpperCase()}
                    </text>
                ))}

                {/* Day cells */}
                {rows.map((row, ri) =>
                    row.map((cell, ci) => {
                        if (!cell.date) return null;
                        const x = ci * (CELL_SIZE + CELL_GAP);
                        const y = headerH + ri * rowH;
                        const bg = cellColor(cell.pnl, maxAbsPnl);
                        const isHovered = hoveredDay === cell.date;
                        return (
                            <g
                                key={cell.date}
                                onMouseEnter={(e) => {
                                    setHoveredDay(cell.date);
                                    const svgEl = (e.currentTarget.closest('svg') as SVGSVGElement);
                                    const rect = svgEl?.getBoundingClientRect();
                                    const svgX = rect ? e.clientX - rect.left : e.clientX;
                                    const svgY = rect ? e.clientY - rect.top : e.clientY;
                                    setTooltipPos({ x: svgX, y: svgY });
                                }}
                                onMouseLeave={() => setHoveredDay(null)}
                                style={{ cursor: 'default' }}
                            >
                                <rect
                                    x={x}
                                    y={y}
                                    width={CELL_SIZE}
                                    height={CELL_SIZE}
                                    fill={bg}
                                    stroke={isHovered ? '#FDC800' : '#1a1c24'}
                                    strokeWidth={isHovered ? 1.5 : 0.5}
                                />
                                {/* Day number */}
                                <text
                                    x={x + 4}
                                    y={y + 11}
                                    fill={cell.pnl > 0 ? '#000' : cell.pnl < 0 ? '#fff' : '#6b7280'}
                                    fontSize={8}
                                    fontFamily="var(--font-mono)"
                                    fontWeight="600"
                                >
                                    {cell.dayNum}
                                </text>
                            </g>
                        );
                    })
                )}
            </svg>

            {/* Tooltip */}
            {hoveredDay && pnlMap[hoveredDay] !== undefined && (
                <div
                    style={{
                        position: 'absolute',
                        left: tooltipPos.x + 12,
                        top: tooltipPos.y - 36,
                        background: '#0d1117',
                        border: '1px solid #1a1c24',
                        padding: '5px 10px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        whiteSpace: 'nowrap',
                        boxShadow: '2px 2px 0 #000',
                        pointerEvents: 'none',
                        zIndex: 10, // tooltip above cells
                    }}
                >
                    <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 2 }}>{hoveredDay}</div>
                    <div
                        style={{
                            fontWeight: 700,
                            color: pnlMap[hoveredDay] >= 0 ? '#FDC800' : '#ff4757',
                        }}
                    >
                        {fmtPnl(pnlMap[hoveredDay])}
                    </div>
                </div>
            )}
        </div>
    );
}
