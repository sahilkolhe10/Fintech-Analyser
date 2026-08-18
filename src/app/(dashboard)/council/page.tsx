'use client';

// AI Council Page — expert panel debate + portfolio review board
import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn } from '@/lib/animations';
import { useAuthStore } from '@/store';
import {
    Landmark, Scale, TrendingUp, ShieldAlert, FileText, HelpCircle,
    Loader2, Sparkles, RefreshCw, MessageSquareQuote, ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Member {
    member: {
        id: string;
        name: string;
        role: string;
        avatarColor: string;
    };
    verdict: {
        position: string;
        confidence: number;
        reasoning: string;
        recommendation: string;
    };
}

interface CouncilData {
    mode: 'debate' | 'review';
    question: string;
    members: Member[];
    synthesis: {
        consensus: string[];
        disagreements: { topic: string; detail: string }[];
        verdict: string;
        voteBreakdown: { member: string; position: string; confidence: number }[];
        actionItems: string[];
    };
}

const DEFAULT_QUESTIONS = [
    "Should I invest in gold right now?",
    "Is now a good time to buy more index funds?",
    "Should I keep an emergency fund before investing more?",
];

export default function CouncilPage() {
    const fadeRef = useFadeIn();
    const { user } = useAuthStore();
    const [mode, setMode] = useState<'debate' | 'review'>('debate');
    const [question, setQuestion] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<CouncilData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const resultRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (result) {
            setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
    }, [result]);

    const runCouncil = async (customQuestion?: string) => {
        if (!user) {
            toast.error('Sign in to convene the council');
            return;
        }
        if (mode === 'debate' && !(customQuestion ?? question).trim()) {
            toast.error('Enter a question for the debate');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/ai/council', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    mode,
                    question: (customQuestion ?? question).trim(),
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || 'Council session failed');
                toast.error(data.error || 'Council session failed');
                return;
            }

            setResult(data.data);
        } catch (e) {
            console.error('Council error:', e);
            setError('Could not reach the council. Try again.');
            toast.error('Could not reach the council');
        } finally {
            setIsLoading(false);
        }
    };

    const memberIcons: Record<string, React.ReactNode> = {
        value: <Landmark className="w-4 h-4 text-white" />,
        growth: <TrendingUp className="w-4 h-4 text-white" />,
        risk: <ShieldAlert className="w-4 h-4 text-white" />,
        tax: <Scale className="w-4 h-4 text-white" />,
        contrarian: <HelpCircle className="w-4 h-4 text-white" />,
    };

    const confidenceColor = (c: number) =>
        c >= 70 ? 'bg-emerald-500' : c >= 50 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div ref={fadeRef} className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <Landmark className="w-8 h-8 text-primary" />
                    AI Council
                </h1>
                <p className="text-gray-400 mt-1">
                    Five expert personas debate your questions or review your portfolio — moderated for a final verdict
                </p>
            </div>

            {/* Mode selector */}
            <div className="flex gap-2 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
                <button
                    onClick={() => setMode('debate')}
                    className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                        mode === 'debate' ? 'bg-gradient-to-r from-primary to-primary-dark text-white' : 'text-gray-400 hover:text-white'
                    )}
                >
                    <MessageSquareQuote className="w-4 h-4" />
                    Expert Debate
                </button>
                <button
                    onClick={() => setMode('review')}
                    className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                        mode === 'review' ? 'bg-gradient-to-r from-primary to-primary-dark text-white' : 'text-gray-400 hover:text-white'
                    )}
                >
                    <ScrollText className="w-4 h-4" />
                    Portfolio Review Board
                </button>
            </div>

            {/* Input */}
            <GlassCard className="p-6">
                {mode === 'debate' ? (
                    <>
                        <h2 className="text-lg font-semibold text-white mb-1">Ask the council</h2>
                        <p className="text-gray-400 text-sm mb-4">
                            The council gets your portfolio & spending context automatically
                        </p>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && runCouncil()}
                                placeholder="e.g. Should I invest more in mutual funds this year?"
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                            />
                            <AnimatedButton onClick={() => runCouncil()} disabled={isLoading}>
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                Convene
                            </AnimatedButton>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-4">
                            {DEFAULT_QUESTIONS.map((q) => (
                                <button
                                    key={q}
                                    onClick={() => { setQuestion(q); runCouncil(q); }}
                                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs text-gray-300 hover:text-white transition-all"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <h2 className="text-lg font-semibold text-white mb-1">Portfolio review board</h2>
                        <p className="text-gray-400 text-sm mb-4">
                            All five members will grade your portfolio health, risk, allocations and spending, then the moderator delivers the combined verdict
                        </p>
                        <AnimatedButton onClick={() => runCouncil()} disabled={isLoading}>
                            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                            Run Portfolio Review
                        </AnimatedButton>
                    </>
                )}
            </GlassCard>

            {/* Loading state */}
            {isLoading && (
                <GlassCard className="p-8">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4 animate-float">
                            <Landmark className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Council in session…</h3>
                        <p className="text-gray-400 text-sm max-w-sm">
                            {mode === 'debate' ? 'Five experts are debating your question in parallel. This takes about a minute.' : 'The review board is grading your portfolio and spending. This takes about a minute.'}
                        </p>
                    </div>
                </GlassCard>
            )}

            {error && !isLoading && (
                <GlassCard className="p-6">
                    <p className="text-sm text-red-400 text-center">{error}</p>
                </GlassCard>
            )}

            {/* Results */}
            {result && !isLoading && (
                <div ref={resultRef} className="space-y-6 scroll-mt-6">
                    {mode === 'debate' && (
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-semibold text-white mb-1">The question</h2>
                            <p className="text-gray-300">{result.question}</p>
                        </GlassCard>
                    )}

                    {/* Member cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {result.members.map(({ member, verdict }) => (
                            <GlassCard key={member.id} className="p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: member.avatarColor }}
                                    >
                                        {memberIcons[member.id]}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">{member.name}</p>
                                        <p className="text-xs text-gray-400">{member.role}</p>
                                    </div>
                                </div>

                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-sm text-gray-200">{verdict.position}</span>
                                    <span className="text-xs text-gray-400">confidence {verdict.confidence}%</span>
                                </div>
                                <div className="w-full bg-white/10 rounded-full h-1.5 mb-3">
                                    <div
                                        className={cn('h-1.5 rounded-full transition-all', confidenceColor(verdict.confidence))}
                                        style={{ width: `${verdict.confidence}%` }}
                                    />
                                </div>

                                <p className="text-sm text-gray-300 mb-2 leading-relaxed">{verdict.reasoning}</p>
                                <p className="text-sm text-primary-light border-t border-white/10 pt-2">
                                    <span className="font-medium">Recommendation:</span> {verdict.recommendation}
                                </p>
                            </GlassCard>
                        ))}
                    </div>

                    {/* Moderator synthesis */}
                    <GlassCard className="p-6 border-primary/40">
                        <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-white">Moderator&apos;s Verdict</h2>
                        </div>

                        <p className="text-gray-200 leading-relaxed mb-4">{result.synthesis.verdict}</p>

                        {result.synthesis.consensus.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm text-emerald-400 font-medium mb-1">Consensus</p>
                                <ul className="space-y-1">
                                    {result.synthesis.consensus.map((c, i) => (
                                        <li key={i} className="text-sm text-gray-300 flex gap-2">
                                            <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                            {c}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.synthesis.disagreements.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm text-yellow-400 font-medium mb-1">Disagreements</p>
                                <ul className="space-y-1">
                                    {result.synthesis.disagreements.map((d, i) => (
                                        <li key={i} className="text-sm text-gray-300 flex gap-2">
                                            <HelpCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                                            <span><strong>{d.topic}:</strong> {d.detail}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.synthesis.actionItems.length > 0 && (
                            <div>
                                <p className="text-sm text-primary font-medium mb-1">Top actions for you</p>
                                <ul className="space-y-1">
                                    {result.synthesis.actionItems.map((a, i) => (
                                        <li key={i} className="text-sm text-gray-300 flex gap-2">
                                            <span className="text-primary flex-shrink-0">{i + 1}.</span>
                                            {a}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </GlassCard>
                </div>
            )}
        </div>
    );
}