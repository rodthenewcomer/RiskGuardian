'use client';

import { motion } from 'framer-motion';

interface ConsistencyProps {
    score: number; // % of best day vs total profit
    bestDayPnl: number;
    totalPnl: number;
}

export default function ConsistencyGauge({ score, bestDayPnl, totalPnl }: ConsistencyProps) {
    const isPassing = score <= 20 && totalPnl > 0;
    const progress = Math.min(100, (score / 40) * 100); // 40% is max overflow point

    return (
        <div className="flex flex-col gap-3 p-4 bg-[#111624] border border-white/5 rounded-xl">
            <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted font-bold tracking-widest uppercase">Tradeify Consistency</span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold ${isPassing ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                    {isPassing ? 'PASSING' : 'FAILED'}
                </span>
            </div>

            <div className="relative h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className={`absolute inset-0 rounded-full ${isPassing ? 'bg-success' : 'bg-danger'}`}
                />

                {/* 20% Marker */}
                <div
                    className="absolute top-0 bottom-0 w-[2px] bg-white space-y-1 z-10"
                    style={{ left: '50%' }} // 20% in our scale (0..40) is 50%
                >
                    <div className="absolute top-[-10px] left-[-15px] text-[8px] text-white/40 font-bold">20% LIMIT</div>
                </div>
            </div>

            <div className="flex justify-between items-end mt-1">
                <div>
                    <h3 className="text-[20px] font-extrabold leading-tight">
                        {score.toFixed(1)}%
                    </h3>
                    <p className="text-[10px] text-muted tracking-wide font-medium">Best Day: <span className="text-white">${bestDayPnl.toLocaleString()}</span></p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-muted tracking-wide font-medium mb-1">Total Profit</p>
                    <p className="text-[14px] font-bold text-success">${totalPnl.toLocaleString()}</p>
                </div>
            </div>

            {!isPassing && totalPnl > 0 && (
                <div className="p-2 bg-danger/10 border border-danger/20 rounded text-[9px] text-danger/80 leading-snug">
                    FAILING: Consistency rule requires &lt;20% profile concentration.
                    Best day accounts for too much of total. Buffer more profit to pass.
                </div>
            )}
        </div>
    );
}
