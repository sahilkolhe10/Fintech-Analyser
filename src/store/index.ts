// Global State Management with Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from 'firebase/auth';
import { Holding, UserProfile } from '@/lib/firebase/firestore';
import { StockQuote } from '@/services/market';

// Auth Store
interface AuthState {
    user: User | null;
    profile: UserProfile | null;
    isLoading: boolean;
    setUser: (user: User | null) => void;
    setProfile: (profile: UserProfile | null) => void;
    setLoading: (loading: boolean) => void;
    reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    profile: null,
    isLoading: true,
    setUser: (user) => set({ user }),
    setProfile: (profile) => set({ profile }),
    setLoading: (isLoading) => set({ isLoading }),
    reset: () => set({ user: null, profile: null, isLoading: false }),
}));

// Portfolio Store
interface PortfolioState {
    holdings: Holding[];
    quotes: Map<string, StockQuote>;
    totalValue: number;
    isLoading: boolean;
    setHoldings: (holdings: Holding[]) => void;
    setQuotes: (quotes: Map<string, StockQuote>) => void;
    setTotalValue: (value: number) => void;
    setLoading: (loading: boolean) => void;
    addHolding: (holding: Holding) => void;
    removeHolding: (id: string) => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
    holdings: [],
    quotes: new Map(),
    totalValue: 0,
    isLoading: true,
    setHoldings: (holdings) => set({ holdings }),
    setQuotes: (quotes) => set({ quotes }),
    setTotalValue: (totalValue) => set({ totalValue }),
    setLoading: (isLoading) => set({ isLoading }),
    addHolding: (holding) => set((state) => ({ holdings: [...state.holdings, holding] })),
    removeHolding: (id) => set((state) => ({ holdings: state.holdings.filter((h) => h.id !== id) })),
}));

// Currency Store with persistence
interface CurrencyState {
    currency: 'INR' | 'USD';
    exchangeRate: number;
    setCurrency: (currency: 'INR' | 'USD') => void;
    setExchangeRate: (rate: number) => void;
    convert: (amount: number, from: 'INR' | 'USD') => number;
}

export const useCurrencyStore = create<CurrencyState>()(
    persist(
        (set, get) => ({
            currency: 'INR',
            exchangeRate: 83.5,
            setCurrency: (currency) => set({ currency }),
            setExchangeRate: (exchangeRate) => set({ exchangeRate }),
            convert: (amount, from) => {
                const { currency, exchangeRate } = get();
                if (from === currency) return amount;
                return from === 'USD' ? amount * exchangeRate : amount / exchangeRate;
            },
        }),
        { name: 'finmanage-currency' }
    )
);

// Theme Store
interface ThemeState {
    theme: 'dark' | 'light';
    toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            theme: 'dark',
            toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
        }),
        { name: 'finmanage-theme' }
    )
);

// UI Store for modals, sidebars, etc
interface UIState {
    sidebarOpen: boolean;
    activeModal: string | null;
    toggleSidebar: () => void;
    openModal: (modalId: string) => void;
    closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    sidebarOpen: true,
    activeModal: null,
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    openModal: (modalId) => set({ activeModal: modalId }),
    closeModal: () => set({ activeModal: null }),
}));
