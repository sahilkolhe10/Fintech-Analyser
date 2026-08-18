// Demo data — seeded Firestore-shaped records returned by the service
// functions when a local demo session is active (no Firebase backend).
// Kept in sync with the service types (expenses, holdings).

import { Timestamp } from 'firebase/firestore';

const now = Timestamp.now();
const daysAgo = (n: number): Timestamp =>
    Timestamp.fromDate(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

// ---- Expenses -----------------------------------------------------------

export interface DemoExpense {
    id: string;
    userId: string;
    amount: number;
    currency: 'INR' | 'USD';
    category: string;
    description: string;
    date: Timestamp;
    isRecurring: boolean;
    recurringFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    createdAt: Timestamp;
}

export const DEMO_EXPENSES: DemoExpense[] = [
    { id: 'demo-exp-1', userId: 'demo-user', amount: 4500, currency: 'INR', category: 'Housing', description: 'Monthly rent', date: daysAgo(2), isRecurring: true, recurringFrequency: 'monthly', createdAt: now },
    { id: 'demo-exp-2', userId: 'demo-user', amount: 1200, currency: 'INR', category: 'Food', description: 'Groceries — BigBasket', date: daysAgo(1), isRecurring: false, createdAt: now },
    { id: 'demo-exp-3', userId: 'demo-user', amount: 850, currency: 'INR', category: 'Transport', description: 'Fuel — Indian Oil', date: daysAgo(3), isRecurring: false, createdAt: now },
    { id: 'demo-exp-4', userId: 'demo-user', amount: 499, currency: 'INR', category: 'Entertainment', description: 'Netflix subscription', date: daysAgo(5), isRecurring: true, recurringFrequency: 'monthly', createdAt: now },
    { id: 'demo-exp-5', userId: 'demo-user', amount: 2200, currency: 'INR', category: 'Shopping', description: 'New running shoes', date: daysAgo(7), isRecurring: false, createdAt: now },
    { id: 'demo-exp-6', userId: 'demo-user', amount: 600, currency: 'INR', category: 'Health', description: 'Pharmacy — vitamins', date: daysAgo(9), isRecurring: false, createdAt: now },
    { id: 'demo-exp-7', userId: 'demo-user', amount: 1500, currency: 'INR', category: 'Utilities', description: 'Electricity bill', date: daysAgo(12), isRecurring: true, recurringFrequency: 'monthly', createdAt: now },
];

// ---- Budget -------------------------------------------------------------

export const DEMO_BUDGET = {
    userId: 'demo-user',
    monthlyIncome: 85000,
    monthlyBudget: 45000,
    currency: 'INR',
    createdAt: now,
    updatedAt: now,
};

// ---- Holdings -----------------------------------------------------------

export interface DemoHolding {
    id: string;
    userId: string;
    symbol: string;
    name: string;
    quantity: number;
    buyPrice: number;
    currency: 'INR' | 'USD';
    type: 'stock' | 'mutualfund' | 'crypto' | 'etf';
    exchange?: string;
    addedAt: Timestamp;
    notes?: string;
}

export const DEMO_HOLDINGS: DemoHolding[] = [
    { id: 'demo-hold-1', userId: 'demo-user', symbol: 'RELIANCE.NS', name: 'Reliance Industries', quantity: 12, buyPrice: 2450, currency: 'INR', type: 'stock', exchange: 'NSE', addedAt: daysAgo(120), notes: 'Core holding' },
    { id: 'demo-hold-2', userId: 'demo-user', symbol: 'TCS.NS', name: 'Tata Consultancy Services', quantity: 8, buyPrice: 3450, currency: 'INR', type: 'stock', exchange: 'NSE', addedAt: daysAgo(200) },
    { id: 'demo-hold-3', userId: 'demo-user', symbol: 'HDFCBANK.NS', name: 'HDFC Bank', quantity: 20, buyPrice: 1550, currency: 'INR', type: 'stock', exchange: 'NSE', addedAt: daysAgo(90) },
    { id: 'demo-hold-4', userId: 'demo-user', symbol: 'BTC-USD', name: 'Bitcoin', quantity: 0.05, buyPrice: 4340000, currency: 'INR', type: 'crypto', addedAt: daysAgo(60), notes: 'Long-term hold' },
    { id: 'demo-hold-5', userId: 'demo-user', symbol: 'ETH-USD', name: 'Ethereum', quantity: 1.5, buyPrice: 242000, currency: 'INR', type: 'crypto', addedAt: daysAgo(45) },
    { id: 'demo-hold-6', userId: 'demo-user', symbol: 'NIFTYBEES.NS', name: 'Nippon India Nifty 50 BeES', quantity: 100, buyPrice: 215, currency: 'INR', type: 'etf', exchange: 'NSE', addedAt: daysAgo(300) },
];

// ---- Watchlist ----------------------------------------------------------

export const DEMO_WATCHLIST = [
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries', sector: 'Energy' },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services', sector: 'IT' },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', sector: 'Banking' },
    { symbol: 'INFY.NS', name: 'Infosys', sector: 'IT' },
    { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', sector: 'Banking' },
    { symbol: 'SBIN.NS', name: 'State Bank of India', sector: 'Banking' },
    { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', sector: 'Telecom' },
    { symbol: 'LT.NS', name: 'Larsen & Toubro', sector: 'Infrastructure' },
    { symbol: 'AXISBANK.NS', name: 'Axis Bank', sector: 'Banking' },
    { symbol: 'TITAN.NS', name: 'Titan Company', sector: 'Consumer' },
];
