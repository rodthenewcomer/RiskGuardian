'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { motion, AnimatePresence } from 'framer-motion';
import {
    useAppStore, getFuturesSpec, calcPositionSize, getESTFull,
    TRADEIFY_CRYPTO_LIST,
} from '@/store/appStore';
import { useTranslation } from '@/i18n/useTranslation';
import {
    TrendingUp, TrendingDown, AlertTriangle, Terminal,
    BookmarkPlus, Check, RotateCcw, Zap,
} from 'lucide-react';
import {
    analyzeRiskGuardian, analyzeBehavior,
    generateDailyReport, calcProfitTarget,
} from '@/ai/RiskAI';

// ── Asset type detection ──────────────────────────────────────────────
function detectType(sym: string): 'crypto' | 'futures' | 'forex' | 'stocks' {
    if (!sym) return 'crypto';
    const s = sym.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (getFuturesSpec(s)) return 'futures';
    if (s.includes('/')) return 'forex';
    if (TRADEIFY_CRYPTO_LIST.includes(s)) return 'crypto';
    return 'crypto';
}

function fmtPrice(n: number): string {
    if (!n || n === 0) return '—';
    if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 100) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toFixed(6);
}

function fmtSize(n: number, unit: string): string {
    if (unit === 'contracts') return `${Math.floor(n)}`;
    if (n >= 1) return n.toFixed(3);
    return n.toFixed(4);
}

// ── Asset chip catalogue ──────────────────────────────────────────────
const CHIPS = [
    // Crypto majors
    { sym: 'BTC',     cat: 'crypto'  },
    { sym: 'ETH',     cat: 'crypto'  },
    { sym: 'SOL',     cat: 'crypto'  },
    { sym: 'XRP',     cat: 'crypto'  },
    { sym: 'DOGE',    cat: 'crypto'  },
    { sym: 'PEPE',    cat: 'crypto'  },
    { sym: 'WIF',     cat: 'crypto'  },
    { sym: 'SUI',     cat: 'crypto'  },
    { sym: 'AVAX',    cat: 'crypto'  },
    { sym: 'LINK',    cat: 'crypto'  },
    // Futures
    { sym: 'MNQ',     cat: 'futures' },
    { sym: 'NQ',      cat: 'futures' },
    { sym: 'MES',     cat: 'futures' },
    { sym: 'ES',      cat: 'futures' },
    { sym: 'MYM',     cat: 'futures' },
    { sym: 'YM',      cat: 'futures' },
    { sym: 'CL',      cat: 'futures' },
    { sym: 'GC',      cat: 'futures' },
    { sym: 'MGC',     cat: 'futures' },
    { sym: 'RTY',     cat: 'futures' },
    // Forex
    { sym: 'EUR/USD', cat: 'forex'   },
    { sym: 'GBP/USD', cat: 'forex'   },
    { sym: 'USD/JPY', cat: 'forex'   },
];

const CAT_COLOR: Record<string, string> = {
    crypto:  '#FDC800',
    futures: '#EAB308',
    forex:   '#60a5fa',
    stocks:  '#c084fc',
};

// ── Style constants ───────────────────────────────────────────────────
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
const D = '1px solid #1a1c24';
const cardBase: React.CSSProperties = {
    background: '#0c0e13', borderRadius: 12, border: D, overflow: 'hidden',
};

// ── NLP log entry ─────────────────────────────────────────────────────
interface NLPLog { id: string; cmd: string; out: string; ok: boolean; }

// ─────────────────────────────────────────────────────────────────────
export default function CommandPage() {
    const {
        account, getDailyRiskRemaining,
        addTrade, addDailyRisk,
        setActiveTab, trades,
        updateAccount, resetTodaySession,
    } = useAppStore();
    const { t } = useTranslation();
    const { language } = useAppStore();
    const lang = language ?? 'en';
    const isMobile = useIsMobile();

    // ── Form state ──────────────────────────────────────────────────
    const [asset,   setAsset]   = useState('BTC');
    const [isShort, setIsShort] = useState(false);
    const [entry,   setEntry]   = useState('');
    const [stop,    setStop]    = useState('');
    const [tp,      setTp]      = useState('');
    const [riskStr, setRiskStr] = useState('');
    const [sizeStr, setSizeStr] = useState('');
    const [inputMode, setInputMode] = useState<'risk' | 'size'>('risk');
    const [logged,  setLogged]  = useState(false);

    // ── NLP bar ─────────────────────────────────────────────────────
    const [nlpInput,    setNlpInput]    = useState('');
    const [nlpLogs,     setNlpLogs]     = useState<NLPLog[]>([]);
    const [nlpHist,     setNlpHist]     = useState<string[]>([]);
    const [nlpHistIdx,  setNlpHistIdx]  = useState(-1);
    const [nlpExpanded, setNlpExpanded] = useState(false);

    const nlpRef    = useRef<HTMLInputElement>(null);
    const nlpEndRef = useRef<HTMLDivElement>(null);
    const entryRef  = useRef<HTMLInputElement>(null);

    // ── Derived account values ──────────────────────────────────────
    const remaining    = useMemo(() => getDailyRiskRemaining(), [getDailyRiskRemaining]);
    const maxTradeRisk = useMemo(() => (account.balance * account.maxRiskPercent) / 100, [account]);
    const safeRisk     = Math.max(0, Math.min(maxTradeRisk, remaining));

    const todayCount = useMemo(() => {
        const d = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return trades.filter(t =>
            new Date(t.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === d
        ).length;
    }, [trades]);

    // ── Parsed numbers ──────────────────────────────────────────────
    const entryN = parseFloat(entry.replace(/,/g, '')) || 0;
    const stopN  = parseFloat(stop.replace(/,/g, ''))  || 0;
    const tpN    = parseFloat(tp.replace(/,/g, ''))    || 0;
    const riskN  = parseFloat(riskStr) || safeRisk || maxTradeRisk;

    // ── Asset meta ──────────────────────────────────────────────────
    const aType = useMemo(() => detectType(asset), [asset]);
    const spec  = useMemo(() => getFuturesSpec(asset.toUpperCase()), [asset]);
    const pv    = spec?.pointValue ?? 1;

    // ── Live calculation ────────────────────────────────────────────
    const result = useMemo(() => {
        if (!entryN || !stopN || entryN === stopN || !asset.trim()) return null;
        if (!isShort && stopN >= entryN) return null;  // long: stop must be below
        if (isShort  && stopN <= entryN) return null;  // short: stop must be above

        const stopDist = Math.abs(entryN - stopN);
        const stopPct  = (stopDist / entryN) * 100;

        let effectiveRisk = riskN;
        const cSize = parseFloat(sizeStr);
        if (inputMode === 'size' && !isNaN(cSize) && cSize > 0) {
            if (aType === 'futures') {
                effectiveRisk = cSize * stopDist * (spec ? spec.pointValue : 1);
            } else if (aType === 'forex') {
                effectiveRisk = cSize * 100000 * stopDist;
            } else {
                effectiveRisk = cSize * stopDist;
            }
        }

        const res = calcPositionSize({
            balance: account.balance,
            entry: entryN,
            stopLoss: stopN,
            riskAmt: effectiveRisk,
            assetType: aType,
            symbol: asset.toUpperCase(),
            isShort,
            includeFees: true,
        });
        if (res.size === 0) return null;

        // TP: provided or auto 2R
        const autoTp  = isShort ? entryN - stopDist * 2 : entryN + stopDist * 2;
        const finalTp = tpN > 0 ? tpN : autoTp;
        const tpDist  = Math.abs(finalTp - entryN);
        const rr      = stopDist > 0 ? tpDist / stopDist : 2;
        const reward  = effectiveRisk * rr; // Explicitly map reward!

        // Tradeify leverage rules
        const isBtcEth  = ['BTC', 'ETH', 'PAXG'].includes(asset.toUpperCase());
        const isInstant = account.propFirmType === 'Instant Funding';
        const isTrdfy   = account.propFirm?.toLowerCase().includes('tradeify') ?? false;
        const levMax    = isTrdfy
            ? (isInstant ? 2 : isBtcEth ? 5 : 2)
            : (account.leverage ?? 100);
        const levUsed   = account.startingBalance > 0 ? res.notional / account.startingBalance : 0;

        const overLev   = levUsed > levMax + 0.01;
        const overDaily = effectiveRisk   > remaining + 0.01;
        const lowRR     = rr < 1.5 && tpN === 0; // only warn on auto TP

        // Tradeify microscalping reminder
        const isMicro = isTrdfy && aType === 'crypto';

        const warnings: string[] = [
            overLev   ? `Leverage ${levUsed.toFixed(1)}x  >  ${levMax}x max allowed` : '',
            overDaily ? `Risk $${effectiveRisk.toFixed(0)}  >  daily remaining $${remaining.toFixed(0)}` : '',
            lowRR     ? `Low R:R ${rr.toFixed(2)} — minimum 1.5R recommended` : '',
        ].filter(Boolean);

        return {
            size: res.size, unit: res.unit,
            notional: res.notional,
            riskAmt: effectiveRisk, reward,
            rr, comm: res.comm,
            tp: finalTp, tpAuto: tpN === 0,
            stopPct, levUsed, levMax,
            overLev, overDaily, lowRR, isMicro,
            warnings,
            bad: overLev || overDaily,
        };
    }, [entryN, stopN, tpN, riskN, sizeStr, inputMode, asset, isShort, aType, spec, account, remaining]);

    // ── Guard ribbon state ──────────────────────────────────────────
    const dailyUsedPct = account.dailyLossLimit > 0
        ? Math.min(100, ((account.dailyLossLimit - remaining) / account.dailyLossLimit) * 100)
        : 0;
    const guardDanger  = dailyUsedPct >= 90;
    const guardWarn    = dailyUsedPct >= 60;
    const guardColor   = guardDanger ? '#ff4757' : guardWarn ? '#EAB308' : '#FDC800';

    // ── Log trade ───────────────────────────────────────────────────
    const handleLog = () => {
        if (!result || logged) return;
        addTrade({
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36),
            asset: asset.toUpperCase(),
            assetType: aType,
            entry: entryN,
            stopLoss: stopN,
            takeProfit: result.tp,
            lotSize: result.size,
            riskUSD: result.riskAmt,
            rewardUSD: result.reward,
            rr: result.rr,
            outcome: 'open',
            isShort,
            createdAt: getESTFull(),
            pnl: 0,
        });
        addDailyRisk(result.riskAmt);
        setLogged(true);
        setTimeout(() => {
            setLogged(false);
            setEntry(''); setStop(''); setTp(''); setSizeStr('');
        }, 1800);
    };

    // ── Chip tap ────────────────────────────────────────────────────
    const handleChip = (sym: string) => {
        setAsset(sym);
        setTimeout(() => entryRef.current?.focus(), 50);
    };

    // ── NLP scroll ─────────────────────────────────────────────────
    useEffect(() => {
        nlpEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [nlpLogs]);

    // ── NLP command processor ────────────────────────────────────────
    const pushNlp = (cmd: string, out: string, ok = true) =>
        setNlpLogs(p => [...p.slice(-14), { id: Date.now().toString(36), cmd, out, ok }]);

    const processNLP = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        const lower = trimmed.toLowerCase();
        const parts = trimmed.split(/\s+/);
        const meta  = parts[0].toLowerCase();
        setNlpHist(h => [trimmed, ...h].slice(0, 50));
        setNlpHistIdx(-1);
        setNlpInput('');

        // ── Meta commands ──────────────────────────────────────────
        if (meta === 'clear')  { setNlpLogs([]); return; }
        if (meta === 'reset')  { resetTodaySession(); pushNlp(trimmed, 'Session reset ✓'); return; }
        if (meta === 'help')   {
            pushNlp(trimmed,
                'TRADE: [buy/sell] ASSET ENTRY stop STOP [target TP] [risk $] [size N]\n' +
                'e.g.  btc 95000 stop93500 risk500\n' +
                'e.g.  sell mnq 21000 stop21020\n' +
                'e.g.  sol 185 stop180 target200 risk300\n' +
                'CMDS: stats · balance N · daily N · reset · clear'
            );
            return;
        }
        if (meta === 'stats') {
            const cl = trades.filter(t => t.outcome !== 'open');
            const w  = cl.filter(t => t.outcome === 'win').length;
            const pnl = cl.reduce((s, t) => s + (t.pnl ?? 0), 0);
            const wr  = cl.length > 0 ? ((w / cl.length) * 100).toFixed(0) : '0';
            pushNlp(trimmed,
                `${cl.length} trades · ${w}W ${cl.length - w}L · WR ${wr}% · P&L ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(0)}`
            );
            return;
        }
        if (meta === 'balance' && parts[1]) {
            const v = parseFloat(parts[1]);
            if (!isNaN(v)) { updateAccount({ balance: v }); pushNlp(trimmed, `Balance → $${v.toLocaleString()}`); return; }
        }
        if (meta === 'daily' && parts[1]) {
            const v = parseFloat(parts[1]);
            if (!isNaN(v)) { updateAccount({ dailyLossLimit: v }); pushNlp(trimmed, `Daily limit → $${v.toLocaleString()}`); return; }
        }
        if (['dashboard', 'journal', 'analytics', 'settings', 'plan'].includes(meta)) {
            setActiveTab(meta as 'dashboard');
            return;
        }

        // ── Trade NLP parser ─────────────────────────────────────────
        let pa = '', pe = 0, ps = 0, pr = 0, pz = 0, pt = 0, pShort = isShort;

        parts.forEach((p, i) => {
            const n  = parseFloat(p);
            const lo = p.toLowerCase();
            if (lo === 'buy'  || lo === 'long')  pShort = false;
            if (lo === 'sell' || lo === 'short') pShort = true;
            if (isNaN(n) && !['buy','sell','long','short'].includes(lo) && lo.length <= 12 && !pa) pa = p.toUpperCase();
            if (!isNaN(n) && pe === 0 && i > 0 && !parts[i-1].toLowerCase().match(/stop|risk|size|target/)) pe = n;
            if (lo.startsWith('stop'))   { const v = parseFloat(lo.slice(4));   if (!isNaN(v)) ps = v; }
            else if (i > 0 && parts[i-1].toLowerCase() === 'stop')   ps = n;
            if (lo.startsWith('risk'))   { const v = parseFloat(lo.slice(4));   if (!isNaN(v)) pr = v; }
            else if (i > 0 && parts[i-1].toLowerCase() === 'risk')   pr = n;
            if (lo.startsWith('size'))   { const v = parseFloat(lo.slice(4));   if (!isNaN(v)) pz = v; }
            else if (i > 0 && parts[i-1].toLowerCase() === 'size')   pz = n;
            if (lo.startsWith('target')) { const v = parseFloat(lo.slice(6));   if (!isNaN(v)) pt = v; }
            else if (i > 0 && parts[i-1].toLowerCase() === 'target') pt = n;
        });

        if (!pa && !pe) { pushNlp(trimmed, 'Could not parse. Type help for syntax.', false); return; }
        if (!pa) pa = asset.toUpperCase();
        if (!pr) pr = safeRisk || maxTradeRisk;

        const at = detectType(pa);
        const sp = getFuturesSpec(pa);
        let sz = pz, slPrice = ps, tpPrice = pt;

        if (pe && ps && !pz) {
            const r = calcPositionSize({
                balance: account.balance, entry: pe, stopLoss: ps,
                riskAmt: pr, assetType: at, symbol: pa, isShort: pShort, includeFees: true,
            });
            sz = r.size;
            const dist = Math.abs(pe - ps);
            tpPrice = pt > 0 ? pt : (pShort ? pe - dist * 2 : pe + dist * 2);
        } else if (pe && pz && !ps) {
            pushNlp(trimmed, 'Provide stop price to compute risk.', false);
            return;
        }

        if (!sz) { pushNlp(trimmed, 'Need entry + stop. Try: btc 95000 stop93500', false); return; }

        const dist  = ps ? Math.abs(pe - ps) : 0;
        const rrOut = dist > 0 && tpPrice ? Math.abs(tpPrice - pe) / dist : 2;
        const notional = sz * pe * (sp?.pointValue ?? 1);
        const comm     = notional * 0.004 * 2; // 0.4% per leg × 2 round-trip

        // Fill form
        setAsset(pa); setIsShort(pShort);
        setEntry(pe.toString()); setStop(ps.toString());
        if (pt > 0) setTp(pt.toString());
        setInputMode(pz > 0 && !pr ? 'size' : 'risk');
        if (pz > 0) setSizeStr(pz.toString());
        setRiskStr(pr.toString());

        pushNlp(trimmed,
            `${pa} ${pShort ? 'SHORT' : 'LONG'} · ${fmtSize(sz, sp ? 'contracts' : 'units')} ${sp ? 'contracts' : pa} · ` +
            `Risk $${pr.toFixed(0)} · R:R ${rrOut.toFixed(2)} · Fee $${comm.toFixed(2)}`
        );
    };

    const handleNlpKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { processNLP(nlpInput); }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const i = Math.min(nlpHistIdx + 1, nlpHist.length - 1);
            setNlpHistIdx(i); setNlpInput(nlpHist[i] ?? '');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const i = nlpHistIdx - 1;
            setNlpHistIdx(i); setNlpInput(i < 0 ? '' : nlpHist[i]);
        }
    };

    // ── Label style ─────────────────────────────────────────────────
    const lbl: React.CSSProperties = {
        ...mono, fontSize: 9, color: '#4b5563',
        letterSpacing: '0.12em', textTransform: 'uppercase' as const,
        display: 'block', marginBottom: 4,
    };
    const inp: React.CSSProperties = {
        ...mono, width: '100%', background: 'transparent', border: 'none',
        fontSize: 17, fontWeight: 700, color: '#e2e8f0', outline: 'none',
        boxSizing: 'border-box' as const, padding: 0,
    };

    // ════════════════════════════════════════════════════════════════
    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh', paddingBottom: isMobile && result ? 148 : 80 }}>

            {/* ── 1. HEADER BAR ────────────────────────────────────── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderBottom: D, gap: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...mono, fontSize: 11, color: '#FDC800', fontWeight: 900, letterSpacing: '0.12em' }}>_ {lang === 'fr' ? 'MOTEUR DE RISQUE' : 'RISK ENGINE'}</span>
                    {aType !== 'crypto' && (
                        <span style={{ ...mono, fontSize: 9, color: CAT_COLOR[aType] ?? '#4b5563', padding: '2px 6px', border: `1px solid ${CAT_COLOR[aType]}30`, borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {aType}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {todayCount > 0 && (
                        <span style={{ ...mono, fontSize: 10, color: '#4b5563', padding: '2px 7px', border: D, borderRadius: 4 }}>
                            {todayCount} logged
                        </span>
                    )}
                    <motion.span
                        animate={guardDanger ? { opacity: [1, 0.5, 1] } : {}}
                        transition={{ duration: 0.9, repeat: Infinity }}
                        style={{
                            ...mono, fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 4,
                            color: guardColor,
                            border: `1px solid ${guardColor}50`,
                            background: `${guardColor}0a`,
                        }}
                    >
                        GUARD ${remaining.toFixed(0)}
                    </motion.span>
                </div>
            </div>

            {/* ── 2. ASSET CHIP RAIL ────────────────────────────────── */}
            <div style={{
                display: 'flex', gap: 5, padding: '10px 16px', borderBottom: D,
                overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none', msOverflowStyle: 'none',
            } as React.CSSProperties}>
                {CHIPS.map(({ sym, cat }) => {
                    const active = asset.toUpperCase() === sym.toUpperCase();
                    const color  = CAT_COLOR[cat] ?? '#FDC800';
                    return (
                        <motion.button
                            key={sym}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => handleChip(sym)}
                            style={{
                                flexShrink: 0,
                                ...mono, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                                padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
                                border: active ? `1.5px solid ${color}` : D,
                                background: active ? `${color}18` : '#0c0e13',
                                color: active ? color : '#4b5563',
                                transition: 'all 0.12s ease',
                            }}
                        >
                            {sym}
                        </motion.button>
                    );
                })}
            </div>

            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* ── 3. DIRECTION TOGGLE ──────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    {[false, true].map(short => {
                        const active = isShort === short;
                        const color  = short ? '#ff4757' : '#FDC800';
                        const label  = short ? (lang === 'fr' ? 'SHORT' : 'SHORT') : (lang === 'fr' ? 'LONG' : 'LONG');
                        return (
                            <motion.button
                                key={label}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => setIsShort(short)}
                                style={{
                                    ...mono, fontSize: 13, fontWeight: 900, letterSpacing: '0.12em',
                                    padding: '14px 0', borderRadius: 10, cursor: 'pointer',
                                    border: active ? `1.5px solid ${color}` : D,
                                    background: active ? `${color}14` : '#0c0e13',
                                    color: active ? color : '#4b5563',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'all 0.13s ease',
                                }}
                            >
                                {short
                                    ? <TrendingDown size={15} color={active ? '#ff4757' : '#4b5563'} />
                                    : <TrendingUp   size={15} color={active ? '#FDC800' : '#4b5563'} />
                                }
                                {label}
                            </motion.button>
                        );
                    })}
                </div>

                {/* ── 4. INPUT CARD ────────────────────────────────── */}
                <div style={cardBase}>
                    {/* Asset */}
                    <div style={{ padding: '12px 14px', borderBottom: D }}>
                        <label style={lbl}>{lang === 'fr' ? 'Actif' : 'Asset'}</label>
                        <input
                            style={{ ...inp, fontSize: 16, color: '#fff', textTransform: 'uppercase' }}
                            placeholder="BTC · SOL · MNQ · ES · EUR/USD…"
                            value={asset}
                            onChange={e => setAsset(e.target.value.toUpperCase())}
                        />
                        <span style={{ ...mono, fontSize: 10, color: CAT_COLOR[aType] ?? '#4b5563', marginTop: 3, display: 'block' }}>
                            {aType.toUpperCase()}
                            {spec ? ` · $${spec.pointValue}/pt · ${spec.label}` : ''}
                        </span>
                    </div>

                    {/* Entry */}
                    <div style={{ padding: '12px 14px', borderBottom: D }}>
                        <label style={lbl}>{lang === 'fr' ? 'Prix d\'entrée' : 'Entry Price'}</label>
                        <input
                            ref={entryRef}
                            style={inp}
                            type="number"
                            placeholder="0.00"
                            inputMode="decimal"
                            value={entry}
                            onChange={e => setEntry(e.target.value)}
                        />
                    </div>

                    {/* Stop Loss */}
                    <div style={{ padding: '12px 14px', borderBottom: D }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ ...lbl, marginBottom: 0 }}>{lang === 'fr' ? 'Stop Loss' : 'Stop Loss'}</span>
                            {entryN > 0 && stopN > 0 && Math.abs(entryN - stopN) > 0 && (
                                <span style={{ ...mono, fontSize: 11, color: '#ff4757', fontWeight: 800 }}>
                                    {((Math.abs(entryN - stopN) / entryN) * 100).toFixed(2)}% away
                                </span>
                            )}
                        </div>
                        <input
                            style={inp}
                            type="number"
                            placeholder={isShort ? 'above entry' : 'below entry'}
                            inputMode="decimal"
                            value={stop}
                            onChange={e => setStop(e.target.value)}
                        />
                    </div>

                    {/* Take Profit */}
                    <div style={{ padding: '12px 14px', borderBottom: D }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ ...lbl, marginBottom: 0 }}>{lang === 'fr' ? 'Take Profit' : 'Take Profit'}</span>
                            <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>optional · 2R auto-set</span>
                        </div>
                        <input
                            style={inp}
                            type="number"
                            placeholder={result ? fmtPrice(result.tp) + ' (auto 2R)' : '0.00'}
                            inputMode="decimal"
                            value={tp}
                            onChange={e => setTp(e.target.value)}
                        />
                    </div>

                    {/* Risk $ / Size Component */}
                    <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ ...lbl, marginBottom: 0 }}>
                                {inputMode === 'risk' ? (lang === 'fr' ? 'Montant à risquer ($)' : 'Risk Amount ($)') : (lang === 'fr' ? 'Taille (Contrats/Lots)' : 'Size (Contracts/Lots)')}
                            </span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <button
                                    onClick={() => setInputMode(m => m === 'risk' ? 'size' : 'risk')}
                                    style={{ ...mono, fontSize: 9, color: '#FDC800', background: 'transparent', border: '1px solid currentColor', cursor: 'pointer', padding: '2px 5px', borderRadius: 4, letterSpacing: '0.04em' }}
                                >
                                    Toggle Mode
                                </button>
                                {inputMode === 'risk' && (
                                    <button
                                        onClick={() => setRiskStr(safeRisk.toFixed(0))}
                                        style={{ ...mono, fontSize: 10, color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    >
                                        use ${safeRisk.toFixed(0)} safe
                                    </button>
                                )}
                            </div>
                        </div>
                        {inputMode === 'risk' ? (
                            <input
                                style={inp}
                                type="number"
                                placeholder={safeRisk.toFixed(0)}
                                inputMode="decimal"
                                value={riskStr}
                                onChange={e => setRiskStr(e.target.value)}
                            />
                        ) : (
                            <input
                                style={inp}
                                type="number"
                                placeholder="1.0"
                                inputMode="decimal"
                                value={sizeStr}
                                onChange={e => setSizeStr(e.target.value)}
                            />
                        )}
                    </div>
                </div>

                {/* ── 5. LIVE RESULT CARD ──────────────────────────── */}
                <AnimatePresence mode="wait">
                    {result ? (
                        <motion.div
                            key="result"
                            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
                            style={{ ...cardBase, border: result.bad ? '1px solid rgba(255,71,87,0.35)' : result.warnings.length > 0 ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(253,200,0,0.2)' }}
                        >
                            {/* Numbers strip */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', padding: '14px 14px 10px' }}>
                                {[
                                    {
                                        lbl: lang === 'fr' ? 'TAILLE DE POSITION' : 'POSITION SIZE',
                                        val: fmtSize(result.size, result.unit),
                                        sub: result.unit,
                                        clr: '#fff',
                                    },
                                    {
                                        lbl: lang === 'fr' ? 'NOTIONNEL' : 'NOTIONAL',
                                        val: result.notional >= 1000
                                            ? `$${(result.notional / 1000).toFixed(1)}K`
                                            : `$${result.notional.toFixed(0)}`,
                                        sub: `fee $${result.comm.toFixed(2)}`,
                                        clr: '#e2e8f0',
                                    },
                                    {
                                        lbl: inputMode === 'size' ? (lang === 'fr' ? 'MONTANT À RISQUER' : 'RISK AMOUNT') : (lang === 'fr' ? 'RISQUE/RÉCOMPENSE' : 'R:R RATIO'),
                                        val: inputMode === 'size' ? `-$${result.riskAmt.toFixed(0)}` : `${result.rr.toFixed(2)}R`,
                                        sub: `+$${result.reward.toFixed(0)}`,
                                        clr: inputMode === 'size' ? '#ff4757' : (result.rr >= 2 ? '#FDC800' : result.rr >= 1.5 ? '#EAB308' : '#ff4757'),
                                    },
                                ].map((s, i) => (
                                    <div key={i} style={{
                                        paddingRight: i < 2 ? 10 : 0,
                                        paddingLeft:  i > 0 ? 10 : 0,
                                        borderRight:  i < 2 ? D  : 'none',
                                    }}>
                                        <span style={{ ...lbl, marginBottom: 4 }}>{s.lbl}</span>
                                        <span style={{ ...mono, fontSize: 20, fontWeight: 900, color: s.clr, lineHeight: 1, display: 'block', letterSpacing: '-0.02em' }}>{s.val}</span>
                                        <span style={{ ...mono, fontSize: 10, color: '#4b5563', display: 'block', marginTop: 3 }}>{s.sub}</span>
                                    </div>
                                ))}
                            </div>

                            {/* TP row */}
                            <div style={{ padding: '8px 14px', borderTop: D, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ ...mono, fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                    {result.tpAuto ? '2R AUTO TP' : 'TARGET'}
                                </span>
                                <span style={{ ...mono, fontSize: 13, fontWeight: 800, color: isShort ? '#ff4757' : '#FDC800' }}>
                                    {fmtPrice(result.tp)}
                                </span>
                            </div>

                            {/* Leverage + stop % row */}
                            <div style={{ padding: '7px 14px', borderTop: D, display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ ...mono, fontSize: 10, color: result.overLev ? '#ff4757' : '#4b5563' }}>
                                    Leverage {result.levUsed.toFixed(2)}x / {result.levMax}x
                                </span>
                                <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                                    SL {result.stopPct.toFixed(2)}% from entry
                                </span>
                            </div>

                            {/* Micro-scalp reminder (Tradeify crypto) */}
                            {result.isMicro && (
                                <div style={{ padding: '7px 14px', borderTop: D, display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(234,179,8,0.04)' }}>
                                    <Zap size={11} color="#EAB308" />
                                    <span style={{ ...mono, fontSize: 10, color: '#EAB308' }}>Hold ≥ 20 seconds — Tradeify microscalping rule</span>
                                </div>
                            )}

                            {/* Warnings */}
                            {result.warnings.map((w, i) => (
                                <div key={i} style={{
                                    padding: '8px 14px', borderTop: D,
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    background: w.includes('Leverage') || w.includes('daily') ? 'rgba(255,71,87,0.05)' : 'rgba(234,179,8,0.04)',
                                }}>
                                    <AlertTriangle size={11} color={w.includes('Leverage') || w.includes('daily') ? '#ff4757' : '#EAB308'} />
                                    <span style={{ ...mono, fontSize: 11, color: w.includes('Leverage') || w.includes('daily') ? '#ff4757' : '#EAB308' }}>{w}</span>
                                </div>
                            ))}
                        </motion.div>
                    ) : (
                        entryN > 0 && stopN > 0 && (
                            <motion.div
                                key="hint"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                style={{ ...mono, fontSize: 11, color: '#4b5563', textAlign: 'center', padding: '14px 0' }}
                            >
                                {!isShort && stopN >= entryN ? 'Long position: stop must be BELOW entry' :
                                  isShort && stopN <= entryN ? 'Short position: stop must be ABOVE entry' : ''}
                            </motion.div>
                        )
                    )}
                </AnimatePresence>

                {/* ── 6. LOG TRADE CTA ─────────────────────────────── */}
                <AnimatePresence>
                    {result && (
                        <motion.div
                            key="cta"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
                        >
                            <motion.button
                                onClick={handleLog}
                                whileTap={{ scale: 0.97 }}
                                disabled={logged}
                                style={{
                                    width: '100%',
                                    ...mono, fontSize: 13, fontWeight: 900, letterSpacing: '0.1em',
                                    padding: '16px 0', borderRadius: 11, cursor: logged ? 'default' : 'pointer',
                                    border: 'none',
                                    background: logged
                                        ? '#0d1a06'
                                        : result.bad
                                            ? '#1a0f0f'
                                            : '#FDC800',
                                    color: logged
                                        ? '#FDC800'
                                        : result.bad
                                            ? '#ff4757'
                                            : '#000',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                                    transition: 'all 0.18s ease',
                                }}
                            >
                                {logged
                                    ? <><Check size={15} /> {lang === 'fr' ? 'TRADE ENREGISTRÉ' : 'TRADE LOGGED'}</>
                                    : result.bad
                                        ? <><AlertTriangle size={15} /> {lang === 'fr' ? 'ENREGISTRER QUAND MÊME (RISQUÉ)' : 'LOG ANYWAY (RISKY)'}</>
                                        : <><BookmarkPlus size={15} /> {lang === 'fr' ? 'ENREGISTRER LE TRADE' : 'LOG TRADE'}</>
                                }
                            </motion.button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── 7. QUICK RESET ───────────────────────────────── */}
                {(entry || stop || tp || riskStr) && (
                    <button
                        onClick={() => { setEntry(''); setStop(''); setTp(''); setRiskStr(''); }}
                        style={{
                            ...mono, fontSize: 10, color: '#4b5563', background: 'none', border: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 0', letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}
                    >
                        <RotateCcw size={10} /> {lang === 'fr' ? 'Effacer les champs' : 'Clear fields'}
                    </button>
                )}

                {/* ── 8. EMPTY STATE ───────────────────────────────── */}
                {!entry && !stop && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}
                    >
                        <span style={{ ...mono, fontSize: 10, color: '#4b5563', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{lang === 'fr' ? 'Exemples rapides' : 'Quick examples'}</span>
                        {[
                            { label: 'BTC Long',    cmd: 'btc 95000 stop93500' },
                            { label: 'MNQ Short',   cmd: 'sell mnq 21000 stop21030 risk250' },
                            { label: 'SOL scalp',   cmd: 'sol 185 stop182 target192' },
                            { label: 'EUR/USD',     cmd: 'buy eur/usd 1.0900 stop1.0850' },
                        ].map(ex => (
                            <button
                                key={ex.cmd}
                                onClick={() => processNLP(ex.cmd)}
                                style={{
                                    ...mono, fontSize: 11, color: '#4b5563', background: '#0c0e13',
                                    border: D, borderRadius: 7, padding: '8px 12px', cursor: 'pointer',
                                    textAlign: 'left', letterSpacing: '0.04em',
                                    display: 'flex', justifyContent: 'space-between',
                                }}
                            >
                                <span style={{ color: '#8b949e' }}>{ex.label}</span>
                                <span style={{ color: '#4b5563' }}>{ex.cmd}</span>
                            </button>
                        ))}
                    </motion.div>
                )}

                {/* ── 9. TERMINAL COMMAND BAR ──────────────────────── */}
                <div style={{ borderRadius: 12, border: '1px solid #1a2a14', overflow: 'hidden', background: '#04070a' }}>

                    {/* Terminal header strip */}
                    <div
                        onClick={() => isMobile && setNlpExpanded(e => !e)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                            borderBottom: '1px solid #0e1a10',
                            background: 'linear-gradient(90deg, #070d07 0%, #04070a 100%)',
                            cursor: isMobile ? 'pointer' : 'default',
                        }}>
                        <Terminal size={11} color="#FDC800" />
                        <span style={{ ...mono, fontSize: 9, color: '#FDC800', letterSpacing: '0.18em', fontWeight: 900, textTransform: 'uppercase' }}>
                            NLP COMMAND
                        </span>
                        <span style={{ ...mono, fontSize: 9, color: '#2a4a1e', marginLeft: 4 }}>
                            btc 95000 stop93500 risk500 · sell mnq 21000 stop21030 · help
                        </span>
                        {/* Terminal traffic lights / mobile expand chevron */}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                            {isMobile ? (
                                <span style={{ ...mono, fontSize: 9, color: '#FDC800', letterSpacing: '0.08em' }}>
                                    {nlpExpanded ? '▲ HIDE' : '▼ OPEN'}
                                </span>
                            ) : (
                                ['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
                                    <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.6 }} />
                                ))
                            )}
                        </div>
                    </div>

                    {/* On mobile: hide body unless expanded */}
                    {(!isMobile || nlpExpanded) && (<>

                    {/* Log output area */}
                    <AnimatePresence>
                        {nlpLogs.length > 0 && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                style={{ maxHeight: 200, overflowY: 'auto', background: '#030508' }}
                            >
                                {nlpLogs.map((l, idx) => (
                                    <motion.div
                                        key={l.id}
                                        initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.28, delay: idx === nlpLogs.length - 1 ? 0 : 0 }}
                                        style={{
                                            padding: '8px 14px',
                                            borderBottom: '1px solid #0a0f08',
                                            borderLeft: `3px solid ${l.ok ? '#FDC800' : '#ff4757'}`,
                                            background: idx % 2 === 0 ? 'transparent' : 'rgba(253,200,0,0.01)',
                                        }}
                                    >
                                        <div style={{ ...mono, fontSize: 11, color: '#2e5220', marginBottom: 3 }}>
                                            <span style={{ color: '#FDC800' }}>&gt;</span> {l.cmd}
                                        </div>
                                        <div style={{
                                            ...mono, fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                                            color: l.ok ? '#7dba5a' : '#ff6b6b',
                                            textShadow: l.ok ? '0 0 8px rgba(253,200,0,0.15)' : '0 0 8px rgba(255,71,87,0.15)',
                                        }}>
                                            {l.out}
                                        </div>
                                    </motion.div>
                                ))}
                                <div ref={nlpEndRef} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Input row */}
                    <div style={{
                        display: 'flex', alignItems: 'center', padding: '0 14px',
                        background: '#030508',
                        borderTop: nlpLogs.length > 0 ? '1px solid #0e1a10' : 'none',
                    }}>
                        {/* Blinking cursor prompt */}
                        <motion.span
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ duration: 1, repeat: Infinity, repeatType: 'loop', ease: [0,0,1,1] }}
                            style={{ ...mono, fontSize: 15, color: '#FDC800', fontWeight: 900, marginRight: 10, userSelect: 'none' }}
                        >
                            &gt;
                        </motion.span>
                        <input
                            ref={nlpRef}
                            style={{
                                flex: 1,
                                ...mono, fontSize: 14, fontWeight: 600,
                                color: '#FDC800',
                                textShadow: '0 0 12px rgba(253,200,0,0.4)',
                                background: 'transparent', border: 'none', outline: 'none',
                                padding: '14px 0',
                                caretColor: '#FDC800',
                            }}
                            placeholder={lang === 'fr' ? 'Tapez : NQ 21450 21400 500 ou remplissez manuellement' : 'Type: NQ 21450 21400 500 or fill manually below'}
                            value={nlpInput}
                            onChange={e => setNlpInput(e.target.value)}
                            onKeyDown={handleNlpKey}
                            spellCheck={false}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                        />
                        <motion.button
                            whileTap={{ scale: 0.92 }}
                            onClick={() => processNLP(nlpInput)}
                            style={{
                                ...mono, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
                                color: '#FDC800', background: 'rgba(253,200,0,0.08)',
                                border: '1px solid rgba(253,200,0,0.2)', borderRadius: 5,
                                cursor: 'pointer', padding: '5px 10px',
                                textShadow: '0 0 8px rgba(253,200,0,0.3)',
                            }}
                        >
                            RUN
                        </motion.button>
                    </div>

                    </>)}
                </div>

            </div>

            {/* ── STICKY LOG TRADE BAR (mobile only) ───────────── */}
            <AnimatePresence>
                {isMobile && result && (
                    <motion.div
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
                        style={{
                            position: 'fixed',
                            bottom: 72, /* z-index 50: above content, below bottom nav (z-100) */
                            left: 0, right: 0,
                            padding: '10px 16px',
                            background: 'rgba(9,9,9,0.97)',
                            borderTop: '1px solid #1a1c24',
                            backdropFilter: 'blur(12px)',
                            zIndex: 50,
                        }}
                    >
                        {/* Mini result summary strip */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            {[
                                { lbl: 'SIZE', val: fmtSize(result.size, result.unit), clr: '#fff' },
                                { lbl: 'RISK', val: `-$${result.riskAmt.toFixed(0)}`, clr: '#ff4757' },
                                { lbl: 'R:R', val: `${result.rr.toFixed(2)}R`, clr: result.rr >= 2 ? '#FDC800' : result.rr >= 1.5 ? '#EAB308' : '#ff4757' },
                                { lbl: 'REWARD', val: `+$${result.reward.toFixed(0)}`, clr: '#FDC800' },
                            ].map((s, i) => (
                                <div key={i} style={{ textAlign: 'center' }}>
                                    <span style={{ ...mono, fontSize: 8, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block' }}>{s.lbl}</span>
                                    <span style={{ ...mono, fontSize: 14, fontWeight: 800, color: s.clr }}>{s.val}</span>
                                </div>
                            ))}
                        </div>
                        <motion.button
                            onClick={handleLog}
                            whileTap={{ scale: 0.97 }}
                            disabled={logged}
                            style={{
                                width: '100%',
                                ...mono, fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
                                padding: '16px 0', border: 'none',
                                background: logged ? '#0d1a06' : result.bad ? '#1a0f0f' : '#FDC800',
                                color: logged ? '#FDC800' : result.bad ? '#ff4757' : '#000',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                                cursor: logged ? 'default' : 'pointer',
                                borderRadius: 8,
                            }}
                        >
                            {logged
                                ? <><Check size={15} /> {lang === 'fr' ? 'TRADE ENREGISTRÉ' : 'TRADE LOGGED'}</>
                                : result.bad
                                    ? <><AlertTriangle size={15} /> {lang === 'fr' ? 'ENREGISTRER (RISQUÉ)' : 'LOG ANYWAY (RISKY)'}</>
                                    : <><BookmarkPlus size={15} /> {lang === 'fr' ? 'ENREGISTRER LE TRADE' : 'LOG TRADE'}</>
                            }
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
