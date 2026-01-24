import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini Server-Side
const apiKey = process.env.GEMINI_API_KEY || '';
const client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const model = client ? client.getGenerativeModel({ model: 'gemini-1.5-flash' }) : null;

export async function POST(request: NextRequest) {
    if (!client || !model) {
        return NextResponse.json({ success: false, error: 'AI Service not configured (Missing Key)' }, { status: 500 });
    }

    try {
        const { message, context, history } = await request.json();

        // Construct a stateless prompt
        // We can include history if needed, but for now let's prioritize the current context and message
        const contextString = context || '';
        const historyString = history ? `\nCHAT HISTORY:\n${history}\n` : '';

        const systemPrompt = `You are FinManage AI, an expert financial assistant. Be concise, informative, and use the user's currency. This is educational info, not financial advice.`;

        const fullPrompt = `${systemPrompt}\n\n${contextString}${historyString}\nUSER: ${message}`;

        const result = await model.generateContent(fullPrompt);
        const text = result.response.text();

        return NextResponse.json({ success: true, text });
    } catch (error: any) {
        console.error('AI Chat API error:', error);
        return NextResponse.json({ success: false, error: error.message || 'AI generation failed' }, { status: 500 });
    }
}
