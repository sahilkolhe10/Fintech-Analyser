'use client';

// Complete Expenses Page with Budget Setup and Add Expense Modal
import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn, useStaggerChildren } from '@/lib/animations';
import { useAuthStore, useCurrencyStore } from '@/store';
import { formatCurrency } from '@/lib/utils';
import {
    getBudgetSettings,
    saveBudgetSettings,
    getExpenses,
    addExpense,
    deleteExpense,
    getMonthlyTotals,
    EXPENSE_CATEGORIES,
    Expense,
    BudgetSettings
} from '@/services/expenses';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import {
    Plus, Receipt, Wallet, TrendingUp, TrendingDown, X,
    ShoppingBag, Home, Car, Utensils, Gamepad2, Heart,
    GraduationCap, Zap, MoreHorizontal, Trash2, Calendar,
    DollarSign, PiggyBank
} from 'lucide-react';

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    Utensils, Car, ShoppingBag, Gamepad2, Home, Heart, GraduationCap, Zap, MoreHorizontal
};

export default function ExpensesPage() {
    const fadeRef = useFadeIn();
    const staggerRef = useStaggerChildren(0.1);
    const { user } = useAuthStore();
    const { currency } = useCurrencyStore();

    // State
    const [budgetSettings, setBudgetSettings] = useState<BudgetSettings | null>(null);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [monthlyTotal, setMonthlyTotal] = useState(0);
    const [categoryTotals, setCategoryTotals] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);

    // Modals
    const [showBudgetModal, setShowBudgetModal] = useState(false);
    const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

    // Form states
    const [income, setIncome] = useState('');
    const [budget, setBudget] = useState('');
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseCategory, setExpenseCategory] = useState('Food');
    const [expenseDescription, setExpenseDescription] = useState('');
    const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

    // Load data
    useEffect(() => {
        if (!user) return;
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const loadData = async () => {
        if (!user) return;
        setIsLoading(true);

        try {
            // Get budget settings
            const settingsResult = await getBudgetSettings(user.uid);
            if (settingsResult.success && settingsResult.data) {
                setBudgetSettings(settingsResult.data);
                setIncome(settingsResult.data.monthlyIncome.toString());
                setBudget(settingsResult.data.monthlyBudget.toString());
            } else {
                // First time user - show setup modal
                setShowBudgetModal(true);
            }

            // Get current month expenses
            const now = new Date();
            const monthResult = await getMonthlyTotals(user.uid, now.getFullYear(), now.getMonth() + 1);
            if (monthResult.success && monthResult.data) {
                setMonthlyTotal(monthResult.data.total);
                setCategoryTotals(monthResult.data.byCategory);
            }

            // Get recent expenses
            const expensesResult = await getExpenses(user.uid);
            if (expensesResult.success && expensesResult.data) {
                setExpenses(expensesResult.data);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveBudget = async () => {
        if (!user || !income || !budget) {
            toast.error('Please enter both income and budget');
            return;
        }

        const result = await saveBudgetSettings(user.uid, {
            monthlyIncome: parseFloat(income),
            monthlyBudget: parseFloat(budget),
            currency,
        });

        if (result.success) {
            toast.success('Budget settings saved!');
            setBudgetSettings({
                userId: user.uid,
                monthlyIncome: parseFloat(income),
                monthlyBudget: parseFloat(budget),
                currency,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
            setShowBudgetModal(false);
        } else {
            toast.error(result.error || 'Failed to save settings');
        }
    };

    const handleAddExpense = async () => {
        if (!user || !expenseAmount || !expenseDescription) {
            toast.error('Please fill in all fields');
            return;
        }

        const result = await addExpense({
            userId: user.uid,
            amount: parseFloat(expenseAmount),
            category: expenseCategory,
            description: expenseDescription,
            date: Timestamp.fromDate(new Date(expenseDate)),
        });

        if (result.success) {
            toast.success('Expense added!');
            setShowAddExpenseModal(false);
            setExpenseAmount('');
            setExpenseDescription('');
            setExpenseDate(new Date().toISOString().split('T')[0]);
            loadData(); // Refresh data
        } else {
            toast.error(result.error || 'Failed to add expense');
        }
    };

    const handleDeleteExpense = async (expenseId: string) => {
        const result = await deleteExpense(expenseId);
        if (result.success) {
            toast.success('Expense deleted');
            loadData();
        } else {
            toast.error(result.error || 'Failed to delete');
        }
    };

    const budgetUsed = budgetSettings ? (monthlyTotal / budgetSettings.monthlyBudget) * 100 : 0;
    const remaining = budgetSettings ? budgetSettings.monthlyBudget - monthlyTotal : 0;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
        );
    }

    return (
        <div ref={fadeRef} className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Expenses</h1>
                    <p className="text-gray-400 mt-1">Track and manage your spending</p>
                </div>
                <div className="flex gap-3">
                    <AnimatedButton variant="secondary" onClick={() => setShowBudgetModal(true)}>
                        <PiggyBank className="w-4 h-4" />
                        Set Budget
                    </AnimatedButton>
                    <AnimatedButton onClick={() => setShowAddExpenseModal(true)}>
                        <Plus className="w-4 h-4" />
                        Add Expense
                    </AnimatedButton>
                </div>
            </div>

            {/* Summary Cards */}
            <div ref={staggerRef} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Monthly Income</span>
                        <DollarSign className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                        {formatCurrency(budgetSettings?.monthlyIncome || 0, currency)}
                    </div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Monthly Budget</span>
                        <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {formatCurrency(budgetSettings?.monthlyBudget || 0, currency)}
                    </div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Spent This Month</span>
                        <Receipt className="w-5 h-5 text-accent" />
                    </div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(monthlyTotal, currency)}</div>
                    <div className="mt-2 w-full bg-white/10 rounded-full h-2">
                        <div
                            className={`h-2 rounded-full transition-all ${budgetUsed > 100 ? 'bg-red-500' : budgetUsed > 80 ? 'bg-yellow-500' : 'bg-gradient-to-r from-primary to-accent'}`}
                            style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                        />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{budgetUsed.toFixed(1)}% of budget</div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Remaining</span>
                        {remaining >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                    </div>
                    <div className={`text-2xl font-bold ${remaining >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(Math.abs(remaining), currency)}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                        {remaining >= 0 ? 'left to spend' : 'over budget!'}
                    </div>
                </GlassCard>
            </div>

            {/* Category Breakdown */}
            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Spending by Category</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {EXPENSE_CATEGORIES.slice(0, 5).map((cat) => {
                        const IconComponent = iconMap[cat.icon] || MoreHorizontal;
                        const amount = categoryTotals[cat.name] || 0;
                        const percentage = monthlyTotal > 0 ? (amount / monthlyTotal) * 100 : 0;
                        return (
                            <div key={cat.name} className="text-center p-4 bg-white/5 rounded-xl">
                                <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${cat.color}20` }}>
                                    <IconComponent className="w-6 h-6" style={{ color: cat.color }} />
                                </div>
                                <div className="text-white font-medium text-sm">{cat.name}</div>
                                <div className="text-gray-400 text-xs mt-1">{formatCurrency(amount, currency)}</div>
                                <div className="text-gray-500 text-xs">{percentage.toFixed(1)}%</div>
                            </div>
                        );
                    })}
                </div>
            </GlassCard>

            {/* Recent Expenses */}
            <GlassCard className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Recent Expenses</h2>
                {expenses.length === 0 ? (
                    <div className="text-center py-12">
                        <Receipt className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                        <p className="text-gray-400">No expenses yet</p>
                        <p className="text-gray-500 text-sm">Click &quot;Add Expense&quot; to start tracking</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {expenses.slice(0, 10).map((expense) => {
                            const category = EXPENSE_CATEGORIES.find(c => c.name === expense.category);
                            const IconComponent = category ? iconMap[category.icon] || Receipt : Receipt;
                            const expenseDate = expense.date.toDate();
                            return (
                                <div key={expense.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${category?.color || '#8B5CF6'}20` }}>
                                            <IconComponent className="w-5 h-5" style={{ color: category?.color || '#8B5CF6' }} />
                                        </div>
                                        <div>
                                            <div className="font-medium text-white">{expense.description}</div>
                                            <div className="text-sm text-gray-400">
                                                {expense.category} • {expenseDate.toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-white font-medium">-{formatCurrency(expense.amount, currency)}</div>
                                        <button
                                            onClick={() => expense.id && handleDeleteExpense(expense.id)}
                                            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassCard>

            {/* Budget Setup Modal */}
            {showBudgetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <GlassCard className="w-full max-w-md p-6 m-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">Set Your Budget</h2>
                            <button onClick={() => setShowBudgetModal(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Monthly Income</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="number"
                                        value={income}
                                        onChange={(e) => setIncome(e.target.value)}
                                        placeholder="50000"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Monthly Budget (for expenses)</label>
                                <div className="relative">
                                    <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="number"
                                        value={budget}
                                        onChange={(e) => setBudget(e.target.value)}
                                        placeholder="30000"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>
                            <AnimatedButton onClick={handleSaveBudget} className="w-full mt-4">
                                Save Budget Settings
                            </AnimatedButton>
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* Add Expense Modal */}
            {showAddExpenseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <GlassCard className="w-full max-w-md p-6 m-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">Add Expense</h2>
                            <button onClick={() => setShowAddExpenseModal(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Amount</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="number"
                                        value={expenseAmount}
                                        onChange={(e) => setExpenseAmount(e.target.value)}
                                        placeholder="500"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Category</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {EXPENSE_CATEGORIES.slice(0, 6).map((cat) => {
                                        const IconComponent = iconMap[cat.icon] || MoreHorizontal;
                                        return (
                                            <button
                                                key={cat.name}
                                                onClick={() => setExpenseCategory(cat.name)}
                                                className={`p-3 rounded-xl text-center transition-all ${expenseCategory === cat.name
                                                        ? 'bg-primary/20 border-primary border'
                                                        : 'bg-white/5 border-white/10 border'
                                                    }`}
                                            >
                                                <IconComponent className="w-5 h-5 mx-auto mb-1" style={{ color: cat.color }} />
                                                <div className="text-xs text-gray-300">{cat.name}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Description</label>
                                <input
                                    type="text"
                                    value={expenseDescription}
                                    onChange={(e) => setExpenseDescription(e.target.value)}
                                    placeholder="What did you spend on?"
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="date"
                                        value={expenseDate}
                                        onChange={(e) => setExpenseDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>
                            <AnimatedButton onClick={handleAddExpense} className="w-full mt-4">
                                Add Expense
                            </AnimatedButton>
                        </div>
                    </GlassCard>
                </div>
            )}
        </div>
    );
}
