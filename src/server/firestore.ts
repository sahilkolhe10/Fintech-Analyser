// Server-side Firestore helpers (Firebase Admin) for API routes & Telegram bot.
// Mirrors the storage layout of the web app (src/services/expenses, src/lib/firebase/firestore).

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import type { Holding } from '@/lib/firebase/firestore';

// ============================================
// Telegram Linking (top-level collections)
// ============================================

export interface TelegramLink {
    chatId: string;
    uid: string;
    linkedAt: Timestamp;
}

export interface TelegramCode {
    code: string;
    uid: string;
    createdAt: Timestamp;
    expiresAt: Timestamp;
}

export const createTelegramCode = async (uid: string): Promise<{ success: boolean; code?: string; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000);

    try {
        await db.collection('telegramCodes').doc(code).set({
            code,
            uid,
            createdAt: now,
            expiresAt,
        });
        return { success: true, code };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create code' };
    }
};

export const consumeTelegramCode = async (code: string): Promise<{ success: boolean; uid?: string; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const ref = db.collection('telegramCodes').doc(code.trim());
        const snap = await ref.get();
        if (!snap.exists) return { success: false, error: 'Invalid or expired code' };

        const data = snap.data() as TelegramCode;
        if (data.expiresAt.toMillis() < Date.now()) {
            await ref.delete();
            return { success: false, error: 'Code expired. Generate a new one from Settings.' };
        }

        await ref.delete();
        return { success: true, uid: data.uid };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to verify code' };
    }
};

export const linkTelegramChat = async (uid: string, chatId: string): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        // One link per user (new chat overrides old) and per chat
        const existing = await db.collection('telegramLinks')
            .where('uid', '==', uid).get();
        for (const doc of existing.docs) {
            await doc.ref.delete();
        }

        await db.collection('telegramLinks').doc(String(chatId)).set({
            chatId: String(chatId),
            uid,
            linkedAt: FieldValue.serverTimestamp(),
        });
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to link chat' };
    }
};

export const unlinkTelegramChat = async (chatId: string): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        await db.collection('telegramLinks').doc(String(chatId)).delete();
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to unlink chat' };
    }
};

export const getUidForChat = async (chatId: string): Promise<string | null> => {
    const db = getAdminDb();
    if (!db) return null;

    try {
        const snap = await db.collection('telegramLinks').doc(String(chatId)).get();
        return snap.exists ? (snap.data() as TelegramLink).uid : null;
    } catch {
        return null;
    }
};

// ============================================
// Documents (users/{uid}/documents)
// ============================================

export interface StoredDocument {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    storagePath: string;
    documentType: 'bank_statement' | 'payslip' | 'bill' | 'receipt' | 'other';
    summary: string;
    keyFacts: string[];
    insights: string[];
    transactionsImported: number;
    text?: string;
    createdAt: Timestamp;
}

export const saveDocument = async (uid: string, doc: Omit<StoredDocument, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const ref = db.collection('users').doc(uid).collection('documents').doc();
        await ref.set({
            id: ref.id,
            ...doc,
            createdAt: FieldValue.serverTimestamp(),
        });
        return { success: true, id: ref.id };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save document' };
    }
};

export const getDocuments = async (uid: string): Promise<{ success: boolean; data?: StoredDocument[]; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const snap = await db.collection('users').doc(uid).collection('documents')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as StoredDocument[];
        return { success: true, data: docs };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get documents' };
    }
};

export const deleteStoredDocument = async (uid: string, docId: string): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        await db.collection('users').doc(uid).collection('documents').doc(docId).delete();
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete document' };
    }
};

// ============================================
// Holdings (users/{uid}/portfolio)
// ============================================

export const getServerHoldings = async (uid: string): Promise<{ success: boolean; data?: Holding[]; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const snap = await db.collection('users').doc(uid).collection('portfolio').get();
        const holdings = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Holding[];
        return { success: true, data: holdings };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get holdings' };
    }
};

// ============================================
// Chat history (users/{uid}/chatHistory)
// ============================================

export const saveServerChatMessage = async (uid: string, role: 'user' | 'assistant', content: string): Promise<void> => {
    const db = getAdminDb();
    if (!db) return;

    try {
        await db.collection('users').doc(uid).collection('chatHistory').add({
            role,
            content,
            timestamp: FieldValue.serverTimestamp(),
        });
    } catch {
        // Best-effort: never break chat over history persistence
    }
};

