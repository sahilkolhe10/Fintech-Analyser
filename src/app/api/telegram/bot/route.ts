import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, isAdminConfigured } from '@/lib/firebase/admin';
import { saveUserTelegramBot, deleteUserTelegramBot, getUserTelegramBot } from '@/server/firestore';
import { getMe, setWebhook, sendMessage } from '@/services/telegram';

export const maxDuration = 60;

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

// POST /api/telegram/bot — save the user's own bot token and register the webhook.
export async function POST(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const ids = await verifyUid(request);
    if (ids instanceof NextResponse) return ids;
    const uid = ids.uid;

    try {
        const { botToken } = await request.json();
        const token = String(botToken || '').trim();
        if (!token || !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
            return NextResponse.json({ success: false, error: 'Invalid bot token. Get one from @BotFather → /newbot.' }, { status: 400 });
        }

        // Validate the token against Telegram.
        const me = await getMe(token);
        if (!me.ok || !me.result) {
            return NextResponse.json({ success: false, error: me.description || 'Telegram rejected this token. Is it correct?' }, { status: 400 });
        }

        const botId = token.split(':')[0];
        const webhookUrl = `${(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/telegram/webhook/${botId}`;

        // Register the webhook for this bot.
        const wh = await setWebhook(webhookUrl, token);
        if (!wh.ok) {
            return NextResponse.json({ success: false, error: wh.description || 'Could not register webhook' }, { status: 400 });
        }

        const saved = await saveUserTelegramBot(uid, token, me.result.username);
        if (!saved.success) {
            return NextResponse.json({ success: false, error: saved.error }, { status: 500 });
        }

        // Friendly confirmation in the chat itself.
        await sendMessage(me.result.id, '✅ KhataHouse AI connected! Send /start <code> from Settings → Link Telegram to link this chat.', {}, token);

        return NextResponse.json({
            success: true,
            botUsername: me.result.username,
            botId,
            webhookUrl,
        });
    } catch (error: unknown) {
        console.error('Telegram bot setup error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Bot setup failed',
        }, { status: 500 });
    }
}

// DELETE /api/telegram/bot — remove the user's bot config.
export async function DELETE(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const ids = await verifyUid(request);
    if (ids instanceof NextResponse) return ids;

    // Best-effort: try to clear the webhook so the bot stops calling us.
    const existing = await getUserTelegramBot(ids.uid);
    if (existing.success && existing.data?.botToken) {
        await setWebhook('', existing.data.botToken);
    }

    const result = await deleteUserTelegramBot(ids.uid);
    return NextResponse.json(result);
}

// GET /api/telegram/bot — the user's saved bot config (token masked).
export async function GET(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const ids = await verifyUid(request);
    if (ids instanceof NextResponse) return ids;

    const result = await getUserTelegramBot(ids.uid);
    if (!result.success || !result.data) {
        return NextResponse.json({ success: result.success, data: null });
    }
    const { botToken, ...rest } = result.data;
    return NextResponse.json({
        success: true,
        data: {
            ...rest,
            hasToken: Boolean(botToken),
            botTokenMasked: botToken ? `${botToken.slice(0, 6)}…${botToken.slice(-4)}` : '',
        },
    });
}
