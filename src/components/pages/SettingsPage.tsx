'use client';

import styles from './SettingsPage.module.css';
import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { Settings2, DollarSign, ShieldAlert, Check, RefreshCw, Building2 } from 'lucide-react';

interface PropFirmPreset {
    name: string;
    short: string;
    dailyPct: number;   // daily loss limit as % of balance
    maxDrawPct: number; // overall max drawdown %
    color: string;
    propFirmType?: '2-Step Evaluation' | '1-Step Evaluation' | 'Instant Funding';
    drawdownType?: 'EOD' | 'Trailing' | 'Static';
}

const PROP_FIRMS: PropFirmPreset[] = [
    { name: 'Funding Pips', short: 'FPips', dailyPct: 5, maxDrawPct: 10, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'Tradeify Crypto Eval', short: 'TrdfyE', dailyPct: 3, maxDrawPct: 6, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'EOD' },
    { name: 'Tradeify Crypto Instant', short: 'TrdfyI', dailyPct: 3, maxDrawPct: 6, color: '#A6FF4D', propFirmType: 'Instant Funding', drawdownType: 'Static' },
    { name: 'FTMO', short: 'FTMO', dailyPct: 5, maxDrawPct: 10, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'The5%ers', short: '5%ers', dailyPct: 4, maxDrawPct: 6, color: '#A6FF4D', propFirmType: '2-Step Evaluation', drawdownType: 'Static' },
    { name: 'Custom', short: 'Own', dailyPct: 0, maxDrawPct: 0, color: '#888', drawdownType: 'EOD' },
];

export default function SettingsPage() {
    const { account, updateAccount, resetTodaySession, resetOnboarding } = useAppStore();
    const [saved, setSaved] = useState(false);
    const [selectedFirm, setSelectedFirm] = useState<string | null>(null);

    const startBalVal = account.startingBalance || account.balance || 10000;
    const initialDrawPct = account.maxDrawdownLimit ? (account.maxDrawdownLimit / startBalVal) * 100 : 10;

    const [balance, setBalance] = useState(String(account.balance));
    const [startingBalance, setStartingBalance] = useState(String(startBalVal));
    const [dailyLimit, setDailyLimit] = useState(String(account.dailyLossLimit));
    const [maxRisk, setMaxRisk] = useState(String(account.maxRiskPercent));
    const [assetType, setAssetType] = useState(account.assetType);
    const [propFirm, setPropFirm] = useState(account.propFirm || '');
    const [propFirmType, setPropFirmType] = useState(account.propFirmType || 'Instant Funding');
    const [drawdownType, setDrawdownType] = useState(account.drawdownType || 'EOD');
    const [maxDrawdownPct, setMaxDrawdownPct] = useState(String(initialDrawPct.toFixed(1)));

    const handleSave = () => {
        // Calculate max drawdown limit USD based on %
        const bal = parseFloat(balance) || account.balance;
        const startBal = parseFloat(startingBalance) || bal;
        const maxDrawUSD = (startBal * (parseFloat(maxDrawdownPct) || 0)) / 100;

        let leverage = account.leverage || 2;
        if (propFirm?.includes('Tradeify Crypto')) {
            if (propFirmType.includes('Evaluation')) leverage = 5;
            else if (propFirmType === 'Instant Funding') leverage = 2;
        }

        updateAccount({
            balance: bal,
            dailyLossLimit: parseFloat(dailyLimit) || account.dailyLossLimit,
            maxDrawdownLimit: maxDrawUSD,
            maxRiskPercent: parseFloat(maxRisk) || account.maxRiskPercent,
            assetType,
            propFirm: propFirm === 'Custom' ? '' : propFirm,
            propFirmType: propFirmType as '1-Step Evaluation' | '2-Step Evaluation' | 'Instant Funding',
            drawdownType: drawdownType as 'EOD' | 'Trailing' | 'Static',
            leverage,
            startingBalance: startBal,
            highestBalance: Math.max(startBal, bal, account.highestBalance || 0),
            isConsistencyActive: propFirmType === 'Instant Funding' || propFirm?.includes('Instant'),
            minHoldTimeSec: propFirm?.includes('Tradeify') ? 20 : 0,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const applyFirm = (firm: PropFirmPreset) => {
        if (firm.dailyPct === 0) return; // custom
        const bal = parseFloat(balance) || account.balance;
        const dl = Math.round((bal * firm.dailyPct) / 100);
        setDailyLimit(String(dl));
        setMaxRisk(String((firm.dailyPct / 5).toFixed(1))); // per-trade = daily / 5
        setSelectedFirm(firm.name);
        setPropFirm(firm.name);
        if (firm.propFirmType) setPropFirmType(firm.propFirmType);
        if (firm.drawdownType) setDrawdownType(firm.drawdownType);
        setMaxDrawdownPct(String(firm.maxDrawPct));
    };

    const balNum = parseFloat(balance) || 0;

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div className={styles.pageIcon}><Settings2 size={18} /></div>
                <div>
                    <h1 className="text-subheading">Settings</h1>
                    <p className="text-caption">Your trading rules & account config</p>
                </div>
            </div>

            {/* ─── Prop Firm Presets ─── */}
            <div>
                <div className="section-header">
                    <span className="section-title">Prop Firm Presets</span>
                    <Building2 size={14} className="text-muted" />
                </div>
                <div className={styles.firmGrid}>
                    {PROP_FIRMS.map(firm => (
                        <button
                            key={firm.name}
                            className={`${styles.firmCard} ${selectedFirm === firm.name ? styles.firmCardActive : ''} ${firm.dailyPct === 0 ? styles.firmCardCustom : ''}`}
                            onClick={() => applyFirm(firm)}
                            title={firm.name}
                        >
                            <span className={styles.firmShort}>{firm.short}</span>
                            {firm.dailyPct > 0 ? (
                                <span className={styles.firmPct}>{firm.dailyPct}%/day</span>
                            ) : (
                                <span className={styles.firmPct}>custom</span>
                            )}
                            {selectedFirm === firm.name && <div className={styles.firmCheck}><Check size={9} strokeWidth={3} /></div>}
                        </button>
                    ))}
                </div>
                {selectedFirm && selectedFirm !== 'Custom' && (
                    <div className="p-3 mt-4 bg-[rgba(166,255,77,0.05)] border border-[var(--accent)] rounded-lg">
                        <p className="text-[13px] text-[#fff]">
                            Activated <strong>{selectedFirm}</strong> configuration.
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">
                            Daily Limit: ${dailyLimit} · Max Risk/Trade: {maxRisk}% · Drawdown Mode: {drawdownType}
                        </p>
                        {selectedFirm.includes('Tradeify') && (
                            <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-accent/80 font-bold uppercase tracking-wider">
                                ⚡ Tradeify Crypto Rules: 0.04% Fee · 20s Min Hold · 5x BTC/ETH · 2x Alts
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ─── Account ─── */}
            <div className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <DollarSign size={14} className="text-success" />
                    <span className={styles.sectionTitle}>Account</span>
                </div>

                <div className="field-group">
                    <label className="field-label">Current Balance (USD)</label>
                    <input className="field-input" type="number" inputMode="decimal"
                        value={balance} onChange={e => setBalance(e.target.value)}
                        placeholder="10000" id="settings-balance" />
                    <span className="field-hint">Your live, current equity</span>
                </div>

                <div className="field-group">
                    <label className="field-label">Starting Balance (USD)</label>
                    <input className="field-input" type="number" inputMode="decimal"
                        value={startingBalance} onChange={e => setStartingBalance(e.target.value)}
                        placeholder="10000" id="settings-start-balance" />
                    <span className="field-hint">Initial funding amount (crucial for Trailing Drawdown calculation)</span>
                </div>

                <div className="field-group">
                    <label className="field-label">Asset Type (default)</label>
                    <div className={styles.assetBtns}>
                        {(['crypto', 'forex', 'futures', 'stocks'] as const).map(type => (
                            <button key={type} className={`${styles.assetBtn} ${assetType === type ? styles.assetBtnActive : ''}`}
                                onClick={() => setAssetType(type)} id={`asset-type-${type}`}>
                                {type === 'crypto' ? '₿ Crypto' : type === 'forex' ? '💱 Forex' : type === 'futures' ? '📈 Futures' : '📊 Stocks'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── Risk Rules ─── */}
            <div className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <ShieldAlert size={14} className="text-danger" />
                    <span className={styles.sectionTitle}>Risk Rules</span>
                </div>

                <div className="field-group">
                    <label className="field-label">Daily Loss Limit (USD)</label>
                    <input className="field-input" type="number" inputMode="decimal"
                        value={dailyLimit} onChange={e => setDailyLimit(e.target.value)}
                        placeholder="500" id="settings-daily-limit" />
                    <span className="field-hint">
                        {balNum > 0 && dailyLimit
                            ? `${((parseFloat(dailyLimit) / balNum) * 100).toFixed(2)}% of your $${balNum.toLocaleString()} balance`
                            : 'Max loss allowed per trading day'}
                    </span>
                </div>

                <div className="field-group">
                    <label className="field-label">Max Risk Per Trade (%)</label>
                    <input className="field-input" type="number" inputMode="decimal"
                        value={maxRisk} onChange={e => setMaxRisk(e.target.value)}
                        placeholder="1" id="settings-max-risk" />
                    <span className="field-hint">
                        {balNum > 0 && maxRisk
                            ? `≈ $${((balNum * parseFloat(maxRisk)) / 100).toFixed(0)} per trade`
                            : 'Risk per individual trade'}
                    </span>
                </div>

                <div className={styles.ruleRow}>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleLabel}>Max trades/day (at max risk)</span>
                        <span className={styles.ruleValue}>
                            {balNum > 0 && dailyLimit && maxRisk
                                ? Math.floor(parseFloat(dailyLimit) / ((balNum * parseFloat(maxRisk)) / 100))
                                : '—'}
                        </span>
                    </div>
                    <div className={styles.ruleItem}>
                        <span className={styles.ruleLabel}>Safe size remaining today</span>
                        <span className={`${styles.ruleValue} text-accent`}>
                            {balNum > 0 && maxRisk
                                ? `$${((balNum * parseFloat(maxRisk)) / 100).toFixed(0)}`
                                : '—'}
                        </span>
                    </div>
                </div>

                <button className={`btn btn--ghost btn--sm ${styles.resetDayBtn}`} onClick={resetTodaySession} id="reset-day-btn">
                    <RefreshCw size={12} /> Reset Today&#39;s Session
                </button>
            </div>

            {/* Save */}
            <button className={`btn ${saved ? 'btn--success' : 'btn--primary'} btn--full`} onClick={handleSave} id="save-settings-btn">
                {saved ? <><Check size={16} /> Saved!</> : <><Check size={16} /> Save Settings</>}
            </button>

            {/* Reset onboarding */}
            <button className={`btn btn--ghost btn--sm ${styles.resetWizardBtn}`} onClick={resetOnboarding} id="reset-onboarding-btn">
                ↺ Reset &amp; re-run setup wizard
            </button>
        </div>
    );
}
