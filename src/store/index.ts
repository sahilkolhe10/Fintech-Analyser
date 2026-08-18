// Global State Management with Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from 'firebase/auth';
import { Holding, UserProfile } from '@/lib/firebase/firestore';
import { StockQuote } from '@/services/market';
import { DemoUser } from '@/services/demo';

// AppUser — a real Firebase user or the local demo user
export type AppUser = User | DemoUser;

// Auth Store — persisted so a demo session survives page reloads.
// Note: only the demo user is persisted; real Firebase sessions are
// re-established by onAuthStateChanged.
interface AuthState {
    user: AppUser | null;
    profile: UserProfile | null;
    isLoading: boolean;
    setUser: (user: AppUser | null) => void;
    setProfile: (profile: UserProfile | null) => void;
    setLoading: (loading: boolean) => void;
    reset: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            profile: null,
            isLoading: true,
            setUser: (user) => set({ user }),
            setProfile: (profile) => set({ profile }),
            setLoading: (isLoading) => set({ isLoading }),
            reset: () => set({ user: null, profile: null, isLoading: false }),
        }),
        {
            name: 'finmanage-auth',
            partialize: (state) => ({
                user: state.user && 'isDemo' in state.user && state.user.isDemo ? state.user : null,
                profile: state.user && 'isDemo' in state.user && state.user.isDemo ? state.profile : null,
            }),
        }
    )
);

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

export const usePortfolioStore = create<PortfolioState>((set) => ({
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

// Currency Store — INR only (FinManage is an Indian fintech app).
interface CurrencyState {
    currency: 'INR';
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
            // INR is the only supported currency; ignore USD requests.
            setCurrency: () => set({ currency: 'INR' }),
            setExchangeRate: (exchangeRate) => set({ exchangeRate }),
            convert: (amount, from) => {
                const { exchangeRate } = get();
                return from === 'USD' ? amount * exchangeRate : amount;
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
