// Alpha Vantage API Service for KhataHouse
// Provides additional data: technical indicators, forex, and fundamentals
// API key loaded from environment variables

import axios, { AxiosInstance } from 'axios';

// ============================================
// Types
// ============================================

export interface ForexRate {
    fromCurrency: string;
    toCurrency: string;
    exchangeRate: number;
    lastUpdated: Date;
}

export interface TechnicalIndicator {
    date: Date;
    value: number;
}

export interface CompanyOverview {
    symbol: string;
    name: string;
    description: string;
    exchange: string;
    currency: string;
    sector: string;
    industry: string;
    marketCap: number;
    peRatio: number;
    pegRatio: number;
    bookValue: number;
    dividendYield: number;
    eps: number;
    revenuePerShare: number;
    profitMargin: number;
    operatingMargin: number;
    returnOnAssets: number;
    returnOnEquity: number;
    revenue: number;
    grossProfit: number;
    ebitda: number;
    week52High: number;
    week52Low: number;
    day50MovingAverage: number;
    day200MovingAverage: number;
    sharesOutstanding: number;
    beta: number;
}

export interface GlobalQuote {
    symbol: string;
    open: number;
    high: number;
    low: number;
    price: number;
    volume: number;
    latestTradingDay: string;
    previousClose: number;
    change: number;
    changePercent: number;
}

// ============================================
// Alpha Vantage API Client
// ============================================

class AlphaVantageService {
    private client: AxiosInstance;
    private baseUrl: string = 'https://www.alphavantage.co/query';
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
        this.client = axios.create({
            baseURL: this.baseUrl,
        });
    }

    // Check if API key is configured
    private isConfigured(): boolean {
        if (!this.apiKey) {
            console.warn('Alpha Vantage: API key not configured');
            return false;
        }
        return true;
    }

    // Set API key (for runtime configuration)
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }

    // Get forex exchange rate (e.g., USD to INR)
    async getForexRate(fromCurrency: string, toCurrency: string): Promise<ForexRate | null> {
        if (!this.isConfigured()) return null;

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'CURRENCY_EXCHANGE_RATE',
                    from_currency: fromCurrency,
                    to_currency: toCurrency,
                    apikey: this.apiKey,
                },
            });

            const data = response.data?.['Realtime Currency Exchange Rate'];
            if (!data) return null;

            return {
                fromCurrency: data['1. From_Currency Code'],
                toCurrency: data['3. To_Currency Code'],
                exchangeRate: parseFloat(data['5. Exchange Rate']),
                lastUpdated: new Date(data['6. Last Refreshed']),
            };
        } catch (error) {
            console.error('Alpha Vantage: Error fetching forex rate:', error);
            return null;
        }
    }

    // Get global quote for a stock
    async getGlobalQuote(symbol: string): Promise<GlobalQuote | null> {
        if (!this.isConfigured()) return null;

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'GLOBAL_QUOTE',
                    symbol,
                    apikey: this.apiKey,
                },
            });

            const data = response.data?.['Global Quote'];
            if (!data || Object.keys(data).length === 0) return null;

            return {
                symbol: data['01. symbol'],
                open: parseFloat(data['02. open']),
                high: parseFloat(data['03. high']),
                low: parseFloat(data['04. low']),
                price: parseFloat(data['05. price']),
                volume: parseInt(data['06. volume']),
                latestTradingDay: data['07. latest trading day'],
                previousClose: parseFloat(data['08. previous close']),
                change: parseFloat(data['09. change']),
                changePercent: parseFloat(data['10. change percent'].replace('%', '')),
            };
        } catch (error) {
            console.error('Alpha Vantage: Error fetching global quote:', error);
            return null;
        }
    }

    // Get company overview (fundamentals)
    async getCompanyOverview(symbol: string): Promise<CompanyOverview | null> {
        if (!this.isConfigured()) return null;

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'OVERVIEW',
                    symbol,
                    apikey: this.apiKey,
                },
            });

            const data = response.data;
            if (!data || !data.Symbol) return null;

            return {
                symbol: data.Symbol,
                name: data.Name,
                description: data.Description,
                exchange: data.Exchange,
                currency: data.Currency,
                sector: data.Sector,
                industry: data.Industry,
                marketCap: parseFloat(data.MarketCapitalization) || 0,
                peRatio: parseFloat(data.PERatio) || 0,
                pegRatio: parseFloat(data.PEGRatio) || 0,
                bookValue: parseFloat(data.BookValue) || 0,
                dividendYield: parseFloat(data.DividendYield) || 0,
                eps: parseFloat(data.EPS) || 0,
                revenuePerShare: parseFloat(data.RevenuePerShareTTM) || 0,
                profitMargin: parseFloat(data.ProfitMargin) || 0,
                operatingMargin: parseFloat(data.OperatingMarginTTM) || 0,
                returnOnAssets: parseFloat(data.ReturnOnAssetsTTM) || 0,
                returnOnEquity: parseFloat(data.ReturnOnEquityTTM) || 0,
                revenue: parseFloat(data.RevenueTTM) || 0,
                grossProfit: parseFloat(data.GrossProfitTTM) || 0,
                ebitda: parseFloat(data.EBITDA) || 0,
                week52High: parseFloat(data['52WeekHigh']) || 0,
                week52Low: parseFloat(data['52WeekLow']) || 0,
                day50MovingAverage: parseFloat(data['50DayMovingAverage']) || 0,
                day200MovingAverage: parseFloat(data['200DayMovingAverage']) || 0,
                sharesOutstanding: parseFloat(data.SharesOutstanding) || 0,
                beta: parseFloat(data.Beta) || 0,
            };
        } catch (error) {
            console.error('Alpha Vantage: Error fetching company overview:', error);
            return null;
        }
    }

    // Get RSI (Relative Strength Index)
    async getRSI(
        symbol: string,
        interval: 'daily' | 'weekly' | 'monthly' = 'daily',
        timePeriod: number = 14
    ): Promise<TechnicalIndicator[]> {
        if (!this.isConfigured()) return [];

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'RSI',
                    symbol,
                    interval,
                    time_period: timePeriod,
                    series_type: 'close',
                    apikey: this.apiKey,
                },
            });

            const data = response.data?.['Technical Analysis: RSI'];
            if (!data) return [];

            return Object.entries(data)
                .slice(0, 100)
                .map(([date, values]) => ({
                    date: new Date(date),
                    value: parseFloat((values as { RSI: string }).RSI),
                }));
        } catch (error) {
            console.error('Alpha Vantage: Error fetching RSI:', error);
            return [];
        }
    }

    // Get MACD
    async getMACD(
        symbol: string,
        interval: 'daily' | 'weekly' | 'monthly' = 'daily'
    ): Promise<{ date: Date; macd: number; signal: number; histogram: number }[]> {
        if (!this.isConfigured()) return [];

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'MACD',
                    symbol,
                    interval,
                    series_type: 'close',
                    apikey: this.apiKey,
                },
            });

            const data = response.data?.['Technical Analysis: MACD'];
            if (!data) return [];

            return Object.entries(data)
                .slice(0, 100)
                .map(([date, values]) => {
                    const v = values as { [key: string]: string };
                    return {
                        date: new Date(date),
                        macd: parseFloat(v['MACD']),
                        signal: parseFloat(v['MACD_Signal']),
                        histogram: parseFloat(v['MACD_Hist']),
                    };
                });
        } catch (error) {
            console.error('Alpha Vantage: Error fetching MACD:', error);
            return [];
        }
    }

    // Get SMA (Simple Moving Average)
    async getSMA(
        symbol: string,
        interval: 'daily' | 'weekly' | 'monthly' = 'daily',
        timePeriod: number = 50
    ): Promise<TechnicalIndicator[]> {
        if (!this.isConfigured()) return [];

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'SMA',
                    symbol,
                    interval,
                    time_period: timePeriod,
                    series_type: 'close',
                    apikey: this.apiKey,
                },
            });

            const data = response.data?.['Technical Analysis: SMA'];
            if (!data) return [];

            return Object.entries(data)
                .slice(0, 100)
                .map(([date, values]) => ({
                    date: new Date(date),
                    value: parseFloat((values as { SMA: string }).SMA),
                }));
        } catch (error) {
            console.error('Alpha Vantage: Error fetching SMA:', error);
            return [];
        }
    }

    // Get Bollinger Bands
    async getBollingerBands(
        symbol: string,
        interval: 'daily' | 'weekly' | 'monthly' = 'daily'
    ): Promise<{ date: Date; upper: number; middle: number; lower: number }[]> {
        if (!this.isConfigured()) return [];

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'BBANDS',
                    symbol,
                    interval,
                    time_period: 20,
                    series_type: 'close',
                    nbdevup: 2,
                    nbdevdn: 2,
                    apikey: this.apiKey,
                },
            });

            const data = response.data?.['Technical Analysis: BBANDS'];
            if (!data) return [];

            return Object.entries(data)
                .slice(0, 100)
                .map(([date, values]) => {
                    const v = values as { [key: string]: string };
                    return {
                        date: new Date(date),
                        upper: parseFloat(v['Real Upper Band']),
                        middle: parseFloat(v['Real Middle Band']),
                        lower: parseFloat(v['Real Lower Band']),
                    };
                });
        } catch (error) {
            console.error('Alpha Vantage: Error fetching Bollinger Bands:', error);
            return [];
        }
    }

    // Symbol search
    async searchSymbol(keywords: string): Promise<SearchResult[]> {
        if (!this.isConfigured()) return [];

        try {
            const response = await this.client.get('', {
                params: {
                    function: 'SYMBOL_SEARCH',
                    keywords,
                    apikey: this.apiKey,
                },
            });

            const matches = response.data?.bestMatches || [];

            return matches.map((m: Record<string, string>) => ({
                symbol: m['1. symbol'],
                name: m['2. name'],
                type: m['3. type'],
                region: m['4. region'],
                currency: m['8. currency'],
                matchScore: parseFloat(m['9. matchScore']),
            }));
        } catch (error) {
            console.error('Alpha Vantage: Error searching symbols:', error);
            return [];
        }
    }
}

interface SearchResult {
    symbol: string;
    name: string;
    type: string;
    region: string;
    currency: string;
    matchScore: number;
}

// Export singleton instance
export const alphaVantage = new AlphaVantageService();
