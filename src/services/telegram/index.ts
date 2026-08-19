// Telegram Bot API client (plain fetch, no heavy deps).
// Supports both the global server bot (TELEGRAM_BOT_TOKEN) and per-user bots
// (a user's own token, stored in Firestore). Every call takes an optional
// token so the webhook can serve many bots from one route.

const TELEGRAM_API = 'https://api.telegram.org/bot';

export function getGlobalBotToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN || '';
}

export function isBotConfigured(token?: string): boolean {
    return Boolean((token ?? getGlobalBotToken()).trim());
}

interface TelegramResponse<T = unknown> {
    ok: boolean;
    result?: T;
    description?: string;
}

async function tgCall<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    token?: string
): Promise<TelegramResponse<T>> {
    const botToken = (token ?? getGlobalBotToken()).trim();
    if (!botToken) return { ok: false, description: 'Bot token not configured' };

    const res = await fetch(`${TELEGRAM_API}${botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });

    try {
        return (await res.json()) as TelegramResponse<T>;
    } catch {
        return { ok: false, description: `Telegram API error (${res.status})` };
    }
}

export interface TgUser {
    id: number;
    is_bot: boolean;
    first_name?: string;
    username?: string;
}

export interface TgMessage {
    message_id: number;
    chat: { id: number; type: string; first_name?: string; username?: string };
    text?: string;
    from?: { id: number; first_name?: string; username?: string };
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    photo?: { file_id: string; width: number; height: number }[];
    caption?: string;
}

export interface TgUpdate {
    update_id: number;
    message?: TgMessage;
}

export const getMe = (token?: string) => tgCall<TgUser>('getMe', {}, token);

export const sendMessage = async (
    chatId: number | string,
    text: string,
    opts: { disableWebPagePreview?: boolean } = {},
    token?: string
): Promise<boolean> => {
    const truncated = text.length > 4000 ? `${text.slice(0, 3900)}\n\n...(truncated)` : text;
    const res = await tgCall('sendMessage', {
        chat_id: chatId,
        text: truncated,
        disable_web_page_preview: true,
        ...opts,
    }, token);
    if (!res.ok) {
        console.error('Telegram sendMessage failed:', res.description);
    }
    return res.ok;
};

export const sendChatAction = async (
    chatId: number | string,
    action: 'typing' | 'upload_document',
    token?: string
): Promise<void> => {
    await tgCall('sendChatAction', { chat_id: chatId, action }, token);
};

export const setWebhook = async (
    url: string,
    token?: string
): Promise<{ ok: boolean; description?: string }> => {
    const res = await tgCall('setWebhook', { url }, token);
    return { ok: res.ok, description: res.description };
};

export const getFile = async (
    fileId: string,
    token?: string
): Promise<{ file_path?: string; error?: string }> => {
    const res = await tgCall<{ file_path: string }>('getFile', { file_id: fileId }, token);
    if (!res.ok || !res.result) return { error: res.description || 'getFile failed' };
    return { file_path: res.result.file_path };
};

export const downloadFile = async (
    filePath: string,
    token?: string
): Promise<{ buffer?: Buffer; error?: string }> => {
    const botToken = (token ?? getGlobalBotToken()).trim();
    try {
        const res = await fetch(`${TELEGRAM_API}${botToken}/${filePath}`);
        if (!res.ok) return { error: `Download failed (${res.status})` };
        return { buffer: Buffer.from(await res.arrayBuffer()) };
    } catch (error: unknown) {
        return { error: error instanceof Error ? error.message : 'Download failed' };
    }
};
