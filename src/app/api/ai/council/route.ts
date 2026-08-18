import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, isAdminConfigured } from '@/lib/firebase/admin';
import { councilAgent } from '@/services/ai/council-agent';
import { buildFinancialContextString } from '@/services/ai/tool-executor';
import { getServerHoldings } from '@/server/firestore';

export const maxDuration = 120;

function buildHoldingsSnapshot(holdings: { symbol: string; name: string; quantity: number; avgPrice: number; type: string }[]): string {
    if (!holdings.length) return 'Empty portfolio — no holdings.';

    const values = holdings.map((h) => ({
        ...h,
        value: h.quantity * h.avgPrice,
    }));
    const total = values.reduce((sum, h) => sum + h.value, 0);

    const lines = values
        .sort((a, b) => b.value - a.value)
        .map((h) => `${h.name} (${h.symbol}): ${h.quantity} units @ ${h.avgPrice} = ${h.value.toFixed(2)} (${((h.value / total) * 100).toFixed(1)}%)`);

    return `Total value (approx): ${total.toFixed(2)}\nHoldings:\n${lines.join('\n')}`;
}

function buildRiskSnapshot(holdings: { symbol: string; name: string; quantity: number; avgPrice: number; type: string }[]): string {
    const typeMix: Record<string, number> = {};
    holdings.forEach((h) => {
        typeMix[h.type] = (typeMix[h.type] || 0) + 1;
    });
    const typeText = Object.entries(typeMix)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

    const types = Object.keys(typeMix);
    const hasCrypto = types.includes('crypto');
    const hasSingle = holdings.length === 1;
    const concentration = holdings.length > 0
        ? Math.max(...holdings.map((h) => h.quantity * h.avgPrice)) /
          holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0)
        : 0;

    return `Asset mix: ${typeText || 'none'}\nTop holding concentration: ${(concentration * 100).toFixed(1)}%\n${hasCrypto ? 'Includes crypto (high volatility risk)' : ''}\n${hasSingle ? 'Single-stock portfolio (extreme concentration)' : ''}`.trim();
}

export async function POST(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const auth = getAdminAuth();
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!auth || !idToken) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    let uid: string;
    try {
        uid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid session token' }, { status: 401 });
    }

    try {
        const { mode, question } = await request.json();
        const callMode: 'debate' | 'review' = mode === 'review' ? 'review' : 'debate';

        const holdingsResult = await getServerHoldings(uid);
        const holdings = holdingsResult.success && holdingsResult.data ? holdingsResult.data : [];
        const spending = await buildFinancialContextString({ uid });

        let result;
        if (callMode === 'review') {
            result = await councilAgent.reviewPortfolio({
                holdings: buildHoldingsSnapshot(holdings),
                riskSnapshot: buildRiskSnapshot(holdings),
                spendingSnapshot: spending,
            });
        } else {
            const questionText = String(question || '').trim();
            if (!questionText) {
                return NextResponse.json({ success: false, error: 'Question required for debate mode' }, { status: 400 });
            }
            result = await councilAgent.debate({
                question: questionText,
                context: `PORTFOLIO:\n${buildHoldingsSnapshot(holdings)}\n\n${spending}`.trim(),
            });
        }

        return NextResponse.json(result.success ? { success: true, data: result.data } : { success: false, error: result.error }, {
            status: result.success ? 200 : 502,
        });
    } catch (error: unknown) {
        console.error('Council API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Council session failed',
        }, { status: 500 });
    }
}