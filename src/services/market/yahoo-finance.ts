// Yahoo Finance API Service for FinManage
// Provides real-time stock data, historical prices, and company info
// Supports both Indian (NSE, BSE) and US markets

import axios, { AxiosInstance } from 'axios';

// ============================================
// Types
// ============================================

export interface StockQuote {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    previousClose: number;
    open: number;
    dayHigh: number;
    dayLow: number;
    volume: number;
    marketCap?: number;
    peRatio?: number;
    week52High?: number;
    week52Low?: number;
    exchange: string;
    currency: string;
    lastUpdated: Date;
}

export interface HistoricalPrice {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjustedClose: number;
}

export interface MarketIndex {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    lastUpdated: Date;
}

export interface SearchResult {
    symbol: string;
    name: string;
    exchange: string;
    type: string;
}

// ============================================
// Yahoo Finance API Client
// ============================================

class YahooFinanceService {
    private client: AxiosInstance;
    private baseUrl: string = 'https://query1.finance.yahoo.com';
    private searchUrl: string = 'https://query2.finance.yahoo.com';

    constructor() {
        this.client = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });
    }

    // Format symbol for exchange (e.g., RELIANCE.NS for NSE, TCS.BO for BSE)
    private formatSymbol(symbol: string, exchange?: string): string {
        const upperSymbol = symbol.toUpperCase();

        // Already formatted
        if (upperSymbol.includes('.')) return upperSymbol;

        // Add exchange suffix for Indian stocks
        if (exchange === 'NSE') return `${upperSymbol}.NS`;
        if (exchange === 'BSE') return `${upperSymbol}.BO`;

        return upperSymbol;
    }

    // Get real-time stock quote
    async getQuote(symbol: string, exchange?: string): Promise<StockQuote | null> {
        try {
            const formattedSymbol = this.formatSymbol(symbol, exchange);
            const url = `${this.baseUrl}/v8/finance/chart/${formattedSymbol}`;

            const response = await this.client.get(url, {
                params: {
                    interval: '1d',
                    range: '1d',
                },
            });

            const result = response.data?.chart?.result?.[0];
            if (!result) return null;

            const meta = result.meta;
            const quote = result.indicators?.quote?.[0];
            const previousClose = meta.previousClose || meta.chartPreviousClose;
            const currentPrice = meta.regularMarketPrice;
            const change = currentPrice - previousClose;
            const changePercent = (change / previousClose) * 100;

            return {
                symbol: meta.symbol,
                name: meta.shortName || meta.longName || meta.symbol,
                price: currentPrice,
                change: Number(change.toFixed(2)),
                changePercent: Number(changePercent.toFixed(2)),
                previousClose,
                open: quote?.open?.[0] || meta.regularMarketOpen,
                dayHigh: meta.regularMarketDayHigh,
                dayLow: meta.regularMarketDayLow,
                volume: meta.regularMarketVolume,
                marketCap: meta.marketCap,
                week52High: meta.fiftyTwoWeekHigh,
                week52Low: meta.fiftyTwoWeekLow,
                exchange: meta.exchangeName || meta.exchange,
                currency: meta.currency,
                lastUpdated: new Date(meta.regularMarketTime * 1000),
            };
        } catch (error) {
            console.error(`Yahoo Finance: Error fetching quote for ${symbol}:`, error);
            return null;
        }
    }

    // Get multiple stock quotes
    async getQuotes(symbols: string[], exchange?: string): Promise<StockQuote[]> {
        const promises = symbols.map((symbol) => this.getQuote(symbol, exchange));
        const results = await Promise.all(promises);
        return results.filter((quote): quote is StockQuote => quote !== null);
    }

    // Get historical price data
    async getHistoricalData(
        symbol: string,
        range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '1mo',
        interval: '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo' = '1d',
        exchange?: string
    ): Promise<HistoricalPrice[]> {
        try {
            const formattedSymbol = this.formatSymbol(symbol, exchange);
            const url = `${this.baseUrl}/v8/finance/chart/${formattedSymbol}`;

            const response = await this.client.get(url, {
                params: {
                    interval,
                    range,
                    events: 'history',
                },
            });

            const result = response.data?.chart?.result?.[0];
            if (!result) return [];

            const timestamps = result.timestamp || [];
            const quote = result.indicators?.quote?.[0] || {};
            const adjClose = result.indicators?.adjclose?.[0]?.adjclose || [];

            const historicalData: HistoricalPrice[] = timestamps.map((timestamp: number, i: number) => ({
                date: new Date(timestamp * 1000),
                open: quote.open?.[i] || 0,
                high: quote.high?.[i] || 0,
                low: quote.low?.[i] || 0,
                close: quote.close?.[i] || 0,
                volume: quote.volume?.[i] || 0,
                adjustedClose: adjClose[i] || quote.close?.[i] || 0,
            }));

            return historicalData.filter((d) => d.close > 0);
        } catch (error) {
            console.error(`Yahoo Finance: Error fetching historical data for ${symbol}:`, error);
            return [];
        }
    }

    // Search for stocks
    async searchStocks(query: string): Promise<SearchResult[]> {
        // If client-side, use the API proxy to avoid CORS
        if (typeof window !== 'undefined') {
            try {
                const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) return [];
                const data = await res.json();
                return data.results || [];
            } catch (error) {
                console.error('Client Search Error:', error);
                return [];
            }
        }

        // Server-side: call directly
        try {
            const url = `${this.searchUrl}/v1/finance/search`;
            const response = await this.client.get(url, {
                params: {
                    q: query,
                    quotesCount: 10,
                    newsCount: 0,
                    enableFuzzyQuery: true,
                    quotesQueryId: 'tss_match_phrase_query',
                },
            });

            const quotes = response.data?.quotes || [];

            return quotes.map((q: { symbol: string; shortname: string; longname: string; exchange: string; quoteType: string }) => ({
                symbol: q.symbol,
                name: q.shortname || q.longname || q.symbol,
                exchange: q.exchange,
                type: q.quoteType,
            }));
        } catch (error) {
            console.error('Yahoo Finance: Error searching stocks:', error);
            return [];
        }
    }

    // Get market indices
    async getMarketIndices(): Promise<MarketIndex[]> {
        const indexSymbols = [
            '^NSEI',   // NIFTY 50
            '^BSESN',  // SENSEX
            '^GSPC',   // S&P 500
            '^DJI',    // Dow Jones
            '^IXIC',   // NASDAQ
        ];

        const indices: MarketIndex[] = [];

        for (const symbol of indexSymbols) {
            const quote = await this.getQuote(symbol);
            if (quote) {
                indices.push({
                    symbol: quote.symbol,
                    name: quote.name,
                    price: quote.price,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    lastUpdated: quote.lastUpdated,
                });
            }
        }

        return indices;
    }

    // Get trending stocks
    async getTrendingStocks(region: 'IN' | 'US' = 'IN'): Promise<string[]> {
        try {
            const url = `${this.baseUrl}/v1/finance/trending/${region}`;
            const response = await this.client.get(url, {
                params: { count: 10 },
            });

            const quotes = response.data?.finance?.result?.[0]?.quotes || [];
            return quotes.map((q: { symbol: string }) => q.symbol);
        } catch (error) {
            console.error('Yahoo Finance: Error fetching trending stocks:', error);
            return [];
        }
    }

    // Get stock news
    async getStockNews(symbol: string, count: number = 10): Promise<{ title: string; link: string; pubDate: string; source: string }[]> {
        try {
            const url = `${this.searchUrl}/v1/finance/search`;
            const response = await this.client.get(url, {
                params: {
                    q: symbol,
                    quotesCount: 0,
                    newsCount: count,
                },
            });

            const news = response.data?.news || [];
            return news.map((n: { title: string; link: string; providerPublishTime: number; publisher: string }) => ({
                title: n.title,
                link: n.link,
                pubDate: new Date(n.providerPublishTime * 1000).toISOString(),
                source: n.publisher,
            }));
        } catch (error) {
            console.error('Yahoo Finance: Error fetching news:', error);
            return [];
        }
    }
}

// Export singleton instance
export const yahooFinance = new YahooFinanceService();
