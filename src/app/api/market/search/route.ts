import { NextRequest, NextResponse } from 'next/server';
import { yahooFinance } from '@/services/market/yahoo-finance';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }

    try {
        const results = await yahooFinance.searchStocks(query);
        return NextResponse.json({ results });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
