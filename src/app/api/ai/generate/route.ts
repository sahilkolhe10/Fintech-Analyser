import { NextRequest, NextResponse } from 'next/server';
import { geminiClient } from '@/services/ai/gemini-client';

export async function POST(request: NextRequest) {
    if (!geminiClient.isConfigured()) {
        console.error('AI Generate Error: Missing API Key');
        return NextResponse.json({ success: false, error: 'AI Service not configured' }, { status: 500 });
    }

    try {
        const { prompt } = await request.json();

        const result = await geminiClient.generate(prompt);

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, text: result.text });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'AI generation failed';
        console.error('AI Generate API error:', errorMessage);
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
