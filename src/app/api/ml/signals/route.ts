import { NextRequest, NextResponse } from 'next/server';

// Proxies to the ML service (ml/). ML_SERVICE_URL is server-only — never expose it.
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || '';

const VALID_KINDS = new Set(['nifty500', 'crypto', 'nifty500/history']);

export async function GET(request: NextRequest) {
    const kind = request.nextUrl.searchParams.get('kind') || 'nifty500';
    const symbol = (request.nextUrl.searchParams.get('symbol') || '').trim();
    const days = request.nextUrl.searchParams.get('days') || '';

    if (!VALID_KINDS.has(kind) || !symbol) {
        return NextResponse.json({ success: false, error: 'kind and symbol are required' }, { status: 400 });
    }
    if (!ML_SERVICE_URL) {
        return NextResponse.json({
            success: false,
            error: 'ML service not configured. Deploy ml/ (see ml/README.md) and set ML_SERVICE_URL.',
        }, { status: 503 });
    }

    try {
        const target = new URL(`/signals/${kind}`, ML_SERVICE_URL);
        target.searchParams.set('symbol', symbol);
        if (kind === 'nifty500/history' && days) target.searchParams.set('days', days);

        const res = await fetch(target, {
            signal: AbortSignal.timeout(15_000),
            headers: { Accept: 'application/json' },
        });

        const body = await res.json();
        if (!res.ok) {
            const detail = typeof body?.detail === 'string' ? body.detail : `ML service error (${res.status})`;
            return NextResponse.json({ success: false, error: detail }, { status: res.status });
        }
        return NextResponse.json({ success: true, data: body });
    } catch (error: unknown) {
        const message = error instanceof Error && error.name === 'TimeoutError'
            ? 'ML service timed out'
            : 'ML service unreachable';
        return NextResponse.json({ success: false, error: message }, { status: 502 });
    }
}