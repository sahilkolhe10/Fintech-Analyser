// Unified Market Data Service for KhataHouse
// Combines Yahoo Finance and Alpha Vantage with intelligent caching and routing

import { yahooFinance, StockQuote, HistoricalPrice, MarketIndex } from './yahoo-finance';
import { alphaVantage, ForexRate, CompanyOverview } from './alpha-vantage';

// ============================================
// Cache Implementation
// ============================================

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

class DataCache {
    private cache: Map<string, CacheEntry<unknown>> = new Map();

    set<T>(key: string, data: T, ttlSeconds: number = 60): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlSeconds * 1000,
        });
    }

    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    clear(): void {
        this.cache.clear();
    }

    delete(key: string): void {
        this.cache.delete(key);
    }
}

const cache = new DataCache();

// ============================================
// Cache TTL Configuration (in seconds)
// ============================================

const CACHE_TTL = {
    QUOTE: 30,           // 30 seconds for real-time quotes
    HISTORICAL: 300,     // 5 minutes for historical data
    FOREX: 60,           // 1 minute for forex rates
    FUNDAMENTALS: 3600,  // 1 hour for company fundamentals
    INDICES: 30,         // 30 seconds for market indices
    SEARCH: 600,         // 10 minutes for search results
    NEWS: 300,           // 5 minutes for news
};

// ============================================
// Unified Market Service
// ============================================

class UnifiedMarketService {
    private usdToInrRate: number = 83.5; // Default fallback rate
    private lastForexUpdate: Date | null = null;

    // Get stock quote with caching
    async getQuote(symbol: string, exchange?: 'NSE' | 'BSE' | 'US'): Promise<StockQuote | null> {
        const cacheKey = `quote:${symbol}:${exchange || 'auto'}`;
        const cached = cache.get<StockQuote>(cacheKey);
        if (cached) return cached;

        const quote = await yahooFinance.getQuote(symbol, exchange);
        if (quote) {
            cache.set(cacheKey, quote, CACHE_TTL.QUOTE);
        }
        return quote;
    }

    // Get multiple quotes
    async getQuotes(symbols: string[], exchange?: 'NSE' | 'BSE' | 'US'): Promise<StockQuote[]> {
        const results: StockQuote[] = [];
        const uncached: string[] = [];

        // Check cache first
        for (const symbol of symbols) {
            const cacheKey = `quote:${symbol}:${exchange || 'auto'}`;
            const cached = cache.get<StockQuote>(cacheKey);
            if (cached) {
                results.push(cached);
            } else {
                uncached.push(symbol);
            }
        }

        // Fetch uncached quotes
        if (uncached.length > 0) {
            const freshQuotes = await yahooFinance.getQuotes(uncached, exchange);
            for (const quote of freshQuotes) {
                const cacheKey = `quote:${quote.symbol}:${exchange || 'auto'}`;
                cache.set(cacheKey, quote, CACHE_TTL.QUOTE);
                results.push(quote);
            }
        }

        return results;
    }

    // Get historical price data with caching
    async getHistoricalData(
        symbol: string,
        range: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' = '1mo',
        interval: '1m' | '5m' | '15m' | '1h' | '1d' | '1wk' | '1mo' = '1d',
        exchange?: 'NSE' | 'BSE' | 'US'
    ): Promise<HistoricalPrice[]> {
        const cacheKey = `history:${symbol}:${range}:${interval}:${exchange || 'auto'}`;
        const cached = cache.get<HistoricalPrice[]>(cacheKey);
        if (cached) return cached;

        const data = await yahooFinance.getHistoricalData(symbol, range, interval, exchange);
        if (data.length > 0) {
            cache.set(cacheKey, data, CACHE_TTL.HISTORICAL);
        }
        return data;
    }

    // Get market indices with caching
    async getMarketIndices(): Promise<MarketIndex[]> {
        const cacheKey = 'indices:all';
        const cached = cache.get<MarketIndex[]>(cacheKey);
        if (cached) return cached;

        const indices = await yahooFinance.getMarketIndices();
        if (indices.length > 0) {
            cache.set(cacheKey, indices, CACHE_TTL.INDICES);
        }
        return indices;
    }

    // Search stocks (combines both services)
    async searchStocks(query: string): Promise<{
        symbol: string;
        name: string;
        exchange: string;
        type: string;
    }[]> {
        const cacheKey = `search:${query.toLowerCase()}`;
        const cached = cache.get<{ symbol: string; name: string; exchange: string; type: string }[]>(cacheKey);
        if (cached) return cached;

        // Use Yahoo Finance for search (more comprehensive)
        const results = await yahooFinance.searchStocks(query);
        if (results.length > 0) {
            cache.set(cacheKey, results, CACHE_TTL.SEARCH);
        }
        return results;
    }

    // Get forex rate (USD/INR)
    async getForexRate(from: string = 'USD', to: string = 'INR'): Promise<ForexRate | null> {
        const cacheKey = `forex:${from}:${to}`;
        const cached = cache.get<ForexRate>(cacheKey);
        if (cached) return cached;

        const rate = await alphaVantage.getForexRate(from, to);
        if (rate) {
            cache.set(cacheKey, rate, CACHE_TTL.FOREX);
            if (from === 'USD' && to === 'INR') {
                this.usdToInrRate = rate.exchangeRate;
                this.lastForexUpdate = rate.lastUpdated;
            }
        }
        return rate;
    }

    // Convert currency
    async convertCurrency(amount: number, from: 'INR' | 'USD', to: 'INR' | 'USD'): Promise<number> {
        if (from === to) return amount;

        // Refresh forex rate if needed
        const forex = await this.getForexRate('USD', 'INR');
        const rate = forex?.exchangeRate || this.usdToInrRate;

        if (from === 'USD' && to === 'INR') {
            return amount * rate;
        } else {
            return amount / rate;
        }
    }

    // Get company fundamentals with caching
    async getCompanyOverview(symbol: string): Promise<CompanyOverview | null> {
        const cacheKey = `fundamentals:${symbol}`;
        const cached = cache.get<CompanyOverview>(cacheKey);
        if (cached) return cached;

        const overview = await alphaVantage.getCompanyOverview(symbol);
        if (overview) {
            cache.set(cacheKey, overview, CACHE_TTL.FUNDAMENTALS);
        }
        return overview;
    }

    // Get technical indicators
    async getTechnicalIndicators(symbol: string): Promise<{
        rsi: { date: Date; value: number }[];
        macd: { date: Date; macd: number; signal: number; histogram: number }[];
        sma50: { date: Date; value: number }[];
        sma200: { date: Date; value: number }[];
        bollingerBands: { date: Date; upper: number; middle: number; lower: number }[];
    }> {
        const [rsi, macd, sma50, sma200, bollingerBands] = await Promise.all([
            alphaVantage.getRSI(symbol),
            alphaVantage.getMACD(symbol),
            alphaVantage.getSMA(symbol, 'daily', 50),
            alphaVantage.getSMA(symbol, 'daily', 200),
            alphaVantage.getBollingerBands(symbol),
        ]);

        return { rsi, macd, sma50, sma200, bollingerBands };
    }

    // Get stock news
    async getStockNews(symbol: string, count: number = 10): Promise<{
        title: string;
        link: string;
        pubDate: string;
        source: string;
    }[]> {
        const cacheKey = `news:${symbol}:${count}`;
        const cached = cache.get<{ title: string; link: string; pubDate: string; source: string }[]>(cacheKey);
        if (cached) return cached;

        const news = await yahooFinance.getStockNews(symbol, count);
        if (news.length > 0) {
            cache.set(cacheKey, news, CACHE_TTL.NEWS);
        }
        return news;
    }

    // Get trending stocks
    async getTrendingStocks(region: 'IN' | 'US' = 'IN'): Promise<string[]> {
        return yahooFinance.getTrendingStocks(region);
    }

    // Clear all caches
    clearCache(): void {
        cache.clear();
    }
}

// Export singleton instance
export const marketService = new UnifiedMarketService();

// Export types from child services
export type { StockQuote, HistoricalPrice, MarketIndex } from './yahoo-finance';
export type { ForexRate, CompanyOverview, TechnicalIndicator } from './alpha-vantage';
