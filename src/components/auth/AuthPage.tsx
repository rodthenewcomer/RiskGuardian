'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, Shield, Loader2, Zap } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

type Mode = 'signin' | 'signup' | 'forgot';

interface AuthPageProps {
    onSuccess: (userId: string, email: string) => void;
}

export default function AuthPage({ onSuccess }: AuthPageProps) {
    const [mode, setMode] = useState<Mode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { language } = useAppStore();
    const lang = language ?? 'en';

    const T = {
        en: {
            tagline: 'AI Risk OS for prop traders.',
            signin: 'Sign In',
            signup: 'Create Account',
            forgot: 'Reset Password',
            email: 'Email address',
            password: 'Password',
            emailPlaceholder: 'you@email.com',
            passwordPlaceholder: '8+ characters',
            signinBtn: 'Sign In',
            signupBtn: 'Create Account',
            forgotBtn: 'Send Reset Email',
            noAccount: "No account?",
            hasAccount: 'Have an account?',
            forgotLink: 'Forgot password?',
            backToSignin: 'Back to sign in',
            emailSent: 'Check your email for the reset link.',
            googleBtn: 'Continue with Google',
            or: 'or',
            features: [
                'Real-time daily loss guard',
                'Prop firm rule enforcement',
                'AI behavioral coaching',
                'Trade sync across devices',
            ],
        },
        fr: {
            tagline: "L'OS de gestion du risque pour prop traders.",
            signin: 'Se connecter',
            signup: 'Créer un compte',
            forgot: 'Réinitialiser',
            email: 'Adresse e-mail',
            password: 'Mot de passe',
            emailPlaceholder: 'vous@email.com',
            passwordPlaceholder: '8+ caractères',
            signinBtn: 'Se connecter',
            signupBtn: 'Créer un compte',
            forgotBtn: 'Envoyer le lien',
            noAccount: 'Pas de compte ?',
            hasAccount: 'Déjà un compte ?',
            forgotLink: 'Mot de passe oublié ?',
            backToSignin: 'Retour à la connexion',
            emailSent: 'Consultez votre e-mail pour le lien de réinitialisation.',
            googleBtn: 'Continuer avec Google',
            or: 'ou',
            features: [
                'Protection perte journalière en temps réel',
                'Règles prop firm automatisées',
                'Coaching IA comportemental',
                'Sync des trades multi-appareils',
            ],
        },
    }[lang];

    const mono = 'var(--font-mono)';

    async function handleGoogleSignIn() {
        setLoading(true); setError('');
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/app?auth=callback` },
        });
        if (error) { setError(error.message); setLoading(false); }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(''); setSuccess('');
        if (!email) { setError(lang === 'fr' ? 'E-mail requis' : 'Email required'); return; }

        setLoading(true);
        try {
            if (mode === 'forgot') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/app?auth=reset`,
                });
                if (error) throw error;
                setSuccess(T.emailSent);
                return;
            }

            if (mode === 'signup') {
                const res = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
                });
                const json = await res.json();
                if (!res.ok) {
                    const msg = json.error ?? 'Signup failed';
                    if (msg.includes('already been registered') || msg.includes('already registered') || msg.includes('already exists')) {
                        throw new Error(lang === 'fr' ? 'Cet e-mail est déjà utilisé' : 'Email already in use — sign in instead');
                    }
                    throw new Error(msg);
                }
                const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
                if (signInError) throw signInError;
                if (signInData.user) onSuccess(signInData.user.id, signInData.user.email ?? email);
                return;
            }

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (data.user) onSuccess(data.user.id, data.user.email ?? email);

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('Invalid login credentials')) {
                setError(lang === 'fr' ? 'Email ou mot de passe incorrect' : 'Invalid email or password');
            } else if (msg.includes('Email not confirmed')) {
                setError(lang === 'fr' ? 'Confirmez votre e-mail avant de vous connecter' : 'Confirm your email before signing in');
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', fontFamily: mono, fontSize: 13, color: '#fff',
        background: '#0b0e14', border: '2px solid #1a1c24',
        padding: '11px 14px', outline: 'none', boxSizing: 'border-box',
        borderRadius: 0, transition: 'border-color 0.15s',
    };

    return (
        <div style={{
            minHeight: '100dvh',
            background: '#090909',
            display: 'flex',
            alignItems: 'stretch',
        }}>
            {/* ── LEFT PANEL (desktop only) ─────────────────────── */}
            <div style={{
                display: 'none',
                flex: '1',
                background: '#0d1117',
                borderRight: '2px solid #1a1c24',
                padding: '48px 56px',
                flexDirection: 'column',
                justifyContent: 'space-between',
            }}
                className="auth-left-panel"
            >
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36, height: 36,
                        background: '#FDC800',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '3px 3px 0 #000',
                    }}>
                        <Shield size={18} color="#000" />
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
                        Risk<span style={{ color: '#FDC800' }}>Guardian</span>
                    </span>
                </div>

                {/* Headline */}
                <div>
                    <p style={{ fontFamily: mono, fontSize: 11, color: '#FDC800', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
                        AI RISK OS
                    </p>
                    <h1 style={{ fontFamily: mono, fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.04em', marginBottom: 12 }}>
                        {lang === 'fr' ? 'Protégez votre compte.' : 'Protect your account.'}
                        <br />
                        <span style={{ color: '#FDC800' }}>
                            {lang === 'fr' ? 'Tradez sans limite.' : 'Trade without limits.'}
                        </span>
                    </h1>
                    <p style={{ fontFamily: mono, fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                        {T.tagline}
                    </p>

                    {/* Feature list */}
                    <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {T.features.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 6, height: 6, background: '#FDC800', flexShrink: 0 }} />
                                <span style={{ fontFamily: mono, fontSize: 13, color: '#c9d1d9' }}>{f}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 32 }}>
                    {[
                        { n: '2,400+', l: lang === 'fr' ? 'traders actifs' : 'active traders' },
                        { n: '$0', l: lang === 'fr' ? 'de frais' : 'fees' },
                        { n: '99.9%', l: lang === 'fr' ? 'disponibilité' : 'uptime' },
                    ].map(s => (
                        <div key={s.l}>
                            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 900, color: '#FDC800', letterSpacing: '-0.04em' }}>{s.n}</div>
                            <div style={{ fontFamily: mono, fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.l}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── RIGHT PANEL / FORM ────────────────────────────── */}
            <div style={{
                flex: '0 0 100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 20px',
            }}
                className="auth-right-panel"
            >
                <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                        width: '100%',
                        maxWidth: 400,
                    }}
                >
                    {/* Mobile logo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}
                        className="auth-mobile-logo"
                    >
                        <div style={{
                            width: 32, height: 32, background: '#FDC800',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '2px 2px 0 #000',
                        }}>
                            <Shield size={16} color="#000" />
                        </div>
                        <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
                            Risk<span style={{ color: '#FDC800' }}>Guardian</span>
                        </span>
                    </div>

                    {/* Title */}
                    <h2 style={{ fontFamily: mono, fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', marginBottom: 4 }}>
                        {mode === 'signin' ? T.signin : mode === 'signup' ? T.signup : T.forgot}
                    </h2>
                    <p style={{ fontFamily: mono, fontSize: 11, color: '#4b5563', letterSpacing: '0.04em', marginBottom: 28 }}>
                        {T.tagline}
                    </p>

                    {/* Google */}
                    {mode !== 'forgot' && (
                        <>
                            <button
                                onClick={handleGoogleSignIn}
                                disabled={loading}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                    fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                                    padding: '12px', background: '#0d1117',
                                    border: '2px solid #1a1c24', boxShadow: '3px 3px 0 #000',
                                    color: '#c9d1d9', cursor: 'pointer', marginBottom: 16,
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 48 48">
                                    <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 32.8 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.6-8 19.6-20 0-1.3-.1-2.7-.4-4z"/>
                                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.7 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.7 8.5 6.3 14.7z"/>
                                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.2-11.3-7.8l-6.6 5.1C9.6 39.4 16.3 44 24 44z"/>
                                    <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.4 4.1-4.4 5.4l6.2 5.2c3.6-3.3 5.9-8.2 5.9-14.6 0-1.3-.1-2.7-.4-4z"/>
                                </svg>
                                {T.googleBtn}
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <div style={{ flex: 1, height: 1, background: '#1a1c24' }} />
                                <span style={{ fontFamily: mono, fontSize: 10, color: '#4b5563' }}>{T.or}</span>
                                <div style={{ flex: 1, height: 1, background: '#1a1c24' }} />
                            </div>
                        </>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={{ display: 'block', fontFamily: mono, fontSize: 10, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                                {T.email}
                            </label>
                            <input
                                type="email" required
                                placeholder={T.emailPlaceholder}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                style={inputStyle}
                                autoComplete="email"
                            />
                        </div>

                        {mode !== 'forgot' && (
                            <div>
                                <label style={{ display: 'block', fontFamily: mono, fontSize: 10, color: '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                                    {T.password}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        required minLength={6}
                                        placeholder={T.passwordPlaceholder}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        style={{ ...inputStyle, paddingRight: 44 }}
                                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPw(v => !v)}
                                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                                    >
                                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    style={{ fontFamily: mono, fontSize: 11, color: '#ff4757', background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', padding: '9px 12px' }}
                                >
                                    {error}
                                </motion.div>
                            )}
                            {success && (
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    style={{ fontFamily: mono, fontSize: 11, color: '#FDC800', background: 'rgba(253,200,0,0.08)', border: '1px solid rgba(253,200,0,0.25)', padding: '9px 12px' }}
                                >
                                    {success}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            type="submit"
                            disabled={loading || !!success}
                            style={{
                                width: '100%', fontFamily: mono, fontSize: 13, fontWeight: 800,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                padding: '14px', background: '#FDC800',
                                border: 'none', boxShadow: '4px 4px 0 #000',
                                color: '#090909', cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading || !!success ? 0.7 : 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                marginTop: 4,
                                transition: 'box-shadow 0.1s, transform 0.1s',
                            }}
                            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '2px 2px 0 #000'; (e.currentTarget as HTMLButtonElement).style.transform = 'translate(2px,2px)'; }}
                            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '4px 4px 0 #000'; (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                        >
                            {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                            {!loading && <Zap size={14} />}
                            {mode === 'signin' ? T.signinBtn : mode === 'signup' ? T.signupBtn : T.forgotBtn}
                        </button>
                    </form>

                    {/* Mode switchers */}
                    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                        {mode === 'signin' && (
                            <>
                                <button
                                    onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                                    style={{ fontFamily: mono, fontSize: 10, color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    {T.forgotLink}
                                </button>
                                <span style={{ fontFamily: mono, fontSize: 12, color: '#4b5563' }}>
                                    {T.noAccount}{' '}
                                    <button
                                        onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
                                        style={{ fontFamily: mono, fontSize: 12, color: '#FDC800', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        {T.signup}
                                    </button>
                                </span>
                            </>
                        )}
                        {mode === 'signup' && (
                            <span style={{ fontFamily: mono, fontSize: 12, color: '#4b5563' }}>
                                {T.hasAccount}{' '}
                                <button
                                    onClick={() => { setMode('signin'); setError(''); setSuccess(''); }}
                                    style={{ fontFamily: mono, fontSize: 12, color: '#FDC800', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    {T.signin}
                                </button>
                            </span>
                        )}
                        {mode === 'forgot' && (
                            <button
                                onClick={() => { setMode('signin'); setError(''); setSuccess(''); }}
                                style={{ fontFamily: mono, fontSize: 10, color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                {T.backToSignin}
                            </button>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* ── Responsive styles injected inline ─────────────── */}
            <style>{`
                @media (min-width: 768px) {
                    .auth-left-panel { display: flex !important; }
                    .auth-right-panel { flex: 0 0 420px !important; border-left: 2px solid #1a1c24; }
                    .auth-mobile-logo { display: none !important; }
                }
            `}</style>
        </div>
    );
}
