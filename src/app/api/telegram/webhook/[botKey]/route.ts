// Per-user Telegram webhook — serves any user's own bot via the botId in the
// URL path. The bot token is resolved from Firestore (users/{uid}/telegramBot).

import { NextRequest, NextResponse } from 'next/server';
import { getBotOwnerByBotId } from '@/server/firestore';
import { handleTelegramUpdate } from '@/server/telegram-handler';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ botKey: string }> }
) {
    const { botKey } = await params;

    // Try the global bot first (its webhook path is /api/telegram/webhook/<botId>).
    const globalToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const globalBotId = globalToken.split(':')[0];
    if (globalBotId && botKey === globalBotId) {
        const { isBotConfigured } = await import('@/services/telegram');
        if (isBotConfigured()) {
            return handleTelegramUpdate(request, globalToken);
        }
    }

    // Per-user bot.
    const owner = await getBotOwnerByBotId(botKey);
    if (!owner.uid || !owner.botToken) {
        return NextResponse.json({ ok: false, error: 'Bot not found' }, { status: 404 });
    }

    return handleTelegramUpdate(request, owner.botToken);
}
