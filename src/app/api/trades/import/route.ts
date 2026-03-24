import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Re-implement lightweight trade conversion to avoid importing heavy client stores
function tradeToRow(trade: any, userId: string) {
    return {
        id:               trade.id,
        user_id:          userId,
        asset:            trade.asset,
        asset_type:       trade.assetType,
        entry:            trade.entry,
        stop_loss:        trade.stopLoss,
        take_profit:      trade.takeProfit,
        lot_size:         trade.lotSize,
        risk_usd:         trade.riskUSD,
        reward_usd:       trade.rewardUSD,
        rr:               trade.rr,
        outcome:          trade.outcome ?? 'open',
        pnl:              trade.pnl ?? null,
        is_short:         trade.isShort ?? false,
        note:             trade.note ?? '',
        tags:             trade.tags ?? [],
        duration_seconds: trade.durationSeconds ?? null,
        created_at:       trade.createdAt,
        closed_at:        trade.closedAt ?? null,
        synced_at:        new Date().toISOString(),
    };
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
        }

        // Initialize Supabase with the user's explicit token
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                global: {
                    headers: {
                        Authorization: authHeader,
                    },
                },
            }
        );

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { trades, coverageStart, coverageEnd } = body;

        if (!trades || !Array.isArray(trades)) {
            return NextResponse.json({ error: 'Invalid payload: trades array required' }, { status: 400 });
        }

        // 1. Wipe overlapping rows in cloud for this user
        if (coverageStart && coverageEnd && coverageStart !== '9999-99-99' && coverageEnd !== '0000-00-00') {
            const { error: delError } = await supabase
                .from('trades')
                .delete()
                .eq('user_id', user.id)
                .like('id', 'tradeify-%')
                .gte('created_at', `${coverageStart}T00:00:00.000Z`)
                .lte('created_at', `${coverageEnd}T23:59:59.999Z`);

            if (delError) {
                console.error('importPdfTrades wipe error:', delError);
                return NextResponse.json({ error: 'Failed to wipe overlapping cloud trades' }, { status: 500 });
            }
        }

        // 2. Insert new PDF trades
        if (trades.length > 0) {
            const rows = trades.map((t: any) => tradeToRow(t, user.id));
            let total = 0;
            for (let i = 0; i < rows.length; i += 100) {
                const batch = rows.slice(i, i + 100);
                const { error, count } = await supabase
                    .from('trades')
                    .upsert(batch, { onConflict: 'id', count: 'exact' });
                if (error) {
                    console.error('importPdfTrades upsert error:', error);
                    return NextResponse.json({ error: 'Failed to push new trades to cloud' }, { status: 500 });
                }
                total += count ?? batch.length;
            }
        }

        return NextResponse.json({ success: true, count: trades.length }, { status: 200 });
    } catch (err: unknown) {
        console.error('Server-side PDF import error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal Server Error' },
            { status: 500 }
        );
    }
}
