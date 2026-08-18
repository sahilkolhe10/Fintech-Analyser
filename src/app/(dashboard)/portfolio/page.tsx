'use client';

// Portfolio Page - Complete with Simulations, Risk Analysis, Recommendations & Download
import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn, useStaggerChildren } from '@/lib/animations';
import { useAuthStore, useCurrencyStore } from '@/store';
import { formatCurrency } from '@/lib/utils';
import {
    getHoldings,
    addHolding,
    deleteHolding,
    Holding,
    NIFTY_POPULAR_STOCKS,
    MONTHLY_GAINERS,
    STOCK_NEWS,
    getTradingViewUrl,
    calculatePortfolioTotals
} from '@/services/holdings';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import {
    Plus, TrendingUp, TrendingDown, Trash2, ExternalLink,
    Search, X, BarChart3, Newspaper,
    Shield, LineChart, AreaChart, Download, Eye, Network, Upload
} from 'lucide-react';
import { InteractivePortfolioChart } from '@/components/charts/InteractivePortfolioChart';
import { MarketCorrelationGraph } from '@/components/charts/MarketCorrelationGraph';
import { parsePortfolioFile } from '@/lib/import-utils';

// Simulated current prices
const CURRENT_PRICES: Record<string, number> = {
    'RELIANCE.NS': 2580, 'TCS.NS': 3950, 'HDFCBANK.NS': 1720, 'INFY.NS': 1480,
    'ICICIBANK.NS': 1050, 'SBIN.NS': 760, 'BHARTIARTL.NS': 1280, 'ITC.NS': 465,
    'KOTAKBANK.NS': 1780, 'LT.NS': 3520, 'AXISBANK.NS': 1120, 'BAJFINANCE.NS': 7200,
    'ASIANPAINT.NS': 2850, 'MARUTI.NS': 10800, 'TITAN.NS': 3650, 'SUNPHARMA.NS': 1480,
    'WIPRO.NS': 520, 'ULTRACEMCO.NS': 9800, 'NESTLEIND.NS': 2450, 'HINDUNILVR.NS': 2380,
};

// Risk profiles & Recommendations
const STOCK_DATA: Record<string, { risk: 'Low' | 'Medium' | 'High'; growth: number; rec: 'Buy' | 'Hold' | 'Sell' | 'Strong Buy' }> = {
    'RELIANCE.NS': { risk: 'Medium', growth: 12, rec: 'Buy' },
    'TCS.NS': { risk: 'Low', growth: 10, rec: 'Hold' },
    'HDFCBANK.NS': { risk: 'Low', growth: 11, rec: 'Buy' },
    'INFY.NS': { risk: 'Low', growth: 9, rec: 'Hold' },
    'ICICIBANK.NS': { risk: 'Medium', growth: 13, rec: 'Buy' },
    'SBIN.NS': { risk: 'Medium', growth: 14, rec: 'Buy' },
    'BHARTIARTL.NS': { risk: 'Medium', growth: 15, rec: 'Strong Buy' },
    'ITC.NS': { risk: 'Low', growth: 8, rec: 'Hold' },
    'BAJFINANCE.NS': { risk: 'High', growth: 18, rec: 'Buy' },
    'Default': { risk: 'Medium', growth: 10, rec: 'Hold' }
};

export default function PortfolioPage() {
    const fadeRef = useFadeIn();
    const staggerRef = useStaggerChildren(0.1);
    const { user, profile } = useAuthStore();
    const { currency } = useCurrencyStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [holdings, setHoldings] = useState<Holding[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'holdings' | 'analysis' | 'simulations' | 'correlations' | 'watchlist' | 'gainers' | 'news'>('holdings');

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<{ symbol: string; name: string } | null>(null);
    const [quantity, setQuantity] = useState('');
    const [buyPrice, setBuyPrice] = useState('');
    const [simYears, setSimYears] = useState(5);

    useEffect(() => {
        if (!user) return;
        loadHoldings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const loadHoldings = async () => {
        if (!user) return;
        try {
            const result = await getHoldings(user.uid);
            if (result.success && result.data) {
                setHoldings(result.data);
            }
        } catch (error) {
            console.error('Error loading holdings:', error);
        }
    };

    const handleAddHolding = async () => {
        if (!user || !selectedStock || !quantity || !buyPrice) {
            toast.error('Please fill all fields');
            return;
        }
        const result = await addHolding({
            userId: user.uid,
            symbol: selectedStock.symbol,
            name: selectedStock.name,
            quantity: parseInt(quantity),
            buyPrice: parseFloat(buyPrice),
            buyDate: Timestamp.now(),
        });
        if (result.success) {
            toast.success('Holding added!');
            setShowAddModal(false);
            resetForm();
            loadHoldings();
        } else {
            toast.error(result.error || 'Failed to add holding');
        }
    };

    const handleDeleteHolding = async (holdingId: string) => {
        const result = await deleteHolding(holdingId);
        if (result.success) {
            toast.success('Holding removed');
            loadHoldings();
        } else {
            toast.error('Failed to remove');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        const toastId = toast.loading('Importing portfolio...');
        try {
            const importedData = await parsePortfolioFile(file);
            if (importedData.length === 0) {
                toast.error('No valid holdings found check format', { id: toastId });
                return;
            }

            let addedCount = 0;
            for (const item of importedData) {
                await addHolding({
                    userId: user.uid,
                    symbol: item.symbol,
                    name: item.name || item.symbol,
                    quantity: item.quantity,
                    buyPrice: item.buyPrice,
                    buyDate: Timestamp.now(),
                });
                addedCount++;
            }

            toast.success(`Imported ${addedCount} holdings`, { id: toastId });
            loadHoldings();
        } catch (error) {
            console.error(error);
            toast.error('Failed to process file', { id: toastId });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const resetForm = () => {
        setSearchQuery('');
        setSelectedStock(null);
        setQuantity('');
        setBuyPrice('');
    };

    const downloadReport = () => {
        const { riskLevel, riskScore, avgGrowth } = getPortfolioAnalysis();
        const date = new Date().toLocaleDateString();

        const report = `
FINMANAGE AI PORTFOLIO REPORT
Date: ${date}
User: ${profile?.displayName || 'Investor'}

PORTFOLIO SUMMARY
-----------------
Total Value: ${formatCurrency(totalValue, currency)}
Total Return: ${pnlPercent.toFixed(2)}%
Risk Level: ${riskLevel} (${riskScore}/100)
Avg Annual Growth: ${avgGrowth.toFixed(1)}%

HOLDINGS ANALYSIS
-----------------
${holdings.map(h => {
            const stockData = STOCK_DATA[h.symbol] || STOCK_DATA['Default'];
            return `${h.symbol}: ${h.quantity} shares, Risk: ${stockData.risk}, Rec: ${stockData.rec}`;
        }).join('\n')}
    `;

        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finmanage_report_${date.replace(/\//g, '-')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Report downloaded!');
    };

    const filteredStocks = NIFTY_POPULAR_STOCKS.filter(s =>
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const priceMap = new Map(Object.entries(CURRENT_PRICES));
    const { totalValue, totalCost, totalPnL, pnlPercent } = calculatePortfolioTotals(holdings, priceMap);

    const getPortfolioAnalysis = () => {
        if (holdings.length === 0) return { riskLevel: 'N/A', riskScore: 0, avgGrowth: 0 };
        let totalGrowth = 0;
        let totalWeight = 0;
        let highRisk = 0;
        holdings.forEach(h => {
            const stockData = STOCK_DATA[h.symbol] || STOCK_DATA['Default'];
            const weight = h.quantity * (CURRENT_PRICES[h.symbol] || h.buyPrice);
            totalWeight += weight;
            totalGrowth += stockData.growth * weight;
            if (stockData.risk === 'High') highRisk += weight;
        });
        const avgGrowth = totalWeight > 0 ? totalGrowth / totalWeight : 0;
        const highRiskPercent = totalWeight > 0 ? (highRisk / totalWeight) * 100 : 0;
        let riskLevel = 'Safe & Stable';
        let riskScore = 20;
        if (highRiskPercent > 40) { riskLevel = 'Extreme Risk'; riskScore = 90; }
        else if (highRiskPercent > 20) { riskLevel = 'Volatile'; riskScore = 60; }
        return { riskLevel, riskScore, avgGrowth, totalWeight };
    };

    const { riskLevel, riskScore, avgGrowth } = getPortfolioAnalysis();

    const getRecColor = (rec: string) => {
        switch (rec) {
            case 'Buy': case 'Strong Buy': return 'text-green-400 bg-green-500/10 border-green-500/20';
            case 'Sell': case 'Strong Sell': return 'text-red-400 bg-red-500/10 border-red-500/20';
            default: return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
        }
    };

    const getSentimentColor = (sentiment: string) => {
        switch (sentiment) {
            case 'bullish': return 'bg-green-500/20 text-green-400';
            case 'bearish': return 'bg-red-500/20 text-red-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    return (
        <div ref={fadeRef} className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Portfolio</h1>
                    <p className="text-gray-400 mt-1">Manage, analyze and simulate your wealth</p>
                </div>
                <div className="flex gap-2">
                    {/* HIDDEN FILE INPUT */}
                    <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileUpload}
                    />
                    <AnimatedButton variant="secondary" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="w-4 h-4" />
                        Import
                    </AnimatedButton>
                    <AnimatedButton onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4" />
                        Add Holding
                    </AnimatedButton>
                </div>
            </div>

            <div ref={staggerRef} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* ... Stats Cards (Same as before) ... */}
                <GlassCard className="p-5">
                    <div className="text-gray-400 text-sm mb-2">Total Value</div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(totalValue, currency)}</div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="text-gray-400 text-sm mb-2">Total Investment</div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(totalCost, currency)}</div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="text-gray-400 text-sm mb-2">Total P&L</div>
                    <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL, currency)}
                    </div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="text-gray-400 text-sm mb-2">Return %</div>
                    <div className={`text-2xl font-bold flex items-center gap-2 ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {pnlPercent >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </div>
                </GlassCard>
                <GlassCard className="p-5">
                    <div className="text-gray-400 text-sm mb-2">Risk Level</div>
                    <div className={`text-xl font-bold ${riskScore > 60 ? 'text-red-400' : 'text-green-400'}`}>{riskLevel}</div>
                </GlassCard>
            </div>

            <div className="flex gap-2 border-b border-white/10 pb-2 overflow-x-auto">
                {[
                    { id: 'holdings', label: 'Holdings & Recs', icon: BarChart3 },
                    { id: 'analysis', label: 'Risk & Growth', icon: Shield },
                    { id: 'simulations', label: 'Simulations', icon: AreaChart },
                    { id: 'correlations', label: 'Market Network', icon: Network }, // New Tab
                    { id: 'watchlist', label: 'Watchlist', icon: Eye },
                    { id: 'gainers', label: 'Gainers', icon: TrendingUp },
                    { id: 'news', label: 'News', icon: Newspaper },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-primary/20 text-primary'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'holdings' && (
                <GlassCard className="p-6">
                    {holdings.length === 0 ? (
                        <div className="text-center py-12">
                            <BarChart3 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                            <p className="text-gray-400 text-lg">No holdings yet</p>
                            <div className="flex justify-center gap-2 mt-4">
                                <AnimatedButton variant="secondary" onClick={() => fileInputRef.current?.click()}>
                                    Import Excel
                                </AnimatedButton>
                                <AnimatedButton onClick={() => setShowAddModal(true)}>
                                    Add Manually
                                </AnimatedButton>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-gray-400 text-sm border-b border-white/10">
                                        <th className="pb-3 font-medium">Stock</th>
                                        <th className="pb-3 font-medium">Qty</th>
                                        <th className="pb-3 font-medium">Buy Price</th>
                                        <th className="pb-3 font-medium">Current</th>
                                        <th className="pb-3 font-medium">P&L</th>
                                        <th className="pb-3 font-medium">Rec</th>
                                        <th className="pb-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holdings.map((holding) => {
                                        const currentPrice = CURRENT_PRICES[holding.symbol] || holding.buyPrice;
                                        const pnl = (currentPrice - holding.buyPrice) * holding.quantity;
                                        const pnlPct = ((currentPrice - holding.buyPrice) / holding.buyPrice) * 100;
                                        const stockData = STOCK_DATA[holding.symbol] || STOCK_DATA['Default'];
                                        return (
                                            <tr key={holding.id} className="border-b border-white/5 hover:bg-white/5">
                                                <td className="py-4">
                                                    <a href={getTradingViewUrl(holding.symbol)} target="_blank" rel="noopener noreferrer" className="hover:text-primary group">
                                                        <div className="font-medium text-white flex items-center gap-2">
                                                            {holding.symbol.replace('.NS', '')}
                                                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                                        </div>
                                                        <div className="text-sm text-gray-400">{holding.name}</div>
                                                    </a>
                                                </td>
                                                <td className="py-4 text-white">{holding.quantity}</td>
                                                <td className="py-4 text-gray-300">{formatCurrency(holding.buyPrice, currency)}</td>
                                                <td className="py-4 text-white">{formatCurrency(currentPrice, currency)}</td>
                                                <td className="py-4">
                                                    <div className={pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, currency)}
                                                        <span className="text-xs ml-1">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
                                                    </div>
                                                </td>
                                                <td className="py-4">
                                                    <span className={`text-xs px-2 py-1 rounded border ${getRecColor(stockData.rec)}`}>
                                                        {stockData.rec}
                                                    </span>
                                                </td>
                                                <td className="py-4">
                                                    <button onClick={() => holding.id && handleDeleteHolding(holding.id)} className="p-2 hover:bg-red-500/20 rounded-lg">
                                                        <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </GlassCard>
            )}

            {activeTab === 'analysis' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <GlassCard className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Shield className="w-5 h-5 text-primary" />
                                <h2 className="text-lg font-semibold text-white">Risk Analysis</h2>
                            </div>
                            <button onClick={downloadReport} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-primary transition-colors"><Download className="w-4 h-4" /> Download Report</button>
                        </div>
                        {holdings.length === 0 ? <p className="text-gray-400">Add holdings to see risk analysis</p> : (
                            <div className="text-center py-4">
                                <div className={`text-4xl font-bold ${riskScore > 60 ? 'text-red-400' : 'text-green-400'}`}>{riskLevel}</div>
                                <div className="text-gray-400 mt-2">Portfolio Risk Score: {riskScore}/100</div>
                                <div className="mt-4 p-4 bg-white/5 rounded-lg text-sm text-gray-300">
                                    {riskScore > 60 ? 'High exposure to volatile assets. Consider diversifying into blue-chip stocks.' : 'Balanced portfolio with steady growth potential.'}
                                </div>
                            </div>
                        )}
                    </GlassCard>
                    <GlassCard className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <LineChart className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-white">Projected Growth</h2>
                        </div>
                        {holdings.length === 0 ? <p className="text-gray-400">Add holdings to see projections</p> : (
                            <div className="space-y-4">
                                <div className="text-center py-2">
                                    <div className="text-lg text-gray-400">Expected Annual Growth</div>
                                    <div className="text-3xl font-bold text-green-400">+{avgGrowth.toFixed(1)}%</div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-white/5 rounded-lg text-center">
                                        <div className="text-gray-400 text-xs">1 Year Projection</div>
                                        <div className="text-white font-bold">{formatCurrency(totalValue * (1 + avgGrowth / 100), currency)}</div>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-lg text-center">
                                        <div className="text-gray-400 text-xs">5 Year Projection</div>
                                        <div className="text-white font-bold">{formatCurrency(totalValue * Math.pow(1 + avgGrowth / 100, 5), currency)}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </GlassCard>
                </div>
            )}

            {activeTab === 'simulations' && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <AreaChart className="w-5 h-5 text-accent" />
                                Wealth Simulation
                            </h2>
                            <p className="text-sm text-gray-400">Projected portfolio value over time (Interactive)</p>
                        </div>
                        <select value={simYears} onChange={(e) => setSimYears(parseInt(e.target.value))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-primary">
                            <option value={1}>1 Year</option>
                            <option value={3}>3 Years</option>
                            <option value={5}>5 Years</option>
                            <option value={10}>10 Years</option>
                        </select>
                    </div>
                    {holdings.length > 0 ? (
                        <div className="bg-black/20 rounded-xl p-4">
                            {/* NEW RECHARTS COMPONENT */}
                            <InteractivePortfolioChart startValue={totalValue} years={simYears} growthRate={avgGrowth || 8} />
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-400">Add holdings to run wealth simulations</div>
                    )}
                </GlassCard>
            )}

            {/* NEW CORRELATIONS TAB with D3 */}
            {activeTab === 'correlations' && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Network className="w-5 h-5 text-purple-400" />
                                Market Network
                            </h2>
                            <p className="text-sm text-gray-400">Sector correlations and market structure (Drag to interact)</p>
                        </div>
                    </div>
                    <div className="h-[400px]">
                        <MarketCorrelationGraph />
                    </div>
                    <p className="text-xs text-center text-gray-500 mt-2">D3.js Force Directed Graph Visualization</p>
                </GlassCard>
            )}

            {activeTab === 'watchlist' && (
                <GlassCard className="p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Popular Nifty 250 Stocks</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {NIFTY_POPULAR_STOCKS.map((stock) => {
                            const price = CURRENT_PRICES[stock.symbol] || 0;
                            return (
                                <a key={stock.symbol} href={getTradingViewUrl(stock.symbol)} target="_blank" rel="noopener noreferrer" className="p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all group">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-medium text-white">{stock.symbol.replace('.NS', '')}</div>
                                        <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-primary" />
                                    </div>
                                    <div className="text-sm text-gray-400 truncate">{stock.name}</div>
                                    <div className="text-xs text-primary mt-1">{stock.sector}</div>
                                    {price > 0 && <div className="text-white mt-2">{formatCurrency(price, 'INR')}</div>}
                                </a>
                            );
                        })}
                    </div>
                </GlassCard>
            )}

            {activeTab === 'gainers' && (
                <GlassCard className="p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Top Monthly Gainers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {MONTHLY_GAINERS.map((stock, idx) => (
                            <a key={stock.symbol} href={getTradingViewUrl(stock.symbol)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 group">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 font-bold">{idx + 1}</div>
                                    <div>
                                        <div className="font-medium text-white flex items-center gap-2">
                                            {stock.symbol.replace('.NS', '')}
                                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                        </div>
                                        <div className="text-sm text-gray-400">{stock.name}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-green-400 font-bold">+{stock.change}%</div>
                                    <div className="text-gray-300 text-sm">{formatCurrency(stock.price, 'INR')}</div>
                                </div>
                            </a>
                        ))}
                    </div>
                </GlassCard>
            )}

            {activeTab === 'news' && (
                <GlassCard className="p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Market News & Sentiment</h2>
                    <div className="space-y-3">
                        {STOCK_NEWS.map((news) => (
                            <div key={news.id} className="flex items-start gap-4 p-4 bg-white/5 rounded-xl">
                                <div className={`p-2 rounded-lg ${getSentimentColor(news.sentiment)}`}><Newspaper className="w-4 h-4" /></div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <a href={getTradingViewUrl(news.symbol)} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">{news.symbol.replace('.NS', '')}</a>
                                        <span className={`text-xs px-2 py-0.5 rounded ${getSentimentColor(news.sentiment)}`}>{news.sentiment}</span>
                                    </div>
                                    <p className="text-white">{news.headline}</p>
                                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                                        <span>{news.source}</span><span>•</span><span>{news.time}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <GlassCard className="w-full max-w-lg p-6 m-4 max-h-[90vh] overflow-y-auto">
                        {/* ADD HOLDING MODAL CONTENT (Same as before) */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">Add Holding</h2>
                            <button onClick={() => { setShowAddModal(false); resetForm(); }} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Search Stock</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none" />
                                </div>
                                {searchQuery && (
                                    <div className="mt-2 bg-[#1a1a2e] border border-white/10 rounded-xl max-h-48 overflow-y-auto">
                                        {filteredStocks.map((stock) => (
                                            <button key={stock.symbol} onClick={() => { setSelectedStock(stock); setSearchQuery(''); }} className="w-full px-4 py-3 text-left hover:bg-white/5">
                                                <div className="font-medium text-white">{stock.symbol.replace('.NS', '')}</div>
                                                <div className="text-sm text-gray-400">{stock.name}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {selectedStock && <div className="mt-2 text-white font-medium p-2 bg-primary/20 rounded">{selectedStock.name}</div>}
                            </div>
                            <div><label className="text-gray-400 text-sm">Quantity</label><input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full bg-white/5 rounded-xl p-3 text-white mt-1" /></div>
                            <div><label className="text-gray-400 text-sm">Buy Price</label><input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} className="w-full bg-white/5 rounded-xl p-3 text-white mt-1" /></div>
                            <AnimatedButton onClick={handleAddHolding} className="w-full mt-4" disabled={!selectedStock}>Add Holding</AnimatedButton>
                        </div>
                    </GlassCard>
                </div>
            )}
        </div>
    );
}
