// Loans & EMI Service — Firestore operations for loan tracking.
// Mirrors src/server/loans.ts so the web app and API routes share the schema.

import {
    collection,
    doc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    setDoc,
    getDoc,
    Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/config';
import { isDemoSession } from '@/services/demo';
import { DEMO_LOANS, DEMO_CIBIL } from '@/services/demo-data';

const getDb = () => {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore not configured');
    return db;
};

export type LoanType = 'personal' | 'home' | 'car' | 'education' | 'credit_card' | 'other';

export interface Loan {
    id?: string;
    userId: string;
    name: string;
    type: LoanType;
    lender: string;
    principal: number;
    outstanding: number;
    emi: number;
    interestRate: number;
    totalTenureMonths: number;
    remainingTenureMonths: number;
    nextDueDate: Timestamp | Date;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}

export const LOAN_TYPES: { value: LoanType; label: string }[] = [
    { value: 'personal', label: 'Personal' },
    { value: 'home', label: 'Home' },
    { value: 'car', label: 'Car' },
    { value: 'education', label: 'Education' },
    { value: 'credit_card', label: 'Credit Card' },
    { value: 'other', label: 'Other' },
];

export const getLoans = async (userId: string): Promise<{ success: boolean; data?: Loan[]; error?: string }> => {
    if (isDemoSession()) {
        return { success: true, data: DEMO_LOANS as unknown as Loan[] };
    }
    try {
        const q = query(collection(getDb(), 'loans'), where('userId', '==', userId));
        const snap = await getDocs(q);
        const loans = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Loan[];
        loans.sort((a, b) => {
            const am = a.nextDueDate instanceof Date ? a.nextDueDate.getTime() : a.nextDueDate.toMillis();
            const bm = b.nextDueDate instanceof Date ? b.nextDueDate.getTime() : b.nextDueDate.toMillis();
            return am - bm;
        });
        return { success: true, data: loans };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get loans' };
    }
};

export const addLoan = async (loan: Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
        const ref = await addDoc(collection(getDb(), 'loans'), {
            ...loan,
            nextDueDate: loan.nextDueDate instanceof Date ? Timestamp.fromDate(loan.nextDueDate) : loan.nextDueDate,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        return { success: true, id: ref.id };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to add loan' };
    }
};

export const updateLoan = async (
    loanId: string,
    updates: Partial<Omit<Loan, 'id' | 'userId' | 'createdAt'>>
): Promise<{ success: boolean; error?: string }> => {
    try {
        await updateDoc(doc(getDb(), 'loans', loanId), {
            ...updates,
            updatedAt: Timestamp.now(),
        });
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update loan' };
    }
};

export const deleteLoan = async (loanId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        await deleteDoc(doc(getDb(), 'loans', loanId));
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete loan' };
    }
};

// CIBIL score (user's own input)
export const saveCibilScore = async (userId: string, score: number): Promise<{ success: boolean; error?: string }> => {
    try {
        await setDoc(doc(getDb(), 'cibilScores', userId), {
            userId,
            score,
            updatedAt: Timestamp.now(),
        });
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save score' };
    }
};

export const getCibilScore = async (userId: string): Promise<{ success: boolean; score?: number; error?: string }> => {
    if (isDemoSession()) {
        return { success: true, score: DEMO_CIBIL };
    }
    try {
        const snap = await getDoc(doc(getDb(), 'cibilScores', userId));
        if (!snap.exists()) return { success: true };
        return { success: true, score: Number(snap.data().score) };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load score' };
    }
};
