// Telegram Bot API client (plain fetch, no heavy deps)

const TELEGRAM_API = 'https://api.telegram.org/bot';

export function getBotToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN || '';
}

export function isBotConfigured(): boolean {
    return Boolean(getBotToken());
}

interface TelegramResponse<T = unknown> {
    ok: boolean;
    result?: T;
    description?: string;
}

async function tgCall<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<TelegramResponse<T>> {
    const token = getBotToken();
    if (!token) return { ok: false, description: 'Bot token not configured' };

    const res = await fetch(`${TELEGRAM_API}${token}/${method}`, {
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

export const getMe = () => tgCall<TgUser>('getMe');

export const sendMessage = async (
    chatId: number | string,
    text: string,
    opts: { disableWebPagePreview?: boolean } = {}
): Promise<boolean> => {
    const truncated = text.length > 4000 ? `${text.slice(0, 3900)}\n\n...(truncated)` : text;
    const res = await tgCall('sendMessage', {
        chat_id: chatId,
        text: truncated,
        disable_web_page_preview: true,
        ...opts,
    });
    if (!res.ok) {
        console.error('Telegram sendMessage failed:', res.description);
    }
    return res.ok;
};

export const sendChatAction = async (chatId: number | string, action: 'typing' | 'upload_document'): Promise<void> => {
    await tgCall('sendChatAction', { chat_id: chatId, action });
};

export const setWebhook = async (url: string): Promise<{ ok: boolean; description?: string }> => {
    const res = await tgCall('setWebhook', { url });
    return { ok: res.ok, description: res.description };
};

export const getFile = async (fileId: string): Promise<{ file_path?: string; error?: string }> => {
    const res = await tgCall<{ file_path: string }>('getFile', { file_id: fileId });
    if (!res.ok || !res.result) return { error: res.description || 'getFile failed' };
    return { file_path: res.result.file_path };
};

export const downloadFile = async (filePath: string): Promise<{ buffer?: Buffer; error?: string }> => {
    const token = getBotToken();
    try {
        const res = await fetch(`${TELEGRAM_API}${token}/${filePath}`);
        if (!res.ok) return { error: `Download failed (${res.status})` };
        return { buffer: Buffer.from(await res.arrayBuffer()) };
    } catch (error: unknown) {
        return { error: error instanceof Error ? error.message : 'Download failed' };
    }
};