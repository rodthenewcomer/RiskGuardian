'use client';

import React, { useState } from 'react';

interface StreakBeadsDatum {
    result: 'win' | 'loss' | 'open';
    pnl: number;
}

interface StreakBeadsProps {
    data: StreakBeadsDatum[];
    height?: number;
    maxBeads?: number;
}

const BEAD_D = 18;  // diameter px — large enough for W/L label
const BEAD_GAP = 4;

export default function StreakBeads({ data, height = 44, maxBeads = 40 }: StreakBeadsProps) {
    const [tooltip, setTooltip] = useState<{ idx: number } | null>(null);

    const beads = data.slice(-maxBeads);
    const total = beads.length;

    if (total === 0) {
        return (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', height, display: 'flex', alignItems: 'center' }}>
                No trades
            </div>
        );
    }

    const svgW = total * (BEAD_D + BEAD_GAP) - BEAD_GAP;
    const cy = height / 2;
    const r = BEAD_D / 2;

    const fmtPnl = (pnl: number) => `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;

    const colorMap: Record<string, { fill: string; textColor: string; stroke: string }> = {
        win:  { fill: '#FDC800', textColor: '#000',     stroke: '#b89200' },
        loss: { fill: '#ff4757', textColor: '#fff',     stroke: '#b03040' },
        open: { fill: '#0d1117', textColor: '#6b7280',  stroke: '#1a1c24' },
    };

    return (
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg
                viewBox={`0 0 ${svgW} ${height}`}
                width="100%"
                height={height}
                style={{ display: 'block' }}
                onMouseLeave={() => setTooltip(null)}
            >
                {beads.map((bead, i) => {
                    const cx = i * (BEAD_D + BEAD_GAP) + r;
                    const { fill, textColor, stroke } = colorMap[bead.result];
                    const label = bead.result === 'win' ? 'W' : bead.result === 'loss' ? 'L' : '·';
                    const isHovered = tooltip?.idx === i;

                    return (
                        <g
                            key={i}
                            style={{ cursor: 'default' }}
                            onMouseEnter={() => setTooltip({ idx: i })}
                            onMouseLeave={() => setTooltip(null)}
                        >
                            <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill={fill}
                                stroke={isHovered ? '#fff' : stroke}
                                strokeWidth={isHovered ? 1.5 : 1}
                            />
                            <text
                                x={cx}
                                y={cy + 1}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={textColor}
                                fontSize={8}
                                fontFamily="var(--font-mono)"
                                fontWeight="800"
                                letterSpacing="0"
                                style={{ userSelect: 'none', pointerEvents: 'none' }}
                            >
                                {label}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Tooltip */}
            {tooltip !== null && (() => {
                const bead = beads[tooltip.idx];
                const cx = tooltip.idx * (BEAD_D + BEAD_GAP) + r;
                // Convert SVG x to percentage for responsive positioning
                const leftPct = (cx / svgW) * 100;
                return (
                    <div
                        style={{
                            position: 'absolute',
                            left: `${leftPct}%`,
                            top: cy - r - 36,
                            transform: 'translateX(-50%)',
                            background: '#0d1117',
                            border: '1px solid #1a1c24',
                            padding: '4px 8px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            fontWeight: 700,
                            color: bead.result === 'win' ? '#FDC800' : bead.result === 'loss' ? '#ff4757' : '#6b7280',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                            zIndex: 10,
                            boxShadow: '2px 2px 0 #000',
                        }}
                    >
                        {bead.result.toUpperCase()} · {fmtPnl(bead.pnl)}
                    </div>
                );
            })()}
        </div>
    );
}
