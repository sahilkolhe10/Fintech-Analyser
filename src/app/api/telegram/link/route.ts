import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, isAdminConfigured } from '@/lib/firebase/admin';
import { createTelegramCode } from '@/server/firestore';
import { getMe, isBotConfigured } from '@/services/telegram';

export async function POST(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const auth = getAdminAuth();
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!auth || !idToken) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    let uid: string;
    try {
        uid = (await auth.verifyIdToken(idToken)).uid;
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid session token' }, { status: 401 });
    }

    const result = await createTelegramCode(uid);
    if (!result.success || !result.code) {
        return NextResponse.json({ success: false, error: result.error || 'Failed to create code' }, { status: 500 });
    }

    let botUsername: string | undefined;
    if (isBotConfigured()) {
        const me = await getMe();
        if (me.ok && me.result?.username) {
            botUsername = me.result.username;
        }
    }

    return NextResponse.json({
        success: true,
        code: result.code,
        expiresInMinutes: 10,
        botUsername,
        botConfigured: isBotConfigured(),
    });
}