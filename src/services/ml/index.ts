// ML signals service client (types + helpers shared by UI and API route).

export type SignalMarket = 'nifty500' | 'crypto';

export interface MlSignal {
    symbol: string;
    market: SignalMarket;
    direction: string;
    probability: number;
    probabilities: Record<string, number>;
    price: number;
    time: string;
    model?: string;
    bars?: number;
}

export interface NiftySignalHistory {
    symbol: string;
    market: 'nifty500';
    bars: number;
    counts: { HOLD: number; BUY: number; SHORT: number };
    avg_probability: { HOLD: number; BUY: number; SHORT: number };
    last: MlSignal;
}

export interface MlResult<T = MlSignal> {
    success: boolean;
    data?: T;
    error?: string;
}

const DEFAULT_SYMBOLS: Record<SignalMarket, string> = {
    nifty500: 'RELIANCE',
    crypto: 'BTC-USD',
};

export const mlSymbolOptions: Record<SignalMarket, string[]> = {
    nifty500: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'LT', 'BHARTIARTL'],
    crypto: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'DOGE-USD'],
};

export { DEFAULT_SYMBOLS };

export const fetchMlSignal = async (market: SignalMarket, symbol: string): Promise<MlResult> => {
    try {
        const res = await fetch(`/api/ml/signals?kind=${market}&symbol=${encodeURIComponent(symbol)}`, {
            cache: 'no-store',
        });
        const json = await res.json();
        return json as MlResult;
    } catch {
        return { success: false, error: 'ML service unreachable' };
    }
};

export const fetchMlHistory = async (symbol: string, days = 2): Promise<MlResult<NiftySignalHistory>> => {
    try {
        const res = await fetch(`/api/ml/signals?kind=nifty500/history&symbol=${encodeURIComponent(symbol)}&days=${days}`, {
            cache: 'no-store',
        });
        const json = await res.json();
        return json as MlResult<NiftySignalHistory>;
    } catch {
        return { success: false, error: 'ML service unreachable' };
    }
};