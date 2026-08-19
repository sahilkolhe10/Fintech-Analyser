import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, isAdminConfigured, getAdminStorage } from '@/lib/firebase/admin';
import { read, utils } from 'xlsx';
import { parseStatementRows, parseStatementPdfText } from '@/server/statement-parser';
import { importStatementTransactions } from '@/server/statement-import';
import { saveDocument } from '@/server/firestore';

export const maxDuration = 120;

const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED = /\.(pdf|xlsx|xls|csv)$/i;

async function verifyUid(request: NextRequest): Promise<{ uid: string } | NextResponse> {
    const auth = getAdminAuth();
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!auth || !idToken) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    try {
        const decoded = await auth.verifyIdToken(idToken);
        return { uid: decoded.uid };
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid session token' }, { status: 401 });
    }
}

export async function POST(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const ids = await verifyUid(request);
    if (ids instanceof NextResponse) return ids;
    const uid = ids.uid;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });

        const name = file.name;
        if (!ALLOWED.test(name)) {
            return NextResponse.json({ success: false, error: 'Unsupported file type. Use PDF, Excel (XLSX/XLS) or CSV.' }, { status: 400 });
        }
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ success: false, error: 'File too large (max 10MB)' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // 1. Parse — structured rows for Excel/CSV, text lines for PDF.
        let parsed;
        if (/\.(xlsx|xls|csv)$/i.test(name)) {
            const workbook = read(buffer, { type: 'buffer', cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            if (!sheet) return NextResponse.json({ success: false, error: 'Spreadsheet has no sheets' }, { status: 422 });
            const rows = utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
            parsed = parseStatementRows(rows);
        } else {
            const { PDFParse } = await import('pdf-parse');
            const pdf = new PDFParse({ data: buffer });
            const result = await pdf.getText();
            const text = result?.text?.trim();
            if (!text) return NextResponse.json({ success: false, error: 'Could not extract text from PDF (scanned?). Try an image of the page.' }, { status: 422 });
            parsed = parseStatementPdfText(text);
        }

        if (!parsed.success) {
            return NextResponse.json({ success: false, error: parsed.error }, { status: 422 });
        }

        // 2. Agent import (Groq categorization + dedupe + batch save).
        const sourceTag = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        const importResult = await importStatementTransactions(uid, parsed.data.transactions, sourceTag);
        if (!importResult.success || !importResult.summary) {
            return NextResponse.json({ success: false, error: importResult.error || 'Import failed' }, { status: 500 });
        }

        // 3. Save the statement as a document record (best-effort storage upload).
        const storage = getAdminStorage();
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
        let storagePath = '';
        if (storage && bucketName) {
            storagePath = `documents/${uid}/${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            try {
                await storage.bucket(bucketName).file(storagePath).save(buffer, { resumable: false, contentType: file.type || 'application/octet-stream' });
            } catch (error) {
                console.error('Storage upload failed (continuing):', error);
                storagePath = '';
            }
        }

        await saveDocument(uid, {
            name,
            mimeType: file.type || 'application/octet-stream',
            size: buffer.length,
            storagePath,
            documentType: 'bank_statement',
            summary: `${parsed.data.transactions.length} transactions (${importResult.summary.imported} imported) from ${parsed.data.accountName || name}.`,
            keyFacts: [
                parsed.data.accountNumber ? `Account: ${parsed.data.accountNumber}` : '',
                parsed.data.period ? `Period: ${parsed.data.period}` : '',
                `${importResult.summary.imported} expenses imported`,
            ].filter(Boolean),
            insights: [
                `${importResult.summary.parsed} transactions parsed, ${importResult.summary.skipped} income/non-expense skipped`,
                `${importResult.summary.duplicates} duplicates already in your ledger`,
            ],
            transactionsImported: importResult.summary.imported,
        });

        return NextResponse.json({ success: true, summary: importResult.summary });
    } catch (error: unknown) {
        console.error('Statement import error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Statement import failed',
        }, { status: 500 });
    }
}
