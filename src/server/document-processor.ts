// Shared server-side document processing pipeline.
// Used by /api/ai/documents (web upload) and the Telegram bot.

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminStorage } from '@/lib/firebase/admin';
import { documentAgent, type DocumentAnalysis } from '@/services/ai/document-agent';
import { saveDocument } from '@/server/firestore';
import { addServerExpense, normalizeCategory } from '@/server/expenses';
import { read, utils } from 'xlsx';

const MAX_SIZE = 15 * 1024 * 1024;

export const ALLOWED_MIME: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/csv': 'csv',
};

export function isAllowedMime(mimeType: string): boolean {
    return Boolean(ALLOWED_MIME[mimeType]);
}

async function extractText(name: string, mimeType: string, buffer: Buffer): Promise<{
    text?: string;
    base64?: string;
    error?: string;
}> {
    if (mimeType === 'application/pdf') {
        try {
            const { PDFParse } = await import('pdf-parse');
            const pdf = new PDFParse({ data: buffer });
            const result = await pdf.getText();
            const text = result?.text?.trim();
            if (text) return { text: text.slice(0, 150000) };
            return { error: 'Could not extract text from PDF (scanned?). Try an image of the page.' };
        } catch {
            if (buffer.length <= MAX_SIZE) {
                return { base64: buffer.toString('base64') };
            }
            return { error: 'PDF parse failed' };
        }
    }

    if (mimeType.startsWith('image/')) {
        return { base64: buffer.toString('base64') };
    }

    if (mimeType.includes('excel') || mimeType === 'text/csv' || /\.(xlsx|xls|csv)$/i.test(name)) {
        try {
            const workbook = read(buffer, { type: 'buffer', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) return { error: 'Spreadsheet has no sheets' };
            const rows = utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
            return { text: JSON.stringify(rows.slice(0, 500), null, 1) };
        } catch (error: unknown) {
            return { error: error instanceof Error ? error.message : 'Spreadsheet parse failed' };
        }
    }

    return { error: 'Unsupported file type' };
}

export interface ProcessDocumentInput {
    uid: string;
    name: string;
    mimeType: string;
    buffer: Buffer;
    importExpenses?: boolean;
}

export interface ProcessDocumentOutput {
    success: boolean;
    docId?: string;
    analysis?: DocumentAnalysis;
    transactionsImported?: number;
    error?: string;
}

export async function processDocument(input: ProcessDocumentInput): Promise<ProcessDocumentOutput> {
    if (!ALLOWED_MIME[input.mimeType]) {
        return { success: false, error: 'Unsupported file type. Use PDF, PNG/JPG image, Excel or CSV.' };
    }
    if (input.buffer.length > MAX_SIZE) {
        return { success: false, error: 'File too large (max 15MB)' };
    }

    const extracted = await extractText(input.name, input.mimeType, input.buffer);
    if (!extracted.text && !extracted.base64) {
        return { success: false, error: extracted.error || 'Could not read the document' };
    }

    const analysis = await documentAgent.analyze({
        name: input.name,
        mimeType: input.mimeType,
        text: extracted.text,
        base64: extracted.base64,
    });

    if (!analysis.success || !analysis.data) {
        return { success: false, error: analysis.error || 'AI analysis failed' };
    }

    const data = analysis.data;

    // Upload original file to Storage (best-effort)
    const storage = getAdminStorage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    let storagePath = '';
    if (storage && bucketName) {
        const ext = ALLOWED_MIME[input.mimeType] || 'bin';
        storagePath = `documents/${input.uid}/${Date.now()}-${input.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`;
        try {
            await storage.bucket(bucketName).file(storagePath).save(input.buffer, {
                resumable: false,
                contentType: input.mimeType,
            });
        } catch (error) {
            console.error('Storage upload failed (continuing):', error);
            storagePath = '';
        }
    }

    // Import expense transactions (opt-in)
    let importedCount = 0;
    if (input.importExpenses && data.transactions.length > 0) {
        for (const txn of data.transactions) {
            if (txn.type !== 'expense' || !txn.amount || txn.amount <= 0) continue;
            const txnDate = txn.date && !isNaN(new Date(txn.date).getTime())
                ? new Date(txn.date)
                : new Date();

            const result = await addServerExpense({
                userId: input.uid,
                amount: txn.amount,
                category: normalizeCategory(txn.category),
                description: `${txn.description || data.documentType} [doc]`,
                date: Timestamp.fromDate(txnDate),
            });

            if (result.success) importedCount++;
        }
    }

    const docResult = await saveDocument(input.uid, {
        name: input.name,
        mimeType: input.mimeType,
        size: input.buffer.length,
        storagePath,
        documentType: data.documentType,
        summary: data.summary,
        keyFacts: data.keyFacts,
        insights: data.insights,
        transactionsImported: importedCount,
        text: extracted.text?.slice(0, 100000),
    });

    return {
        success: true,
        docId: docResult.id,
        analysis: data,
        transactionsImported: importedCount,
    };
}