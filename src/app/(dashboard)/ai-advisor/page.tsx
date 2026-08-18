'use client';

// AI Advisor Chat Page - With Expense Analysis
import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn } from '@/lib/animations';
import { chatAgent } from '@/services/ai';
import { usePortfolioStore, useCurrencyStore, useAuthStore } from '@/store';
import { getMonthlyTotals, getBudgetSettings } from '@/services/expenses';
import { getAppUserToken } from '@/services/demo';
import { Bot, Send, User, Sparkles, RefreshCw, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

const QUICK_PROMPTS = [
    "Analyze my portfolio",
    "Analyze my spending habits",
    "How can I save more money?",
    "Suggest stocks to buy",
    "Explain P/E ratio",
];

export default function AIAdvisorPage() {
    const fadeRef = useFadeIn();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { holdings, quotes, totalValue } = usePortfolioStore();
    const { currency } = useCurrencyStore();
    const { user } = useAuthStore();

    // Expense Data State
    const [expenseData, setExpenseData] = useState<{
        currentMonthTotal: number;
        categories: Record<string, number>;
        budget: { monthlyIncome: number; monthlyBudget: number; currency: string } | null;
    } | null>(null);

    useEffect(() => {
        if (user) {
            const loadExpenses = async () => {
                const now = new Date();
                const totals = await getMonthlyTotals(user.uid, now.getFullYear(), now.getMonth() + 1);
                const budget = await getBudgetSettings(user.uid);

                setExpenseData({
                    currentMonthTotal: totals.data?.total || 0,
                    categories: totals.data?.byCategory || {},
                    budget: budget.data || null
                });
            };
            loadExpenses();
        }
    }, [user]);

    useEffect(() => {
        // Set context for chat agent including expenses
        chatAgent.setContext({
            holdings,
            quotes,
            totalValue,
            currency,
            expenses: expenseData
        });
    }, [holdings, quotes, totalValue, currency, expenseData]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (text: string) => {
        if (!text.trim()) return;

        const userMessage: Message = { role: 'user', content: text, timestamp: new Date() };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const history = messages.slice(-6).map((m) =>
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
        ).join('\n');

        const token = await getAppUserToken(user);
        const result = await chatAgent.chat(text, { uid: user?.uid, token, history });
        setIsLoading(false);

        if (result.success && result.text) {
            const assistantMessage: Message = { role: 'assistant', content: result.text, timestamp: new Date() };
            setMessages((prev) => [...prev, assistantMessage]);

            // Surface agent actions (expenses added/deleted) as toasts
            result.actions?.forEach((action) => {
                if (action.name === 'add_expense' && action.args.amount) {
                    toast.success(`Expense ${action.args.amount} added`, { id: 'expense-added' });
                } else if (action.name === 'delete_expense') {
                    toast.success('Expense deleted', { id: 'expense-deleted' });
                }
            });
        } else {
            const errorMessage: Message = { role: 'assistant', content: "Sorry, I couldn't process your request right now.", timestamp: new Date() };
            setMessages((prev) => [...prev, errorMessage]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const handleQuickPrompt = (prompt: string) => {
        sendMessage(prompt);
    };

    const clearChat = () => {
        setMessages([]);
        chatAgent.clearContext();
        chatAgent.setContext({
            holdings,
            quotes,
            totalValue,
            currency,
            expenses: expenseData
        });
    };

    return (
        <div ref={fadeRef} className="h-[calc(100vh-6rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Bot className="w-8 h-8 text-primary" />
                        AI Financial Advisor
                    </h1>
                    <p className="text-gray-400 mt-1">Your personal wealth & expense analyst</p>
                </div>
                <AnimatedButton variant="secondary" onClick={clearChat}>
                    <RefreshCw className="w-4 h-4" />
                    New Chat
                </AnimatedButton>
            </div>

            {/* Chat Container */}
            <GlassCard className="flex-1 flex flex-col overflow-hidden">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-6 animate-float">
                                <Sparkles className="w-10 h-10 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-white mb-2">How can I help you today?</h2>
                            <p className="text-gray-400 max-w-md mb-8">I can analyze your portfolio, track your spending habits, provide market insights, and help you save money.</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {QUICK_PROMPTS.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => handleQuickPrompt(prompt)}
                                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-gray-300 hover:text-white transition-all flex items-center gap-2"
                                    >
                                        {prompt.includes('spending') && <Receipt className="w-3 h-3" />}
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((message, index) => (
                            <div
                                key={index}
                                className={cn('flex gap-3', message.role === 'user' ? 'flex-row-reverse' : '')}
                            >
                                <div className={cn(
                                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                                    message.role === 'user' ? 'bg-accent' : 'bg-gradient-to-br from-primary to-primary-dark'
                                )}>
                                    {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                                </div>
                                <div className={cn(
                                    'max-w-[70%] rounded-2xl px-4 py-3',
                                    message.role === 'user' ? 'bg-accent/20 text-white' : 'bg-white/5 text-gray-300'
                                )}>
                                    <p className="whitespace-pre-wrap">{message.content}</p>
                                    <span className="text-xs text-gray-500 mt-1 block">
                                        {message.timestamp.toLocaleTimeString()}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                    {isLoading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <div className="bg-white/5 rounded-2xl px-4 py-3">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.1s]" />
                                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSubmit} className="p-4 border-t border-white/10">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about your portfolio or spending..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                            disabled={isLoading}
                        />
                        <AnimatedButton type="submit" disabled={isLoading || !input.trim()}>
                            <Send className="w-5 h-5" />
                        </AnimatedButton>
                    </div>
                </form>
            </GlassCard>
        </div>
    );
}
