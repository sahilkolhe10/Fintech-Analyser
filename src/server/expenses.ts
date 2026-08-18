// Server-side expenses service (Firebase Admin).
// Mirrors src/services/expenses/index.ts so the bot and web app share the same data.

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

export interface ServerExpense {
    id?: string;
    userId: string;
    amount: number;
    category: string;
    description: string;
    date: Timestamp;
    createdAt: Timestamp;
}

export interface ServerBudgetSettings {
    userId: string;
    monthlyIncome: number;
    monthlyBudget: number;
    currency: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export const EXPENSE_CATEGORIES = [
    'Food', 'Transport', 'Shopping', 'Entertainment', 'Housing',
    'Health', 'Education', 'Utilities', 'Other',
] as const;

export const normalizeCategory = (category: string | undefined): string => {
    if (!category) return 'Other';
    const match = EXPENSE_CATEGORIES.find(
        (c) => c.toLowerCase() === category.trim().toLowerCase()
    );
    return match || 'Other';
};

export const addServerExpense = async (
    expense: Omit<ServerExpense, 'id' | 'createdAt'>
): Promise<{ success: boolean; id?: string; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const ref = await db.collection('expenses').add({
            ...expense,
            category: normalizeCategory(expense.category),
            date: expense.date instanceof Date ? Timestamp.fromDate(expense.date) : expense.date,
            createdAt: FieldValue.serverTimestamp(),
        });
        return { success: true, id: ref.id };
    } catch (error: unknown) {
        console.error('Error adding server expense:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to add expense' };
    }
};

export const getServerExpenses = async (userId: string): Promise<{ success: boolean; data?: ServerExpense[]; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const snap = await db.collection('expenses').where('userId', '==', userId).get();
        const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ServerExpense[];
        expenses.sort((a, b) => b.date.toMillis() - a.date.toMillis());
        return { success: true, data: expenses };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get expenses' };
    }
};

export const getServerMonthlyTotals = async (
    userId: string,
    year: number,
    month: number
): Promise<{ success: boolean; data?: { total: number; byCategory: Record<string, number> }; error?: string }> => {
    const result = await getServerExpenses(userId);
    if (!result.success) return { success: false, error: result.error };
    if (!result.data) return { success: false, error: 'No expense data' };

    const monthly = result.data.filter((exp) => {
        const d = exp.date.toDate();
        return d.getFullYear() === year && d.getMonth() === month - 1;
    });

    const total = monthly.reduce((sum, exp) => sum + exp.amount, 0);
    const byCategory: Record<string, number> = {};
    monthly.forEach((exp) => {
        byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
    });

    return { success: true, data: { total, byCategory } };
};

export const getServerBudgetSettings = async (userId: string): Promise<{ success: boolean; data?: ServerBudgetSettings; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const snap = await db.collection('budgetSettings').doc(userId).get();
        if (!snap.exists) return { success: true, data: undefined };
        return { success: true, data: snap.data() as ServerBudgetSettings };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get budget settings' };
    }
};

export const deleteServerExpense = async (expenseId: string): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        await db.collection('expenses').doc(expenseId).delete();
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete expense' };
    }
};

export const formatExpenseSummary = (totals: { total: number; byCategory: Record<string, number> }, currency = 'INR'): string => {
    const topCategories = Object.entries(totals.byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, amt]) => `- ${cat}: ${currency} ${amt.toFixed(2)}`)
        .join('\n');

    return `TOTAL SPENT (current month): ${currency} ${totals.total.toFixed(2)}\n${topCategories || '- No expenses recorded yet'}`;
};