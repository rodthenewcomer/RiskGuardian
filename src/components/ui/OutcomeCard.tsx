'use client';

import styles from './OutcomeCard.module.css';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

interface OutcomeCardProps {
    label: string;
    price: number;
    pnl: number;
    type: 'tp' | 'sl';
    rr?: number;
}

export default function OutcomeCard({ label, price, pnl, type, rr }: OutcomeCardProps) {
    const isProfit = type === 'tp';

    return (
        <motion.div
            className={`glass-card ${styles.card} ${isProfit ? styles.profit : styles.loss}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className={styles.header}>
                <div className={`${styles.iconWrap} ${isProfit ? styles.iconProfit : styles.iconLoss}`}>
                    {isProfit ? <TrendingUp size={16} strokeWidth={2.5} /> : <TrendingDown size={16} strokeWidth={2.5} />}
                </div>
                <span className={styles.label}>{label}</span>
                {rr !== undefined && isProfit && (
                    <div className={styles.rrBadge}>
                        <Target size={10} />
                        <span>{rr.toFixed(1)}R</span>
                    </div>
                )}
            </div>

            <div className={styles.price}>
                <span className={styles.priceValue}>{price.toFixed(3)}</span>
            </div>

            <div className={`${styles.pnl} ${isProfit ? styles.pnlProfit : styles.pnlLoss}`}>
                <span>{isProfit ? '+' : '-'}${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
        </motion.div>
    );
}
