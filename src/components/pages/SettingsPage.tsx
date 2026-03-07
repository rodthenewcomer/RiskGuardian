'use client';

import styles from './SettingsPage.module.css';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, PROP_FIRMS, type PropFirmPreset } from '@/store/appStore';
import { scanViolations, type TradeViolation } from '@/lib/tradeViolations';
import {
    Settings2, DollarSign, ShieldAlert, Check, RefreshCw, Building2,
    Bitcoin, LineChart, CandlestickChart, CircleDollarSign,
    Wifi, WifiOff, Loader2, Upload, FileText, RotateCcw,
    Brain, Download, Trash2, AlertTriangle, Zap,
} from 'lucide-react';
import { dxConnect, dxGetMetrics, dxGetHistory, dxGetPositions } from '@/lib/dxtradeSync';

const getFirmLogo = (name: string) => {
    if (name.includes('Tradeify')) return 'https://www.google.com/s2/favicons?domain=tradeify.co&sz=128';
    if (name.includes('Funding Pips')) return 'https://www.google.com/s2/favicons?domain=fundingpips.com&sz=128';
    if (name.includes('FTMO')) return 'https://www.google.com/s2/favicons?domain=ftmo.com&sz=128';
    if (name.includes('5%ers')) return 'https://www.google.com/s2/favicons?domain=the5ers.com&sz=128';
    return null;
};

const container = { visible: { transition: { staggerChildren: 0.07 } } };
const sectionVariant = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

export default function SettingsPage() {
    const {
        account, updateAccount, resetTodaySession, resetOnboarding,
        dxtradeConfig, dxtradeLastSync, setDXTradeConfig, setDXTradeLastSync,
        setTrades, trades, autoSync,
    } = useAppStore();

    const [saved, setSaved] = useState(false);
    const [selectedFirm, setSelectedFirm] = useState<string | null>(account.propFirm || null);

    // DXTrade form
    const [showDxForm, setShowDxForm] = useState(false);
    const [dxServer, setDxServer] = useState(dxtradeConfig?.server ?? 'dx.tradeifycrypto.co');
    const [dxUsername, setDxUsername] = useState(dxtradeConfig?.username ?? '');
    const [dxDomain, setDxDomain] = useState(dxtradeConfig?.domain ?? 'default');
    const [dxPassword, setDxPassword] = useState('');
    const [dxBusy, setDxBusy] = useState(false);
    const [dxProgress, setDxProgress] = useState('');
    const [dxError, setDxError] = useState('');

    // PDF import
    const pdfRef = useRef<HTMLInputElement>(null);
    const [pdfBusy, setPdfBusy] = useState(false);
    const [pdfMsg, setPdfMsg] = useState('');
    const [violations, setViolations] = useState<TradeViolation[]>([]);

    // Danger zone
    const [clearConfirm, setClearConfirm] = useState(false);

    // Account fields
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
    const [maxTradesPerDay, setMaxTradesPerDay] = useState(String(account.maxTradesPerDay ?? ''));

    // Behavioral guards
    const [consecLossEnabled, setConsecLossEnabled] = useState(!!(account.maxConsecutiveLosses));
    const [maxConsecLosses, setMaxConsecLosses] = useState(String(account.maxConsecutiveLosses ?? '3'));
    const [coolDownEnabled, setCoolDownEnabled] = useState(!!(account.coolDownMinutes));
    const [coolDownMins, setCoolDownMins] = useState(String(account.coolDownMinutes ?? '15'));

    // ── DXTrade ─────────────────────────────────────────────────────
    async function handleDXConnect() {
        if (!dxUsername || !dxPassword) { setDxError('Username and password required'); return; }
        setDxBusy(true); setDxError(''); setDxProgress('');
        try {
            const result = await dxConnect(dxServer, dxUsername, dxDomain, dxPassword, setDxProgress);
            setDXTradeConfig({ server: dxServer, username: dxUsername, domain: dxDomain, accountCode: result.accountCode, token: result.token, connectedAt: new Date().toISOString() });
            setDXTradeLastSync(new Date().toISOString());
            const dxIds = new Set([...result.trades, ...result.positions].map(t => t.id));
            const manual = trades.filter(t => !dxIds.has(t.id) && !t.id.startsWith('dxtrade-'));
            setTrades([...result.positions, ...result.trades, ...manual]);
            updateAccount({ balance: result.balance, startingBalance: result.balance });
            setBalance(String(result.balance));
            setDxProgress(`Connected! ${result.trades.length} trades synced.`);
            setShowDxForm(false);
        } catch (e) {
            setDxError(e instanceof Error ? e.message : 'Connection failed. Check credentials and server URL.');
        } finally { setDxBusy(false); }
    }

    async function handleDXSync() {
        if (!dxtradeConfig) return;
        setDxBusy(true); setDxError(''); setDxProgress('Syncing live data…');
        try {
            const config = { server: dxtradeConfig.server, token: dxtradeConfig.token, accountCode: dxtradeConfig.accountCode, username: dxtradeConfig.username };
            const [metrics, history, positions] = await Promise.all([
                dxGetMetrics(config),
                dxGetHistory(config, dxtradeLastSync ?? undefined),
                dxGetPositions(config),
            ]);
            const manual = trades.filter(t => !t.id.startsWith('dxtrade-'));
            setTrades([...positions, ...history, ...manual]);
            updateAccount({ balance: metrics.balance });
            setBalance(String(metrics.balance));
            setDXTradeLastSync(new Date().toISOString());
            setDxProgress(`Synced. ${history.length} new trades · Balance $${metrics.balance.toLocaleString()}`);
        } catch (e) {
            setDxError(e instanceof Error ? e.message : 'Sync failed. Token may have expired — reconnect.');
        } finally { setDxBusy(false); }
    }

    async function handlePDFImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!e.target) return;
        (e.target as HTMLInputElement).value = '';
        if (!file) return;
        setPdfBusy(true); setPdfMsg('Parsing statement…');
        try {
            const { parseTradeifyPDF } = await import('@/lib/parseTradeifyPDF');
            const result = await parseTradeifyPDF(file);
            if (result.error) { setPdfMsg(`Error: ${result.error}`); return; }

            // ── Merge: keep existing non-PDF trades + old PDF trades not in this upload
            // This allows incremental uploads (e.g. upload Mar 7-11 without losing Feb 27-Mar 6)
            const nonPdf    = trades.filter(t => !t.id.startsWith('tradeify-'));
            const oldPdf    = trades.filter(t => t.id.startsWith('tradeify-'));
            const newIds    = new Set(result.trades.map(t => t.id));
            const oldKept   = oldPdf.filter(t => !newIds.has(t.id));   // old trades not overwritten
            const newTrades = result.trades.map(t => ({ ...t, note: '' }));
            setTrades([...newTrades, ...oldKept, ...nonPdf]);

            // ── Auto-update balance: PDF closing balance wins; fallback = computed ─
            // autoSync() is already called inside setTrades(), so balance/highestBalance
            // are already recomputed. If PDF has an explicit closing balance, apply it
            // on top (it's the ground truth from the broker).
            if (result.closingBalance) {
                updateAccount({ balance: result.closingBalance });
                setBalance(String(result.closingBalance));
            } else {
                // Read the just-updated computed balance from store
                const computed = useAppStore.getState().account.balance;
                if (computed > 0) setBalance(String(computed));
            }

            // ── Violation scan on the full merged trade set ───────────────────
            const allTrades = [...newTrades, ...oldKept, ...nonPdf];
            const found = scanViolations(allTrades, account);
            setViolations(found);

            // ── Build message ─────────────────────────────────────────────────
            const added    = newTrades.length;
            const kept     = oldKept.length;
            const coverage = result.coverageStart && result.coverageEnd
                ? ` · ${result.coverageStart} → ${result.coverageEnd}`
                : '';
            const finalBal = useAppStore.getState().account.balance;
            const balMsg   = finalBal > 0 ? ` · Balance $${finalBal.toLocaleString()}` : '';
            const warnMsg  = found.length > 0 ? ` · ${found.filter(v => v.severity === 'breach').length} violations found` : ' · No violations';
            setPdfMsg(`${added} imported, ${kept} kept${coverage}${balMsg}${warnMsg}`);
        } catch (err) {
            setPdfMsg(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally { setPdfBusy(false); }
    }

    function handleExportCSV() {
        if (trades.length === 0) return;
        const headers = ['id', 'asset', 'assetType', 'entry', 'stopLoss', 'takeProfit', 'lotSize', 'riskUSD', 'rewardUSD', 'rr', 'outcome', 'pnl', 'createdAt', 'closedAt', 'isShort'] as const;
        const rows = trades.map(t => headers.map(h => {
            const v = t[h as keyof typeof t];
            return v === undefined ? '' : String(v);
        }).join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `riskguardian-trades-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    const handleSave = () => {
        const bal = parseFloat(balance) || account.balance;
        const startBal = parseFloat(startingBalance) || bal;
        const maxDrawUSD = (startBal * (parseFloat(maxDrawdownPct) || 0)) / 100;
        let leverage = account.leverage || 2;
        if (propFirm?.includes('Tradeify')) {
            if (propFirmType.includes('Evaluation')) leverage = 5;
            else if (propFirmType === 'Instant Funding') leverage = 2;
        }
        updateAccount({
            balance: bal,
            dailyLossLimit: parseFloat(dailyLimit) || account.dailyLossLimit,
            maxDrawdownLimit: maxDrawUSD,
            maxRiskPercent: parseFloat(maxRisk) || account.maxRiskPercent,
            assetType,
            propFirm: propFirm === 'Custom (Build your own)' ? '' : propFirm,
            propFirmType: propFirmType as '1-Step Evaluation' | '2-Step Evaluation' | 'Instant Funding',
            drawdownType: drawdownType as 'EOD' | 'Trailing' | 'Static',
            leverage,
            startingBalance: startBal,
            highestBalance: Math.max(startBal, bal, account.highestBalance || 0),
            isConsistencyActive: propFirmType === 'Instant Funding' || propFirm?.includes('Instant'),
            minHoldTimeSec: propFirm?.includes('Tradeify') ? 20 : 0,
            maxTradesPerDay: maxTradesPerDay ? parseInt(maxTradesPerDay) : undefined,
            maxConsecutiveLosses: consecLossEnabled ? parseInt(maxConsecLosses) || 3 : undefined,
            coolDownMinutes: coolDownEnabled ? parseInt(coolDownMins) || 15 : undefined,
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const applyFirm = (firm: PropFirmPreset) => {
        if (firm.dailyPct === 0) return;
        const bal = parseFloat(balance) || account.balance;
        const dl = Math.round((bal * firm.dailyPct) / 100);
        setDailyLimit(String(dl));
        setMaxRisk(String((firm.dailyPct / 5).toFixed(1)));
        setSelectedFirm(firm.name);
        setPropFirm(firm.name);
        if (firm.propFirmType) setPropFirmType(firm.propFirmType);
        if (firm.drawdownType) setDrawdownType(firm.drawdownType);
        setMaxDrawdownPct(String(firm.maxDrawPct));
    };

    const balNum = parseFloat(balance) || 0;
    const activeFirm = PROP_FIRMS.find(f => f.name === selectedFirm);

    return (
        <motion.div className={styles.page} variants={container} initial="hidden" animate="visible">

            {/* ── Header ─────────────────────────────────────────── */}
            <motion.div variants={sectionVariant} className={styles.pageHeader}>
                <div className={styles.pageIcon}><Settings2 size={18} /></div>
                <div>
                    <h1 className="text-subheading">Settings</h1>
                    <p className="text-caption">Risk rules, account & live connection</p>
                </div>
                <motion.button
                    onClick={handleSave}
                    className={`btn ${saved ? 'btn--success' : 'btn--primary'} btn--sm`}
                    style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}
                    whileTap={{ scale: 0.94 }}
                >
                    {saved ? <><Check size={13} /> Saved!</> : <><Check size={13} /> Save</>}
                </motion.button>
            </motion.div>

            {/* ── 1. Prop Firm Presets ────────────────────────────── */}
            <motion.div variants={sectionVariant}>
                <div className={styles.sectionLabel}>
                    <Building2 size={13} />
                    <span>Prop Firm</span>
                </div>
                <div className={styles.firmRail}>
                    {PROP_FIRMS.filter(f => f.dailyPct > 0).map(firm => (
                        <motion.button
                            key={firm.name}
                            className={`${styles.firmChip} ${selectedFirm === firm.name ? styles.firmChipActive : ''}`}
                            onClick={() => applyFirm(firm)}
                            whileTap={{ scale: 0.93 }}
                        >
                            {getFirmLogo(firm.name) && (
                                <img src={getFirmLogo(firm.name)!} alt="" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
                            )}
                            <span className={styles.firmChipName}>{firm.short}</span>
                            <span className={styles.firmChipType}>
                                {firm.propFirmType === '1-Step Evaluation' ? '1S'
                                    : firm.propFirmType === '2-Step Evaluation' ? '2S'
                                        : 'IF'}
                            </span>
                        </motion.button>
                    ))}
                    <motion.button
                        className={`${styles.firmChip} ${styles.firmChipCustom} ${selectedFirm === 'Custom (Build your own)' ? styles.firmChipActive : ''}`}
                        onClick={() => { setSelectedFirm('Custom (Build your own)'); setPropFirm('Custom (Build your own)'); }}
                        whileTap={{ scale: 0.93 }}
                    >
                        <Settings2 size={12} style={{ flexShrink: 0 }} />
                        <span className={styles.firmChipName}>Custom</span>
                    </motion.button>
                </div>

                <AnimatePresence>
                    {activeFirm && (
                        <motion.div
                            className={styles.firmActiveBanner}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div className={styles.firmBannerRow}>
                                <span className={styles.firmBannerName}>{activeFirm.name}</span>
                                <span className={styles.firmBannerBadge}>{propFirmType}</span>
                            </div>
                            <div className={styles.firmBannerStats}>
                                <span>Daily <strong>${dailyLimit}</strong></span>
                                <span>Drawdown <strong>{drawdownType} {activeFirm.maxDrawPct}%</strong></span>
                                {activeFirm.name.includes('Tradeify') && <span>Hold <strong>20s min</strong></span>}
                                {propFirmType === 'Instant Funding' && <span>Consistency <strong>≤20%</strong></span>}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ── 2. Account & Balance ────────────────────────────── */}
            <motion.div variants={sectionVariant} className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <DollarSign size={14} style={{ color: '#22c55e' }} />
                    <span className={styles.sectionTitle}>Account & Balance</span>
                </div>

                <div className={styles.inputGrid}>
                    <div className="field-group" style={{ marginBottom: 0 }}>
                        <label className="field-label">Current Balance</label>
                        <input className="field-input" type="number" inputMode="decimal"
                            value={balance} onChange={e => setBalance(e.target.value)} placeholder="10000" />
                    </div>
                    <div className="field-group" style={{ marginBottom: 0 }}>
                        <label className="field-label">Starting Balance</label>
                        <input className="field-input" type="number" inputMode="decimal"
                            value={startingBalance} onChange={e => setStartingBalance(e.target.value)} placeholder="10000" />
                    </div>
                </div>

                <div className="field-group" style={{ marginBottom: 0 }}>
                    <label className="field-label">Default Asset Type</label>
                    <div className={styles.assetBtns}>
                        {(['crypto', 'forex', 'futures', 'stocks'] as const).map(type => (
                            <button key={type}
                                className={`${styles.assetBtn} ${assetType === type ? styles.assetBtnActive : ''}`}
                                onClick={() => setAssetType(type)}>
                                {type === 'crypto' ? <><Bitcoin size={12} /> Crypto</> :
                                    type === 'forex' ? <><CircleDollarSign size={12} /> Forex</> :
                                        type === 'futures' ? <><LineChart size={12} /> Futures</> :
                                            <><CandlestickChart size={12} /> Stocks</>}
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* ── 3. Risk Rules ───────────────────────────────────── */}
            <motion.div variants={sectionVariant} className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <ShieldAlert size={14} style={{ color: '#f87171' }} />
                    <span className={styles.sectionTitle}>Risk Rules</span>
                </div>

                <div className={styles.inputGrid}>
                    <div className="field-group" style={{ marginBottom: 0 }}>
                        <label className="field-label">Daily Loss Limit</label>
                        <input className="field-input" type="number" inputMode="decimal"
                            value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} placeholder="300" />
                        {balNum > 0 && dailyLimit && (
                            <span className="field-hint">{((parseFloat(dailyLimit) / balNum) * 100).toFixed(2)}% of balance</span>
                        )}
                    </div>
                    <div className="field-group" style={{ marginBottom: 0 }}>
                        <label className="field-label">Max Risk / Trade</label>
                        <input className="field-input" type="number" inputMode="decimal"
                            value={maxRisk} onChange={e => setMaxRisk(e.target.value)} placeholder="1" />
                        {balNum > 0 && maxRisk && (
                            <span className="field-hint">≈ ${((balNum * parseFloat(maxRisk)) / 100).toFixed(0)} per trade</span>
                        )}
                    </div>
                </div>

                <div className="field-group" style={{ marginBottom: 0 }}>
                    <label className="field-label">Max Trades / Day</label>
                    <input className="field-input" type="number" inputMode="numeric"
                        value={maxTradesPerDay} onChange={e => setMaxTradesPerDay(e.target.value)} placeholder="e.g. 3" />
                    {!maxTradesPerDay && balNum > 0 && dailyLimit && maxRisk && (
                        <span className="field-hint">
                            Min possible: {Math.floor(parseFloat(dailyLimit) / ((balNum * parseFloat(maxRisk)) / 100))} trades at max risk
                        </span>
                    )}
                </div>
            </motion.div>

            {/* ── 4. Behavioral Guards (NEW) ──────────────────────── */}
            <motion.div variants={sectionVariant} className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <Brain size={14} style={{ color: '#a78bfa' }} />
                    <span className={styles.sectionTitle}>Behavioral Guards</span>
                    <span className={styles.newBadge}>NEW</span>
                </div>
                <p className={styles.guardSubtitle}>Circuit breakers that protect you from emotional trading.</p>

                {/* Consecutive loss stop */}
                <div className={styles.guardRow}>
                    <div className={styles.guardInfo}>
                        <span className={styles.guardLabel}>Consecutive Loss Stop</span>
                        <span className={styles.guardDesc}>Lock trading after N losses in a row</span>
                    </div>
                    <button
                        className={`${styles.toggle} ${consecLossEnabled ? styles.toggleOn : ''}`}
                        onClick={() => setConsecLossEnabled(v => !v)}
                        aria-label="Toggle consecutive loss stop"
                    />
                </div>
                <AnimatePresence>
                    {consecLossEnabled && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div className="field-group" style={{ marginBottom: 0, marginTop: 8 }}>
                                <label className="field-label">Max Consecutive Losses</label>
                                <input className="field-input" type="number" inputMode="numeric"
                                    value={maxConsecLosses} onChange={e => setMaxConsecLosses(e.target.value)}
                                    placeholder="3" min="1" max="10" />
                                <span className="field-hint">Prompted to stop after {maxConsecLosses} losses in a row</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className={styles.divider} />

                {/* Cool-down timer */}
                <div className={styles.guardRow}>
                    <div className={styles.guardInfo}>
                        <span className={styles.guardLabel}>Post-Loss Cool-Down</span>
                        <span className={styles.guardDesc}>Mandatory wait before re-entering after a loss</span>
                    </div>
                    <button
                        className={`${styles.toggle} ${coolDownEnabled ? styles.toggleOn : ''}`}
                        onClick={() => setCoolDownEnabled(v => !v)}
                        aria-label="Toggle cool-down timer"
                    />
                </div>
                <AnimatePresence>
                    {coolDownEnabled && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div className="field-group" style={{ marginBottom: 0, marginTop: 8 }}>
                                <label className="field-label">Cool-Down Duration (minutes)</label>
                                <input className="field-input" type="number" inputMode="numeric"
                                    value={coolDownMins} onChange={e => setCoolDownMins(e.target.value)}
                                    placeholder="15" min="1" max="120" />
                                <span className="field-hint">Wait {coolDownMins} min after a losing trade before next entry</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ── Save ────────────────────────────────────────────── */}
            <motion.button
                variants={sectionVariant}
                className={`btn ${saved ? 'btn--success' : 'btn--primary'} btn--full`}
                onClick={handleSave}
                whileTap={{ scale: 0.98 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
                {saved ? <><Check size={16} /> Settings Saved!</> : <><Check size={16} /> Save Settings</>}
            </motion.button>

            {/* ── 5. DXTrade Live Sync ────────────────────────────── */}
            <motion.div variants={sectionVariant} className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    {dxtradeConfig
                        ? <span className={styles.pulseDot} />
                        : <WifiOff size={14} style={{ color: 'var(--text-muted)' }} />
                    }
                    <span className={styles.sectionTitle}>DXTrade Live Sync</span>
                    {dxtradeConfig && <span className={styles.connectedBadge}>LIVE</span>}
                </div>

                {dxtradeConfig && !showDxForm ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div className={styles.connInfo}>
                            <div className={styles.connInfoRow}>
                                <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{dxtradeConfig.username}</span>
                                <span style={{ color: '#6b7280' }}>@</span>
                                <span style={{ color: '#6b7280', fontSize: 10 }}>{dxtradeConfig.server}</span>
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', marginTop: 3 }}>
                                {dxtradeConfig.accountCode}
                                {dxtradeLastSync && ` · Synced ${new Date(dxtradeLastSync).toLocaleTimeString()}`}
                            </div>
                        </div>

                        {(dxProgress || dxError) && (
                            <div className={dxError ? styles.msgError : styles.msgSuccess}>
                                {dxError || dxProgress}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button onClick={handleDXSync} disabled={dxBusy} className="btn btn--primary btn--sm"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {dxBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
                                Sync Now
                            </button>
                            <button onClick={() => { setShowDxForm(true); setDxError(''); setDxProgress(''); }}
                                className="btn btn--ghost btn--sm"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <RotateCcw size={13} /> Reconnect
                            </button>
                        </div>
                        <button
                            onClick={() => { setDXTradeConfig(null); setDxProgress(''); setDxError(''); setShowDxForm(false); }}
                            className="btn btn--ghost btn--sm"
                            style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                            <WifiOff size={12} /> Disconnect
                        </button>
                    </div>
                ) : (
                    !showDxForm && (
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280' }}>
                            Connect your Tradeify DXTrade account to auto-sync balance and trade history.
                        </p>
                    )
                )}

                {(!dxtradeConfig || showDxForm) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: dxtradeConfig ? 8 : 4 }}>
                        {(['Server', 'Username', 'Domain', 'Password'] as const).map(field => {
                            const map = {
                                Server:   { val: dxServer,   set: setDxServer,   type: 'text',     placeholder: 'dx.tradeifycrypto.co' },
                                Username: { val: dxUsername, set: setDxUsername, type: 'text',     placeholder: 'your_username' },
                                Domain:   { val: dxDomain,   set: setDxDomain,   type: 'text',     placeholder: 'default' },
                                Password: { val: dxPassword, set: setDxPassword, type: 'password', placeholder: '••••••••' },
                            };
                            const f = map[field];
                            return (
                                <div className="field-group" key={field} style={{ marginBottom: 0 }}>
                                    <label className="field-label">{field}</label>
                                    <input className="field-input" type={f.type} value={f.val}
                                        onChange={e => f.set(e.target.value)}
                                        placeholder={f.placeholder}
                                        autoCapitalize="none" autoCorrect="off" />
                                </div>
                            );
                        })}

                        {dxProgress && !dxError && (
                            <div className={styles.msgProgress}>
                                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                {dxProgress}
                            </div>
                        )}
                        {dxError && <div className={styles.msgError}>{dxError}</div>}

                        <button onClick={handleDXConnect} disabled={dxBusy || !dxUsername || !dxPassword}
                            className="btn btn--primary btn--sm"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}>
                            {dxBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Wifi size={13} />}
                            {dxBusy ? 'Connecting…' : 'Connect & Sync'}
                        </button>
                        {showDxForm && (
                            <button onClick={() => setShowDxForm(false)} className="btn btn--ghost btn--sm"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                Cancel
                            </button>
                        )}
                    </div>
                )}
            </motion.div>

            {/* ── 6. Data Import / Export ─────────────────────────── */}
            <motion.div variants={sectionVariant} className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <FileText size={14} style={{ color: '#60a5fa' }} />
                    <span className={styles.sectionTitle}>Data</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                        {trades.length} trades stored
                    </span>
                </div>

                {pdfMsg && (
                    <div className={pdfMsg.startsWith('Error') || pdfMsg.startsWith('Failed') ? styles.msgError : styles.msgSuccess}>
                        {pdfMsg}
                    </div>
                )}

                <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePDFImport} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => pdfRef.current?.click()} disabled={pdfBusy}
                        className="btn btn--ghost btn--sm"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {pdfBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                        Import PDF
                    </button>
                    <button onClick={handleExportCSV} disabled={trades.length === 0}
                        className="btn btn--ghost btn--sm"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Download size={13} /> Export CSV
                    </button>
                </div>

                {/* Violation report */}
                <AnimatePresence>
                    {violations.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div className={styles.violationBox}>
                                <div className={styles.violationHeader}>
                                    <AlertTriangle size={12} />
                                    <span>{violations.filter(v => v.severity === 'breach').length} breach{violations.filter(v => v.severity === 'breach').length !== 1 ? 'es' : ''}, {violations.filter(v => v.severity === 'warning').length} warning{violations.filter(v => v.severity === 'warning').length !== 1 ? 's' : ''} detected</span>
                                </div>
                                {violations.slice(0, 5).map((v, i) => (
                                    <div key={i} className={`${styles.violationRow} ${v.severity === 'breach' ? styles.violationBreach : styles.violationWarn}`}>
                                        <span className={styles.violationDate}>{v.date}</span>
                                        <span className={styles.violationDetail}>{v.detail}</span>
                                    </div>
                                ))}
                                {violations.length > 5 && (
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                                        +{violations.length - 5} more
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Recalculate balance from trades */}
                {trades.length > 0 && account.startingBalance > 0 && (
                    <button
                        onClick={() => { autoSync(); const b = useAppStore.getState().account.balance; setBalance(String(b)); }}
                        className="btn btn--ghost btn--sm"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        <Zap size={12} style={{ color: 'var(--accent)' }} />
                        Recalculate balance from {trades.filter(t => t.outcome !== 'open').length} trades
                    </button>
                )}

                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', marginTop: 0 }}>
                    Import: Tradeify &quot;Single-Currency Account Statement&quot; PDF · Export: all trades as .csv
                </p>
            </motion.div>

            {/* ── 7. Danger Zone ──────────────────────────────────── */}
            <motion.div variants={sectionVariant} className={`glass-card glass-card--elevated ${styles.section} ${styles.dangerSection}`}>
                <div className={styles.sectionTitleRow}>
                    <AlertTriangle size={14} style={{ color: '#f87171' }} />
                    <span className={`${styles.sectionTitle} ${styles.dangerTitle}`}>Danger Zone</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button className="btn btn--ghost btn--sm" onClick={resetTodaySession}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <RefreshCw size={12} /> Reset Today&apos;s Session
                    </button>

                    <AnimatePresence mode="wait">
                        {clearConfirm ? (
                            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <p style={{ fontSize: 11, color: '#f87171', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                                    Delete all {trades.length} trades? This cannot be undone.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                    <button className="btn btn--ghost btn--sm" onClick={() => setClearConfirm(false)}>Cancel</button>
                                    <button className="btn btn--ghost btn--sm"
                                        style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                                        onClick={() => { setTrades([]); setClearConfirm(false); }}>
                                        <Trash2 size={12} /> Confirm
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.button key="clear" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="btn btn--ghost btn--sm"
                                onClick={() => setClearConfirm(true)}
                                style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <Trash2 size={12} /> Clear All Trades
                            </motion.button>
                        )}
                    </AnimatePresence>

                    <button className="btn btn--ghost btn--sm" onClick={resetOnboarding}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <RotateCcw size={12} /> Reset &amp; Re-run Setup Wizard
                    </button>
                </div>
            </motion.div>

        </motion.div>
    );
}
