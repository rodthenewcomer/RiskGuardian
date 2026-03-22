'use client';

/**
 * BridgePage — Live DXTrade Monitor + Pre-Trade AI Analyzer
 * ─────────────────────────────────────────────────────────────────
 * Two real functions:
 *   1. Live Position Monitor — polls DXTrade open positions every 3s
 *   2. Pre-Trade AI Check    — instant risk analysis before entry
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, Wifi, WifiOff, RefreshCw, TrendingUp, TrendingDown,
    Zap, ShieldCheck, ShieldAlert, AlertTriangle, Clock,
    ArrowUpRight, ArrowDownRight, Settings2, CheckCircle, XCircle,
} from 'lucide-react';
import styles from './BridgePage.module.css';
import { useAppStore } from '@/store/appStore';
import { useTranslation } from '@/i18n/useTranslation';
import { dxGetPositions, dxGetMetrics, type DXMetrics } from '@/lib/dxtradeSync';
import type { TradeSession } from '@/store/appStore';

const POLL_MS = 8000;          // 8s — respectful of DXTrade rate limits
const RATE_LIMIT_PAUSE = 300_000; // 5 min pause when 429 received

// ── Pre-trade risk calculation ─────────────────────────────────────
function calcPreTrade(entry: number, stop: number, tp: number, lots: number, balance: number, dailyLimit: number, dailyUsed: number) {
    if (!entry || !stop || !lots || !balance) return null;
    const stopDist = Math.abs(entry - stop);
    const riskUSD = stopDist * lots;
    const riskPct = (riskUSD / balance) * 100;
    const tpDist = tp > 0 ? Math.abs(tp - entry) : 0;
    const rr = tpDist > 0 && stopDist > 0 ? tpDist / stopDist : 0;
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
    const wouldExceedDaily = riskUSD > dailyRemaining;
    const isOver3Pct = riskPct > 3;
    const isRRWeak = rr > 0 && rr < 1.5;
    const warnings: string[] = [];
    if (wouldExceedDaily) warnings.push(`$${riskUSD.toFixed(0)} would exceed your daily remaining ($${dailyRemaining.toFixed(0)})`);
    if (isOver3Pct) warnings.push(`${riskPct.toFixed(1)}% risk exceeds 3% per-trade max`);
    if (isRRWeak) warnings.push(`${rr.toFixed(1)}R is below minimum 1.5R`);
    const verdict: 'GO' | 'CAUTION' | 'STOP' =
        warnings.length === 0 ? 'GO' :
            warnings.length === 1 ? 'CAUTION' : 'STOP';
    return { riskUSD, riskPct, rr, dailyRemaining, warnings, verdict };
}

// ── Time elapsed ───────────────────────────────────────────────────
function elapsed(isoTime: string): string {
    const diff = Math.floor((Date.now() - new Date(isoTime).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export default function BridgePage() {
    const { dxtradeConfig, account, trades, setDXTradeConfig } = useAppStore();
    const { t } = useTranslation();
    const { language } = useAppStore();
    const lang = language ?? 'en';

    // ── Live monitor state ─────────────────────────────────────────
    const [positions, setPositions] = useState<TradeSession[]>([]);
    const [metrics, setMetrics] = useState<DXMetrics | null>(null);
    const [polling, setPolling] = useState(false);
    const [lastPoll, setLastPoll] = useState<Date | null>(null);
    const [pollError, setPollError] = useState('');
    const [rateLimited, setRateLimited] = useState(false);
    const [rateLimitUntil, setRateLimitUntil] = useState<Date | null>(null);
    const [activeTab, setActiveTab] = useState<'monitor' | 'pretrade'>('monitor');
    const [tokenExpiredBanner, setTokenExpiredBanner] = useState<'reconnecting' | 'failed' | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Pre-trade state ────────────────────────────────────────────
    const [ptSymbol, setPtSymbol] = useState('');
    const [ptDir, setPtDir] = useState<'LONG' | 'SHORT'>('LONG');
    const [ptEntry, setPtEntry] = useState('');
    const [ptStop, setPtStop] = useState('');
    const [ptTP, setPtTP] = useState('');
    const [ptLots, setPtLots] = useState('');

    // ── Poll DXTrade ───────────────────────────────────────────────
    const poll = useCallback(async () => {
        if (!dxtradeConfig) return;
        // Don't poll while rate-limited
        if (rateLimitUntil && new Date() < rateLimitUntil) return;
        try {
            const config = {
                server: dxtradeConfig.server,
                token: dxtradeConfig.token,
                accountCode: dxtradeConfig.accountCode,
                username: dxtradeConfig.username,
            };
            const [pos, m] = await Promise.all([dxGetPositions(config), dxGetMetrics(config)]);
            setPositions(pos);
            setMetrics(m);
            setLastPoll(new Date());
            setPollError('');
            setRateLimited(false);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Poll failed';
            // Offline / network unreachable — show friendly error, keep polling silently
            if (!navigator.onLine || msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
                setPollError(lang === 'fr' ? 'Hors ligne — reconnexion automatique...' : 'Offline — auto-resuming when connection returns...');
                return;
            }
            // 429 — stop polling for 5 minutes to let the ban expire
            if (msg.includes('RATE LIMITED') || msg.includes('429')) {
                const until = new Date(Date.now() + RATE_LIMIT_PAUSE);
                setRateLimited(true);
                setRateLimitUntil(until);
                setPollError(`Rate limited. Auto-resume at ${until.toLocaleTimeString()}`);
            } else if (msg.includes('401') || msg.includes('Unauthorized') || msg.toLowerCase().includes('token')) {
                if (dxtradeConfig.password) {
                    setTokenExpiredBanner('reconnecting');
                    setPollError('Session expired — reconnecting…');
                    import('@/lib/dxtradeSync').then(({ dxConnect }) => {
                        dxConnect(dxtradeConfig.server, dxtradeConfig.username, dxtradeConfig.domain, dxtradeConfig.password!)
                            .then(res => {
                                setDXTradeConfig({ ...dxtradeConfig, token: res.token, connectedAt: new Date().toISOString() });
                                setPollError('');
                                setTokenExpiredBanner(null);
                            })
                            .catch(() => {
                                setTokenExpiredBanner('failed');
                                setPollError('Auto-reconnect failed. Please reconnect in Settings.');
                            });
                    });
                    return;
                }
                setTokenExpiredBanner('failed');
                setPollError('Session expired. Please reconnect in Settings.');
                return;
            } else {
                setPollError(msg);
            }
        }
    }, [dxtradeConfig, rateLimitUntil]);

    useEffect(() => {
        if (!dxtradeConfig) { setPolling(false); return; }
        setPolling(true);
        poll();
        pollRef.current = setInterval(poll, POLL_MS);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            setPolling(false);
        };
    }, [dxtradeConfig, poll]);

    // ── Pre-trade calc ─────────────────────────────────────────────
    const todayUsed = trades
        .filter(t => t.outcome === 'loss' && t.closedAt && t.closedAt.startsWith(new Date().toISOString().slice(0, 10)))
        .reduce((s, t) => s + Math.abs(t.pnl ?? 0), 0);

    const ptResult = calcPreTrade(
        parseFloat(ptEntry), parseFloat(ptStop), parseFloat(ptTP),
        parseFloat(ptLots),
        metrics?.balance ?? account.balance,
        account.dailyLossLimit,
        todayUsed,
    );

    const isConnected = !!dxtradeConfig;
    const balanceDisplay = metrics?.balance ?? account.balance;

    return (
        <div className={styles.page}>

            {/* ── Token expired banner ─────────────────────────────── */}
            {tokenExpiredBanner === 'reconnecting' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'rgba(234,179,8,0.08)', borderBottom: '1px solid rgba(234,179,8,0.3)' }}>
                    <AlertTriangle size={13} color="#EAB308" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#EAB308', fontWeight: 700, letterSpacing: '0.06em' }}>{lang === 'fr' ? 'Session expirée — reconnexion…' : 'Session expired — reconnecting…'}</span>
                </div>
            )}
            {tokenExpiredBanner === 'failed' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 20px', background: 'rgba(255,71,87,0.06)', borderBottom: '1px solid rgba(255,71,87,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={13} color="#ff4757" />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757', fontWeight: 700, letterSpacing: '0.06em' }}>{lang === 'fr' ? 'Session expirée. Veuillez vous reconnecter.' : 'Session expired. Please reconnect.'}</span>
                    </div>
                    <button
                        onClick={() => { setTokenExpiredBanner(null); setDXTradeConfig(null); useAppStore.getState().setActiveTab('settings'); }}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, padding: '5px 12px', background: 'rgba(255,71,87,0.1)', color: '#ff4757', border: '1px solid rgba(255,71,87,0.3)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    >{lang === 'fr' ? 'Reconnecter' : 'Reconnect'}</button>
                </div>
            )}

            {/* ── Status bar ──────────────────────────────────────── */}
            <div className={`${styles.statusBar} ${isConnected && !pollError ? styles.statusConnected : isConnected ? styles.statusWarning : styles.statusOff}`}>
                <div className={`${styles.statusDot} ${isConnected && !pollError ? styles.dotLive : isConnected ? styles.dotWarn : styles.dotOff}`} />
                <div style={{ flex: 1 }}>
                    <span className={styles.statusLabel}>
                        {!isConnected ? (lang === 'fr' ? 'AUCUNE CONNEXION DXTRADE' : 'NO DXTRADE CONNECTION')
                            : pollError ? (lang === 'fr' ? 'ERREUR DE CONNEXION' : 'CONNECTION ERROR')
                                : polling ? (lang === 'fr' ? 'EN DIRECT · ACTUALISATION TOUTES LES 3s' : 'LIVE · POLLING EVERY 3s')
                                    : (lang === 'fr' ? 'CONNEXION…' : 'CONNECTING…')}
                    </span>
                    {isConnected && lastPoll && !pollError && (
                        <span className={styles.statusSub}>
                            {dxtradeConfig!.username} · {positions.length} open · updated {lastPoll.toLocaleTimeString()}
                        </span>
                    )}
                    {pollError && <span className={styles.statusSubErr}>{pollError}</span>}
                </div>
                {isConnected && !pollError
                    ? <ShieldCheck size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                    : isConnected
                        ? <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                        : <WifiOff size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                }
            </div>

            {/* ── Not connected CTA ───────────────────────────────── */}
            {!isConnected && (
                <div className={styles.noConnCard}>
                    <WifiOff size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                    <p className={styles.noConnTitle}>{lang === 'fr' ? 'DXTrade non connecté' : 'DXTrade not connected'}</p>
                    <p className={styles.noConnSub}>
                        {lang === 'fr'
                            ? 'Connectez votre compte dans les Paramètres pour activer le moniteur de positions en direct. L\'analyseur pré-trade fonctionne sans connexion.'
                            : 'Connect your account in Settings to enable the live position monitor. The Pre-Trade Analyzer below works without a connection.'}
                    </p>
                    <button
                        className="btn btn--ghost btn--sm"
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={() => useAppStore.getState().setActiveTab('settings')}
                    >
                        <Settings2 size={13} /> {lang === 'fr' ? 'Aller aux paramètres' : 'Go to Settings'}
                    </button>
                </div>
            )}

            {/* ── Tabs ────────────────────────────────────────────── */}
            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'monitor' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('monitor')}
                >
                    <Activity size={13} /> {lang === 'fr' ? 'Moniteur en direct' : 'Live Monitor'}
                    {positions.length > 0 && <span className={styles.tabBadge}>{positions.length}</span>}
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'pretrade' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('pretrade')}
                >
                    <Zap size={13} /> {lang === 'fr' ? 'Vérification pré-trade' : 'Pre-Trade Check'}
                </button>
            </div>

            <AnimatePresence mode="wait">

                {/* ── Monitor tab ─────────────────────────────────── */}
                {activeTab === 'monitor' && (
                    <motion.div key="monitor" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                        {/* Account metrics strip */}
                        {metrics && (
                            <div className={styles.metricsStrip}>
                                {[
                                    { label: lang === 'fr' ? 'Solde' : 'Balance', value: `$${metrics.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '' },
                                    { label: lang === 'fr' ? 'Équité' : 'Equity', value: `$${metrics.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: metrics.equity >= metrics.balance ? '#22c55e' : '#f87171' },
                                    { label: lang === 'fr' ? 'P&L ouvert' : 'Open P&L', value: `${metrics.openPl >= 0 ? '+' : ''}$${metrics.openPl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: metrics.openPl >= 0 ? '#22c55e' : '#f87171' },
                                    { label: lang === 'fr' ? 'Marge' : 'Margin', value: `$${metrics.margin.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, color: '' },
                                ].map(m => (
                                    <div key={m.label} className={styles.metricCell}>
                                        <span className={styles.metricLabel}>{m.label}</span>
                                        <span className={styles.metricValue} style={m.color ? { color: m.color } : {}}>{m.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Positions */}
                        {isConnected && positions.length === 0 && !pollError && (
                            <div className={styles.emptyState}>
                                <div className={styles.sonarWrap}>
                                    <div className={styles.sonarRing} />
                                    <div className={styles.sonarRing} style={{ animationDelay: '0.7s' }} />
                                    <div className={styles.sonarRing} style={{ animationDelay: '1.4s' }} />
                                    <ShieldCheck size={22} style={{ color: 'var(--accent)', position: 'relative', zIndex: 1 }} />
                                </div>
                                <p className={styles.emptyTitle}>{lang === 'fr' ? 'Aucune position ouverte' : 'No open positions'}</p>
                                <p className={styles.emptySub}>{lang === 'fr' ? 'Surveillance en direct · les positions apparaissent ici dans les 3s' : 'Monitoring live · positions appear here within 3s of opening'}</p>
                            </div>
                        )}

                        <div className={styles.positionList}>
                            <AnimatePresence>
                                {positions.map((pos, i) => {
                                    const stopDist = pos.stopLoss ? Math.abs(pos.entry - pos.stopLoss) : 0;
                                    const riskUSD = stopDist * pos.lotSize;
                                    const riskPct = balanceDisplay > 0 ? (riskUSD / balanceDisplay) * 100 : 0;
                                    const tpDist = pos.takeProfit ? Math.abs(pos.takeProfit - pos.entry) : 0;
                                    const rr = stopDist > 0 && tpDist > 0 ? tpDist / stopDist : 0;
                                    const isLong = !pos.isShort;
                                    const riskStatus = riskPct > 3 ? 'danger' : riskPct > 1.5 ? 'caution' : 'safe';

                                    return (
                                        <motion.div
                                            key={pos.id}
                                            initial={{ opacity: 0, x: -16 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 16 }}
                                            transition={{ delay: i * 0.04 }}
                                            className={`${styles.posCard} ${riskStatus === 'danger' ? styles.posDanger : riskStatus === 'caution' ? styles.posCaution : styles.posSafe}`}
                                        >
                                            <div className={styles.posHeader}>
                                                <div className={styles.posLeft}>
                                                    <span className={`${styles.dirBadge} ${isLong ? styles.dirLong : styles.dirShort}`}>
                                                        {isLong ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                                                        {isLong ? 'LONG' : 'SHORT'}
                                                    </span>
                                                    <span className={styles.posSymbol}>{pos.asset}</span>
                                                </div>
                                                <div className={styles.posRight}>
                                                    <Clock size={11} style={{ color: 'var(--text-muted)' }} />
                                                    <span className={styles.posElapsed}>{elapsed(pos.createdAt)}</span>
                                                </div>
                                            </div>

                                            <div className={styles.posGrid}>
                                                <div className={styles.posCell}>
                                                    <span className={styles.posCellLabel}>{lang === 'fr' ? 'Entrée' : 'Entry'}</span>
                                                    <span className={styles.posCellValue}>{pos.entry.toLocaleString()}</span>
                                                </div>
                                                <div className={styles.posCell}>
                                                    <span className={styles.posCellLabel}>{lang === 'fr' ? 'Taille' : 'Size'}</span>
                                                    <span className={styles.posCellValue}>{pos.lotSize}</span>
                                                </div>
                                                <div className={styles.posCell}>
                                                    <span className={styles.posCellLabel}>{lang === 'fr' ? 'Stop' : 'Stop'}</span>
                                                    <span className={styles.posCellValue} style={{ color: '#f87171' }}>{pos.stopLoss || '—'}</span>
                                                </div>
                                                <div className={styles.posCell}>
                                                    <span className={styles.posCellLabel}>{lang === 'fr' ? 'Objectif' : 'Target'}</span>
                                                    <span className={styles.posCellValue} style={{ color: '#22c55e' }}>{pos.takeProfit || '—'}</span>
                                                </div>
                                            </div>

                                            {riskUSD > 0 && (
                                                <div className={styles.posRiskRow}>
                                                    <span className={styles.posRiskItem}>
                                                        {lang === 'fr' ? 'Risque' : 'Risk'} <strong style={{ color: riskStatus === 'danger' ? '#f87171' : riskStatus === 'caution' ? '#f59e0b' : 'var(--accent)' }}>
                                                            ${riskUSD.toFixed(0)} ({riskPct.toFixed(1)}%)
                                                        </strong>
                                                    </span>
                                                    {rr > 0 && (
                                                        <span className={styles.posRiskItem}>
                                                            {lang === 'fr' ? 'Risque/Récompense' : 'R:R'} <strong style={{ color: rr >= 2 ? '#22c55e' : rr >= 1.5 ? '#f59e0b' : '#f87171' }}>{rr.toFixed(1)}R</strong>
                                                        </span>
                                                    )}
                                                    {riskStatus !== 'safe' && (
                                                        <span className={styles.posWarn}>
                                                            <AlertTriangle size={10} />
                                                            {riskStatus === 'danger' ? (lang === 'fr' ? 'LIMITE DÉPASSÉE' : 'OVER LIMIT') : (lang === 'fr' ? 'RISQUE ÉLEVÉ' : 'HIGH RISK')}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>

                        {/* Manual refresh */}
                        {isConnected && (
                            <button className={styles.refreshBtn} onClick={poll}>
                                <RefreshCw size={12} /> {lang === 'fr' ? 'Actualiser maintenant' : 'Refresh now'}
                            </button>
                        )}
                    </motion.div>
                )}

                {/* ── Pre-Trade tab ────────────────────────────────── */}
                {activeTab === 'pretrade' && (
                    <motion.div key="pretrade" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className={`glass-card glass-card--elevated ${styles.ptCard}`}>
                            <div className={styles.ptHeader}>
                                <Zap size={14} style={{ color: '#a78bfa' }} />
                                <span className={styles.ptTitle}>{lang === 'fr' ? 'Vérification IA pré-trade' : 'Pre-Trade AI Check'}</span>
                                <span className={styles.ptSub}>{lang === 'fr' ? 'Remplissez avant d\'appuyer sur le bouton' : 'Fill before pressing the button'}</span>
                            </div>

                            {/* Direction toggle */}
                            <div className={styles.dirToggle}>
                                {(['LONG', 'SHORT'] as const).map(d => (
                                    <button key={d}
                                        className={`${styles.dirBtn} ${ptDir === d ? (d === 'LONG' ? styles.dirBtnLong : styles.dirBtnShort) : ''}`}
                                        onClick={() => setPtDir(d)}>
                                        {d === 'LONG' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                                        {d}
                                    </button>
                                ))}
                            </div>

                            {/* Symbol */}
                            <div className="field-group" style={{ marginBottom: 0 }}>
                                <label className="field-label">{lang === 'fr' ? 'Symbole' : 'Symbol'}</label>
                                <input className="field-input" value={ptSymbol} onChange={e => setPtSymbol(e.target.value.toUpperCase())}
                                    placeholder="BTC, ETH, SOL, MNQ…" autoCapitalize="characters" />
                            </div>

                            {/* Price inputs */}
                            <div className={styles.ptGrid}>
                                <div className="field-group" style={{ marginBottom: 0 }}>
                                    <label className="field-label">{lang === 'fr' ? 'Entrée' : 'Entry'}</label>
                                    <input className="field-input" type="number" inputMode="decimal"
                                        value={ptEntry} onChange={e => setPtEntry(e.target.value)} placeholder="65000" />
                                </div>
                                <div className="field-group" style={{ marginBottom: 0 }}>
                                    <label className="field-label">{lang === 'fr' ? 'Stop Loss' : 'Stop Loss'}</label>
                                    <input className="field-input" type="number" inputMode="decimal"
                                        value={ptStop} onChange={e => setPtStop(e.target.value)} placeholder="64500" />
                                </div>
                                <div className="field-group" style={{ marginBottom: 0 }}>
                                    <label className="field-label">{lang === 'fr' ? 'Take Profit' : 'Take Profit'}</label>
                                    <input className="field-input" type="number" inputMode="decimal"
                                        value={ptTP} onChange={e => setPtTP(e.target.value)} placeholder="66000" />
                                </div>
                                <div className="field-group" style={{ marginBottom: 0 }}>
                                    <label className="field-label">{lang === 'fr' ? 'Taille de lot' : 'Lot Size'}</label>
                                    <input className="field-input" type="number" inputMode="decimal"
                                        value={ptLots} onChange={e => setPtLots(e.target.value)} placeholder="0.05" />
                                </div>
                            </div>

                            {/* Result */}
                            <AnimatePresence>
                                {ptResult && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div className={`${styles.ptResult} ${ptResult.verdict === 'GO' ? styles.ptResultGo : ptResult.verdict === 'CAUTION' ? styles.ptResultCaution : styles.ptResultStop}`}>
                                            {/* Verdict */}
                                            <div className={styles.ptVerdict}>
                                                {ptResult.verdict === 'GO'
                                                    ? <><CheckCircle size={18} /> <span>GO</span></>
                                                    : ptResult.verdict === 'CAUTION'
                                                        ? <><AlertTriangle size={18} /> <span>CAUTION</span></>
                                                        : <><XCircle size={18} /> <span>STOP</span></>
                                                }
                                            </div>

                                            {/* Stats row */}
                                            <div className={styles.ptStats}>
                                                <div className={styles.ptStat}>
                                                    <span>{lang === 'fr' ? 'Risque' : 'Risk'}</span>
                                                    <strong>${ptResult.riskUSD.toFixed(0)} ({ptResult.riskPct.toFixed(1)}%)</strong>
                                                </div>
                                                {ptResult.rr > 0 && (
                                                    <div className={styles.ptStat}>
                                                        <span>{lang === 'fr' ? 'Risque/Récompense' : 'R:R'}</span>
                                                        <strong>{ptResult.rr.toFixed(1)}R</strong>
                                                    </div>
                                                )}
                                                <div className={styles.ptStat}>
                                                    <span>{lang === 'fr' ? 'Restant du jour' : 'Daily left'}</span>
                                                    <strong>${ptResult.dailyRemaining.toFixed(0)}</strong>
                                                </div>
                                            </div>

                                            {/* Warnings */}
                                            {ptResult.warnings.length > 0 && (
                                                <div className={styles.ptWarnings}>
                                                    {ptResult.warnings.map((w, i) => (
                                                        <div key={i} className={styles.ptWarning}>
                                                            <AlertTriangle size={10} style={{ flexShrink: 0 }} />
                                                            <span>{w}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Using balance info */}
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#4b5563', marginTop: -4 }}>
                                {lang === 'fr'
                                    ? `Utilisation : Solde $${balanceDisplay.toLocaleString()} · Limite journalière $${account.dailyLossLimit.toLocaleString()} · Utilisé aujourd'hui $${todayUsed.toFixed(0)}`
                                    : `Using: Balance $${balanceDisplay.toLocaleString()} · Daily limit $${account.dailyLossLimit.toLocaleString()} · Used today $${todayUsed.toFixed(0)}`}
                                {metrics && (lang === 'fr' ? ' (en direct)' : ' (live)')}
                            </p>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
}
