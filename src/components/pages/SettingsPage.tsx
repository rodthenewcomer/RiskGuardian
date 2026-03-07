'use client';

import styles from './SettingsPage.module.css';
import { useState, useRef } from 'react';
import { useAppStore, PROP_FIRMS, type PropFirmPreset } from '@/store/appStore';
import { Settings2, DollarSign, ShieldAlert, Check, RefreshCw, Building2, Bitcoin, LineChart, CandlestickChart, CircleDollarSign, Wifi, WifiOff, Loader2, Upload, FileText, RotateCcw } from 'lucide-react';
import { dxConnect, dxGetMetrics, dxGetHistory, dxGetPositions } from '@/lib/dxtradeSync';

const getFirmLogo = (name: string) => {
    if (name.includes('Tradeify')) return 'https://www.google.com/s2/favicons?domain=tradeify.co&sz=128';
    if (name.includes('Funding Pips')) return 'https://www.google.com/s2/favicons?domain=fundingpips.com&sz=128';
    if (name.includes('FTMO')) return 'https://www.google.com/s2/favicons?domain=ftmo.com&sz=128';
    if (name.includes('5%ers')) return 'https://www.google.com/s2/favicons?domain=the5ers.com&sz=128';
    return null;
};

export default function SettingsPage() {
    const { account, updateAccount, resetTodaySession, resetOnboarding,
        dxtradeConfig, dxtradeLastSync, setDXTradeConfig, setDXTradeLastSync,
        setTrades, trades } = useAppStore();
    const [saved, setSaved] = useState(false);
    const [selectedFirm, setSelectedFirm] = useState<string | null>(null);

    // DXTrade reconnect form state
    const [showDxForm, setShowDxForm] = useState(false);
    const [dxServer, setDxServer] = useState(dxtradeConfig?.server ?? 'live.tradeify.com');
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

    // ── DXTrade: connect / reconnect ──────────────────────────────
    async function handleDXConnect() {
        if (!dxUsername || !dxPassword) { setDxError('Username and password required'); return; }
        setDxBusy(true); setDxError(''); setDxProgress('');
        try {
            const result = await dxConnect(dxServer, dxUsername, dxDomain, dxPassword, setDxProgress);
            setDXTradeConfig({ server: dxServer, username: dxUsername, domain: dxDomain, accountCode: result.accountCode, token: result.token, connectedAt: new Date().toISOString() });
            setDXTradeLastSync(new Date().toISOString());
            // Merge DXTrade trades with any existing manual trades (deduplicate by id)
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

    // ── DXTrade: sync now (use stored token, refresh if needed) ──
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
            // Deduplicate: keep manual trades, replace DXTrade ones
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

    // ── PDF import ────────────────────────────────────────────────
    async function handlePDFImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!e.target) return;
        // Reset input so same file can be re-imported
        (e.target as HTMLInputElement).value = '';
        if (!file) return;
        setPdfBusy(true); setPdfMsg('Parsing statement…');
        try {
            const { parseTradeifyPDF } = await import('@/lib/parseTradeifyPDF');
            const result = await parseTradeifyPDF(file);
            if (result.error) { setPdfMsg(`Error: ${result.error}`); return; }
            // Merge: remove old PDF trades, keep DXTrade + manual, add new PDF trades
            const existing = trades.filter(t => !t.id.startsWith('tradeify-'));
            const pdfIds = new Set(result.trades.map(t => t.id));
            const merged = [...result.trades.map(t => ({ ...t, note: '' })), ...existing.filter(t => !pdfIds.has(t.id))];
            setTrades(merged);
            setPdfMsg(`Imported ${result.count} trades from statement.`);
        } catch (err) {
            setPdfMsg(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally { setPdfBusy(false); }
    }

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
            maxTradesPerDay: maxTradesPerDay ? parseInt(maxTradesPerDay) : undefined,
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
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                        >
                            <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {getFirmLogo(firm.name) ? (
                                    <img src={getFirmLogo(firm.name) as string} alt={firm.name} style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'contain' }} />
                                ) : (
                                    <Settings2 size={20} className="text-muted" />
                                )}
                            </div>
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
                                {type === 'crypto' ? <div className="flex items-center gap-1.5 justify-center"><Bitcoin size={14} /> Crypto</div> :
                                    type === 'forex' ? <div className="flex items-center gap-1.5 justify-center"><CircleDollarSign size={14} /> Forex</div> :
                                        type === 'futures' ? <div className="flex items-center gap-1.5 justify-center"><LineChart size={14} /> Futures</div> :
                                            <div className="flex items-center gap-1.5 justify-center"><CandlestickChart size={14} /> Stocks</div>}
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

                <div className="field-group">
                    <label className="field-label">Max Trades Per Day</label>
                    <input className="field-input" type="number" inputMode="numeric"
                        value={maxTradesPerDay} onChange={e => setMaxTradesPerDay(e.target.value)}
                        placeholder="e.g. 3" id="settings-max-trades" />
                    <span className="field-hint">
                        {maxTradesPerDay
                            ? `Hard cap: stop after ${maxTradesPerDay} trades regardless of P&L`
                            : `Calculated minimum: ${balNum > 0 && dailyLimit && maxRisk ? Math.floor(parseFloat(dailyLimit) / ((balNum * parseFloat(maxRisk)) / 100)) : '—'} at max risk — set your own hard cap here`}
                    </span>
                </div>

                <button className={`btn btn--ghost btn--sm ${styles.resetDayBtn}`} onClick={resetTodaySession} id="reset-day-btn">
                    <RefreshCw size={12} /> Reset Today&#39;s Session
                </button>
            </div>

            {/* Save */}
            <button className={`btn ${saved ? 'btn--success' : 'btn--primary'} btn--full`} onClick={handleSave} id="save-settings-btn">
                {saved ? <><Check size={16} /> Saved!</> : <><Check size={16} /> Save Settings</>}
            </button>

            {/* ─── DXTrade Live Sync ─── */}
            <div className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <Wifi size={14} className={dxtradeConfig ? 'text-success' : 'text-muted'} />
                    <span className={styles.sectionTitle}>DXTrade Live Sync</span>
                    {dxtradeConfig && (
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#A6FF4D', background: 'rgba(166,255,77,0.08)', border: '1px solid rgba(166,255,77,0.25)', padding: '2px 8px', borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                            CONNECTED
                        </span>
                    )}
                </div>

                {dxtradeConfig ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Connection info */}
                        <div style={{ padding: '12px 14px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderRadius: 6 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e2e8f0', marginBottom: 4 }}>
                                <strong>{dxtradeConfig.username}</strong> @ {dxtradeConfig.server}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>
                                Account: {dxtradeConfig.accountCode}
                            </div>
                            {dxtradeLastSync && (
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', marginTop: 3 }}>
                                    Last sync: {new Date(dxtradeLastSync).toLocaleString()}
                                </div>
                            )}
                        </div>

                        {/* Progress / error */}
                        {dxProgress && !dxError && (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#A6FF4D', padding: '8px 12px', background: 'rgba(166,255,77,0.04)', border: '1px solid rgba(166,255,77,0.12)', borderRadius: 6 }}>
                                {dxProgress}
                            </div>
                        )}
                        {dxError && (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757', padding: '8px 12px', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 6 }}>
                                {dxError}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button
                                onClick={handleDXSync}
                                disabled={dxBusy}
                                className="btn btn--primary btn--sm"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                                {dxBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
                                Sync Now
                            </button>
                            <button
                                onClick={() => { setShowDxForm(v => !v); setDxError(''); setDxProgress(''); }}
                                className="btn btn--ghost btn--sm"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                                <RotateCcw size={13} /> Reconnect
                            </button>
                        </div>

                        <button
                            onClick={() => { setDXTradeConfig(null); setDxProgress(''); setDxError(''); }}
                            className="btn btn--ghost btn--sm"
                            style={{ color: 'var(--color-danger)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                            <WifiOff size={12} /> Disconnect DXTrade
                        </button>
                    </div>
                ) : (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
                        Connect your Tradeify DXTrade account to auto-sync balance and trade history.
                    </p>
                )}

                {/* Connect / Reconnect form */}
                {(!dxtradeConfig || showDxForm) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: dxtradeConfig ? 0 : 0 }}>
                        {['Server', 'Username', 'Domain', 'Password'].map((field) => {
                            const fieldMap: Record<string, { val: string; set: (v: string) => void; type?: string; placeholder: string }> = {
                                Server:   { val: dxServer,   set: setDxServer,   placeholder: 'live.tradeify.com' },
                                Username: { val: dxUsername, set: setDxUsername, placeholder: 'your_username' },
                                Domain:   { val: dxDomain,   set: setDxDomain,   placeholder: 'default' },
                                Password: { val: dxPassword, set: setDxPassword, type: 'password', placeholder: '••••••••' },
                            };
                            const f = fieldMap[field];
                            return (
                                <div className="field-group" key={field} style={{ marginBottom: 0 }}>
                                    <label className="field-label">{field}</label>
                                    <input
                                        className="field-input"
                                        type={f.type || 'text'}
                                        value={f.val}
                                        onChange={e => f.set(e.target.value)}
                                        placeholder={f.placeholder}
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                    />
                                </div>
                            );
                        })}

                        {dxProgress && !dxError && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#A6FF4D' }}>
                                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> {dxProgress}
                            </div>
                        )}
                        {dxError && (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757' }}>{dxError}</div>
                        )}

                        <button
                            onClick={handleDXConnect}
                            disabled={dxBusy || !dxUsername || !dxPassword}
                            className="btn btn--primary btn--sm"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}
                        >
                            {dxBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Wifi size={13} />}
                            {dxBusy ? 'Connecting…' : 'Connect & Sync'}
                        </button>
                    </div>
                )}
            </div>

            {/* ─── PDF Statement Import ─── */}
            <div className={`glass-card glass-card--elevated ${styles.section}`}>
                <div className={styles.sectionTitleRow}>
                    <FileText size={14} className="text-muted" />
                    <span className={styles.sectionTitle}>Import PDF Statement</span>
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
                    Download your Tradeify &quot;Single-Currency Account Statement&quot; PDF from DXTrade and import it here to sync all closed trades.
                </p>

                {pdfMsg && (
                    <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: pdfMsg.startsWith('Error') || pdfMsg.startsWith('Failed') ? '#ff4757' : '#A6FF4D',
                        padding: '8px 12px', borderRadius: 6, marginBottom: 10,
                        background: pdfMsg.startsWith('Error') || pdfMsg.startsWith('Failed') ? 'rgba(255,71,87,0.06)' : 'rgba(166,255,77,0.04)',
                        border: `1px solid ${pdfMsg.startsWith('Error') || pdfMsg.startsWith('Failed') ? 'rgba(255,71,87,0.2)' : 'rgba(166,255,77,0.12)'}`,
                    }}>
                        {pdfMsg}
                    </div>
                )}

                <input
                    ref={pdfRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={handlePDFImport}
                />
                <button
                    onClick={() => pdfRef.current?.click()}
                    disabled={pdfBusy}
                    className="btn btn--ghost btn--sm"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}
                >
                    {pdfBusy
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Parsing…</>
                        : <><Upload size={13} /> Choose PDF Statement</>
                    }
                </button>
            </div>

            {/* Reset onboarding */}
            <button className={`btn btn--ghost btn--sm ${styles.resetWizardBtn}`} onClick={resetOnboarding} id="reset-onboarding-btn">
                ↺ Reset &amp; re-run setup wizard
            </button>
        </div>
    );
}
