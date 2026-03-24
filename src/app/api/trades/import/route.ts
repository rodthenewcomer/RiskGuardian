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

        // 1. Wipe ANY old buggy corrupted PDF trades from the deprecated parser algorithm
        // Legacy IDs had the format "tradeify-YYYYMMDD-HHMM-Direction-Symbol-Index"
        // This regex equivalent using ILIKE deletes ONLY the old broken formats.
        const { error: delError } = await supabase
            .from('trades')
            .delete()
            .eq('user_id', user.id)
            .like('id', 'tradeify-%-%-%-%-%');

        if (delError) {
            console.error('Failed to wipe legacy format trades:', delError);
            return NextResponse.json({ error: 'Failed to wipe legacy cloud trades' }, { status: 500 });
        }

        // 2. Insert new PDF trades via mathematically perfectly deduplicated deterministic IDs
        if (trades.length > 0) {
            const rows = trades.map((t: any) => tradeToRow(t, user.id));
            let total = 0;
            for (let i = 0; i < rows.length; i += 100) {
                const batch = rows.slice(i, i + 100);
                // By using ignoreDuplicates, we never overwrite existing trades,
                // thereby flawlessly preserving the user's manual notes/tags attached to previously imported PDF trades!
                const { error, count } = await supabase
                    .from('trades')
                    .upsert(batch, { onConflict: 'id', count: 'exact', ignoreDuplicates: true });
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
