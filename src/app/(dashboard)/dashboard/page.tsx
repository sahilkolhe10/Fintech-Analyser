'use client';

// Main Dashboard Page - With Real Portfolio Data
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { PriceDisplay } from '@/components/ui/PriceDisplay';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn, useStaggerChildren } from '@/lib/animations';
import { useAuthStore, useCurrencyStore } from '@/store';
import { formatCurrency } from '@/lib/utils';
import { getBudgetSettings, getMonthlyTotals, BudgetSettings } from '@/services/expenses';
import { getHoldings, calculatePortfolioTotals } from '@/services/holdings';
import {
    TrendingUp, TrendingDown, Wallet, PieChart,
    Bot, ArrowUpRight, Sparkles, Receipt
} from 'lucide-react';

const GlobalMarkets = dynamic(() => import('@/components/3d/GlobalMarkets').then(m => ({ default: m.GlobalMarkets })), { ssr: false });
const Portfolio3DPie = dynamic(() => import('@/components/3d/Portfolio3DPie').then(m => ({ default: m.Portfolio3DPie })), { ssr: false });

// Static market data
const indices = [
    { symbol: '^NSEI', name: 'NIFTY 50', price: 22450, change: 125, changePercent: 0.56 },
    { symbol: '^BSESN', name: 'SENSEX', price: 74230, change: 380, changePercent: 0.51 },
    { symbol: '^DJI', name: 'DOW Jones', price: 38520, change: -45, changePercent: -0.12 },
    { symbol: '^GSPC', name: 'S&P 500', price: 5095, change: 12, changePercent: 0.24 },
    { symbol: '^IXIC', name: 'NASDAQ', price: 16245, change: 85, changePercent: 0.53 },
];

// Current prices map (simulated for now, would be API in prod)
const CURRENT_PRICES: Record<string, number> = {
    'RELIANCE.NS': 2580, 'TCS.NS': 3950, 'HDFCBANK.NS': 1720, 'INFY.NS': 1480,
    'ICICIBANK.NS': 1050, 'SBIN.NS': 760, 'BHARTIARTL.NS': 1280, 'ITC.NS': 465,
    'KOTAKBANK.NS': 1780, 'LT.NS': 3520, 'AXISBANK.NS': 1120, 'BAJFINANCE.NS': 7200,
    'ASIANPAINT.NS': 2850, 'MARUTI.NS': 10800, 'TITAN.NS': 3650, 'SUNPHARMA.NS': 1480,
    'WIPRO.NS': 520, 'ULTRACEMCO.NS': 9800, 'NESTLEIND.NS': 2450, 'HINDUNILVR.NS': 2380,
};

export default function DashboardPage() {
    const fadeRef = useFadeIn();
    const staggerRef = useStaggerChildren(0.1);
    const { user, profile } = useAuthStore();
    const { currency } = useCurrencyStore();

    const [aiInsight] = useState<string>('Markets are showing steady growth. Consider reviewing your portfolio allocation to optimize for current conditions.');

    // Real Data State
    const [budgetSettings, setBudgetSettings] = useState<BudgetSettings | null>(null);
    const [monthlySpent, setMonthlySpent] = useState(0);
    const [portfolioValue, setPortfolioValue] = useState(0);
    const [portfolioReturn, setPortfolioReturn] = useState(0);
    const [portfolioPercent, setPortfolioPercent] = useState(0);

    // Pie Chart Data
    const [pieData, setPieData] = useState<{ label: string; value: number; color: string }[]>([
        { label: 'No Holdings', value: 100, color: '#374151' }
    ]);

    useEffect(() => {
        if (!user) return;

        const loadAllData = async () => {
            try {
                // 1. Budget & Expenses
                const settings = await getBudgetSettings(user.uid);
                if (settings.success && settings.data) setBudgetSettings(settings.data);

                const now = new Date();
                const totals = await getMonthlyTotals(user.uid, now.getFullYear(), now.getMonth() + 1);
                if (totals.success && totals.data) setMonthlySpent(totals.data.total);

                // 2. Portfolio
                const holdingsRes = await getHoldings(user.uid);
                if (holdingsRes.success && holdingsRes.data) {
                    const userHoldings = holdingsRes.data;

                    const priceMap = new Map(Object.entries(CURRENT_PRICES));
                    const { totalValue, totalPnL, pnlPercent } = calculatePortfolioTotals(userHoldings, priceMap);

                    setPortfolioValue(totalValue);
                    setPortfolioReturn(totalPnL);
                    setPortfolioPercent(pnlPercent);

                    // Generate Pie Data from actual holdings
                    if (userHoldings.length > 0) {
                        const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#3B82F6'];
                        const newPieData = userHoldings.map((h, i) => ({
                            label: h.symbol.replace('.NS', ''),
                            value: h.quantity * (CURRENT_PRICES[h.symbol] || h.buyPrice),
                            color: colors[i % colors.length]
                        })).sort((a, b) => b.value - a.value).slice(0, 6); // Top 6 holdings

                        setPieData(newPieData);
                    }
                }
            } catch (error) {
                console.warn('Error loading dashboard data:', error);
            }
        };
        loadAllData();
    }, [user]);

    const budgetRemaining = budgetSettings ? budgetSettings.monthlyBudget - monthlySpent : 0;

    return (
        <div ref={fadeRef} className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        Welcome back, <span className="gradient-text">{profile?.displayName || 'Investor'}</span>
                    </h1>
                    <p className="text-gray-400 mt-1">Here&apos;s your financial overview</p>
                </div>
                <Link href="/ai-advisor">
                    <AnimatedButton variant="primary">
                        <Sparkles className="w-4 h-4" />
                        AI Insights
                    </AnimatedButton>
                </Link>
            </div>

            {/* Stats Row */}
            <div ref={staggerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Portfolio Value</span>
                        <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {formatCurrency(portfolioValue, currency)}
                    </div>
                    <div className={`flex items-center gap-1 mt-1 text-sm ${portfolioReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {portfolioReturn >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {portfolioReturn >= 0 ? '+' : ''}{portfolioPercent.toFixed(2)}%
                    </div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Monthly Income</span>
                        <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                        {formatCurrency(budgetSettings?.monthlyIncome || 0, currency)}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                        {budgetSettings ? 'This month' : <Link href="/expenses" className="text-primary hover:underline">Set up budget →</Link>}
                    </div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Monthly Spent</span>
                        <Receipt className="w-5 h-5 text-accent" />
                    </div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(monthlySpent, currency)}</div>
                    <div className="text-gray-400 text-sm mt-1">
                        {budgetSettings ? `of ${formatCurrency(budgetSettings.monthlyBudget, currency)} budget` : 'Track expenses →'}
                    </div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Budget Remaining</span>
                        {budgetRemaining >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                    </div>
                    <div className={`text-2xl font-bold ${budgetRemaining >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(Math.abs(budgetRemaining), currency)}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                        {budgetRemaining >= 0 ? 'left to spend' : 'over budget!'}
                    </div>
                </GlassCard>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Portfolio Chart */}
                <GlassCard className="lg:col-span-2 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Portfolio Allocation</h2>
                        <Link href="/portfolio" className="text-primary text-sm hover:underline flex items-center gap-1">
                            View Details <ArrowUpRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="h-[350px]">
                        {portfolioValue > 0 ? (
                            <Portfolio3DPie data={pieData} />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <PieChart className="w-12 h-12 mb-3 opacity-50" />
                                <p>No holdings found</p>
                                <Link href="/portfolio" className="text-primary hover:underline mt-2">Add your first investment</Link>
                            </div>
                        )}
                    </div>
                </GlassCard>

                {/* AI Insight */}
                <GlassCard className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Bot className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-white">AI Insight</h2>
                    </div>
                    <div className="h-[300px] flex flex-col justify-between">
                        <p className="text-gray-300 leading-relaxed">{aiInsight}</p>
                        <div className="space-y-3 mt-4">
                            <div className="p-3 bg-white/5 rounded-lg border-l-2 border-green-500">
                                <div className="text-xs text-green-400 font-medium">Buying Opportunity</div>
                                <div className="text-sm text-white">Bank stocks showing strong resistance levels.</div>
                            </div>
                            <div className="p-3 bg-white/5 rounded-lg border-l-2 border-yellow-500">
                                <div className="text-xs text-yellow-400 font-medium">Caution</div>
                                <div className="text-sm text-white">Tech sector volatility expected this week.</div>
                            </div>
                        </div>
                        <Link href="/ai-advisor">
                            <AnimatedButton variant="secondary" className="w-full mt-auto">
                                Ask AI Advisor
                            </AnimatedButton>
                        </Link>
                    </div>
                </GlassCard>
            </div>

            {/* Market Indices */}
            <div>
                <h2 className="text-lg font-semibold text-white mb-4">Market Indices</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {indices.map((index) => (
                        <GlassCard key={index.symbol} className="p-4">
                            <div className="text-sm text-gray-400 mb-1">{index.name}</div>
                            <PriceDisplay
                                price={index.price}
                                change={index.change}
                                changePercent={index.changePercent}
                                currency={index.symbol.includes('NSEI') || index.symbol.includes('BSESN') ? 'INR' : 'USD'}
                                size="sm"
                            />
                        </GlassCard>
                    ))}
                </div>
            </div>

            {/* Global Markets Globe */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Global Markets</h2>
                    <span className="text-xs text-gray-400">Interactive 3D Globe</span>
                </div>
                <div className="h-[400px]">
                    <GlobalMarkets />
                </div>
            </GlassCard>
        </div>
    );
}
