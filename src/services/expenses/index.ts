// Expenses Service - Firestore operations for expense tracking
import {
    collection,
    doc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    getDoc,
    setDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// Types
export interface Expense {
    id?: string;
    userId: string;
    amount: number;
    category: string;
    description: string;
    date: Timestamp;
    createdAt: Timestamp;
}

export interface BudgetSettings {
    userId: string;
    monthlyIncome: number;
    monthlyBudget: number;
    currency: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface ExpenseCategory {
    name: string;
    icon: string;
    color: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
    { name: 'Food', icon: 'Utensils', color: '#10B981' },
    { name: 'Transport', icon: 'Car', color: '#F59E0B' },
    { name: 'Shopping', icon: 'ShoppingBag', color: '#8B5CF6' },
    { name: 'Entertainment', icon: 'Gamepad2', color: '#EF4444' },
    { name: 'Housing', icon: 'Home', color: '#06B6D4' },
    { name: 'Health', icon: 'Heart', color: '#EC4899' },
    { name: 'Education', icon: 'GraduationCap', color: '#3B82F6' },
    { name: 'Utilities', icon: 'Zap', color: '#F97316' },
    { name: 'Other', icon: 'MoreHorizontal', color: '#6B7280' },
];

// Budget Settings Operations
export const getBudgetSettings = async (userId: string): Promise<{ success: boolean; data?: BudgetSettings; error?: string }> => {
    try {
        const docRef = doc(db, 'budgetSettings', userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { success: true, data: docSnap.data() as BudgetSettings };
        }
        return { success: true, data: undefined };
    } catch (error) {
        console.error('Error getting budget settings:', error);
        return { success: false, error: 'Failed to get budget settings' };
    }
};

export const saveBudgetSettings = async (
    userId: string,
    settings: Omit<BudgetSettings, 'userId' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; error?: string }> => {
    try {
        const docRef = doc(db, 'budgetSettings', userId);
        const existing = await getDoc(docRef);

        if (existing.exists()) {
            await updateDoc(docRef, {
                ...settings,
                updatedAt: Timestamp.now(),
            });
        } else {
            await setDoc(docRef, {
                userId,
                ...settings,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
        }
        return { success: true };
    } catch (error) {
        console.error('Error saving budget settings:', error);
        return { success: false, error: 'Failed to save budget settings' };
    }
};

// Expense Operations
export const addExpense = async (expense: Omit<Expense, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
        const docRef = await addDoc(collection(db, 'expenses'), {
            ...expense,
            createdAt: Timestamp.now(),
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error adding expense:', error);
        return { success: false, error: 'Failed to add expense' };
    }
};

export const getExpenses = async (
    userId: string,
    startDate?: Date,
    endDate?: Date
): Promise<{ success: boolean; data?: Expense[]; error?: string }> => {
    try {
        let q = query(
            collection(db, 'expenses'),
            where('userId', '==', userId)
        );

        if (startDate && endDate) {
            q = query(
                collection(db, 'expenses'),
                where('userId', '==', userId),
                where('date', '>=', Timestamp.fromDate(startDate)),
                where('date', '<=', Timestamp.fromDate(endDate))
            );
        }

        const querySnapshot = await getDocs(q);
        const expenses: Expense[] = [];
        querySnapshot.forEach((doc) => {
            expenses.push({ id: doc.id, ...doc.data() } as Expense);
        });

        // Sort by date desc (client-side to avoid composite index requirement)
        expenses.sort((a, b) => b.date.toMillis() - a.date.toMillis());

        return { success: true, data: expenses };
    } catch (error) {
        console.error('Error getting expenses:', error);
        return { success: false, error: 'Failed to get expenses' };
    }
};

export const deleteExpense = async (expenseId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        await deleteDoc(doc(db, 'expenses', expenseId));
        return { success: true };
    } catch (error) {
        console.error('Error deleting expense:', error);
        return { success: false, error: 'Failed to delete expense' };
    }
};

export const updateExpense = async (
    expenseId: string,
    updates: Partial<Expense>
): Promise<{ success: boolean; error?: string }> => {
    try {
        await updateDoc(doc(db, 'expenses', expenseId), updates);
        return { success: true };
    } catch (error) {
        console.error('Error updating expense:', error);
        return { success: false, error: 'Failed to update expense' };
    }
};

// Get monthly totals - Client-side filtering to avoid index issues
export const getMonthlyTotals = async (
    userId: string,
    year: number,
    month: number
): Promise<{ success: boolean; data?: { total: number; byCategory: Record<string, number> }; error?: string }> => {
    try {
        // Fetch ALL expenses for the user (reuses the working query without date filters)
        const result = await getExpenses(userId);

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        const startMonth = month - 1; // JS months are 0-11

        // Filter for specific month/year client-side
        const monthlyExpenses = result.data.filter(exp => {
            const d = exp.date.toDate();
            return d.getFullYear() === year && d.getMonth() === startMonth;
        });

        const total = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const byCategory: Record<string, number> = {};

        monthlyExpenses.forEach((exp) => {
            byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
        });

        return { success: true, data: { total, byCategory } };
    } catch (error) {
        console.error('Error getting monthly totals:', error);
        return { success: false, error: 'Failed to get monthly totals' };
    }
};
