'use client';

/**
 * BridgePage — RiskGuardian Live Bridge Dashboard
 * ─────────────────────────────────────────────────────────────────
 * Real-time trade monitoring when connected to local bridge software.
 * Three observation methods: Log File · Memory Read · Screen Parse.
 * Passive observation only — no trade control.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldCheck, ShieldAlert, Wifi, WifiOff, Activity, Send,
    RefreshCw, Eye, Terminal, Cpu, FileText, Play, Trash2,
    AlertTriangle, CheckCircle, Clock, Zap
} from 'lucide-react';
import styles from './BridgePage.module.css';

// ── Types ──────────────────────────────────────────────────────────
interface BridgeTrade {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL' | 'UNKNOWN';
    lots: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    accountBalance: number;
    dailyLossLimit: number;
    platform: string;
    method: string;
    timestamp: string;
    ai?: {
        riskUSD: number;
        riskPct: number;
        remainingDailyUSD: number;
        rrRatio: number;
        survivalStatus: 'safe' | 'caution' | 'danger' | 'critical';
        approved: boolean;
        warnings: string[];
        recommendation: string;
    };
}

interface BridgeStatus {
    connected: boolean;
    sessionId: string;
    lastPing: number;
    tradeCount: number;
    trades: BridgeTrade[];
}

const API_URL = '/api/bridge';
const API_KEY = 'rg-bridge-local-dev';
const POLL_MS = 2500;

// ── Demo trade injector (simulates bridge software) ──────────────
const DEMO_TRADES: Partial<BridgeTrade>[] = [
    { symbol: 'BTCUSD', direction: 'BUY', lots: 0.05, entry: 65200, stopLoss: 64900, takeProfit: 65800, accountBalance: 52600, dailyLossLimit: 1500, platform: 'DXTrade', method: 'log' },
    { symbol: 'ETHUSD', direction: 'SELL', lots: 0.3, entry: 3200, stopLoss: 3280, takeProfit: 3040, accountBalance: 52600, dailyLossLimit: 1500, platform: 'DXTrade', method: 'memory' },
    { symbol: 'SOLUSD', direction: 'BUY', lots: 12, entry: 91.65, stopLoss: 90.48, takeProfit: 93.99, accountBalance: 52600, dailyLossLimit: 1500, platform: 'DXTrade', method: 'screen' },
    { symbol: 'BTCUSD', direction: 'BUY', lots: 0.15, entry: 65100, stopLoss: 64200, takeProfit: 66900, accountBalance: 51200, dailyLossLimit: 1500, platform: 'MatchTrader', method: 'log' },
];

type SetupStep = 'method' | 'install' | 'connect' | 'live';

export default function BridgePage() {
    const [status, setStatus] = useState<BridgeStatus | null>(null);
    const [polling, setPolling] = useState(false);
    const [setupStep, setSetupStep] = useState<SetupStep>('method');
    const [selectedMethod, setMethod] = useState<'log' | 'memory' | 'screen'>('log');
    const [injecting, setInjecting] = useState(false);
    const [newCount, setNewCount] = useState(0);
    const [lastKnownCount, setLastKnownCount] = useState(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Fetch status from API ──────────────────────────────────────
    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}?limit=20`, { cache: 'no-store' });
            if (!res.ok) return;
            const data: BridgeStatus = await res.json();
            setStatus(prev => {
                if (prev && data.tradeCount > (prev.tradeCount || 0)) {
                    setNewCount(n => n + (data.tradeCount - (prev.tradeCount || 0)));
                }
                return data;
            });
        } catch { /* network offline */ }
    }, []);

    // ── Start / stop polling ───────────────────────────────────────
    const startPolling = useCallback(() => {
        if (pollRef.current) return;
        setPolling(true);
        fetchStatus();
        pollRef.current = setInterval(fetchStatus, POLL_MS);
    }, [fetchStatus]);

    const stopPolling = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setPolling(false);
    }, []);

    useEffect(() => {
        startPolling();
        return stopPolling;
    }, [startPolling, stopPolling]);

    // ── Inject demo trade (simulates bridge push) ─────────────────
    const injectDemo = async () => {
        setInjecting(true);
        const demo = DEMO_TRADES[Math.floor(Math.random() * DEMO_TRADES.length)];
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
                body: JSON.stringify(demo)
            });
            await fetchStatus();
        } catch { /* offline */ }
        setInjecting(false);
    };

    // ── Clear session ─────────────────────────────────────────────
    const clearSession = async () => {
        await fetch(API_URL, { method: 'DELETE', headers: { 'Authorization': `Bearer ${API_KEY}` } });
        setNewCount(0);
        await fetchStatus();
    };

    const isConnected = status?.connected ?? false;
    const trades = status?.trades ?? [];

    return (
        <div className={styles.page}>
            {/* ── Status Bar ────────────────────────────────────── */}
            <div className={`${styles.statusBar} ${isConnected ? styles.statusConnected : polling ? styles.statusPolling : styles.statusOff}`}>
                <div className={styles.statusDot} />
                <div className="flex-1">
                    <span className={styles.statusLabel}>
                        {isConnected ? 'BRIDGE CONNECTED' : polling ? 'LISTENING FOR BRIDGE…' : 'BRIDGE OFFLINE'}
                    </span>
                    {isConnected && status?.lastPing && (
                        <span className={styles.statusSub}>
                            Last ping: {Math.round((Date.now() - status.lastPing) / 1000)}s ago ·{' '}
                            {status.tradeCount} trades observed
                        </span>
                    )}
                </div>
                {isConnected
                    ? <ShieldCheck size={18} className={styles.statusIcon} />
                    : polling
                        ? <Activity size={18} className={`${styles.statusIcon} ${styles.pulse}`} />
                        : <WifiOff size={18} className={styles.statusIcon} />
                }
            </div>

            {/* ── No trades yet — Setup Wizard ─────────────────── */}
            {trades.length === 0 && (
                <div className={styles.wizard}>
                    {/* Step tabs */}
                    <div className={styles.stepTabs}>
                        {(['method', 'install', 'connect', 'live'] as SetupStep[]).map((s, i) => (
                            <button key={s}
                                className={`${styles.stepTab} ${setupStep === s ? styles.stepTabActive : ''}`}
                                onClick={() => setSetupStep(s)}>
                                <span className={styles.stepNum}>{i + 1}</span>
                                <span className={styles.stepLabel}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        {setupStep === 'method' && (
                            <motion.div key="method" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.stepContent}>
                                <h2 className={styles.stepTitle}>Choose your bridge method</h2>
                                <p className={styles.stepSub}>Select how RiskGuardian Bridge reads your platform data. Start with Log File — it works on 90% of platforms.</p>
                                <div className={styles.methodCards}>
                                    {[
                                        { id: 'log' as const, icon: <FileText size={20} />, label: 'Log File Reader', sub: 'Reads trade logs DXTrade/MatchTrader write to disk. Zero permissions required.', difficulty: 'Easy', compat: '90% platforms' },
                                        { id: 'memory' as const, icon: <Cpu size={20} />, label: 'Memory Reader', sub: 'Reads platform process memory to detect positions. Used by professional copiers.', difficulty: 'Advanced', compat: 'MT4/MT5' },
                                        { id: 'screen' as const, icon: <Eye size={20} />, label: 'Screen Parser', sub: 'OCR vision reads numbers directly from platform UI. Fallback for any platform.', difficulty: 'Medium', compat: 'Universal' },
                                    ].map(m => (
                                        <button key={m.id}
                                            className={`${styles.methodCard} ${selectedMethod === m.id ? styles.methodCardActive : ''}`}
                                            onClick={() => setMethod(m.id)}>
                                            <div className={styles.methodIcon}>{m.icon}</div>
                                            <div className={styles.methodBody}>
                                                <p className={styles.methodLabel}>{m.label}</p>
                                                <p className={styles.methodSub}>{m.sub}</p>
                                                <div className={styles.methodMeta}>
                                                    <span className={styles.methodDiff}>{m.difficulty}</span>
                                                    <span className={styles.methodCompat}>{m.compat}</span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <button className={styles.nextBtn} onClick={() => setSetupStep('install')}>
                                    Continue with {selectedMethod === 'log' ? 'Log File Reader' : selectedMethod === 'memory' ? 'Memory Reader' : 'Screen Parser'} →
                                </button>
                            </motion.div>
                        )}

                        {setupStep === 'install' && (
                            <motion.div key="install" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.stepContent}>
                                <h2 className={styles.stepTitle}>Install RiskGuardian Bridge</h2>
                                <p className={styles.stepSub}>A lightweight background app that runs on your trading computer and sends trade data to this dashboard.</p>
                                <div className={styles.codeBlock}>
                                    <div className={styles.codeHeader}><Terminal size={12} /> bridge_installer.sh</div>
                                    <pre className={styles.code}>{
                                        `# Download RiskGuardian Bridge (macOS/Windows/Linux)
curl -fsSL https://bridge.riskguardia.com/install | bash

# Or run directly from source:
git clone https://github.com/riskguardia/bridge
cd bridge && npm install && npm start

# Configure your API key:
PROPGUARD_API_KEY=${API_KEY}
PROPGUARD_SERVER=https://riskguardia.com/api/bridge`
                                    }</pre>
                                </div>
                                {selectedMethod === 'log' && (
                                    <div className={styles.codeBlock}>
                                        <div className={styles.codeHeader}><FileText size={12} /> Log path examples</div>
                                        <pre className={styles.code}>{
                                            `# DXTrade logs (Windows):
C:\\Users\\{USER}\\AppData\\DXTrade\\logs\\trades.log

# MatchTrader:
~/Library/Application\\ Support/MatchTrader/trades.json

# Bridge watches this folder for new entries automatically`
                                        }</pre>
                                    </div>
                                )}
                                <button className={styles.nextBtn} onClick={() => setSetupStep('connect')}>
                                    I've installed the bridge →
                                </button>
                            </motion.div>
                        )}

                        {setupStep === 'connect' && (
                            <motion.div key="connect" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.stepContent}>
                                <h2 className={styles.stepTitle}>Connect the bridge</h2>
                                <p className={styles.stepSub}>Your bridge needs this API key to authenticate. Copy it into the bridge config file.</p>
                                <div className={styles.keyCard}>
                                    <div className={styles.keyLabel}>Your API Key</div>
                                    <code className={styles.keyValue}>{API_KEY}</code>
                                    <button className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(API_KEY)}>Copy</button>
                                </div>
                                <div className={styles.codeBlock}>
                                    <div className={styles.codeHeader}><Terminal size={12} /> propguard.config.json</div>
                                    <pre className={styles.code}>{JSON.stringify({
                                        api_key: API_KEY,
                                        server: window?.location?.origin + '/api/bridge',
                                        method: selectedMethod,
                                        poll_interval_ms: 500,
                                        platform: 'DXTrade',
                                        tls: true
                                    }, null, 2)}</pre>
                                </div>
                                <div className={styles.archDiagram}>
                                    {['Trading Platform', 'RiskGuardian Bridge', 'TLS/HTTPS', 'AI Risk Engine', 'This Dashboard'].map((node, i, arr) => (
                                        <div key={node} className={styles.archRow}>
                                            <div className={`${styles.archNode} ${i === arr.length - 1 ? styles.archNodeFinal : ''}`}>{node}</div>
                                            {i < arr.length - 1 && <div className={styles.archArrow}>↓</div>}
                                        </div>
                                    ))}
                                </div>
                                <button className={styles.nextBtn} onClick={() => setSetupStep('live')}>
                                    Bridge is configured →
                                </button>
                            </motion.div>
                        )}

                        {setupStep === 'live' && (
                            <motion.div key="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.stepContent}>
                                <h2 className={styles.stepTitle}>Waiting for first trade…</h2>
                                <p className={styles.stepSub}>RiskGuardian is listening. Execute any trade in your platform. The bridge will detect it within 500ms and AI analysis will appear here.</p>
                                <div className={styles.listeningAnimation}>
                                    <div className={styles.sonarRing} />
                                    <div className={styles.sonarRing} style={{ animationDelay: '0.6s' }} />
                                    <div className={styles.sonarRing} style={{ animationDelay: '1.2s' }} />
                                    <ShieldCheck size={28} className={styles.sonarIcon} />
                                </div>
                                <p className={styles.demoNote}>No bridge installed yet?</p>
                                <button className={styles.demoBtn} onClick={injectDemo} disabled={injecting}>
                                    <Play size={14} />
                                    {injecting ? 'Injecting…' : 'Inject demo trade'}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Live Feed ─────────────────────────────────────── */}
            {trades.length > 0 && (
                <div className={styles.liveFeed}>
                    {/* Feed controls */}
                    <div className={styles.feedHeader}>
                        <div className="flex items-center gap-2">
                            <Zap size={14} className="text-accent" />
                            <span className={styles.feedTitle}>Live Trade Feed</span>
                            {newCount > 0 && (
                                <motion.span
                                    key={newCount}
                                    initial={{ scale: 1.4, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className={styles.newBadge}
                                >{newCount} new</motion.span>
                            )}
                        </div>
                        <div className={styles.feedActions}>
                            <button className={styles.iconBtn} onClick={injectDemo} disabled={injecting} title="Inject demo trade">
                                <Send size={13} />
                            </button>
                            <button className={styles.iconBtn} onClick={fetchStatus} title="Refresh">
                                <RefreshCw size={13} />
                            </button>
                            <button className={`${styles.iconBtn} ${styles.dangerBtn}`} onClick={clearSession} title="Clear session">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </div>

                    {/* Trade cards */}
                    <div className={styles.tradeList}>
                        <AnimatePresence>
                            {trades.map((trade, idx) => {
                                const status = trade.ai?.survivalStatus || 'safe';
                                const approved = trade.ai?.approved ?? true;
                                return (
                                    <motion.div
                                        key={trade.id}
                                        initial={{ opacity: 0, x: -20, scale: 0.97 }}
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        transition={{ delay: idx < 3 ? idx * 0.05 : 0 }}
                                        className={`${styles.tradeCard} ${status === 'safe' ? styles.tradeSafe :
                                                status === 'caution' ? styles.tradeCaution :
                                                    status === 'danger' ? styles.tradeDanger : styles.tradeCritical
                                            }`}
                                    >
                                        {/* Trade header */}
                                        <div className={styles.tradeHeader}>
                                            <div className={styles.tradeSymbol}>
                                                <span className={`${styles.dirBadge} ${trade.direction === 'BUY' ? styles.dirBuy : styles.dirSell}`}>
                                                    {trade.direction}
                                                </span>
                                                <span className={styles.symbolText}>{trade.symbol}</span>
                                                <span className={styles.platformBadge}>{trade.platform} · {trade.method}</span>
                                            </div>
                                            <div className={styles.tradeMeta}>
                                                {approved
                                                    ? <CheckCircle size={14} className="text-success" />
                                                    : <AlertTriangle size={14} className="text-danger" />
                                                }
                                                <span className={styles.tradeTime}>
                                                    {new Date(trade.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' })} EST
                                                </span>
                                            </div>
                                        </div>

                                        {/* Trade numbers */}
                                        <div className={styles.tradeGrid}>
                                            <div className={styles.tv}><span className={styles.tk}>Entry</span><span className={styles.tvv}>{trade.entry.toLocaleString()}</span></div>
                                            <div className={styles.tv}><span className={styles.tk}>Lots</span><span className={styles.tvv}>{trade.lots}</span></div>
                                            <div className={styles.tv}><span className={styles.tk}>Stop Loss</span><span className={`${styles.tvv} text-danger`}>{trade.stopLoss || '—'}</span></div>
                                            <div className={styles.tv}><span className={styles.tk}>Take Profit</span><span className={`${styles.tvv} text-success`}>{trade.takeProfit || '—'}</span></div>
                                        </div>

                                        {/* AI overlay */}
                                        {trade.ai && (
                                            <div className={styles.aiOverlay}>
                                                <div className={styles.aiRow}>
                                                    <div className={styles.aiStat}>
                                                        <span className={styles.aiStatLabel}>Risk</span>
                                                        <span className={`${styles.aiStatValue} ${trade.ai.riskUSD > (trade.dailyLossLimit * 0.5) ? 'text-danger' : 'text-accent'}`}>
                                                            ${trade.ai.riskUSD.toFixed(0)} ({trade.ai.riskPct.toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                    <div className={styles.aiStat}>
                                                        <span className={styles.aiStatLabel}>R:R</span>
                                                        <span className={`${styles.aiStatValue} ${trade.ai.rrRatio >= 2 ? 'text-success' : trade.ai.rrRatio >= 1.5 ? 'text-warning' : 'text-danger'}`}>
                                                            {trade.ai.rrRatio.toFixed(1)}R
                                                        </span>
                                                    </div>
                                                    <div className={styles.aiStat}>
                                                        <span className={styles.aiStatLabel}>Daily Left</span>
                                                        <span className={styles.aiStatValue}>${trade.ai.remainingDailyUSD.toFixed(0)}</span>
                                                    </div>
                                                    <div className={styles.aiStat}>
                                                        <span className={styles.aiStatLabel}>Status</span>
                                                        <span className={`${styles.aiStatValue} font-bold ${status === 'safe' ? 'text-success' :
                                                                status === 'caution' ? 'text-warning' :
                                                                    'text-danger'
                                                            }`}>{status.toUpperCase()}</span>
                                                    </div>
                                                </div>
                                                <p className={styles.aiRec}>{trade.ai.recommendation}</p>
                                                {trade.ai.warnings.length > 0 && (
                                                    <div className={styles.aiWarnings}>
                                                        {trade.ai.warnings.map((w, i) => (
                                                            <div key={i} className={styles.aiWarning}>
                                                                <AlertTriangle size={10} className="flex-shrink-0" />
                                                                <span>{w}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>

                    {/* Demo inject button at bottom */}
                    <button className={styles.demoBtn} style={{ marginTop: 12 }} onClick={injectDemo} disabled={injecting}>
                        <Play size={14} />
                        {injecting ? 'Injecting…' : 'Simulate incoming trade'}
                    </button>
                </div>
            )}
        </div>
    );
}
