// Firestore Database Service for KhataHouse
// Handles all database operations with typed schemas

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    Timestamp,
    QueryConstraint,
    Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from './config';

// ============================================
// Type Definitions for Database Schemas
// ============================================

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
    currency: 'INR' | 'USD';
    preferences: {
        theme: 'dark' | 'light';
        notifications: boolean;
        riskTolerance: 'low' | 'medium' | 'high';
    };
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface Holding {
    id?: string;
    symbol: string;
    name: string;
    quantity: number;
    avgPrice: number;
    currency: 'INR' | 'USD';
    type: 'stock' | 'mutualfund' | 'crypto' | 'etf';
    exchange?: string;
    addedAt: Timestamp;
    notes?: string;
}

export interface Expense {
    id?: string;
    amount: number;
    currency: 'INR' | 'USD';
    category: string;
    description: string;
    date: Timestamp;
    isRecurring: boolean;
    recurringFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    createdAt: Timestamp;
}

export interface Budget {
    id?: string;
    category: string;
    limit: number;
    currency: 'INR' | 'USD';
    period: 'weekly' | 'monthly' | 'yearly';
    spent: number;
    startDate: Timestamp;
    endDate: Timestamp;
}

export interface WatchlistItem {
    id?: string;
    symbol: string;
    name: string;
    exchange: string;
    addedAt: Timestamp;
    targetPrice?: number;
    notes?: string;
}

export interface Alert {
    id?: string;
    type: 'price' | 'portfolio' | 'budget' | 'news';
    symbol?: string;
    condition: {
        operator: 'above' | 'below' | 'equals' | 'change_percent';
        value: number;
    };
    message: string;
    isActive: boolean;
    triggered: boolean;
    triggeredAt?: Timestamp;
    createdAt: Timestamp;
}

export interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Timestamp;
    metadata?: Record<string, unknown>;
}

// ============================================
// Collection References
// ============================================

const COLLECTIONS = {
    USERS: 'users',
    PORTFOLIO: 'portfolio',
    EXPENSES: 'expenses',
    BUDGETS: 'budgets',
    WATCHLIST: 'watchlist',
    ALERTS: 'alerts',
    CHAT_HISTORY: 'chatHistory',
} as const;

// ============================================
// User Profile Operations
// ============================================

export const createUserProfile = async (
    uid: string,
    data: Partial<UserProfile>
): Promise<{ success: boolean; error?: string }> => {
    try {
        const db = getFirebaseDb();
        if (!db) return { success: false, error: 'Firestore not configured' };

        const userRef = doc(db, COLLECTIONS.USERS, uid);
        const now = Timestamp.now();

        await setDoc(userRef, {
            uid,
            currency: 'INR',
            preferences: {
                theme: 'dark',
                notifications: true,
                riskTolerance: 'medium',
            },
            createdAt: now,
            updatedAt: now,
            ...data,
        });

        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create profile';
        return { success: false, error: errorMessage };
    }
};

export const getUserProfile = async (
    uid: string
): Promise<{ success: boolean; data?: UserProfile; error?: string }> => {
    try {
        const db = getFirebaseDb();
        if (!db) return { success: false, error: 'Firestore not configured' };

        const userRef = doc(db, COLLECTIONS.USERS, uid);
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
            return { success: false, error: 'User not found' };
        }

        return { success: true, data: snapshot.data() as UserProfile };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get profile';
        return { success: false, error: errorMessage };
    }
};

export const updateUserProfile = async (
    uid: string,
    data: Partial<UserProfile>
): Promise<{ success: boolean; error?: string }> => {
    try {
        const db = getFirebaseDb();
        if (!db) return { success: false, error: 'Firestore not configured' };

        const userRef = doc(db, COLLECTIONS.USERS, uid);
        await updateDoc(userRef, {
            ...data,
            updatedAt: Timestamp.now(),
        });

        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
        return { success: false, error: errorMessage };
    }
};

// ============================================
// Generic CRUD Operations for Sub-collections
// ============================================

const getSubCollectionRef = (uid: string, collectionName: string) => {
    const db = getFirebaseDb();
    if (!db) return null;
    return collection(db, COLLECTIONS.USERS, uid, collectionName);
};

// Add document to user's sub-collection
export const addDocument = async <T extends { id?: string }>(
    uid: string,
    collectionName: string,
    data: T
): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
        const db = getFirebaseDb();
        if (!db) return { success: false, error: 'Firestore not configured' };

        const colRef = collection(db, COLLECTIONS.USERS, uid, collectionName);
        const docRef = doc(colRef);

        await setDoc(docRef, {
            ...data,
            id: docRef.id,
            createdAt: Timestamp.now(),
        });

        return { success: true, id: docRef.id };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to add document';
        return { success: false, error: errorMessage };
    }
};

// Get all documents from user's sub-collection
export const getDocuments = async <T>(
    uid: string,
    collectionName: string,
    constraints: QueryConstraint[] = []
): Promise<{ success: boolean; data?: T[]; error?: string }> => {
    try {
        const colRef = getSubCollectionRef(uid, collectionName);
        if (!colRef) return { success: false, error: 'Firestore not configured' };

        const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef);
        const snapshot = await getDocs(q);

        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
        return { success: true, data };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get documents';
        return { success: false, error: errorMessage };
    }
};

// Update document in user's sub-collection
export const updateDocument = async <T extends Record<string, unknown>>(
    uid: string,
    collectionName: string,
    docId: string,
    data: Partial<T>
): Promise<{ success: boolean; error?: string }> => {
    try {
        const db = getFirebaseDb();
        if (!db) return { success: false, error: 'Firestore not configured' };

        const docRef = doc(db, COLLECTIONS.USERS, uid, collectionName, docId);
        await updateDoc(docRef, {
            ...data,
            updatedAt: Timestamp.now(),
        });

        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update document';
        return { success: false, error: errorMessage };
    }
};

// Delete document from user's sub-collection
export const deleteDocument = async (
    uid: string,
    collectionName: string,
    docId: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const db = getFirebaseDb();
        if (!db) return { success: false, error: 'Firestore not configured' };

        const docRef = doc(db, COLLECTIONS.USERS, uid, collectionName, docId);
        await deleteDoc(docRef);

        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete document';
        return { success: false, error: errorMessage };
    }
};

// Subscribe to real-time updates
export const subscribeToCollection = <T>(
    uid: string,
    collectionName: string,
    callback: (data: T[]) => void,
    constraints: QueryConstraint[] = []
): Unsubscribe => {
    const colRef = getSubCollectionRef(uid, collectionName);
    if (!colRef) {
        console.warn('Firestore not configured');
        return () => { };
    }

    const q = constraints.length > 0 ? query(colRef, ...constraints) : query(colRef);

    return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
        callback(data);
    });
};

// ============================================
// Convenience Functions for Specific Collections
// ============================================

// Portfolio
export const addHolding = (uid: string, holding: Holding) =>
    addDocument(uid, COLLECTIONS.PORTFOLIO, holding);

export const getHoldings = (uid: string) =>
    getDocuments<Holding>(uid, COLLECTIONS.PORTFOLIO);

export const updateHolding = (uid: string, docId: string, data: Partial<Holding>) =>
    updateDocument(uid, COLLECTIONS.PORTFOLIO, docId, data);

export const deleteHolding = (uid: string, docId: string) =>
    deleteDocument(uid, COLLECTIONS.PORTFOLIO, docId);

// Expenses
export const addExpense = (uid: string, expense: Expense) =>
    addDocument(uid, COLLECTIONS.EXPENSES, expense);

export const getExpenses = (uid: string, constraints?: QueryConstraint[]) =>
    getDocuments<Expense>(uid, COLLECTIONS.EXPENSES, constraints);

// Budgets
export const addBudget = (uid: string, budget: Budget) =>
    addDocument(uid, COLLECTIONS.BUDGETS, budget);

export const getBudgets = (uid: string) =>
    getDocuments<Budget>(uid, COLLECTIONS.BUDGETS);

// Watchlist
export const addToWatchlist = (uid: string, item: WatchlistItem) =>
    addDocument(uid, COLLECTIONS.WATCHLIST, item);

export const getWatchlist = (uid: string) =>
    getDocuments<WatchlistItem>(uid, COLLECTIONS.WATCHLIST);

export const removeFromWatchlist = (uid: string, docId: string) =>
    deleteDocument(uid, COLLECTIONS.WATCHLIST, docId);

// Alerts
export const createAlert = (uid: string, alert: Alert) =>
    addDocument(uid, COLLECTIONS.ALERTS, alert);

export const getAlerts = (uid: string) =>
    getDocuments<Alert>(uid, COLLECTIONS.ALERTS);

export const updateAlert = (uid: string, docId: string, data: Partial<Alert>) =>
    updateDocument(uid, COLLECTIONS.ALERTS, docId, data);

// Chat History
export const saveChatMessage = (uid: string, message: ChatMessage) =>
    addDocument(uid, COLLECTIONS.CHAT_HISTORY, message);

export const getChatHistory = (uid: string, messageLimit: number = 50) =>
    getDocuments<ChatMessage>(uid, COLLECTIONS.CHAT_HISTORY, [
        orderBy('timestamp', 'desc'),
        limit(messageLimit),
    ]);

// Export query helpers
export { where, orderBy, limit, Timestamp };
