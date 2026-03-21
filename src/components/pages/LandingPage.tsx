'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './LandingPage.module.css';
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

function StatCard({ value, suffix, label }: { value: number; suffix: string; label: string }) {
    const { ref, inView } = useInView();
    const count = useCounter(value, 1600, inView);
    return (
        <div ref={ref} className={styles.statCard}>
            <div className={styles.statValue}>{count.toLocaleString()}<span className={styles.statSuffix}>{suffix}</span></div>
            <div className={styles.statLabel}>{label}</div>
        </div>
    );
}

function FeatureCard({ icon, title, desc, accent, delay = 0 }: { icon: string; title: string; desc: string; accent: string; delay?: number }) {
    const { ref, inView } = useInView();
    return (
        <div ref={ref} className={`${styles.featureCard} ${inView ? styles.featureCardVisible : ''}`} style={{ transitionDelay: `${delay}ms` }}>
            <div className={styles.featureIcon} style={{ background: accent }}>{icon}</div>
            <h3 className={styles.featureTitle}>{title}</h3>
            <p className={styles.featureDesc}>{desc}</p>
        </div>
    );
}

function TestimonialCard({ quote, name, role, pnl, delay = 0 }: { quote: string; name: string; role: string; pnl: string; delay?: number }) {
    const { ref, inView } = useInView();
    return (
        <div ref={ref} className={`${styles.testimonialCard} ${inView ? styles.testimonialCardVisible : ''}`} style={{ transitionDelay: `${delay}ms` }}>
            <div className={styles.testimonialPnl}>{pnl}</div>
            <p className={styles.testimonialQuote}>&#8220;{quote}&#8221;</p>
            <div className={styles.testimonialAuthor}>
                <div className={styles.testimonialAvatar}>{name[0]}</div>
                <div>
                    <div className={styles.testimonialName}>{name}</div>
                    <div className={styles.testimonialRole}>{role}</div>
                </div>
            </div>
        </div>
    );
}

function StepCard({ n, title, desc, accent, delay = 0 }: { n: string; title: string; desc: string; accent: string; delay?: number }) {
    const { ref, inView } = useInView();
    return (
        <div ref={ref} className={`${styles.step} ${inView ? styles.stepVisible : ''}`} style={{ transitionDelay: `${delay}ms` }}>
            <div className={styles.stepNum} style={{ color: accent, borderColor: `${accent}30` }}>{n}</div>
            <div className={styles.stepLine} style={{ background: `linear-gradient(to bottom, ${accent}40, transparent)` }} />
            <div className={styles.stepBody}>
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepDesc}>{desc}</p>
            </div>
        </div>
    );
}

export default function LandingPage() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const heroRef = useRef<HTMLDivElement>(null);
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

    useEffect(() => {
        const hero = heroRef.current;
        if (!hero) return;
        const onMove = (e: MouseEvent) => {
            hero.style.setProperty('--mx', `${(e.clientX / window.innerWidth - 0.5) * 18}px`);
            hero.style.setProperty('--my', `${(e.clientY / window.innerHeight - 0.5) * 12}px`);
        };
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, []);

    const isFr = lang === 'fr';
    const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

    const T = {
        heroBadge: isFr ? 'Intelligence Risque Trading — Édition 2026' : 'Trading Risk Intelligence — 2026 Edition',
        heroTitle1: isFr ? 'Arrêtez de trader avec' : 'Stop trading with',
        heroTitleEm: isFr ? 'vos émotions.' : 'emotions.',
        heroTitle2: isFr ? 'Commencez à trader avec' : 'Start trading with',
        heroTitleGlow: isFr ? 'des règles.' : 'rules.',
        heroSub1: isFr ? "RiskGuardian est l'OS de risque professionnel pour les traders actifs." : 'RiskGuardian is the professional risk OS for active traders.',
        heroSub2: isFr ? 'Calculez vos tailles de position, appliquez vos limites journalières et suivez chaque trade — en temps réel.' : 'Calculate position sizes, enforce daily loss limits, and track every trade — in real-time.',
        heroCta1: isFr ? 'Commencer gratuitement — Sans carte' : 'Start Free — No card required',
        heroCta2: isFr ? 'Voir comment ça marche' : 'See how it works',
        heroSocial: isFr ? 'traders maîtrisant leur risque quotidien' : 'traders controlling their risk daily',
        navFeatures: isFr ? 'Fonctionnalités' : 'Features',
        navHow: isFr ? 'Comment ça marche' : 'How it works',
        navReviews: isFr ? 'Avis' : 'Reviews',
        navPricing: isFr ? 'Tarifs' : 'Pricing',
        navSeeFeatures: isFr ? 'Voir les fonctionnalités' : 'See features',
        navLaunchApp: isFr ? "Lancer l'app" : 'Launch App',
        waitlistLabel: isFr ? 'ACCÈS ANTICIPÉ' : 'EARLY ACCESS',
        waitlistTitle: isFr ? "Rejoignez la liste d'attente Pro" : 'Join the Pro Waitlist',
        waitlistSub: isFr ? 'Soyez parmi les premiers à accéder aux fonctionnalités Pro. Aucun spam, désabonnement en 1 clic.' : 'Be first to access Pro features when they launch. No spam, unsubscribe anytime.',
        waitlistPlaceholder: isFr ? 'votre@email.com' : 'your@email.com',
        waitlistBtn: isFr ? 'Rejoindre →' : 'Join →',
        waitlistSuccess: isFr ? 'Vous êtes inscrit ! On vous contacte bientôt.' : "You're on the list! We'll be in touch.",
        waitlistAlready: isFr ? 'Déjà inscrit avec cet e-mail.' : 'Already on the list with this email.',
        proofTraders: isFr ? 'Traders actifs' : 'Active traders',
        proofCompliance: isFr ? 'Respect limite journalière' : 'Daily limit compliance',
        proofRating: isFr ? 'Note moyenne' : 'Average rating',
        proofTrades: isFr ? 'Trades calculés' : 'Trades calculated',
        featuresSectionLabel: isFr ? 'Fonctionnalités' : 'Core Features',
        featuresSectionTitle: isFr ? "Tous les outils d'un trader discipliné" : 'Every tool a disciplined trader needs',
        featuresSectionSub: isFr ? "Conçu pour les traders actifs qui protègent leur capital — et pas seulement pour le faire fructifier." : 'Purpose-built for active traders serious about protecting their capital — not just growing it.',
        howSectionLabel: isFr ? 'Comment ça marche' : 'How It Works',
        howSectionTitle: isFr ? 'De la configuration au premier trade en 60 secondes' : 'From setup to first trade in 60 seconds',
        statsSectionLabel: isFr ? 'Les chiffres' : 'By the numbers',
        statsSectionTitle: isFr ? 'Un impact réel pour de vrais traders' : 'Real impact for real traders',
        statsUsers: isFr ? 'Utilisateurs actifs' : 'Active users',
        statsCompliance: isFr ? 'Respect limite journalière' : 'Daily limit compliance rate',
        statsTrades: isFr ? 'Trades calculés' : 'Trades calculated',
        statsWinRate: isFr ? 'Amélioration win rate moy.' : 'Avg win rate improvement',
        testimonialsSectionLabel: isFr ? 'Témoignages' : 'Trader Stories',
        testimonialsSectionTitle: isFr ? 'Créé par des traders, validé par des traders' : 'Built by traders, validated by traders',
        pricingLabel: isFr ? 'TARIFS' : 'PRICING',
        pricingTitle: 'Simple. Transparent.',
        pricingSub: isFr ? 'Commencez gratuitement, passez à Pro quand vous êtes prêt.' : "Start free. Upgrade when you're ready.",
        freeTier: isFr ? 'GRATUIT' : 'FREE',
        freePer: isFr ? '/mois' : '/month',
        freeDesc: isFr ? 'Pour les traders individuels' : 'For individual traders',
        freeFeatures: isFr ? ["Jusqu'à 50 trades", 'Journal de base', 'Calculateur de risque', 'PWA mobile'] : ['Up to 50 trades', 'Basic journal', 'Risk calculator', 'Mobile PWA'],
        freeBtn: isFr ? 'Commencer →' : 'Get Started →',
        proTier: 'PRO',
        proPer: isFr ? '/mois' : '/month',
        proDesc: isFr ? 'Pour les traders sérieux' : 'For serious traders',
        proPopular: isFr ? 'POPULAIRE' : 'POPULAR',
        proFeatures: isFr ? ['Trades illimités', 'IA comportementale (14 patterns)', 'Bridge DXTrade en direct', 'Analytiques avancées (8 onglets)', 'Support prioritaire', 'Export PDF / PNG'] : ['Unlimited trades', 'Behavioral AI (14 patterns)', 'DXTrade live bridge', 'Advanced analytics (8 tabs)', 'Priority support', 'PDF / PNG export'],
        proBtn: isFr ? 'Essai Pro gratuit →' : 'Start Pro Trial →',
        finalCtaLabel: isFr ? 'Commencer' : 'Get Started',
        finalCtaTitle: isFr ? 'Votre prochaine série de pertes est évitable.' : 'Your next losing streak is preventable.',
        finalCtaSub1: isFr ? '2 400+ traders tradent avec des règles, pas des émotions.' : 'Join 2,400+ traders who trade with rules, not emotions.',
        finalCtaSub2: isFr ? 'Gratuit pour commencer. Sans carte bancaire.' : 'Free to start. No credit card. No BS.',
        finalCtaBtn: isFr ? 'Lancer RiskGuardian Gratuitement' : 'Launch RiskGuardian Free',
        finalCtaNote: isFr ? 'Sans carte · Annulez quand vous voulez · Données locales' : 'No credit card · Cancel anytime · Full data ownership',
        footerTagline: isFr ? 'Tradez avec des règles, pas des émotions.' : 'Trade with rules, not emotions.',
        footerProduct: isFr ? 'Produit' : 'Product',
        footerSupport: 'Support',
        footerFeatures: isFr ? 'Fonctionnalités' : 'Features',
        footerLaunch: isFr ? "Lancer l'app" : 'Launch App',
        footerContact: 'Contact',
        footerPrivacy: isFr ? 'Confidentialité' : 'Privacy',
        footerTerms: isFr ? 'Conditions' : 'Terms',
        footerCopyright: isFr ? '© 2026 RiskGuardian. À des fins éducatives.' : '© 2026 RiskGuardian. For educational purposes.',
        footerDisclaimer: isFr ? 'Pas un conseil financier.' : 'Not financial advice.',
        mockGuardLabel: isFr ? 'Garde journalière' : 'Daily Guard',
        mockUsed: isFr ? 'utilisé' : 'used',
        mockLeft: isFr ? 'restant' : 'left',
        mockLimit: isFr ? 'de limite' : 'limit',
        mockCta: isFr ? 'Calculer position →' : 'Calculate Position →',
    };

    const features = isFr ? [
        { icon: '🛡️', accent: 'rgba(0,212,255,0.12)', title: 'Garde journalière', desc: 'Un anneau animé suit votre risque en temps réel. Quand vous approchez la limite, RiskGuardian vous bloque avant le surtrading.' },
        { icon: '📐', accent: 'rgba(0,230,118,0.10)', title: 'Dimensionnement précis', desc: 'Entrez entrée + stop loss, obtenez la taille exacte qui risque seulement 1–2% de votre solde. Crypto, forex et futures.' },
        { icon: '🧠', accent: 'rgba(124,58,237,0.12)', title: 'Analytiques comportementales', desc: 'Détectez vos patterns de revenge trading, FOMO et surtrading avec un journal intelligent et des courbes gain/perte.' },
        { icon: '📊', accent: 'rgba(255,179,0,0.10)', title: 'Application des règles', desc: 'Chaque trade passe par une checklist pré-trade. Pas de plan, pas de trade. La discipline intégrée dans votre workflow.' },
        { icon: '⚡', accent: 'rgba(255,61,113,0.10)', title: 'Calculateur TP/SL instantané', desc: 'Entrez vos paramètres et obtenez TP, SL, ratio R:R et solde projeté — en moins de 3 secondes.' },
        { icon: '📱', accent: 'rgba(0,212,255,0.08)', title: 'PWA Mobile-First', desc: 'Conçu pour le téléphone sur lequel vous tradez. Installez comme une app native — fonctionne hors ligne.' },
    ] : [
        { icon: '🛡️', accent: 'rgba(0,212,255,0.12)', title: 'Daily Loss Guard', desc: 'An animated ring tracks your daily risk in real-time. When you approach the limit, RiskGuardian locks you out before you overtrade.' },
        { icon: '📐', accent: 'rgba(0,230,118,0.10)', title: 'Precision Position Sizing', desc: 'Input entry + stop loss, get the exact lot size that risks only 1–2% of your balance. Works for crypto, forex, and futures.' },
        { icon: '🧠', accent: 'rgba(124,58,237,0.12)', title: 'Behavioral Analytics', desc: 'Spot your revenge-trading, FOMO, and overtrading patterns with intelligent trade journaling and visualized win/loss curves.' },
        { icon: '📊', accent: 'rgba(255,179,0,0.10)', title: 'Trade Plan Enforcement', desc: 'Every trade goes through a pre-trade checklist. No plan, no trade. Discipline engineered into your workflow.' },
        { icon: '⚡', accent: 'rgba(255,61,113,0.10)', title: 'Instant TP/SL Calculator', desc: 'Enter your trade parameters and get take profit, stop loss, R:R ratio, and projected balance — in under 3 seconds.' },
        { icon: '📱', accent: 'rgba(0,212,255,0.08)', title: 'Mobile-First PWA', desc: 'Built for the phone you trade on. Install it like a native app — works offline, no App Store required.' },
    ];

    const testimonials = isFr ? [
        { name: 'Marcus L.', role: 'Trader Futures — NQ, ES', pnl: '+12 440 $ / mois', quote: "J'ai brûlé deux comptes avant RiskGuardian. La garde journalière m'a littéralement empêché de revenge trader après un drawdown." },
        { name: 'Sofia R.', role: 'Crypto Trader — SOL, BTC', pnl: 'Win rate 62% → 74%', quote: "Le calculateur de position me fait gagner 10 minutes par trade. J'entre maintenant avec précision au lieu de deviner les tailles." },
        { name: 'James K.', role: 'Trader Forex Prop Firm', pnl: '2 challenges réussis', quote: "C'est l'OS de risque dont chaque trader de prop firm a besoin. M'a gardé sous la limite journalière sur les deux challenges." },
    ] : [
        { name: 'Marcus L.', role: 'Futures Trader — NQ, ES', pnl: '+$12,440 / month', quote: 'I blew two accounts before RiskGuardian. The daily guard literally stopped me from revenge-trading after a drawdown.' },
        { name: 'Sofia R.', role: 'Crypto Trader — SOL, BTC', pnl: 'Win rate 62% → 74%', quote: 'The position calculator saves me 10 minutes per trade. Now I enter with precision instead of guessing lot sizes.' },
        { name: 'James K.', role: 'Forex Prop Trader', pnl: 'Passed 2 prop firm challenges', quote: 'This is the risk OS every prop firm trader needs. Kept me under the daily drawdown limit on both challenges.' },
    ];

    const steps = isFr ? [
        { n: '01', accent: '#00D4FF', title: 'Définissez vos règles', desc: "Entrez votre solde, limite de perte journalière (ex. 800 $) et risque max par trade (ex. 1,5 %). Ce sont vos règles de trading." },
        { n: '02', accent: '#00E676', title: 'Calculez avant chaque trade', desc: "Ouvrez le calculateur. Entrez prix d'entrée et stop loss. RiskGuardian affiche instantanément la taille exacte, le TP et le ratio R:R." },
        { n: '03', accent: '#7C3AED', title: 'La garde applique les règles', desc: "L'anneau Garde journalière se remplit. Quand vous approchez la limite, l'app vous avertit. Quand vous l'atteignez, elle vous bloque." },
        { n: '04', accent: '#FFB300', title: 'Analysez & progressez', desc: "Consultez les courbes P&L cumulées, taux de victoire et patterns. Voyez où est votre edge — et où vos émotions vous coûtent de l'argent." },
    ] : [
        { n: '01', accent: '#00D4FF', title: 'Set your rules', desc: 'Enter your account balance, daily loss limit (e.g. $800), and max risk per trade (e.g. 1.5%). These become your trading constitution.' },
        { n: '02', accent: '#00E676', title: 'Calculate before every trade', desc: 'Open the position calculator. Enter entry price and stop loss. RiskGuardian instantly shows your exact lot size, TP price, and R:R ratio.' },
        { n: '03', accent: '#7C3AED', title: 'Guard enforces the rules', desc: 'The Daily Guard ring fills as you trade. When approaching your limit, the app warns you. When you hit it, it stops you. No exceptions.' },
        { n: '04', accent: '#FFB300', title: 'Analyze & improve', desc: 'Review cumulative P&L curves, win rates, and trade patterns. See exactly where your edge is — and where your emotions cost you money.' },
    ];

    return (
        <div className={styles.root}>

            {/* NAV */}
            <nav className={styles.nav} role="navigation">
                <div className={styles.navInner}>
                    <Link href="/" className={styles.navLogo} aria-label="RiskGuardian home">
                        <div className={styles.navLogoMark}>
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                                <path d="M11 2L3 6.5V12.5C3 16.36 6.5 19.93 11 21C15.5 19.93 19 16.36 19 12.5V6.5L11 2Z" fill="url(#sg)" stroke="rgba(0,212,255,0.4)" strokeWidth="0.5"/>
                                <path d="M8 11L10 13L14 9" stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                <defs><linearGradient id="sg" x1="3" y1="2" x2="19" y2="21" gradientUnits="userSpaceOnUse"><stop stopColor="#0A1628"/><stop offset="1" stopColor="#131C35"/></linearGradient></defs>
                            </svg>
                        </div>
                        <span className={styles.navLogoText}>Risk<span className={styles.navLogoAccent}>Guardian</span></span>
                    </Link>

                    <div className={styles.navLinks}>
                        <a href="#features" className={styles.navLink}>{T.navFeatures}</a>
                        <a href="#how" className={styles.navLink}>{T.navHow}</a>
                        <a href="#testimonials" className={styles.navLink}>{T.navReviews}</a>
                        <a href="#pricing" className={styles.navLink}>{T.navPricing}</a>
                    </div>

                    <button onClick={() => setLang(l => l === 'en' ? 'fr' : 'en')}
                        style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '5px 10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}
                        title={isFr ? 'Switch to English' : 'Passer en français'}>
                        <span style={{ color: !isFr ? '#A6FF4D' : 'rgba(255,255,255,0.3)' }}>EN</span>
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                        <span style={{ color: isFr ? '#A6FF4D' : 'rgba(255,255,255,0.3)' }}>FR</span>
                    </button>

                    <div className={styles.navCta}>
                        <a href="#features" className={styles.navCtaSecondary}>{T.navSeeFeatures}</a>
                        <Link href="/app" className={styles.navCtaPrimary}>{T.navLaunchApp} <span>→</span></Link>
                    </div>

                    <button className={styles.mobileMenuBtn} onClick={() => setMobileMenuOpen(v => !v)} aria-label="Toggle menu">
                        <span className={`${styles.menuLine} ${mobileMenuOpen ? styles.menuLine1Open : ''}`}/>
                        <span className={`${styles.menuLine} ${mobileMenuOpen ? styles.menuLine2Open : ''}`}/>
                    </button>
                </div>

                {mobileMenuOpen && (
                    <div className={styles.mobileMenu}>
                        <a href="#features" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>{T.navFeatures}</a>
                        <a href="#how" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>{T.navHow}</a>
                        <a href="#testimonials" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>{T.navReviews}</a>
                        <a href="#pricing" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>{T.navPricing}</a>
                        <Link href="/app" className={styles.mobileCta} onClick={() => setMobileMenuOpen(false)}>{T.navLaunchApp} →</Link>
                    </div>
                )}
            </nav>

            {/* HERO */}
            <section className={styles.hero} ref={heroRef} id="hero">
                <div className={styles.heroOrb1}/><div className={styles.heroOrb2}/><div className={styles.heroOrb3}/>
                <div className={styles.heroGrid} aria-hidden="true"/>
                <div className={styles.heroNoise} aria-hidden="true"/>

                <div className={styles.heroInner}>
                    <div className={styles.heroBadge}>
                        <span className={styles.heroBadgeDot}/>
                        {T.heroBadge}
                    </div>
                    <h1 className={styles.heroTitle}>
                        {T.heroTitle1}{' '}<span className={styles.heroTitleEm}>{T.heroTitleEm}</span>
                        <br/>
                        {T.heroTitle2}{' '}<span className={styles.heroTitleGlow}>{T.heroTitleGlow}</span>
                    </h1>
                    <p className={styles.heroSub}>
                        {T.heroSub1}<br className={styles.heroBr}/>{T.heroSub2}
                    </p>
                    <div className={styles.heroCtas}>
                        <Link href="/app" className={styles.heroCtaPrimary} id="hero-cta-launch">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2L11.25 7.5H17L12.5 11L14.25 16.5L9 13L3.75 16.5L5.5 11L1 7.5H6.75L9 2Z" fill="currentColor"/></svg>
                            {T.heroCta1}
                        </Link>
                        <a href="#features" className={styles.heroCtaSecondary} id="hero-cta-features">
                            {T.heroCta2}
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </a>
                    </div>
                    <div className={styles.heroSocial}>
                        <div className={styles.heroAvatars}>
                            {['M','S','J','A','T'].map((l,i) => (
                                <div key={i} className={styles.heroAvatar} style={{ zIndex: 5-i }}>{l}</div>
                            ))}
                        </div>
                        <p className={styles.heroSocialText}><strong>2,400+</strong> {T.heroSocial}</p>
                    </div>
                </div>

                <div className={styles.heroPreview}>
                    <div className={styles.heroPhone}>
                        <div className={styles.heroPhoneBar}/>
                        <div className={styles.heroPhoneContent}>
                            <div className={styles.mockHeader}>
                                <div className={styles.mockLogo}>
                                    <span className={styles.mockLogoShield}>⬡</span>
                                    <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.3px' }}>RiskGuardian</span>
                                </div>
                                <div className={styles.mockBalance}>$51,402</div>
                            </div>
                            <div className={styles.mockGuard}>
                                <div className={styles.mockGuardRing}>
                                    <svg viewBox="0 0 80 80" width="80" height="80">
                                        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
                                        <circle cx="40" cy="40" r="32" fill="none" stroke="#00D4FF" strokeWidth="6" strokeDasharray="201" strokeDashoffset="161" strokeLinecap="round" transform="rotate(-90 40 40)"/>
                                    </svg>
                                    <div className={styles.mockGuardLabel}>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: '#00D4FF', letterSpacing: '-0.5px' }}>20%</div>
                                        <div style={{ fontSize: 8, color: '#475569', marginTop: 2 }}>{T.mockUsed}</div>
                                    </div>
                                </div>
                                <div className={styles.mockGuardInfo}>
                                    <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{T.mockGuardLabel}</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#00E676' }}>$640 {T.mockLeft}</div>
                                    <div style={{ fontSize: 10, color: '#64748B' }}>of $800 {T.mockLimit}</div>
                                </div>
                            </div>
                            <div className={styles.mockStats}>
                                {[{v:'770',l:'lots'},{v:'2.0R',l:'ratio'},{v:'+1.5%',l:'risk'}].map(({v,l}) => (
                                    <div key={l} className={styles.mockStat}>
                                        <div className={styles.mockStatVal}>{v}</div>
                                        <div className={styles.mockStatLbl}>{l}</div>
                                    </div>
                                ))}
                            </div>
                            <div className={styles.mockCta}>{T.mockCta}</div>
                            <div className={styles.mockNav}>
                                {['🏠','📊','📄','📒','⚙️'].map((icon,i) => (
                                    <div key={i} className={`${styles.mockNavItem} ${i===1?styles.mockNavItemActive:''}`}>{icon}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className={styles.heroPhoneGlow}/>
                </div>
            </section>

            {/* EMAIL CAPTURE */}
            <section style={{ background:'rgba(166,255,77,0.04)', borderTop:'1px solid rgba(166,255,77,0.12)', borderBottom:'1px solid rgba(166,255,77,0.12)', padding:'32px 20px' }}>
                <div style={{ maxWidth:560, margin:'0 auto', textAlign:'center' }}>
                    <div style={{ ...mono, fontSize:10, fontWeight:700, color:'#A6FF4D', letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:10 }}>{T.waitlistLabel}</div>
                    <h2 style={{ ...mono, fontSize:22, fontWeight:900, color:'#fff', marginBottom:8, letterSpacing:'-0.03em' }}>{T.waitlistTitle}</h2>
                    <p style={{ ...mono, fontSize:12, color:'#8b949e', marginBottom:20 }}>{T.waitlistSub}</p>
                    {(waitlistStatus==='success'||waitlistStatus==='already') ? (
                        <div style={{ ...mono, fontSize:13, fontWeight:700, color:'#A6FF4D', padding:'12px 20px', background:'rgba(166,255,77,0.08)', border:'1px solid rgba(166,255,77,0.3)' }}>
                            ✓ {waitlistStatus==='already' ? T.waitlistAlready : T.waitlistSuccess}
                        </div>
                    ) : (
                        <form onSubmit={handleWaitlist} style={{ display:'flex', maxWidth:420, margin:'0 auto' }}>
                            <input type="email" required placeholder={T.waitlistPlaceholder} value={email} onChange={e=>setEmail(e.target.value)}
                                style={{ flex:1, ...mono, fontSize:13, color:'#fff', background:'#0d1117', border:'1px solid #1a1c24', borderRight:'none', padding:'10px 14px', outline:'none' }}/>
                            <button type="submit" disabled={waitlistStatus==='loading'}
                                style={{ ...mono, fontSize:11, fontWeight:700, padding:'10px 18px', background:'#A6FF4D', color:'#090909', border:'none', cursor:waitlistStatus==='loading'?'not-allowed':'pointer', letterSpacing:'0.06em', textTransform:'uppercase', whiteSpace:'nowrap', opacity:waitlistStatus==='loading'?0.7:1 }}>
                                {waitlistStatus==='loading'?'...':T.waitlistBtn}
                            </button>
                        </form>
                    )}
                </div>
            </section>

            {/* SOCIAL PROOF STRIP */}
            <div className={styles.proofStrip}>
                <div className={styles.proofStripInner}>
                    {[{num:'2400',suf:'+',label:T.proofTraders},{num:'98',suf:'%',label:T.proofCompliance},{num:'4',suf:'.8★',label:T.proofRating},{num:'12000',suf:'+',label:T.proofTrades}].map(({num,suf,label},i)=>(
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
                        {features.map((f,i)=><FeatureCard key={f.title} {...f} delay={i*60}/>)}
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className={styles.section} style={{ background:'rgba(255,255,255,0.015)' }} id="how">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.howSectionLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.howSectionTitle}</h2>
                    <div className={styles.stepsGrid}>
                        {steps.map((s,i)=><StepCard key={s.n} {...s} delay={i*80}/>)}
                    </div>
                </div>
            </section>

            {/* STATS */}
            <section className={styles.statsSection}>
                <div className={styles.statsOrb}/>
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.statsSectionLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.statsSectionTitle}</h2>
                    <div className={styles.statsGrid}>
                        <StatCard value={2400} suffix="+" label={T.statsUsers}/>
                        <StatCard value={98} suffix="%" label={T.statsCompliance}/>
                        <StatCard value={12000} suffix="+" label={T.statsTrades}/>
                        <StatCard value={48} suffix="%" label={T.statsWinRate}/>
                    </div>
                </div>
            </section>

            {/* TESTIMONIALS */}
            <section className={styles.section} id="testimonials">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{T.testimonialsSectionLabel}</div>
                    <h2 className={styles.sectionTitle}>{T.testimonialsSectionTitle}</h2>
                    <div className={styles.testimonialsGrid}>
                        {testimonials.map((t,i)=><TestimonialCard key={t.name} {...t} delay={i*80}/>)}
                    </div>
                </div>
            </section>

            {/* PRICING */}
            <section style={{ padding:'64px 20px', background:'#090909' }} id="pricing">
                <div style={{ maxWidth:900, margin:'0 auto' }}>
                    <div style={{ textAlign:'center', marginBottom:40 }}>
                        <div style={{ ...mono, fontSize:10, fontWeight:700, color:'#A6FF4D', letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:10 }}>{T.pricingLabel}</div>
                        <h2 style={{ ...mono, fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-0.03em', marginBottom:10 }}>{T.pricingTitle}</h2>
                        <p style={{ ...mono, fontSize:13, color:'#8b949e' }}>{T.pricingSub}</p>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:1, background:'#1a1c24' }}>
                        <div style={{ background:'#0d1117', padding:'32px 28px' }}>
                            <div style={{ ...mono, fontSize:10, color:'#6b7280', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:10 }}>{T.freeTier}</div>
                            <div style={{ ...mono, fontSize:36, fontWeight:900, color:'#fff', marginBottom:4 }}>$0<span style={{ fontSize:14, color:'#6b7280', fontWeight:400 }}>{T.freePer}</span></div>
                            <div style={{ ...mono, fontSize:12, color:'#6b7280', marginBottom:24 }}>{T.freeDesc}</div>
                            <ul style={{ listStyle:'none', padding:0, margin:'0 0 28px', display:'flex', flexDirection:'column', gap:10 }}>
                                {T.freeFeatures.map(f=>(
                                    <li key={f} style={{ ...mono, fontSize:12, color:'#c9d1d9', display:'flex', gap:10, alignItems:'center' }}>
                                        <span style={{ color:'#A6FF4D' }}>✓</span>{f}
                                    </li>
                                ))}
                            </ul>
                            <Link href="/app" style={{ display:'block', textAlign:'center', ...mono, fontSize:12, fontWeight:700, padding:'12px', background:'transparent', border:'1px solid #1a1c24', color:'#8b949e', letterSpacing:'0.06em', textTransform:'uppercase', textDecoration:'none' }}>{T.freeBtn}</Link>
                        </div>
                        <div style={{ background:'#0d1117', padding:'32px 28px', border:'1px solid rgba(166,255,77,0.3)', position:'relative' }}>
                            <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:'#A6FF4D', color:'#090909', ...mono, fontSize:9, fontWeight:900, padding:'3px 12px', letterSpacing:'0.1em' }}>{T.proPopular}</div>
                            <div style={{ ...mono, fontSize:10, color:'#A6FF4D', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:10 }}>{T.proTier}</div>
                            <div style={{ ...mono, fontSize:36, fontWeight:900, color:'#fff', marginBottom:4 }}>$19<span style={{ fontSize:14, color:'#6b7280', fontWeight:400 }}>{T.proPer}</span></div>
                            <div style={{ ...mono, fontSize:12, color:'#6b7280', marginBottom:24 }}>{T.proDesc}</div>
                            <ul style={{ listStyle:'none', padding:0, margin:'0 0 28px', display:'flex', flexDirection:'column', gap:10 }}>
                                {T.proFeatures.map(f=>(
                                    <li key={f} style={{ ...mono, fontSize:12, color:'#c9d1d9', display:'flex', gap:10, alignItems:'center' }}>
                                        <span style={{ color:'#A6FF4D' }}>✓</span>{f}
                                    </li>
                                ))}
                            </ul>
                            <Link href="/app" style={{ display:'block', textAlign:'center', ...mono, fontSize:12, fontWeight:700, padding:'12px', background:'#A6FF4D', border:'none', color:'#090909', letterSpacing:'0.06em', textTransform:'uppercase', textDecoration:'none' }}>{T.proBtn}</Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* FINAL CTA */}
            <section className={styles.finalCta}>
                <div className={styles.finalCtaOrb1}/><div className={styles.finalCtaOrb2}/>
                <div className={styles.sectionInner}>
                    <div className={styles.finalCtaInner}>
                        <div className={styles.sectionLabel} style={{ textAlign:'center' }}>{T.finalCtaLabel}</div>
                        <h2 className={styles.finalCtaTitle}>{T.finalCtaTitle}</h2>
                        <p className={styles.finalCtaSub}>{T.finalCtaSub1}<br/>{T.finalCtaSub2}</p>
                        <Link href="/app" className={styles.finalCtaBtn} id="final-cta-btn">
                            {T.finalCtaBtn}
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 10H16M11 5L16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </Link>
                        <p className={styles.finalCtaNote}>{T.finalCtaNote}</p>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div className={styles.footerLogo}>
                        <span style={{ fontWeight:800, fontSize:16, letterSpacing:'-0.5px', color:'#fff' }}>Risk<span style={{ color:'#A6FF4D' }}>Guardian</span></span>
                        <p className={styles.footerTagline}>{T.footerTagline}</p>
                    </div>
                    <div className={styles.footerLinks}>
                        <div className={styles.footerCol}>
                            <div className={styles.footerColTitle}>{T.footerProduct}</div>
                            <a href="#features" className={styles.footerLink}>{T.footerFeatures}</a>
                            <Link href="/app" className={styles.footerLink}>{T.footerLaunch}</Link>
                        </div>
                        <div className={styles.footerCol}>
                            <div className={styles.footerColTitle}>{T.footerSupport}</div>
                            <a href="mailto:hello@riskguardian.app" className={styles.footerLink}>{T.footerContact}</a>
                            <a href="#" className={styles.footerLink}>{T.footerPrivacy}</a>
                            <a href="#" className={styles.footerLink}>{T.footerTerms}</a>
                        </div>
                    </div>
                </div>
                <div className={styles.footerBottom}>
                    <span>{T.footerCopyright}</span>
                    <span>{T.footerDisclaimer}</span>
                </div>
            </footer>
        </div>
    );
}
