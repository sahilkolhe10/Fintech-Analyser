import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini Server-Side
const apiKey = process.env.GEMINI_API_KEY || '';
const client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const model = client ? client.getGenerativeModel({ model: 'gemini-pro' }) : null;

export async function POST(request: NextRequest) {
    if (!client || !model) {
        console.error('AI Generate Error: Missing API Key');
        return NextResponse.json({ success: false, error: 'AI Service not configured' }, { status: 500 });
    }

    try {
        const { prompt } = await request.json();

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ success: true, text });
    } catch (error: any) {
        console.error('AI Generate API error:', error);
        return NextResponse.json({ success: false, error: error.message || 'AI generation failed' }, { status: 500 });
    }
}
