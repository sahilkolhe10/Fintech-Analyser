// AI Loan Advisor — analyzes the user's loans, expenses and CIBIL score,
// then produces a payoff plan (which EMIs to prioritize, what to optimize in
// spending) and CIBIL-improvement tips. Groq is preferred for speed.

import { geminiClient } from '@/services/ai/gemini-client';

export interface LoanForAdvisor {
    id?: string;
    name: string;
    lender: string;
    type: string;
    outstanding: number;
    emi: number;
    interestRate: number;
    remainingTenureMonths: number;
    nextDueDate?: string; // ISO
}

export interface AdvisorExpenseSnapshot {
    totalMonthlyIncome?: number;
    totalMonthlySpend?: number;
    byCategory?: Record<string, number>;
    topExpenses?: { description: string; amount: number; category: string; date?: string }[];
}

export interface LoanAdvisorResult {
    summary: string;
    payoffPlan: {
        loanId?: string;
        loanName: string;
        priority: 'high' | 'medium' | 'low';
        action: string;
        monthlyExtra?: number;
        payoffMonthsSaved?: number;
    }[];
    expenseOptimizations: {
        category: string;
        suggestion: string;
        monthlySavings?: number;
    }[];
    cibilTips: string[];
    totalMonthlySavings: number;
}

const ADVISOR_PROMPT = `You are KhataHouse's loan & debt advisor. You help users pay off loans/EMIs faster and improve their CIBIL score.

Given the user's loans, monthly expenses and CIBIL score, produce a JSON plan:

{
  "summary": "<2-3 sentence overview of their debt situation>",
  "payoffPlan": [
    {
      "loanName": "<loan name>",
      "priority": "<high|medium|low>",
      "action": "<specific action: pay off early / prepay X / refinance / minimum payment>",
      "monthlyExtra": <optional amount to prepay monthly>,
      "payoffMonthsSaved": <optional months saved>
    }
  ],
  "expenseOptimizations": [
    {
      "category": "<category>",
      "suggestion": "<concrete way to cut this spend, specific numbers>",
      "monthlySavings": <estimated monthly savings>
    }
  ],
  "cibilTips": ["<3-5 concrete tips to improve CIBIL score>"],
  "totalMonthlySavings": <sum of monthlySavings>
}

Rules:
- Prioritize the highest-interest debt first (avalanche method), but always note the next due date so nothing is missed.
- Credit card dues (36%+ interest) are ALWAYS highest priority.
- Expense optimizations must be realistic and specific (e.g. "cap food delivery at 2x/week").
- CIBIL tips: pay on time, keep credit utilization under 30%, don't close old cards, check report errors, limit hard inquiries.
- Respond ONLY with valid JSON, no markdown.`;

export const generateLoanAdvisorPlan = async (input: {
    loans: LoanForAdvisor[];
    expenses: AdvisorExpenseSnapshot;
    cibilScore?: number;
}): Promise<{ success: boolean; data?: LoanAdvisorResult; error?: string }> => {
    try {
        const payload = {
            cibilScore: input.cibilScore ?? null,
            loans: input.loans.map((l) => ({
                name: l.name,
                lender: l.lender,
                type: l.type,
                outstanding: l.outstanding,
                emi: l.emi,
                interestRate: l.interestRate,
                remainingMonths: l.remainingTenureMonths,
                nextDueDate: l.nextDueDate,
            })),
            monthlyIncome: input.expenses.totalMonthlyIncome,
            monthlySpend: input.expenses.totalMonthlySpend,
            spendByCategory: input.expenses.byCategory,
            topExpenses: input.expenses.topExpenses?.slice(0, 8),
        };

        const result = await geminiClient.generateJSON<LoanAdvisorResult>(
            `${ADVISOR_PROMPT}\n\nUSER DATA:\n${JSON.stringify(payload)}`,
            'groq'
        );

        if (!result.success || !result.data) {
            return { success: false, error: result.error || 'Advisor failed' };
        }
        return { success: true, data: result.data };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Advisor failed' };
    }
};
