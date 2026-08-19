// Server-side loans service (Firebase Admin).
// Mirrors src/services/loans/index.ts so API routes and the web app share data.

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';

export interface ServerLoan {
    id?: string;
    userId: string;
    name: string;              // e.g. "Car loan — HDFC"
    type: 'personal' | 'home' | 'car' | 'education' | 'credit_card' | 'other';
    lender: string;
    principal: number;         // original amount
    outstanding: number;       // current balance
    emi: number;               // monthly EMI
    interestRate: number;      // annual % (e.g. 10.5)
    totalTenureMonths: number; // original tenure
    remainingTenureMonths: number;
    nextDueDate: Timestamp;    // next EMI date
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export const LOAN_TYPES = ['personal', 'home', 'car', 'education', 'credit_card', 'other'] as const;

export const addServerLoan = async (
    loan: Omit<ServerLoan, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; id?: string; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const ref = await db.collection('loans').add({
            ...loan,
            nextDueDate: loan.nextDueDate instanceof Date ? Timestamp.fromDate(loan.nextDueDate) : loan.nextDueDate,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { success: true, id: ref.id };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to add loan' };
    }
};

export const getServerLoans = async (userId: string): Promise<{ success: boolean; data?: ServerLoan[]; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const snap = await db.collection('loans').where('userId', '==', userId).get();
        const loans = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ServerLoan[];
        loans.sort((a, b) => a.nextDueDate.toMillis() - b.nextDueDate.toMillis());
        return { success: true, data: loans };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get loans' };
    }
};

export const updateServerLoan = async (
    userId: string,
    loanId: string,
    updates: Partial<Omit<ServerLoan, 'id' | 'userId' | 'createdAt'>>
): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        await db.collection('loans').doc(loanId).update({
            ...updates,
            nextDueDate: updates.nextDueDate instanceof Date ? Timestamp.fromDate(updates.nextDueDate) : updates.nextDueDate,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update loan' };
    }
};

export const deleteServerLoan = async (userId: string, loanId: string): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        // Only delete if it belongs to this user.
        const ref = db.collection('loans').doc(loanId);
        const snap = await ref.get();
        if (!snap.exists || (snap.data()?.userId) !== userId) {
            return { success: false, error: 'Loan not found' };
        }
        await ref.delete();
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete loan' };
    }
};

// Save/update the user's CIBIL score snapshot.
export const saveServerCibilScore = async (
    userId: string,
    score: number
): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        await db.collection('cibilScores').doc(userId).set({
            userId,
            score,
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save CIBIL score' };
    }
};

export const getServerCibilScore = async (userId: string): Promise<{ success: boolean; score?: number; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const snap = await db.collection('cibilScores').doc(userId).get();
        if (!snap.exists) return { success: true };
        return { success: true, score: Number((snap.data() as { score: number }).score) };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load CIBIL score' };
    }
};
