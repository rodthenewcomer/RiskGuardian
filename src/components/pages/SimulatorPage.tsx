'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { FlaskConical, Play, RotateCcw, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Save, FolderOpen, Trash2, X, Download, Zap } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTranslation } from '@/i18n/useTranslation';
import {
    runSimulation, autoOptimize, DEFAULT_CONFIG,
    type SimulationConfig, type SimulationResult, type SimMode, type SimTrade, type AutoOptimizeRule,
} from '@/ai/SimulationEngine';

const QF  = 'var(--font-mono)';
const BG  = '#090909';
const C1  = '#0d1117';
const C2  = '#0b0e14';
const BR  = '#1a1c24';
const YEL = '#FDC800';
const RED = '#ff4757';
const BLU = '#38bdf8';
const GRN = '#4ade80';

// ── Toggle component ─────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
    return (
        <button
            onClick={onChange}
            style={{
                width: 38, height: 22, background: on ? YEL : '#1a2030',
                border: `1px solid ${on ? YEL : BR}`,
                borderRadius: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                padding: '0 3px', transition: 'background 0.18s, border-color 0.18s',
                flexShrink: 0,
            }}
            aria-checked={on}
        >
            <div style={{
                width: 14, height: 14,
                background: on ? '#000' : '#4b5563',
                transform: on ? 'translateX(16px)' : 'translateX(0)',
                transition: 'transform 0.18s, background 0.18s',
            }} />
        </button>
    );
}

// ── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: () => void }) {
    return (
        <div
            onClick={onChange}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '12px 16px', cursor: 'pointer',
                background: on ? 'rgba(253,200,0,0.04)' : 'transparent',
                borderBottom: `1px solid ${BR}`,
                transition: 'background 0.15s',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: QF, fontSize: 11, color: on ? YEL : '#c9d1d9', fontWeight: on ? 700 : 400 }}>{label}</span>
                {sub && <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563' }}>{sub}</span>}
            </div>
            <Toggle on={on} onChange={onChange} />
        </div>
    );
}

// ── Mode pill ────────────────────────────────────────────────────────────────
const MODE_META: Record<SimMode, { label: string; labelFr: string; desc: string; descFr: string }> = {
    BEHAVIORAL:       { label: 'Behavioral',      labelFr: 'Comportemental',   desc: 'Remove detected patterns from your history', descFr: 'Supprimer les patterns comportementaux' },
    RULE_COMPLIANCE:  { label: 'Rule Compliance',  labelFr: 'Règles',           desc: 'Enforce your account rules retroactively',   descFr: 'Appliquer vos règles rétroactivement' },
    RISK_SIZING:      { label: 'Risk Sizing',      labelFr: 'Taille du risque', desc: 'Rescale all trades to a target risk %',      descFr: 'Recalibrer toutes vos prises de risque' },
    FILTER:           { label: 'Filter Setup',     labelFr: 'Filtrer',          desc: 'Only count trades matching criteria',         descFr: 'Comptabiliser les trades selon des filtres' },
};

// ── Delta indicator ──────────────────────────────────────────────────────────
function DeltaBadge({ delta, format = 'usd' }: { delta: number; format?: 'usd' | 'pct' | 'ratio' | 'count' }) {
    if (Math.abs(delta) < 0.01) return <span style={{ fontFamily: QF, fontSize: 10, color: '#4b5563' }}>—</span>;
    const positive = delta > 0;
    // For maxDrawdown, lower is better (delta > 0 means drawdown reduced = good)
    const color = positive ? GRN : RED;
    const Icon  = positive ? TrendingUp : TrendingDown;
    const fmt   = format === 'usd'   ? `${positive ? '+' : '-'}$${Math.abs(delta).toFixed(0)}`
                : format === 'pct'   ? `${positive ? '+' : ''}${delta.toFixed(1)}pp`
                : format === 'ratio' ? `${positive ? '+' : ''}${delta.toFixed(2)}`
                : `${positive ? '+' : ''}${Math.round(delta)}`;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Icon size={10} color={color} />
            <span style={{ fontFamily: QF, fontSize: 10, color, fontWeight: 700 }}>{fmt}</span>
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function SimulatorPage() {
    const { trades, account, language, savedScenarios, saveScenario, deleteScenario } = useAppStore();
    const isMobile = useIsMobile();
    const lang     = language ?? 'en';
    const { t }    = useTranslation();
    const ts       = t.simulator;

    const [config, setConfig]         = useState<SimulationConfig>(DEFAULT_CONFIG);
    const [result, setResult]         = useState<SimulationResult | null>(null);
    const [running, setRunning]       = useState(false);
    const [isDirty, setIsDirty]       = useState(true);
    const [configOpen, setConfigOpen] = useState(true);
    const [diffPage, setDiffPage]     = useState(0);
    const [saveName, setSaveName]     = useState('');
    const [showSaveInput, setShowSaveInput]     = useState(false);
    const [autoOptResults, setAutoOptResults]   = useState<AutoOptimizeRule[] | null>(null);
    const [showDailyBreakdown, setShowDailyBreakdown] = useState(false);
    const DIFF_PAGE_SIZE = 15; // trades per page in diff table

    // ── Derived from actual trades ─────────────────────────────────────────
    const avgWinDurMin = useMemo(() => {
        const wins = trades.filter(t => (t.pnl ?? 0) > 0 && (t.durationSeconds ?? 0) > 0);
        if (!wins.length) return 60;
        return Math.round(wins.reduce((s, t) => s + t.durationSeconds!, 0) / wins.length / 60);
    }, [trades]);

    // Unique assets from closed trades — for FILTER mode whitelist
    const uniqueAssets = useMemo(() =>
        [...new Set(trades.filter(t => t.outcome !== 'open').map(t => t.asset))].sort(),
    [trades]);

    // EST hours available in actual data — expand to full 6–22 range
    const EST_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6:00–22:00

    const closedCount = useMemo(() =>
        trades.filter(t => t.outcome === 'win' || t.outcome === 'loss').length,
    [trades]);

    const patch = useCallback(<K extends keyof SimulationConfig>(k: K, v: SimulationConfig[K]) => {
        setConfig(prev => ({ ...prev, [k]: v }));
        setIsDirty(true);
    }, []);

    function handleRun() {
        setRunning(true);
        // 60ms delay lets React flush the "RUNNING…" state before blocking computation
        setTimeout(() => {
            try {
                const r = runSimulation(trades, account, config);
                setResult(r);
                setIsDirty(false);
                setDiffPage(0);
                // Auto-optimize only meaningful in BEHAVIORAL mode
                if (config.mode === 'BEHAVIORAL') {
                    setAutoOptResults(autoOptimize(trades, account));
                } else {
                    setAutoOptResults(null);
                }
            } finally {
                setRunning(false);
            }
        }, 60);
    }

    function handleReset() {
        setConfig(DEFAULT_CONFIG);
        setResult(null);
        setAutoOptResults(null);
        setIsDirty(true);
        setShowDailyBreakdown(false);
    }

    function handleSave() {
        if (!result || !saveName.trim()) return;
        saveScenario({
            id: Date.now().toString(),
            name: saveName.trim(),
            savedAt: new Date().toISOString(),
            mode: config.mode,
            delta: result.delta,
            blockedCount: result.blockedCount,
            modifiedCount: result.modifiedCount,
            savedCapital: result.savedCapital,
            actualPnl: result.actual.pnl,
            simPnl: result.simulated.pnl,
            config: config as unknown as Record<string, unknown>,
        });
        setSaveName('');
        setShowSaveInput(false);
    }

    function handleLoadScenario(sc: { config: Record<string, unknown> }) {
        setConfig(sc.config as unknown as SimulationConfig);
        setIsDirty(true);
        setResult(null);
    }

    const modeMeta  = MODE_META[config.mode];
    const modeLabel = lang === 'fr' ? modeMeta.labelFr : modeMeta.label;
    const modeDesc  = lang === 'fr' ? modeMeta.descFr  : modeMeta.desc;

    // Diff table — blocked/capped trades sorted by absolute P&L descending (largest impact first)
    const diffTrades = useMemo(() =>
        result
            ? result.simTrades
                .filter(st => st.status !== 'included')
                .slice()
                .sort((a, b) => Math.abs(b.original.pnl ?? 0) - Math.abs(a.original.pnl ?? 0))
            : [],
    [result]);

    // CSV export of diff table
    function handleExportCSV() {
        if (!diffTrades.length) return;
        const headers = ['Status', 'Date', 'Asset', 'PnL', 'Adj PnL', 'Reason'];
        const rows = diffTrades.map(st => [
            st.status.toUpperCase(),
            (st.original.closedAt ?? st.original.createdAt).slice(0, 10),
            st.original.asset,
            (st.original.pnl ?? 0).toFixed(2),
            st.adjPnl.toFixed(2),
            `"${(st.reason ?? '').replace(/"/g, "'")}"`,
        ].join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `simulator-${config.mode.toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
    const diffPage_trades = diffTrades.slice(diffPage * DIFF_PAGE_SIZE, (diffPage + 1) * DIFF_PAGE_SIZE);
    const diffTotalPages  = Math.ceil(diffTrades.length / DIFF_PAGE_SIZE);

    // ── Config panel ──────────────────────────────────────────────────────────
    const configPanel = (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Mode grid */}
            <div style={{ padding: '16px 16px 0' }}>
                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 10 }}>
                    {lang === 'fr' ? 'MODE DE SIMULATION' : 'SIMULATION MODE'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: BR, marginBottom: 16 }}>
                    {(Object.keys(MODE_META) as SimMode[]).map(m => {
                        const active = config.mode === m;
                        return (
                            <button
                                key={m}
                                onClick={() => patch('mode', m)}
                                style={{
                                    background: active ? 'rgba(253,200,0,0.08)' : C2,
                                    border: 'none', borderBottom: `2px solid ${active ? YEL : 'transparent'}`,
                                    padding: '10px 8px', cursor: 'pointer',
                                    fontFamily: QF, fontSize: 9, fontWeight: active ? 900 : 400,
                                    color: active ? YEL : '#4b5563',
                                    letterSpacing: '0.06em', textAlign: 'left',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {lang === 'fr' ? MODE_META[m].labelFr : MODE_META[m].label}
                            </button>
                        );
                    })}
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: '#6b7280', lineHeight: 1.5, marginBottom: 14, padding: '8px 10px', background: C2, border: `1px solid ${BR}` }}>
                    {modeDesc}
                </div>
            </div>

            {/* Mode-specific controls */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {config.mode === 'BEHAVIORAL' && (
                    <div>
                        <ToggleRow
                            label={lang === 'fr' ? 'Supprimer Revenge Trades' : 'Remove Revenge Trades'}
                            sub={lang === 'fr' ? 'Bloquer les ré-entrées < 5min après une perte' : 'Block re-entries < 5min after a loss'}
                            on={config.removeRevengeTrades}
                            onChange={() => patch('removeRevengeTrades', !config.removeRevengeTrades)}
                        />
                        <ToggleRow
                            label={lang === 'fr' ? 'Plafonner les Losers Tenus' : 'Cap Held Losers'}
                            sub={lang === 'fr' ? `Clore à ${avgWinDurMin}min durée moy. gagnante` : `Cap at ${avgWinDurMin}min avg winning trade duration`}
                            on={config.capHeldLosers}
                            onChange={() => patch('capHeldLosers', !config.capHeldLosers)}
                        />
                        <ToggleRow
                            label={lang === 'fr' ? 'Session Bleed Lock' : 'Session Bleed Lock'}
                            sub={lang === 'fr' ? 'Stopper si session < 50% du pic' : 'Stop when session falls below 50% of peak'}
                            on={config.applySessionBleedLock}
                            onChange={() => patch('applySessionBleedLock', !config.applySessionBleedLock)}
                        />
                        <ToggleRow
                            label={lang === 'fr' ? 'Stopper Escalade de Pertes' : 'Stop After Loss Escalation'}
                            sub={lang === 'fr' ? 'Pause après 3 pertes croissantes' : 'Halt after 3 escalating consecutive losses'}
                            on={config.removeEscalation}
                            onChange={() => patch('removeEscalation', !config.removeEscalation)}
                        />
                    </div>
                )}

                {config.mode === 'RULE_COMPLIANCE' && (
                    <div>
                        <ToggleRow
                            label={lang === 'fr' ? 'Limite de Perte Journalière' : 'Daily Loss Limit'}
                            sub={account.dailyLossLimit > 0 ? `$${account.dailyLossLimit.toFixed(0)}` : (lang === 'fr' ? 'Non configuré dans Paramètres' : 'Not set in Settings')}
                            on={config.applyDailyLossLimit && account.dailyLossLimit > 0}
                            onChange={() => patch('applyDailyLossLimit', !config.applyDailyLossLimit)}
                        />
                        <ToggleRow
                            label={lang === 'fr' ? 'Max Pertes Consécutives' : 'Max Consecutive Losses'}
                            sub={(account.maxConsecutiveLosses ?? 0) > 0 ? `${account.maxConsecutiveLosses} ${lang === 'fr' ? 'pertes' : 'losses'}` : (lang === 'fr' ? 'Non configuré' : 'Not set in Settings')}
                            on={config.applyMaxConsecLosses && (account.maxConsecutiveLosses ?? 0) > 0}
                            onChange={() => patch('applyMaxConsecLosses', !config.applyMaxConsecLosses)}
                        />
                        <ToggleRow
                            label={lang === 'fr' ? 'Max Trades par Jour' : 'Max Trades Per Day'}
                            sub={(account.maxTradesPerDay ?? 0) > 0 ? `${account.maxTradesPerDay} ${lang === 'fr' ? 'trades/jour' : 'trades/day'}` : (lang === 'fr' ? 'Non configuré' : 'Not set in Settings')}
                            on={config.applyMaxTradesPerDay && (account.maxTradesPerDay ?? 0) > 0}
                            onChange={() => patch('applyMaxTradesPerDay', !config.applyMaxTradesPerDay)}
                        />
                        {account.dailyLossLimit === 0 && account.maxConsecutiveLosses == null && account.maxTradesPerDay == null && (
                            <div style={{ padding: '14px 16px', fontFamily: 'var(--font-sans)', fontSize: 10, color: '#EAB308', lineHeight: 1.55 }}>
                                {lang === 'fr'
                                    ? 'Aucune règle configurée. Allez dans Paramètres → Règles de Garde pour les définir.'
                                    : 'No rules configured. Go to Settings → Guard Rules to set them.'}
                            </div>
                        )}
                    </div>
                )}

                {config.mode === 'RISK_SIZING' && (
                    <div style={{ padding: '16px' }}>
                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 10 }}>
                            {lang === 'fr' ? 'RISQUE CIBLE PAR TRADE (% DU SOLDE INITIAL)' : 'TARGET RISK PER TRADE (% OF STARTING BALANCE)'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: BR, marginBottom: 16 }}>
                            {[0.25, 0.5, 1, 1.5, 2].map(pct => (
                                <button
                                    key={pct}
                                    onClick={() => patch('targetRiskPercent', pct)}
                                    style={{
                                        background: config.targetRiskPercent === pct ? 'rgba(253,200,0,0.1)' : C2,
                                        border: 'none', borderBottom: `2px solid ${config.targetRiskPercent === pct ? YEL : 'transparent'}`,
                                        padding: '10px 4px', cursor: 'pointer',
                                        fontFamily: QF, fontSize: 11, fontWeight: config.targetRiskPercent === pct ? 900 : 400,
                                        color: config.targetRiskPercent === pct ? YEL : '#4b5563',
                                    }}
                                >
                                    {pct}%
                                </button>
                            ))}
                        </div>
                        {(account.startingBalance ?? 0) > 0 && (
                            <div style={{ fontFamily: QF, fontSize: 10, color: '#6b7280', lineHeight: 1.6, background: C2, border: `1px solid ${BR}`, padding: '10px 12px' }}>
                                {lang === 'fr'
                                    ? `Solde initial : $${(account.startingBalance ?? 0).toLocaleString()}. Risque cible : $${((account.startingBalance ?? 0) * config.targetRiskPercent / 100).toFixed(0)} / trade.`
                                    : `Starting balance: $${(account.startingBalance ?? 0).toLocaleString()}. Target risk: $${((account.startingBalance ?? 0) * config.targetRiskPercent / 100).toFixed(0)} / trade.`}
                            </div>
                        )}
                    </div>
                )}

                {config.mode === 'FILTER' && (
                    <div style={{ padding: '16px' }}>
                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 8 }}>
                            {lang === 'fr' ? 'R:R MINIMUM À L\'ENTRÉE' : 'MINIMUM R:R AT ENTRY'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: BR, marginBottom: 20 }}>
                            {[0, 0.5, 1, 1.5, 2].map(rr => (
                                <button
                                    key={rr}
                                    onClick={() => patch('minRR', rr)}
                                    style={{
                                        background: config.minRR === rr ? 'rgba(253,200,0,0.1)' : C2,
                                        border: 'none', borderBottom: `2px solid ${config.minRR === rr ? YEL : 'transparent'}`,
                                        padding: '10px 4px', cursor: 'pointer',
                                        fontFamily: QF, fontSize: 11, fontWeight: config.minRR === rr ? 900 : 400,
                                        color: config.minRR === rr ? YEL : '#4b5563',
                                    }}
                                >
                                    {rr === 0 ? 'ALL' : `${rr}:1`}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 8 }}>
                            {lang === 'fr' ? 'FILTRE HORAIRE EST' : 'EST HOUR FILTER'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: BR }}>
                            {EST_HOURS.map(h => {
                                const on = config.allowedHoursEST.includes(h);
                                return (
                                    <button
                                        key={h}
                                        onClick={() => {
                                            const next = on
                                                ? config.allowedHoursEST.filter(x => x !== h)
                                                : [...config.allowedHoursEST, h].sort((a, b) => a - b);
                                            patch('allowedHoursEST', next);
                                        }}
                                        style={{
                                            background: on ? 'rgba(253,200,0,0.1)' : C2,
                                            border: 'none', padding: '7px 2px', cursor: 'pointer',
                                            fontFamily: QF, fontSize: 9, color: on ? YEL : '#4b5563',
                                            fontWeight: on ? 700 : 400,
                                        }}
                                    >
                                        {h}h
                                    </button>
                                );
                            })}
                        </div>
                        {/* Asset whitelist from actual trades */}
                        {uniqueAssets.length > 0 && (
                            <>
                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 8, marginTop: 20 }}>
                                    {lang === 'fr' ? 'FILTRE PAR ACTIF' : 'ASSET FILTER'}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {uniqueAssets.map(asset => {
                                        const on = config.allowedAssets.includes(asset);
                                        return (
                                            <button
                                                key={asset}
                                                onClick={() => {
                                                    const next = on
                                                        ? config.allowedAssets.filter(a => a !== asset)
                                                        : [...config.allowedAssets, asset];
                                                    patch('allowedAssets', next);
                                                }}
                                                style={{
                                                    background: on ? 'rgba(56,189,248,0.12)' : C2,
                                                    border: `1px solid ${on ? BLU : BR}`,
                                                    padding: '5px 10px', cursor: 'pointer',
                                                    fontFamily: QF, fontSize: 9,
                                                    color: on ? BLU : '#4b5563', fontWeight: on ? 700 : 400,
                                                }}
                                            >
                                                {asset}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Run button */}
            <div style={{ padding: 16, borderTop: `1px solid ${BR}` }}>
                <button
                    onClick={handleRun}
                    disabled={running || closedCount === 0}
                    style={{
                        width: '100%', padding: '14px 0', cursor: running ? 'wait' : 'pointer',
                        background: isDirty && !running ? YEL : running ? '#EAB308' : '#1a2030',
                        border: `1px solid ${isDirty && !running ? YEL : '#2a3040'}`,
                        fontFamily: QF, fontSize: 11, fontWeight: 900,
                        color: isDirty && !running ? '#000' : '#4b5563',
                        letterSpacing: '0.12em',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: isDirty && !running ? `0 0 20px rgba(253,200,0,0.25)` : 'none',
                    }}
                >
                    <Play size={13} strokeWidth={2.5} />
                    {running
                        ? (lang === 'fr' ? 'CALCUL EN COURS…' : 'RUNNING…')
                        : (lang === 'fr' ? 'LANCER LA SIMULATION' : 'RUN SIMULATION')}
                </button>
                {closedCount === 0 && (
                    <div style={{ marginTop: 8, fontFamily: QF, fontSize: 9, color: '#4b5563', textAlign: 'center' }}>
                        {lang === 'fr' ? 'Aucun trade fermé à simuler' : 'No closed trades to simulate'}
                    </div>
                )}
            </div>
        </div>
    );

    // ── Results panel ─────────────────────────────────────────────────────────
    const resultsPanel = (
        <div style={{ padding: isMobile ? '16px' : '24px', overflowY: 'auto', flex: 1 }}>
            {!result ? (
                // Empty state
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 16, minHeight: 320, textAlign: 'center',
                }}>
                    <div style={{ width: 56, height: 56, background: '#0d1117', border: `1px solid ${BR}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FlaskConical size={24} color="#1a2030" strokeWidth={1.5} />
                    </div>
                    <div>
                        <div style={{ fontFamily: QF, fontSize: 13, fontWeight: 700, color: '#2a3040', marginBottom: 6 }}>
                            {lang === 'fr' ? 'RÉSULTATS APPARAÎTRONT ICI' : 'RESULTS WILL APPEAR HERE'}
                        </div>
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: '#2a3040', maxWidth: 280 }}>
                            {lang === 'fr'
                                ? `Configurez un scénario et lancez la simulation contre vos ${closedCount} trades réels.`
                                : `Configure a scenario and run the simulation against your ${closedCount} real trades.`}
                        </div>
                    </div>
                </div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
                >
                    {/* HERO — delta card */}
                    <div style={{
                        background: C1, border: `1px solid ${result.delta >= 0 ? 'rgba(253,200,0,0.25)' : 'rgba(255,71,87,0.2)'}`,
                        borderLeft: `3px solid ${result.delta >= 0 ? YEL : RED}`,
                        padding: '20px 22px',
                    }}>
                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.12em', marginBottom: 14 }}>
                            {lang === 'fr'
                                ? `SCÉNARIO : ${modeLabel.toUpperCase()} — RÉSULTAT`
                                : `SCENARIO: ${modeLabel.toUpperCase()} — OUTCOME`}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 40px 1fr', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <div>
                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', marginBottom: 4 }}>
                                    {lang === 'fr' ? 'P&L SIMULÉ' : 'SIMULATED P&L'}
                                </div>
                                <div style={{ fontFamily: QF, fontSize: 32, fontWeight: 900, color: result.simulated.pnl >= 0 ? YEL : RED }}>
                                    {result.simulated.pnl >= 0 ? '+' : ''}${Math.abs(result.simulated.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                            {!isMobile && (
                                <div style={{ fontFamily: QF, fontSize: 18, color: '#2a3040', textAlign: 'center' }}>→</div>
                            )}
                            <div>
                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', marginBottom: 4 }}>
                                    {lang === 'fr' ? 'P&L RÉEL' : 'ACTUAL P&L'}
                                </div>
                                <div style={{ fontFamily: QF, fontSize: 32, fontWeight: 900, color: result.actual.pnl >= 0 ? '#c9d1d9' : RED }}>
                                    {result.actual.pnl >= 0 ? '+' : ''}${Math.abs(result.actual.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                            <div style={{
                                background: result.delta >= 0 ? 'rgba(253,200,0,0.08)' : 'rgba(255,71,87,0.08)',
                                border: `1px solid ${result.delta >= 0 ? 'rgba(253,200,0,0.2)' : 'rgba(255,71,87,0.2)'}`,
                                padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2,
                            }}>
                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>
                                    {lang === 'fr' ? 'DELTA P&L' : 'P&L DELTA'}
                                </div>
                                <div style={{ fontFamily: QF, fontSize: 16, fontWeight: 900, color: result.delta >= 0 ? YEL : RED }}>
                                    {result.delta >= 0 ? '+' : ''}${result.delta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                            {[
                                { label: lang === 'fr' ? 'BLOQUÉS' : 'BLOCKED', value: result.blockedCount, color: RED },
                                { label: lang === 'fr' ? 'MODIFIÉS' : 'MODIFIED', value: result.modifiedCount, color: '#EAB308' },
                                { label: lang === 'fr' ? 'CAP PRÉSERVÉ' : 'SAVED CAPITAL', value: `$${result.savedCapital.toFixed(0)}`, color: GRN },
                            ].map((k, i) => (
                                <div key={i} style={{ background: '#0b0e14', border: `1px solid ${BR}`, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{k.label}</div>
                                    <div style={{ fontFamily: QF, fontSize: 16, fontWeight: 900, color: k.color }}>{k.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* DUAL EQUITY CURVE */}
                    {result.equityCurve.length > 1 && (
                        <div style={{ background: C1, border: `1px solid ${BR}`, padding: '16px 0 8px' }}>
                            <div style={{ padding: '0 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em' }}>
                                    {lang === 'fr' ? 'COURBE DE CAPITAL — RÉEL vs SIMULÉ' : 'EQUITY CURVE — ACTUAL vs SIMULATED'}
                                </div>
                                <div style={{ display: 'flex', gap: 14 }}>
                                    {[
                                        { color: YEL, label: lang === 'fr' ? 'Simulé' : 'Simulated' },
                                        { color: RED,  label: lang === 'fr' ? 'Réel'   : 'Actual' },
                                    ].map(leg => (
                                        <div key={leg.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 16, height: 2, background: leg.color }} />
                                            <span style={{ fontFamily: QF, fontSize: 9, color: '#6b7280' }}>{leg.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <ResponsiveContainer width="100%" height={200}>
                                <AreaChart data={result.equityCurve} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor={YEL} stopOpacity={0.18} />
                                            <stop offset="95%" stopColor={YEL} stopOpacity={0.01} />
                                        </linearGradient>
                                        <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor={RED} stopOpacity={0.14} />
                                            <stop offset="95%" stopColor={RED} stopOpacity={0.01} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1c24" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: '#4b5563' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                    <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: '#4b5563' }} tickLine={false} axisLine={false} tickFormatter={v => `$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} width={50} />
                                    <ReferenceLine y={0} stroke="#1a2030" strokeDasharray="4 2" />
                                    <Tooltip
                                        contentStyle={{ background: '#0d1117', border: `1px solid ${BR}`, borderRadius: 0, fontFamily: 'var(--font-mono)', fontSize: 10 }}
                                        formatter={(v: unknown, name: string | undefined) => {
                                            const val = Number(v);
                                            return [`${val >= 0 ? '+' : '-'}$${Math.abs(val).toFixed(2)}`, name === 'simulated' ? (lang === 'fr' ? 'Simulé' : 'Simulated') : (lang === 'fr' ? 'Réel' : 'Actual')];
                                        }}
                                    />
                                    <Area type="monotone" dataKey="simulated" stroke={YEL} strokeWidth={2} fill="url(#simGrad)" dot={false} />
                                    <Area type="monotone" dataKey="actual"    stroke={RED}  strokeWidth={1.5} fill="url(#actGrad)"  dot={false} strokeDasharray="4 2" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* KPI DELTA GRID */}
                    <div>
                        <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 8 }}>
                            {lang === 'fr' ? 'MÉTRIQUES — RÉEL vs SIMULÉ' : 'METRICS — ACTUAL vs SIMULATED'}
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: QF }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${BR}` }}>
                                        {[
                                            lang === 'fr' ? 'MÉTRIQUE' : 'METRIC',
                                            lang === 'fr' ? 'RÉEL' : 'ACTUAL',
                                            lang === 'fr' ? 'SIMULÉ' : 'SIMULATED',
                                            'DELTA',
                                        ].map((h, i) => (
                                            <th key={i} style={{ padding: '8px 14px', fontSize: 9, color: '#4b5563', textAlign: i === 0 ? 'left' : 'right', letterSpacing: '0.1em', fontWeight: 700 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        {
                                            label:  lang === 'fr' ? 'Net P&L' : 'Net P&L',
                                            actual: `${result.actual.pnl >= 0 ? '+' : ''}$${result.actual.pnl.toFixed(0)}`,
                                            sim:    `${result.simulated.pnl >= 0 ? '+' : ''}$${result.simulated.pnl.toFixed(0)}`,
                                            delta:  result.simulated.pnl - result.actual.pnl,
                                            fmt:    'usd' as const,
                                            aColor: result.actual.pnl >= 0 ? YEL : RED,
                                            sColor: result.simulated.pnl >= 0 ? YEL : RED,
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Taux de réussite' : 'Win Rate',
                                            actual: `${result.actual.winRate.toFixed(1)}%`,
                                            sim:    `${result.simulated.winRate.toFixed(1)}%`,
                                            delta:  result.simulated.winRate - result.actual.winRate,
                                            fmt:    'pct' as const,
                                            aColor: '#c9d1d9', sColor: '#c9d1d9',
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Facteur de profit' : 'Profit Factor',
                                            actual: result.actual.profitFactor.toFixed(2),
                                            sim:    result.simulated.profitFactor.toFixed(2),
                                            delta:  result.simulated.profitFactor - result.actual.profitFactor,
                                            fmt:    'ratio' as const,
                                            aColor: '#c9d1d9', sColor: '#c9d1d9',
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Max Drawdown' : 'Max Drawdown',
                                            actual: `$${Math.abs(result.actual.maxDrawdown).toFixed(0)}`,
                                            sim:    `$${Math.abs(result.simulated.maxDrawdown).toFixed(0)}`,
                                            delta:  result.actual.maxDrawdown - result.simulated.maxDrawdown,  // positive = sim reduced DD
                                            fmt:    'usd' as const,
                                            aColor: RED, sColor: result.simulated.maxDrawdown < result.actual.maxDrawdown ? GRN : RED,
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Trades pris' : 'Trades Taken',
                                            actual: String(result.actual.tradeCount),
                                            sim:    String(result.simulated.tradeCount),
                                            delta:  result.simulated.tradeCount - result.actual.tradeCount,
                                            fmt:    'count' as const,
                                            aColor: '#c9d1d9', sColor: '#c9d1d9',
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Gain moy.' : 'Avg Win',
                                            actual: `$${result.actual.avgWin.toFixed(0)}`,
                                            sim:    `$${result.simulated.avgWin.toFixed(0)}`,
                                            delta:  result.simulated.avgWin - result.actual.avgWin,
                                            fmt:    'usd' as const,
                                            aColor: YEL, sColor: YEL,
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Espérance / trade' : 'Expectancy / trade',
                                            actual: `${result.actual.expectancy >= 0 ? '+' : ''}$${result.actual.expectancy.toFixed(2)}`,
                                            sim:    `${result.simulated.expectancy >= 0 ? '+' : ''}$${result.simulated.expectancy.toFixed(2)}`,
                                            delta:  result.simulated.expectancy - result.actual.expectancy,
                                            fmt:    'usd' as const,
                                            aColor: result.actual.expectancy >= 0 ? GRN : RED,
                                            sColor: result.simulated.expectancy >= 0 ? GRN : RED,
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Série gagnante max' : 'Max Win Streak',
                                            actual: String(result.actual.maxWinStreak),
                                            sim:    String(result.simulated.maxWinStreak),
                                            delta:  result.simulated.maxWinStreak - result.actual.maxWinStreak,
                                            fmt:    'count' as const,
                                            aColor: YEL, sColor: YEL,
                                        },
                                        {
                                            label:  lang === 'fr' ? 'Série perdante max' : 'Max Lose Streak',
                                            actual: String(result.actual.maxLoseStreak),
                                            sim:    String(result.simulated.maxLoseStreak),
                                            // lower is better — invert sign for DeltaBadge
                                            delta:  result.actual.maxLoseStreak - result.simulated.maxLoseStreak,
                                            fmt:    'count' as const,
                                            aColor: RED, sColor: result.simulated.maxLoseStreak < result.actual.maxLoseStreak ? GRN : RED,
                                        },
                                    ].map((row, i) => (
                                        <tr key={i} style={{ borderBottom: `1px solid ${BR}`, background: i % 2 === 0 ? '#0c0e13' : 'transparent' }}>
                                            <td style={{ padding: '10px 14px', fontSize: 10, color: '#8b949e' }}>{row.label}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: row.aColor, textAlign: 'right' }}>{row.actual}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 900, color: row.sColor, textAlign: 'right' }}>{row.sim}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}><DeltaBadge delta={row.delta} format={row.fmt} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* AUTO-OPTIMIZE RANKING */}
                    {autoOptResults && autoOptResults.length > 0 && (
                        <div style={{ background: C1, border: `1px solid ${BR}`, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <Zap size={13} color={YEL} />
                                <span style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em' }}>
                                    {lang === 'fr' ? 'OPTIMISEUR — QUELLE RÈGLE AIDE LE PLUS ?' : 'AUTO-OPTIMIZE — WHICH SINGLE RULE HELPS MOST?'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {autoOptResults.map((opt, i) => {
                                    const pct = autoOptResults[0].delta !== 0
                                        ? (opt.delta / Math.abs(autoOptResults[0].delta)) * 100
                                        : 0;
                                    const positive = opt.delta > 0;
                                    return (
                                        <div key={opt.rule} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563', width: 14, textAlign: 'right' }}>#{i+1}</span>
                                            <span style={{ fontFamily: QF, fontSize: 10, color: '#c9d1d9', flex: 1 }}>
                                                {lang === 'fr' ? opt.labelFr : opt.label}
                                            </span>
                                            <div style={{ width: 80, height: 4, background: '#1a1c24', position: 'relative', overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.max(0, pct)}%`, background: positive ? GRN : RED, transition: 'width 0.4s' }} />
                                            </div>
                                            <span style={{ fontFamily: QF, fontSize: 10, fontWeight: 700, color: positive ? GRN : RED, minWidth: 60, textAlign: 'right' }}>
                                                {positive ? '+' : ''}${opt.delta.toFixed(0)}
                                            </span>
                                            <span style={{ fontFamily: QF, fontSize: 8, color: '#4b5563', minWidth: 50, textAlign: 'right' }}>
                                                {opt.blockedCount} {lang === 'fr' ? 'bloqués' : 'blocked'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* DAILY BREAKDOWN */}
                    {result.dailyBreakdown.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowDailyBreakdown(o => !o)}
                                style={{
                                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: C1, border: `1px solid ${BR}`, padding: '10px 16px',
                                    cursor: 'pointer', fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em',
                                }}
                            >
                                <span>{lang === 'fr' ? `DÉTAIL PAR JOUR — ${result.dailyBreakdown.length} JOURS` : `DAY-BY-DAY BREAKDOWN — ${result.dailyBreakdown.length} DAYS`}</span>
                                {showDailyBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                            <AnimatePresence>
                                {showDailyBreakdown && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: QF }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `1px solid ${BR}`, background: '#0c0e13' }}>
                                                        {[
                                                            lang === 'fr' ? 'JOUR' : 'DAY',
                                                            lang === 'fr' ? 'RÉEL' : 'ACTUAL',
                                                            lang === 'fr' ? 'SIMULÉ' : 'SIMULATED',
                                                            'DELTA',
                                                            lang === 'fr' ? 'TRADES' : 'TRADES',
                                                            lang === 'fr' ? 'BLOQUÉS' : 'BLOCKED',
                                                        ].map((h, i) => (
                                                            <th key={i} style={{ padding: '7px 10px', fontSize: 8, color: '#4b5563', textAlign: i === 0 ? 'left' : 'right', letterSpacing: '0.08em', fontWeight: 700 }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {result.dailyBreakdown.map((d, i) => (
                                                        <tr key={d.day} style={{ borderBottom: `1px solid ${BR}`, background: i % 2 === 0 ? '#0c0e13' : 'transparent' }}>
                                                            <td style={{ padding: '7px 10px', fontSize: 10, color: '#8b949e' }}>{d.day}</td>
                                                            <td style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, color: d.actualPnl >= 0 ? YEL : RED, textAlign: 'right' }}>
                                                                {d.actualPnl >= 0 ? '+' : ''}${Math.abs(d.actualPnl).toFixed(0)}
                                                            </td>
                                                            <td style={{ padding: '7px 10px', fontSize: 10, fontWeight: 700, color: d.simPnl >= 0 ? GRN : RED, textAlign: 'right' }}>
                                                                {d.simPnl >= 0 ? '+' : ''}${Math.abs(d.simPnl).toFixed(0)}
                                                            </td>
                                                            <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                                                                <DeltaBadge delta={d.delta} format="usd" />
                                                            </td>
                                                            <td style={{ padding: '7px 10px', fontSize: 9, color: '#6b7280', textAlign: 'right' }}>{d.tradeCount}</td>
                                                            <td style={{ padding: '7px 10px', fontSize: 9, color: d.blockedCount > 0 ? RED : '#4b5563', textAlign: 'right' }}>{d.blockedCount}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* TRADE DIFF TABLE */}
                    {diffTrades.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em' }}>
                                    {lang === 'fr' ? `JOURNAL DES MODIFICATIONS — ${diffTrades.length} TRADES` : `SIMULATION LOG — ${diffTrades.length} TRADES AFFECTED`}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={handleExportCSV}
                                        title={lang === 'fr' ? 'Exporter en CSV' : 'Export CSV'}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${BR}`, padding: '5px 10px', cursor: 'pointer', fontFamily: QF, fontSize: 9, color: '#6b7280' }}
                                    >
                                        <Download size={10} />
                                        CSV
                                    </button>
                                    {result && (
                                        <button
                                            onClick={handleReset}
                                            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${BR}`, padding: '5px 10px', cursor: 'pointer', fontFamily: QF, fontSize: 9, color: '#6b7280' }}
                                        >
                                            <RotateCcw size={10} />
                                            {lang === 'fr' ? 'RESET' : 'RESET'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: QF }}>
                                    <thead>
                                        <tr style={{ borderBottom: `1px solid ${BR}` }}>
                                            {[
                                                lang === 'fr' ? 'STATUT' : 'STATUS',
                                                lang === 'fr' ? 'DATE' : 'DATE',
                                                'ASSET',
                                                'P&L',
                                                lang === 'fr' ? 'RAISON' : 'REASON',
                                            ].map((h, i) => (
                                                <th key={i} style={{ padding: '7px 12px', fontSize: 9, color: '#4b5563', textAlign: i >= 3 ? 'right' : 'left', letterSpacing: '0.08em', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {diffPage_trades.map((st, i) => {
                                            const isBlocked  = st.status === 'blocked';
                                            const isCapped   = st.status === 'capped';
                                            const pnl        = st.original.pnl ?? 0;
                                            const dateStr    = new Date(st.original.closedAt ?? st.original.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' });
                                            return (
                                                <tr
                                                    key={i}
                                                    style={{
                                                        borderBottom: `1px solid ${BR}`,
                                                        borderLeft: `2px solid ${isBlocked ? RED : '#EAB308'}`,
                                                        background: i % 2 === 0 ? '#0c0e13' : 'transparent',
                                                    }}
                                                >
                                                    <td style={{ padding: '9px 12px' }}>
                                                        <span style={{
                                                            fontFamily: QF, fontSize: 8, fontWeight: 900,
                                                            color: isBlocked ? RED : '#EAB308',
                                                            border: `1px solid ${isBlocked ? RED + '50' : '#EAB30850'}`,
                                                            padding: '2px 6px', letterSpacing: '0.08em',
                                                        }}>
                                                            {isBlocked ? (lang === 'fr' ? 'BLOQUÉ' : 'BLOCKED') : (lang === 'fr' ? 'MODIFIÉ' : 'CAPPED')}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '9px 12px', fontSize: 10, color: '#6b7280' }}>{dateStr}</td>
                                                    <td style={{ padding: '9px 12px', fontSize: 10, color: BLU }}>{st.original.asset}</td>
                                                    <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: pnl >= 0 ? YEL : RED, textAlign: 'right' }}>
                                                        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)}
                                                        {isCapped && (
                                                            <span style={{ fontSize: 9, color: '#EAB308', marginLeft: 4 }}>→${Math.abs(st.adjPnl).toFixed(0)}</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', fontSize: 9, color: '#4b5563', textAlign: 'right', maxWidth: isMobile ? 120 : 280 }}>
                                                        <span title={st.reason}>{(st.reason ?? '').length > (isMobile ? 28 : 52) ? (st.reason ?? '').slice(0, isMobile ? 28 : 52) + '…' : st.reason}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {diffTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
                                    <button onClick={() => setDiffPage(p => Math.max(0, p - 1))} disabled={diffPage === 0} style={{ padding: '5px 12px', background: '#0d1117', border: `1px solid ${BR}`, cursor: 'pointer', color: '#c9d1d9', fontFamily: QF, fontSize: 10 }}>←</button>
                                    <span style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', alignSelf: 'center' }}>{diffPage + 1} / {diffTotalPages}</span>
                                    <button onClick={() => setDiffPage(p => Math.min(diffTotalPages - 1, p + 1))} disabled={diffPage >= diffTotalPages - 1} style={{ padding: '5px 12px', background: '#0d1117', border: `1px solid ${BR}`, cursor: 'pointer', color: '#c9d1d9', fontFamily: QF, fontSize: 10 }}>→</button>
                                </div>
                            )}
                        </div>
                    )}

                    {diffTrades.length === 0 && (
                        <div style={{ background: 'rgba(74,222,128,0.05)', border: `1px solid rgba(74,222,128,0.2)`, padding: '14px 18px', fontFamily: QF, fontSize: 10, color: GRN, lineHeight: 1.6 }}>
                            {lang === 'fr'
                                ? 'Aucun trade n\'aurait été bloqué ou modifié dans ce scénario. Votre trading respecte déjà ces règles.'
                                : 'No trades would have been blocked or modified in this scenario. Your trading already follows these rules.'}
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );

    // ── Layout ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: BG }}>
            {/* Page header */}
            <div style={{
                padding: isMobile ? '20px 16px 16px' : '24px 28px 20px',
                borderBottom: `1px solid ${BR}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                background: C1,
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <FlaskConical size={16} color={YEL} strokeWidth={1.8} />
                        <span style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.15em' }}>
                            {ts.engine}
                        </span>
                    </div>
                    <div style={{ fontFamily: QF, fontSize: isMobile ? 18 : 22, fontWeight: 900, color: '#fff', marginBottom: 3 }}>
                        {ts.title}
                    </div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: '#4b5563' }}>
                        {ts.subtitle.replace('your', `your ${closedCount}`).replace('tes', `tes ${closedCount}`)}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {result && !isDirty && (
                        <button
                            onClick={() => setShowSaveInput(s => !s)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '9px 14px', background: showSaveInput ? 'rgba(253,200,0,0.1)' : 'transparent',
                                border: `1px solid ${showSaveInput ? YEL : BR}`, cursor: 'pointer',
                                fontFamily: QF, fontSize: 9, fontWeight: 700, color: showSaveInput ? YEL : '#8b949e',
                            }}
                        >
                            <Save size={11} />
                            {ts.saveScenario}
                        </button>
                    )}
                    {isDirty && !running && closedCount > 0 && (
                        <button
                            onClick={handleRun}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '10px 18px', background: YEL,
                                border: 'none', cursor: 'pointer',
                                fontFamily: QF, fontSize: 10, fontWeight: 900, color: '#000',
                                boxShadow: '0 0 16px rgba(253,200,0,0.3)',
                            }}
                        >
                            <Play size={12} strokeWidth={2.5} />
                            {ts.run}
                        </button>
                    )}
                </div>
            </div>

            {/* Save name input */}
            <AnimatePresence>
                {showSaveInput && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        style={{ overflow: 'hidden', background: 'rgba(253,200,0,0.05)', borderBottom: `1px solid rgba(253,200,0,0.2)` }}
                    >
                        <div style={{ padding: '12px 20px', display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                value={saveName}
                                onChange={e => setSaveName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
                                placeholder={ts.saveNamePlaceholder}
                                maxLength={32}
                                autoFocus
                                style={{
                                    flex: 1, background: C2, border: `1px solid ${BR}`,
                                    padding: '8px 12px', fontFamily: QF, fontSize: 11, color: '#fff',
                                    outline: 'none', maxWidth: 260,
                                }}
                            />
                            <button
                                onClick={handleSave}
                                disabled={!saveName.trim()}
                                style={{
                                    padding: '8px 14px', background: saveName.trim() ? YEL : '#1a2030',
                                    border: 'none', cursor: saveName.trim() ? 'pointer' : 'not-allowed',
                                    fontFamily: QF, fontSize: 9, fontWeight: 900,
                                    color: saveName.trim() ? '#000' : '#4b5563',
                                }}
                            >
                                {ts.saveConfirm}
                            </button>
                            <button
                                onClick={() => { setShowSaveInput(false); setSaveName(''); }}
                                style={{ padding: '8px', background: 'none', border: `1px solid ${BR}`, cursor: 'pointer', color: '#4b5563' }}
                            >
                                <X size={12} />
                            </button>
                            <span style={{ fontFamily: QF, fontSize: 9, color: '#4b5563', marginLeft: 4 }}>
                                {savedScenarios.length}/3 {savedScenarios.length === 1 ? ts.slotsUsed : ts.slotsUsedPlural}
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Saved scenarios panel */}
            {savedScenarios.length > 0 && (
                <div style={{ background: C2, borderBottom: `1px solid ${BR}`, padding: '12px 20px' }}>
                    <div style={{ fontFamily: QF, fontSize: 9, color: '#6b7280', letterSpacing: '0.1em', marginBottom: 8 }}>
                        {ts.savedScenarios}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {savedScenarios.map(sc => (
                            <div
                                key={sc.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: C1, border: `1px solid ${BR}`,
                                    padding: '7px 10px',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{ fontFamily: QF, fontSize: 10, color: '#fff', fontWeight: 700 }}>{sc.name}</span>
                                    <span style={{ fontFamily: QF, fontSize: 8, color: '#4b5563' }}>
                                        {sc.mode} · {sc.delta >= 0 ? '+' : ''}${sc.delta.toFixed(0)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleLoadScenario(sc)}
                                    title={ts.load}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: BLU, padding: 4 }}
                                >
                                    <FolderOpen size={12} />
                                </button>
                                <button
                                    onClick={() => deleteScenario(sc.id)}
                                    title={ts.delete}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: RED, padding: 4 }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main content */}
            {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    {/* Collapsible config on mobile */}
                    <div style={{ background: C1, borderBottom: `1px solid ${BR}` }}>
                        <button
                            onClick={() => setConfigOpen(o => !o)}
                            style={{
                                width: '100%', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontFamily: QF, fontSize: 10, color: YEL, fontWeight: 700,
                            }}
                        >
                            <span>{`${ts.configPanel} — ${modeLabel}`}</span>
                            {configOpen ? <ChevronUp size={14} color={YEL} /> : <ChevronDown size={14} color={YEL} />}
                        </button>
                        <AnimatePresence>
                            {configOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.22 }}
                                    style={{ overflow: 'hidden' }}
                                >
                                    {configPanel}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    {resultsPanel}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, minHeight: 0 }}>
                    <div style={{ background: C1, borderRight: `1px solid ${BR}`, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                        {configPanel}
                    </div>
                    <div style={{ overflowY: 'auto' }}>
                        {resultsPanel}
                    </div>
                </div>
            )}
        </div>
    );
}
