// Shared server-side AI chat runner.
// Used by /api/ai/chat and the Telegram bot so both channels behave identically.

import { geminiClient } from '@/services/ai/gemini-client';
import {
    agentToolDefinitions,
    executeAgentTool,
    buildFinancialContextString,
} from '@/services/ai/tool-executor';
import { getServerHoldings, saveServerChatMessage } from '@/server/firestore';

export interface ServerChatResult {
    success: boolean;
    text?: string;
    actions?: { name: string; args: Record<string, unknown> }[];
    error?: string;
}

const SYSTEM_INSTRUCTION = `You are FinManage AI, an expert personal finance assistant built into the FinManage app.
You help with portfolio analysis, expense tracking, budgeting, financial documents, and general investing questions.
You can take real actions using the provided tools (e.g. adding or deleting expenses, checking budgets, listing uploaded documents).
- Be concise and conversational.
- Use the user's currency (INR unless told otherwise).
- If the user asks to spend money on something non-financial or risky, be careful.
- This is educational information, not financial advice.`;

export async function runServerChat(input: {
    uid: string;
    message: string;
    history?: string;
}): Promise<ServerChatResult> {
    try {
        await saveServerChatMessage(input.uid, 'user', input.message);

        const financialContext = await buildFinancialContextString({ uid: input.uid });

        const holdings = await getServerHoldings(input.uid);
        let portfolioContext = '';
        if (holdings.success && holdings.data && holdings.data.length > 0) {
            const lines = holdings.data.slice(0, 15).map((h) =>
                `- ${h.name} (${h.symbol}): ${h.quantity} units @ avg ${h.avgPrice} (${h.type})`
            ).join('\n');
            portfolioContext = `\nPORTFOLIO:\n${lines}`;
        }

        const historyContext = input.history
            ? `\nCHAT HISTORY:\n${input.history}`
            : '';

        const prompt = `${financialContext}${portfolioContext}${historyContext}\n\nUSER: ${input.message}`;

        const result = await geminiClient.generateWithTools({
            prompt,
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: agentToolDefinitions(),
            execute: (name, args) => executeAgentTool(name, args, { uid: input.uid }),
        });

        if (result.text) {
            await saveServerChatMessage(input.uid, 'assistant', result.text);
        }

        return {
            success: result.success,
            text: result.text,
            actions: result.actions,
            error: result.error,
        };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'AI chat failed',
        };
    }
}

// Legacy stateless chat (no user context / no tools) — keeps old behavior
const LEGACY_SYSTEM = `You are FinManage AI, an expert financial assistant. Be concise, informative, and use the user's currency. This is educational info, not financial advice.`;

export async function runLegacyChat(input: {
    message: string;
    context?: string;
    history?: string;
}): Promise<ServerChatResult> {
    try {
        const result = await geminiClient.generate(
            `${LEGACY_SYSTEM}\n\n${input.context || ''}${input.history ? `\nCHAT HISTORY:\n${input.history}` : ''}\nUSER: ${input.message}`
        );
        return { success: result.success, text: result.text, error: result.error };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'AI chat failed',
        };
    }
}