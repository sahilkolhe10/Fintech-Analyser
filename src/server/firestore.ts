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
// AI chat conversations (users/{uid}/conversations/{conversationId})
// Messages: users/{uid}/conversations/{conversationId}/messages
// ============================================

export interface Conversation {
    conversationId: string;
    title: string;
    summary: string;
    messageCount: number;
    lastMessage: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface ChatMessageRecord {
    role: 'user' | 'assistant';
    content: string;
    n: number;
    timestamp: Date;
}

export const saveServerChatMessage = async (
    uid: string,
    role: 'user' | 'assistant',
    content: string,
    conversationId?: string
): Promise<void> => {
    const db = getAdminDb();
    if (!db) return;

    try {
        if (!conversationId) {
            // Legacy flat history (pre-conversations data)
            await db.collection('users').doc(uid).collection('chatHistory').add({
                role,
                content,
                timestamp: FieldValue.serverTimestamp(),
            });
            return;
        }

        await db.runTransaction(async (tx) => {
            const convRef = db.collection('users').doc(uid).collection('conversations').doc(conversationId);
            const conv = await tx.get(convRef);
            if (!conv.exists) return;

            const count = (conv.data()?.messageCount as number) || 0;
            const n = count + 1;

            tx.set(convRef.collection('messages').doc(), {
                role,
                content,
                n,
                timestamp: FieldValue.serverTimestamp(),
            });

            const updates: Record<string, unknown> = {
                messageCount: n,
                updatedAt: FieldValue.serverTimestamp(),
                lastMessage: content.slice(0, 120),
            };
            const title = conv.data()?.title as string | undefined;
            if (role === 'user' && !title && content.trim()) {
                updates.title = content.trim().slice(0, 60);
            }
            tx.update(convRef, updates);
        });
    } catch (error) {
        // Best-effort: never break chat over history persistence
        console.error('saveServerChatMessage failed:', error);
    }
};

export const createServerConversation = async (uid: string): Promise<Conversation | null> => {
    const db = getAdminDb();
    if (!db) return null;

    try {
        const ref = await db.collection('users').doc(uid).collection('conversations').add({
            title: '',
            summary: '',
            messageCount: 0,
            lastMessage: '',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        return { conversationId: ref.id, title: '', summary: '', messageCount: 0, lastMessage: '', createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
    } catch (error) {
        console.error('createServerConversation failed:', error);
        return null;
    }
};

export const getOrCreateConversation = async (uid: string, conversationId?: string): Promise<Conversation | null> => {
    const db = getAdminDb();
    if (!db) return null;

    try {
        const convCol = db.collection('users').doc(uid).collection('conversations');

        if (conversationId) {
            const snap = await convCol.doc(conversationId).get();
            if (snap.exists) {
                const data = snap.data() as Conversation;
                return { ...(data as Conversation), conversationId: snap.id };
            }
        }

        // Fall back to the most recent conversation (e.g. Telegram without ids)
        const latest = await convCol.orderBy('updatedAt', 'desc').limit(1).get();
        if (!latest.empty) {
            const doc = latest.docs[0];
            return { ...(doc.data() as Conversation), conversationId: doc.id };
        }

        return await createServerConversation(uid);
    } catch (error) {
        console.error('getOrCreateConversation failed:', error);
        return null;
    }
};

export const getServerChatMessages = async (
    uid: string,
    conversationId: string,
    limit = 20
): Promise<ChatMessageRecord[]> => {
    const db = getAdminDb();
    if (!db) return [];

    try {
        const snap = await db
            .collection('users').doc(uid).collection('conversations').doc(conversationId)
            .collection('messages')
            .orderBy('n', 'desc')
            .limit(limit)
            .get();

        return snap.docs
            .map((doc) => {
                const data = doc.data();
                return {
                    role: data.role as 'user' | 'assistant',
                    content: String(data.content || ''),
                    n: Number(data.n || 0),
                    timestamp: (data.timestamp as Timestamp | undefined)?.toDate() ?? new Date(),
                };
            })
            .sort((a, b) => a.n - b.n);
    } catch (error) {
        console.error('getServerChatMessages failed:', error);
        return [];
    }
};

export const listServerConversations = async (uid: string, limit = 50): Promise<Conversation[]> => {
    const db = getAdminDb();
    if (!db) return [];

    try {
        const snap = await db
            .collection('users').doc(uid).collection('conversations')
            .orderBy('updatedAt', 'desc')
            .limit(limit)
            .get();

        return snap.docs
            .filter((doc) => (doc.data()?.title as string | undefined)?.trim())
            .map((doc) => ({ ...(doc.data() as Conversation), conversationId: doc.id }));
    } catch (error) {
        console.error('listServerConversations failed:', error);
        return [];
    }
};

export const updateConversationSummary = async (uid: string, conversationId: string, summary: string): Promise<void> => {
    const db = getAdminDb();
    if (!db) return;

    try {
        await db
            .collection('users').doc(uid).collection('conversations').doc(conversationId)
            .update({ summary });
    } catch (error) {
        console.error('updateConversationSummary failed:', error);
    }
};

export const deleteServerConversation = async (uid: string, conversationId: string): Promise<void> => {
    const db = getAdminDb();
    if (!db) return;

    try {
        const convRef = db.collection('users').doc(uid).collection('conversations').doc(conversationId);
        const messagesRef = convRef.collection('messages');

        // Recursive delete of messages in batches, then the conversation doc
        while (true) {
            const batch = db.batch();
            const snap = await messagesRef.limit(500).get();
            if (snap.empty) break;
            snap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
        }
        await convRef.delete();
    } catch (error) {
        console.error('deleteServerConversation failed:', error);
    }
};

// ============================================
// Per-user Telegram bots
// users/{uid}/telegramBot — the user's own bot token (optional; a global
// TELEGRAM_BOT_TOKEN bot is also supported). Storing the token lets each
// user run their own bot and link their own chats.
// ============================================

export interface UserTelegramBot {
    uid: string;
    botToken: string;         // full token: "123456:ABC..."
    botId: string;            // numeric bot id (from the token prefix)
    username?: string;        // e.g. "my_khata_bot"
    webhookPath: string;      // "/api/telegram/webhook/<botId>"
    linkedChatId?: string;    // chat linked to this user via this bot
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export const getTelegramBotKey = (token: string): string => {
    const id = token.split(':')[0];
    return id || 'unknown';
};

export const saveUserTelegramBot = async (
    uid: string,
    botToken: string,
    username?: string
): Promise<{ success: boolean; botId?: string; webhookPath?: string; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    const botId = getTelegramBotKey(botToken);
    const webhookPath = `/api/telegram/webhook/${botId}`;

    try {
        await db.collection('users').doc(uid).collection('telegramBot').doc('self').set({
            uid,
            botToken,
            botId,
            username: username || '',
            webhookPath,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
        });
        return { success: true, botId, webhookPath };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save bot' };
    }
};

export const getUserTelegramBot = async (uid: string): Promise<{ success: boolean; data?: UserTelegramBot; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        const snap = await db.collection('users').doc(uid).collection('telegramBot').doc('self').get();
        if (!snap.exists) return { success: true, data: undefined };
        return { success: true, data: snap.data() as UserTelegramBot };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to load bot' };
    }
};

export const deleteUserTelegramBot = async (uid: string): Promise<{ success: boolean; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { success: false, error: 'Firebase Admin not configured' };

    try {
        await db.collection('users').doc(uid).collection('telegramBot').doc('self').delete();
        return { success: true };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to delete bot' };
    }
};

// Resolve a botId (from the webhook path) to the owning user + token.
export const getBotOwnerByBotId = async (botId: string): Promise<{ uid?: string; botToken?: string; error?: string }> => {
    const db = getAdminDb();
    if (!db) return { error: 'Firebase Admin not configured' };

    try {
        // Query all users' telegramBot/self docs for a matching botId.
        const users = await db.collection('users').get();
        for (const userDoc of users.docs) {
            const snap = await userDoc.ref.collection('telegramBot').doc('self').get();
            if (!snap.exists) continue;
            const data = snap.data() as UserTelegramBot;
            if (data.botId === botId) {
                return { uid: data.uid, botToken: data.botToken };
            }
        }
        return { error: 'Bot not found' };
    } catch (error: unknown) {
        return { error: error instanceof Error ? error.message : 'Failed to resolve bot' };
    }
};

