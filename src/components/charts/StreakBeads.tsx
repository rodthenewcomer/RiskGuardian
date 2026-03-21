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

const BEAD_D = 10;   // diameter px
const BEAD_GAP = 3;  // gap px

export default function StreakBeads({ data, height = 44, maxBeads = 40 }: StreakBeadsProps) {
    const [tooltip, setTooltip] = useState<{ idx: number; x: number; y: number } | null>(null);

    // Show last maxBeads, oldest on left
    const beads = data.slice(-maxBeads);
    const total = beads.length;

    if (total === 0) {
        return (
            <div
                style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: '#4b5563',
                    height,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                No trades
            </div>
        );
    }

    const svgW = total * (BEAD_D + BEAD_GAP) - BEAD_GAP;
    const cy = height / 2;

    const colorMap: Record<string, { fill: string; stroke: string }> = {
        win:  { fill: '#FDC800', stroke: '#FDC800' },
        loss: { fill: '#ff4757', stroke: '#ff4757' },
        open: { fill: '#0d1117', stroke: '#6b7280' },
    };

    const fmtPnl = (pnl: number) => {
        const sign = pnl >= 0 ? '+' : '-';
        return `${sign}$${Math.abs(pnl).toFixed(2)}`;
    };

    return (
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg
                width={svgW}
                height={height}
                style={{ display: 'block' }}
                onMouseLeave={() => setTooltip(null)}
            >
                {beads.map((bead, i) => {
                    const cx = i * (BEAD_D + BEAD_GAP) + BEAD_D / 2;
                    const { fill, stroke } = colorMap[bead.result];
                    return (
                        <circle
                            key={i}
                            cx={cx}
                            cy={cy}
                            r={BEAD_D / 2}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={1}
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => {
                                const rect = (e.currentTarget.closest('svg') as SVGSVGElement)
                                    ?.getBoundingClientRect();
                                setTooltip({ idx: i, x: cx, y: cy });
                                void rect; // suppress lint; tooltip positioned in SVG coords
                            }}
                            onMouseLeave={() => setTooltip(null)}
                        />
                    );
                })}
            </svg>

            {/* Tooltip */}
            {tooltip !== null && (
                <div
                    style={{
                        position: 'absolute',
                        left: tooltip.x + BEAD_D,
                        top: tooltip.y - 28,
                        background: '#0d1117',
                        border: '1px solid #1a1c24',
                        padding: '4px 8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        fontWeight: 700,
                        color:
                            beads[tooltip.idx].result === 'win'
                                ? '#FDC800'
                                : beads[tooltip.idx].result === 'loss'
                                ? '#ff4757'
                                : '#6b7280',
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        zIndex: 10, // tooltip above beads
                        boxShadow: '2px 2px 0 #000',
                    }}
                >
                    {beads[tooltip.idx].result.toUpperCase()} · {fmtPnl(beads[tooltip.idx].pnl)}
                </div>
            )}
        </div>
    );
}
