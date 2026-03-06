'use client';

import styles from './CalculatorPage.module.css';
import { useState, useCallback, useMemo } from 'react';
import { useAppStore, getFuturesSpec, calcPositionSize, getESTFull } from '@/store/appStore';
import { AlertTriangle, Save, ShieldCheck, Zap, Search } from 'lucide-react';
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
        <div className={styles.page}>
            {/* HUD Top Bar */}
            <div className={styles.topStats}>
                <div className={styles.statBox}>
                    <span className={styles.statLabel}>BALANCE</span>
                    <span className={styles.statValue}>${account.balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
                <div className={styles.statBox}>
                    <span className={styles.statLabel}>DAILY LOSS LEFT</span>
                    <span className={`${styles.statValue} ${remainingToday < (account.dailyLossLimit * 0.2) ? 'text-danger' : 'text-success'}`}>
                        ${remainingToday.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                </div>
            </div>

            {/* Command Line Parser */}
            <div className={styles.commandRow}>
                <div className="flex items-center gap-2">
                    <Zap size={22} className="text-accent" />
                    <div className="flex rounded-md overflow-hidden border border-white/10 text-[10px] font-bold">
                        <button
                            className={`px-3 py-1 transition-colors ${!isShort ? 'bg-accent text-black' : 'bg-white/5 text-white/40'}`}
                            onClick={() => setIsShort(false)}
                        >
                            LONG
                        </button>
                        <button
                            className={`px-3 py-1 transition-colors ${isShort ? 'bg-danger text-white' : 'bg-white/5 text-white/40'}`}
                            onClick={() => setIsShort(true)}
                        >
                            SHORT
                        </button>
                    </div>
                </div>
                <input
                    className={styles.commandInput}
                    placeholder="Fast HUD: e.g. SOL 91.65 800"
                    value={command}
                    onChange={e => handleCommandChange(e.target.value)}
                    autoFocus
                    autoComplete="off"
                />
            </div>

            {/* Manual Edit Grid */}
            <div className={styles.inputsGrid}>
                <div className={styles.inputCell} style={{ position: 'relative' }}>
                    <label htmlFor="assetInput">Asset</label>
                    <div className="relative">
                        <input
                            id="assetInput"
                            className={styles.hugeInput}
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
                                    transition={{ duration: 0.15, ease: "easeOut" }}
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
                                            Close Browser
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
                <div className={styles.inputCell}>
                    <label htmlFor="entryInput">Entry</label>
                    <input id="entryInput" className={styles.hugeInput} type="number" inputMode="decimal" value={entry} onChange={e => { setEntry(e.target.value); setCommand(''); }} placeholder="0.00" />
                </div>
                <div className={styles.inputCell}>
                    <label htmlFor="sizeInput">Size</label>
                    <input id="sizeInput" className={styles.hugeInput} type="number" inputMode="decimal" value={size} onChange={e => { setSize(e.target.value); setCommand(''); }} placeholder="0" />
                </div>
            </div>

            {/* Risk Selection */}
            <div className={styles.riskSection}>
                <div className={styles.riskHeader}>
                    <label htmlFor="riskSlider">Risk Slider: <span className="text-accent">${riskAmount.toFixed(0)}</span></label>
                    <div className={styles.quickRisk}>
                        {[100, 250, 500].map(amt => (
                            <button key={amt} className={styles.quickBtn} onClick={() => setRiskAmount(amt)}>+${amt}</button>
                        ))}
                        <button className={styles.quickBtn} onClick={() => setRiskAmount(safeMaxRisk > 0 ? safeMaxRisk : 100)}>MAX</button>
                    </div>
                </div>
                <input
                    id="riskSlider"
                    title="Risk Amount"
                    type="range"
                    className={styles.slider}
                    min="10"
                    max={Math.max(1000, safeMaxRisk * 1.5, riskAmount)}
                    step="10"
                    value={riskAmount}
                    onChange={e => setRiskAmount(Number(e.target.value))}
                />
            </div>

            {/* Instant Computations Readout */}
            <AnimatePresence>
                {entryNum > 0 && sizeNum > 0 && (
                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className={styles.readoutBoard}>
                            <div className={styles.readoutCol}>
                                <span className={styles.readoutTitle}>STOP LOSS</span>
                                <span className={`${styles.readoutBig} text-danger`}>
                                    {sl.toLocaleString(undefined, { minimumFractionDigits: sl < 100 ? 2 : 2, maximumFractionDigits: sl < 100 ? 5 : 2 })}
                                </span>
                                <span className={styles.readoutDetail}>Size: {sizeNum.toLocaleString()} {assetType === 'futures' ? 'cnt' : 'units'}</span>
                            </div>
                            <div className={styles.readoutCol}>
                                <span className={styles.readoutTitle}>NOTIONAL (VAL)</span>
                                <span className={`${styles.readoutBig}`}>
                                    ${notional?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                                <span className={styles.readoutDetail}>TAKE PROFIT: {tp.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {/* Trade Guard Verdict */}
                        <div className={`${styles.verdictBox} ${approved ? styles.verdictSafe : styles.verdictDanger}`}>
                            {approved ? <ShieldCheck size={28} /> : <AlertTriangle size={28} />}
                            <div>
                                <h4 className={`${styles.verdictText} mb-[2px]`}>{verdictTitle}</h4>
                                <p className="text-[12px] opacity-90">{verdictDesc}</p>
                                {optionalNotice && (
                                    <p className="text-[11px] text-[var(--color-warning)] mt-1 font-semibold">ℹ {optionalNotice}</p>
                                )}
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            className={`btn btn--full ${styles.saveBtn} ${approved ? 'btn--primary' : ''} mt-4`}
                            disabled={!approved}
                            onClick={savePlan}
                        >
                            {approved ? <><Save size={18} /> SAVE HUD PLAN</> : <><AlertTriangle size={18} /> FIX ERRORS TO SAVE</>}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
