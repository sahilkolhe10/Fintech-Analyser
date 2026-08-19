// Financial Chat Agent for KhataHouse
// NOTE: imports gemini-client lazily — it pulls server-only LangChain/LangGraph
// dependencies and must not be bundled into client components.
import type { AIResponse, AIResponseWithActions, ChatSession } from './gemini-client';
import { Holding } from '@/lib/firebase/firestore';
import { StockQuote } from '@/services/market';

export interface ChatContext {
    holdings?: Holding[];
    quotes?: Map<string, StockQuote>;
    totalValue?: number;
    currency?: 'INR' | 'USD';
    expenses?: unknown;
    userPreferences?: { riskTolerance: 'low' | 'medium' | 'high'; investmentGoal: string };
}

class ChatAgent {
    private chatSession: ChatSession | null = null;
    private context: ChatContext = {};

    private readonly systemInstruction = `You are KhataHouse AI, an expert financial assistant. Be concise, informative, use the user's currency. This is educational info, not financial advice.`;

    setContext(context: ChatContext): void { this.context = { ...this.context, ...context }; }
    clearContext(): void { this.context = {}; this.chatSession = null; }
    async startNewSession(): Promise<void> {
        const { geminiClient } = await import('./gemini-client');
        this.chatSession = geminiClient.createChat(this.systemInstruction);
    }

    private buildContextString(): string {
        if (!this.context.holdings?.length) return 'No portfolio context.';
        const holdings = this.context.holdings.map((h) => {
            const quote = this.context.quotes?.get(h.symbol);
            const value = h.quantity * (quote?.price || h.avgPrice);
            return `- ${h.name} (${h.symbol}): ${h.quantity} @ ${this.context.currency} ${value.toFixed(2)}`;
        }).join('\n');
        return `PORTFOLIO:\nTotal: ${this.context.currency} ${this.context.totalValue?.toFixed(2)}\n${holdings}`;
    }

    async chat(
        message: string,
        options?: { uid?: string; token?: string; history?: string },
        includeContext = true
    ): Promise<AIResponseWithActions> {
        try {
            if (options?.uid && options?.token) {
                // Authenticated: server-side tool-enabled agent
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${options.token}`,
                    },
                    body: JSON.stringify({
                        message,
                        uid: options.uid,
                        history: options.history,
                    }),
                });

                const data = await response.json();
                return data as AIResponseWithActions;
            }

            // Legacy anonymous chat with client-side context
            const contextString = includeContext && Object.keys(this.context).length > 0
                ? this.buildContextString() : '';

            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    context: contextString,
                    history: options?.history,
                }),
            });

            const data = await response.json();
            return data as AIResponseWithActions;
        } catch (error) {
            console.error('Chat Agent Error:', error);
            return { success: false, error: 'Chat service unavailable' };
        }
    }

    async streamChat(message: string, onChunk: (text: string) => void): Promise<AIResponse> {
        const { geminiClient } = await import('./gemini-client');
        const prompt = `${this.systemInstruction}\n\n${this.buildContextString()}\n\nUSER: ${message}`;
        return geminiClient.streamGenerate(prompt, onChunk);
    }

    async getDailyTip(): Promise<AIResponse> {
        const { geminiClient } = await import('./gemini-client');
        const topics = ['diversification', 'risk management', 'compound interest', 'expense tracking'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        return geminiClient.generate(`Brief financial tip about ${topic} for Indian investor. Under 100 words.`);
    }

    async generateMarketSummary(indices: { name: string; change: number; changePercent: number }[]): Promise<AIResponse> {
        const { geminiClient } = await import('./gemini-client');
        return geminiClient.generate(`Market summary for dashboard:\n${JSON.stringify(indices)}\n3-4 sentences, key takeaways.`);
    }
}

export const chatAgent = new ChatAgent();
