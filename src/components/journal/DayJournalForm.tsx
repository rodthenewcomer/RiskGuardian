'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star } from 'lucide-react';
import { DayJournalEntry } from '@/store/appStore';

const SESSION_TAGS = [
    'A-Setup', 'B-Setup', 'C-Setup', 'FOMO Entry', 'Revenge', 'Off-Plan',
    'News Play', 'Scalp', 'Swing', 'Clean Execution', 'Over-Sized', 'Early Exit', 'Review Required',
];

const MOODS_POSITIVE = ['Optimal', 'Focused', 'Confident'];
const MOODS_NEUTRAL  = ['Nervous', 'Fearful', 'Tired', 'Distracted'];
const MOODS_NEGATIVE = ['Frustrated', 'Angry', 'FOMO', 'Revenge Mode', 'Overconfident'];

const RULE_VIOLATIONS = [
    'Open Window Risk', 'Daily Stop Breach', 'Revenge Trading', 'Held Losers',
    'Contract Escalation', 'Spike Vulnerability', 'Early Exit / Cutting Winners Short',
];

const SETUP_TYPES = ['Breakout', 'Pullback', 'Reversal', 'Range', 'Momentum', 'News', 'Scalp', 'Swing'];
const MARKET_CONDITIONS = ['Trending Up', 'Trending Down', 'Range Bound', 'High Volatility', 'Low Volatility', 'News Driven'];
const ENTRY_REASONS = ['Structure Break', 'Confluence Zone', 'Momentum Signal', 'Reversal Pattern', 'News Catalyst', 'Planned Setup'];
const EXIT_REASONS = ['Take Profit Hit', 'Stop Loss Hit', 'Manual Exit', 'Trailing Stop', 'Time Exit', 'Reversal Signal'];

interface Props {
    date: string;
    dateLabel: string;
    dayPnl: number;
    existing?: DayJournalEntry;
    lang: 'en' | 'fr';
    onSave: (entry: DayJournalEntry) => void;
    onClose: () => void;
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
const divider = '1px solid #1a1c24';

const fieldLabel: React.CSSProperties = {
    ...mono, fontSize: 9, color: '#4b5563', letterSpacing: '0.1em',
    textTransform: 'uppercase', display: 'block', marginBottom: 6,
};

const selectStyle: React.CSSProperties = {
    width: '100%', background: '#090909', border: '1px solid #1a1c24',
    color: '#c9d1d9', padding: '8px 10px', ...mono, fontSize: 12,
    outline: 'none', appearance: 'none', cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: '#090909',
    border: '1px solid #1a1c24', color: '#c9d1d9', padding: '8px 10px',
    ...mono, fontSize: 12, outline: 'none',
};

const sectionHead: React.CSSProperties = {
    ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: '#4b5563', display: 'block', marginBottom: 12,
};

function ChipToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                ...mono, fontSize: 11, padding: '5px 10px',
                border: `1px solid ${active ? '#FDC800' : '#1a1c24'}`,
                background: active ? 'rgba(253,200,0,0.12)' : 'transparent',
                color: active ? '#FDC800' : '#6b7280',
                cursor: 'pointer', transition: 'all 0.15s',
            }}
        >
            {label}
        </button>
    );
}

export default function DayJournalForm({ date, dateLabel, dayPnl, existing, lang, onSave, onClose }: Props) {
    const [sessionType, setSessionType] = useState<'pre' | 'post' | 'weekly'>(existing?.sessionType ?? 'post');
    const [setupType, setSetupType]     = useState(existing?.setupType ?? '');
    const [marketCond, setMarketCond]   = useState(existing?.marketCondition ?? '');
    const [plannedRR, setPlannedRR]     = useState(existing?.plannedRR ?? '');
    const [entryReason, setEntryReason] = useState(existing?.entryReason ?? '');
    const [exitReason, setExitReason]   = useState(existing?.exitReason ?? '');
    const [actualRR, setActualRR]       = useState(existing?.actualRR ?? '');
    const [linkedIds, setLinkedIds]     = useState(existing?.linkedTradeIds ?? '');
    const [tags, setTags]               = useState<string[]>(existing?.tags ?? []);
    const [wentWell, setWentWell]       = useState(existing?.wentWell ?? '');
    const [wouldChange, setWouldChange] = useState(existing?.wouldChange ?? '');
    const [moods, setMoods]             = useState<string[]>(existing?.moods ?? []);
    const [sessionNote, setSessionNote] = useState(existing?.sessionNote ?? '');
    const [violations, setViolations]   = useState<string[]>(existing?.ruleViolations ?? []);
    const [rating, setRating]           = useState<number>(existing?.sessionRating ?? 0);
    const [hoverRating, setHoverRating] = useState(0);
    const [goalsMet, setGoalsMet]       = useState<boolean | undefined>(existing?.goalsMet);

    const toggleArr = (arr: string[], set: (a: string[]) => void, val: string) =>
        set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

    const handleSave = () => {
        onSave({
            date, sessionType,
            setupType: setupType || undefined,
            marketCondition: marketCond || undefined,
            plannedRR: plannedRR || undefined,
            entryReason: entryReason || undefined,
            exitReason: exitReason || undefined,
            actualRR: actualRR || undefined,
            linkedTradeIds: linkedIds || undefined,
            tags, wentWell: wentWell || undefined,
            wouldChange: wouldChange || undefined,
            moods, sessionNote: sessionNote || undefined,
            ruleViolations: violations,
            sessionRating: rating || undefined,
            goalsMet,
            savedAt: new Date().toISOString(),
        });
        onClose();
    };

    // Lock body scroll while open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                    zIndex: 1000, display: 'flex', alignItems: 'flex-end',
                    justifyContent: 'center',
                }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: '100%', maxWidth: 680, maxHeight: '92dvh',
                        background: '#0d1117', border: '1px solid #1a1c24',
                        borderBottom: 'none', overflowY: 'auto',
                        display: 'flex', flexDirection: 'column',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        position: 'sticky', top: 0, zIndex: 2,
                        background: '#0d1117', borderBottom: divider,
                        padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <div>
                            <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: '#fff' }}>{dateLabel}</span>
                            <span style={{ ...mono, fontSize: 11, color: dayPnl >= 0 ? '#FDC800' : '#ff4757', marginLeft: 12 }}>
                                {dayPnl >= 0 ? '+' : ''}${dayPnl.toFixed(2)}
                            </span>
                        </div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4 }}>
                            <X size={16} />
                        </button>
                    </div>

                    {/* Date + Session Type */}
                    <div style={{ padding: '16px 20px', borderBottom: divider, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                            <span style={fieldLabel}>{lang === 'fr' ? 'Date' : 'Date'}</span>
                            <div style={{ ...inputStyle, color: '#8b949e', pointerEvents: 'none' }}>{date}</div>
                        </div>
                        <div>
                            <span style={fieldLabel}>{lang === 'fr' ? 'Type de session' : 'Session Type'}</span>
                            <div style={{ display: 'flex', gap: 0 }}>
                                {(['pre', 'post', 'weekly'] as const).map(t => (
                                    <button key={t} type="button" onClick={() => setSessionType(t)}
                                        style={{
                                            flex: 1, ...mono, fontSize: 10, fontWeight: 700, padding: '7px 4px',
                                            border: '1px solid #1a1c24',
                                            background: sessionType === t ? '#FDC800' : 'transparent',
                                            color: sessionType === t ? '#000' : '#4b5563',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                            textTransform: 'uppercase',
                                        }}>
                                        {t === 'pre' ? (lang === 'fr' ? 'Pré' : 'Pre') : t === 'post' ? (lang === 'fr' ? 'Post' : 'Post') : (lang === 'fr' ? 'Hebdo' : 'Weekly')}
                                    </button>
                                ))}
                            </div>
                            <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 4 }}>
                                {sessionType === 'pre'
                                    ? (lang === 'fr' ? 'Plan ton biais avant d\'ouvrir le marché.' : 'Plan your bias before opening the market.')
                                    : sessionType === 'post'
                                    ? (lang === 'fr' ? 'Consigne le déroulé, les violations, les émotions.' : 'Log how the session went — mindset, violations, what you felt during trades.')
                                    : (lang === 'fr' ? 'Revue hebdomadaire de performance.' : 'Weekly performance review.')}
                            </span>
                        </div>
                    </div>

                    {/* Session Context */}
                    <div style={{ padding: '16px 20px', borderBottom: divider }}>
                        <span style={sectionHead}>{lang === 'fr' ? 'Contexte de session' : 'Session Context'}</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12, marginBottom: 12 }}>
                            <div>
                                <span style={fieldLabel}>{lang === 'fr' ? 'Type de setup' : 'Setup Type'}</span>
                                <select value={setupType} onChange={e => setSetupType(e.target.value)} style={selectStyle}>
                                    <option value="">{lang === 'fr' ? 'Sélectionner…' : 'Select…'}</option>
                                    {SETUP_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={fieldLabel}>{lang === 'fr' ? 'Conditions marché' : 'Market Condition'}</span>
                                <select value={marketCond} onChange={e => setMarketCond(e.target.value)} style={selectStyle}>
                                    <option value="">{lang === 'fr' ? 'Sélectionner…' : 'Select…'}</option>
                                    {MARKET_CONDITIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={fieldLabel}>{lang === 'fr' ? 'R:R Planifié' : 'Planned R:R'}</span>
                                <input type="text" placeholder="e.g. 2.5" value={plannedRR}
                                    onChange={e => setPlannedRR(e.target.value)} style={inputStyle} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12, marginBottom: 12 }}>
                            <div>
                                <span style={fieldLabel}>{lang === 'fr' ? 'Raison d\'entrée' : 'Entry Reason'}</span>
                                <select value={entryReason} onChange={e => setEntryReason(e.target.value)} style={selectStyle}>
                                    <option value="">{lang === 'fr' ? 'Sélectionner…' : 'Select…'}</option>
                                    {ENTRY_REASONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={fieldLabel}>{lang === 'fr' ? 'Raison de sortie' : 'Exit Reason'}</span>
                                <select value={exitReason} onChange={e => setExitReason(e.target.value)} style={selectStyle}>
                                    <option value="">{lang === 'fr' ? 'Sélectionner…' : 'Select…'}</option>
                                    {EXIT_REASONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <span style={fieldLabel}>{lang === 'fr' ? 'R:R Réel' : 'Actual R:R'}</span>
                                <input type="text" placeholder="e.g. 1.2" value={actualRR}
                                    onChange={e => setActualRR(e.target.value)} style={inputStyle} />
                            </div>
                        </div>
                        <div>
                            <span style={fieldLabel}>{lang === 'fr' ? 'IDs de trades liés / horodatages' : 'Linked Trade IDs / Timestamps'}</span>
                            <input type="text" value={linkedIds} onChange={e => setLinkedIds(e.target.value)}
                                placeholder={lang === 'fr' ? 'ex. T-1042, T-1043 ou 10:05am, 10:32am — depuis votre plateforme' : 'e.g. T-1042, T-1043  or  10:05am, 10:32am — from your broker platform'}
                                style={inputStyle} />
                            <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 4 }}>
                                {lang === 'fr' ? 'Référencez des trades spécifiques pour recouper dans votre blotter.' : 'Reference specific trades from this session so you can cross-check in your broker\'s blotter.'}
                            </span>
                        </div>
                    </div>

                    {/* Session Tags */}
                    <div style={{ padding: '16px 20px', borderBottom: divider }}>
                        <span style={sectionHead}>{lang === 'fr' ? 'Étiquettes de session' : 'Session Tags'}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {SESSION_TAGS.map(tag => (
                                <ChipToggle key={tag} label={tag} active={tags.includes(tag)}
                                    onClick={() => toggleArr(tags, setTags, tag)} />
                            ))}
                        </div>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginTop: 8 }}>
                            {lang === 'fr' ? 'Les tags activent l\'analytique par setup et rendent les sessions filtrables.' : 'Tags unlock per-setup analytics and make sessions filterable in the journal.'}
                        </span>
                    </div>

                    {/* Session Reflection */}
                    <div style={{ padding: '16px 20px', borderBottom: divider }}>
                        <span style={sectionHead}>{lang === 'fr' ? 'Réflexion de session' : 'Session Reflection'}</span>
                        <div style={{ marginBottom: 12 }}>
                            <span style={{ ...mono, fontSize: 9, color: '#38bdf8', display: 'block', marginBottom: 6 }}>
                                → {lang === 'fr' ? 'Qu\'as-tu bien fait cette session ?' : 'What did you do well this session?'}
                            </span>
                            <textarea value={wentWell} onChange={e => setWentWell(e.target.value)} rows={3}
                                placeholder={lang === 'fr' ? 'ex. J\'ai attendu la confirmation avant d\'entrer. J\'ai respecté mon stop sur le 2ème trade.' : 'e.g. Waited for confirmation before entering. Honored my stop on the second trade without hesitation.'}
                                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                        </div>
                        <div>
                            <span style={{ ...mono, fontSize: 9, color: '#F97316', display: 'block', marginBottom: 6 }}>
                                → {lang === 'fr' ? 'Que ferais-tu différemment ?' : 'What would you do differently?'}
                            </span>
                            <textarea value={wouldChange} onChange={e => setWouldChange(e.target.value)} rows={3}
                                placeholder={lang === 'fr' ? 'ex. Je sortirais le trade gagnant plus tôt — j\'ai tenu trop longtemps et rendu $200.' : 'e.g. I would exit the winning trade earlier — I held too long chasing a larger target and gave back $200.'}
                                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                        </div>
                    </div>

                    {/* Emotional State */}
                    <div style={{ padding: '16px 20px', borderBottom: divider }}>
                        <span style={sectionHead}>{lang === 'fr' ? 'Comment tu te sentais ?' : 'How are you feeling?'}</span>
                        <span style={{ ...mono, fontSize: 10, color: '#4b5563', display: 'block', marginBottom: 12 }}>
                            {lang === 'fr'
                                ? 'Sélectionne tout ce qui s\'appliquait. Après 3 entrées, l\'IA corrèle ces états à ton P&L.'
                                : 'Select all that applied during this session. After 3 entries, AI maps these to your P&L to reveal which emotional states precede your biggest losses.'}
                        </span>
                        {[
                            { label: lang === 'fr' ? 'Positif' : 'Positive', moods: MOODS_POSITIVE, color: '#FDC800' },
                            { label: lang === 'fr' ? 'Neutre' : 'Neutral', moods: MOODS_NEUTRAL, color: '#38bdf8' },
                            { label: lang === 'fr' ? 'Négatif' : 'Negative', moods: MOODS_NEGATIVE, color: '#ff4757' },
                        ].map(group => (
                            <div key={group.label} style={{ marginBottom: 10 }}>
                                <span style={{ ...mono, fontSize: 9, color: group.color, letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                                    {group.label}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {group.moods.map(m => (
                                        <button key={m} type="button" onClick={() => toggleArr(moods, setMoods, m)}
                                            style={{
                                                ...mono, fontSize: 11, padding: '5px 12px',
                                                borderRadius: 999, border: `1px solid ${moods.includes(m) ? group.color : '#1a1c24'}`,
                                                background: moods.includes(m) ? `${group.color}1a` : 'transparent',
                                                color: moods.includes(m) ? group.color : '#6b7280',
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                display: 'flex', alignItems: 'center', gap: 5,
                                            }}>
                                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: group.color, display: 'inline-block' }} />
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Session Note */}
                    <div style={{ padding: '16px 20px', borderBottom: divider }}>
                        <textarea value={sessionNote} onChange={e => setSessionNote(e.target.value)} rows={5}
                            maxLength={2000}
                            placeholder={lang === 'fr'
                                ? 'Décris la session. Qu\'est-ce qui a fonctionné ? Avec quoi as-tu lutté ? Quels patterns comportementaux as-tu observé en toi ?'
                                : 'Describe the session. What worked? What did you struggle with? Any behavioral patterns you noticed in yourself?'}
                            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>{sessionNote.length}/2000</span>
                        </div>
                    </div>

                    {/* Rule Violations */}
                    <div style={{ padding: '16px 20px', borderBottom: divider }}>
                        <span style={sectionHead}>{lang === 'fr' ? 'As-tu enfreint des règles aujourd\'hui ?' : 'Did you break any rules today?'}</span>
                        <span style={{ ...mono, fontSize: 9, color: '#4b5563', display: 'block', marginBottom: 10 }}>
                            {lang === 'fr'
                                ? 'Les règles viennent de ton analyse comportementale. Les tracker ici alimente ton graphique de fréquence des violations.'
                                : 'Rules are pulled from your behavioral analysis. Tracking them here builds your violation frequency chart and feeds the AI coaching loop.'}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {RULE_VIOLATIONS.map(v => (
                                <button key={v} type="button" onClick={() => toggleArr(violations, setViolations, v)}
                                    style={{
                                        textAlign: 'left', ...mono, fontSize: 11, padding: '8px 12px',
                                        border: `1px solid ${violations.includes(v) ? '#ff4757' : '#1a1c24'}`,
                                        background: violations.includes(v) ? 'rgba(255,71,87,0.1)' : 'transparent',
                                        color: violations.includes(v) ? '#ff4757' : '#6b7280',
                                        cursor: 'pointer', transition: 'all 0.15s', width: '100%',
                                    }}>
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Rating + Goals */}
                    <div style={{ padding: '16px 20px', borderBottom: divider, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div>
                            <span style={sectionHead}>{lang === 'fr' ? 'Note de session' : 'Session Rating'}</span>
                            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} type="button"
                                        onClick={() => setRating(n)}
                                        onMouseEnter={() => setHoverRating(n)}
                                        onMouseLeave={() => setHoverRating(0)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                        <Star size={22}
                                            fill={(hoverRating || rating) >= n ? '#FDC800' : 'none'}
                                            color={(hoverRating || rating) >= n ? '#FDC800' : '#1a1c24'}
                                        />
                                    </button>
                                ))}
                            </div>
                            <span style={{ ...mono, fontSize: 9, color: '#4b5563' }}>
                                {lang === 'fr' ? '1 = règles brisées · 5 = exécution parfaite' : '1 = broke rules · 5 = flawless execution'}
                            </span>
                        </div>
                        <div>
                            <span style={sectionHead}>{lang === 'fr' ? 'Objectifs atteints ?' : 'Goals Met?'}</span>
                            <span style={{ ...mono, fontSize: 10, color: '#4b5563', display: 'block', marginBottom: 8 }}>
                                {lang === 'fr' ? 'As-tu suivi ton plan de trading pré-session ?' : 'Did you follow your pre-session trading plan?'}
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" onClick={() => setGoalsMet(true)}
                                    style={{
                                        ...mono, fontSize: 11, padding: '6px 16px',
                                        border: `1px solid ${goalsMet === true ? '#FDC800' : '#1a1c24'}`,
                                        background: goalsMet === true ? 'rgba(253,200,0,0.12)' : 'transparent',
                                        color: goalsMet === true ? '#FDC800' : '#4b5563', cursor: 'pointer',
                                    }}>
                                    ✓ {lang === 'fr' ? 'Oui' : 'Yes'}
                                </button>
                                <button type="button" onClick={() => setGoalsMet(false)}
                                    style={{
                                        ...mono, fontSize: 11, padding: '6px 16px',
                                        border: `1px solid ${goalsMet === false ? '#ff4757' : '#1a1c24'}`,
                                        background: goalsMet === false ? 'rgba(255,71,87,0.1)' : 'transparent',
                                        color: goalsMet === false ? '#ff4757' : '#4b5563', cursor: 'pointer',
                                    }}>
                                    ✕ {lang === 'fr' ? 'Non' : 'No'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '14px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#090909', borderTop: divider }}>
                        <button type="button" onClick={onClose}
                            style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '8px 20px', border: '1px solid #1a1c24', background: 'transparent', color: '#4b5563', cursor: 'pointer' }}>
                            {lang === 'fr' ? 'Annuler' : 'Cancel'}
                        </button>
                        <button type="button" onClick={handleSave}
                            style={{ ...mono, fontSize: 11, fontWeight: 700, padding: '8px 24px', border: 'none', background: '#FDC800', color: '#000', cursor: 'pointer' }}>
                            {lang === 'fr' ? 'Sauvegarder' : 'Save Entry'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
