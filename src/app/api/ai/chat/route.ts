import { NextRequest, NextResponse } from 'next/server';
import { runServerChat, runLegacyChat } from '@/server/ai-chat';
import { getAdminAuth } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
    try {
        const { message, context, history, uid } = await request.json();

        if (!message || typeof message !== 'string') {
            return NextResponse.json({ success: false, error: 'Message required' }, { status: 400 });
        }

        if (uid && typeof uid === 'string') {
            // Authenticated: tool-enabled agent (add/delete expenses, budgets, documents)
            const auth = getAdminAuth();
            const authHeader = request.headers.get('authorization') || '';
            const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

            if (auth && idToken) {
                try {
                    const decoded = await auth.verifyIdToken(idToken);
                    if (decoded.uid !== uid) {
                        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
                    }
                } catch {
                    return NextResponse.json({ success: false, error: 'Invalid session token' }, { status: 401 });
                }
            }

            const result = await runServerChat({ uid, message, history });
            return NextResponse.json(result);
        }

        // Backward-compatible stateless chat (no uid)
        const result = await runLegacyChat({ message, context, history });
        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('AI Chat API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'AI generation failed',
        }, { status: 500 });
    }
}