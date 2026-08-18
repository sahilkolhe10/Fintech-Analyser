'use client';

// ML Signals Panel — live model predictions from the FinManage ML service
// (Nifty 500 XGBoost + crypto classifier). Degrades gracefully when the
// service is not deployed.

import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import {
    Sparkles, TrendingUp, TrendingDown, Minus, Cpu, RefreshCw,
    AlertCircle, Info, ChevronDown, BarChart3, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    fetchMlSignal, fetchMlHistory, mlSymbolOptions, DEFAULT_SYMBOLS,
    type SignalMarket, type MlSignal, type NiftySignalHistory,
} from '@/services/ml';

const DIRECTION_STYLES: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    BUY: { label: 'BUY', cls: 'bg-green-500/20 text-green-400 border-green-500/40', icon: <TrendingUp className="w-4 h-4" /> },
    SHORT: { label: 'SHORT', cls: 'bg-red-500/20 text-red-400 border-red-500/40', icon: <TrendingDown className="w-4 h-4" /> },
    LONG: { label: 'LONG', cls: 'bg-green-500/20 text-green-400 border-green-500/40', icon: <TrendingUp className="w-4 h-4" /> },
    HOLD: { label: 'HOLD', cls: 'bg-gray-500/20 text-gray-300 border-gray-500/40', icon: <Minus className="w-4 h-4" /> },
};

const MODEL_INFO = {
    nifty500: {
        name: 'Nifty 500 XGBoost',
        description: 'Intraday 5-min signals (BUY/SHORT/HOLD) for Indian equities. XGBoost classifier trained in-process on each symbol\'s recent bars with 30 technical indicators; statistical RSI/EMA fallback when data is thin.',
        repo: 'https://github.com/RohitSwami33/nifty500-feb26',
    },
    crypto: {
        name: 'Crypto HistGradientBoosting',
        description: 'Hourly LONG/SHORT signals for BTC, ETH, SOL. HistGradientBoosting trained on 5 years of hourly OHLCV with wick-based (TP/SL) targets — decides which direction would have hit take-profit before stop-loss.',
        repo: 'https://github.com/RohitSwami33/Crypto-model-jan2026',
    },
} as const;

export function MlSignalsPanel() {
    const [market, setMarket] = useState<SignalMarket>('nifty500');
    const [symbol, setSymbol] = useState(DEFAULT_SYMBOLS.nifty500);
    const [signal, setSignal] = useState<MlSignal | null>(null);
    const [history, setHistory] = useState<NiftySignalHistory | null>(null);
    const [showAbout, setShowAbout] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const switchMarket = (m: SignalMarket) => {
        setMarket(m);
        setSymbol(DEFAULT_SYMBOLS[m]);
        setSignal(null);
        setHistory(null);
        setError(null);
    };

    const fetchSignal = async (overrideSymbol?: string) => {
        const target = (overrideSymbol ?? symbol).trim().toUpperCase();
        if (!target) return;
        setIsLoading(true);
        setError(null);
        const result = await fetchMlSignal(market, target);
        if (result.success && result.data) {
            setSignal(result.data);
            if (market === 'nifty500') {
                const hist = await fetchMlHistory(target, 2);
                setHistory(hist.success && hist.data ? hist.data : null);
            } else {
                setHistory(null);
            }
        } else {
            setSignal(null);
            setHistory(null);
            setError(result.error || 'Failed to fetch signal');
        }
        setIsLoading(false);
    };

    const style = signal ? DIRECTION_STYLES[signal.direction] : null;

    return (
        <GlassCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-primary" />
                    ML Trading Signals
                    <span className="text-xs font-normal text-gray-500">XGBoost · HistGradientBoosting</span>
                </h2>
                <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                    {(['nifty500', 'crypto'] as SignalMarket[]).map((m) => (
                        <button
                            key={m}
                            onClick={() => switchMarket(m)}
                            className={cn(
                                'px-3 py-1 rounded-md text-sm transition-all',
                                market === m ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'
                            )}
                        >
                            {m === 'nifty500' ? 'Nifty 500' : 'Crypto'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex gap-2 mb-4">
                <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && fetchSignal()}
                    placeholder={market === 'nifty500' ? 'Stock symbol (e.g. RELIANCE, TCS)' : 'Pair (e.g. BTC-USD)'}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-white placeholder-gray-400 focus:border-primary focus:outline-none text-sm"
                    disabled={isLoading}
                />
                <AnimatedButton variant="secondary" onClick={() => fetchSignal()} disabled={isLoading}>
                    <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
                    Get Signal
                </AnimatedButton>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
                {mlSymbolOptions[market].map((s) => (
                    <button
                        key={s}
                        onClick={() => { setSymbol(s); fetchSignal(s); }}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-gray-300 hover:text-white transition-all"
                    >
                        {s}
                    </button>
                ))}
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm text-yellow-200">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">ML service unavailable</p>
                        <p className="text-yellow-200/70 text-xs mt-0.5">{error}</p>
                    </div>
                </div>
            )}

            {signal && style && (
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 bg-white/5 rounded-xl">
                    <div className={cn('flex items-center gap-2 px-4 py-2 rounded-lg border', style.cls)}>
                        {style.icon}
                        <span className="font-bold tracking-wide">{style.label}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-1">
                            <span className="text-white font-medium">{signal.symbol}</span>
                            <span className="text-sm text-gray-300">${signal.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className={cn('h-full transition-all', signal.direction === 'SHORT' ? 'bg-red-400' : 'bg-green-400')}
                                style={{ width: `${Math.round(signal.probability * 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-gray-400">
                            <span>Model confidence: {Math.round(signal.probability * 100)}%</span>
                            <span className="truncate">{signal.time}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-gray-500">
                            {signal.model && <span className="px-2 py-0.5 bg-white/5 rounded-full">model: {signal.model}</span>}
                            {signal.bars !== undefined && <span className="px-2 py-0.5 bg-white/5 rounded-full">{signal.bars} bars</span>}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {Object.entries(signal.probabilities).map(([dir, prob]) => (
                            <div key={dir} className="text-center px-3 py-1.5 bg-white/5 rounded-lg">
                                <div className="text-[10px] text-gray-400">{dir}</div>
                                <div className="text-sm font-medium text-white">{Math.round(prob * 100)}%</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {history && market === 'nifty500' && (
                <div className="flex items-center gap-4 p-3 bg-white/5 rounded-xl mt-3">
                    <BarChart3 className="w-4 h-4 text-primary shrink-0" />
                    <div className="text-xs text-gray-400">
                        Signal distribution (last {history.bars} bars):
                    </div>
                    <div className="flex gap-2 ml-auto">
                        {(['BUY', 'SHORT', 'HOLD'] as const).map((d) => (
                            <div key={d} className="text-center px-3 py-1 bg-white/5 rounded-lg">
                                <div className="text-[10px] text-gray-400">{d}</div>
                                <div className={cn('text-sm font-medium', d === 'BUY' ? 'text-green-400' : d === 'SHORT' ? 'text-red-400' : 'text-gray-300')}>
                                    {history.counts[d] ?? 0}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!signal && !error && !isLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Sparkles className="w-4 h-4" />
                    Pick a symbol above for a live model prediction. Needs the ml/ service deployed (see ml/README.md).
                </div>
            )}

            <div className="mt-4 border-t border-white/10 pt-3">
                <button
                    onClick={() => setShowAbout((v) => !v)}
                    className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                    <Info className="w-3.5 h-3.5" />
                    About these models
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showAbout && 'rotate-180')} />
                </button>
                {showAbout && (
                    <div className="mt-3 space-y-3 text-xs text-gray-400">
                        {(['nifty500', 'crypto'] as SignalMarket[]).map((m) => (
                            <div key={m} className="p-3 bg-white/5 rounded-xl">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-white">{MODEL_INFO[m].name}</span>
                                    <a
                                        href={MODEL_INFO[m].repo}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-primary hover:underline"
                                    >
                                        GitHub <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <p className="text-gray-400">{MODEL_INFO[m].description}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </GlassCard>
    );
}