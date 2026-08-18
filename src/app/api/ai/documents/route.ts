import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, isAdminConfigured } from '@/lib/firebase/admin';
import { processDocument, isAllowedMime } from '@/server/document-processor';
import { getDocuments, deleteStoredDocument } from '@/server/firestore';

export const maxDuration = 120;

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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
        const importExpenses = formData.get('importExpenses') === 'true';

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
        }

        const mimeType = file.type || 'application/octet-stream';
        if (!isAllowedMime(mimeType) && !/\.(pdf|png|jpe?g|webp|xlsx?|csv)$/i.test(file.name)) {
            return NextResponse.json({ success: false, error: 'Unsupported file type. Use PDF, image (PNG/JPG), Excel or CSV.' }, { status: 400 });
        }
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ success: false, error: 'File too large (max 10MB)' }, { status: 400 });
        }

        const result = await processDocument({
            uid,
            name: file.name,
            mimeType,
            buffer: Buffer.from(await file.arrayBuffer()),
            importExpenses,
        });

        if (!result.success || !result.analysis) {
            return NextResponse.json({ success: false, error: result.error || 'Document processing failed' }, { status: 422 });
        }

        return NextResponse.json({
            success: true,
            docId: result.docId,
            documentType: result.analysis.documentType,
            summary: result.analysis.summary,
            keyFacts: result.analysis.keyFacts,
            insights: result.analysis.insights,
            transactionsFound: result.analysis.transactions.length,
            transactionsImported: result.transactionsImported,
        });
    } catch (error: unknown) {
        console.error('Document upload error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Document processing failed',
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const ids = await verifyUid(request);
    if (ids instanceof NextResponse) return ids;

    const result = await getDocuments(ids.uid);
    return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const ids = await verifyUid(request);
    if (ids instanceof NextResponse) return ids;

    const docId = request.nextUrl.searchParams.get('docId');
    if (!docId) {
        return NextResponse.json({ success: false, error: 'docId required' }, { status: 400 });
    }

    const result = await deleteStoredDocument(ids.uid, docId);
    return NextResponse.json(result);
}