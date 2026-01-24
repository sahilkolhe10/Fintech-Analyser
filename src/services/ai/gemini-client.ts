// Gemini AI Client for FinManage
// Core AI service for all agentic features

import { GoogleGenerativeAI, GenerativeModel, ChatSession } from '@google/generative-ai';

// ============================================
// Types
// ============================================

export interface AIResponse {
    success: boolean;
    text?: string;
    error?: string;
}

export interface AIAnalysis<T = unknown> {
    success: boolean;
    data?: T;
    reasoning?: string;
    error?: string;
}

// ============================================
// Gemini Client Configuration
// ============================================

class GeminiClient {
    private client: GoogleGenerativeAI | null = null;
    private model: GenerativeModel | null = null;
    private apiKey: string;
    private modelName: string = 'gemini-1.5-flash';

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.initialize();
    }

    // Initialize the client
    private initialize(): void {
        if (this.apiKey) {
            this.client = new GoogleGenerativeAI(this.apiKey);
            this.model = this.client.getGenerativeModel({ model: this.modelName });
        }
    }

    // Check if configured
    isConfigured(): boolean {
        if (!this.apiKey) {
            console.warn('Gemini AI: API key not configured');
            return false;
        }
        return true;
    }

    // Set API key at runtime
    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        this.initialize();
    }

    // Get the model instance
    getModel(): GenerativeModel | null {
        return this.model;
    }

    // Simple text generation
    async generate(prompt: string): Promise<AIResponse> {
        // Client-side: use API route
        if (typeof window !== 'undefined') {
            try {
                const response = await fetch('/api/ai/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });
                return await response.json();
            } catch (error) {
                return { success: false, error: 'AI service unavailable' };
            }
        }

        // Server-side: use SDK
        if (!this.isConfigured() || !this.model) {
            return { success: false, error: 'Gemini AI not configured' };
        }

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            return { success: true, text };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI generation failed';
            console.error('Gemini AI error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Generate with structured output (JSON)
    async generateJSON<T>(prompt: string): Promise<AIAnalysis<T>> {
        if (!this.isConfigured() || !this.model) {
            return { success: false, error: 'Gemini AI not configured' };
        }

        try {
            const jsonPrompt = `${prompt}

IMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.
The response must be parseable by JSON.parse() directly.`;

            const result = await this.model.generateContent(jsonPrompt);
            const response = result.response;
            let text = response.text().trim();

            // Clean up potential markdown code blocks
            if (text.startsWith('```json')) {
                text = text.replace(/```json\n?/, '').replace(/\n?```$/, '');
            } else if (text.startsWith('```')) {
                text = text.replace(/```\n?/, '').replace(/\n?```$/, '');
            }

            const data = JSON.parse(text) as T;
            return { success: true, data };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI JSON generation failed';
            console.error('Gemini AI JSON error:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // Create a chat session
    createChat(systemInstruction?: string): ChatSession | null {
        if (!this.isConfigured() || !this.client) {
            return null;
        }

        const chatModel = this.client.getGenerativeModel({
            model: this.modelName,
            systemInstruction: systemInstruction || 'You are FinManage AI, a helpful financial assistant.',
        });

        return chatModel.startChat();
    }

    // Stream generation (for real-time chat)
    async streamGenerate(
        prompt: string,
        onChunk: (text: string) => void
    ): Promise<AIResponse> {
        if (!this.isConfigured() || !this.model) {
            return { success: false, error: 'Gemini AI not configured' };
        }

        try {
            const result = await this.model.generateContentStream(prompt);
            let fullText = '';

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
                onChunk(chunkText);
            }

            return { success: true, text: fullText };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'AI stream generation failed';
            return { success: false, error: errorMessage };
        }
    }
}

// Export singleton instance
export const geminiClient = new GeminiClient();

// Export types
export type { ChatSession };
