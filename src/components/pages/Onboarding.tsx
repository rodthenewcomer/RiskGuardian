'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, PROP_FIRMS, type PropFirmPreset } from '@/store/appStore';
import { Shield, DollarSign, TrendingUp, ChevronRight, ChevronLeft, Check, Building2, AlertTriangle, Bitcoin, LineChart, CandlestickChart, CircleDollarSign, Settings2, Wifi, Loader2, WifiOff } from 'lucide-react';
import styles from './Onboarding.module.css';
import { dxConnect } from '@/lib/dxtradeSync';

const STEPS = ['firm', 'balance', 'rules', 'asset', 'connect'] as const;
type Step = typeof STEPS[number];

const ASSET_OPTIONS = [
    { value: 'crypto', label: 'Crypto', sub: 'BTC, ETH, SOL, DOGE', icon: <Bitcoin size={24} /> },
    { value: 'futures', label: 'Futures', sub: 'ES, NQ, MNQ, MES, CL', icon: <LineChart size={24} /> },
    { value: 'forex', label: 'Forex', sub: 'EUR/USD, GBP/USD, JPY', icon: <CircleDollarSign size={24} /> },
    { value: 'stocks', label: 'Stocks', sub: 'AAPL, TSLA, NVDA, SPY', icon: <CandlestickChart size={24} /> },
];

const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
};

const getFirmLogo = (name: string) => {
    if (name.includes('Tradeify')) return 'https://www.google.com/s2/favicons?domain=tradeify.co&sz=128';
    if (name.includes('Funding Pips')) return 'https://www.google.com/s2/favicons?domain=fundingpips.com&sz=128';
    if (name.includes('FTMO')) return 'https://www.google.com/s2/favicons?domain=ftmo.com&sz=128';
    if (name.includes('5%ers')) return 'https://www.google.com/s2/favicons?domain=the5ers.com&sz=128';
    return null;
};

export default function Onboarding() {
    const { updateAccount, completeOnboarding, setDXTradeConfig, setDXTradeLastSync, setTrades } = useAppStore();

    const [step, setStep] = useState<Step>('firm');
    const [dir, setDir] = useState(1);

    // State
    const [selectedFirm, setSelectedFirm] = useState<PropFirmPreset | null>(null);
    const [balance, setBalance] = useState('');
    const [customDaily, setCustomDaily] = useState('');
    const [customDrawdown, setCustomDrawdown] = useState('');
    const [asset, setAsset] = useState<'crypto' | 'futures' | 'forex' | 'stocks'>('crypto');
    const [done, setDone] = useState(false);

    // DXTrade connect step state
    const [dxServer, setDxServer] = useState('live.tradeify.com');
    const [dxUsername, setDxUsername] = useState('');
    const [dxDomain, setDxDomain] = useState('default');
    const [dxPassword, setDxPassword] = useState('');
    const [dxConnecting, setDxConnecting] = useState(false);
    const [dxProgress, setDxProgress] = useState('');
    const [dxError, setDxError] = useState('');
    const [dxSuccess, setDxSuccess] = useState(false);

    const balNum = parseFloat(balance.replace(/,/g, '')) || 0;

    // Derived Risk
    const isCustom = selectedFirm?.name.includes('Custom');

    const derivedDailyLimit = isCustom
        ? (parseFloat(customDaily) || 0)
        : Math.round(balNum * ((selectedFirm?.dailyPct || 0) / 100));

    const derivedMaxDrawdown = isCustom
        ? (parseFloat(customDrawdown) || 0)
        : Math.round(balNum * ((selectedFirm?.maxDrawPct || 0) / 100));

    const maxRiskPercent = isCustom
        ? ((derivedDailyLimit / balNum) * 100) / 5 || 1
        : (selectedFirm?.dailyPct || 5) / 5;

    const stepIndex = STEPS.indexOf(step);
    const progress = ((stepIndex + 1) / STEPS.length) * 100;

    function goNext() {
        setDir(1);
        if (step === 'firm') setStep('balance');
        else if (step === 'balance') setStep('rules');
        else if (step === 'rules') setStep('asset');
        else if (step === 'asset') setStep('connect');
        else finish();
    }

    function goBack() {
        setDir(-1);
        if (step === 'balance') setStep('firm');
        else if (step === 'rules') setStep('balance');
        else if (step === 'asset') setStep('rules');
        else if (step === 'connect') setStep('asset');
    }

    function finish(overrideBalance?: number) {
        setDone(true);
        updateAccount({
            balance: overrideBalance ?? balNum,
            startingBalance: overrideBalance ?? balNum,
            dailyLossLimit: derivedDailyLimit,
            maxDrawdownLimit: derivedMaxDrawdown,
            maxRiskPercent: maxRiskPercent,
            assetType: asset,
            propFirm: selectedFirm?.name.includes('Custom') ? '' : selectedFirm?.name,
            propFirmType: selectedFirm?.propFirmType || 'Instant Funding',
            drawdownType: selectedFirm?.drawdownType || 'EOD',
            isConsistencyActive: selectedFirm?.propFirmType === 'Instant Funding' || selectedFirm?.name.includes('Instant'),
            minHoldTimeSec: selectedFirm?.name?.includes('Tradeify') ? 20 : 0,
            leverage: selectedFirm?.name?.includes('Tradeify Crypto') && selectedFirm?.propFirmType?.includes('Evaluation') ? 5 : 2,
        });
        setTimeout(() => completeOnboarding(), 1200);
    }

    async function handleDXConnect() {
        if (!dxUsername || !dxPassword) {
            setDxError('Username and password are required');
            return;
        }
        setDxConnecting(true);
        setDxError('');
        setDxProgress('');
        try {
            const result = await dxConnect(
                dxServer,
                dxUsername,
                dxDomain,
                dxPassword,
                (msg) => setDxProgress(msg),
            );

            // Store DXTrade config (no password stored)
            setDXTradeConfig({
                server: dxServer,
                username: dxUsername,
                domain: dxDomain,
                accountCode: result.accountCode,
                token: result.token,
                connectedAt: new Date().toISOString(),
            });
            setDXTradeLastSync(new Date().toISOString());

            // Merge synced trades (closed + open)
            if (result.trades.length > 0 || result.positions.length > 0) {
                setTrades([...result.positions, ...result.trades]);
            }

            setDxSuccess(true);
            setDxProgress(`Connected! ${result.trades.length} trades synced.`);

            // Complete onboarding with live balance
            setTimeout(() => finish(result.balance), 1500);
        } catch (e) {
            setDxError(e instanceof Error ? e.message : 'Connection failed. Check your credentials and server URL.');
        } finally {
            setDxConnecting(false);
        }
    }

    const canNext =
        step === 'firm' ? selectedFirm !== null :
            step === 'balance' ? balNum >= 100 :
                step === 'rules' ? derivedDailyLimit > 0 :
                    step === 'connect' ? false : // connect step uses its own buttons
                        true;

    if (done) {
        return (
            <div className={styles.root}>
                <motion.div
                    className={styles.doneScreen}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                >
                    <div className={styles.doneIcon}>
                        <Check size={32} strokeWidth={3} />
                    </div>
                    <h2 className={styles.doneTitle}>You&#39;re all set.</h2>
                    <p className={styles.doneSub}>Your risk rules are locked in. Time to trade with discipline.</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <div className={styles.logo}>
                    <Shield size={16} strokeWidth={2.5} />
                    <span>RiskGuardian</span>
                </div>
                <div className={styles.stepCount}>{stepIndex + 1} / {STEPS.length}</div>
            </div>

            <div className={styles.progressTrack}>
                <motion.div
                    className={styles.progressFill}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                />
            </div>

            <div className={styles.body}>
                <AnimatePresence mode="wait" custom={dir}>
                    <motion.div
                        key={step}
                        custom={dir}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        className={styles.stepWrap}
                    >

                        {/* STEP 1 — Firm */}
                        {step === 'firm' && (
                            <div className={styles.step}>
                                <div className={styles.stepIconBalance}>
                                    <Building2 size={24} />
                                </div>
                                <h1 className={styles.stepTitle}>Who are you trading with?</h1>
                                <p className={styles.stepSub}>
                                    Select your prop firm to automatically sync their daily loss limits, drawdown rules, and leverage.
                                </p>

                                <div className={styles.assetGrid} style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                                    {PROP_FIRMS.map(firm => (
                                        <button
                                            key={firm.name}
                                            className={`${styles.assetCard} ${selectedFirm?.name === firm.name ? styles.assetCardActive : ''}`}
                                            onClick={() => setSelectedFirm(firm)}
                                            style={{ flexDirection: 'row', alignItems: 'center', textAlign: 'left', padding: '16px 20px', gap: '16px' }}
                                        >
                                            <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {getFirmLogo(firm.name) ? (
                                                    <img src={getFirmLogo(firm.name) as string} alt={firm.name} style={{ width: '100%', height: '100%', borderRadius: 4, objectFit: 'contain' }} />
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>
                                                        {firm.dailyPct > 0 ? <Building2 size={24} /> : <Settings2 size={24} />}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div className={styles.assetLabel} style={{ marginBottom: 4 }}>{firm.name}</div>
                                                <div className={styles.assetSub}>
                                                    {firm.dailyPct > 0
                                                        ? `${firm.dailyPct}% Daily Loss · ${firm.maxDrawPct}% Max Drawdown`
                                                        : 'Set my own manual limits'}
                                                </div>
                                            </div>
                                            {selectedFirm?.name === firm.name && (
                                                <div className={styles.assetCheck} style={{ position: 'relative', top: 0, right: 0 }}>
                                                    <Check size={10} strokeWidth={3} />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* STEP 2 — Balance */}
                        {step === 'balance' && (
                            <div className={styles.step}>
                                <div className={styles.stepIconBalance}>
                                    <DollarSign size={24} />
                                </div>
                                <h1 className={styles.stepTitle}>What&#39;s your account size?</h1>
                                <p className={styles.stepSub}>
                                    Enter the exact starting capital or current balance. We will use this to calculate your hard risk limits.
                                </p>
                                <div className={styles.bigInputWrap}>
                                    <span className={styles.bigInputPrefix}>$</span>
                                    <input
                                        className={styles.bigInput}
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="50000"
                                        value={balance}
                                        onChange={e => setBalance(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                {balNum > 0 && balNum < 100 && (
                                    <p className={styles.inputHintWarning}>Minimum account size is $100</p>
                                )}
                                {balNum >= 100 && (
                                    <p className={styles.inputHintSuccess}>
                                        ${balNum.toLocaleString()} — limits will be generated off this balance.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* STEP 3 — Rules Preview / Custom */}
                        {step === 'rules' && (
                            <div className={styles.step}>
                                <div className={styles.stepIconRisk}>
                                    <Shield size={24} />
                                </div>
                                <h1 className={styles.stepTitle}>Review your risk limits</h1>
                                <p className={styles.stepSub}>
                                    These are the maximum boundaries for your account. RiskGuardian will warn you before you hit them.
                                </p>

                                {isCustom ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 400, margin: '0 auto' }}>
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Daily Loss Limit (USD)</label>
                                            <div className={styles.bigInputWrap} style={{ margin: 0 }}>
                                                <span className={styles.bigInputPrefix}>$</span>
                                                <input className={styles.bigInput} type="number" value={customDaily} onChange={e => setCustomDaily(e.target.value)} placeholder="500" />
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>Max Drawdown Limit (USD)</label>
                                            <div className={styles.bigInputWrap} style={{ margin: 0 }}>
                                                <span className={styles.bigInputPrefix}>$</span>
                                                <input className={styles.bigInput} type="number" value={customDrawdown} onChange={e => setCustomDrawdown(e.target.value)} placeholder="1000" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400, margin: '0 auto' }}>
                                        <div style={{ padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border-medium)' }}>
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Daily Loss Limit ({selectedFirm?.dailyPct}%)</div>
                                            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-danger)' }}>${derivedDailyLimit.toLocaleString()}</div>
                                        </div>
                                        <div style={{ padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border-medium)' }}>
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Max Trailing Drawdown ({selectedFirm?.maxDrawPct}%)</div>
                                            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-danger)' }}>${derivedMaxDrawdown.toLocaleString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, background: 'rgba(166,255,77,0.05)', border: '1px solid var(--border-accent)', borderRadius: 8 }}>
                                            <AlertTriangle size={16} className="text-accent" style={{ marginTop: 2, flexShrink: 0 }} />
                                            <p style={{ fontSize: 12, color: 'var(--text-primary)', textAlign: 'left', margin: 0, lineHeight: 1.5 }}>
                                                <strong>Max Risk Per Trade:</strong> Automatically set to {maxRiskPercent.toFixed(1)}%. You can adjust this later in Settings.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 4 — Asset Type */}
                        {step === 'asset' && (
                            <div className={styles.step}>
                                <div className={styles.stepIconAsset}>
                                    <TrendingUp size={24} />
                                </div>
                                <h1 className={styles.stepTitle}>What do you trade?</h1>
                                <p className={styles.stepSub}>
                                    Sets your default calculator. You can always switch per trade.
                                </p>
                                <div className={styles.assetGrid}>
                                    {ASSET_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            className={`${styles.assetCard} ${asset === opt.value ? styles.assetCardActive : ''}`}
                                            onClick={() => setAsset(opt.value as typeof asset)}
                                        >
                                            <span className={styles.assetEmoji}>{opt.icon}</span>
                                            <span className={styles.assetLabel}>{opt.label}</span>
                                            <span className={styles.assetSub}>{opt.sub}</span>
                                            {asset === opt.value && (
                                                <div className={styles.assetCheck}>
                                                    <Check size={10} strokeWidth={3} />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* STEP 5 — DXTrade Connect */}
                        {step === 'connect' && (
                            <div className={styles.step}>
                                <div className={styles.stepIconAsset}>
                                    <Wifi size={24} />
                                </div>
                                <h1 className={styles.stepTitle}>Connect DXTrade Live</h1>
                                <p className={styles.stepSub}>
                                    Link your Tradeify DXTrade account to auto-sync your balance, trade history, and open positions. Your credentials stay on your device.
                                </p>

                                {dxSuccess ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' }}
                                    >
                                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(166,255,77,0.12)', border: '1px solid rgba(166,255,77,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Check size={28} color="#A6FF4D" strokeWidth={2.5} />
                                        </div>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#A6FF4D', fontWeight: 700, textAlign: 'center' }}>{dxProgress}</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', textAlign: 'center' }}>Setting up your dashboard…</p>
                                    </motion.div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 400, margin: '0 auto' }}>
                                        {/* Server */}
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>DXTrade Server</label>
                                            <input
                                                className={styles.bigInput}
                                                style={{ fontSize: 14, padding: '12px 14px', background: '#0d0f14', border: '1px solid #1a1c24', borderRadius: 6, color: '#e2e8f0', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
                                                value={dxServer}
                                                onChange={e => setDxServer(e.target.value)}
                                                placeholder="live.tradeify.com"
                                                autoCapitalize="none"
                                                autoCorrect="off"
                                            />
                                        </div>
                                        {/* Username */}
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>DXTrade Username</label>
                                            <input
                                                className={styles.bigInput}
                                                style={{ fontSize: 14, padding: '12px 14px', background: '#0d0f14', border: '1px solid #1a1c24', borderRadius: 6, color: '#e2e8f0', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
                                                value={dxUsername}
                                                onChange={e => setDxUsername(e.target.value)}
                                                placeholder="your_username"
                                                autoCapitalize="none"
                                                autoCorrect="off"
                                            />
                                        </div>
                                        {/* Domain — hidden by default (most users use "default") */}
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Domain <span style={{ color: '#374151' }}>(usually "default")</span></label>
                                            <input
                                                className={styles.bigInput}
                                                style={{ fontSize: 14, padding: '12px 14px', background: '#0d0f14', border: '1px solid #1a1c24', borderRadius: 6, color: '#e2e8f0', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
                                                value={dxDomain}
                                                onChange={e => setDxDomain(e.target.value)}
                                                placeholder="default"
                                                autoCapitalize="none"
                                                autoCorrect="off"
                                            />
                                        </div>
                                        {/* Password */}
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>DXTrade Password</label>
                                            <input
                                                className={styles.bigInput}
                                                style={{ fontSize: 14, padding: '12px 14px', background: '#0d0f14', border: '1px solid #1a1c24', borderRadius: 6, color: '#e2e8f0', width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
                                                type="password"
                                                value={dxPassword}
                                                onChange={e => setDxPassword(e.target.value)}
                                                placeholder="••••••••"
                                            />
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#374151', display: 'block', marginTop: 5 }}>
                                                Stored locally on your device only. Never sent to our servers.
                                            </span>
                                        </div>

                                        {/* Progress / Error */}
                                        {dxConnecting && dxProgress && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(166,255,77,0.05)', border: '1px solid rgba(166,255,77,0.15)', borderRadius: 6 }}>
                                                <Loader2 size={12} color="#A6FF4D" style={{ animation: 'spin 1s linear infinite' }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#A6FF4D' }}>{dxProgress}</span>
                                            </div>
                                        )}
                                        {dxError && (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 6 }}>
                                                <WifiOff size={12} color="#ff4757" style={{ marginTop: 1, flexShrink: 0 }} />
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757' }}>{dxError}</span>
                                            </div>
                                        )}

                                        {/* Connect button */}
                                        <button
                                            onClick={handleDXConnect}
                                            disabled={dxConnecting || !dxUsername || !dxPassword}
                                            style={{
                                                padding: '14px', background: dxConnecting ? 'rgba(166,255,77,0.15)' : '#A6FF4D',
                                                border: 'none', borderRadius: 6, cursor: dxConnecting ? 'not-allowed' : 'pointer',
                                                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, color: '#000',
                                                letterSpacing: '0.08em', textTransform: 'uppercase',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                                opacity: !dxUsername || !dxPassword ? 0.4 : 1,
                                            }}
                                        >
                                            {dxConnecting
                                                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Connecting…</>
                                                : <><Wifi size={14} /> Connect &amp; Sync Trades</>
                                            }
                                        </button>

                                        {/* Skip */}
                                        <button
                                            onClick={() => finish()}
                                            disabled={dxConnecting}
                                            style={{
                                                padding: '12px', background: 'transparent', border: '1px solid #1a1c24',
                                                borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                                                fontSize: 11, color: '#4b5563', letterSpacing: '0.06em', textTransform: 'uppercase',
                                            }}
                                        >
                                            Skip — I&apos;ll import manually
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Hide nav on connect step — that step has its own buttons */}
            {step !== 'connect' && (
                <div className={styles.navRow}>
                    {stepIndex > 0 ? (
                        <button className={styles.backBtn} onClick={goBack}>
                            <ChevronLeft size={18} /> Back
                        </button>
                    ) : <div />}

                    <button
                        className={`${styles.nextBtn} ${!canNext ? styles.nextBtnDisabled : ''}`}
                        onClick={goNext}
                        disabled={!canNext}
                    >
                        Continue
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}
            {step === 'connect' && !dxSuccess && (
                <div className={styles.navRow}>
                    <button className={styles.backBtn} onClick={goBack} disabled={dxConnecting}>
                        <ChevronLeft size={18} /> Back
                    </button>
                    <div />
                </div>
            )}
        </div>
    );
}
