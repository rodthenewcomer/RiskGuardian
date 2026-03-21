'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    Shield, Calculator, Brain, BookOpen, BarChart2, Zap,
    Settings, Target, TrendingUp, Check,
} from 'lucide-react';
import styles from './LandingPage.module.css';
import Logo from '@/components/ui/Logo';
import { joinWaitlist } from '@/lib/supabaseSync';

function useCounter(target: number, duration = 1400, start = false) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!start) return;
        let startTime: number | null = null;
        const step = (ts: number) => {
            if (!startTime) startTime = ts;
            const progress = Math.min((ts - startTime) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 4);
            setVal(Math.floor(ease * target));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [target, duration, start]);
    return val;
}

function useInView(threshold = 0.15) {
    const ref = useRef<HTMLDivElement>(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setInView(true); obs.disconnect(); }
        }, { threshold });
        if (ref.current) obs.observe(ref.current);
        return () => obs.disconnect();
    }, [threshold]);
    return { ref, inView };
}

function StatCard({ value, suffix, label, divisor = 1 }: { value: number; suffix: string; label: string; divisor?: number }) {
    const { ref, inView } = useInView();
    const count = useCounter(value, 1600, inView);
    const display = divisor !== 1 ? (count / divisor).toFixed(1) : count.toLocaleString();
    return (
        <div ref={ref} className={`${styles.statCard} ${inView ? styles.statCardVisible : ''}`}>
            <div className={styles.statValue}>{display}<span className={styles.statSuffix}>{suffix}</span></div>
            <div className={styles.statLabel}>{label}</div>
        </div>
    );
}

function FeatureCard({ icon, title, desc, delay = 0 }: { icon: React.ReactNode; title: string; desc: string; delay?: number }) {
    const { ref, inView } = useInView();
    return (
        <div ref={ref} className={`${styles.featureCard} ${inView ? styles.featureCardVisible : ''}`} style={{ transitionDelay: `${delay}ms` }}>
            <div className={styles.featureIcon}>{icon}</div>
            <h3 className={styles.featureTitle}>{title}</h3>
            <p className={styles.featureDesc}>{desc}</p>
        </div>
    );
}

function TestimonialCard({ quote, name, role, initials, avatarColor, delay = 0 }: { quote: string; name: string; role: string; initials: string; avatarColor: string; delay?: number }) {
    const { ref, inView } = useInView();
    return (
        <div ref={ref} className={`${styles.testimonialCard} ${inView ? styles.testimonialCardVisible : ''}`} style={{ transitionDelay: `${delay}ms` }}>
            <p className={styles.testimonialQuote}>&#8220;{quote}&#8221;</p>
            <div className={styles.testimonialAuthor}>
                <div className={styles.testimonialAvatar} style={{ background: avatarColor }}>{initials}</div>
                <div>
                    <div className={styles.testimonialName}>{name}</div>
                    <div className={styles.testimonialRole}>{role}</div>
                </div>
            </div>
        </div>
    );
}

function StepCard({ icon, title, desc, delay = 0 }: { icon: React.ReactNode; title: string; desc: string; delay?: number }) {
    const { ref, inView } = useInView();
    return (
        <div ref={ref} className={`${styles.step} ${inView ? styles.stepVisible : ''}`} style={{ transitionDelay: `${delay}ms` }}>
            <div className={styles.stepIcon}>{icon}</div>
            <div className={styles.stepBody}>
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepDesc}>{desc}</p>
            </div>
        </div>
    );
}

export default function LandingPage() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'loading' | 'success' | 'already'>('idle');
    const [lang, setLang] = useState<'en' | 'fr'>('en');

    useEffect(() => {
        const bl = (navigator.language ?? '').toLowerCase();
        if (bl.startsWith('fr')) setLang('fr');
    }, []);

    async function handleWaitlist(e: React.FormEvent) {
        e.preventDefault();
        if (!email || waitlistStatus === 'loading') return;
        setWaitlistStatus('loading');
        const result = await joinWaitlist(email, lang);
        setWaitlistStatus(result === 'error' ? 'idle' : result === 'already' ? 'already' : 'success');
    }

    const isFr = lang === 'fr';
    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

    const T = {
        heroBadge: isFr ? 'Intelligence Risque Trading — Zéro Émotion' : 'Trading Risk Intelligence — Zero Emotion',
        heroTitle1: isFr ? 'Arrêtez de trader avec les' : 'Stop trading with',
        heroTitleEm: isFr ? 'émotions.' : 'emotions.',
        heroTitle2: isFr ? 'Commencez à trader avec des' : 'Start trading with',
        heroTitleGlow: isFr ? 'règles.' : 'rules.',
        heroSub: isFr
            ? "RiskGuardian bloque vos violations de règles avant qu'elles arrivent. Calcul de position, garde journalière, journal de trading et coach IA — tout pour protéger votre compte funded."
            : 'RiskGuardian hard-blocks rule violations before they happen. Position sizing, daily guard, trade journal, and AI coach — everything to protect your funded account.',
        heroCta1: isFr ? 'Protéger mon compte — Gratuit' : 'Protect My Account — Free',
        heroCta2: isFr ? 'Voir comment ça marche →' : 'See how it works →',
        heroSocial: isFr ? 'traders funded protègent leur capital' : 'funded traders protecting their capital',
        navFeatures: isFr ? 'Fonctionnalités' : 'Features',
        navHow: isFr ? 'Comment ça marche' : 'How it works',
        navPricing: isFr ? 'Tarifs' : 'Pricing',
        navLaunchApp: isFr ? "Lancer l'app →" : 'Launch App →',
        mockGuardLabel: isFr ? 'Garde Journalière' : 'Daily Guard',
        mockWinRate: isFr ? 'Win Rate' : 'Win Rate',
        mockPositionSize: isFr ? 'Taille Position' : 'Position Size',
        mockBalance: isFr ? 'Solde' : 'Balance',
        proofTraders: isFr ? 'Traders Actifs' : 'Active Traders',
        proofCompliance: isFr ? 'Respect Limite Journalière' : 'Daily Limit Compliance',
        proofRating: isFr ? 'Note Moyenne' : 'Average Rating',
        proofTrades: isFr ? 'Trades Calculés' : 'Trades Calculated',
        featuresSectionLabel: isFr ? 'Fonctionnalités' : 'Core Features',
        featuresSectionTitle: isFr ? "Tous les outils d'un trader discipliné" : 'Every tool a disciplined trader needs',
        featuresSectionSub: isFr
            ? "Conçu pour les traders actifs qui protègent leur capital avant tout."
            : 'Purpose-built for active traders serious about protecting their capital — not just growing it.',
        howSectionLabel: isFr ? 'Comment ça marche' : 'How It Works',
        howSectionTitle: isFr ? 'De la configuration au premier trade en 60 secondes' : 'From setup to first trade in 60 seconds',
        statsSectionLabel: isFr ? 'Les chiffres' : 'By the numbers',
        statsSectionTitle: isFr ? 'Un impact réel pour de vrais traders' : 'Real impact for real traders',
        statsUsers: isFr ? 'Utilisateurs actifs' : 'Active users',
        statsCompliance: isFr ? 'Respect limite journalière' : 'Daily limit compliance rate',
        statsTrades: isFr ? 'Trades calculés' : 'Trades calculated',
        statsRating: isFr ? 'Note moyenne' : 'Average rating',
        testimonialsSectionLabel: isFr ? 'Témoignages' : 'Trader Stories',
        testimonialsSectionTitle: isFr ? 'Créé par des traders, validé par des traders' : 'Built by traders, validated by traders',
        pricingLabel: isFr ? 'TARIFS' : 'PRICING',
        pricingTitle: isFr ? 'Simple. Transparent.' : 'Simple. Transparent.',
        pricingSub: isFr ? 'Commencez gratuitement, passez à Pro quand vous êtes prêt.' : "Start free. Upgrade when you're ready.",
        freeTier: isFr ? 'GRATUIT' : 'FREE',
        freePer: isFr ? '/mois' : '/month',
        freeDesc: isFr ? '1 compte prop firm, trades illimités' : '1 prop firm account, unlimited trades',
        freeFeatures: isFr
            ? ['Trades illimités', 'Garde de perte journalière', 'Calculateur de risque', 'Journal de trading', 'PWA mobile — sans app store']
            : ['Unlimited trades', 'Daily loss hard guard', 'Risk calculator', 'Trade journal', 'Mobile PWA — no app store needed'],
        freeBtn: isFr ? 'Commencer gratuitement →' : 'Start Free →',
        proTier: 'PRO',
        proPer: isFr ? '/mois' : '/month',
        proPrice: '$19',
        proDesc: isFr ? 'Pour les traders qui veulent passer leurs evals' : 'For traders who pass their evals',
        proPopular: isFr ? 'POPULAIRE' : 'POPULAR',
        proFeatures: isFr
            ? ['Tout le plan gratuit', 'IA comportementale (15+ patterns)', 'Analytics avancées — 10 onglets', 'Coach IA — règles personnalisées', 'Tags & sessions avancés', 'Multi-comptes prop firm', 'Support prioritaire']
            : ['Everything in Free', 'Behavioral AI — 15+ patterns detected', 'Deep analytics — 10 tabs', 'AI Coach — personalized daily rules', 'Advanced tags & session tracking', 'Multi prop firm accounts', 'Priority support'],
        proBtn: isFr ? 'Essai Pro 7 jours →' : 'Start 7-Day Pro Trial →',
        finalCtaTitle: isFr ? 'Un compte funded vaut trop pour jouer avec les règles.' : 'A funded account is too valuable to gamble with the rules.',
        finalCtaSub: isFr
            ? 'Rejoignez 2 400+ traders qui protègent leur capital avec des règles, pas des espoirs. Gratuit pour toujours, aucune carte requise.'
            : 'Join 2,400+ funded traders who protect their capital with rules, not hope. Free forever — no credit card.',
        finalCtaBtn: isFr ? 'Protéger mon compte maintenant →' : 'Protect My Account Now →',
        footerTagline: isFr ? 'Tradez avec des règles, pas des émotions.' : 'Trade with rules, not emotions.',
        footerProduct: isFr ? 'Produit' : 'Product',
        footerSupport: 'Support',
        footerFeatures: isFr ? 'Fonctionnalités' : 'Features',
        footerLaunch: isFr ? "Lancer l'app" : 'Launch App',
        footerPricing: isFr ? 'Tarifs' : 'Pricing',
        footerContact: 'Contact',
        footerPrivacy: isFr ? 'Confidentialité' : 'Privacy',
        footerTerms: isFr ? 'Conditions' : 'Terms',
        footerCopyright: isFr ? '© 2026 RiskGuardian. Tradez avec des règles, pas des émotions.' : '© 2026 RiskGuardian. Trade with rules, not emotions.',
    };

    const features = isFr ? [
        { icon: <Shield size={22} strokeWidth={2} />, title: 'Garde Journalière', desc: "Bloque définitivement le trading quand votre limite journalière est atteinte. Ne faites plus jamais sauter un compte funded à cause d'une violation de limite." },
        { icon: <Calculator size={22} strokeWidth={2} />, title: 'Dimensionnement Précis', desc: "Calculez la taille de lot exacte pour ne risquer que 1-2% de votre solde. Fonctionne pour la crypto, le forex et les futures." },
        { icon: <Brain size={22} strokeWidth={2} />, title: 'Coach IA Comportemental', desc: "Détecte le revenge trading, le surtrading et le tilt en temps réel. Coach IA alimenté par votre propre historique — pas des conseils génériques." },
        { icon: <BookOpen size={22} strokeWidth={2} />, title: 'Journal de Trading Avancé', desc: "Enregistrez chaque trade avec entrée, sortie, actif, P&L et tags de session. Filtrez, révisez et identifiez les patterns dans votre historique." },
        { icon: <BarChart2 size={22} strokeWidth={2} />, title: 'Moteur Analytique Profond', desc: "10 onglets analytiques : courbe de capitaux, win rate, durée de hold, drawdown, heatmap jour-de-semaine, radar d'instruments, et plus." },
        { icon: <Zap size={22} strokeWidth={2} />, title: 'Calculateur TP/SL Instantané', desc: "Entrez vos paramètres et obtenez TP, SL, ratio R:R et solde projeté — en moins de 5 secondes." },
    ] : [
        { icon: <Shield size={22} strokeWidth={2} />, title: 'Daily Loss Guard', desc: "Hard-blocks trading when your daily limit is hit. Never blow a funded account over a limit violation again." },
        { icon: <Calculator size={22} strokeWidth={2} />, title: 'Precision Position Sizing', desc: "Calculate the exact lot size that risks only 1-2% of your balance. Works for crypto, forex, and futures." },
        { icon: <Brain size={22} strokeWidth={2} />, title: 'Behavioral AI Coach', desc: "Detects revenge trading, overtrading, and tilt in real time. AI coach powered by your own trade history — not generic advice." },
        { icon: <BookOpen size={22} strokeWidth={2} />, title: 'Advanced Trade Journal', desc: "Log every trade with entry, exit, asset, P&L, and session tags. Filter, review, and spot patterns in your history." },
        { icon: <BarChart2 size={22} strokeWidth={2} />, title: 'Deep Analytics Engine', desc: "10 analytics tabs: equity curve, win rate, hold time, drawdown, day-of-week heatmap, instrument radar, and more." },
        { icon: <Zap size={22} strokeWidth={2} />, title: 'Instant TP/SL Calculator', desc: "Enter your trade parameters and get take profit, stop loss, R:R ratio, and projected balance — in under 5 seconds." },
    ];

    const testimonials = isFr ? [
        { name: 'Marcus T.', role: 'Trader Tradeify', initials: 'M', avatarColor: '#432DD7', quote: "Je faisais sauter ma limite journalière chaque semaine. RiskGuardian m'arrête avant que je fasse une bêtise. J'ai passé mon eval en 3 semaines." },
        { name: 'Sophie L.', role: 'Trader FTMO', initials: 'S', avatarColor: '#16A34A', quote: "L'analyse comportementale a montré que je revenge tradais chaque lundi matin. Changer cette seule habitude a fait passer mon win rate de 44% à 58%." },
        { name: 'Kevin R.', role: 'Trader Funding Pips', initials: 'K', avatarColor: '#DC2626', quote: "Le combo journal + analytics est dingue. Je comprends enfin pourquoi je gagne de l'argent certaines semaines et le perds la suivante." },
    ] : [
        { name: 'Marcus T.', role: 'Tradeify Trader', initials: 'M', avatarColor: '#432DD7', quote: "I was blowing my daily limit every week. RiskGuardian hard-stops me before I do something stupid. Passed my eval in 3 weeks." },
        { name: 'Sophie L.', role: 'FTMO Trader', initials: 'S', avatarColor: '#16A34A', quote: "The behavioral analysis showed I was revenge trading every Monday morning. Changed that one habit, my win rate went from 44% to 58%." },
        { name: 'Kevin R.', role: 'Funding Pips Trader', initials: 'K', avatarColor: '#DC2626', quote: "The journal + analytics combo is insane. I finally understand why I make money some weeks and lose it all the next." },
    ];

    const steps = isFr ? [
        { icon: <Settings size={22} strokeWidth={2} />, title: 'Configurez votre compte en 60 secondes', desc: 'Choisissez votre prop firm (Tradeify, FTMO, Funding Pips, etc.), entrez votre solde. Les règles se chargent automatiquement.' },
        { icon: <Target size={22} strokeWidth={2} />, title: 'Calculez chaque position avant de trader', desc: "Le Risk Engine vous donne la taille de lot exacte, la perte max et les cibles TP/SL avant de cliquer sur acheter." },
        { icon: <TrendingUp size={22} strokeWidth={2} />, title: 'Révisez, améliorez, répétez', desc: "Votre coach IA détecte les patterns, votre journal trace tout, vos analytics montrent la vérité." },
    ] : [
        { icon: <Settings size={22} strokeWidth={2} />, title: 'Set up your account in 60 seconds', desc: 'Pick your prop firm (Tradeify, FTMO, Funding Pips, etc.), enter your balance. Rules load automatically.' },
        { icon: <Target size={22} strokeWidth={2} />, title: 'Calculate every position before you trade', desc: 'The Risk Engine gives you exact lot size, max loss, and TP/SL targets before you click buy.' },
        { icon: <TrendingUp size={22} strokeWidth={2} />, title: 'Review, improve, repeat', desc: 'Your AI coach detects patterns, your journal tracks everything, your analytics show the truth.' },
    ];

    return (
        <div className={styles.root}>

            {/* NAV */}
            <nav className={styles.nav} role="navigation">
                <div className={styles.navInner}>
                    <Link href="/" className={styles.navLogo} aria-label="RiskGuardian home">
                        <Logo size="sm" theme="light" />
                    </Link>

                    <div className={styles.navLinks}>
                        <a href="#features" className={styles.navLink}>{T.navFeatures}</a>
                        <a href="#how" className={styles.navLink}>{T.navHow}</a>
                        <a href="#pricing" className={styles.navLink}>{T.navPricing}</a>
                    </div>

                    <div className={styles.navCta}>
                        <button
                            onClick={() => setLang(l => l === 'en' ? 'fr' : 'en')}
                            style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '5px 10px', background: 'transparent', border: '1px solid #1C293C', cursor: 'pointer', color: '#1C293C', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}
                            title={isFr ? 'Switch to English' : 'Passer en français'}
                        >
                            <span style={{ color: !isFr ? '#1C293C' : '#6B7280', fontWeight: !isFr ? 800 : 500 }}>EN</span>
                            <span style={{ color: '#6B7280' }}>|</span>
                            <span style={{ color: isFr ? '#1C293C' : '#6B7280', fontWeight: isFr ? 800 : 500 }}>FR</span>
                        </button>
                        <Link href="/app" className={styles.navCtaPrimary}>{T.navLaunchApp}</Link>
                    </div>

                    <button className={styles.mobileMenuBtn} onClick={() => setMobileMenuOpen(v => !v)} aria-label="Toggle menu">
                        <span className={`${styles.menuLine} ${mobileMenuOpen ? styles.menuLine1Open : ''}`} />
                        <span className={`${styles.menuLine} ${mobileMenuOpen ? styles.menuLine2Open : ''}`} />
                    </button>
                </div>

                {mobileMenuOpen && (
                    <div className={styles.mobileMenu}>
                        <a href="#features" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>{T.navFeatures}</a>
                        <a href="#how" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>{T.navHow}</a>
                        <a href="#pricing" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>{T.navPricing}</a>
                        <Link href="/app" className={styles.mobileCta} onClick={() => setMobileMenuOpen(false)}>{T.navLaunchApp}</Link>
                    </div>
                )}
            </nav>

            {/* HERO */}
            <section className={styles.hero} id="hero">
                <div className={styles.heroInner}>
                    <div className={styles.heroBadge}>
                        <span className={styles.heroBadgeDot} />
                        {T.heroBadge}
                    </div>
                    <h1 className={styles.heroTitle}>
                        {T.heroTitle1}{' '}<span className={styles.heroTitleEm}>{T.heroTitleEm}</span>
                        <br />
                        {T.heroTitle2}{' '}<span className={styles.heroTitleGlow}>{T.heroTitleGlow}</span>
                    </h1>
                    <p className={styles.heroSub}>{T.heroSub}</p>
                    <div className={styles.heroCtas}>
                        <Link href="/app" className={styles.heroCtaPrimary} id="hero-cta-launch">
                            {T.heroCta1}
                        </Link>
                        <a href="#how" className={styles.heroCtaSecondary} id="hero-cta-how">
                            {T.heroCta2}
                        </a>
                    </div>
                    <div className={styles.heroSocial}>
                        <div className={styles.heroAvatars}>
                            {['M', 'S', 'K', 'A', 'T'].map((l, i) => (
                                <div key={i} className={styles.heroAvatar} style={{ zIndex: 5 - i }}>{l}</div>
                            ))}
                        </div>
                        <p className={styles.heroSocialText}><strong>2,400+</strong> {T.heroSocial}</p>
                    </div>
                    {/* Prop firm trust bar */}
                    <div className={styles.heroFirms}>
                        <span className={styles.heroFirmsLabel}>{isFr ? 'Compatible avec' : 'Works with'}</span>
                        {['Tradeify', 'FTMO', 'Funding Pips', 'The 5%ers'].map(f => (
                            <span key={f} className={styles.heroFirmBadge}>{f}</span>
                        ))}
                    </div>
                </div>

                <div className={styles.heroPreview}>
                    <div className={styles.heroPhone}>
                        <div className={styles.heroPhoneBar} />
                        <div className={styles.heroPhoneContent}>
                            <div className={styles.mockHeader}>
                                <span style={{ ...mono, fontWeight: 700, fontSize: 12, color: '#fff' }}>RiskGuardian</span>
                                <span style={{ ...mono, fontWeight: 700, fontSize: 12, color: '#FDC800' }}>$51,402</span>
                            </div>
                            <div className={styles.mockGuard}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{T.mockGuardLabel}</div>
                                    <div style={{ ...mono, fontSize: 20, fontWeight: 800, color: '#FDC800' }}>72%</div>
                                    <div style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>remaining</div>
                                </div>
                                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '28%', background: '#ff4757' }} />
                                </div>
                            </div>
                            <div className={styles.mockStats}>
                                {[{ v: '61%', l: T.mockWinRate }, { v: '$847', l: T.mockPositionSize }, { v: '2.3R', l: 'R:R Ratio' }].map(({ v, l }) => (
                                    <div key={l} className={styles.mockStat}>
                                        <div className={styles.mockStatVal}>{v}</div>
                                        <div className={styles.mockStatLbl}>{l}</div>
                                    </div>
                                ))}
                            </div>
                            <div className={styles.mockCta} style={{ ...mono }}>
                                {isFr ? 'Calculer Position →' : 'Calculate Position →'}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* STATS BAR */}
            <div className={styles.proofStrip}>
                <div className={styles.proofStripInner}>
                    {[
                        { num: '2400', suf: '+', label: T.proofTraders },
                        { num: '98', suf: '%', label: T.proofCompliance },
                        { num: '4.8', suf: '', label: T.proofRating },
                        { num: '12800', suf: '+', label: T.proofTrades },
                    ].map(({ num, suf, label }, i) => (
                        <div key={i} className={styles.proofItem}>
                            <span className={styles.proofNum}>{num}<span className={styles.proofSuf}>{suf}</span></span>
                            <span className={styles.proofLabel}>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* FEATURES */}
            <section className={styles.section} id="features">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.featuresSectionLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.featuresSectionTitle}</h2>
                    <p className={styles.sectionSub}>{T.featuresSectionSub}</p>
                    <div className={styles.featuresGrid}>
                        {features.map((f, i) => <FeatureCard key={f.title} {...f} delay={i * 60} />)}
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className={styles.sectionAlt} id="how">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.howSectionLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.howSectionTitle}</h2>
                    <div className={styles.stepsGrid}>
                        {steps.map((s, i) => <StepCard key={s.title} {...s} delay={i * 80} />)}
                    </div>
                </div>
            </section>

            {/* STATS */}
            <section className={styles.statsSection}>
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.statsSectionLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.statsSectionTitle}</h2>
                    <div className={styles.statsGrid}>
                        <StatCard value={2400} suffix="+" label={T.statsUsers} />
                        <StatCard value={98} suffix="%" label={T.statsCompliance} />
                        <StatCard value={12800} suffix="+" label={T.statsTrades} />
                        <StatCard value={48} suffix="★" label={T.statsRating} divisor={10} />
                    </div>
                </div>
            </section>

            {/* TESTIMONIALS */}
            <section className={styles.section} id="testimonials">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.testimonialsSectionLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.testimonialsSectionTitle}</h2>
                    <div className={styles.testimonialsGrid}>
                        {testimonials.map((t, i) => <TestimonialCard key={t.name} {...t} delay={i * 80} />)}
                    </div>
                </div>
            </section>

            {/* PRICING */}
            <section className={styles.sectionAlt} id="pricing">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.pricingLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.pricingTitle}</h2>
                    <p className={styles.sectionSub}>{T.pricingSub}</p>
                    <div className={styles.pricingGrid}>
                        {/* FREE TIER */}
                        <div className={styles.pricingCard}>
                            <div className={styles.pricingTier}>{T.freeTier}</div>
                            <div className={styles.pricingPrice}>$0<span className={styles.pricingPer}>{T.freePer}</span></div>
                            <div className={styles.pricingDesc}>{T.freeDesc}</div>
                            <ul className={styles.pricingFeatures}>
                                {T.freeFeatures.map(f => (
                                    <li key={f} className={styles.pricingFeatureItem}>
                                        <Check size={14} strokeWidth={2.5} color="#16A34A" />
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link href="/app" className={styles.pricingBtnSecondary}>{T.freeBtn}</Link>
                        </div>
                        {/* PRO TIER */}
                        <div className={`${styles.pricingCard} ${styles.pricingCardPro}`}>
                            <div className={styles.pricingPopular}>{T.proPopular}</div>
                            <div className={styles.pricingTier}>{T.proTier}</div>
                            <div className={styles.pricingPrice}>{T.proPrice}<span className={styles.pricingPer}>{T.proPer}</span></div>
                            <div className={styles.pricingDesc}>{T.proDesc}</div>
                            <ul className={styles.pricingFeatures}>
                                {T.proFeatures.map(f => (
                                    <li key={f} className={styles.pricingFeatureItem}>
                                        <Check size={14} strokeWidth={2.5} color="#FDC800" />
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link href="/app" className={styles.pricingBtnPrimary}>{T.proBtn}</Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* FINAL CTA */}
            <section className={styles.finalCta}>
                <div className={styles.finalCtaInner}>
                    <h2 className={styles.finalCtaTitle}>{T.finalCtaTitle}</h2>
                    <p className={styles.finalCtaSub}>{T.finalCtaSub}</p>
                    <Link href="/app" className={styles.finalCtaBtn}>{T.finalCtaBtn}</Link>
                </div>
            </section>

            {/* FOOTER */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div className={styles.footerLogo}>
                        <Logo size="sm" />
                        <p className={styles.footerTagline}>{T.footerTagline}</p>
                    </div>
                    <div className={styles.footerLinks}>
                        <div className={styles.footerCol}>
                            <div className={styles.footerColTitle}>{T.footerProduct}</div>
                            <a href="#features" className={styles.footerLink}>{T.footerFeatures}</a>
                            <Link href="/app" className={styles.footerLink}>{T.footerLaunch}</Link>
                            <a href="#pricing" className={styles.footerLink}>{T.footerPricing}</a>
                        </div>
                        <div className={styles.footerCol}>
                            <div className={styles.footerColTitle}>{T.footerSupport}</div>
                            <a href="mailto:support@riskguardian.app" className={styles.footerLink}>{T.footerContact}</a>
                            <a href="/privacy" className={styles.footerLink}>{T.footerPrivacy}</a>
                            <a href="/terms" className={styles.footerLink}>{T.footerTerms}</a>
                        </div>
                    </div>
                </div>
                <div className={styles.footerBottom}>
                    <span>{T.footerCopyright}</span>
                </div>
            </footer>
        </div>
    );
}
