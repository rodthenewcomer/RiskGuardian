'use client';

import styles from './SettingsPage.module.css';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, PROP_FIRMS, type PropFirmPreset } from '@/store/appStore';
import { useTranslation } from '@/i18n/useTranslation';
import { scanViolations, type TradeViolation } from '@/lib/tradeViolations';
import { deleteAllTrades, deleteTrades } from '@/lib/supabaseSync';
import {
    Settings2, DollarSign, ShieldAlert, Check, RefreshCw, Building2,
    Bitcoin, LineChart, CandlestickChart, CircleDollarSign,
    Upload, FileText, RotateCcw,
    Brain, Download, Trash2, AlertTriangle, Zap, Clock,
    Globe, Loader2, Eye, EyeOff, Save, Cpu, Lock, MonitorPlay, X
} from 'lucide-react';

const getFirmLogo = (name: string) => {
    if (name.includes('Tradeify')) return 'https://www.google.com/s2/favicons?domain=tradeify.co&sz=128';
    if (name.includes('Funding Pips')) return 'https://www.google.com/s2/favicons?domain=fundingpips.com&sz=128';
    if (name.includes('FTMO')) return 'https://www.google.com/s2/favicons?domain=ftmo.com&sz=128';
    if (name.includes('5%ers')) return 'https://www.google.com/s2/favicons?domain=the5ers.com&sz=128';
    return null;
};

const container = { visible: { transition: { staggerChildren: 0.06 } } };
const sectionVariant = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

// ── Shared inline style atoms ────────────────────────────────────────────────
const CARD: React.CSSProperties = {
    background: '#0d1117',
    border: '2px solid #1a1c24',
    boxShadow: '4px 4px 0 #000',
};

const INPUT: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    color: '#fff',
    background: '#0b0e14',
    border: '2px solid #1a1c24',
    borderRadius: 0,
    padding: '9px 12px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box' as const,
};

const LABEL: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    fontWeight: 700,
    color: '#8b949e',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    marginBottom: 5,
};

const HINT: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4,
};

const BTN_PRIMARY: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    background: '#FDC800',
    color: '#000',
    border: 'none',
    borderRadius: 0,
    boxShadow: '3px 3px 0 #000',
    padding: '10px 18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};

const BTN_GHOST: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    background: 'transparent',
    color: '#8b949e',
    border: '2px solid #1a1c24',
    borderRadius: 0,
    padding: '9px 14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};

const BTN_DANGER: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    background: '#ff4757',
    color: '#fff',
    border: 'none',
    borderRadius: 0,
    boxShadow: '3px 3px 0 #000',
    padding: '9px 14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
};

const SECTION_CHIP: React.CSSProperties = {
    background: 'rgba(253,200,0,0.08)',
    border: '1px solid rgba(253,200,0,0.2)',
    color: '#FDC800',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    padding: '3px 10px',
    borderRadius: 0,
    fontWeight: 700,
};

// ── Section header with left accent bar ─────────────────────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <div style={{ borderLeft: '3px solid #FDC800', paddingLeft: 10, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ color: '#FDC800' }}>{icon}</span>
            <span style={SECTION_CHIP}>{label}</span>
        </div>
    );
}

// ── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={LABEL}>{label}</label>
            {children}
            {hint && <span style={HINT}>{hint}</span>}
        </div>
    );
}

export default function SettingsPage() {
    const {
        account, updateAccount, resetTodaySession, resetOnboarding,
        setTrades, trades, autoSync,
        language, setLanguage, tradingDayRollHour, setTradingDayRollHour,
        userId,
    } = useAppStore();

    const lang = language ?? 'en';
    const { t } = useTranslation();

    const [saved, setSaved] = useState(false);
    const [selectedFirm, setSelectedFirm] = useState<string | null>(account.propFirm || null);

    // PDF import
    const pdfRef = useRef<HTMLInputElement>(null);
    const [pdfBusy, setPdfBusy] = useState(false);
    const [pdfMsg, setPdfMsg] = useState('');
    const [violations, setViolations] = useState<TradeViolation[]>([]);

    // Danger zone
    const [clearConfirm, setClearConfirm] = useState(false);
    const [resetConfirm, setResetConfirm] = useState(false);

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

    // Trading day roll
    const [rollHour, setRollHour] = useState(String(tradingDayRollHour ?? 17));

    // Input focus state for yellow border on focus
    const [focusedInput, setFocusedInput] = useState<string | null>(null);
    const focused = (id: string): React.CSSProperties =>
        focusedInput === id ? { ...INPUT, borderColor: '#FDC800' } : INPUT;

    // ── PDF import ───────────────────────────────────────────────────────────
    async function handlePDFImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!e.target) return;
        (e.target as HTMLInputElement).value = '';
        if (!file) return;
        setPdfBusy(true); setPdfMsg(t.settings.pdfParsing);
        try {
            const { parseTradeifyPDF } = await import('@/lib/parseTradeifyPDF');
            const result = await parseTradeifyPDF(file);
            if (result.error) { setPdfMsg(`Error: ${result.error}`); return; }

            // Edge-Forensics-style atomicity: let the cloud be the source of truth
            const cvStart = result.coverageStart || '9999-99-99';
            const cvEnd   = result.coverageEnd || '0000-00-00';
            const newTrades = result.trades.map((t: any) => ({ ...t, note: '' }));

            let mergedTrades = [...trades];
            if (userId) {
                setPdfMsg('Syncing statement to cloud…');
                const { importPdfTrades, fullSync } = await import('@/lib/supabaseSync');
                
                // 1. Atomically delete overlapping trades in cloud and insert new trades
                await importPdfTrades(newTrades, cvStart, cvEnd, userId);
                
                // 2. Fetch the pristine state from the cloud and merge local-only
                mergedTrades = await fullSync(trades, userId);
            } else {
                // Offline mode fallback
                const nonPdf = trades.filter(t => !t.id.startsWith('tradeify-'));
                const oldPdf = trades.filter(t => t.id.startsWith('tradeify-'));
                const newIds = new Set(result.trades.map((t: any) => t.id));
                const oldKept = oldPdf.filter(t => {
                    if (newIds.has(t.id)) return false;
                    const d = t.createdAt.slice(0, 10);
                    if (d >= cvStart && d <= cvEnd) return false;
                    return true;
                });
                mergedTrades = [...newTrades, ...oldKept, ...nonPdf];
            }

            setTrades(mergedTrades);

            if (result.closingBalance) {
                updateAccount({ balance: result.closingBalance });
                setBalance(String(result.closingBalance));
            } else {
                const computed = useAppStore.getState().account.balance;
                if (computed > 0) setBalance(String(computed));
            }

            const found = scanViolations(mergedTrades, account);
            setViolations(found);

            const coverage = result.coverageStart && result.coverageEnd
                ? ` · ${result.coverageStart} -> ${result.coverageEnd}`
                : '';
            const finalBal = useAppStore.getState().account.balance;
            const balMsg = finalBal > 0 ? ` · Balance $${finalBal.toLocaleString()}` : '';
            const warnMsg = found.length > 0 ? ` · ${found.filter(v => v.severity === 'breach').length} violations found` : ' · No violations';
            setPdfMsg(`${newTrades.length} imported${userId ? ' and synced' : ''}${coverage}${balMsg}${warnMsg}`);
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
        const bal = Math.max(1, parseFloat(balance) || account.balance);
        const startBal = Math.max(1, parseFloat(startingBalance) || bal);
        const maxDrawUSD = (startBal * Math.min(100, Math.max(0, parseFloat(maxDrawdownPct) || 0))) / 100;
        const rawDailyLimit = parseFloat(dailyLimit);
        const validDailyLimit = rawDailyLimit > 0 ? rawDailyLimit : account.dailyLossLimit;
        const rawMaxRisk = parseFloat(maxRisk);
        const validMaxRisk = rawMaxRisk > 0 && rawMaxRisk <= 100 ? rawMaxRisk : account.maxRiskPercent;
        let leverage = account.leverage || 2;
        if (propFirm?.includes('Tradeify')) {
            if (propFirmType.includes('Evaluation')) leverage = 5;
            else if (propFirmType === 'Instant Funding') leverage = 2;
        }
        updateAccount({
            balance: bal,
            dailyLossLimit: validDailyLimit,
            maxDrawdownLimit: maxDrawUSD,
            maxRiskPercent: validMaxRisk,
            assetType,
            propFirm: propFirm === 'Custom (Build your own)' ? '' : propFirm,
            propFirmType: propFirmType as '1-Step Evaluation' | '2-Step Evaluation' | 'Instant Funding',
            drawdownType: drawdownType as 'EOD' | 'Trailing' | 'Static',
            leverage,
            startingBalance: startBal,
            highestBalance: Math.max(startBal, bal),
            isConsistencyActive: propFirmType === 'Instant Funding' || propFirm?.includes('Instant'),
            minHoldTimeSec: propFirm?.includes('Tradeify') ? 20 : 0,
            maxTradesPerDay: maxTradesPerDay ? parseInt(maxTradesPerDay) : undefined,
            maxConsecutiveLosses: consecLossEnabled ? parseInt(maxConsecLosses) || 3 : undefined,
            coolDownMinutes: coolDownEnabled ? parseInt(coolDownMins) || 15 : undefined,
        });
        setTradingDayRollHour(parseInt(rollHour) || 17);
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

    // ── Toggle component ─────────────────────────────────────────────────────
    const Toggle = ({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) => (
        <button
            onClick={onToggle}
            aria-label={label}
            style={{
                width: 40,
                height: 22,
                background: on ? 'rgba(253,200,0,0.15)' : '#0b0e14',
                border: on ? '2px solid rgba(253,200,0,0.4)' : '2px solid #1a1c24',
                borderRadius: 0,
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background 0.18s, border-color 0.18s',
                WebkitTapHighlightColor: 'transparent',
                appearance: 'none',
                WebkitAppearance: 'none',
                padding: 0,
            }}
        >
            <span style={{
                position: 'absolute',
                width: 14,
                height: 14,
                background: on ? '#FDC800' : '#4b5563',
                top: 2,
                left: on ? 20 : 2,
                transition: 'left 0.18s, background 0.18s',
            }} />
        </button>
    );

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: 0, fontFamily: 'var(--font-mono)' }}
        >
            {/* ── Page header ──────────────────────────────────────────────── */}
            <motion.div variants={sectionVariant} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '20px 20px 16px',
                borderBottom: '2px solid #1a1c24',
                marginBottom: 0,
            }}>
                <Settings2 size={18} color="#FDC800" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {t.settings.title}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                        {t.settings.subtitle}
                    </div>
                </div>
                <motion.button
                    onClick={handleSave}
                    style={saved ? { ...BTN_PRIMARY, background: '#22c55e', color: '#fff', boxShadow: '3px 3px 0 #000' } : BTN_PRIMARY}
                    whileTap={{ scale: 0.94 }}
                >
                    <Check size={13} />
                    {saved ? t.settings.saved : t.settings.saveSettings}
                </motion.button>
            </motion.div>

            {/* ── Desktop 2-col grid ────────────────────────────────────────── */}
            <div className={styles.desktopGrid}>

                {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* ── 1. Account Setup ─────────────────────────────────── */}
                    <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginBottom: 0 }}>
                        <SectionHeader icon={<DollarSign size={14} />} label={t.settings.accountSetup} />

                        <div className={styles.inputGrid}>
                            <Field
                                label={t.settings.startingBalance}
                                hint={t.settings.drawdownFloorHint}
                            >
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={startingBalance}
                                    onChange={e => setStartingBalance(e.target.value)}
                                    placeholder="10000"
                                    style={focused('startBal')}
                                    onFocus={() => setFocusedInput('startBal')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </Field>
                            <Field
                                label={t.settings.currentBalance}
                            >
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={balance}
                                    onChange={e => setBalance(e.target.value)}
                                    placeholder="10000"
                                    style={focused('bal')}
                                    onFocus={() => setFocusedInput('bal')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </Field>
                        </div>

                        <div className={styles.inputGrid} style={{ marginTop: 12 }}>
                            <Field
                                label={t.settings.dailyLossLimit}
                                hint={balNum > 0 && dailyLimit ? `${((parseFloat(dailyLimit) / balNum) * 100).toFixed(2)}% ${t.settings.ofBalance}` : undefined}
                            >
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={dailyLimit}
                                    onChange={e => setDailyLimit(e.target.value)}
                                    placeholder="300"
                                    style={focused('dl')}
                                    onFocus={() => setFocusedInput('dl')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </Field>
                            <Field
                                label={t.settings.maxDrawdown}
                                hint={balNum > 0 ? `$${((balNum * (parseFloat(maxDrawdownPct) || 0)) / 100).toFixed(0)} ${t.settings.floor}` : undefined}
                            >
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={maxDrawdownPct}
                                    onChange={e => setMaxDrawdownPct(e.target.value)}
                                    placeholder="10"
                                    style={focused('dd')}
                                    onFocus={() => setFocusedInput('dd')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </Field>
                        </div>

                        <div className={styles.inputGrid} style={{ marginTop: 12 }}>
                            <Field
                                label={t.settings.maxRiskPerTrade}
                                hint={balNum > 0 && maxRisk ? `~$${((balNum * parseFloat(maxRisk)) / 100).toFixed(0)} ${t.settings.perTrade}` : undefined}
                            >
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={maxRisk}
                                    onChange={e => setMaxRisk(e.target.value)}
                                    placeholder="1"
                                    style={focused('mr')}
                                    onFocus={() => setFocusedInput('mr')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </Field>
                            <Field
                                label={t.settings.maxTradesPerDay}
                                hint={!maxTradesPerDay && balNum > 0 && dailyLimit && maxRisk
                                    ? `Min possible: ${Math.floor(parseFloat(dailyLimit) / ((balNum * parseFloat(maxRisk)) / 100))} at max risk`
                                    : undefined}
                            >
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={maxTradesPerDay}
                                    onChange={e => setMaxTradesPerDay(e.target.value)}
                                    placeholder="e.g. 3"
                                    style={focused('mtd')}
                                    onFocus={() => setFocusedInput('mtd')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </Field>
                        </div>

                        {/* Drawdown type selector */}
                        <div style={{ marginTop: 12 }}>
                            <label style={LABEL}>{t.settings.drawdownType}</label>
                            <div style={{ display: 'flex', gap: 0, border: '2px solid #1a1c24' }}>
                                {(['EOD', 'Trailing', 'Static'] as const).map((dt, i) => (
                                    <button
                                        key={dt}
                                        onClick={() => setDrawdownType(dt)}
                                        style={{
                                            flex: 1,
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            letterSpacing: '0.06em',
                                            padding: '8px 4px',
                                            border: 'none',
                                            borderLeft: i > 0 ? '2px solid #1a1c24' : 'none',
                                            cursor: 'pointer',
                                            background: drawdownType === dt ? '#FDC800' : '#0b0e14',
                                            color: drawdownType === dt ? '#000' : '#6b7280',
                                        }}
                                    >
                                        {dt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.section>

                    {/* ── 4. Account Rules ─────────────────────────────────── */}
                    <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginTop: 0, borderTop: 'none' }}>
                        <SectionHeader icon={<Brain size={14} />} label={t.settings.accountRules} />
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginBottom: 16, marginTop: -8 }}>
                            Circuit breakers that protect you from emotional trading.
                        </p>

                        {/* Consistency mode */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', fontWeight: 700 }}>
                                    Consistency Mode
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                                    No single day &gt;20% of total profit (Instant Funding rule)
                                </div>
                            </div>
                            <Toggle
                                on={propFirmType === 'Instant Funding'}
                                onToggle={() => setPropFirmType(v => v === 'Instant Funding' ? '1-Step Evaluation' : 'Instant Funding')}
                                label="Toggle consistency mode"
                            />
                        </div>

                        <div style={{ height: 1, background: '#1a1c24', marginBottom: 16 }} />

                        {/* Min hold time */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', fontWeight: 700 }}>
                                    Min Hold Time
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                                    {propFirm?.includes('Tradeify') ? '20s enforced for Tradeify accounts' : 'No restriction set'}
                                </div>
                            </div>
                            <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                fontWeight: 800,
                                color: propFirm?.includes('Tradeify') ? '#FDC800' : '#4b5563',
                                background: propFirm?.includes('Tradeify') ? 'rgba(253,200,0,0.08)' : 'transparent',
                                border: propFirm?.includes('Tradeify') ? '1px solid rgba(253,200,0,0.2)' : '1px solid #1a1c24',
                                padding: '3px 10px',
                            }}>
                                {propFirm?.includes('Tradeify') ? '20s' : '—'}
                            </span>
                        </div>

                        <div style={{ height: 1, background: '#1a1c24', marginBottom: 16 }} />

                        {/* Consecutive loss stop */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', fontWeight: 700 }}>
                                    Consecutive Loss Stop
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                                    Lock trading after N losses in a row
                                </div>
                            </div>
                            <Toggle on={consecLossEnabled} onToggle={() => setConsecLossEnabled(v => !v)} label="Toggle consecutive loss stop" />
                        </div>
                        <AnimatePresence>
                            {consecLossEnabled && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{ overflow: 'hidden', marginBottom: 8 }}
                                >
                                    <Field label={t.settings.maxConsecLosses} hint={`Stop trading after ${maxConsecLosses} losses in a row`}>
                                        <input
                                            type="number" inputMode="numeric" pattern="[0-9]*"
                                            value={maxConsecLosses} onChange={e => setMaxConsecLosses(e.target.value)}
                                            placeholder="3" min="1" max="10"
                                            style={focused('mcl')}
                                            onFocus={() => setFocusedInput('mcl')}
                                            onBlur={() => setFocusedInput(null)}
                                        />
                                    </Field>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div style={{ height: 1, background: '#1a1c24', marginBottom: 16, marginTop: 8 }} />

                        {/* Cool-down timer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', fontWeight: 700 }}>
                                    Post-Loss Cool-Down
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                                    Mandatory wait before re-entering after a loss
                                </div>
                            </div>
                            <Toggle on={coolDownEnabled} onToggle={() => setCoolDownEnabled(v => !v)} label="Toggle cool-down timer" />
                        </div>
                        <AnimatePresence>
                            {coolDownEnabled && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{ overflow: 'hidden' }}
                                >
                                    <Field label={t.settings.cooldownMinutes} hint={`Wait ${coolDownMins}min after a losing trade`}>
                                        <input
                                            type="number" inputMode="numeric" pattern="[0-9]*"
                                            value={coolDownMins} onChange={e => setCoolDownMins(e.target.value)}
                                            placeholder="15" min="1" max="120"
                                            style={focused('cd')}
                                            onFocus={() => setFocusedInput('cd')}
                                            onBlur={() => setFocusedInput(null)}
                                        />
                                    </Field>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Payout lock hint */}
                        <div style={{ height: 1, background: '#1a1c24', margin: '16px 0' }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', fontWeight: 700 }}>
                                    Payout Lock
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                                    Automatically locked when consistency rule is active
                                </div>
                            </div>
                            <span style={{ ...SECTION_CHIP, color: propFirmType === 'Instant Funding' ? '#22c55e' : '#4b5563', borderColor: propFirmType === 'Instant Funding' ? 'rgba(34,197,94,0.3)' : '#1a1c24', background: 'transparent' }}>
                                {propFirmType === 'Instant Funding' ? 'Enforced' : 'Off'}
                            </span>
                        </div>
                    </motion.section>

                </div>

                {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                    {/* ── 2. Prop Firm Presets ──────────────────────────────── */}
                    <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginBottom: 0 }}>
                        <SectionHeader icon={<Building2 size={14} />} label={t.settings.propFirmPresets} />

                        <div className={styles.firmRail}>
                            {PROP_FIRMS.filter(f => f.dailyPct > 0).map(firm => (
                                <motion.button
                                    key={firm.name}
                                    onClick={() => applyFirm(firm)}
                                    whileTap={{ scale: 0.94 }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '7px 12px',
                                        background: selectedFirm === firm.name ? 'rgba(253,200,0,0.08)' : '#0b0e14',
                                        border: selectedFirm === firm.name ? '2px solid rgba(253,200,0,0.4)' : '2px solid #1a1c24',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap' as const,
                                        flexShrink: 0,
                                        borderRadius: 0,
                                    }}
                                >
                                    {getFirmLogo(firm.name) && (
                                        <img src={getFirmLogo(firm.name)!} alt="" style={{ width: 14, height: 14, borderRadius: 0, flexShrink: 0 }} />
                                    )}
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: selectedFirm === firm.name ? '#FDC800' : '#c9d1d9',
                                    }}>
                                        {firm.short}
                                    </span>
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 9,
                                        fontWeight: 700,
                                        color: '#6b7280',
                                        background: '#0d1117',
                                        padding: '1px 5px',
                                        border: '1px solid #1a1c24',
                                    }}>
                                        {firm.propFirmType === '1-Step Evaluation' ? '1S'
                                            : firm.propFirmType === '2-Step Evaluation' ? '2S'
                                                : 'IF'}
                                    </span>
                                </motion.button>
                            ))}
                            <motion.button
                                onClick={() => { setSelectedFirm('Custom (Build your own)'); setPropFirm('Custom (Build your own)'); }}
                                whileTap={{ scale: 0.94 }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '7px 12px',
                                    background: selectedFirm === 'Custom (Build your own)' ? 'rgba(253,200,0,0.08)' : '#0b0e14',
                                    border: selectedFirm === 'Custom (Build your own)' ? '2px solid rgba(253,200,0,0.4)' : '2px solid #1a1c24',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap' as const,
                                    flexShrink: 0,
                                    borderRadius: 0,
                                    opacity: 0.65,
                                }}
                            >
                                <Settings2 size={12} style={{ color: '#8b949e', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#8b949e' }}>Custom</span>
                            </motion.button>
                        </div>

                        <AnimatePresence>
                            {activeFirm && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{ overflow: 'hidden', marginTop: 12 }}
                                >
                                    <div style={{
                                        padding: '12px 14px',
                                        background: 'rgba(253,200,0,0.04)',
                                        border: '1px solid rgba(253,200,0,0.15)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                                                {activeFirm.name}
                                            </span>
                                            <span style={SECTION_CHIP}>{propFirmType}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>
                                                Daily <strong style={{ color: '#fff' }}>${dailyLimit}</strong>
                                            </span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>
                                                Drawdown <strong style={{ color: '#fff' }}>{drawdownType} {activeFirm.maxDrawPct}%</strong>
                                            </span>
                                            {activeFirm.name.includes('Tradeify') && (
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>
                                                    Hold <strong style={{ color: '#FDC800' }}>20s min</strong>
                                                </span>
                                            )}
                                            {propFirmType === 'Instant Funding' && (
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#8b949e' }}>
                                                    Consistency <strong style={{ color: '#FDC800' }}>&lt;=20%</strong>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.section>

                    {/* ── 3. Asset & Instrument ────────────────────────────── */}
                    <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginTop: 0, borderTop: 'none' }}>
                        <SectionHeader icon={<CandlestickChart size={14} />} label="Asset & Instrument" />

                        <label style={LABEL}>{t.settings.assetType}</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: '2px solid #1a1c24' }}>
                            {(['crypto', 'forex', 'futures', 'stocks'] as const).map((type, i) => (
                                <button
                                    key={type}
                                    onClick={() => setAssetType(type)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 4,
                                        padding: '10px 4px',
                                        border: 'none',
                                        borderLeft: i > 0 ? '2px solid #1a1c24' : 'none',
                                        cursor: 'pointer',
                                        background: assetType === type ? '#FDC800' : '#0b0e14',
                                        color: assetType === type ? '#000' : '#6b7280',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        letterSpacing: '0.04em',
                                    }}
                                >
                                    {type === 'crypto' && <><Bitcoin size={11} /> Crypto</>}
                                    {type === 'forex' && <><CircleDollarSign size={11} /> Forex</>}
                                    {type === 'futures' && <><LineChart size={11} /> Futures</>}
                                    {type === 'stocks' && <><CandlestickChart size={11} /> Stocks</>}
                                </button>
                            ))}
                        </div>
                    </motion.section>

                    {/* ── 5. Trading Day ───────────────────────────────────── */}
                    {(account.assetType === 'crypto' && (account.propFirm === 'Tradeify Instant Funding' || (account.propFirmType === 'Instant Funding' && account.propFirm?.includes('Tradeify')))) && (
                        <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginTop: 0, borderTop: 'none' }}>
                            <SectionHeader icon={<Clock size={14} />} label={t.settings.tradingDay} />

                            <Field
                                label={t.settings.tradingDayRoll}
                                hint={`Tradeify Crypto default: 17 (5:00 PM EST). Currently: ${rollHour}:00 EST`}
                            >
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    min="0"
                                    max="23"
                                    value={rollHour}
                                    onChange={e => setRollHour(e.target.value)}
                                    style={{ ...focused('roll'), maxWidth: 100 }}
                                    onFocus={() => setFocusedInput('roll')}
                                    onBlur={() => setFocusedInput(null)}
                                />
                            </Field>
                        </motion.section>
                    )}

                    {/* ── 6. Language ──────────────────────────────────────── */}
                    <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginTop: 0, borderTop: 'none' }}>
                        <SectionHeader icon={<Globe size={14} />} label={t.common.language} />

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#c9d1d9', fontWeight: 700 }}>
                                    {lang === 'fr' ? 'Langue de l\'interface' : 'Interface Language'}
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280', marginTop: 3 }}>
                                    {lang === 'fr' ? 'Passe toute l\'app en francais ou en anglais' : 'Switch the entire app between English and French'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 0, border: '2px solid #1a1c24', flexShrink: 0 }}>
                                <button
                                    onClick={() => setLanguage('en')}
                                    style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        padding: '8px 16px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: lang === 'en' ? '#FDC800' : '#0b0e14',
                                        color: lang === 'en' ? '#000' : '#6b7280',
                                        letterSpacing: '0.08em',
                                    }}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => setLanguage('fr')}
                                    style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        padding: '8px 16px',
                                        border: 'none',
                                        borderLeft: '2px solid #1a1c24',
                                        cursor: 'pointer',
                                        background: lang === 'fr' ? '#FDC800' : '#0b0e14',
                                        color: lang === 'fr' ? '#000' : '#6b7280',
                                        letterSpacing: '0.08em',
                                    }}
                                >
                                    FR
                                </button>
                            </div>
                        </div>
                    </motion.section>

                    {/* ── Data Import / Export ─────────────────────────────── */}
                    <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginTop: 0, borderTop: 'none' }}>
                        <SectionHeader icon={<FileText size={14} />} label="Data" />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: -8, marginBottom: 12 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#6b7280' }}>
                                {trades.length} trades stored
                            </span>
                        </div>

                        {pdfMsg && (
                            <div style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                color: pdfMsg.startsWith('Error') || pdfMsg.startsWith('Failed') ? '#ff4757' : '#FDC800',
                                padding: '8px 12px',
                                background: pdfMsg.startsWith('Error') || pdfMsg.startsWith('Failed')
                                    ? 'rgba(255,71,87,0.06)'
                                    : 'rgba(253,200,0,0.04)',
                                border: pdfMsg.startsWith('Error') || pdfMsg.startsWith('Failed')
                                    ? '1px solid rgba(255,71,87,0.2)'
                                    : '1px solid rgba(253,200,0,0.15)',
                                marginBottom: 12,
                                lineHeight: 1.5,
                            }}>
                                {pdfMsg}
                            </div>
                        )}

                        <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePDFImport} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button
                                onClick={() => pdfRef.current?.click()}
                                disabled={pdfBusy}
                                style={{ ...BTN_GHOST, justifyContent: 'center', width: '100%' }}
                            >
                                {pdfBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                                {t.settings.importPDF}
                            </button>
                            <button
                                onClick={handleExportCSV}
                                disabled={trades.length === 0}
                                style={{ ...BTN_GHOST, justifyContent: 'center', width: '100%', opacity: trades.length === 0 ? 0.4 : 1 }}
                            >
                                <Download size={13} /> {t.settings.exportCSV}
                            </button>
                        </div>

                        {/* Violation report */}
                        <AnimatePresence>
                            {violations.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{ overflow: 'hidden', marginTop: 12 }}
                                >
                                    <div style={{
                                        background: 'rgba(248,113,113,0.04)',
                                        border: '1px solid rgba(248,113,113,0.18)',
                                        padding: '10px 12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 6,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#f87171' }}>
                                            <AlertTriangle size={12} />
                                            {violations.filter(v => v.severity === 'breach').length} breach{violations.filter(v => v.severity === 'breach').length !== 1 ? 'es' : ''},{' '}
                                            {violations.filter(v => v.severity === 'warning').length} warning{violations.filter(v => v.severity === 'warning').length !== 1 ? 's' : ''}
                                        </div>
                                        {violations.slice(0, 5).map((v, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    display: 'flex',
                                                    gap: 10,
                                                    alignItems: 'baseline',
                                                    padding: '4px 0',
                                                    borderTop: '1px solid #1a1c24',
                                                    color: v.severity === 'breach' ? '#f87171' : '#f59e0b',
                                                }}
                                            >
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' as const, flexShrink: 0, opacity: 0.7 }}>
                                                    {v.date}
                                                </span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.4 }}>{v.detail}</span>
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

                        {trades.length > 0 && account.startingBalance > 0 && (
                            <button
                                onClick={() => { autoSync(); const b = useAppStore.getState().account.balance; setBalance(String(b)); }}
                                style={{ ...BTN_GHOST, width: '100%', justifyContent: 'center', marginTop: 8 }}
                            >
                                <Zap size={12} style={{ color: '#FDC800' }} />
                                Recalculate from {trades.filter(t => t.outcome !== 'open').length} trades
                            </button>
                        )}

                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', marginTop: 10 }}>
                            Import: Tradeify &quot;Single-Currency Account Statement&quot; PDF · Export: all trades as .csv
                        </p>
                    </motion.section>

                    {/* ── 7. Danger Zone ───────────────────────────────────── */}
                    <motion.section variants={sectionVariant} style={{ ...CARD, padding: 20, marginTop: 0, borderTop: 'none', borderColor: 'rgba(248,113,113,0.18)' }}>
                        <SectionHeader icon={<AlertTriangle size={14} />} label={t.settings.dangerZone} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button
                                onClick={resetTodaySession}
                                style={{ ...BTN_GHOST, width: '100%', justifyContent: 'center' }}
                            >
                                <RefreshCw size={12} /> Reset Today's Session
                            </button>

                            <AnimatePresence mode="wait">
                                {clearConfirm ? (
                                    <motion.div key="confirm-clear" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171', textAlign: 'center', marginBottom: 8 }}>
                                            Delete all {trades.length} trades? Cannot be undone.
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                            <button style={{ ...BTN_GHOST, justifyContent: 'center' }} onClick={() => setClearConfirm(false)}>
                                                Cancel
                                            </button>
                                            <button
                                                style={{ ...BTN_DANGER, justifyContent: 'center' }}
                                                onClick={() => {
                                                    setTrades([]);
                                                    setClearConfirm(false);
                                                    if (userId) {
                                                        deleteAllTrades(userId).catch(console.error);
                                                    }
                                                }}
                                            >
                                                <Trash2 size={12} /> Confirm
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.button
                                        key="clear-btn"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={() => setClearConfirm(true)}
                                        style={{ ...BTN_GHOST, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', width: '100%', justifyContent: 'center' }}
                                    >
                                        <Trash2 size={12} /> Clear All Trades
                                    </motion.button>
                                )}
                            </AnimatePresence>

                            <AnimatePresence mode="wait">
                                {resetConfirm ? (
                                    <motion.div key="confirm-reset" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171', textAlign: 'center', marginBottom: 8 }}>
                                            This will re-run onboarding and clear all settings.
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                            <button style={{ ...BTN_GHOST, justifyContent: 'center' }} onClick={() => setResetConfirm(false)}>
                                                Cancel
                                            </button>
                                            <button
                                                style={{ ...BTN_DANGER, justifyContent: 'center' }}
                                                onClick={() => { resetOnboarding(); setResetConfirm(false); }}
                                            >
                                                <RotateCcw size={12} /> Confirm
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.button
                                        key="reset-btn"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={() => setResetConfirm(true)}
                                        style={{ ...BTN_GHOST, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', width: '100%', justifyContent: 'center' }}
                                    >
                                        <RotateCcw size={12} /> Reset &amp; Re-run Setup Wizard
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.section>

                </div>
            </div>

            {/* ── Sticky save bar (mobile) ──────────────────────────────────── */}
            <motion.div
                variants={sectionVariant}
                className={styles.mobileOnly}
                style={{ padding: '12px 20px', borderTop: '2px solid #1a1c24', marginTop: 0 }}
            >
                <motion.button
                    onClick={handleSave}
                    whileTap={{ scale: 0.97 }}
                    style={{
                        ...BTN_PRIMARY,
                        width: '100%',
                        justifyContent: 'center',
                        padding: '13px 20px',
                        fontSize: 12,
                        ...(saved ? { background: '#22c55e', color: '#fff', boxShadow: '3px 3px 0 #000' } : {}),
                    }}
                >
                    <Check size={15} />
                    {saved ? t.settings.saved : t.settings.saveSettings}
                </motion.button>
            </motion.div>

        </motion.div>
    );
}
