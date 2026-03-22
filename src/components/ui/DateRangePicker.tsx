'use client';

/**
 * DateRangePicker
 * ─────────────────────────────────────────────────────────────
 * Custom calendar date-range picker matching the app's terminal
 * dark aesthetic. Features:
 *  • Vertically-scrollable month list (Mon-first weeks)
 *  • Right sidebar for quick month/year navigation (desktop)
 *  • Range highlight with FDC800 accent
 *  • Dots on days that have trades
 *  • Hover preview of range
 *  • Mobile: full-screen overlay, no sidebar
 *  • Keyboard: Escape to close
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// ── Constants ──────────────────────────────────────────────────

const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DOW_EN   = ['M','T','W','T','F','S','S'];
const DOW_FR   = ['L','M','M','J','V','S','D'];

// ── Helpers ────────────────────────────────────────────────────

function isoDate(y: number, m: number, d: number): string {
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function daysInMonth(y: number, m: number): number {
    return new Date(y, m, 0).getDate();          // m is 1-based
}

/** Offset of 1st day of month in Mon=0..Sun=6 grid */
function firstDayOffset(y: number, m: number): number {
    const dow = new Date(y, m - 1, 1).getDay(); // 0=Sun
    return dow === 0 ? 6 : dow - 1;
}

function fmtDisplay(iso: string): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
    let nm = m + delta;
    let ny = y;
    while (nm > 12) { nm -= 12; ny++; }
    while (nm < 1)  { nm += 12; ny--; }
    return { y: ny, m: nm };
}

// ── Types ──────────────────────────────────────────────────────

export interface DateRangePickerProps {
    from: string;                   // YYYY-MM-DD or ''
    to: string;                     // YYYY-MM-DD or ''
    tradeDates?: Set<string>;       // dates that have trades (for dots)
    onApply: (from: string, to: string) => void;
    onClose: () => void;
    isMobile?: boolean;
    lang?: string;
    /** Earliest month to show — defaults to 12 months ago */
    earliestISO?: string;
}

// ── MonthGrid ──────────────────────────────────────────────────

interface MonthGridProps {
    y: number; m: number;
    from: string; to: string; hover: string;
    tradeDates: Set<string>;
    today: string;
    onDay: (iso: string) => void;
    onHover: (iso: string) => void;
    lang: string;
}

function MonthGrid({ y, m, from, to, hover, tradeDates, today, onDay, onHover, lang }: MonthGridProps) {
    const names = lang === 'fr' ? MONTH_FR : MONTH_EN;
    const dows  = lang === 'fr' ? DOW_FR   : DOW_EN;
    const offset = firstDayOffset(y, m);
    const days   = daysInMonth(y, m);

    // Effective "to" for range calc — uses hover if no to selected yet
    const rangeEnd = to || hover;

    const cells: Array<{ iso: string; d: number } | null> = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push({ iso: isoDate(y, m, d), d });

    return (
        <div style={{ marginBottom: 28 }}>
            {/* Month header */}
            <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800,
                color: '#fff', letterSpacing: '-0.01em', marginBottom: 12,
                display: 'flex', alignItems: 'baseline', gap: 8,
            }}>
                {names[m - 1]}
                <span style={{ fontSize: 11, fontWeight: 400, color: '#4b5563' }}>{y}</span>
            </div>

            {/* Day-of-week header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
                {dows.map((d, i) => (
                    <div key={i} style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                        color: '#4b5563', textAlign: 'center', padding: '2px 0',
                    }}>{d}</div>
                ))}
            </div>

            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                {cells.map((cell, i) => {
                    if (!cell) return <div key={`e${i}`} />;
                    const { iso, d } = cell;

                    const isFrom    = iso === from;
                    const isTo      = iso === to;
                    const isToday   = iso === today;
                    const hasTrade  = tradeDates.has(iso);

                    const rFrom = from && rangeEnd ? (from < rangeEnd ? from : rangeEnd) : from;
                    const rTo   = from && rangeEnd ? (from < rangeEnd ? rangeEnd : from) : '';
                    const inRange = rFrom && rTo && iso > rFrom && iso < rTo;
                    const isEdge  = isFrom || isTo;
                    const isFutureDisabled = iso > today;

                    return (
                        <div
                            key={iso}
                            onMouseEnter={() => !isFutureDisabled && onHover(iso)}
                            onMouseLeave={() => onHover('')}
                            onClick={() => !isFutureDisabled && onDay(iso)}
                            style={{
                                position: 'relative',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                height: 36, cursor: isFutureDisabled ? 'default' : 'pointer',
                                background: isEdge
                                    ? '#FDC800'
                                    : inRange
                                        ? 'rgba(253,200,0,0.13)'
                                        : 'transparent',
                                // Round only the outer edges of the range
                                borderRadius: isFrom && !isTo ? '2px 0 0 2px'
                                    : isTo && !isFrom ? '0 2px 2px 0'
                                    : isEdge ? '2px'
                                    : 0,
                                transition: 'background 0.08s',
                            }}
                        >
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 12,
                                fontWeight: isEdge || isToday ? 800 : 400,
                                color: isEdge ? '#000'
                                    : isFutureDisabled ? '#2a2c34'
                                    : inRange ? '#FDC800'
                                    : isToday ? '#FDC800'
                                    : '#c9d1d9',
                                lineHeight: 1,
                                userSelect: 'none',
                            }}>
                                {d}
                            </span>

                            {/* Trade dot */}
                            {hasTrade && !isEdge && (
                                <div style={{
                                    position: 'absolute', bottom: 3,
                                    width: 3, height: 3, borderRadius: '50%',
                                    background: inRange ? '#FDC800' : '#3d4451',
                                }} />
                            )}

                            {/* Today indicator ring */}
                            {isToday && !isEdge && (
                                <div style={{
                                    position: 'absolute', inset: 2,
                                    border: '1px solid rgba(253,200,0,0.35)',
                                    borderRadius: 1, pointerEvents: 'none',
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────

export default function DateRangePicker({
    from, to, tradeDates = new Set(), onApply, onClose,
    isMobile = false, lang = 'en', earliestISO,
}: DateRangePickerProps) {
    const [tempFrom, setTempFrom] = useState(from);
    const [tempTo,   setTempTo]   = useState(to);
    const [hover,    setHover]    = useState('');

    const today = new Date().toISOString().slice(0, 10);
    const calRef     = useRef<HTMLDivElement>(null);
    const monthRefs  = useRef<Record<string, HTMLDivElement | null>>({});
    const sideRef    = useRef<HTMLDivElement>(null);

    // Generate month list from earliest trade to today
    const months = useMemo(() => {
        const now  = new Date();
        const endY = now.getFullYear();
        const endM = now.getMonth() + 1;

        let startISO = earliestISO ?? isoDate(endY, endM - 11 < 1 ? endM - 11 + 12 : endM - 11, 1);
        if (!startISO || startISO > today) startISO = isoDate(endY, Math.max(1, endM - 11), 1);

        const [sy, sm] = startISO.split('-').map(Number);
        const result: Array<{ y: number; m: number; key: string }> = [];

        let y = sy, m = sm;
        while (y < endY || (y === endY && m <= endM)) {
            result.push({ y, m, key: isoDate(y, m, 1).slice(0, 7) });
            ({ y, m } = addMonths(y, m, 1));
        }
        return result;
    }, [earliestISO, today]);

    // ── Keyboard close ──
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [onClose]);

    // ── Auto-scroll to current month on open ──
    useEffect(() => {
        const key = today.slice(0, 7);
        const el = monthRefs.current[key];
        if (el && calRef.current) {
            calRef.current.scrollTop = el.offsetTop - 24;
        }
    }, [today]);

    // ── Day click logic ──
    const handleDay = useCallback((iso: string) => {
        if (!tempFrom || (tempFrom && tempTo)) {
            // Start fresh
            setTempFrom(iso);
            setTempTo('');
            setHover('');
        } else {
            // Second click: set to (swap if needed)
            if (iso >= tempFrom) {
                setTempTo(iso);
            } else {
                setTempTo(tempFrom);
                setTempFrom(iso);
            }
        }
    }, [tempFrom, tempTo]);

    // ── Scroll calendar to a specific month key ──
    const scrollToMonth = useCallback((key: string) => {
        const el = monthRefs.current[key];
        if (el && calRef.current) {
            calRef.current.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
        }
    }, []);

    // ── Sync sidebar active month with calendar scroll ──
    const [activeSideMonth, setActiveSideMonth] = useState(() => today.slice(0, 7));
    useEffect(() => {
        const cal = calRef.current;
        if (!cal) return;
        const onScroll = () => {
            const { scrollTop } = cal;
            let active = months[0]?.key ?? '';
            for (const { key } of months) {
                const el = monthRefs.current[key];
                if (el && el.offsetTop - 60 <= scrollTop) active = key;
            }
            setActiveSideMonth(active);
        };
        cal.addEventListener('scroll', onScroll, { passive: true });
        return () => cal.removeEventListener('scroll', onScroll);
    }, [months]);

    const NAMES = lang === 'fr' ? MONTH_FR : MONTH_EN;

    // ── Apply ──
    const handleApply = () => {
        onApply(tempFrom, tempTo);
        onClose();
    };

    // ── Sizing ──
    const W  = isMobile ? '100vw'  : 600;
    const H  = isMobile ? '100dvh' : 480;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    zIndex: 1200,
                    backdropFilter: 'blur(2px)',
                }}
            />

            {/* Panel */}
            <div
                style={{
                    position: 'fixed',
                    ...(isMobile
                        ? { inset: 0 }
                        : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                    ),
                    width: W, height: H,
                    background: '#0d1117',
                    border: '1px solid #1a1c24',
                    zIndex: 1201,
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderBottom: '1px solid #1a1c24', flexShrink: 0,
                }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#FDC800', letterSpacing: '0.08em' }}>
                        {lang === 'fr' ? 'SÉLECTIONNER UNE PÉRIODE' : 'SELECT DATE RANGE'}
                    </span>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {/* ── Instruction line ── */}
                {!tempFrom && (
                    <div style={{ padding: '8px 18px', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', borderBottom: '1px solid #1a1c24', flexShrink: 0 }}>
                        {lang === 'fr' ? '↓ Cliquez sur une date de début' : '↓ Click a start date'}
                    </div>
                )}
                {tempFrom && !tempTo && (
                    <div style={{ padding: '8px 18px', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#FDC800', background: 'rgba(253,200,0,0.04)', borderBottom: '1px solid rgba(253,200,0,0.12)', flexShrink: 0 }}>
                        {lang === 'fr' ? `Du ${fmtDisplay(tempFrom)} — cliquez sur une date de fin` : `From ${fmtDisplay(tempFrom)} — click an end date`}
                    </div>
                )}

                {/* ── Body: calendar + sidebar ── */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                    {/* Calendar scroll area */}
                    <div
                        ref={calRef}
                        style={{
                            flex: 1, overflowY: 'auto', padding: '20px 20px 0 20px',
                            scrollbarWidth: 'thin', scrollbarColor: '#2a2c34 transparent',
                        }}
                    >
                        {months.map(({ y, m, key }) => (
                            <div
                                key={key}
                                ref={el => { monthRefs.current[key] = el; }}
                            >
                                <MonthGrid
                                    y={y} m={m}
                                    from={tempFrom} to={tempTo} hover={hover}
                                    tradeDates={tradeDates}
                                    today={today}
                                    onDay={handleDay}
                                    onHover={setHover}
                                    lang={lang}
                                />
                            </div>
                        ))}
                        <div style={{ height: 20 }} />
                    </div>

                    {/* Month sidebar (desktop only) */}
                    {!isMobile && (
                        <div
                            ref={sideRef}
                            style={{
                                width: 140, borderLeft: '1px solid #1a1c24',
                                overflowY: 'auto', padding: '20px 0',
                                flexShrink: 0,
                                scrollbarWidth: 'thin', scrollbarColor: '#2a2c34 transparent',
                            }}
                        >
                            {months.map(({ y, m, key }) => {
                                const isActive  = key === activeSideMonth;
                                const isThisMonth = key === today.slice(0, 7);
                                const hasFrom   = tempFrom?.startsWith(key);
                                const hasTo     = tempTo?.startsWith(key);

                                return (
                                    <div
                                        key={key}
                                        onClick={() => scrollToMonth(key)}
                                        style={{
                                            padding: '7px 18px',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: isActive ? 'rgba(253,200,0,0.07)' : 'transparent',
                                            borderLeft: `2px solid ${isActive ? '#FDC800' : 'transparent'}`,
                                            transition: 'all 0.1s',
                                        }}
                                    >
                                        <span style={{
                                            fontFamily: 'var(--font-mono)', fontSize: 12,
                                            fontWeight: isThisMonth ? 800 : isActive ? 700 : 400,
                                            color: isThisMonth ? '#FDC800' : isActive ? '#fff' : '#6b7280',
                                            letterSpacing: '-0.01em',
                                        }}>
                                            {NAMES[m - 1]}
                                        </span>
                                        <div style={{ display: 'flex', gap: 3 }}>
                                            {hasFrom && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FDC800' }} />}
                                            {hasTo   && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FDC800', opacity: 0.5 }} />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Footer: From / To / Apply ── */}
                <div style={{
                    borderTop: '1px solid #1a1c24',
                    padding: isMobile ? '14px 16px' : '12px 18px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#090909', flexShrink: 0,
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                }}>
                    {/* From field */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>
                            {lang === 'fr' ? 'DU' : 'FROM'}
                        </span>
                        <div style={{
                            flex: 1, padding: '8px 12px',
                            background: tempFrom ? 'rgba(253,200,0,0.07)' : '#0d1117',
                            border: `1px solid ${tempFrom ? '#FDC80050' : '#1a1c24'}`,
                            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                            color: tempFrom ? '#FDC800' : '#3d4451',
                            letterSpacing: '0.03em', textAlign: 'center',
                        }}>
                            {fmtDisplay(tempFrom)}
                        </div>
                    </div>

                    <div style={{ width: 18, height: 1, background: '#1a1c24', flexShrink: 0 }} />

                    {/* To field */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>
                            {lang === 'fr' ? 'AU' : 'TO'}
                        </span>
                        <div style={{
                            flex: 1, padding: '8px 12px',
                            background: tempTo ? 'rgba(253,200,0,0.07)' : '#0d1117',
                            border: `1px solid ${tempTo ? '#FDC80050' : '#1a1c24'}`,
                            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                            color: tempTo ? '#FDC800' : '#3d4451',
                            letterSpacing: '0.03em', textAlign: 'center',
                        }}>
                            {fmtDisplay(tempTo)}
                        </div>
                    </div>

                    {/* Clear + Apply */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {(tempFrom || tempTo) && (
                            <button
                                onClick={() => { setTempFrom(''); setTempTo(''); setHover(''); }}
                                style={{
                                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                                    padding: isMobile ? '10px 14px' : '9px 14px',
                                    background: 'transparent', border: '1px solid #2a2c34',
                                    color: '#6b7280', cursor: 'pointer', letterSpacing: '0.05em',
                                }}
                            >
                                {lang === 'fr' ? 'EFFACER' : 'CLEAR'}
                            </button>
                        )}
                        <button
                            onClick={handleApply}
                            disabled={!tempFrom}
                            style={{
                                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800,
                                padding: isMobile ? '10px 20px' : '9px 20px',
                                background: tempFrom ? '#FDC800' : '#1a1c24',
                                border: 'none', color: tempFrom ? '#000' : '#3d4451',
                                cursor: tempFrom ? 'pointer' : 'default',
                                letterSpacing: '0.06em', transition: 'all 0.1s',
                            }}
                        >
                            {lang === 'fr' ? 'APPLIQUER' : 'APPLY'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
