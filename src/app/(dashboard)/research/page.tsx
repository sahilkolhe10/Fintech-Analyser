'use client';

// Research Page - Stock Analysis with Clickable Categories and Commodities
import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useFadeIn } from '@/lib/animations';
import { getTradingViewUrl, NIFTY_POPULAR_STOCKS, MONTHLY_GAINERS, type WatchlistItem } from '@/services/holdings';
import {
    TrendingUp, BarChart3, Target,
    Shield, AlertCircle, ExternalLink, X, Search,
    Coins, Droplets, Flame, LineChart
} from 'lucide-react';
import { StockAnalysisChart } from '@/components/charts/StockAnalysisChart';
import { MlSignalsPanel } from '@/components/signals/MlSignalsPanel';

// Stock categories data
const AI_BUY_SIGNALS = [
    { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', price: 1280, signal: 'Strong Buy', confidence: 92, reason: '5G adoption driving ARPU growth' },
    { symbol: 'SBIN.NS', name: 'State Bank of India', price: 760, signal: 'Strong Buy', confidence: 88, reason: 'NPAs at multi-year lows' },
    { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', price: 1050, signal: 'Buy', confidence: 85, reason: 'Strong loan growth momentum' },
    { symbol: 'LT.NS', name: 'Larsen & Toubro', price: 3520, signal: 'Buy', confidence: 82, reason: 'Infrastructure order book at ATH' },
    { symbol: 'TITAN.NS', name: 'Titan Company', price: 3650, signal: 'Buy', confidence: 78, reason: 'Wedding season driving demand' },
];

const LOW_RISK_PICKS = [
    { symbol: 'TCS.NS', name: 'Tata Consultancy', price: 3950, beta: 0.65, dividend: 1.2 },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', price: 1720, beta: 0.72, dividend: 0.9 },
    { symbol: 'NESTLEIND.NS', name: 'Nestle India', price: 2450, beta: 0.45, dividend: 1.5 },
    { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', price: 2380, beta: 0.52, dividend: 1.8 },
    { symbol: 'ITC.NS', name: 'ITC Limited', price: 465, beta: 0.58, dividend: 3.2 },
    { symbol: 'ASIANPAINT.NS', name: 'Asian Paints', price: 2850, beta: 0.68, dividend: 0.8 },
];

const MARKET_ALERTS = [
    { title: 'RBI keeps repo rate unchanged at 6.5%', impact: 'neutral', sector: 'Banking' },
    { title: 'IT stocks under pressure on weak guidance', impact: 'bearish', sector: 'IT' },
    { title: 'PSU banks rally on strong Q3 results', impact: 'bullish', sector: 'Banking' },
    { title: 'Auto sales up 12% YoY in January', impact: 'bullish', sector: 'Auto' },
    { title: 'FII outflows continue for 5th straight session', impact: 'bearish', sector: 'Market' },
];

// Commodities Data
const COMMODITIES = [
    {
        name: 'Gold',
        symbol: 'MCX:GOLD',
        price: 62500,
        change: 1.2,
        unit: '10g',
        recommendation: 'Buy',
        insight: 'Safe haven demand rising amid geopolitical tensions. Central banks increasing reserves.',
        icon: Coins,
        color: 'text-yellow-400',
        bg: 'bg-yellow-400/20'
    },
    {
        name: 'Silver',
        symbol: 'MCX:SILVER',
        price: 74200,
        change: 0.8,
        unit: '1kg',
        recommendation: 'Hold',
        insight: 'Industrial demand remains strong, especially from EV and solar sectors.',
        icon: Coins,
        color: 'text-gray-300',
        bg: 'bg-gray-400/20'
    },
    {
        name: 'Crude Oil',
        symbol: 'MCX:CRUDEOIL',
        price: 6450,
        change: -1.5,
        unit: 'Barrel',
        recommendation: 'Sell',
        insight: 'Supply surplus expected next quarter. Weak global demand outlook.',
        icon: Droplets,
        color: 'text-black',
        bg: 'bg-gray-800'
    },
    {
        name: 'Natural Gas',
        symbol: 'MCX:NATGAS',
        price: 185,
        change: -2.1,
        unit: 'MMBtu',
        recommendation: 'Hold',
        insight: 'Winter demand fading, high inventory levels in major markets.',
        icon: Flame,
        color: 'text-blue-400',
        bg: 'bg-blue-400/20'
    }
];

type ActiveView = 'popular' | 'buySignals' | 'trending' | 'lowRisk' | 'alerts' | 'commodities' | 'analysis';

export default function ResearchPage() {
    const fadeRef = useFadeIn();
    const [activeView, setActiveView] = useState<ActiveView>('popular');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<WatchlistItem | null>(null);

    const filteredStocks = NIFTY_POPULAR_STOCKS.filter(s =>
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getImpactColor = (impact: string) => {
        switch (impact) {
            case 'bullish': return 'bg-green-500/20 text-green-400';
            case 'bearish': return 'bg-red-500/20 text-red-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    const getRecColor = (rec: string) => {
        switch (rec) {
            case 'Buy': case 'Strong Buy': return 'text-green-400';
            case 'Sell': case 'Strong Sell': return 'text-red-400';
            default: return 'text-yellow-400';
        }
    };

    const openAnalysis = (stock: WatchlistItem) => {
        setSelectedStock(stock);
        setActiveView('analysis');
    };

    return (
        <div ref={fadeRef} className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Research</h1>
                <p className="text-gray-400 mt-1">Discover and analyze stocks & commodities with AI-powered insights</p>
            </div>

            {/* Search */}
            <GlassCard className="p-4">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search stocks by name or symbol..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                    />
                </div>
            </GlassCard>

            {/* Quick Metrics Grid - CLICKABLE */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <button onClick={() => setActiveView('buySignals')} className={`text-left transition-all ${activeView === 'buySignals' ? 'ring-2 ring-primary' : ''}`}>
                    <GlassCard className="p-5 text-center hover:bg-white/5 h-full flex flex-col items-center justify-center">
                        <Target className="w-8 h-8 text-primary mb-2" />
                        <div className="text-xl font-bold text-white">{AI_BUY_SIGNALS.length}</div>
                        <div className="text-gray-400 text-xs">AI Buy Signals</div>
                    </GlassCard>
                </button>

                <button onClick={() => setActiveView('trending')} className={`text-left transition-all ${activeView === 'trending' ? 'ring-2 ring-primary' : ''}`}>
                    <GlassCard className="p-5 text-center hover:bg-white/5 h-full flex flex-col items-center justify-center">
                        <BarChart3 className="w-8 h-8 text-accent mb-2" />
                        <div className="text-xl font-bold text-white">{MONTHLY_GAINERS.length}</div>
                        <div className="text-gray-400 text-xs">Trending Stocks</div>
                    </GlassCard>
                </button>

                <button onClick={() => setActiveView('lowRisk')} className={`text-left transition-all ${activeView === 'lowRisk' ? 'ring-2 ring-primary' : ''}`}>
                    <GlassCard className="p-5 text-center hover:bg-white/5 h-full flex flex-col items-center justify-center">
                        <Shield className="w-8 h-8 text-green-400 mb-2" />
                        <div className="text-xl font-bold text-white">{LOW_RISK_PICKS.length}</div>
                        <div className="text-gray-400 text-xs">Low Risk Picks</div>
                    </GlassCard>
                </button>

                <button onClick={() => setActiveView('commodities')} className={`text-left transition-all ${activeView === 'commodities' ? 'ring-2 ring-primary' : ''}`}>
                    <GlassCard className="p-5 text-center hover:bg-white/5 h-full flex flex-col items-center justify-center">
                        <Coins className="w-8 h-8 text-yellow-400 mb-2" />
                        <div className="text-xl font-bold text-white">4</div>
                        <div className="text-gray-400 text-xs">Commodities</div>
                    </GlassCard>
                </button>

                <button onClick={() => setActiveView('alerts')} className={`text-left transition-all ${activeView === 'alerts' ? 'ring-2 ring-primary' : ''}`}>
                    <GlassCard className="p-5 text-center hover:bg-white/5 h-full flex flex-col items-center justify-center">
                        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                        <div className="text-xl font-bold text-white">{MARKET_ALERTS.length}</div>
                        <div className="text-gray-400 text-xs">Market Alerts</div>
                    </GlassCard>
                </button>
            </div>

            {/* Dynamic Content Based on Selection */}

            {/* ANALYSIS VIEW - With Recharts */}
            {activeView === 'analysis' && selectedStock && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                                <LineChart className="w-5 h-5 text-primary" />
                                {selectedStock.symbol.replace('.NS', '')} Analysis
                            </h2>
                            <p className="text-sm text-gray-400">{selectedStock.name}</p>
                        </div>
                        <button onClick={() => setActiveView('popular')} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    {/* CHARTS */}
                    <div className="mb-6">
                        <StockAnalysisChart symbol={selectedStock.symbol} />
                        <p className="text-center text-gray-400 text-xs mt-2">Price & Volume (Simulated Live Data)</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
                        <div className="text-center">
                            <div className="text-gray-400 text-xs">P/E Ratio</div>
                            <div className="text-white font-bold">24.5</div>
                        </div>
                        <div className="text-center">
                            <div className="text-gray-400 text-xs">Market Cap</div>
                            <div className="text-white font-bold">₹12.5T</div>
                        </div>
                        <div className="text-center">
                            <div className="text-gray-400 text-xs">Div Yield</div>
                            <div className="text-white font-bold">1.2%</div>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                        <a href={getTradingViewUrl(selectedStock.symbol)} target="_blank" rel="noopener noreferrer"
                            className="flex-1 bg-white/5 hover:bg-white/10 text-center py-2 rounded-lg text-sm text-white transition-colors">
                            View on TradingView
                        </a>
                    </div>
                </GlassCard>
            )}

            {/* Commodities View */}
            {activeView === 'commodities' && (
                <GlassCard className="p-6">
                    {/* ... (Existing Commodities Content) ... */}
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Coins className="w-5 h-5 text-yellow-500" />
                            Commodities Tracker & Insights
                        </h2>
                        <button onClick={() => setActiveView('popular')} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {COMMODITIES.map((comm) => (
                            <div key={comm.name} className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                                {/* ... Same as before ... */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg ${comm.bg} flex items-center justify-center`}>
                                            <comm.icon className={`w-5 h-5 ${comm.color}`} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-white">{comm.name}</div>
                                            <div className="text-xs text-gray-400">per {comm.unit}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-mono text-white">₹{comm.price.toLocaleString()}</div>
                                        <div className={`text-xs ${comm.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {comm.change >= 0 ? '+' : ''}{comm.change}%
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-gray-400">Recommendation</span>
                                        <span className={`text-sm font-bold ${getRecColor(comm.recommendation)}`}>
                                            {comm.recommendation}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-300 bg-white/5 p-2 rounded-lg">
                                        💡 {comm.insight}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* AI Buy Signals */}
            {activeView === 'buySignals' && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Target className="w-5 h-5 text-primary" />
                            AI Buy Signals
                        </h2>
                        <button onClick={() => setActiveView('popular')} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        {AI_BUY_SIGNALS.map((stock) => (
                            <button key={stock.symbol} onClick={() => openAnalysis(stock)} className="w-full text-left">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-green-500/5 flex items-center justify-center">
                                            <TrendingUp className="w-6 h-6 text-green-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-white flex items-center gap-2">
                                                {stock.symbol.replace('.NS', '')}
                                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                            </div>
                                            <div className="text-sm text-gray-400">{stock.name}</div>
                                            <div className="text-xs text-gray-500 mt-1">{stock.reason}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-green-400 font-medium">{stock.signal}</div>
                                        <div className="text-sm text-gray-400">{stock.confidence}% confidence</div>
                                        <div className="text-white mt-1">₹{stock.price.toLocaleString()}</div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Trending / Monthly Gainers */}
            {activeView === 'trending' && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-accent" />
                            Trending Stocks (Monthly Gainers)
                        </h2>
                        <button onClick={() => setActiveView('popular')} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {MONTHLY_GAINERS.map((stock, idx) => (
                            <button key={stock.symbol} onClick={() => openAnalysis(stock)} className="w-full text-left">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 font-bold">
                                            {idx + 1}
                                        </div>
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
                                        <div className="text-gray-300 text-sm">₹{stock.price.toLocaleString()}</div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Low Risk Picks */}
            {activeView === 'lowRisk' && (
                <GlassCard className="p-6">
                    {/* ... (Existing Low Risk with onClick) ... */}
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Shield className="w-5 h-5 text-green-400" />
                            Low Risk / Blue Chip Stocks
                        </h2>
                        <button onClick={() => setActiveView('popular')} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {LOW_RISK_PICKS.map((stock) => (
                            <button key={stock.symbol} onClick={() => openAnalysis(stock)} className="w-full text-left">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                                            <Shield className="w-6 h-6 text-green-400" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-white flex items-center gap-2">
                                                {stock.symbol.replace('.NS', '')}
                                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                            </div>
                                            <div className="text-sm text-gray-400">{stock.name}</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-white font-medium">₹{stock.price.toLocaleString()}</div>
                                        <div className="text-xs text-gray-400">Beta: {stock.beta}</div>
                                        <div className="text-xs text-green-400">Div: {stock.dividend}%</div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Market Alerts */}
            {activeView === 'alerts' && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-400" />
                            Market Alerts & News
                        </h2>
                        <button onClick={() => setActiveView('popular')} className="text-gray-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        {MARKET_ALERTS.map((alert, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                                <div className="flex-1">
                                    <p className="text-white">{alert.title}</p>
                                    <div className="text-xs text-gray-500 mt-1">Sector: {alert.sector}</div>
                                </div>
                                <span className={`text-xs px-3 py-1 rounded-full ${getImpactColor(alert.impact)}`}>
                                    {alert.impact}
                                </span>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* Popular Stocks (Default View) */}
            {activeView === 'popular' && (
                <GlassCard className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">All Nifty 250 Stocks</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {(searchQuery ? filteredStocks : NIFTY_POPULAR_STOCKS).map((stock) => (
                            <button key={stock.symbol} onClick={() => openAnalysis(stock)} className="w-full text-left">
                                <div className="p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all group">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-medium text-white">{stock.symbol.replace('.NS', '')}</div>
                                        <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-primary" />
                                    </div>
                                    <div className="text-sm text-gray-400 truncate">{stock.name}</div>
                                    <div className="text-xs text-primary mt-1">{stock.sector}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </GlassCard>
            )}

            {/* ML Model Signals */}
            <MlSignalsPanel />
        </div>
    );
}
