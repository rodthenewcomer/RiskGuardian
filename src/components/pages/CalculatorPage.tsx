'use client';

import { useState, useCallback, useMemo } from 'react';
import { useAppStore, getFuturesSpec, getESTFull } from '@/store/appStore';
import { AlertTriangle, ShieldCheck, Zap, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TRADEIFY_ASSETS } from '@/data/tradeifyAssets';

export default function CalculatorPage() {
    const { account, addTrade, addDailyRisk, getDailyRiskRemaining, setActiveTab } = useAppStore();

    // The Command Line Input
    const [command, setCommand] = useState('');

    // Core inputs
    const [asset, setAsset] = useState('SOL');
    const [entry, setEntry] = useState('');
    const [size, setSize] = useState('');
    const [isShort, setIsShort] = useState(false);
    const [showAssetBrowser, setShowAssetBrowser] = useState(false);
    const [assetSearch, setAssetSearch] = useState('');

    // Limits
    const remainingToday = getDailyRiskRemaining();
    const maxTradeRisk = (account.balance * account.maxRiskPercent) / 100;
    const safeMaxRisk = Math.max(maxTradeRisk, remainingToday);

    // Risk state
    const [riskAmount, setRiskAmount] = useState<number>(safeMaxRisk > 0 ? Math.min(100, safeMaxRisk) : 100);

    // Auto-detect asset type helper
    const getAssetType = (sym: string): 'crypto' | 'forex' | 'futures' | 'stocks' => {
        const clean = sym.toUpperCase();
        if (getFuturesSpec(clean)) return 'futures';
        if (clean.includes('/')) {
            const cryptoPrefixes = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'MATIC', 'ADA', 'LINK'];
            if (cryptoPrefixes.some(p => clean.startsWith(p))) return 'crypto';
            return 'forex';
        }
        return 'stocks'; // default fallback for words like 'AAPL' without slashes or known futures
    }

    // Command parser logic (ultra-fast mode)
    const handleCommandChange = (val: string) => {
        setCommand(val);
        if (!val.trim()) return;
        const parts = val.trim().split(/\s+/);
        if (parts.length >= 1 && parts[0]) setAsset(parts[0].toUpperCase());
        if (parts.length >= 2) {
            const ent = parseFloat(parts[1]);
            if (!isNaN(ent)) setEntry(parts[1]);
        }
        if (parts.length >= 3) {
            const sz = parseFloat(parts[2]);
            if (!isNaN(sz)) setSize(parts[2]);
        }
        if (parts.length >= 4) {
            const riskStr = parts[3].toLowerCase().replace('risk', '');
            const rsk = parseFloat(riskStr);
            if (!isNaN(rsk) && rsk > 0) {
                setRiskAmount(rsk);
            }
        }
    };

    // Live HUD Calculation
    // Live HUD Calculation
    const {
        sl, tp, profit, approved, verdictTitle, verdictDesc, optionalNotice, assetType, entryNum, sizeNum, comm, notional
    } = useMemo(() => {
        const atype = getAssetType(asset);
        const eNum = parseFloat(entry);
        const sNum = parseFloat(size);

        let calculatedSl = 0;
        let calculatedTp = 0;
        const calculatedProfit = riskAmount * 2; // Default 2R
        let isApproved = false;
        let title = '';
        let desc = '';
        let notice = '';
        let currentComm = 0;
        let currentNotional = 0;
        const blocks: string[] = [];

        if (!isNaN(eNum) && !isNaN(sNum) && sNum > 0 && eNum > 0) {
            let pointVal = 1;
            if (atype === 'futures') {
                const spec = getFuturesSpec(asset);
                pointVal = spec ? spec.pointValue : 1;
            }

            const priceMove = riskAmount / (sNum * pointVal);
            calculatedSl = isShort ? eNum + priceMove : eNum - priceMove;
            calculatedTp = isShort ? eNum - (priceMove * 2) : eNum + (priceMove * 2);

            currentNotional = sNum * eNum * pointVal;
            currentComm = currentNotional * 0.0004;

            const breaksDaily = riskAmount > remainingToday;
            const breaksMaxRisk = riskAmount > maxTradeRisk;

            let maxLev = account.leverage || 100;
            if (account.propFirm?.includes('Tradeify')) {
                const isBTC_ETH = asset.includes('BTC') || asset.includes('ETH');
                maxLev = (account.propFirmType?.includes('Evaluation') && isBTC_ETH) ? 5 : 2;
                notice = `Trade Fee: $${currentComm.toFixed(2)} (0.04% Tradeify Comm)`;
            }

            const maxPosValue = account.balance * maxLev;
            const breaksLeverage = (atype === 'crypto' || asset.includes('USD')) && currentNotional > maxPosValue;

            if (breaksDaily) blocks.push(`Risk ($${riskAmount.toFixed(0)}) exceeds daily limit remaining ($${remainingToday.toFixed(0)}).`);
            if (breaksMaxRisk) blocks.push(`Risk ($${riskAmount.toFixed(0)}) exceeds max per trade limit ($${maxTradeRisk.toFixed(0)}).`);
            if (breaksLeverage) blocks.push(`Notional ($${currentNotional.toLocaleString()}) exceeds your ${maxLev}:1 leverage ($${maxPosValue.toLocaleString()}).`);

            if (account.maxDrawdownLimit && account.maxDrawdownLimit > 0) {
                let floor = account.balance - account.maxDrawdownLimit;
                if (account.drawdownType === 'Trailing') {
                    floor = Math.min(account.startingBalance, (account.highestBalance || account.balance) - account.maxDrawdownLimit);
                } else if (account.drawdownType === 'Static') {
                    floor = account.startingBalance - account.maxDrawdownLimit;
                } else if (account.drawdownType === 'EOD') {
                    floor = (account.highestBalance || account.balance) - account.maxDrawdownLimit;
                }
                if ((account.balance - riskAmount) < floor) {
                    blocks.push(`Risk ($${riskAmount.toFixed(0)}) breaches your ${account.drawdownType} Drawdown Floor of $${floor.toLocaleString()}!`);
                }
            }

            isApproved = blocks.length === 0;

            if (isApproved) {
                title = 'SAFE TO EXECUTE';
                desc = `${isShort ? 'SHORT' : 'LONG'} $${asset}: Risking $${riskAmount.toFixed(0)} for $${calculatedProfit.toFixed(0)} profit.`;
            } else {
                title = 'TRADE REJECTED';
                desc = blocks[0] || 'Unknown Error';
            }
        }

        return {
            sl: calculatedSl,
            tp: calculatedTp,
            profit: calculatedProfit,
            approved: isApproved,
            verdictTitle: title,
            verdictDesc: desc,
            optionalNotice: notice,
            assetType: atype,
            entryNum: eNum,
            sizeNum: sNum,
            comm: currentComm,
            notional: currentNotional
        };
    }, [asset, entry, size, riskAmount, account, remainingToday, maxTradeRisk, isShort]);

    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
    const lbl: React.CSSProperties = { ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase' as const, display: 'block' };
    const divider = '1px solid #1a1c24';

    const savePlan = useCallback(() => {
        if (!approved) return;
        addTrade({
            id: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2)),
            asset: asset || 'UNKNOWN',
            assetType,
            entry: entryNum,
            stopLoss: sl,
            takeProfit: tp,
            lotSize: sizeNum,
            riskUSD: riskAmount,
            rewardUSD: profit,
            rr: 2,
            outcome: 'open',
            createdAt: getESTFull(),
        });
        addDailyRisk(riskAmount);
        setActiveTab('plan');
    }, [approved, addTrade, asset, assetType, entryNum, sl, tp, sizeNum, riskAmount, profit, addDailyRisk, setActiveTab]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: '#090909', minHeight: '100vh' }}>

            {/* ── STATUS BAR ──────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: divider }}>
                <div style={{ padding: '14px 20px', borderRight: divider }}>
                    <span style={lbl}>Balance</span>
                    <span style={{ ...mono, fontSize: 24, fontWeight: 800, color: '#fff', display: 'block', marginTop: 3, letterSpacing: '-0.03em' }}>
                        ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                </div>
                <div style={{ padding: '14px 20px' }}>
                    <span style={lbl}>Daily Loss Left</span>
                    <span style={{ ...mono, fontSize: 24, fontWeight: 800, color: remainingToday < (account.dailyLossLimit * 0.2) ? '#ff4757' : '#A6FF4D', display: 'block', marginTop: 3, letterSpacing: '-0.03em' }}>
                        ${remainingToday.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                </div>
            </div>

            {/* ── DIRECTION + COMMAND INPUT ───────────────────────── */}
            <div style={{ padding: '14px 20px', borderBottom: divider, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', border: divider, overflow: 'hidden', flexShrink: 0 }}>
                    <button onClick={() => setIsShort(false)} style={{
                        ...mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '7px 16px',
                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                        background: !isShort ? '#A6FF4D' : 'transparent', color: !isShort ? '#000' : '#4b5563',
                    }}>LONG</button>
                    <button onClick={() => setIsShort(true)} style={{
                        ...mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '7px 16px',
                        border: 'none', borderLeft: divider, cursor: 'pointer', transition: 'all 0.15s',
                        background: isShort ? '#ff4757' : 'transparent', color: isShort ? '#fff' : '#4b5563',
                    }}>SHORT</button>
                </div>
                <input
                    style={{ ...mono, flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, fontWeight: 600, color: '#e2e8f0', minWidth: 0 }}
                    placeholder="Quick entry: SOL 91.65 800"
                    value={command}
                    onChange={e => handleCommandChange(e.target.value)}
                    autoFocus
                    autoComplete="off"
                />
                <Zap size={14} color="#A6FF4D" style={{ flexShrink: 0 }} />
            </div>

            {/* ── INPUTS GRID ─────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: divider }}>
                {/* Asset */}
                <div style={{ padding: '14px 16px', borderRight: divider, position: 'relative' }}>
                    <span style={lbl}>Asset</span>
                    <input
                        id="assetInput"
                        style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginTop: 4, padding: 0 }}
                        value={asset}
                        onFocus={() => setShowAssetBrowser(true)}
                        onChange={e => { setAsset(e.target.value.toUpperCase()); setCommand(''); }}
                        placeholder="SOL"
                    />
                    <AnimatePresence>
                        {showAssetBrowser && (
                            <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                className="absolute top-[100%] left-0 w-[300px] sm:w-[380px] z-50 mt-2 bg-[#12141A]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[340px]"
                            >
                                <div className="p-3 border-b border-white/5 flex items-center gap-3 bg-white/[0.02]">
                                    <Search size={16} className="text-muted" />
                                    <input
                                        className="bg-transparent border-none text-[14px] font-medium text-white focus:ring-0 w-full placeholder-white/20 outline-none"
                                        placeholder="Search 100+ instruments..."
                                        autoFocus
                                        value={assetSearch}
                                        onChange={e => setAssetSearch(e.target.value)}
                                    />
                                </div>
                                <div className="overflow-y-auto flex-1 custom-scrollbar py-2">
                                    {(assetSearch ? TRADEIFY_ASSETS.filter(a => a.symbol.includes(assetSearch.toUpperCase()) || a.name.toLowerCase().includes(assetSearch.toLowerCase())) : TRADEIFY_ASSETS.slice(0, 15)).map(a => (
                                        <button
                                            key={a.symbol}
                                            className="w-full text-left px-4 py-2 hover:bg-white/[0.04] flex justify-between items-center transition-all group"
                                            onClick={() => {
                                                setAsset(a.symbol.split('/')[0]);
                                                setShowAssetBrowser(false);
                                                setAssetSearch('');
                                            }}
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-[14px] font-bold text-white group-hover:text-accent transition-colors">{a.symbol}</span>
                                                <span className="text-[11px] text-muted font-medium">{a.name}</span>
                                            </div>
                                            <span className="text-[10px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 rounded-md font-bold tracking-wide">
                                                {a.leverage}x
                                            </span>
                                        </button>
                                    ))}
                                    {TRADEIFY_ASSETS.filter(a => a.symbol.includes(assetSearch.toUpperCase())).length === 0 && (
                                        <div className="p-6 text-center text-[13px] text-muted font-medium italic">No matching instruments found</div>
                                    )}
                                </div>
                                <div className="p-2 border-t border-white/5 bg-black/20 text-center">
                                    <button
                                        className="text-[11px] font-semibold text-white/50 hover:text-white transition-colors uppercase tracking-wider px-4 py-1.5"
                                        onClick={() => setShowAssetBrowser(false)}
                                    >
                                        Close
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {/* Entry */}
                <div style={{ padding: '14px 16px', borderRight: divider }}>
                    <span style={lbl}>Entry Price</span>
                    <input
                        id="entryInput"
                        type="number" inputMode="decimal"
                        style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginTop: 4, padding: 0 }}
                        value={entry}
                        onChange={e => { setEntry(e.target.value); setCommand(''); }}
                        placeholder="0.00"
                    />
                </div>
                {/* Size */}
                <div style={{ padding: '14px 16px' }}>
                    <span style={lbl}>Position Size</span>
                    <input
                        id="sizeInput"
                        type="number" inputMode="decimal"
                        style={{ ...mono, width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 20, fontWeight: 800, color: '#e2e8f0', marginTop: 4, padding: 0 }}
                        value={size}
                        onChange={e => { setSize(e.target.value); setCommand(''); }}
                        placeholder="0"
                    />
                </div>
            </div>

            {/* ── RISK CONTROLS ───────────────────────────────────── */}
            <div style={{ padding: '16px 20px', borderBottom: divider }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                        Risk: <span style={{ color: '#A6FF4D' }}>${riskAmount.toFixed(0)}</span>
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[100, 250, 500].map(amt => (
                            <button key={amt} onClick={() => setRiskAmount(amt)} style={{
                                ...mono, fontSize: 10, fontWeight: 800, padding: '5px 10px',
                                background: 'rgba(166,255,77,0.08)', border: '1px solid rgba(166,255,77,0.2)',
                                color: '#A6FF4D', cursor: 'pointer', letterSpacing: '0.04em',
                            }}>${amt}</button>
                        ))}
                        <button onClick={() => setRiskAmount(safeMaxRisk > 0 ? safeMaxRisk : 100)} style={{
                            ...mono, fontSize: 10, fontWeight: 800, padding: '5px 10px',
                            background: 'rgba(166,255,77,0.08)', border: '1px solid rgba(166,255,77,0.2)',
                            color: '#A6FF4D', cursor: 'pointer', letterSpacing: '0.04em',
                        }}>MAX</button>
                    </div>
                </div>
                <input
                    id="riskSlider"
                    title="Risk Amount"
                    type="range"
                    style={{ width: '100%', accentColor: '#A6FF4D', cursor: 'pointer' }}
                    min="10"
                    max={Math.max(1000, safeMaxRisk * 1.5, riskAmount)}
                    step="10"
                    value={riskAmount}
                    onChange={e => setRiskAmount(Number(e.target.value))}
                />
            </div>

            {/* ── READOUT + VERDICT ───────────────────────────────── */}
            <AnimatePresence>
                {entryNum > 0 && sizeNum > 0 && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                        {/* Readout board */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: divider }}>
                            <div style={{ padding: '16px 20px', borderRight: divider, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={lbl}>Stop Loss</span>
                                <span style={{ ...mono, fontSize: 26, fontWeight: 800, color: '#ff4757', letterSpacing: '-0.03em', lineHeight: 1 }}>
                                    {sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: sl < 100 ? 5 : 2 })}
                                </span>
                                <span style={{ ...mono, fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                                    {sizeNum.toLocaleString()} {assetType === 'futures' ? 'contracts' : 'units'}
                                </span>
                            </div>
                            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={lbl}>Notional Value</span>
                                <span style={{ ...mono, fontSize: 26, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.03em', lineHeight: 1 }}>
                                    ${notional?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                                <span style={{ ...mono, fontSize: 10, color: '#4b5563', marginTop: 2 }}>
                                    TP: {tp.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Verdict */}
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 20px', borderBottom: divider,
                            background: approved ? 'rgba(166,255,77,0.04)' : 'rgba(255,71,87,0.06)',
                            borderLeft: `3px solid ${approved ? '#A6FF4D' : '#ff4757'}`,
                        }}>
                            {approved
                                ? <ShieldCheck size={22} color="#A6FF4D" style={{ flexShrink: 0, marginTop: 1 }} />
                                : <AlertTriangle size={22} color="#ff4757" style={{ flexShrink: 0, marginTop: 1 }} />}
                            <div>
                                <span style={{ ...mono, fontSize: 13, fontWeight: 800, color: approved ? '#A6FF4D' : '#ff4757', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>
                                    {verdictTitle}
                                </span>
                                <span style={{ ...mono, fontSize: 11, color: '#8b949e', display: 'block', marginTop: 3, lineHeight: 1.5 }}>{verdictDesc}</span>
                                {optionalNotice && (
                                    <span style={{ ...mono, fontSize: 10, color: '#EAB308', display: 'block', marginTop: 4 }}>{optionalNotice}</span>
                                )}
                            </div>
                        </div>

                        {/* Log Trade button */}
                        <div style={{ padding: '16px 20px' }}>
                            <button
                                disabled={!approved}
                                onClick={savePlan}
                                style={{
                                    ...mono, width: '100%', padding: '16px', border: 'none', cursor: approved ? 'pointer' : 'not-allowed',
                                    background: approved ? '#A6FF4D' : '#1a1c24', color: approved ? '#000' : '#4b5563',
                                    fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {approved
                                    ? <><ShieldCheck size={16} /> Log Trade Plan</>
                                    : <><AlertTriangle size={16} /> Fix Errors to Log</>}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
