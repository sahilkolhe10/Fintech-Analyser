// Financial Chat Agent for FinManage
import { geminiClient, AIResponse, ChatSession } from './gemini-client';
import { Holding } from '@/lib/firebase/firestore';
import { StockQuote } from '@/services/market';

export interface ChatContext {
    holdings?: Holding[];
    quotes?: Map<string, StockQuote>;
    totalValue?: number;
    currency?: 'INR' | 'USD';
    userPreferences?: { riskTolerance: 'low' | 'medium' | 'high'; investmentGoal: string };
}

class ChatAgent {
    private chatSession: ChatSession | null = null;
    private context: ChatContext = {};

    private readonly systemInstruction = `You are FinManage AI, an expert financial assistant. Be concise, informative, use the user's currency. This is educational info, not financial advice.`;

    setContext(context: ChatContext): void { this.context = { ...this.context, ...context }; }
    clearContext(): void { this.context = {}; this.chatSession = null; }
    startNewSession(): void { this.chatSession = geminiClient.createChat(this.systemInstruction); }

    private buildContextString(): string {
        if (!this.context.holdings?.length) return 'No portfolio context.';
        const holdings = this.context.holdings.map((h) => {
            const quote = this.context.quotes?.get(h.symbol);
            const value = h.quantity * (quote?.price || h.avgPrice);
            return `- ${h.name} (${h.symbol}): ${h.quantity} @ ${this.context.currency} ${value.toFixed(2)}`;
        }).join('\n');
        return `PORTFOLIO:\nTotal: ${this.context.currency} ${this.context.totalValue?.toFixed(2)}\n${holdings}`;
    }

    async chat(message: string, includeContext = true): Promise<AIResponse> {
        if (!this.chatSession) this.startNewSession();
        if (!this.chatSession) return { success: false, error: 'Failed to init chat' };
        const fullMessage = includeContext && Object.keys(this.context).length > 0
            ? `${this.buildContextString()}\n\nUSER: ${message}` : message;
        try {
            const result = await this.chatSession.sendMessage(fullMessage);
            return { success: true, text: result.response.text() };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : 'Chat failed' };
        }
    }

    async streamChat(message: string, onChunk: (text: string) => void): Promise<AIResponse> {
        const prompt = `${this.systemInstruction}\n\n${this.buildContextString()}\n\nUSER: ${message}`;
        return geminiClient.streamGenerate(prompt, onChunk);
    }

    async getDailyTip(): Promise<AIResponse> {
        const topics = ['diversification', 'risk management', 'compound interest', 'expense tracking'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        return geminiClient.generate(`Brief financial tip about ${topic} for Indian investor. Under 100 words.`);
    }

    async generateMarketSummary(indices: { name: string; change: number; changePercent: number }[]): Promise<AIResponse> {
        return geminiClient.generate(`Market summary for dashboard:\n${JSON.stringify(indices)}\n3-4 sentences, key takeaways.`);
    }
}

export const chatAgent = new ChatAgent();
