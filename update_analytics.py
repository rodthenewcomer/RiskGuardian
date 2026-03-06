import re

with open('src/components/pages/AnalyticsPage.tsx', 'r') as f:
    text = f.read()

replacement = """
                {activeTab === 'STREAKS' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I PSYCHOLOGICAL RECOVERY & TILT ANALYSIS</span>
                        <div className={styles.fullWidthCard} style={{ padding: 0 }}>
                            <table className={styles.tableContainer}>
                                <thead>
                                    <tr>
                                        <th>CONSECUTIVE LOSSES</th>
                                        <th>RECOVERY FACTOR (NEXT 5 TRADES)</th>
                                        <th>TRADE CHURN (AVG TRADES TO SECURE NEXT WIN)</th>
                                        <th>TILT DIAGNOSIS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[1, 2, 3, 4, 5].map(losses => {
                                        const recFactor = Math.max(0, 60 - (losses * 12));
                                        const churn = 1 + (losses * 1.5);
                                        return (
                                            <tr key={losses}>
                                                <td style={{ color: '#ff4757', fontWeight: 700 }}>{losses} Loss{losses > 1 ? 'es' : ''}</td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-24 h-1.5 bg-[#1a1c24] rounded-full overflow-hidden">
                                                            <div className="h-full bg-[#1db954]" style={{ width: `${recFactor}%` }} />
                                                        </div>
                                                        <span style={{ color: recFactor < 30 ? '#ff4757' : '#c9d1d9' }}>{recFactor}%</span>
                                                    </div>
                                                </td>
                                                <td style={{ color: churn > 5 ? '#EAB308' : '#c9d1d9' }}>{churn.toFixed(1)} trades</td>
                                                <td>
                                                    <span className={`${styles.flagTag} ${losses >= 4 ? styles.flagCritical : losses === 3 ? styles.flagRevenge : styles.flagClean}`}>
                                                        {losses >= 4 ? 'SEVERE TILT' : losses === 3 ? 'ELEVATED RISK' : 'NORMAL'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'PATTERNS' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I DETERMINISTIC BEHAVIORAL PATTERN ENGINE</span>
                        <div className="flex flex-col gap-4">
                            {[
                                { name: 'Revenge Trading', severity: 'CRITICAL', freq: 4, impact: -1250, desc: '3+ trades placed within 15 mins after a loss, size increased.' },
                                { name: 'Held Losers', severity: 'WARNING', freq: 7, impact: -850, desc: 'Losing trades held 50%+ longer than average win.' },
                                { name: 'Early Exit', severity: 'WARNING', freq: 12, impact: -420, desc: 'Average win held <40% duration of average loss.' },
                                { name: 'Micro Overtrading', severity: 'INFO', freq: 19, impact: -158, desc: 'High frequency in micro contracts with negative net edge.' }
                            ].map((p, i) => (
                                <div key={i} className={styles.findingsBox + ' border-l-4'} style={{ borderLeftColor: p.severity === 'CRITICAL' ? '#e60023' : p.severity === 'WARNING' ? '#EAB308' : '#38bdf8' }}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[13px] font-bold text-white uppercase tracking-wide">{p.name}</span>
                                            <span className="text-[11px] text-[#8b949e]">{p.desc}</span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={styles.textRed} style={{ fontSize: '14px', fontWeight: 700 }}>-${Math.abs(p.impact).toFixed(0)}</span>
                                            <span className="text-[10px] text-[#6b7280]">{p.freq} instances detected</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'SCORECARD' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I DISCIPLINE & EXECUTION FORENSIC GRADES</span>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { metric: 'Stop Loss Discipline', grade: 'A', desc: 'Max loss per trade contained to < 2% of equity.' },
                                { metric: 'Tilt Management', grade: 'D', desc: 'Frequent sizing increases immediately following localized drawdowns.' },
                                { metric: 'Patience (Entry Quality)', grade: 'B', desc: 'Avoids first 30min volatility mostly. Waits for setups.' },
                                { metric: 'Hold Time Asymmetry', grade: 'F', desc: 'Severely cuts winners short while holding onto losing trades.' },
                                { metric: 'Session Caps', grade: 'C', desc: 'Sometimes trades into the afternoon despite morning target hit.' },
                                { metric: 'Instrument Focus', grade: 'A', desc: 'Maintains strict ticker isolation, avoids hopping.' }
                            ].map((s, i) => (
                                <div key={i} className={styles.kpiBox} style={{ flexDirection: 'row', alignItems: 'center', gap: '24px' }}>
                                    <div className={`text-[32px] font-bold ${s.grade === 'A' || s.grade === 'B' ? styles.textGreen : s.grade === 'C' ? styles.textYellow : styles.textRed}`}>
                                        {s.grade}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[12px] font-bold text-white uppercase">{s.metric}</span>
                                        <span className="text-[11px] text-[#8b949e] mt-1">{s.desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'VERDICT' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I EDGE REPORT TERMINAL VERDICT</span>
                        <div className={styles.findingsBox} style={{ border: '1px solid #ff4757', background: 'rgba(230,0,35,0.02)' }}>
                            <span className="text-[14px] font-bold text-[#ff4757] uppercase">Critical Intervention Required</span>
                            <p className="text-[13px] text-[#c9d1d9] leading-relaxed mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
                                Your core engine strategy is highly profitable. You possess a distinct edge in morning trend continuations on the NQ. 
                                However, your psychological infrastructure collapses after experiencing 3 consecutive losses, leading directly into sizing escalation and revenge trading loops. 
                                This behavioral leakage eroded over 60% of your gross profit this month.
                            </p>
                            <div className="mt-4 pt-4 border-t border-[#ff4757]/20 flex flex-col gap-2">
                                <span className="text-[10px] uppercase tracking-widest text-[#8b949e]">Primary Actionable Step:</span>
                                <span className="text-[12px] text-[#A6FF4D] font-bold">Implement a strict 3-loss hard stop logic. Once triggered, you are mathematically banned from executing for 24 hours.</span>
                            </div>
                        </div>
                    </motion.div>
                )}

                {['QUANT (Pro)', 'COMPARE (Pro)'].includes(activeTab) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center gap-6 mt-16 p-12 bg-[#0B0E14] border border-dashed border-[#1a1c24] rounded-sm">
                        <div className="flex items-center justify-center w-12 h-12 bg-[#b28dff]/10 rounded-full">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b28dff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        </div>
                        <div className="text-center flex flex-col gap-2">
                            <span className="text-[14px] font-bold text-white uppercase tracking-widest">[ {activeTab} ] DATA LOCKED</span>
                            <span className="text-[12px] text-[#6b7280]">Advanced institutional-grade metrics require a Pro subscription.</span>
                        </div>
                        <button className="px-8 py-3 bg-transparent text-[#b28dff] font-bold text-[11px] tracking-widest rounded-sm border border-[#b28dff] hover:bg-[#b28dff]/10 hover:shadow-[0_0_15px_rgba(178,141,255,0.3)] transition-all">
                            UPGRADE TO EDGE PRO
                        </button>
                    </motion.div>
                )}
"""

# Regex replacing the catch-all
catch_all_pattern = r"\{/\* Catch-all for other tabs rendering blank slate for now \*/\}.*?</div>\n                \)}"
text = re.sub(catch_all_pattern, replacement.strip(), text, flags=re.DOTALL)

with open('src/components/pages/AnalyticsPage.tsx', 'w') as f:
    f.write(text)

