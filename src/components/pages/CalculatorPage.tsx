'use client';

/**
 * Risk Engine — Position Sizer
 * 2026 redesign · Terminal aesthetic · Mobile-first
 *
 * Correct trader workflow:
 *   INPUT:  Asset + Direction + Entry + Stop Loss + Risk $
 *   OUTPUT: Position Size (contracts/lots/units) + TP levels + Notional + Verdict
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAppStore, getFuturesSpec, getESTFull, getTradingDay } from '@/store/appStore';
import { AlertTriangle, ShieldCheck, Zap, Search, Terminal, TrendingUp, TrendingDown, X, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TRADEIFY_ASSETS } from '@/data/tradeifyAssets';
import { calcSmartPositionSize } from '@/ai/RiskAI';

export default function CalculatorPage() {
    const { account, addTrade, addDailyRisk, getDailyRiskRemaining, trades, setActiveTab } = useAppStore();

    // ── Core state ───────────────────────────────────────────────
    const [command,         setCommand]         = useState('');
    const [asset,           setAsset]           = useState('SOL');
    const [entry,           setEntry]           = useState('');
    const [stopLoss,        setStopLoss]        = useState('');
    const [targetInput,     setTargetInput]     = useState('');
    const [riskAmount,      setRiskAmount]      = useState(0);
    const [inputMode,       setInputMode]       = useState<'risk' | 'size'>('risk');
    const [sizeInput,       setSizeInput]       = useState<string>('');
    const [isShort,         setIsShort]         = useState(false);
    const [showBrowser,     setShowBrowser]     = useState(false);
    const [assetSearch,     setAssetSearch]     = useState('');
    const [isMobile,        setIsMobile]        = useState(false);
    const [logged,          setLogged]          = useState(false);
    const entryInputRef = useRef<HTMLInputElement>(null);

    // ── Account context ──────────────────────────────────────────
    const remainingToday = getDailyRiskRemaining();
    const maxTradeRisk   = (account.balance * account.maxRiskPercent) / 100;

    // Init risk from account defaults on first render
    useEffect(() => {
        if (riskAmount === 0 && maxTradeRisk > 0) {
            setRiskAmount(Math.round(Math.min(maxTradeRisk, remainingToday > 0 ? remainingToday : maxTradeRisk)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [maxTradeRisk]); // intentionally: only re-run when account defaults change, not on every risk-amount keystroke

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // ── Asset type detection ─────────────────────────────────────
    const getAssetType = (sym: string): 'crypto' | 'forex' | 'futures' | 'stocks' => {
        const s = sym.toUpperCase().split('/')[0];
        if (getFuturesSpec(s)) return 'futures';
        const crypto = ['BTC','ETH','SOL','DOGE','XRP','AVAX','ADA','LINK','UNI','DOT','PEPE','WIF','SUI','APT','INJ','ARB','OP','BONK'];
        if (crypto.includes(s)) return 'crypto';
        if (s.length === 6) return 'forex';
        return 'crypto';
    };

    // ── Command parser: "nq 21450 21400 500" ────────────────────
    const handleCommand = (val: string) => {
        setCommand(val);
        const parts = val.trim().split(/\s+/);
        if (!parts[0]) return;
        const sym = parts[0].toUpperCase();
        if (sym === 'HELP' || sym === '?') return; // handled in JSX
        setAsset(sym);
        if (parts[1]) { const v = parseFloat(parts[1]); if (!isNaN(v) && v > 0) setEntry(parts[1]); }
        if (parts[2]) { const v = parseFloat(parts[2]); if (!isNaN(v) && v > 0) setStopLoss(parts[2]); }
        if (parts[3]) { const v = parseFloat(parts[3].replace(/[$,]/g, '')); if (!isNaN(v) && v > 0) setRiskAmount(v); }
    };

    // ── Live position calculation ────────────────────────────────
    const calc = useMemo(() => {
        const atype = getAssetType(asset);
        const eNum  = parseFloat(entry);
        const slNum = parseFloat(stopLoss);
        let rsk   = riskAmount;

        const sym      = asset.split('/')[0].toUpperCase();
        const fSpec    = atype === 'futures' ? getFuturesSpec(sym) : null;
        
        let cSize = parseFloat(sizeInput);
        if (inputMode === 'size' && !isNaN(cSize) && cSize > 0) {
             if (atype === 'futures') {
                  rsk = cSize * Math.abs(eNum - slNum) * (fSpec ? fSpec.pointValue : 1);
             } else if (atype === 'forex') {
                  rsk = cSize * 100000 * Math.abs(eNum - slNum);
             } else {
                  rsk = cSize * Math.abs(eNum - slNum);
             }
        }

        if (isNaN(eNum) || isNaN(slNum) || eNum <= 0 || slNum <= 0 || Math.abs(eNum - slNum) < 0.000001 || rsk <= 0) {
            return null;
        }
        const stopDist = Math.abs(eNum - slNum);
        const stopPct  = (stopDist / eNum) * 100;
        const isLong   = !isShort;

        // TP levels
        const tp1R = isLong ? eNum + stopDist     : eNum - stopDist;
        const tp2R = isLong ? eNum + stopDist * 2 : eNum - stopDist * 2;
        const tp3R = isLong ? eNum + stopDist * 3 : eNum - stopDist * 3;

        // Position size — uses correct formula per asset class
        const pos = calcSmartPositionSize({
            entry: eNum, stopLoss: slNum, riskUSD: rsk,
            assetType: atype, symbol: sym,
            includeTradeifyFee: atype === 'crypto',
        });

        const tgtNum = parseFloat(targetInput);
        let customProfit = 0;
        let isCustomTarget = false;
        if (!isNaN(tgtNum) && tgtNum > 0) {
            isCustomTarget = true;
            if (atype === 'futures') {
                customProfit = pos.size * Math.abs(tgtNum - eNum) * (fSpec ? fSpec.pointValue : 1);
            } else if (atype === 'forex') {
                customProfit = pos.size * 100000 * Math.abs(tgtNum - eNum);
            } else {
                customProfit = pos.size * Math.abs(tgtNum - eNum);
            }
        }

        // Guardian validation
        const blocks: string[] = [];
        if (rsk > remainingToday && remainingToday > 0) {
            blocks.push(`Risk ($${rsk.toFixed(0)}) exceeds daily budget. $${remainingToday.toFixed(0)} remaining today.`);
        }
        if (rsk > maxTradeRisk && maxTradeRisk > 0) {
            blocks.push(`Risk ($${rsk.toFixed(0)}) exceeds per-trade max ($${maxTradeRisk.toFixed(0)}).`);
        }
        if (account.maxDrawdownLimit && account.maxDrawdownLimit > 0) {
            let floor = account.balance - account.maxDrawdownLimit;
            if (account.drawdownType === 'Trailing') {
                floor = Math.min(account.startingBalance, (account.highestBalance || account.balance) - account.maxDrawdownLimit);
            } else if (account.drawdownType === 'Static') {
                floor = account.startingBalance - account.maxDrawdownLimit;
            } else if (account.drawdownType === 'EOD') {
                floor = (account.highestBalance || account.balance) - account.maxDrawdownLimit;
            }
            if ((account.balance - rsk) < floor) {
                blocks.push(`Trade breaches ${account.drawdownType} drawdown floor ($${floor.toLocaleString()}).`);
            }
        }
        const maxLev = account.leverage || 2;
        if (atype === 'crypto' && pos.notional > account.startingBalance * maxLev) {
            blocks.push(`Notional ($${pos.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}) exceeds ${maxLev}x leverage limit.`);
        }

        // Direction mismatch (stop on wrong side of entry)
        const impliedLong      = slNum < eNum;
        const directionMismatch = (isShort && impliedLong) || (!isShort && !impliedLong);

        const profit2R   = rsk * 2;


        const approved   = blocks.length === 0;
        const riskPerUnit = pos.size > 0 ? rsk / pos.size : 0;
        const ticksToStop = fSpec ? stopDist / fSpec.tickSize : 0;

        return {
            eNum, slNum, rsk, atype, sym,
            size: pos.size, unit: pos.unit,
            tp1R, tp2R, tp3R,
            notional: pos.notional, comm: pos.comm,
            stopDist, stopPct, riskPerUnit,
            profit2R, profit3R: rsk * 3,
            approved, blocks,
            fSpec, ticksToStop,
            directionMismatch,
            isCustomTarget, customProfit, tgtNum
        };
    }, [asset, entry, stopLoss, riskAmount, sizeInput, targetInput, inputMode, isShort, account, remainingToday, maxTradeRisk, trades]);

    // ── Design tokens ─────────────────────────────────────────────
    const mono    = { fontFamily: 'var(--font-mono)' } as const;
    const divider = '1px solid #1a1c24';
    const lbl     = { ...mono, fontSize: 8, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const } as const;

    // ── Guard state ───────────────────────────────────────────────
    const dailyLeftPct = account.dailyLossLimit > 0 ? remainingToday / account.dailyLossLimit : 1;
    const guardColor   = dailyLeftPct > 0.5 ? '#A6FF4D' : dailyLeftPct > 0.25 ? '#EAB308' : '#ff4757';
    const guardLabel   = dailyLeftPct > 0.5 ? 'SAFE' : dailyLeftPct > 0.25 ? 'CAUTION' : 'DANGER';

    // ── Today's trades ────────────────────────────────────────────
    const todayStr    = getTradingDay(new Date().toISOString());
    const todayTrades = trades.filter(t => getTradingDay(t.closedAt ?? t.createdAt) === todayStr);
    const todayWins   = todayTrades.filter(t => t.outcome === 'win').length;
    const todayLosses = todayTrades.filter(t => t.outcome === 'loss').length;

    // ── Price formatter ───────────────────────────────────────────
    const fmt = (n: number): string =>
        n < 0.01 ? n.toFixed(6) : n < 10 ? n.toFixed(4) : n < 1000 ? n.toFixed(2) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

    // ── Risk presets ──────────────────────────────────────────────
    const riskPresets = [
        { label: 'SAFE',  val: Math.round(maxTradeRisk) },
        { label: '½',     val: Math.round(maxTradeRisk / 2) },
        { label: '$100',  val: 100 },
        { label: '$250',  val: 250 },
        { label: '$500',  val: 500 },
    ].filter(p => p.val > 0);

    // ── Consistency warning for Instant Funding ───────────────────
    const consistencyWarning = useMemo(() => {
        if (!account.isConsistencyActive) return null;
        if (!calc) return null;
        const closedTrades = trades.filter(t => t.outcome === 'win' || t.outcome === 'loss');
        const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
        if (totalPnl <= 0) return null;
        const todayStr = getTradingDay(new Date().toISOString());
        const todayPnl = closedTrades.filter(t => getTradingDay(t.closedAt ?? t.createdAt) === todayStr).reduce((s, t) => s + (t.pnl ?? 0), 0);
        const projectedTodayPnl = todayPnl + (calc.isCustomTarget ? calc.customProfit : calc.profit2R);
        const projectedTotalPnl = totalPnl + (calc.isCustomTarget ? calc.customProfit : calc.profit2R);
        if (projectedTotalPnl <= 0) return null;
        const projectedConsistencyPct = (projectedTodayPnl / projectedTotalPnl) * 100;
        if (projectedConsistencyPct > 20) {
            return `If this trade wins at 2R, today's P&L would be ${projectedConsistencyPct.toFixed(1)}% of total profit — above the 20% consistency limit.`;
        }
        return null;
    }, [calc, trades, account.isConsistencyActive]);

    // ── Log trade ─────────────────────────────────────────────────
    const handleLog = useCallback(() => {
        if (!calc?.approved) return;
        addTrade({
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
            asset:           calc.sym,
            assetType:       calc.atype,
            entry:           calc.eNum,
            stopLoss:        calc.slNum,
            takeProfit:      calc.tp2R,
            lotSize:         calc.size,
            riskUSD:         calc.rsk,
            rewardUSD:       calc.profit2R,
            rr:              2,
            outcome:         'open',
            createdAt:       getESTFull(),
            closedAt:        undefined,
            durationSeconds: 0,
            isShort,
        });
        addDailyRisk(calc.rsk);
        setLogged(true);
        setTimeout(() => { setLogged(false); setActiveTab('journal'); }, 1800);
    }, [calc, isShort, addTrade, addDailyRisk, setActiveTab]);

    const isHelp = ['help', '?', 'h'].includes(command.trim().toLowerCase());
    const currentAssetType = getAssetType(asset);
    const currentFSpec = currentAssetType === 'futures' ? getFuturesSpec(asset.split('/')[0]) : null;

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh' }}
            onClick={e => { if (showBrowser && !(e.target as Element).closest('.asset-browser-wrap')) setShowBrowser(false); }}
        >

            {/* ── HEADER ──────────────────────────────────────────────── */}
            <div style={{ padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Terminal size={14} color="#A6FF4D" />
                    <span style={{ ...mono, fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.04em' }}>RISK ENGINE</span>
                    <span style={{ ...lbl, display: 'inline', marginLeft: 4 }}>— position sizer</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...mono, fontSize: 10, color: '#4b5563' }}>
                        {todayTrades.length} trade{todayTrades.length !== 1 ? 's' : ''} today
                    </span>
                    <span style={{
                        ...mono, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                        padding: '3px 9px',
                        background: `${guardColor}12`, border: `1px solid ${guardColor}38`, color: guardColor,
                    }}>{guardLabel}</span>
                </div>
            </div>

            {/* ── CONTEXT STRIP — 4 KPIs ──────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', borderBottom: divider, flexShrink: 0 }}>
                {([
                    { k: 'Balance',    v: account.balance >= 1000 ? `$${(account.balance/1000).toFixed(1)}K` : `$${account.balance.toFixed(0)}`, c: '#e2e8f0', s: account.propFirm || 'account equity' },
                    { k: 'Daily Left', v: `$${remainingToday.toFixed(0)}`,  c: guardColor, s: `${Math.round(dailyLeftPct * 100)}% of $${account.dailyLossLimit.toFixed(0)}` },
                    { k: 'Safe Risk',  v: `$${maxTradeRisk.toFixed(0)}`,    c: '#e2e8f0',  s: `${account.maxRiskPercent}% per trade` },
                    { k: 'Today',      v: todayTrades.length.toString(),    c: '#e2e8f0',  s: todayTrades.length > 0 ? `${todayWins}W · ${todayLosses}L` : 'no trades logged' },
                ] as const).map((s, i) => (
                    <div key={i} style={{
                        padding: isMobile ? '10px 12px' : '10px 16px',
                        borderRight: isMobile ? (i % 2 === 0 ? divider : 'none') : (i < 3 ? divider : 'none'),
                        borderBottom: isMobile && i < 2 ? divider : 'none',
                    }}>
                        <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>{s.k}</span>
                        <span style={{ ...mono, fontSize: isMobile ? 15 : 18, fontWeight: 800, color: s.c, display: 'block', lineHeight: 1, letterSpacing: '-0.02em' }}>{s.v}</span>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>{s.s}</span>
                    </div>
                ))}
            </div>

            {/* ── DIRECTION + COMMAND ──────────────────────────────────── */}
            <div style={{ padding: isMobile ? '10px 14px' : '12px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Long / Short */}
                <div style={{ display: 'flex', border: divider, flexShrink: 0 }}>
                    <button onClick={() => setIsShort(false)} style={{
                        ...mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '8px 14px',
                        border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                        background: !isShort ? '#A6FF4D' : 'transparent',
                        color: !isShort ? '#000' : '#4b5563',
                        display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        <TrendingUp size={11} />LONG
                    </button>
                    <button onClick={() => setIsShort(true)} style={{
                        ...mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '8px 14px',
                        border: 'none', borderLeft: divider, cursor: 'pointer', transition: 'all 0.12s',
                        background: isShort ? '#ff4757' : 'transparent',
                        color: isShort ? '#fff' : '#4b5563',
                        display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        <TrendingDown size={11} />SHORT
                    </button>
                </div>

                {/* Quick command */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, borderLeft: divider, paddingLeft: 12, minWidth: 0 }}>
                    <Zap size={12} color="#A6FF4D" style={{ flexShrink: 0 }} />
                    <input
                        style={{ ...mono, flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: '#e2e8f0', minWidth: 0 }}
                        placeholder={isMobile ? 'nq 21450 21400 500' : 'Quick mode: asset entry stop risk — e.g. nq 21450 21400 500 · type help for syntax'}
                        value={command}
                        onChange={e => handleCommand(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {command && (
                        <button onClick={() => setCommand('')} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── HELP PANEL ──────────────────────────────────────────── */}
            <AnimatePresence>
                {isHelp && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden', borderBottom: divider, background: '#0a0a0a', padding: '14px 20px' }}>
                        <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: '#A6FF4D', display: 'block', marginBottom: 10, letterSpacing: '0.06em' }}>
                            QUICK COMMAND SYNTAX — asset entry stop [risk]
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px 24px' }}>
                            {[
                                ['nq 21450 21400 500',    'NQ futures — entry 21450, stop 21400 (50pts), risk $500'],
                                ['sol 91.65 90.48 800',   'SOL crypto — entry 91.65, stop 90.48, risk $800'],
                                ['btc 95000 93500',        'BTC with default risk (from account settings)'],
                                ['gc 3200 3180 400',       'Gold (GC) — entry 3200, stop 3180, risk $400'],
                                ['es 5820 5810 1000',      'ES futures — 10-point stop, risk $1,000'],
                                ['eurusd 1.0820 1.0800',  'EURUSD forex — 20-pip stop'],
                            ].map(([cmd, desc]) => (
                                <div key={cmd} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <span style={{ ...mono, fontSize: 10, color: '#A6FF4D', flexShrink: 0, minWidth: isMobile ? 140 : 160 }}>{cmd}</span>
                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', lineHeight: 1.5 }}>{desc}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── INPUT GRID ───────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', borderBottom: divider }}>

                {/* ASSET */}
                <div style={{ padding: isMobile ? '12px 12px' : '14px 16px', borderRight: divider, borderBottom: isMobile ? divider : 'none', position: 'relative' }} className="asset-browser-wrap">
                    <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>Asset</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                            style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#e2e8f0', padding: 0 }}
                            value={asset.split('/')[0]}
                            onFocus={() => setShowBrowser(true)}
                            onChange={e => { setAsset(e.target.value.toUpperCase()); setCommand(''); }}
                            placeholder="SOL"
                        />
                    </div>
                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>
                        {currentAssetType}
                        {currentFSpec && <> · ${currentFSpec.pointValue}/pt · ${(currentFSpec.pointValue * currentFSpec.tickSize).toFixed(2)}/tick</>}
                    </span>

                    {/* Asset browser dropdown */}
                    <AnimatePresence>
                        {showBrowser && (
                            <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                transition={{ duration: 0.13, ease: 'easeOut' }}
                                className="absolute top-[100%] left-0 z-50 mt-2"
                                style={{ width: isMobile ? 280 : 360, background: '#0d1117', border: '1px solid #1a1c24', boxShadow: '0 16px 48px rgba(0,0,0,0.7)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 200 : 340, overflowY: 'auto' }}
                            >
                                {/* Search */}
                                <div style={{ padding: '10px 14px', borderBottom: '1px solid #1a1c24', display: 'flex', alignItems: 'center', gap: 8, background: '#090909' }}>
                                    <Search size={13} color="#4b5563" />
                                    <input
                                        style={{ ...mono, flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#e2e8f0' }}
                                        placeholder="Search 100+ instruments..."
                                        autoFocus
                                        value={assetSearch}
                                        onChange={e => setAssetSearch(e.target.value)}
                                    />
                                    <button onClick={() => setShowBrowser(false)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 2 }}>
                                        <X size={13} />
                                    </button>
                                </div>
                                {/* Results */}
                                <div style={{ overflowY: 'auto', flex: 1, scrollbarWidth: 'thin' }}>
                                    {(assetSearch
                                        ? TRADEIFY_ASSETS.filter(a => a.symbol.toLowerCase().includes(assetSearch.toLowerCase()) || a.name.toLowerCase().includes(assetSearch.toLowerCase()))
                                        : TRADEIFY_ASSETS.slice(0, 20)
                                    ).map(a => {
                                        const sym    = a.symbol.split('/')[0];
                                        const isFut  = !!getFuturesSpec(sym);
                                        const fS     = isFut ? getFuturesSpec(sym) : null;
                                        return (
                                            <button
                                                key={a.symbol}
                                                onClick={() => { setAsset(sym); setShowBrowser(false); setAssetSearch(''); entryInputRef.current?.focus(); }}
                                                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid #0d1117' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#1a1c24')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <div>
                                                    <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{sym}</span>
                                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', marginLeft: 8 }}>{a.name}</span>
                                                </div>
                                                <span style={{ ...mono, fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 7px', color: isFut ? '#EAB308' : '#A6FF4D', border: `1px solid ${isFut ? 'rgba(234,179,8,0.3)' : 'rgba(166,255,77,0.25)'}`, background: isFut ? 'rgba(234,179,8,0.07)' : 'rgba(166,255,77,0.05)' }}>
                                                    {isFut ? `$${fS?.pointValue}/pt` : `${a.leverage}x`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {assetSearch && TRADEIFY_ASSETS.filter(a => a.symbol.toLowerCase().includes(assetSearch.toLowerCase()) || a.name.toLowerCase().includes(assetSearch.toLowerCase())).length === 0 && (
                                        <div style={{ ...mono, fontSize: 11, color: '#4b5563', padding: '20px', textAlign: 'center' }}>No matching instruments</div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ENTRY PRICE */}
                <div style={{ padding: isMobile ? '12px 12px' : '14px 16px', borderRight: isMobile ? 'none' : divider, borderBottom: isMobile ? divider : 'none' }}>
                    <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>Entry Price</span>
                    <input
                        ref={entryInputRef}
                        type="number" inputMode="decimal" pattern="[0-9]*"
                        style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#e2e8f0', padding: 0 }}
                        value={entry}
                        onChange={e => { setEntry(e.target.value); setCommand(''); }}
                        placeholder="0.00"
                    />
                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>
                        {isShort ? 'sell / short entry' : 'buy / long entry'}
                    </span>
                </div>

                {/* STOP LOSS */}
                <div style={{ padding: isMobile ? '12px 12px' : '14px 16px', borderRight: divider, borderBottom: isMobile ? divider : 'none' }}>
                    <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>Stop Loss</span>
                    <input
                        type="number" inputMode="decimal" pattern="[0-9]*"
                        style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#ff4757', padding: 0 }}
                        value={stopLoss}
                        onChange={e => { setStopLoss(e.target.value); setCommand(''); }}
                        placeholder="0.00"
                    />
                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>
                        {calc
                            ? `${calc.stopPct.toFixed(2)}% · ${calc.stopDist < 1 ? calc.stopDist.toFixed(5) : calc.stopDist.toFixed(2)} pts`
                            : 'exit if wrong'}
                    </span>
                </div>

                {/* TARGET PRICE */}
                <div style={{ padding: isMobile ? '12px 12px' : '14px 16px', borderRight: isMobile ? 'none' : divider, borderBottom: isMobile ? divider : 'none' }}>
                    <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>Target (Optional)</span>
                    <input
                        type="number" inputMode="decimal" pattern="[0-9]*"
                        style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#A6FF4D', padding: 0 }}
                        value={targetInput}
                        onChange={e => { setTargetInput(e.target.value); setCommand(''); }}
                        placeholder="Auto 2R"
                    />
                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>
                        {calc?.isCustomTarget ? `Reward: $${calc.customProfit.toFixed(0)}` : 'leave empty for 2R'}
                    </span>
                </div>

                {/* RISK $ / SIZE */}
                <div style={{ padding: isMobile ? '12px 12px' : '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={lbl}>{inputMode === 'risk' ? 'Risk $' : 'Size (Contracts/Lots)'}</span>
                        <button onClick={() => setInputMode(m => m === 'risk' ? 'size' : 'risk')} style={{ ...mono, fontSize: 8, color: '#A6FF4D', background: 'transparent', border: '1px solid #1a1c24', cursor: 'pointer', padding: '2px 4px', borderRadius: 2 }}>Toggle Mode</button>
                    </div>
                    {inputMode === 'risk' ? (
                        <input
                            type="number" inputMode="decimal" pattern="[0-9]*"
                            style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#A6FF4D', padding: 0 }}
                            value={riskAmount || ''}
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                setRiskAmount(!isNaN(v) && v > 0 ? v : 0);
                                setCommand('');
                            }}
                            placeholder={maxTradeRisk > 0 ? maxTradeRisk.toFixed(0) : '0'}
                        />
                    ) : (
                        <input
                            type="number" inputMode="decimal" pattern="[0-9]*"
                            style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#A6FF4D', padding: 0 }}
                            value={sizeInput || ''}
                            onChange={e => {
                                setSizeInput(e.target.value);
                                setCommand('');
                            }}
                            placeholder="1.0"
                        />
                    )}
                    {/* Quick risk presets */}
                    {inputMode === 'risk' && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                            {riskPresets.map(p => (
                                <button key={p.label} onClick={() => setRiskAmount(p.val)}
                                    style={{
                                        ...mono, fontSize: 8, fontWeight: 700, padding: '2px 6px',
                                        border: `1px solid ${riskAmount === p.val ? '#A6FF4D' : '#1a1c24'}`,
                                        background: riskAmount === p.val ? 'rgba(166,255,77,0.1)' : 'transparent',
                                        color: riskAmount === p.val ? '#A6FF4D' : '#4b5563',
                                        cursor: 'pointer', letterSpacing: '0.04em',
                                    }}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── LIVE RESULTS ─────────────────────────────────────────── */}
            <AnimatePresence>
                {calc && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

                        {/* Direction warning */}
                        {calc.directionMismatch && (
                            <div style={{ padding: '8px 20px', background: 'rgba(234,179,8,0.05)', borderBottom: divider, borderLeft: '3px solid #EAB308', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={12} color="#EAB308" />
                                <span style={{ ...mono, fontSize: 10, color: '#EAB308' }}>
                                    Stop is {isShort ? 'below' : 'above'} entry — verify {isShort ? 'SHORT' : 'LONG'} direction is correct
                                </span>
                            </div>
                        )}

                        {/* Consistency warning — Instant Funding only */}
                        {consistencyWarning && (
                            <div style={{ padding: '8px 20px', background: 'rgba(234,179,8,0.05)', borderBottom: divider, borderLeft: '3px solid #EAB308', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={12} color="#EAB308" />
                                <span style={{ ...mono, fontSize: 10, color: '#EAB308' }}>
                                    CONSISTENCY — {consistencyWarning}
                                </span>
                            </div>
                        )}

                        {/* HERO: Size + Potential */}
                        <div style={{ padding: isMobile ? '16px 14px' : '20px 20px', borderBottom: divider, background: '#0a0a0a', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
                            <div>
                                <span style={{ ...lbl, display: 'block', marginBottom: 6 }}>Position Size</span>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                    <span style={{ ...mono, fontSize: isMobile ? 40 : 52, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>
                                        {calc.size >= 0.001
                                            ? calc.size.toLocaleString(undefined, { maximumFractionDigits: calc.size < 1 ? 4 : calc.size < 10 ? 2 : 0 })
                                            : calc.size.toFixed(6)
                                        }
                                    </span>
                                    <span style={{ ...mono, fontSize: 14, fontWeight: 800, color: '#A6FF4D', letterSpacing: '0.06em' }}>
                                        {calc.unit.toUpperCase()}
                                    </span>
                                </div>
                                {calc.fSpec && (
                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', display: 'block', marginTop: 5 }}>
                                        {calc.fSpec.label} · ${calc.fSpec.pointValue}/pt · {calc.ticksToStop.toFixed(0)} ticks to stop
                                    </span>
                                )}
                                {!calc.fSpec && (
                                    <span style={{ ...mono, fontSize: 10, color: '#4b5563', display: 'block', marginTop: 5 }}>
                                        {calc.atype} · stop {calc.stopPct.toFixed(2)}% from entry
                                    </span>
                                )}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span style={{ ...lbl, display: 'block', marginBottom: 6 }}>{calc.isCustomTarget ? 'Custom Target' : 'Potential 2R'}</span>
                                <span style={{ ...mono, fontSize: isMobile ? 26 : 32, fontWeight: 900, color: '#A6FF4D', letterSpacing: '-0.03em' }}>
                                    +${calc.isCustomTarget ? calc.customProfit.toFixed(0) : calc.profit2R.toFixed(0)}
                                </span>
                                <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 4 }}>
                                    {inputMode === 'size' ? `TOTAL RISK: $${calc.rsk.toFixed(0)}` : `vs $${calc.rsk.toFixed(0)} risked`} · {calc.isCustomTarget ? `RR: ${(calc.customProfit / calc.rsk).toFixed(1)}:1` : `3R = $${calc.profit3R.toFixed(0)}`}
                                </span>
                            </div>
                        </div>

                        {/* SL / Entry / TP price row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: divider }}>
                            {[
                                { k: 'Stop Loss',      v: fmt(calc.slNum),  c: '#ff4757', s: `risk $${calc.rsk.toFixed(0)} if hit` },
                                { k: 'Entry',          v: fmt(calc.eNum),   c: '#e2e8f0', s: `${isShort ? 'SHORT' : 'LONG'} · 1R: ${fmt(calc.tp1R)}` },
                                { k: 'Take Profit 2R', v: fmt(calc.tp2R),   c: '#A6FF4D', s: `3R target: ${fmt(calc.tp3R)}` },
                            ].map((s, i) => (
                                <div key={i} style={{ padding: isMobile ? '12px 12px' : '14px 16px', borderRight: i < 2 ? divider : 'none' }}>
                                    <span style={{ ...lbl, display: 'block', marginBottom: 4 }}>{s.k}</span>
                                    <span style={{ ...mono, fontSize: isMobile ? 15 : 17, fontWeight: 800, color: s.c, display: 'block', lineHeight: 1, letterSpacing: '-0.02em' }}>{s.v}</span>
                                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 3 }}>{s.s}</span>
                                </div>
                            ))}
                        </div>

                        {/* Metadata 4-col */}
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', borderBottom: divider }}>
                            {[
                                { k: 'R:R Ratio',   v: '2.00R',   c: '#A6FF4D',  s: 'minimum standard' },
                                { k: 'Notional',    v: calc.notional >= 1000000 ? `$${(calc.notional/1000000).toFixed(2)}M` : calc.notional >= 1000 ? `$${(calc.notional/1000).toFixed(1)}K` : `$${calc.notional.toFixed(0)}`, c: '#e2e8f0', s: calc.atype === 'futures' ? 'contract notional' : 'position value' },
                                { k: 'Commission',  v: calc.comm > 0 ? `$${calc.comm.toFixed(2)}` : 'N/A', c: calc.comm > 0 ? '#EAB308' : '#4b5563', s: calc.atype === 'crypto' ? '0.04% Tradeify' : 'flat per contract' },
                                { k: 'Risk / Unit', v: calc.riskPerUnit < 0.01 ? `$${calc.riskPerUnit.toFixed(4)}` : `$${calc.riskPerUnit.toFixed(2)}`, c: '#e2e8f0', s: `per ${calc.unit.replace(/s$/, '')}` },
                            ].map((s, i) => (
                                <div key={i} style={{
                                    padding: isMobile ? '10px 12px' : '12px 16px',
                                    borderRight: isMobile ? (i % 2 === 0 ? divider : 'none') : (i < 3 ? divider : 'none'),
                                    borderBottom: isMobile && i < 2 ? divider : 'none',
                                }}>
                                    <span style={{ ...lbl, display: 'block', marginBottom: 3 }}>{s.k}</span>
                                    <span style={{ ...mono, fontSize: 14, fontWeight: 800, color: s.c, display: 'block', lineHeight: 1 }}>{s.v}</span>
                                    <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 2 }}>{s.s}</span>
                                </div>
                            ))}
                        </div>

                        {/* VERDICT */}
                        <div style={{
                            padding: isMobile ? '14px 14px' : '16px 20px', borderBottom: divider,
                            borderLeft: `3px solid ${calc.approved ? '#A6FF4D' : '#ff4757'}`,
                            background: calc.approved ? 'rgba(166,255,77,0.03)' : 'rgba(255,71,87,0.04)',
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                        }}>
                            {calc.approved
                                ? <ShieldCheck size={20} color="#A6FF4D" style={{ flexShrink: 0, marginTop: 1 }} />
                                : <AlertTriangle size={20} color="#ff4757" style={{ flexShrink: 0, marginTop: 1 }} />}
                            <div style={{ flex: 1 }}>
                                <span style={{ ...mono, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', display: 'block', color: calc.approved ? '#A6FF4D' : '#ff4757' }}>
                                    {calc.approved ? 'SAFE TO EXECUTE' : 'TRADE REJECTED'}
                                </span>
                                <span style={{ ...mono, fontSize: 11, color: '#8b949e', display: 'block', marginTop: 3, lineHeight: 1.65 }}>
                                    {calc.approved
                                        ? `${isShort ? 'SHORT' : 'LONG'} ${calc.sym} — ${calc.size} ${calc.unit} · SL ${fmt(calc.slNum)} · TP ${fmt(calc.tp2R)} · risking $${calc.rsk.toFixed(0)} for $${calc.profit2R.toFixed(0)}`
                                        : calc.blocks[0]
                                    }
                                </span>
                                {calc.approved && calc.comm > 0 && (
                                    <span style={{ ...mono, fontSize: 10, color: '#EAB308', display: 'block', marginTop: 5 }}>
                                        Tradeify fee: ${calc.comm.toFixed(2)} — actual risk = $${(calc.rsk + calc.comm).toFixed(2)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* LOG CTA */}
                        <div style={{ padding: isMobile ? '14px 14px' : '16px 20px' }}>
                            <button
                                disabled={!calc.approved}
                                onClick={handleLog}
                                style={{
                                    ...mono, width: '100%', padding: isMobile ? '14px' : '16px',
                                    border: 'none', cursor: calc.approved ? 'pointer' : 'not-allowed',
                                    background: logged ? '#16a34a' : calc.approved ? '#A6FF4D' : '#0d1117',
                                    color: calc.approved ? '#000' : '#4b5563',
                                    fontSize: 12, fontWeight: 900, letterSpacing: '0.1em',
                                    textTransform: 'uppercase', transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    boxShadow: calc.approved && !logged ? '0 0 24px rgba(166,255,77,0.15)' : 'none',
                                }}
                            >
                                {logged
                                    ? <><ShieldCheck size={15} color="#fff" /> Logged — redirecting to Journal</>
                                    : calc.approved
                                        ? <><ShieldCheck size={15} /> Log Trade to Journal</>
                                        : <><AlertTriangle size={15} /> Fix Errors to Log</>
                                }
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── EMPTY STATE ──────────────────────────────────────────── */}
            {!calc && !isHelp && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 20px', gap: 10, textAlign: 'center', flex: 1 }}>
                    <div style={{ width: 46, height: 46, border: divider, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                        <Target size={20} color="#1f2937" />
                    </div>
                    <span style={{ ...mono, fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>Position Sizer Ready</span>
                    <span style={{ ...mono, fontSize: 11, color: '#4b5563', lineHeight: 1.9, maxWidth: 320 }}>
                        Enter your entry price + stop loss price to instantly calculate
                        your exact position size, R:R levels, and risk metrics.
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, padding: '12px 20px', border: divider, background: '#0a0a0a', textAlign: 'left' }}>
                        {[
                            `Quick command: nq 21450 21400 500`,
                            `Fills all fields instantly — press ↵`,
                            `Type "help" for full syntax`,
                        ].map((t, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ ...mono, fontSize: 10, color: i === 0 ? '#A6FF4D' : '#4b5563' }}>
                                    {i === 0 ? '⚡' : '·'}
                                </span>
                                <span style={{ ...mono, fontSize: 10, color: i === 0 ? '#8b949e' : '#4b5563' }}>{t}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}
