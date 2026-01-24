// Holdings Service - Firestore operations for portfolio holdings
import {
    collection,
    doc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    Timestamp,
    getDoc,
    setDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// Types
export interface Holding {
    id?: string;
    userId: string;
    symbol: string;
    name: string;
    quantity: number;
    buyPrice: number;
    buyDate: Timestamp;
    createdAt: Timestamp;
}

export interface StockQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
}

export interface WatchlistItem {
    symbol: string;
    name: string;
    sector?: string;
}

// Popular Nifty 250 stocks for default watchlist
export const NIFTY_POPULAR_STOCKS: WatchlistItem[] = [
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries', sector: 'Energy' },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'IT' },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', sector: 'Banking' },
    { symbol: 'INFY.NS', name: 'Infosys', sector: 'IT' },
    { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', sector: 'Banking' },
    { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', sector: 'FMCG' },
    { symbol: 'SBIN.NS', name: 'State Bank of India', sector: 'Banking' },
    { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', sector: 'Telecom' },
    { symbol: 'ITC.NS', name: 'ITC Limited', sector: 'FMCG' },
    { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', sector: 'Banking' },
    { symbol: 'LT.NS', name: 'Larsen & Toubro', sector: 'Infrastructure' },
    { symbol: 'AXISBANK.NS', name: 'Axis Bank', sector: 'Banking' },
    { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance', sector: 'Finance' },
    { symbol: 'ASIANPAINT.NS', name: 'Asian Paints', sector: 'Paints' },
    { symbol: 'MARUTI.NS', name: 'Maruti Suzuki', sector: 'Auto' },
    { symbol: 'TITAN.NS', name: 'Titan Company', sector: 'Consumer' },
    { symbol: 'SUNPHARMA.NS', name: 'Sun Pharma', sector: 'Pharma' },
    { symbol: 'WIPRO.NS', name: 'Wipro', sector: 'IT' },
    { symbol: 'ULTRACEMCO.NS', name: 'UltraTech Cement', sector: 'Cement' },
    { symbol: 'NESTLEIND.NS', name: 'Nestle India', sector: 'FMCG' },
];

// Top monthly gainers (static data - updated periodically)
export const MONTHLY_GAINERS = [
    { symbol: 'TATAPOWER.NS', name: 'Tata Power', change: 18.5, price: 425 },
    { symbol: 'ADANIGREEN.NS', name: 'Adani Green', change: 15.2, price: 1850 },
    { symbol: 'ZOMATO.NS', name: 'Zomato', change: 14.8, price: 195 },
    { symbol: 'IRFC.NS', name: 'IRFC', change: 12.3, price: 168 },
    { symbol: 'JIOFIN.NS', name: 'Jio Financial', change: 11.5, price: 345 },
    { symbol: 'RECLTD.NS', name: 'REC Limited', change: 10.8, price: 520 },
    { symbol: 'PFC.NS', name: 'Power Finance Corp', change: 9.5, price: 475 },
    { symbol: 'NHPC.NS', name: 'NHPC', change: 8.7, price: 92 },
];

// News with sentiment (static data - would be from API in production)
export interface StockNews {
    id: string;
    symbol: string;
    headline: string;
    source: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    time: string;
}

export const STOCK_NEWS: StockNews[] = [
    { id: '1', symbol: 'RELIANCE.NS', headline: 'Reliance Jio adds 5.8M users in December, highest in telecom sector', source: 'Moneycontrol', sentiment: 'bullish', time: '2h ago' },
    { id: '2', symbol: 'TCS.NS', headline: 'TCS bags $1.5B deal from UK-based insurance firm', source: 'Economic Times', sentiment: 'bullish', time: '4h ago' },
    { id: '3', symbol: 'HDFCBANK.NS', headline: 'HDFC Bank Q3 results beat estimates, NII up 24%', source: 'Moneycontrol', sentiment: 'bullish', time: '6h ago' },
    { id: '4', symbol: 'INFY.NS', headline: 'Infosys revises FY24 guidance downward amid macro headwinds', source: 'Business Standard', sentiment: 'bearish', time: '8h ago' },
    { id: '5', symbol: 'BHARTIARTL.NS', headline: 'Bharti Airtel to raise tariffs by 10-15% from February', source: 'LiveMint', sentiment: 'bullish', time: '12h ago' },
    { id: '6', symbol: 'ITC.NS', headline: 'ITC hotels demerger to unlock shareholder value: Analysts', source: 'CNBC-TV18', sentiment: 'bullish', time: '1d ago' },
    { id: '7', symbol: 'SBIN.NS', headline: 'SBI plans to raise Rs 10,000 crore via bonds', source: 'Reuters', sentiment: 'neutral', time: '1d ago' },
    { id: '8', symbol: 'TATAMOTORS.NS', headline: 'Tata Motors EV sales cross 50,000 units in FY24', source: 'Trendlyne', sentiment: 'bullish', time: '2d ago' },
];

// Helper to generate TradingView URL
export const getTradingViewUrl = (symbol: string): string => {
    // Convert symbol format: RELIANCE.NS -> NSE:RELIANCE
    const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '');
    const exchange = symbol.includes('.BO') ? 'BSE' : 'NSE';
    return `https://www.tradingview.com/chart/?symbol=${exchange}:${cleanSymbol}`;
};

// Holdings CRUD Operations
export const addHolding = async (holding: Omit<Holding, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
        const docRef = await addDoc(collection(db, 'holdings'), {
            ...holding,
            createdAt: Timestamp.now(),
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error adding holding:', error);
        return { success: false, error: 'Failed to add holding' };
    }
};

export const getHoldings = async (userId: string): Promise<{ success: boolean; data?: Holding[]; error?: string }> => {
    try {
        const q = query(
            collection(db, 'holdings'),
            where('userId', '==', userId)
        );
        const querySnapshot = await getDocs(q);
        const holdings: Holding[] = [];
        querySnapshot.forEach((doc) => {
            holdings.push({ id: doc.id, ...doc.data() } as Holding);
        });
        return { success: true, data: holdings };
    } catch (error) {
        console.error('Error getting holdings:', error);
        return { success: false, error: 'Failed to get holdings' };
    }
};

export const updateHolding = async (
    holdingId: string,
    updates: Partial<Holding>
): Promise<{ success: boolean; error?: string }> => {
    try {
        await updateDoc(doc(db, 'holdings', holdingId), updates);
        return { success: true };
    } catch (error) {
        console.error('Error updating holding:', error);
        return { success: false, error: 'Failed to update holding' };
    }
};

export const deleteHolding = async (holdingId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        await deleteDoc(doc(db, 'holdings', holdingId));
        return { success: true };
    } catch (error) {
        console.error('Error deleting holding:', error);
        return { success: false, error: 'Failed to delete holding' };
    }
};

// Watchlist Operations
export const getWatchlist = async (userId: string): Promise<{ success: boolean; data?: WatchlistItem[]; error?: string }> => {
    try {
        const docRef = doc(db, 'watchlists', userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { success: true, data: docSnap.data().stocks as WatchlistItem[] };
        }
        // Return default watchlist for new users
        return { success: true, data: NIFTY_POPULAR_STOCKS.slice(0, 10) };
    } catch (error) {
        console.error('Error getting watchlist:', error);
        return { success: false, error: 'Failed to get watchlist' };
    }
};

export const saveWatchlist = async (
    userId: string,
    stocks: WatchlistItem[]
): Promise<{ success: boolean; error?: string }> => {
    try {
        await setDoc(doc(db, 'watchlists', userId), { stocks, updatedAt: Timestamp.now() });
        return { success: true };
    } catch (error) {
        console.error('Error saving watchlist:', error);
        return { success: false, error: 'Failed to save watchlist' };
    }
};

// Calculate portfolio totals
export const calculatePortfolioTotals = (
    holdings: Holding[],
    currentPrices: Map<string, number>
): { totalValue: number; totalCost: number; totalPnL: number; pnlPercent: number } => {
    let totalValue = 0;
    let totalCost = 0;

    holdings.forEach(h => {
        const currentPrice = currentPrices.get(h.symbol) || h.buyPrice;
        totalValue += h.quantity * currentPrice;
        totalCost += h.quantity * h.buyPrice;
    });

    const totalPnL = totalValue - totalCost;
    const pnlPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    return { totalValue, totalCost, totalPnL, pnlPercent };
};
