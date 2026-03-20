'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { X, Eye, EyeOff, Shield, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

type Mode = 'signin' | 'signup' | 'forgot';

interface AuthModalProps {
    onClose: () => void;
    onSuccess: (userId: string, email: string) => void;
}

export default function AuthModal({ onClose, onSuccess }: AuthModalProps) {
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
            noAccount: "Don't have an account?",
            hasAccount: 'Already have an account?',
            forgotLink: 'Forgot password?',
            backToSignin: 'Back to sign in',
            emailSent: 'Check your email for the reset link.',
            signupSuccess: 'Account created! Check your email to confirm.',
            subtitle: 'Sync your trades across all devices',
            googleBtn: 'Continue with Google',
            or: 'or',
        },
        fr: {
            signin: 'Se connecter',
            signup: 'Créer un compte',
            forgot: 'Réinitialiser le mot de passe',
            email: 'Adresse e-mail',
            password: 'Mot de passe',
            emailPlaceholder: 'vous@email.com',
            passwordPlaceholder: '8+ caractères',
            signinBtn: 'Se connecter',
            signupBtn: 'Créer un compte',
            forgotBtn: 'Envoyer le lien',
            noAccount: 'Pas encore de compte ?',
            hasAccount: 'Déjà un compte ?',
            forgotLink: 'Mot de passe oublié ?',
            backToSignin: 'Retour à la connexion',
            emailSent: 'Consultez votre e-mail pour le lien de réinitialisation.',
            signupSuccess: 'Compte créé ! Vérifiez votre e-mail pour confirmer.',
            subtitle: 'Synchronisez vos trades sur tous vos appareils',
            googleBtn: 'Continuer avec Google',
            or: 'ou',
        },
    }[lang];

    const mono = 'var(--font-mono)';

    async function handleGoogleSignIn() {
        setLoading(true); setError('');
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/?auth=callback` },
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
                    redirectTo: `${window.location.origin}/?auth=reset`,
                });
                if (error) throw error;
                setSuccess(T.emailSent);
                return;
            }

            if (mode === 'signup') {
                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                if (data.user) {
                    if (data.session) {
                        onSuccess(data.user.id, data.user.email ?? email);
                    } else {
                        setSuccess(T.signupSuccess);
                    }
                }
                return;
            }

            // signin
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (data.user) onSuccess(data.user.id, data.user.email ?? email);

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Translate common Supabase errors
            if (msg.includes('Invalid login credentials')) {
                setError(lang === 'fr' ? 'Email ou mot de passe incorrect' : 'Invalid email or password');
            } else if (msg.includes('Email not confirmed')) {
                setError(lang === 'fr' ? 'Confirmez votre e-mail avant de vous connecter' : 'Please confirm your email before signing in');
            } else if (msg.includes('User already registered')) {
                setError(lang === 'fr' ? 'Cet e-mail est déjà utilisé' : 'Email already in use — sign in instead');
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%', fontFamily: mono, fontSize: 13, color: '#fff',
        background: '#0b0e14', border: '1px solid #1a1c24',
        padding: '10px 12px', outline: 'none', boxSizing: 'border-box',
        transition: 'border-color 0.15s',
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9998,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    width: '100%', maxWidth: 420,
                    background: '#0d1117',
                    border: '1px solid #1a1c24',
                    borderTop: '2px solid #A6FF4D',
                    padding: '28px 28px 24px',
                    position: 'relative',
                }}
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                >
                    <X size={18} />
                </button>

                {/* Logo + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <div style={{ width: 32, height: 32, background: 'rgba(166,255,77,0.1)', border: '1px solid rgba(166,255,77,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={16} color="#A6FF4D" />
                    </div>
                    <div>
                        <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                            Risk<span style={{ color: '#A6FF4D' }}>Guardian</span>
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 10, color: '#6b7280' }}>{T.subtitle}</div>
                    </div>
                </div>

                {/* Mode title */}
                <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 20, letterSpacing: '-0.02em' }}>
                    {T[mode === 'signin' ? 'signin' : mode === 'signup' ? 'signup' : 'forgot']}
                </div>

                {/* Google OAuth */}
                {mode !== 'forgot' && (
                    <>
                        <button
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                                padding: '10px', background: '#0b0e14', border: '1px solid #1a1c24',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <div style={{ flex: 1, height: 1, background: '#1a1c24' }} />
                            <span style={{ fontFamily: mono, fontSize: 10, color: '#4b5563' }}>{T.or}</span>
                            <div style={{ flex: 1, height: 1, background: '#1a1c24' }} />
                        </div>
                    </>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ display: 'block', fontFamily: mono, fontSize: 10, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                            {T.email}
                        </label>
                        <input
                            type="email"
                            required
                            placeholder={T.emailPlaceholder}
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            style={inputStyle}
                            autoComplete="email"
                        />
                    </div>

                    {mode !== 'forgot' && (
                        <div>
                            <label style={{ display: 'block', fontFamily: mono, fontSize: 10, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                                {T.password}
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    required
                                    minLength={6}
                                    placeholder={T.passwordPlaceholder}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    style={{ ...inputStyle, paddingRight: 40 }}
                                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(v => !v)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                                >
                                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Error / success */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ fontFamily: mono, fontSize: 11, color: '#ff4757', background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', padding: '8px 12px' }}
                            >
                                {error}
                            </motion.div>
                        )}
                        {success && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{ fontFamily: mono, fontSize: 11, color: '#A6FF4D', background: 'rgba(166,255,77,0.08)', border: '1px solid rgba(166,255,77,0.2)', padding: '8px 12px' }}
                            >
                                {success}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        disabled={loading || !!success}
                        style={{
                            width: '100%', fontFamily: mono, fontSize: 12, fontWeight: 700,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            padding: '12px', background: '#A6FF4D', border: 'none',
                            color: '#090909', cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading || !!success ? 0.7 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            marginTop: 4,
                        }}
                    >
                        {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                        {mode === 'signin' ? T.signinBtn : mode === 'signup' ? T.signupBtn : T.forgotBtn}
                    </button>
                </form>

                {/* Mode switchers */}
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                    {mode === 'signin' && (
                        <>
                            <button onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                                style={{ fontFamily: mono, fontSize: 10, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                {T.forgotLink}
                            </button>
                            <span style={{ fontFamily: mono, fontSize: 11, color: '#4b5563' }}>
                                {T.noAccount}{' '}
                                <button onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
                                    style={{ fontFamily: mono, fontSize: 11, color: '#A6FF4D', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                    {T.signup}
                                </button>
                            </span>
                        </>
                    )}
                    {mode === 'signup' && (
                        <span style={{ fontFamily: mono, fontSize: 11, color: '#4b5563' }}>
                            {T.hasAccount}{' '}
                            <button onClick={() => { setMode('signin'); setError(''); setSuccess(''); }}
                                style={{ fontFamily: mono, fontSize: 11, color: '#A6FF4D', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                {T.signin}
                            </button>
                        </span>
                    )}
                    {mode === 'forgot' && (
                        <button onClick={() => { setMode('signin'); setError(''); setSuccess(''); }}
                            style={{ fontFamily: mono, fontSize: 10, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                            {T.backToSignin}
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
