import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, isAdminConfigured } from '@/lib/firebase/admin';
import { getServerLoans, getServerCibilScore } from '@/server/loans';
import { getServerExpenses, getServerMonthlyTotals, getServerBudgetSettings } from '@/server/expenses';
import { generateLoanAdvisorPlan, type LoanForAdvisor } from '@/services/ai/loan-advisor';
import { LOW_INTEREST_LENDERS } from '@/data/lenders';

export const maxDuration = 120;

async function verifyUid(request: NextRequest): Promise<{ uid: string } | NextResponse> {
    const auth = getAdminAuth();
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!auth || !idToken) {
        return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    try {
        const decoded = await auth.verifyIdToken(idToken);
        return { uid: decoded.uid };
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid session token' }, { status: 401 });
    }
}

// GET /api/ai/loans — advisor plan + lender directory
export async function GET(request: NextRequest) {
    if (!isAdminConfigured()) {
        return NextResponse.json({ success: false, error: 'Firebase Admin not configured on server' }, { status: 500 });
    }

    const ids = await verifyUid(request);
    if (ids instanceof NextResponse) return ids;
    const uid = ids.uid;

    try {
        const [loansResult, cibilResult] = await Promise.all([
            getServerLoans(uid),
            getServerCibilScore(uid),
        ]);

        const loans = (loansResult.success && loansResult.data) ? loansResult.data : [];
        const cibilScore = cibilResult.success ? cibilResult.score : undefined;

        // Expense snapshot for the advisor
        const now = new Date();
        const [expensesResult, totalsResult, budgetResult] = await Promise.all([
            getServerExpenses(uid),
            getServerMonthlyTotals(uid, now.getFullYear(), now.getMonth() + 1),
            getServerBudgetSettings(uid),
        ]);

        const expenses = expensesResult.success && expensesResult.data ? expensesResult.data : [];
        const topExpenses = expenses.slice(0, 8).map((e) => ({
            description: e.description,
            amount: e.amount,
            category: e.category,
            date: e.date instanceof Date ? e.date.toISOString() : e.date.toDate?.().toISOString?.() || '',
        }));

        const advisorResult = loans.length > 0
            ? await generateLoanAdvisorPlan({
                loans: loans.map((l): LoanForAdvisor => ({
                    id: l.id,
                    name: l.name,
                    lender: l.lender,
                    type: l.type,
                    outstanding: l.outstanding,
                    emi: l.emi,
                    interestRate: l.interestRate,
                    remainingTenureMonths: l.remainingTenureMonths,
                    nextDueDate: l.nextDueDate instanceof Date ? l.nextDueDate.toISOString() : l.nextDueDate.toDate?.().toISOString?.() || '',
                })),
                expenses: {
                    totalMonthlyIncome: budgetResult.data?.monthlyIncome,
                    totalMonthlySpend: totalsResult.data?.total,
                    byCategory: totalsResult.data?.byCategory,
                    topExpenses,
                },
                cibilScore,
            })
            : null;

        return NextResponse.json({
            success: true,
            advisor: advisorResult?.success ? advisorResult.data : null,
            advisorError: advisorResult && !advisorResult.success ? advisorResult.error : null,
            lenders: LOW_INTEREST_LENDERS,
            cibilScore,
        });
    } catch (error: unknown) {
        console.error('Loans API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Loans advisor failed',
        }, { status: 500 });
    }
}
