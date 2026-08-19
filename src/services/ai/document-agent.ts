// Document Analysis Agent for KhataHouse
// Extracts financial information from uploaded documents (bank statements,
// payslips, bills, receipts) using text extraction + Gemini analysis.

import { geminiClient, AIAnalysis } from './gemini-client';

// ============================================
// Types
// ============================================

export interface DocumentTransaction {
    date: string;
    description: string;
    amount: number;
    category: string;
    type: 'expense' | 'income';
}

export interface DocumentAnalysis {
    documentType: 'bank_statement' | 'payslip' | 'bill' | 'receipt' | 'other';
    summary: string;
    keyFacts: string[];
    transactions: DocumentTransaction[];
    insights: string[];
}

const ANALYSIS_PROMPT = `You are a financial document analyst. Analyze the provided document content and respond ONLY with valid JSON (no markdown, no code fences):

{
  "documentType": "<bank_statement|payslip|bill|receipt|other>",
  "summary": "<2-3 sentence summary of the document>",
  "keyFacts": ["<important figures or details, max 6>"],
  "transactions": [
    {
      "date": "<YYYY-MM-DD if identifiable, else empty string>",
      "description": "<short description>",
      "amount": <positive number>,
      "category": "<Food|Transport|Shopping|Entertainment|Housing|Health|Education|Utilities|Other>",
      "type": "<expense|income>"
    }
  ],
  "insights": ["<useful financial insights detected, max 4>"]
}

Rules:
- Only include a transaction if you are confident about its amount.
- Combine repetitive micro-purchases where sensible.
- If the document has no transactions, return an empty array.
- Amounts are in the document's currency; do not convert.`;

export interface ExtractResult {
    success: boolean;
    text?: string;
    base64?: string;
    mimeType?: string;
    error?: string;
}

// ============================================
// Document Agent
// ============================================

class DocumentAgent {
    // Analyze parsed/extracted document content
    async analyze(input: {
        name: string;
        mimeType: string;
        text?: string;
        base64?: string;
    }): Promise<AIAnalysis<DocumentAnalysis>> {
        const prompt = `DOCUMENT: ${input.name}\nMIME: ${input.mimeType}\n\n${ANALYSIS_PROMPT}`;

        let result;
        if (input.base64 && (input.mimeType.startsWith('image/') || input.mimeType === 'application/pdf')) {
            // Multimodal: Gemini reads images (and PDFs) directly
            const vision = await geminiClient.generateWithFile(
                { mimeType: input.mimeType, base64: input.base64 },
                prompt
            );
            if (!vision.success || !vision.text) {
                return { success: false, error: vision.error || 'Vision analysis failed' };
            }
            result = this.parseJsonFromText(vision.text);
        } else if (input.text) {
            const content = input.text.slice(0, 40000);
            result = await geminiClient.generateJSON<DocumentAnalysis>(
                `${prompt}\n\nDOCUMENT CONTENT:\n${content}`
            );
        } else {
            return { success: false, error: 'No readable content in document' };
        }

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        const analysis = result.data;
        analysis.transactions = (analysis.transactions || []).map((t) => ({
            ...t,
            category: this.normalizeCategory(t.category),
        }));

        return { success: true, data: analysis };
    }

    private normalizeCategory(category: string | undefined): string {
        const valid = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Housing', 'Health', 'Education', 'Utilities', 'Other'];
        if (!category) return 'Other';
        const match = valid.find((c) => c.toLowerCase() === category.trim().toLowerCase());
        return match || 'Other';
    }

    private parseJsonFromText(text: string): { success: boolean; data?: DocumentAnalysis; error?: string } {
        try {
            let cleaned = text.trim();
            if (cleaned.startsWith('```json')) {
                cleaned = cleaned.replace(/```json\n?/, '').replace(/\n?```$/, '');
            } else if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/```\n?/, '').replace(/\n?```$/, '');
            }
            const data = JSON.parse(cleaned) as DocumentAnalysis;
            return { success: true, data };
        } catch (error: unknown) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to parse AI response' };
        }
    }
}

export const documentAgent = new DocumentAgent();