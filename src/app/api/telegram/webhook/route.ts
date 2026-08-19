import { NextRequest, NextResponse } from 'next/server';
import { isBotConfigured, getGlobalBotToken } from '@/services/telegram';
import { handleTelegramUpdate } from '@/server/telegram-handler';

// Global bot webhook (TELEGRAM_BOT_TOKEN).
// Per-user bots use /api/telegram/webhook/[botKey] instead.
export async function POST(request: NextRequest) {
    if (!isBotConfigured()) {
        return NextResponse.json({ ok: false, error: 'Bot not configured' }, { status: 500 });
    }
    return handleTelegramUpdate(request, getGlobalBotToken());
}
