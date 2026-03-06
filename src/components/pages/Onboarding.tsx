'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, PROP_FIRMS, type PropFirmPreset } from '@/store/appStore';
import { Shield, DollarSign, TrendingUp, ChevronRight, ChevronLeft, Check, Building2, AlertTriangle, Bitcoin, LineChart, CandlestickChart, CircleDollarSign } from 'lucide-react';
import styles from './Onboarding.module.css';

const STEPS = ['firm', 'balance', 'rules', 'asset'] as const;
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

export default function Onboarding() {
    const { updateAccount, completeOnboarding } = useAppStore();

    const [step, setStep] = useState<Step>('firm');
    const [dir, setDir] = useState(1);

    // State
    const [selectedFirm, setSelectedFirm] = useState<PropFirmPreset | null>(null);
    const [balance, setBalance] = useState('');
    const [customDaily, setCustomDaily] = useState('');
    const [customDrawdown, setCustomDrawdown] = useState('');
    const [asset, setAsset] = useState<'crypto' | 'futures' | 'forex' | 'stocks'>('crypto');
    const [done, setDone] = useState(false);

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
        else finish();
    }

    function goBack() {
        setDir(-1);
        if (step === 'balance') setStep('firm');
        else if (step === 'rules') setStep('balance');
        else if (step === 'asset') setStep('rules');
    }

    function finish() {
        setDone(true);
        updateAccount({
            balance: balNum,
            startingBalance: balNum,
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

    const canNext =
        step === 'firm' ? selectedFirm !== null :
            step === 'balance' ? balNum >= 100 :
                step === 'rules' ? derivedDailyLimit > 0 :
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
                    <span>PropGuard</span>
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
                                            <span style={{ fontSize: 24 }}>{firm.dailyPct > 0 ? '🛡️' : '⚙️'}</span>
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
                                    These are the maximum boundaries for your account. PropGuard will warn you before you hit them.
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

                    </motion.div>
                </AnimatePresence>
            </div>

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
                    {step === 'asset' ? 'Enter App' : 'Continue'}
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
}
