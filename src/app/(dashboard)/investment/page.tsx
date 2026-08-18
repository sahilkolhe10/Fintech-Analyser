'use client';

// Investment Page — ML model hub: live signals from both vendored trading
// models (Nifty 500 XGBoost + Crypto HistGradientBoosting), backtest stats,
// and links to the underlying research repos.

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn } from '@/lib/animations';
import { MlSignalsPanel } from '@/components/signals/MlSignalsPanel';
import {
    fetchMlSignal, mlSymbolOptions, DEFAULT_SYMBOLS,
    type MlSignal,
} from '@/services/ml';
import {
    TrendingUp, TrendingDown, Minus, Cpu, ExternalLink,
    ShieldCheck, RefreshCw, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MODELS = [
    {
        market: 'nifty500' as const,
        name: 'Nifty 500 XGBoost',
        tagline: 'Intraday equity signals for Indian markets',
        description: 'XGBoost classifier trained in-process on each symbol\'s recent 5-minute bars with 30 technical indicators (MACD, RSI, ADX, ATR, Bollinger, volume analysis). Statistical RSI/EMA fallback keeps signals flowing even with thin data.',
        repo: 'https://github.com/RohitSwami33/nifty500-feb26',
        stats: [
            { label: 'Win Rate', value: '52–58%' },
            { label: 'Precision (Buy)', value: '>50% @ 0.87' },
            { label: 'Max Drawdown', value: '<15%' },
            { label: 'Sharpe', value: '>1.5' },
        ],
        highlights: ['30 engineered indicators', '5-min intraday bars', '3-class: Buy / Hold / Short', 'Trained on recent regimes'],
    },
    {
        market: 'crypto' as const,
        name: 'Crypto HistGradientBoosting',
        tagline: 'Hourly LONG/SHORT signals for BTC, ETH, SOL',
        description: 'HistGradientBoosting classifier trained on 5 years of hourly OHLCV with wick-based TP/SL targets — the model learns which direction would have hit take-profit before stop-loss, using actual highs and lows.',
        repo: 'https://github.com/RohitSwami33/Crypto-model-jan2026',
        stats: [
            { label: 'Backtest Return', value: '+216.74%' },
            { label: 'Win Rate', value: '51.2%' },
            { label: 'Trades (4mo)', value: '11,707' },
            { label: 'Leverage', value: '5x' },
        ],
        highlights: ['Wick-based targets', '5y hourly data', '1:3 risk-reward', 'ATR stop-loss'],
    },
];

const DIRECTION_STYLES: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    BUY: { label: 'BUY', cls: 'bg-green-500/20 text-green-400 border-green-500/40', icon: <TrendingUp className="w-4 h-4" /> },
    SHORT: { label: 'SHORT', cls: 'bg-red-500/20 text-red-400 border-red-500/40', icon: <TrendingDown className="w-4 h-4" /> },
    LONG: { label: 'LONG', cls: 'bg-green-500/20 text-green-400 border-green-500/40', icon: <TrendingUp className="w-4 h-4" /> },
    HOLD: { label: 'HOLD', cls: 'bg-gray-500/20 text-gray-300 border-gray-500/40', icon: <Minus className="w-4 h-4" /> },
};

export default function InvestmentPage() {
    const fadeRef = useFadeIn();

    return (
        <div ref={fadeRef} className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Activity className="w-8 h-8 text-primary" />
                        Investment Intelligence
                    </h1>
                    <p className="text-gray-400 mt-1">
                        ML-powered trading models — live signals, backtested strategies, research-backed.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 rounded-xl px-3 py-2">
                    <ShieldCheck className="w-4 h-4 text-green-400" />
                    Educational research only — not financial advice
                </div>
            </div>

            {/* Model cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {MODELS.map((model) => (
                    <ModelCard key={model.market} {...model} />
                ))}
            </div>

            {/* Live signals */}
            <MlSignalsPanel />

            {/* How it works */}
            <GlassCard className="p-6" hover={false}>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                    <Cpu className="w-5 h-5 text-primary" />
                    How the models work
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400">
                    <div className="p-4 bg-white/5 rounded-xl">
                        <div className="text-white font-medium mb-1">1 · Data</div>
                        Live 5-min NSE bars via Yahoo Finance; hourly crypto klines via Binance — no keys required.
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl">
                        <div className="text-white font-medium mb-1">2 · Features</div>
                        30 technical indicators (trend, momentum, volatility, volume, price action) normalized per symbol.
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl">
                        <div className="text-white font-medium mb-1">3 · Signal</div>
                        XGBoost / HistGradientBoosting outputs a direction with calibrated confidence; low conviction folds to HOLD.
                    </div>
                </div>
            </GlassCard>
        </div>
    );
}

function ModelCard({
    market, name, tagline, description, repo, stats, highlights,
}: (typeof MODELS)[number]) {
    const [symbol, setSymbol] = useState(DEFAULT_SYMBOLS[market]);
    const [signal, setSignal] = useState<MlSignal | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchSignal = async (s?: string) => {
        const target = (s ?? symbol).toUpperCase();
        setLoading(true);
        setError(null);
        const result = await fetchMlSignal(market, target);
        setLoading(false);
        if (result.success && result.data) {
            setSignal(result.data);
        } else {
            setError(result.error || 'Service unavailable');
        }
    };

    useEffect(() => {
        fetchSignal();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [market]);

    const style = signal ? DIRECTION_STYLES[signal.direction] : null;

    return (
        <GlassCard className="p-6">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h2 className="text-xl font-semibold text-white">{name}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{tagline}</p>
                </div>
                <a
                    href={repo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                >
                    GitHub <ExternalLink className="w-3 h-3" />
                </a>
            </div>

            <p className="text-sm text-gray-400 mb-4">{description}</p>

            {/* Live signal */}
            <div className="bg-white/5 rounded-xl p-4 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Live signal</span>
                    <div className="flex gap-1">
                        {mlSymbolOptions[market].slice(0, 4).map((s) => (
                            <button
                                key={s}
                                onClick={() => { setSymbol(s); fetchSignal(s); }}
                                className={cn(
                                    'px-2 py-0.5 rounded-md text-xs transition-all',
                                    symbol === s ? 'bg-primary text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {loading ? (
                        <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />
                    ) : signal && style ? (
                        <>
                            <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border', style.cls)}>
                                {style.icon}
                                <span className="font-bold text-sm">{style.label}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between text-sm">
                                    <span className="text-white font-medium">{signal.symbol}</span>
                                    <span className="text-gray-400">conf {Math.round(signal.probability * 100)}%</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden">
                                    <div
                                        className={cn('h-full', signal.direction === 'SHORT' ? 'bg-red-400' : 'bg-green-400')}
                                        style={{ width: `${Math.round(signal.probability * 100)}%` }}
                                    />
                                </div>
                            </div>
                            <AnimatedButton variant="secondary" onClick={() => fetchSignal()} className="!px-3 !py-1.5 text-xs">
                                <RefreshCw className="w-3.5 h-3.5" />
                            </AnimatedButton>
                        </>
                    ) : error ? (
                        <span className="text-xs text-yellow-300">{error}</span>
                    ) : null}
                </div>
            </div>

            {/* Backtest stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                {stats.map((s) => (
                    <div key={s.label} className="p-2.5 bg-white/5 rounded-lg text-center">
                        <div className="text-sm font-bold text-white">{s.value}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Highlights */}
            <div className="flex flex-wrap gap-1.5">
                {highlights.map((h) => (
                    <span key={h} className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] rounded-full">
                        {h}
                    </span>
                ))}
            </div>
        </GlassCard>
    );
}
