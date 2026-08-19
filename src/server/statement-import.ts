// Agent-driven bank statement import.
// Extracted statement transactions are passed to the LLM agent (Groq) which
// assigns KhataHouse expense categories, then expenses are deduped against
// existing ones and saved to Firestore in batches.

import { Timestamp } from 'firebase-admin/firestore';
import { geminiClient } from '@/services/ai/gemini-client';
import {
    addServerExpense,
    getServerExpenses,
    normalizeCategory,
} from '@/server/expenses';
import type { ParsedTransaction } from '@/server/statement-parser';

const CATEGORY_PROMPT = `You are KhataHouse's expense categorization agent. Given a list of bank statement transactions (date, description, amount, type), assign each one a KhataHouse expense category.

Categories (pick exactly one per transaction):
- Food (restaurants, groceries, chai/coffee, snacks)
- Transport (fuel, cabs, auto, metro, parking, tolls)
- Shopping (retail, clothing, electronics, marketplace purchases)
- Entertainment (movies, streaming, gaming, events)
- Housing (rent, maintenance, furnishings)
- Health (pharmacy, doctor, hospital, gym)
- Education (courses, books, tuition, fees)
- Utilities (electricity, water, gas, internet, mobile recharge)
- Other (anything that fits no category above; also ATM cash withdrawals, transfers, investments)

Rules:
- Transactions that are income (salary, refunds, transfers in) are NOT expenses — mark them "skip".
- Bank transfers between own accounts and ATM withdrawals are expenses with category "Other".
- Subscriptions (Netflix, Spotify, Jio) → Entertainment.
- Insurance premiums → Other.
- Rent → Housing.
- Respond ONLY with valid JSON, an ARRAY of category strings in the same order as the input, one entry per transaction.
  Example for 3 transactions: ["Food", "Other", "skip"]
  Use "skip" (not a category) for income/non-expenses.
- Do not change amounts or dates. Do not invent transactions.`;

type AgentCategoryResult = string | { index?: number; category?: string; skip?: boolean };

export interface StatementImportSummary {
    parsed: number;
    skipped: number;      // income / non-expense transactions
    duplicates: number;   // already in the ledger
    imported: number;     // newly added
    totalAmount: number;  // sum of newly imported expenses
}

const CHUNK_SIZE = 40;

export const importStatementTransactions = async (
    uid: string,
    transactions: ParsedTransaction[],
    sourceName: string
): Promise<{ success: boolean; summary?: StatementImportSummary; error?: string }> => {
    try {
        const expenses = transactions.filter((t) => t.type === 'expense');

        // 1. Dedupe against existing expenses (amount + date + description prefix).
        const existingResult = await getServerExpenses(uid);
        if (!existingResult.success) return { success: false, error: existingResult.error };
        const existing = existingResult.data || [];
        const seen = new Set(
            existing.map((e) => {
                const d = e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date as unknown as string);
                return `${e.amount.toFixed(2)}|${d.toISOString().slice(0, 10)}|${e.description.slice(0, 40)}`;
            })
        );
        const fresh = expenses.filter((t) => {
            const key = `${t.amount.toFixed(2)}|${t.date}|${t.description.slice(0, 40)}`;
            return !seen.has(key);
        });

        // 2. Agent categorizes the fresh transactions (Groq preferred).
        const categorized = new Map<number, string>();
        const chunks: ParsedTransaction[][] = [];
        for (let i = 0; i < fresh.length; i += CHUNK_SIZE) chunks.push(fresh.slice(i, i + CHUNK_SIZE));

        for (let c = 0; c < chunks.length; c++) {
            const chunkOffset = c * CHUNK_SIZE;
            const chunk = chunks[c];
            const payload = chunk.map((t, i) => ({
                index: i,
                date: t.date,
                description: t.description,
                amount: t.amount,
            }));

            const result = await geminiClient.generateJSON<AgentCategoryResult[]>(
                `${CATEGORY_PROMPT}\n\nTRANSACTIONS:\n${JSON.stringify(payload)}`,
                'groq'
            );

            if (result.success && Array.isArray(result.data)) {
                result.data.forEach((item, i) => {
                    if (typeof item === 'string') {
                        // ["Food", "skip", ...] — positionally aligned
                        if (item.toLowerCase() !== 'skip') {
                            categorized.set(chunkOffset + i, normalizeCategory(item));
                        }
                    } else if (typeof item === 'object' && item !== null) {
                        // [{index, category|skip}] — explicit index
                        const idx = item.index ?? chunkOffset + i;
                        if (!item.skip && item.category) {
                            categorized.set(chunkOffset + idx, normalizeCategory(item.category));
                        }
                    }
                });
            } else {
                console.error('Statement agent categorization failed for chunk:', result.error);
            }
        }

        // 3. Fallback for anything the agent didn't categorize (rule-based).
        const fallback = (t: ParsedTransaction): string => {
            const d = t.description.toLowerCase();
            if (/(zomato|swiggy|domino|pizza|restaurant|chaayos|cafe|starbucks|barbeque)/.test(d)) return 'Food';
            if (/(petrol|fuel|indian oil|hp |shell|ola|uber|rapido|metro|parking|toll)/.test(d)) return 'Transport';
            if (/(netflix|prime|spotify|hotstar|pvr|bookmyshow|game|steam)/.test(d)) return 'Entertainment';
            if (/(myntra|amazon|flipkart|ajio|shopping)/.test(d)) return 'Shopping';
            if (/(rent|hostel|maintenance)/.test(d)) return 'Housing';
            if (/(pharmacy|apollo|medplus|hospital|doctor|clinic|gym)/.test(d)) return 'Health';
            if (/(electricity|water|gas|jio|airtel|vi |broadband|wifi|recharge)/.test(d)) return 'Utilities';
            if (/(salary|insurance|premium|transfer|atm|withdraw|investment|sip|mutual)/.test(d)) return 'Other';
            return 'Other';
        };

        // 4. Save in batches.
        let imported = 0;
        let totalAmount = 0;
        for (let i = 0; i < fresh.length; i += 10) {
            const batch = fresh.slice(i, i + 10);
            const results = await Promise.all(
                batch.map(async (t, j) => {
                    const idx = i + j;
                    const category = categorized.get(idx) ?? fallback(t);
                    const result = await addServerExpense({
                        userId: uid,
                        amount: t.amount,
                        category,
                        description: `${t.description} [stmt:${sourceName}]`,
                        date: t.date ? Timestamp.fromDate(new Date(t.date)) : Timestamp.now(),
                    });
                    return result.success;
                })
            );
            const ok = results.filter(Boolean).length;
            imported += ok;
            totalAmount += batch.slice(0, ok).reduce((sum, t) => sum + t.amount, 0);
        }

        return {
            success: true,
            summary: {
                parsed: transactions.length,
                skipped: transactions.length - expenses.length,
                duplicates: expenses.length - fresh.length,
                imported,
                totalAmount,
            },
        };
    } catch (error: unknown) {
        console.error('Statement import failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Statement import failed',
        };
    }
};
