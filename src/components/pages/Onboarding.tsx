'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { Shield, DollarSign, TrendingUp, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import styles from './Onboarding.module.css';

const STEPS = ['balance', 'risk', 'asset'] as const;
type Step = typeof STEPS[number];

const ASSET_OPTIONS = [
    { value: 'crypto', label: 'Crypto', sub: 'BTC, ETH, SOL, DOGE', icon: '₿' },
    { value: 'futures', label: 'Futures', sub: 'ES, NQ, MNQ, MES, CL', icon: '📈' },
    { value: 'forex', label: 'Forex', sub: 'EUR/USD, GBP/USD, JPY', icon: '💱' },
    { value: 'stocks', label: 'Stocks', sub: 'AAPL, TSLA, NVDA, SPY', icon: '📊' },
] as const;

const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
};

export default function Onboarding() {
    const { updateAccount, completeOnboarding } = useAppStore();

    const [step, setStep] = useState<Step>('balance');
    const [dir, setDir] = useState(1);
    const [balance, setBalance] = useState('');
    const [riskMode, setRiskMode] = useState<'percent' | 'fixed'>('percent');
    const [riskPct, setRiskPct] = useState(2);
    const [dailyFixed, setDailyFixed] = useState('');
    const [asset, setAsset] = useState<'crypto' | 'futures' | 'forex' | 'stocks'>('crypto');
    const [done, setDone] = useState(false);

    const balNum = parseFloat(balance.replace(/,/g, '')) || 0;
    const derivedLimit = riskMode === 'percent'
        ? Math.round((balNum * riskPct) / 100)
        : parseFloat(dailyFixed.replace(/,/g, '')) || 0;
    const limitDisplay = derivedLimit > 0 ? `$${derivedLimit.toLocaleString()}` : '—';

    const stepIndex = STEPS.indexOf(step);
    const progress = ((stepIndex + 1) / STEPS.length) * 100;

    function goNext() {
        setDir(1);
        if (step === 'balance') setStep('risk');
        else if (step === 'risk') setStep('asset');
        else finish();
    }

    function goBack() {
        setDir(-1);
        if (step === 'risk') setStep('balance');
        else if (step === 'asset') setStep('risk');
    }

    function finish() {
        setDone(true);
        updateAccount({
            balance: balNum,
            dailyLossLimit: derivedLimit,
            maxRiskPercent: riskPct,
            assetType: asset,
        });
        setTimeout(() => completeOnboarding(), 1200);
    }

    const canNext =
        step === 'balance' ? balNum >= 100 :
            step === 'risk' ? derivedLimit > 0 :
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
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.logo}>
                    <Shield size={16} strokeWidth={2.5} />
                    <span>PropGuard</span>
                </div>
                <div className={styles.stepCount}>{stepIndex + 1} / {STEPS.length}</div>
            </div>

            {/* Progress bar */}
            <div className={styles.progressTrack}>
                <motion.div
                    className={styles.progressFill}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                />
            </div>

            {/* Step content */}
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

                        {/* STEP 1 — Balance */}
                        {step === 'balance' && (
                            <div className={styles.step}>
                                <div className={styles.stepIconBalance}>
                                    <DollarSign size={24} />
                                </div>
                                <h1 className={styles.stepTitle}>What&#39;s your account balance?</h1>
                                <p className={styles.stepSub}>
                                    Enter the exact amount in your trading account right now.
                                </p>
                                <div className={styles.bigInputWrap}>
                                    <span className={styles.bigInputPrefix}>$</span>
                                    <input
                                        className={styles.bigInput}
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="10,000"
                                        value={balance}
                                        onChange={e => setBalance(e.target.value)}
                                        autoFocus
                                        id="onboard-balance"
                                    />
                                </div>
                                {balNum > 0 && balNum < 100 && (
                                    <p className={styles.inputHintWarning}>Minimum account size is $100</p>
                                )}
                                {balNum >= 100 && (
                                    <p className={styles.inputHintSuccess}>
                                        ${balNum.toLocaleString()} — ready to set your risk rules
                                    </p>
                                )}
                            </div>
                        )}

                        {/* STEP 2 — Daily Loss Limit */}
                        {step === 'risk' && (
                            <div className={styles.step}>
                                <div className={styles.stepIconRisk}>
                                    <TrendingUp size={24} />
                                </div>
                                <h1 className={styles.stepTitle}>Set your daily loss limit</h1>
                                <p className={styles.stepSub}>
                                    The max you agree to lose in a single trading day. PropGuard enforces this automatically.
                                </p>

                                <div className={styles.modeToggle}>
                                    <button
                                        className={`${styles.modeBtn} ${riskMode === 'percent' ? styles.modeBtnActive : ''}`}
                                        onClick={() => setRiskMode('percent')}
                                    >
                                        % of Balance
                                    </button>
                                    <button
                                        className={`${styles.modeBtn} ${riskMode === 'fixed' ? styles.modeBtnActive : ''}`}
                                        onClick={() => setRiskMode('fixed')}
                                    >
                                        Fixed $
                                    </button>
                                </div>

                                {riskMode === 'percent' ? (
                                    <div className={styles.sliderSection}>
                                        <div className={styles.sliderValue}>
                                            <span className={styles.sliderBig}>{riskPct}%</span>
                                            <span className={styles.sliderSub}>{limitDisplay} / day</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="10"
                                            step="0.5"
                                            value={riskPct}
                                            onChange={e => setRiskPct(parseFloat(e.target.value))}
                                            className={styles.slider}
                                            aria-label="Daily loss limit percentage"
                                        />
                                        <div className={styles.sliderLabels}>
                                            <span>0.5% — conservative</span>
                                            <span>10% — aggressive</span>
                                        </div>
                                        <div className={styles.riskTip}>
                                            {riskPct <= 2 && <span className={styles.riskTipGood}>✓ Professional standard (1–2%)</span>}
                                            {riskPct > 2 && riskPct <= 5 && <span className={styles.riskTipWarn}>⚠ Moderate risk (2–5%)</span>}
                                            {riskPct > 5 && <span className={styles.riskTipBad}>🔴 High risk — prop firms cap at 4–5%</span>}
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.bigInputWrap}>
                                        <span className={styles.bigInputPrefix}>$</span>
                                        <input
                                            className={styles.bigInput}
                                            type="number"
                                            inputMode="decimal"
                                            placeholder="500"
                                            value={dailyFixed}
                                            onChange={e => setDailyFixed(e.target.value)}
                                            id="onboard-daily"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 3 — Asset Type */}
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

            {/* Nav buttons */}
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
