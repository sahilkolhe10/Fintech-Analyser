// Tool Executor for FinManage AI agents.
// Server-side registry mapping agent tool calls (Gemini function calling)
// to real Firestore/Storage operations.

import { Timestamp } from 'firebase-admin/firestore';
import type { ToolDefinition } from './gemini-client';
import {
    addServerExpense,
    deleteServerExpense,
    getServerBudgetSettings,
    getServerExpenses,
    getServerMonthlyTotals,
    formatExpenseSummary,
} from '@/server/expenses';
import { getDocuments } from '@/server/firestore';

export interface ToolExecutionContext {
    uid: string;
}

export interface AgentTool {
    definition: ToolDefinition;
    handler: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<string>;
}

const parseDate = (value: unknown): Date => {
    if (typeof value === 'string' && value.trim()) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d;
    }
    return new Date();
};

const parseAmount = (value: unknown): number | null => {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    return isNaN(n) || n <= 0 ? null : n;
};

export const buildAgentTools = (): AgentTool[] => [
    {
        definition: {
            name: 'add_expense',
            description: 'Record a new expense for the user (e.g. "spent 200 on lunch"). Returns the saved expense details.',
            parameters: {
                type: 'object',
                properties: {
                    amount: { type: 'number', description: 'Amount spent (required, positive number)' },
                    description: { type: 'string', description: 'Short description of the expense' },
                    category: {
                        type: 'string',
                        enum: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Housing', 'Health', 'Education', 'Utilities', 'Other'],
                        description: 'Category; pick the closest match',
                    },
                    date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Defaults to today.' },
                    currency: { type: 'string', enum: ['INR', 'USD'], description: 'Defaults to INR' },
                },
                required: ['amount'],
            },
        },
        handler: async (args, ctx) => {
            const amount = parseAmount(args.amount);
            if (amount === null) return 'ERROR: Invalid amount. Provide a positive number.';

            const { getServerBudgetSettings } = await import('@/server/expenses');
            const budget = await getServerBudgetSettings(ctx.uid);
            const currency = (args.currency as string) || budget.data?.currency || 'INR';

            const result = await addServerExpense({
                userId: ctx.uid,
                amount,
                category: String(args.category || 'Other'),
                description: String(args.description || 'Expense'),
                date: Timestamp.fromDate(parseDate(args.date)),
            });

            if (!result.success) return `ERROR: ${result.error}`;
            const category = String(args.category || 'Other');
            return `SAVED expense: ${currency} ${amount.toFixed(2)} (${category}) — ${args.description || 'Expense'}, id=${result.id}`;
        },
    },
    {
        definition: {
            name: 'get_expenses_summary',
            description: 'Get the user\'s total spend for a given month/year, broken down by category.',
            parameters: {
                type: 'object',
                properties: {
                    month: { type: 'number', description: 'Month 1-12. Defaults to current month.' },
                    year: { type: 'number', description: 'Year (e.g. 2026). Defaults to current year.' },
                    currency: { type: 'string', enum: ['INR', 'USD'], description: 'Defaults to INR' },
                },
            },
        },
        handler: async (args, ctx) => {
            const now = new Date();
            const month = Number(args.month) || now.getMonth() + 1;
            const year = Number(args.year) || now.getFullYear();
            const budget = await getServerBudgetSettings(ctx.uid);
            const currency = (args.currency as string) || budget.data?.currency || 'INR';

            const result = await getServerMonthlyTotals(ctx.uid, year, month);
            if (!result.success || !result.data) return `ERROR: ${result.error}`;

            return formatExpenseSummary(result.data, currency);
        },
    },
    {
        definition: {
            name: 'get_expenses_list',
            description: 'List the user\'s most recent expenses, optionally filtered by category or count.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Max number of expenses to list (default 10)' },
                    category: {
                        type: 'string',
                        enum: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Housing', 'Health', 'Education', 'Utilities', 'Other'],
                    },
                },
            },
        },
        handler: async (args, ctx) => {
            const result = await getServerExpenses(ctx.uid);
            if (!result.success || !result.data) return `ERROR: ${result.error}`;

            const limit = Number(args.limit) || 10;
            const category = args.category as string | undefined;
            const filtered = result.data
                .filter((e) => !category || e.category === category)
                .slice(0, limit);

            if (filtered.length === 0) return 'No expenses found.';

            return filtered.map((e) => {
                const d = e.date.toDate();
                return `- ${d.toLocaleDateString('en-IN')}: ${e.amount.toFixed(2)} (${e.category}) ${e.description}`;
            }).join('\n');
        },
    },
    {
        definition: {
            name: 'get_budget',
            description: 'Get the user\'s budget settings: monthly income, monthly budget, and current spend vs budget.',
            parameters: { type: 'object', properties: {} },
        },
        handler: async (_args, ctx) => {
            const budget = await getServerBudgetSettings(ctx.uid);
            if (!budget.success) return `ERROR: ${budget.error}`;

            const now = new Date();
            const spent = await getServerMonthlyTotals(ctx.uid, now.getFullYear(), now.getMonth() + 1);

            if (!budget.data) {
                return 'No budget settings found. The user has not set monthly income or budget yet.';
            }

            const currency = budget.data.currency || 'INR';
            const spentTotal = spent.data?.total || 0;
            const overBudget = spentTotal > budget.data.monthlyBudget;
            const remaining = budget.data.monthlyBudget - spentTotal;

            return [
                `MONTHLY INCOME: ${currency} ${budget.data.monthlyIncome.toFixed(2)}`,
                `MONTHLY BUDGET: ${currency} ${budget.data.monthlyBudget.toFixed(2)}`,
                `SPENT SO FAR: ${currency} ${spentTotal.toFixed(2)}`,
                overBudget
                    ? `OVER BUDGET by ${currency} ${(-remaining).toFixed(2)}`
                    : `Remaining budget: ${currency} ${remaining.toFixed(2)}`,
            ].join('\n');
        },
    },
    {
        definition: {
            name: 'delete_expense',
            description: 'Delete an expense by its id. Use get_expenses_list first to find the id.',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string', description: 'Expense id to delete' } },
                required: ['id'],
            },
        },
        handler: async (args) => {
            const id = String(args.id || '');
            const result = await deleteServerExpense(id);
            if (!result.success) return `ERROR: ${result.error}`;
            return `DELETED expense with id=${id}`;
        },
    },
    {
        definition: {
            name: 'list_documents',
            description: 'List financial documents the user has uploaded (statements, payslips, bills, receipts) with their summaries.',
            parameters: { type: 'object', properties: {} },
        },
        handler: async (_args, ctx) => {
            const result = await getDocuments(ctx.uid);
            if (!result.success || !result.data || result.data.length === 0) {
                return 'No documents uploaded yet.';
            }
            return result.data.map((d) => {
                const date = d.createdAt ? d.createdAt.toDate().toLocaleDateString('en-IN') : 'unknown';
                return `- ${d.name} (${d.documentType}, ${date}): ${d.summary}`;
            }).join('\n');
        },
    },
];

export const agentToolDefinitions = (): ToolDefinition[] =>
    buildAgentTools().map((t) => t.definition);

export const executeAgentTool = async (
    name: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext
): Promise<string> => {
    const tool = buildAgentTools().find((t) => t.definition.name === name);
    if (!tool) return `ERROR: Unknown tool "${name}"`;
    try {
        return await tool.handler(args, ctx);
    } catch (error: unknown) {
        return `ERROR: ${error instanceof Error ? error.message : 'Tool failed'}`;
    }
};

// Sources context (holds quotes etc.) for richer prompts
export interface UserFinancialContext {
    uid: string;
    holdings?: { symbol: string; name: string; quantity: number; avgPrice: number; type: string }[];
    totalValue?: number;
    currency?: string;
}

export const buildFinancialContextString = async (ctx: ToolExecutionContext): Promise<string> => {
    const parts: string[] = [];

    const expenses = await getServerExpenses(ctx.uid);
    if (expenses.success && expenses.data && expenses.data.length > 0) {
        const now = new Date();
        const summary = await getServerMonthlyTotals(ctx.uid, now.getFullYear(), now.getMonth() + 1);
        if (summary.success && summary.data) {
            parts.push(formatExpenseSummary(summary.data));
        }
        const recent = expenses.data.slice(0, 5).map((e) =>
            `- ${e.date.toDate().toLocaleDateString('en-IN')}: ${e.amount.toFixed(2)} (${e.category}) ${e.description}`
        ).join('\n');
        parts.push(`RECENT EXPENSES:\n${recent}`);
    }

    const docs = await getDocuments(ctx.uid);
    if (docs.success && docs.data && docs.data.length > 0) {
        parts.push(`UPLOADED DOCUMENTS:\n${docs.data.slice(0, 5).map((d) => `- ${d.name}: ${d.summary}`).join('\n')}`);
    }

    return parts.join('\n\n');
};