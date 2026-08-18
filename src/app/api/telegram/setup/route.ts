import { NextRequest, NextResponse } from 'next/server';
import { setWebhook, getMe, isBotConfigured } from '@/services/telegram';

// Registers the Telegram webhook. Guarded by TELEGRAM_WEBHOOK_SECRET.
// GET /api/telegram/setup?secret=...&url=<optional>
export async function GET(request: NextRequest) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || request.nextUrl.searchParams.get('secret') !== secret) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isBotConfigured()) {
        return NextResponse.json({ success: false, error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 });
    }

    const providedUrl = request.nextUrl.searchParams.get('url');
    const appUrl = providedUrl || process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
        return NextResponse.json({ success: false, error: 'Provide ?url= or set NEXT_PUBLIC_APP_URL' }, { status: 400 });
    }

    const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`;
    const result = await setWebhook(webhookUrl);
    const me = await getMe();

    return NextResponse.json({
        success: result.ok || result.description?.includes('already'),
        description: result.description,
        webhookUrl,
        bot: me.ok ? `@${me.result?.username}` : undefined,
    });
}