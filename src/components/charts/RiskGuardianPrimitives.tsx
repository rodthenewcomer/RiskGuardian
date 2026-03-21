'use client';

import React from 'react';

// ─── ChartCard ────────────────────────────────────────────────────────────────

interface ChartCardProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
}

export function ChartCard({ title, subtitle, children, style }: ChartCardProps) {
    return (
        <div
            style={{
                background: '#0d1117',
                border: '2px solid #1a1c24',
                boxShadow: '4px 4px 0 #000',
                overflow: 'hidden',
                ...style,
            }}
        >
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #1a1c24',
                }}
            >
                <div
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        fontWeight: 800,
                        color: '#8b949e',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        lineHeight: 1,
                    }}
                >
                    {title}
                </div>
                {subtitle && (
                    <div
                        style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: '#4b5563',
                            marginTop: 4,
                            lineHeight: 1.4,
                        }}
                    >
                        {subtitle}
                    </div>
                )}
            </div>
            <div style={{ padding: '16px' }}>{children}</div>
        </div>
    );
}

// ─── SegmentedBar ─────────────────────────────────────────────────────────────

interface SegmentedBarProps {
    wins: number;
    losses: number;
    flat?: number;
    height?: number;
    showLabels?: boolean;
}

export function SegmentedBar({ wins, losses, flat = 0, height = 32, showLabels = true }: SegmentedBarProps) {
    const total = wins + losses + flat;
    if (total === 0) {
        return (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#4b5563' }}>
                No data
            </div>
        );
    }

    const winPct = (wins / total) * 100;
    const flatPct = (flat / total) * 100;
    const lossPct = (losses / total) * 100;

    return (
        <div>
            {/* Bar */}
            <div
                style={{
                    display: 'flex',
                    width: '100%',
                    height,
                    overflow: 'hidden',
                    background: '#1a1c24',
                }}
            >
                {wins > 0 && (
                    <div
                        style={{
                            width: `${winPct}%`,
                            height: '100%',
                            background: '#FDC800',
                            transition: 'width 0.6s ease',
                        }}
                    />
                )}
                {flat > 0 && (
                    <div
                        style={{
                            width: `${flatPct}%`,
                            height: '100%',
                            background: '#1a1c24',
                            borderLeft: wins > 0 ? '1px solid #090909' : undefined,
                            borderRight: losses > 0 ? '1px solid #090909' : undefined,
                            transition: 'width 0.6s ease',
                        }}
                    />
                )}
                {losses > 0 && (
                    <div
                        style={{
                            width: `${lossPct}%`,
                            height: '100%',
                            background: '#ff4757',
                            transition: 'width 0.6s ease',
                        }}
                    />
                )}
            </div>

            {/* Labels */}
            {showLabels && (
                <div
                    style={{
                        display: 'flex',
                        gap: 12,
                        marginTop: 10,
                        flexWrap: 'wrap',
                    }}
                >
                    {[
                        { label: 'WINS', count: wins, pct: winPct, color: '#FDC800' },
                        ...(flat > 0 ? [{ label: 'FLAT', count: flat, pct: flatPct, color: '#4b5563' }] : []),
                        { label: 'LOSSES', count: losses, pct: lossPct, color: '#ff4757' },
                    ].map((chip) => (
                        <div
                            key={chip.label}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                background: `${chip.color}14`,
                                border: `1px solid ${chip.color}40`,
                            }}
                        >
                            <div
                                style={{
                                    width: 6,
                                    height: 6,
                                    background: chip.color,
                                    flexShrink: 0,
                                }}
                            />
                            <span
                                style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: chip.color,
                                    letterSpacing: '0.06em',
                                }}
                            >
                                {chip.label}
                            </span>
                            <span
                                style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 10,
                                    color: '#8b949e',
                                }}
                            >
                                {chip.count} · {chip.pct.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── ThresholdBullet ──────────────────────────────────────────────────────────

interface ThresholdBand {
    max: number;
    label: string;
    color: string;
}

interface ThresholdBulletProps {
    label: string;
    value: number;
    format?: (v: number) => string;
    thresholds: ThresholdBand[];
    unit?: string;
}

export function ThresholdBullet({ label, value, format, thresholds, unit }: ThresholdBulletProps) {
    const fmt = format ?? ((v: number) => v.toFixed(2));

    // Find current band
    const currentBand = thresholds.find((t) => value <= t.max) ?? thresholds[thresholds.length - 1];

    // Compute tick position: map value onto 0–100% of the track
    // Use finite thresholds to determine range
    const finiteBands = thresholds.filter((t) => isFinite(t.max));
    const trackMax = finiteBands.length > 0 ? finiteBands[finiteBands.length - 1].max : value * 1.5;
    const trackMin = 0;
    const tickPct = Math.min(98, Math.max(2, ((value - trackMin) / (trackMax - trackMin)) * 100));

    // Segment widths
    let lastMax = trackMin;
    const segments = thresholds.map((band) => {
        const segMax = isFinite(band.max) ? band.max : trackMax;
        const w = Math.max(0, ((segMax - lastMax) / (trackMax - trackMin)) * 100);
        lastMax = segMax;
        return { ...band, w };
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: '#6b7280',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                    }}
                >
                    {label}
                </span>
                <span
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 18,
                        fontWeight: 800,
                        color: currentBand.color,
                        letterSpacing: '-0.02em',
                        lineHeight: 1,
                    }}
                >
                    {fmt(value)}{unit ?? ''}
                </span>
            </div>

            {/* Track with colored bands */}
            <div style={{ position: 'relative', height: 6, display: 'flex', overflow: 'hidden' }}>
                {segments.map((seg, i) => (
                    <div
                        key={i}
                        style={{
                            width: `${seg.w}%`,
                            height: '100%',
                            background: seg.color,
                            opacity: 0.35,
                        }}
                    />
                ))}
                {/* Tick diamond */}
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: `${tickPct}%`,
                        transform: 'translate(-50%, -50%) rotate(45deg)',
                        width: 8,
                        height: 8,
                        background: currentBand.color,
                        boxShadow: `0 0 6px ${currentBand.color}`,
                    }}
                />
            </div>

            {/* Band label */}
            <div
                style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    fontWeight: 700,
                    color: currentBand.color,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                }}
            >
                {currentBand.label}
            </div>
        </div>
    );
}

// ─── DivergingBarList ─────────────────────────────────────────────────────────

interface DivergingBarDatum {
    label: string;
    value: number;
    note?: string;
}

interface DivergingBarListProps {
    data: DivergingBarDatum[];
    maxAbs?: number;
    valueFormat?: (v: number) => string;
    height?: number;
}

export function DivergingBarList({ data, maxAbs, valueFormat }: DivergingBarListProps) {
    const fmtVal = valueFormat ?? ((v: number) => `$${v >= 0 ? '+' : ''}${v.toFixed(0)}`);

    const computedMax = maxAbs ?? (data.length > 0 ? Math.max(...data.map((d) => Math.abs(d.value))) : 1);
    const safeMax = computedMax === 0 ? 1 : computedMax;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.map((item, i) => {
                const isPositive = item.value >= 0;
                const barPct = (Math.abs(item.value) / safeMax) * 50; // 50% = half track
                const color = isPositive ? '#FDC800' : '#ff4757';

                return (
                    <div
                        key={i}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '120px 1fr 80px',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 0',
                        }}
                    >
                        {/* Label */}
                        <div style={{ overflow: 'hidden' }}>
                            <div
                                style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#c9d1d9',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {item.label}
                            </div>
                            {item.note && (
                                <div
                                    style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 9,
                                        color: '#4b5563',
                                    }}
                                >
                                    {item.note}
                                </div>
                            )}
                        </div>

                        {/* Diverging track */}
                        <div
                            style={{
                                position: 'relative',
                                height: 12,
                                background: '#0b0e14',
                                border: '1px solid #1a1c24',
                            }}
                        >
                            {/* Center line */}
                            <div
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: 0,
                                    bottom: 0,
                                    width: 1,
                                    background: '#1a1c24',
                                }}
                            />
                            {/* Bar */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 1,
                                    bottom: 1,
                                    left: isPositive ? '50%' : `${50 - barPct}%`,
                                    width: `${barPct}%`,
                                    background: color,
                                    opacity: 0.85,
                                }}
                            />
                        </div>

                        {/* Value */}
                        <div
                            style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                fontWeight: 700,
                                color,
                                textAlign: 'right',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {fmtVal(item.value)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── RankedBarList ────────────────────────────────────────────────────────────

interface RankedBarListProps {
    data: Array<{ label: string; value: number; note?: string }>;
    maxValue?: number;
    valueFormat?: (v: number) => string;
    barColor?: string;
}

export function RankedBarList({ data, maxValue, valueFormat, barColor = '#FDC800' }: RankedBarListProps) {
    const fmtVal = valueFormat ?? ((v: number) => v.toFixed(2));
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const computedMax = maxValue ?? (sorted.length > 0 ? sorted[0].value : 1);
    const safeMax = computedMax === 0 ? 1 : computedMax;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((item, i) => {
                const barPct = Math.max(2, (Math.abs(item.value) / Math.abs(safeMax)) * 100);
                return (
                    <div
                        key={i}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '20px 120px 1fr 70px',
                            alignItems: 'center',
                            gap: 8,
                            padding: '3px 0',
                        }}
                    >
                        {/* Rank */}
                        <div
                            style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 9,
                                color: '#4b5563',
                                textAlign: 'right',
                            }}
                        >
                            {i + 1}
                        </div>

                        {/* Label */}
                        <div style={{ overflow: 'hidden' }}>
                            <div
                                style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#c9d1d9',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {item.label}
                            </div>
                            {item.note && (
                                <div
                                    style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 9,
                                        color: '#4b5563',
                                    }}
                                >
                                    {item.note}
                                </div>
                            )}
                        </div>

                        {/* Bar */}
                        <div
                            style={{
                                height: 8,
                                background: '#0b0e14',
                                border: '1px solid #1a1c24',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${barPct}%`,
                                    height: '100%',
                                    background: barColor,
                                    opacity: 0.85,
                                    transition: 'width 0.5s ease',
                                }}
                            />
                        </div>

                        {/* Value */}
                        <div
                            style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                fontWeight: 700,
                                color: barColor,
                                textAlign: 'right',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {fmtVal(item.value)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

