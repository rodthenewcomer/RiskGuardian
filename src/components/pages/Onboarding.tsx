'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, PROP_FIRMS, type PropFirmPreset } from '@/store/appStore';
import { DollarSign, TrendingUp, ChevronRight, ChevronLeft, Check, Building2, AlertTriangle, Bitcoin, LineChart, CandlestickChart, CircleDollarSign, Settings2, Shield } from 'lucide-react';
import styles from './Onboarding.module.css';
import { useTranslation } from '@/i18n/useTranslation';
import Logo from '@/components/ui/Logo';

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

const getFirmLogo = (name: string) => {
    if (name.includes('Tradeify')) return 'https://www.google.com/s2/favicons?domain=tradeify.co&sz=128';
    if (name.includes('Funding Pips')) return 'https://www.google.com/s2/favicons?domain=fundingpips.com&sz=128';
    if (name.includes('FTMO')) return 'https://www.google.com/s2/favicons?domain=ftmo.com&sz=128';
    if (name.includes('5%ers')) return 'https://www.google.com/s2/favicons?domain=the5ers.com&sz=128';
    return null;
};

export default function Onboarding() {
    const { updateAccount, completeOnboarding } = useAppStore();
    const { t } = useTranslation();
    const { language } = useAppStore();
    const lang = language ?? 'en';

    const stepLabels: Record<string, string> = {
        firm: lang === 'fr' ? 'Société' : 'Firm',
        balance: lang === 'fr' ? 'Solde' : 'Balance',
        rules: lang === 'fr' ? 'Règles' : 'Rules',
        asset: lang === 'fr' ? 'Actif' : 'Asset',
    };

    const ASSET_OPTIONS_LABELS: Record<string, { label: string; sub: string }> = {
        crypto: { label: lang === 'fr' ? 'Crypto' : 'Crypto', sub: 'BTC, ETH, SOL, DOGE' },
        futures: { label: lang === 'fr' ? 'Contrats à terme' : 'Futures', sub: 'ES, NQ, MNQ, MES, CL' },
        forex: { label: 'Forex', sub: 'EUR/USD, GBP/USD, JPY' },
        stocks: { label: lang === 'fr' ? 'Actions' : 'Stocks', sub: 'AAPL, TSLA, NVDA, SPY' },
    };

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

    const canNext =
        step === 'firm' ? selectedFirm !== null :
            step === 'balance' ? balNum >= 100 :
                step === 'rules' ? derivedDailyLimit > 0 :
                    true; // asset step always allows next

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
                    <h2 className={styles.doneTitle}>{lang === 'fr' ? 'Tout est prêt.' : "You're all set."}</h2>
                    <p className={styles.doneSub}>{lang === 'fr' ? 'Vos règles de risque sont verrouillées. Tradez avec discipline.' : 'Your risk rules are locked in. Time to trade with discipline.'}</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <div className={styles.header}>
                <div className={styles.logo}>
                    <Logo size="sm" />
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
                                <h1 className={styles.stepTitle}>{lang === 'fr' ? 'Avec qui tradez-vous ?' : 'Who are you trading with?'}</h1>
                                <p className={styles.stepSub}>
                                    {lang === 'fr' ? 'Sélectionnez votre société de prop trading pour synchroniser automatiquement leurs limites de perte journalière, règles de drawdown et levier.' : 'Select your prop firm to automatically sync their daily loss limits, drawdown rules, and leverage.'}
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
                                                        ? `${firm.dailyPct}% ${lang === 'fr' ? 'Perte journalière' : 'Daily Loss'} · ${firm.maxDrawPct}% ${lang === 'fr' ? 'Drawdown max' : 'Max Drawdown'}`
                                                        : (lang === 'fr' ? 'Définir mes propres limites' : 'Set my own manual limits')}
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
                                <h1 className={styles.stepTitle}>{lang === 'fr' ? 'Quel est le solde de votre compte ?' : "What's your account size?"}</h1>
                                <p className={styles.stepSub}>
                                    {lang === 'fr' ? 'Entrez le capital de départ exact ou le solde actuel. Nous l\'utiliserons pour calculer vos limites de risque.' : 'Enter the exact starting capital or current balance. We will use this to calculate your hard risk limits.'}
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
                                    <p className={styles.inputHintWarning}>{lang === 'fr' ? 'Solde minimum requis : 100 $' : 'Minimum account size is $100'}</p>
                                )}
                                {balNum >= 100 && (
                                    <p className={styles.inputHintSuccess}>
                                        {lang === 'fr' ? `${balNum.toLocaleString('fr-FR')} $ — les limites seront calculées sur ce solde.` : `$${balNum.toLocaleString()} — limits will be generated off this balance.`}
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
                                <h1 className={styles.stepTitle}>{lang === 'fr' ? 'Confirmez vos règles de trading' : 'Review your risk limits'}</h1>
                                <p className={styles.stepSub}>
                                    {lang === 'fr' ? 'Ce sont les limites maximales pour votre compte. RiskGuardian vous avertira avant de les atteindre.' : 'These are the maximum boundaries for your account. RiskGuardian will warn you before you hit them.'}
                                </p>

                                {isCustom ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 400, margin: '0 auto' }}>
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>{lang === 'fr' ? 'Limite de perte journalière (USD)' : 'Daily Loss Limit (USD)'}</label>
                                            <div className={styles.bigInputWrap} style={{ margin: 0 }}>
                                                <span className={styles.bigInputPrefix}>$</span>
                                                <input className={styles.bigInput} type="number" value={customDaily} onChange={e => setCustomDaily(e.target.value)} placeholder="500" />
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'left' }}>
                                            <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>{lang === 'fr' ? 'Limite de drawdown max (USD)' : 'Max Drawdown Limit (USD)'}</label>
                                            <div className={styles.bigInputWrap} style={{ margin: 0 }}>
                                                <span className={styles.bigInputPrefix}>$</span>
                                                <input className={styles.bigInput} type="number" value={customDrawdown} onChange={e => setCustomDrawdown(e.target.value)} placeholder="1000" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400, margin: '0 auto' }}>
                                        <div style={{ padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border-medium)' }}>
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{lang === 'fr' ? `Limite de perte journalière (${selectedFirm?.dailyPct}%)` : `Daily Loss Limit (${selectedFirm?.dailyPct}%)`}</div>
                                            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-danger)' }}>${derivedDailyLimit.toLocaleString()}</div>
                                        </div>
                                        <div style={{ padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border-medium)' }}>
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{lang === 'fr' ? `Drawdown maximum glissant (${selectedFirm?.maxDrawPct}%)` : `Max Trailing Drawdown (${selectedFirm?.maxDrawPct}%)`}</div>
                                            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-danger)' }}>${derivedMaxDrawdown.toLocaleString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, background: 'rgba(253,200,0,0.05)', border: '1px solid var(--border-accent)', borderRadius: 8 }}>
                                            <AlertTriangle size={16} className="text-accent" style={{ marginTop: 2, flexShrink: 0 }} />
                                            <p style={{ fontSize: 12, color: 'var(--text-primary)', textAlign: 'left', margin: 0, lineHeight: 1.5 }}>
                                                {lang === 'fr'
                                                    ? <><strong>Risque max par trade :</strong> Défini automatiquement à {maxRiskPercent.toFixed(1)}% (en supposant 5 trades par jour). Vous pouvez l&apos;ajuster dans les Paramètres.</>
                                                    : <><strong>Max Risk Per Trade:</strong> Automatically set to {maxRiskPercent.toFixed(1)}% (assuming 5 trades per day). You can adjust this later in Settings.</>
                                                }
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
                                <h1 className={styles.stepTitle}>{lang === 'fr' ? 'Que tradez-vous ?' : 'What do you trade?'}</h1>
                                <p className={styles.stepSub}>
                                    {lang === 'fr' ? 'Définit votre calculateur par défaut. Vous pouvez toujours changer par trade.' : 'Sets your default calculator. You can always switch per trade.'}
                                </p>
                                <div className={styles.assetGrid}>
                                    {ASSET_OPTIONS.map(opt => {
                                        const translated = ASSET_OPTIONS_LABELS[opt.value] ?? { label: opt.label, sub: opt.sub };
                                        return (
                                            <button
                                                key={opt.value}
                                                className={`${styles.assetCard} ${asset === opt.value ? styles.assetCardActive : ''}`}
                                                onClick={() => setAsset(opt.value as typeof asset)}
                                            >
                                                <span className={styles.assetEmoji}>{opt.icon}</span>
                                                <span className={styles.assetLabel}>{translated.label}</span>
                                                <span className={styles.assetSub}>{translated.sub}</span>
                                                {asset === opt.value && (
                                                    <div className={styles.assetCheck}>
                                                        <Check size={10} strokeWidth={3} />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>

            <div className={styles.navRow}>
                {stepIndex > 0 ? (
                    <button className={styles.backBtn} onClick={goBack}>
                        <ChevronLeft size={18} /> {lang === 'fr' ? 'Retour' : 'Back'}
                    </button>
                ) : <div />}

                <button
                    className={`${styles.nextBtn} ${!canNext ? styles.nextBtnDisabled : ''}`}
                    onClick={goNext}
                    disabled={!canNext}
                >
                    {step === 'asset'
                        ? (lang === 'fr' ? 'Terminer' : 'Finish')
                        : (lang === 'fr' ? 'Suivant' : 'Next')
                    }
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
}
