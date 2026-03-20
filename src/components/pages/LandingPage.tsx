'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './LandingPage.module.css';

/* ─── Animated counter hook ─── */
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

/* ─── Intersection observer hook ─── */
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

/* ─── Stat card ─── */
function StatCard({ value, suffix, label, decimals = 0 }: { value: number; suffix: string; label: string; decimals?: number; }) {
    const { ref, inView } = useInView();
    const count = useCounter(value, 1600, inView);
    return (
        <div ref={ref} className={styles.statCard}>
            <div className={styles.statValue}>
                {decimals > 0 ? (count / Math.pow(10, decimals)).toFixed(decimals) : count.toLocaleString()}
                <span className={styles.statSuffix}>{suffix}</span>
            </div>
            <div className={styles.statLabel}>{label}</div>
        </div>
    );
}

/* ─── Feature card ─── */
function FeatureCard({ icon, title, desc, accent, delay = 0 }: {
    icon: string; title: string; desc: string; accent: string; delay?: number;
}) {
    const { ref, inView } = useInView();
    return (
        <div
            ref={ref}
            className={`${styles.featureCard} ${inView ? styles.featureCardVisible : ''} delay-[${delay}ms]`}
        >
            <div className={`${styles.featureIcon} !bg-[${accent}]`}>{icon}</div>
            <h3 className={styles.featureTitle}>{title}</h3>
            <p className={styles.featureDesc}>{desc}</p>
        </div>
    );
}

/* ─── Testimonial card ─── */
function TestimonialCard({ quote, name, role, pnl, delay = 0 }: {
    quote: string; name: string; role: string; pnl: string; delay?: number;
}) {
    const { ref, inView } = useInView();
    return (
        <div
            ref={ref}
            className={`${styles.testimonialCard} ${inView ? styles.testimonialCardVisible : ''} delay-[${delay}ms]`}
        >
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

/* ─── Step card ─── */
function StepCard({ n, title, desc, accent, delay = 0 }: {
    n: string; title: string; desc: string; accent: string; delay?: number;
}) {
    const { ref, inView } = useInView();
    return (
        <div
            ref={ref}
            className={`${styles.step} ${inView ? styles.stepVisible : ''} delay-[${delay}ms]`}
        >
            <div className={`${styles.stepNum} !text-[${accent}] !border-[${accent}]/18`}>{n}</div>
            <div className={`${styles.stepLine} bg-linear-to-b from-[${accent}]/25 to-transparent`} />
            <div className={styles.stepBody}>
                <h3 className={styles.stepTitle}>{title}</h3>
                <p className={styles.stepDesc}>{desc}</p>
            </div>
        </div>
    );
}

/* ─── Main landing page ─── */
export default function LandingPage() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const heroRef = useRef<HTMLDivElement>(null);
    const [email, setEmail] = useState('');
    const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'success'>('idle');
    const [lang, setLang] = useState<'en' | 'fr'>('en');

    function handleWaitlist(e: React.FormEvent) {
        e.preventDefault();
        if (!email) return;
        // Store email in localStorage as simple waitlist
        const list: string[] = JSON.parse(localStorage.getItem('rg-waitlist') ?? '[]');
        if (!list.includes(email)) list.push(email);
        localStorage.setItem('rg-waitlist', JSON.stringify(list));
        setWaitlistStatus('success');
    }

    /* Parallax grain on mouse move */
    useEffect(() => {
        const hero = heroRef.current;
        if (!hero) return;
        const onMove = (e: MouseEvent) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 18;
            const y = (e.clientY / window.innerHeight - 0.5) * 12;
            hero.style.setProperty('--mx', `${x}px`);
            hero.style.setProperty('--my', `${y}px`);
        };
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, []);

    const features = lang === 'fr' ? [
        { icon: '🛡️', accent: 'rgba(0,212,255,0.12)', title: 'Garde journalière', desc: 'Un anneau animé suit votre risque en temps réel. Quand vous approchez la limite, RiskGuardia vous bloque avant le surtrading.' },
        { icon: '📐', accent: 'rgba(0,230,118,0.10)', title: 'Dimensionnement précis', desc: 'Entrez entrée + stop loss, obtenez la taille exacte qui risque seulement 1-2% de votre solde. Crypto, forex et futures.' },
        { icon: '🧠', accent: 'rgba(124,58,237,0.12)', title: 'Analytiques comportementales', desc: 'Détectez vos patterns de revenge trading, FOMO et surtrading avec un journal intelligent et des courbes gain/perte.' },
        { icon: '📊', accent: 'rgba(255,179,0,0.10)', title: 'Application des règles', desc: 'Chaque trade passe par une checklist pré-trade. Pas de plan, pas de trade. La discipline intégrée dans votre workflow.' },
        { icon: '⚡', accent: 'rgba(255,61,113,0.10)', title: 'Calculateur TP/SL instantané', desc: 'Entrez vos paramètres et obtenez TP, SL, ratio R:R et solde projeté — en moins de 3 secondes.' },
        { icon: '📱', accent: 'rgba(0,212,255,0.08)', title: 'PWA Mobile-First', desc: 'Conçu pour le téléphone sur lequel vous tradez. Installez comme une app native — fonctionne hors ligne.' },
    ] : [
        { icon: '🛡️', accent: 'rgba(0,212,255,0.12)', title: 'Daily Loss Guard', desc: 'An animated ring tracks your daily risk in real-time. When you approach the limit, RiskGuardia locks you out before you overtrade.' },
        { icon: '📐', accent: 'rgba(0,230,118,0.10)', title: 'Precision Position Sizing', desc: 'Input entry + stop loss, get the exact lot size that risks only 1–2% of your balance. Works for crypto, forex, and futures.' },
        { icon: '🧠', accent: 'rgba(124,58,237,0.12)', title: 'Behavioral Analytics', desc: 'Spot your revenge-trading, FOMO, and overtrading patterns with intelligent trade journaling and visualized win/loss curves.' },
        { icon: '📊', accent: 'rgba(255,179,0,0.10)', title: 'Trade Plan Enforcement', desc: 'Every trade goes through a 5-point pre-trade checklist. No plan, no trade. Discipline engineered into your workflow.' },
        { icon: '⚡', accent: 'rgba(255,61,113,0.10)', title: 'Instant TP/SL Calculator', desc: 'Enter your trade parameters and get take profit, stop loss, R:R ratio, and projected balance — in under 3 seconds.' },
        { icon: '📱', accent: 'rgba(0,212,255,0.08)', title: 'Mobile-First PWA', desc: 'Built for the phone you trade on. Install it like a native app — works offline, no App Store required.' },
    ];

    const testimonials = [
        {
            name: 'Marcus L.',
            role: 'Futures Trader — NQ, ES',
            pnl: '+$12,440 / month',
            quote: 'I blew two accounts before RiskGuardia. The daily guard literally stopped me from revenge-trading after a drawdown.',
        },
        {
            name: 'Sofia R.',
            role: 'Crypto Trader — SOL, BTC',
            pnl: 'Win rate 62% → 74%',
            quote: 'The position calculator saves me 10 minutes per trade. Now I enter with precision instead of guessing lot sizes.',
        },
        {
            name: 'James K.',
            role: 'Forex Prop Trader',
            pnl: 'Passed 2 prop firm challenges',
            quote: 'This is the risk OS every prop firm trader needs. Kept me under the daily drawdown limit on both challenges.',
        },
    ];

    return (
        <div className={styles.root}>

            {/* ── NAV ── */}
            <nav className={styles.nav} role="navigation" aria-label="Main navigation">
                <div className={styles.navInner}>
                    <Link href="/" className={styles.navLogo} aria-label="RiskGuardia home">
                        <div className={styles.navLogoMark}>
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                                <path d="M11 2L3 6.5V12.5C3 16.36 6.5 19.93 11 21C15.5 19.93 19 16.36 19 12.5V6.5L11 2Z" fill="url(#shield-grad)" stroke="rgba(0,212,255,0.4)" strokeWidth="0.5" />
                                <path d="M8 11L10 13L14 9" stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <defs>
                                    <linearGradient id="shield-grad" x1="3" y1="2" x2="19" y2="21" gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#0A1628" />
                                        <stop offset="1" stopColor="#131C35" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                        <span className={styles.navLogoText}>Risk<span className={styles.navLogoAccent}>Guardia</span></span>
                    </Link>

                    <div className={styles.navLinks}>
                        <a href="#features" className={styles.navLink}>Features</a>
                        <a href="#how" className={styles.navLink}>How it works</a>
                        <a href="#testimonials" className={styles.navLink}>Reviews</a>
                        <a href="#testimonials" className={styles.navLink}>Reviews</a>
                    </div>

                    {/* Lang toggle */}
                    <button
                        onClick={() => setLang(l => l === 'en' ? 'fr' : 'en')}
                        style={{
                            fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                            padding: '5px 10px', background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                            color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}
                        title={lang === 'en' ? 'Passer en français' : 'Switch to English'}
                    >
                        <span style={{ color: lang === 'en' ? '#A6FF4D' : 'rgba(255,255,255,0.3)' }}>EN</span>
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                        <span style={{ color: lang === 'fr' ? '#A6FF4D' : 'rgba(255,255,255,0.3)' }}>FR</span>
                    </button>

                    <div className={styles.navCta}>
                        <a href="#features" className={styles.navCtaSecondary}>See features</a>
                        <Link href="/app" className={styles.navCtaPrimary}>
                            Launch App <span>→</span>
                        </Link>
                    </div>

                    <button
                        className={styles.mobileMenuBtn}
                        onClick={() => setMobileMenuOpen(v => !v)}
                        aria-label="Toggle menu"
                    >
                        <span className={`${styles.menuLine} ${mobileMenuOpen ? styles.menuLine1Open : ''}`} />
                        <span className={`${styles.menuLine} ${mobileMenuOpen ? styles.menuLine2Open : ''}`} />
                    </button>
                </div>

                {mobileMenuOpen && (
                    <div className={styles.mobileMenu}>
                        <a href="#features" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>Features</a>
                        <a href="#how" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>How it works</a>
                        <a href="#testimonials" className={styles.mobileLink} onClick={() => setMobileMenuOpen(false)}>Reviews</a>
                        <Link href="/app" className={styles.mobileCta} onClick={() => setMobileMenuOpen(false)}>
                            Launch App →
                        </Link>
                    </div>
                )}
            </nav>

            {/* ── HERO ── */}
            <section className={styles.hero} ref={heroRef} id="hero">
                {/* Background layers */}
                <div className={styles.heroOrb1} />
                <div className={styles.heroOrb2} />
                <div className={styles.heroOrb3} />
                <div className={styles.heroGrid} aria-hidden="true" />
                <div className={styles.heroNoise} aria-hidden="true" />

                <div className={styles.heroInner}>
                    <div className={styles.heroBadge}>
                        <span className={styles.heroBadgeDot} />
                        Trading Risk Intelligence — 2026 Edition
                    </div>

                    <h1 className={styles.heroTitle}>
                        {lang === 'fr' ? (
                            <>
                                Arrêtez de trader avec{' '}
                                <span className={styles.heroTitleEm}>vos émotions.</span>
                                <br />
                                Commencez à trader avec{' '}
                                <span className={styles.heroTitleGlow}>des règles.</span>
                            </>
                        ) : (
                            <>
                                Stop trading with{' '}
                                <span className={styles.heroTitleEm}>emotions.</span>
                                <br />
                                Start trading with{' '}
                                <span className={styles.heroTitleGlow}>rules.</span>
                            </>
                        )}
                    </h1>

                    <p className={styles.heroSub}>
                        {lang === 'fr' ? (
                            <>
                                RiskGuardia est l&apos;OS de risque professionnel pour les traders actifs.
                                <br className={styles.heroBr} />
                                Calculez vos tailles de position, appliquez vos limites journalières et suivez chaque trade — en temps réel.
                            </>
                        ) : (
                            <>
                                RiskGuardia is the professional risk OS for active traders.
                                <br className={styles.heroBr} />
                                Calculate position sizes, enforce daily loss limits, and track every trade — in real-time.
                            </>
                        )}
                    </p>

                    <div className={styles.heroCtas}>
                        <Link href="/app" className={styles.heroCtaPrimary} id="hero-cta-launch">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                <path d="M9 2L11.25 7.5H17L12.5 11L14.25 16.5L9 13L3.75 16.5L5.5 11L1 7.5H6.75L9 2Z" fill="currentColor" />
                            </svg>
                            {lang === 'fr' ? 'Commencer gratuitement — Sans carte' : 'Start Free — No card required'}
                        </Link>
                        <a href="#features" className={styles.heroCtaSecondary} id="hero-cta-features">
                            {lang === 'fr' ? 'Voir comment ça marche' : 'See how it works'}
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </a>
                    </div>

                    <div className={styles.heroSocial}>
                        <div className={styles.heroAvatars}>
                            {['M', 'S', 'J', 'A', 'T'].map((l, i) => (
                                <div key={i} className={`${styles.heroAvatar} z-[${5 - i}]`}>{l}</div>
                            ))}
                        </div>
                        <p className={styles.heroSocialText}>
                            <strong>2,400+</strong> {lang === 'fr' ? 'traders maîtrisant leur risque quotidien' : 'traders controlling their risk daily'}
                        </p>
                    </div>
                </div>

                {/* Hero App Preview */}
                <div className={styles.heroPreview}>
                    <div className={styles.heroPhone}>
                        <div className={styles.heroPhoneBar} />
                        <div className={styles.heroPhoneContent}>
                            {/* Mini dashboard mockup */}
                            <div className={styles.mockHeader}>
                                <div className={styles.mockLogo}>
                                    <span className={styles.mockLogoShield}>⬡</span>
                                    <span className="font-bold text-[13px] tracking-[-0.3px]">RiskGuardia</span>
                                </div>
                                <div className={styles.mockBalance}>$51,402</div>
                            </div>
                            <div className={styles.mockGuard}>
                                <div className={styles.mockGuardRing}>
                                    <svg viewBox="0 0 80 80" width="80" height="80">
                                        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                                        <circle cx="40" cy="40" r="32" fill="none" stroke="#00D4FF" strokeWidth="6"
                                            strokeDasharray="201" strokeDashoffset="161" strokeLinecap="round"
                                            transform="rotate(-90 40 40)" />
                                    </svg>
                                    <div className={styles.mockGuardLabel}>
                                        <div className="text-[13px] font-extrabold text-[#00D4FF] tracking-[-0.5px]">20%</div>
                                        <div className="text-[8px] text-[#475569] mt-1">used</div>
                                    </div>
                                </div>
                                <div className={styles.mockGuardInfo}>
                                    <div className="text-[10px] text-[#475569] uppercase tracking-[0.06em] mb-1">Daily Guard</div>
                                    <div className="text-[14px] font-extrabold text-[#00E676]">$640 left</div>
                                    <div className="text-[10px] text-[#64748B]">of $800 limit</div>
                                </div>
                            </div>
                            <div className={styles.mockStats}>
                                {[
                                    { v: '770', l: 'lots' },
                                    { v: '2.0R', l: 'ratio' },
                                    { v: '+1.5%', l: 'risk' },
                                ].map(({ v, l }) => (
                                    <div key={l} className={styles.mockStat}>
                                        <div className={styles.mockStatVal}>{v}</div>
                                        <div className={styles.mockStatLbl}>{l}</div>
                                    </div>
                                ))}
                            </div>
                            <div className={styles.mockCta}>Calculate Position →</div>
                            <div className={styles.mockNav}>
                                {['🏠', '📊', '📄', '📒', '⚙️'].map((icon, i) => (
                                    <div key={i} className={`${styles.mockNavItem} ${i === 1 ? styles.mockNavItemActive : ''}`}>{icon}</div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className={styles.heroPhoneGlow} />
                </div>
            </section>

            {/* ── EMAIL CAPTURE ── */}
            <section style={{
                background: 'rgba(166,255,77,0.04)',
                borderTop: '1px solid rgba(166,255,77,0.12)',
                borderBottom: '1px solid rgba(166,255,77,0.12)',
                padding: '32px 20px',
            }}>
                <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#A6FF4D', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                        {lang === 'fr' ? 'ACCÈS ANTICIPÉ' : 'EARLY ACCESS'}
                    </div>
                    <h2 style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8, letterSpacing: '-0.03em' }}>
                        {lang === 'fr' ? 'Rejoignez la liste d\'attente Pro' : 'Join the Pro Waitlist'}
                    </h2>
                    <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#8b949e', marginBottom: 20 }}>
                        {lang === 'fr'
                            ? 'Soyez parmi les premiers à accéder aux fonctionnalités Pro. Aucun spam, désabonnement en 1 clic.'
                            : 'Be first to access Pro features when they launch. No spam, unsubscribe anytime.'}
                    </p>
                    {waitlistStatus === 'success' ? (
                        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#A6FF4D', padding: '12px 20px', background: 'rgba(166,255,77,0.08)', border: '1px solid rgba(166,255,77,0.3)' }}>
                            ✓ {lang === 'fr' ? 'Vous êtes inscrit ! On vous contacte bientôt.' : "You're on the list! We'll be in touch."}
                        </div>
                    ) : (
                        <form onSubmit={handleWaitlist} style={{ display: 'flex', gap: 0, maxWidth: 420, margin: '0 auto' }}>
                            <input
                                type="email"
                                required
                                placeholder={lang === 'fr' ? 'votre@email.com' : 'your@email.com'}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                style={{
                                    flex: 1, fontFamily: 'monospace', fontSize: 13, color: '#fff',
                                    background: '#0d1117', border: '1px solid #1a1c24', borderRight: 'none',
                                    padding: '10px 14px', outline: 'none',
                                }}
                            />
                            <button
                                type="submit"
                                style={{
                                    fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                                    padding: '10px 18px', background: '#A6FF4D', color: '#090909',
                                    border: 'none', cursor: 'pointer', letterSpacing: '0.06em',
                                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                                }}
                            >
                                {lang === 'fr' ? 'Rejoindre →' : 'Join →'}
                            </button>
                        </form>
                    )}
                </div>
            </section>

            {/* ── SOCIAL PROOF STRIP ── */}
            <div className={styles.proofStrip}>
                <div className={styles.proofStripInner}>
                    {[
                        { num: '2400', suf: '+', label: 'Active traders' },
                        { num: '98', suf: '%', label: 'Daily limit compliance' },
                        { num: '4', suf: '.8★', label: 'Average rating' },
                        { num: '12000', suf: '+', label: 'Trades calculated' },
                    ].map(({ num, suf, label }, i) => (
                        <div key={i} className={styles.proofItem}>
                            <span className={styles.proofNum}>{num}<span className={styles.proofSuf}>{suf}</span></span>
                            <span className={styles.proofLabel}>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── FEATURES ── */}
            <section className={styles.section} id="features">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{lang === 'fr' ? 'Fonctionnalités' : 'Core Features'}</div>
                    <h2 className={styles.sectionTitle}>
                        {lang === 'fr' ? 'Tous les outils d\'un trader discipliné' : 'Every tool a disciplined trader needs'}
                    </h2>
                    <p className={styles.sectionSub}>
                        Purpose-built for active traders who are serious about protecting their capital — not just growing it.
                    </p>

                    <div className={styles.featuresGrid}>
                        {features.map((f, i) => (
                            <FeatureCard key={f.title} {...f} delay={i * 60} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section className={`${styles.section} !bg-[rgba(255,255,255,0.015)]`} id="how">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>{lang === 'fr' ? 'Comment ça marche' : 'How It Works'}</div>
                    <h2 className={styles.sectionTitle}>{lang === 'fr' ? 'De la configuration au premier trade en 60 secondes' : 'From setup to first trade in 60 seconds'}</h2>

                    <div className={styles.stepsGrid}>
                        {[
                            {
                                n: '01', title: 'Set your rules',
                                desc: 'Enter your account balance, daily loss limit (e.g. $800), and max risk per trade (e.g. 1.5%). These become your trading constitution.',
                                accent: '#00D4FF',
                            },
                            {
                                n: '02', title: 'Calculate before every trade',
                                desc: 'Open the position calculator. Enter entry price and stop loss. RiskGuardia instantly shows your exact lot size, TP price, and R:R ratio.',
                                accent: '#00E676',
                            },
                            {
                                n: '03', title: 'Guard enforces the rules',
                                desc: 'The Daily Guard ring fills as you trade. When approaching your limit, the app warns you. When you hit it, it stops you. No exceptions.',
                                accent: '#7C3AED',
                            },
                            {
                                n: '04', title: 'Analyze & improve',
                                desc: 'Review cumulative P&L curves, win rates, and trade patterns. See exactly where your edge is — and where your emotions cost you money.',
                                accent: '#FFB300',
                            },
                        ].map((step, i) => (
                            <StepCard key={step.n} {...step} delay={i * 80} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ── STATS ── */}
            <section className={styles.statsSection}>
                <div className={styles.statsOrb} />
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>By the numbers</div>
                    <h2 className={styles.sectionTitle}>Real impact for real traders</h2>
                    <div className={styles.statsGrid}>
                        <StatCard value={2400} suffix="+" label="Active users" />
                        <StatCard value={98} suffix="%" label="Daily limit compliance rate" />
                        <StatCard value={12000} suffix="+" label="Trades calculated" />
                        <StatCard value={48} suffix="%" label="Avg win rate improvement" />
                    </div>
                </div>
            </section>

            {/* ── TESTIMONIALS ── */}
            <section className={styles.section} id="testimonials">
                <div className={styles.sectionInner}>
                    <div className={styles.sectionLabel}>Trader Stories</div>
                    <h2 className={styles.sectionTitle}>Built by traders, validated by traders</h2>
                    <div className={styles.testimonialsGrid}>
                        {testimonials.map((t, i) => (
                            <TestimonialCard key={t.name} {...t} delay={i * 80} />
                        ))}
                    </div>
                </div>
            </section>


            {/* ── PRICING ── */}
            <section style={{ padding: '64px 20px', background: '#090909' }} id="pricing">
                <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#A6FF4D', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                            {lang === 'fr' ? 'TARIFS' : 'PRICING'}
                        </div>
                        <h2 style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', marginBottom: 10 }}>
                            {lang === 'fr' ? 'Simple. Transparent.' : 'Simple. Transparent.'}
                        </h2>
                        <p style={{ fontFamily: 'monospace', fontSize: 13, color: '#8b949e' }}>
                            {lang === 'fr' ? 'Commencez gratuitement, passez à Pro quand vous êtes prêt.' : 'Start free. Upgrade when you\'re ready.'}
                        </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 1, background: '#1a1c24' }}>
                        {/* Free tier */}
                        <div style={{ background: '#0d1117', padding: '32px 28px' }}>
                            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                                {lang === 'fr' ? 'GRATUIT' : 'FREE'}
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                                $0<span style={{ fontSize: 14, color: '#6b7280', fontWeight: 400 }}>{lang === 'fr' ? '/mois' : '/month'}</span>
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280', marginBottom: 24 }}>
                                {lang === 'fr' ? 'Pour les traders individuels' : 'For individual traders'}
                            </div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {(lang === 'fr'
                                    ? ['Jusqu\'à 50 trades', 'Journal de base', 'Calculateur de risque', 'PWA mobile']
                                    : ['Up to 50 trades', 'Basic journal', 'Risk calculator', 'Mobile PWA']
                                ).map(f => (
                                    <li key={f} style={{ fontFamily: 'monospace', fontSize: 12, color: '#c9d1d9', display: 'flex', gap: 10, alignItems: 'center' }}>
                                        <span style={{ color: '#A6FF4D' }}>✓</span> {f}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rg-launch-app')); }}
                                style={{
                                    width: '100%', fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                                    padding: '12px', background: 'transparent', border: '1px solid #1a1c24',
                                    color: '#8b949e', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
                                }}
                            >
                                {lang === 'fr' ? 'Commencer →' : 'Get Started →'}
                            </button>
                        </div>
                        {/* Pro tier */}
                        <div style={{ background: '#0d1117', padding: '32px 28px', border: '1px solid rgba(166,255,77,0.3)', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#A6FF4D', color: '#090909', fontFamily: 'monospace', fontSize: 9, fontWeight: 900, padding: '3px 12px', letterSpacing: '0.1em' }}>
                                {lang === 'fr' ? 'POPULAIRE' : 'POPULAR'}
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#A6FF4D', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                                PRO
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                                $19<span style={{ fontSize: 14, color: '#6b7280', fontWeight: 400 }}>{lang === 'fr' ? '/mois' : '/month'}</span>
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280', marginBottom: 24 }}>
                                {lang === 'fr' ? 'Pour les traders sérieux' : 'For serious traders'}
                            </div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {(lang === 'fr'
                                    ? ['Trades illimités', 'IA comportementale (14 patterns)', 'Bridge DXTrade en direct', 'Analytiques avancées (8 onglets)', 'Support prioritaire', 'Export PDF / PNG']
                                    : ['Unlimited trades', 'Behavioral AI (14 patterns)', 'DXTrade live bridge', 'Advanced analytics (8 tabs)', 'Priority support', 'PDF / PNG export']
                                ).map(f => (
                                    <li key={f} style={{ fontFamily: 'monospace', fontSize: 12, color: '#c9d1d9', display: 'flex', gap: 10, alignItems: 'center' }}>
                                        <span style={{ color: '#A6FF4D' }}>✓</span> {f}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rg-launch-app')); }}
                                style={{
                                    width: '100%', fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                                    padding: '12px', background: '#A6FF4D', border: 'none',
                                    color: '#090909', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
                                }}
                            >
                                {lang === 'fr' ? 'Essai Pro gratuit →' : 'Start Pro Trial →'}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FINAL CTA ── */}
            <section className={styles.finalCta}>
                <div className={styles.finalCtaOrb1} />
                <div className={styles.finalCtaOrb2} />
                <div className={styles.sectionInner}>
                    <div className={styles.finalCtaInner}>
                        <div className={`${styles.sectionLabel} text-center`}>Get Started</div>
                        <h2 className={styles.finalCtaTitle}>
                            {lang === 'fr' ? 'Votre prochaine série de pertes est évitable.' : 'Your next losing streak is preventable.'}
                        </h2>
                        <p className={styles.finalCtaSub}>
                            Join 2,400+ traders who trade with rules, not emotions.
                            <br />Free to start. No credit card. No BS.
                        </p>
                        <Link href="/app" className={styles.finalCtaBtn} id="final-cta-btn">
                            {lang === 'fr' ? 'Lancer RiskGuardia Gratuitement' : 'Launch RiskGuardia Free'}
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M4 10H16M11 5L16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </Link>
                        <p className={styles.finalCtaNote}>{lang === 'fr' ? 'Sans carte · Annulez quand vous voulez · Données locales' : 'No credit card · Cancel anytime · Full data ownership'}</p>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className={styles.footer}>
                <div className={styles.footerInner}>
                    <div className={styles.footerLogo}>
                        <span className="font-extrabold text-[16px] tracking-[-0.5px]">
                            Risk<span className="text-[var(--color-primary)]">Guardia</span>
                        </span>
                        <p className={styles.footerTagline}>Trade with rules, not emotions.</p>
                    </div>
                    <div className={styles.footerLinks}>
                        <div className={styles.footerCol}>
                            <div className={styles.footerColTitle}>Product</div>
                            <a href="#features" className={styles.footerLink}>Features</a>
                            <Link href="/app" className={styles.footerLink}>Launch App</Link>
                        </div>
                        <div className={styles.footerCol}>
                            <div className={styles.footerColTitle}>Support</div>
                            <a href="mailto:hello@riskguardia.app" className={styles.footerLink}>Contact</a>
                            <a href="#" className={styles.footerLink}>Privacy</a>
                            <a href="#" className={styles.footerLink}>Terms</a>
                        </div>
                    </div>
                </div>
                <div className={styles.footerBottom}>
                    <span>© 2026 RiskGuardia. For educational purposes.</span>
                    <span>Not financial advice.</span>
                </div>
            </footer>
        </div>
    );
}
