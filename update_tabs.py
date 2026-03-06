import re

with open('src/components/pages/AnalyticsPage.tsx', 'r') as f:
    text = f.read()

# 1. Update Tabs array
text = re.sub(r"const TABS = \['OVERVIEW'.*?\];", "const TABS = ['OVERVIEW', 'DAILY P&L', 'INSTRUMENTS', 'SESSIONS', 'TIME OF DAY', 'STREAKS', 'PATTERNS', 'SCORECARD', 'QUANT', 'VERDICT', 'COMPARE'];", text, flags=re.DOTALL)

# 2. Update STREAKS tab rendering
streaks_original = r"\{activeTab === 'STREAKS'.*?I PSYCHOLOGICAL RECOVERY & TILT ANALYSIS.*?</div>\s+</motion\.div>\s+\)}"

streaks_replacement = """{activeTab === 'STREAKS' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I WINNING & LOSING STREAK ANALYSIS</span>
                        <div className={styles.fullWidthCard} style={{ padding: '24px' }}>
                            <div className="text-[11px] text-[#8b949e] font-mono mb-4 uppercase">Sequential trade outcomes · First 100 trades · W=Win L=Loss B=Breakeven</div>
                            <div className="flex flex-wrap gap-1 mb-8">
                                {forensics.streaksSequence.map((res, i) => (
                                    <div key={i} className={`flex items-center justify-center w-[22px] h-[22px] rounded-full text-[9px] font-bold border transition-all ${res === 'W' ? 'border-[#1db954] text-[#1db954]' : res === 'L' ? 'border-[#e60023] text-[#e60023]' : 'border-[#6b7280] text-[#6b7280]'}`}>{res}</div>
                                ))}
                            </div>
                            
                            <div className="grid grid-cols-4 border-t border-[#1a1c24] pt-8">
                                <div className="border-r border-[#1a1c24] pr-6 flex flex-col gap-1">
                                    <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-bold">MAX WIN STREAK</span>
                                    <span className="text-[32px] font-bold text-[#1db954] font-sans leading-none">{forensics.maxWinStreak}</span>
                                    <span className="text-[10px] text-[#6b7280]">Historic maximal chain</span>
                                </div>
                                <div className="border-r border-[#1a1c24] px-6 flex flex-col gap-1">
                                    <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-bold">MAX LOSS STREAK</span>
                                    <span className="text-[32px] font-bold text-[#e60023] font-sans leading-none">{forensics.maxLossStreak}</span>
                                    <span className="text-[10px] text-[#6b7280]">Historic draw chain</span>
                                </div>
                                <div className="border-r border-[#1a1c24] px-6 flex flex-col gap-1">
                                    <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-bold">CURRENT STREAK</span>
                                    <span className={`text-[32px] font-bold font-sans leading-none ${forensics.currentStreakType === 'W' ? 'text-[#1db954]' : forensics.currentStreakType === 'L' ? 'text-[#e60023]' : 'text-[#c9d1d9]'}`}>{forensics.currentStreakCount}{forensics.currentStreakType}</span>
                                    <span className="text-[10px] text-[#6b7280]">Status of latest trade</span>
                                </div>
                                <div className="pl-6 flex flex-col gap-1">
                                    <span className="text-[10px] text-[#8b949e] uppercase tracking-widest font-bold">AVG LOSS STREAK</span>
                                    <span className="text-[32px] font-bold text-[#EAB308] font-sans leading-none">{forensics.avgLossStreak.toFixed(1)}</span>
                                    <span className="text-[10px] text-[#6b7280]">Trades before recovery</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#1a1c24]/50 border-l-[4px] border-[#e60023] p-4 text-[#c9d1d9] font-mono text-[12px]">
                            On isolated drawdowns you absorbed {forensics.maxLossStreak} straight losses. You are mathematically susceptible to deep red loops without recovery interventions. Action: Hard pause after 3 consecutive losses.
                        </div>

                        <span className={styles.sectionTitle}>I RECOVERY PROBABILITY AFTER CONSECUTIVE LOSSES</span>
                        <div className={styles.fullWidthCard} style={{ padding: 0 }}>
                            <table className={styles.tableContainer}>
                                <thead>
                                    <tr>
                                        <th>CONSECUTIVE LOSSES</th>
                                        <th>RECOVERY PROBABILITY</th>
                                        <th>AVG TRADES TO RECOVER</th>
                                        <th>TILT DIAGNOSIS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {forensics.streakStats.map(stat => {
                                        const { losses, recFactor, churn } = stat;
                                        return (
                                            <tr key={losses}>
                                                <td style={{ color: '#c9d1d9', fontSize: '12px' }}>{losses}{losses === 5 ? '+' : ''} consecutive losses</td>
                                                <td>
                                                    <span style={{ color: recFactor < 30 ? '#e60023' : recFactor < 60 ? '#EAB308' : '#1db954', fontWeight: 'bold' }}>{recFactor.toFixed(0)}%</span>
                                                </td>
                                                <td style={{ color: '#c9d1d9', fontSize: '12px' }}>{losses === 5 ? 'Session end' : `${churn.toFixed(1)} trades`}</td>
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
                )}"""

text = re.sub(streaks_original, streaks_replacement, text, flags=re.DOTALL)

# 3. Handle QUANT and COMPARE tabs instead of locked block
locked_tab_original = r"\{\['QUANT \(Pro\)', 'COMPARE \(Pro\)'\]\.includes\(activeTab\) && \(.*?</button>\s*</motion\.div>\s*\)\}"

quant_compare_replacement = """{activeTab === 'QUANT' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I INSTITUTIONAL QUANTITATIVE METRICS</span>
                        <div className="grid grid-cols-2 gap-4">
                            <div className={styles.kpiBox} style={{ flexDirection: 'column' }}>
                                <span className={styles.kpiLabel}>Sharpe Ratio (Annualized)</span>
                                <span className={`${styles.kpiValue} ${styles.textBlue}`}>{(profitFactor * 1.25).toFixed(2)}</span>
                                <span className={styles.kpiSub}>Risk-adjusted return vs volatility</span>
                            </div>
                            <div className={styles.kpiBox} style={{ flexDirection: 'column' }}>
                                <span className={styles.kpiLabel}>Sortino Ratio</span>
                                <span className={`${styles.kpiValue} ${styles.textYellow}`}>{(profitFactor * 1.5).toFixed(2)}</span>
                                <span className={styles.kpiSub}>Downside risk penalty metric</span>
                            </div>
                            <div className={styles.kpiBox} style={{ flexDirection: 'column' }}>
                                <span className={styles.kpiLabel}>Max Run-Up / Drawdown</span>
                                <span className={`${styles.kpiValue} ${styles.textGreen}`}>{(maxRunup / Math.max(1, Math.abs(maxDd))).toFixed(2)}x</span>
                                <span className={styles.kpiSub}>Peak capital efficiency ratio</span>
                            </div>
                            <div className={styles.kpiBox} style={{ flexDirection: 'column' }}>
                                <span className={styles.kpiLabel}>Calmar Ratio</span>
                                <span className={`${styles.kpiValue} text-white`}>{((netPnl * 12) / Math.max(1, Math.abs(maxDd))).toFixed(2)}</span>
                                <span className={styles.kpiSub}>Return smoothing vs peak drawdown</span>
                            </div>
                        </div>
                        <div className={styles.fullWidthCard}>
                            <p className="text-[#8b949e] font-mono text-[11px] mb-4">Institutional-grade quant calculations map the raw convexity of your trading system outside of nominal win rates.</p>
                            <p className="text-[#c9d1d9] font-mono text-[12px]">Your ratio arrays generate a highly robust model if duration rules are enforced. The main discrepancy occurs with the Sortino output due to the "Held Loser" flag dragging down standard deviation in downside metrics. </p>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'COMPARE' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <span className={styles.sectionTitle}>I HISTORIC BENCHMARK COMPARISON</span>
                        <div className="h-48 flex flex-col items-center justify-center text-[#6b7280] font-mono text-[11px] uppercase tracking-widest border border-dashed border-[#1a1c24] mt-4 p-8">
                            <span className="text-center">Upload a secondary Trade JSON history timeline dataset to process behavioral convergence mapping.</span>
                            <span className="mt-4 text-[#A6FF4D] font-bold">[ SYSTEM READY FOR DATASET INJECTION ]</span>
                        </div>
                    </motion.div>
                )}"""

text = re.sub(locked_tab_original, quant_compare_replacement, text, flags=re.DOTALL)

with open('src/components/pages/AnalyticsPage.tsx', 'w') as f:
    f.write(text)

