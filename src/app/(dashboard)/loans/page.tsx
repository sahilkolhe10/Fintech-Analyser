'use client';

// Loans & EMI Tracker — track loans, input CIBIL score, get an AI payoff plan
// and find low-interest small finance bank loans.
import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn } from '@/lib/animations';
import { useAuthStore } from '@/store';
import { getAppUserToken } from '@/services/demo';
import {
    Landmark, PiggyBank, Plus, Trash2, Loader2, Sparkles,
    TrendingDown, ShieldCheck, CalendarDays, X, Save, CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
    getLoans, addLoan, deleteLoan, saveCibilScore, getCibilScore,
    LOAN_TYPES, type Loan, type LoanType,
} from '@/services/loans';

interface Lender {
    name: string;
    type: string;
    minRate: number;
    maxRate: number;
    processingFee: string;
    maxLoan: string;
    tenure: string;
    eligibility: string;
    notes: string;
}

interface AdvisorPlan {
    summary: string;
    payoffPlan: { loanName: string; priority: string; action: string; monthlyExtra?: number; payoffMonthsSaved?: number }[];
    expenseOptimizations: { category: string; suggestion: string; monthlySavings?: number }[];
    cibilTips: string[];
    totalMonthlySavings: number;
}

const EMPTY_FORM = {
    name: '',
    type: 'personal' as LoanType,
    lender: '',
    principal: '',
    outstanding: '',
    emi: '',
    interestRate: '',
    totalTenureMonths: '',
    remainingTenureMonths: '',
    nextDueDate: '',
};

export default function LoansPage() {
    const fadeRef = useFadeIn();
    const { user } = useAuthStore();

    const [loans, setLoans] = useState<Loan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [cibil, setCibil] = useState<number | null>(null);
    const [cibilInput, setCibilInput] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);

    const [advisor, setAdvisor] = useState<AdvisorPlan | null>(null);
    const [lenders, setLenders] = useState<Lender[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [lenderFilter, setLenderFilter] = useState('all');

    const loadLoans = useCallback(async () => {
        if (!user) return;
        const result = await getLoans(user.uid);
        if (result.success && result.data) setLoans(result.data);
        const c = await getCibilScore(user.uid);
        if (c.success && c.score) { setCibil(c.score); setCibilInput(String(c.score)); }
        setIsLoading(false);
    }, [user]);

    useEffect(() => { loadLoans(); }, [loadLoans]);

    const runAdvisor = async () => {
        if (!user) return;
        setIsAnalyzing(true);
        setAdvisor(null);
        try {
            const token = await getAppUserToken(user);
            const res = await fetch('/api/ai/loans', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.error || 'Advisor failed');
                return;
            }
            if (data.advisor) setAdvisor(data.advisor);
            if (data.lenders) setLenders(data.lenders);
            if (data.advisorError) toast.error(data.advisorError);
            if (!data.advisor && loans.length === 0) toast('Add a loan first, then run the advisor.');
        } catch (e) {
            console.error('Advisor error:', e);
            toast.error('Could not reach the advisor');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const saveCibil = async () => {
        if (!user) return;
        const score = parseInt(cibilInput, 10);
        if (isNaN(score) || score < 300 || score > 900) {
            toast.error('CIBIL score is between 300 and 900');
            return;
        }
        const result = await saveCibilScore(user.uid, score);
        if (result.success) {
            setCibil(score);
            toast.success('CIBIL score saved');
        } else {
            toast.error(result.error || 'Could not save score');
        }
    };

    const handleAdd = async () => {
        if (!user) return;
        const loan: Omit<Loan, 'id' | 'createdAt' | 'updatedAt'> = {
            userId: user.uid,
            name: form.name.trim() || 'Loan',
            type: form.type,
            lender: form.lender.trim() || '—',
            principal: parseFloat(form.principal) || 0,
            outstanding: parseFloat(form.outstanding) || 0,
            emi: parseFloat(form.emi) || 0,
            interestRate: parseFloat(form.interestRate) || 0,
            totalTenureMonths: parseInt(form.totalTenureMonths, 10) || 0,
            remainingTenureMonths: parseInt(form.remainingTenureMonths, 10) || 0,
            nextDueDate: form.nextDueDate ? new Date(form.nextDueDate) : new Date(),
        };
        if (loan.outstanding <= 0) {
            toast.error('Enter the outstanding amount');
            return;
        }
        setIsSaving(true);
        const result = await addLoan(loan);
        setIsSaving(false);
        if (result.success) {
            toast.success('Loan added');
            setShowForm(false);
            setForm(EMPTY_FORM);
            loadLoans();
        } else {
            toast.error(result.error || 'Could not add loan');
        }
    };

    const handleDelete = async (loanId: string) => {
        const result = await deleteLoan(loanId);
        if (result.success) {
            toast.success('Loan deleted');
            setLoans((prev) => prev.filter((l) => l.id !== loanId));
        } else {
            toast.error(result.error || 'Could not delete loan');
        }
    };

    const daysUntil = (ts: { toMillis?: () => number } | Date | undefined): number | null => {
        if (!ts) return null;
        const millis = ts instanceof Date ? ts.getTime() : typeof ts.toMillis === 'function' ? ts.toMillis() : null;
        if (millis === null) return null;
        const diff = millis - Date.now();
        return Math.ceil(diff / 86400000);
    };

    const cibilBand = (score: number | null) => {
        if (score === null) return { label: '—', color: 'text-gray-400', bg: 'bg-white/10' };
        if (score >= 750) return { label: 'Excellent', color: 'text-emerald-400', bg: 'bg-emerald-500/15' };
        if (score >= 650) return { label: 'Good', color: 'text-yellow-400', bg: 'bg-yellow-500/15' };
        if (score >= 550) return { label: 'Fair', color: 'text-orange-400', bg: 'bg-orange-500/15' };
        return { label: 'Poor', color: 'text-red-400', bg: 'bg-red-500/15' };
    };

    const totalMonthlyEmi = loans.reduce((sum, l) => sum + (l.emi || 0), 0);
    const totalOutstanding = loans.reduce((sum, l) => sum + (l.outstanding || 0), 0);
    const band = cibilBand(cibil);
    const filteredLenders = lenderFilter === 'all'
        ? lenders
        : lenders.filter((l) => l.type === lenderFilter);

    const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm focus:border-primary focus:outline-none';

    return (
        <div ref={fadeRef} className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Landmark className="w-8 h-8 text-primary" />
                        Loans & EMI Tracker
                    </h1>
                    <p className="text-gray-400 mt-1">Track EMIs, optimize spending to pay off faster, and find low-interest lenders</p>
                </div>
                <AnimatedButton onClick={() => setShowForm(!showForm)}>
                    {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showForm ? 'Cancel' : 'Add Loan'}
                </AnimatedButton>
            </div>

            {/* Add loan form */}
            {showForm && (
                <GlassCard className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Loan name</label>
                            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Car loan" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Type</label>
                            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LoanType })} className={inputCls}>
                                {LOAN_TYPES.map((t) => <option key={t.value} value={t.value} className="bg-[#1c1c24]">{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Lender</label>
                            <input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} placeholder="AU Small Finance Bank" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Principal (₹)</label>
                            <input type="number" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} placeholder="500000" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Outstanding (₹)</label>
                            <input type="number" value={form.outstanding} onChange={(e) => setForm({ ...form, outstanding: e.target.value })} placeholder="350000" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Monthly EMI (₹)</label>
                            <input type="number" value={form.emi} onChange={(e) => setForm({ ...form, emi: e.target.value })} placeholder="12000" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Interest rate (%/yr)</label>
                            <input type="number" step="0.1" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} placeholder="10.5" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Tenure (months)</label>
                            <input type="number" value={form.totalTenureMonths} onChange={(e) => setForm({ ...form, totalTenureMonths: e.target.value })} placeholder="60" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Remaining (months)</label>
                            <input type="number" value={form.remainingTenureMonths} onChange={(e) => setForm({ ...form, remainingTenureMonths: e.target.value })} placeholder="24" className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1.5">Next due date</label>
                            <input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} className={inputCls} />
                        </div>
                        <div className="flex items-end">
                            <AnimatedButton onClick={handleAdd} loading={isSaving} className="w-full">
                                {!isSaving && <Save className="w-4 h-4" />}
                                Save Loan
                            </AnimatedButton>
                        </div>
                    </div>
                </GlassCard>
            )}

            {/* Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <GlassCard className="p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Total outstanding</p>
                    <p className="text-2xl font-bold text-white">₹{totalOutstanding.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-gray-500 mt-1">{loans.length} active loan(s)</p>
                </GlassCard>
                <GlassCard className="p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Monthly EMI burden</p>
                    <p className="text-2xl font-bold text-white">₹{totalMonthlyEmi.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-gray-500 mt-1">due across all loans</p>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">CIBIL score</p>
                        <span className={cn('text-[11px] font-semibold rounded-full px-2 py-0.5', band.bg, band.color)}>{band.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={300} max={900}
                            value={cibilInput}
                            onChange={(e) => setCibilInput(e.target.value)}
                            placeholder="e.g. 750"
                            className="w-28 bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white text-lg font-bold focus:border-primary focus:outline-none"
                        />
                        <AnimatedButton size="sm" variant="secondary" onClick={saveCibil}>
                            <ShieldCheck className="w-4 h-4" />
                            Save
                        </AnimatedButton>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">300–900 · higher is better for loan rates</p>
                </GlassCard>
            </div>

            {/* AI Advisor */}
            <GlassCard className="p-6 border-primary/40">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">AI Debt Payoff Advisor</h2>
                            <p className="text-sm text-gray-400">Analyzes your expenses to free up money, then plans loan payoff before due dates</p>
                        </div>
                    </div>
                    <AnimatedButton onClick={runAdvisor} loading={isAnalyzing} disabled={loans.length === 0}>
                        {!isAnalyzing && <TrendingDown className="w-4 h-4" />}
                        {isAnalyzing ? 'Analyzing…' : 'Run Payoff Plan'}
                    </AnimatedButton>
                </div>

                {isAnalyzing && (
                    <div className="flex items-center gap-3 text-sm text-gray-400 py-6 justify-center">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        The AI is reviewing your expenses and loans…
                    </div>
                )}

                {advisor && !isAnalyzing && (
                    <div className="space-y-5">
                        <p className="text-sm text-gray-300 leading-relaxed">{advisor.summary}</p>

                        <div>
                            <p className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-primary" /> Payoff plan
                            </p>
                            <div className="space-y-2">
                                {advisor.payoffPlan.map((p, i) => (
                                    <div key={i} className="flex items-start gap-3 bg-white/5 rounded-xl px-4 py-3">
                                        <span className={cn(
                                            'text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0',
                                            p.priority === 'high' ? 'bg-red-500/15 text-red-400'
                                                : p.priority === 'medium' ? 'bg-yellow-500/15 text-yellow-400'
                                                    : 'bg-white/10 text-gray-300'
                                        )}>
                                            {p.priority}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white">{p.loanName}</p>
                                            <p className="text-xs text-gray-400">{p.action}</p>
                                            {p.monthlyExtra ? <p className="text-xs text-emerald-400 mt-0.5">+₹{p.monthlyExtra.toLocaleString('en-IN')}/month prepay</p> : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-white mb-2">Expense optimizations to free cash</p>
                            <div className="space-y-2">
                                {advisor.expenseOptimizations.map((o, i) => (
                                    <div key={i} className="flex items-start justify-between gap-3 bg-white/5 rounded-xl px-4 py-3">
                                        <div>
                                            <p className="text-sm text-gray-200">{o.suggestion}</p>
                                            <p className="text-xs text-gray-500">{o.category}</p>
                                        </div>
                                        {o.monthlySavings ? (
                                            <span className="text-sm font-semibold text-emerald-400 flex-shrink-0">+₹{o.monthlySavings.toLocaleString('en-IN')}/mo</span>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            <p className="text-sm text-emerald-400 font-semibold mt-3">
                                Total freed: ₹{advisor.totalMonthlySavings.toLocaleString('en-IN')}/month
                            </p>
                        </div>

                        <div>
                            <p className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-primary" /> CIBIL score tips
                            </p>
                            <ul className="space-y-1.5">
                                {advisor.cibilTips.map((tip, i) => (
                                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                                        <span className="text-primary flex-shrink-0">{i + 1}.</span>
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </GlassCard>

            {/* Loans list */}
            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Your loans</h2>
                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
                ) : loans.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">No loans yet. Add your first loan to get an AI payoff plan.</p>
                ) : (
                    <div className="space-y-3">
                        {loans.map((loan) => {
                            const dueIn = daysUntil(loan.nextDueDate);
                            const urgent = dueIn !== null && dueIn <= 5;
                            return (
                                <div key={loan.id} className="flex items-center justify-between gap-4 bg-white/5 rounded-xl px-4 py-3 flex-wrap">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                                            <CreditCard className="w-4 h-4 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white">{loan.name} <span className="text-gray-500 text-xs">· {loan.lender}</span></p>
                                            <p className="text-xs text-gray-400">
                                                {loan.type.replace('_', ' ')} · {loan.interestRate}% · EMI ₹{loan.emi.toLocaleString('en-IN')} · {loan.remainingTenureMonths}mo left
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-sm font-semibold text-white">₹{loan.outstanding.toLocaleString('en-IN')}</p>
                                            {dueIn !== null && (
                                                <p className={cn('text-[11px]', urgent ? 'text-red-400 font-semibold' : 'text-gray-500')}>
                                                    due {dueIn === 0 ? 'today' : dueIn === 1 ? 'tomorrow' : `in ${dueIn}d`}
                                                </p>
                                            )}
                                        </div>
                                        <button onClick={() => loan.id && handleDelete(loan.id)} className="text-gray-500 hover:text-red-400 transition-colors" aria-label="Delete loan">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassCard>

            {/* Low-interest lenders */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                            <PiggyBank className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Low-interest loans</h2>
                            <p className="text-sm text-gray-400">Small finance banks you may not know — often cheaper than big banks</p>
                        </div>
                    </div>
                    <select
                        value={lenderFilter}
                        onChange={(e) => setLenderFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                    >
                        <option value="all" className="bg-[#1c1c24]">All lenders</option>
                        <option value="Small Finance Bank" className="bg-[#1c1c24]">Small Finance Banks</option>
                        <option value="NBFC" className="bg-[#1c1c24]">NBFCs</option>
                        <option value="Public Bank" className="bg-[#1c1c24]">Public Banks</option>
                        <option value="Private Bank" className="bg-[#1c1c24]">Private Banks</option>
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {(filteredLenders.length ? filteredLenders : lenders).map((lender) => (
                        <div key={lender.name} className="bg-white/5 rounded-xl p-4 border border-white/[0.07] hover:border-primary/40 transition-colors">
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="text-sm font-semibold text-white">{lender.name}</p>
                                <span className="text-[10px] text-gray-400 bg-white/10 rounded-full px-2 py-0.5 whitespace-nowrap">{lender.type}</span>
                            </div>
                            <p className="text-xl font-bold text-primary">
                                {lender.minRate}% <span className="text-xs text-gray-400 font-medium">– {lender.maxRate}% p.a.</span>
                            </p>
                            <div className="text-xs text-gray-400 mt-3 space-y-1">
                                <p>💳 {lender.maxLoan} · {lender.tenure}</p>
                                <p>📄 Fee: {lender.processingFee}</p>
                                <p>✅ {lender.eligibility}</p>
                            </div>
                            <p className="text-xs text-gray-500 mt-3 leading-relaxed">{lender.notes}</p>
                        </div>
                    ))}
                </div>
                {lenders.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-6">
                        Run the advisor once to load the lender directory.
                    </p>
                )}
            </GlassCard>
        </div>
    );
}
