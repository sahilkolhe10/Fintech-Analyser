import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, sendChatAction, getFile, downloadFile, isBotConfigured, type TgUpdate } from '@/services/telegram';
import { consumeTelegramCode, linkTelegramChat, unlinkTelegramChat, getUidForChat } from '@/server/firestore';
import { runServerChat } from '@/server/ai-chat';
import { processDocument } from '@/server/document-processor';

export const maxDuration = 120;

const BOT_HELP = `🤖 KhataHouse Bot — commands:
/start <code> — link your KhataHouse account (get a code from Settings → Link Telegram)
/link — how to link
/unlink — unlink this chat
/chat <message> — talk to the AI advisor
/add-expense <amount> <description> — add an expense
/summary — monthly spending summary
/portfolio — your holdings
/council <question> — run the AI council debate
Or just send a document (PDF/image/Excel) to analyze it.`;

export async function POST(request: NextRequest) {
    if (!isBotConfigured()) {
        return NextResponse.json({ ok: false, error: 'Bot not configured' }, { status: 500 });
    }

    let update: TgUpdate;
    try {
        update = await request.json();
    } catch {
        return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || message.caption || '').trim();

    try {
        await sendChatAction(chatId, 'typing');

        // ---- Linking commands ----
        if (text.startsWith('/start')) {
            const parts = text.split(/\s+/);
            const code = parts[1];

            if (!code) {
                await sendMessage(chatId,
                    '👋 Welcome to KhataHouse Bot!\n\nTo link your KhataHouse account:\n1. Open the app → Settings → Link Telegram\n2. Send: /start <your 6-digit code>\n\nOr send /help for all commands.'
                );
                return NextResponse.json({ ok: true });
            }

            const consume = await consumeTelegramCode(code);
            if (!consume.success || !consume.uid) {
                await sendMessage(chatId, `❌ ${consume.error || 'Could not link. Try again.'}`);
                return NextResponse.json({ ok: true });
            }

            await linkTelegramChat(consume.uid, String(chatId));
            await sendMessage(chatId, '✅ Account linked! You can now chat with your KhataHouse AI, add expenses, and upload documents.\n\nSend /help for commands.');
            return NextResponse.json({ ok: true });
        }

        if (text === '/unlink') {
            await unlinkTelegramChat(String(chatId));
            await sendMessage(chatId, '🔗 Chat unlinked from KhataHouse.');
            return NextResponse.json({ ok: true });
        }

        if (text === '/help') {
            await sendMessage(chatId, BOT_HELP);
            return NextResponse.json({ ok: true });
        }

        const uid = await getUidForChat(String(chatId));

        // ---- Documents ----
        if (message.document || (message.photo && message.photo.length > 0)) {
            await sendChatAction(chatId, 'upload_document');
            if (!uid) {
                await sendMessage(chatId, '🔒 Link your account first: send /start <code> (code from Settings → Link Telegram).');
                return NextResponse.json({ ok: true });
            }

            let fileId: string | undefined;
            let fileName = message.document?.file_name || 'document';
            let mimeType = message.document?.mime_type || '';

            if (message.document) {
                fileId = message.document.file_id;
            } else if (message.photo && message.photo.length > 0) {
                fileId = message.photo[message.photo.length - 1].file_id;
                fileName = 'photo.jpg';
                mimeType = 'image/jpeg';
            }

            if (!fileId) {
                await sendMessage(chatId, '❌ Could not read that file.');
                return NextResponse.json({ ok: true });
            }

            const file = await getFile(fileId);
            if (!file.file_path) {
                await sendMessage(chatId, `❌ ${file.error || 'Failed to download file.'}`);
                return NextResponse.json({ ok: true });
            }

            const download = await downloadFile(file.file_path);
            if (!download.buffer) {
                await sendMessage(chatId, '❌ Failed to download the file.');
                return NextResponse.json({ ok: true });
            }

            await sendMessage(chatId, '📄 Analyzing document… (may take a minute)');

            const result = await processDocument({
                uid,
                name: fileName,
                mimeType,
                buffer: download.buffer,
                importExpenses: true,
            });

            if (!result.success || !result.analysis) {
                await sendMessage(chatId, `❌ ${result.error || 'Could not analyze the document.'}`);
                return NextResponse.json({ ok: true });
            }

            const a = result.analysis;
            const keyFacts = a.keyFacts.length ? `\n\nKey facts:\n• ${a.keyFacts.slice(0, 4).join('\n• ')}` : '';
            const insights = a.insights.length ? `\n\nInsights:\n• ${a.insights.slice(0, 3).join('\n• ')}` : '';
            await sendMessage(chatId,
                `✅ ${a.summary}${keyFacts}${insights}\n\nImported ${result.transactionsImported || 0} expenses from this document.`
            );
            return NextResponse.json({ ok: true });
        }

        // ---- Plain chat / commands ----
        if (!uid) {
            await sendMessage(chatId, '🔒 This chat is not linked to a KhataHouse account.\n\nSend /start <code> using the code from Settings → Link Telegram.\n\nOr send /help.');
            return NextResponse.json({ ok: true });
        }

        if (text.startsWith('/add-expense') || text.startsWith('/add')) {
            const rest = text.replace(/^\/(add-expense|add)\s*/, '').trim();
            if (!rest) {
                await sendMessage(chatId, 'Usage: /add-expense <amount> <description>\nExample: /add-expense 250 lunch with team');
                return NextResponse.json({ ok: true });
            }
            const amountMatch = rest.match(/^([\d,.]+)\s*(.*)$/);
            if (!amountMatch) {
                await sendMessage(chatId, 'Could not read the amount. Example: /add-expense 250 lunch');
                return NextResponse.json({ ok: true });
            }
            const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
            const description = amountMatch[2] || 'Telegram expense';
            if (isNaN(amount) || amount <= 0) {
                await sendMessage(chatId, 'Invalid amount.');
                return NextResponse.json({ ok: true });
            }
            const result = await runServerChat({
                uid,
                message: `Add an expense of ${amount} for "${description}". Use the add_expense tool.`,
            });
            await sendMessage(chatId, result.text || 'Expense recorded.');
            return NextResponse.json({ ok: true });
        }

        if (text.startsWith('/summary')) {
            const result = await runServerChat({
                uid,
                message: 'Give me my current month spending summary using the get_expenses_summary tool. Be concise.',
            });
            await sendMessage(chatId, result.text || 'Could not fetch summary.');
            return NextResponse.json({ ok: true });
        }

        if (text.startsWith('/portfolio')) {
            const result = await runServerChat({
                uid,
                message: 'Summarize my portfolio holdings briefly.',
            });
            await sendMessage(chatId, result.text || 'Could not fetch portfolio.');
            return NextResponse.json({ ok: true });
        }

        if (text.startsWith('/council')) {
            const question = text.replace(/^\/council\s*/, '').trim();
            if (!question) {
                await sendMessage(chatId, 'Usage: /council <question>\nExample: /council Should I invest in crypto?');
                return NextResponse.json({ ok: true });
            }
            await sendMessage(chatId, '🏛️ Convening the AI council… (up to a minute)');
            const { councilAgent } = await import('@/services/ai/council-agent');
            const holdings = (await import('@/server/firestore')).getServerHoldings;
            const h = await holdings(uid);
            const holdingsText = h.success && h.data && h.data.length
                ? h.data.map((x: { name: string; symbol: string; quantity: number; avgPrice: number }) => `- ${x.name} (${x.symbol}): ${x.quantity} @ ${x.avgPrice}`).join('\n')
                : 'No holdings.';
            const result = await councilAgent.debate({
                question,
                context: `PORTFOLIO:\n${holdingsText}`,
            });
            if (!result.success || !result.data) {
                await sendMessage(chatId, `❌ Council failed: ${result.error}`);
                return NextResponse.json({ ok: true });
            }
            const d = result.data;
            const votes = d.members.map((m) => `• ${m.member.name} (${m.member.role}): ${m.verdict.position} — ${m.verdict.confidence}%`).join('\n');
            const consensus = d.synthesis.consensus.length ? `\n\nConsensus:\n• ${d.synthesis.consensus.slice(0, 3).join('\n• ')}` : '';
            const actions = d.synthesis.actionItems.length ? `\n\nTop actions:\n• ${d.synthesis.actionItems.slice(0, 3).join('\n• ')}` : '';
            await sendMessage(chatId, `🏛️ Council Verdict\n\n${votes}\n\n${d.synthesis.verdict}${consensus}${actions}`);
            return NextResponse.json({ ok: true });
        }

        if (text.startsWith('/chat')) {
            const rest = text.replace(/^\/chat\s*/, '').trim();
            if (!rest) {
                await sendMessage(chatId, 'Usage: /chat <message>');
                return NextResponse.json({ ok: true });
            }
            const result = await runServerChat({ uid, message: rest });
            await sendMessage(chatId, result.text || 'Sorry, I could not process that.');
            return NextResponse.json({ ok: true });
        }

        // Default: treat as a chat message
        const result = await runServerChat({ uid, message: text });
        await sendMessage(chatId, result.text || 'Sorry, I could not process that.');
        return NextResponse.json({ ok: true });
    } catch (error: unknown) {
        console.error('Telegram webhook error:', error);
        try {
            await sendMessage(chatId, '⚠️ Something went wrong processing your message. Try again.');
        } catch {
            // ignore
        }
        return NextResponse.json({ ok: true });
    }
}