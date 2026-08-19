'use client';

// Settings Page
import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn } from '@/lib/animations';
import { useAuthStore, useThemeStore } from '@/store';
import { updateUserProfile } from '@/lib/firebase/firestore';
import { getAppUserToken } from '@/services/demo';
import {
    User, Bell, Shield, DollarSign, Save,
    Send, Copy, CheckCircle2, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
    const fadeRef = useFadeIn();
    const { user, profile, setProfile } = useAuthStore();
    const { theme } = useThemeStore();

    const [displayName, setDisplayName] = useState(profile?.displayName || '');
    const [riskTolerance, setRiskTolerance] = useState<'low' | 'medium' | 'high'>(profile?.preferences?.riskTolerance || 'medium');
    const [notifications, setNotifications] = useState(profile?.preferences?.notifications ?? true);
    const [isSaving, setIsSaving] = useState(false);

    // Telegram linking state
    const [linkCode, setLinkCode] = useState<string | null>(null);
    const [botUsername, setBotUsername] = useState<string | undefined>();
    const [botConfigured, setBotConfigured] = useState<boolean>(false);
    const [isGeneratingCode, setIsGeneratingCode] = useState(false);

    // Per-user bot state
    const [botToken, setBotToken] = useState('');
    const [savedBot, setSavedBot] = useState<{ botUsername?: string; botTokenMasked?: string; hasToken?: boolean } | null>(null);
    const [isSavingBot, setIsSavingBot] = useState(false);
    const [isDeletingBot, setIsDeletingBot] = useState(false);

    useEffect(() => {
        if (!linkCode) return;
        const t = setTimeout(() => setLinkCode(null), 10 * 60 * 1000);
        return () => clearTimeout(t);
    }, [linkCode]);

    // Load the user's saved bot on mount
    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const token = await getAppUserToken(user);
                const res = await fetch('/api/telegram/bot', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.success && data.data) {
                    setSavedBot(data.data);
                    if (data.data.botUsername) setBotUsername(data.data.botUsername);
                    setBotConfigured(true);
                }
            } catch {
                // ignore — no saved bot
            }
        })();
    }, [user]);

    const handleSave = async () => {
        if (!user) return;

        setIsSaving(true);
        const result = await updateUserProfile(user.uid, {
            displayName,
            preferences: { riskTolerance, notifications, theme }
        });
        setIsSaving(false);

        if (result.success) {
            toast.success('Settings saved successfully!');
            if (profile) {
                setProfile({ ...profile, displayName, preferences: { ...profile.preferences, riskTolerance, notifications, theme } });
            }
        } else {
            toast.error(result.error || 'Failed to save settings');
        }
    };

    const generateLinkCode = async () => {
        if (!user) return;
        setIsGeneratingCode(true);
        try {
            const token = await getAppUserToken(user);
            const res = await fetch('/api/telegram/link', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setBotConfigured(false);
                toast.error(data.error || 'Could not create a link code');
                return;
            }
            setBotConfigured(data.botConfigured);
            setBotUsername(data.botUsername);
            setLinkCode(data.code);
            toast.success('Link code generated — valid for 10 minutes');
        } catch (e) {
            console.error('Link code error:', e);
            toast.error('Could not create a link code');
        } finally {
            setIsGeneratingCode(false);
        }
    };

    const copyCode = () => {
        if (!linkCode) return;
        navigator.clipboard.writeText(linkCode).then(() => toast.success('Code copied!'));
    };

    const saveBot = async () => {
        if (!user) return;
        if (!botToken.trim()) {
            toast.error('Paste your bot token first');
            return;
        }
        setIsSavingBot(true);
        try {
            const token = await getAppUserToken(user);
            const res = await fetch('/api/telegram/bot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ botToken: botToken.trim() }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                toast.error(data.error || 'Could not save bot');
                return;
            }
            setSavedBot({ botUsername: data.botUsername, hasToken: true });
            setBotUsername(data.botUsername);
            setBotConfigured(true);
            setBotToken('');
            toast.success(`Bot @${data.botUsername} connected! Check your Telegram chat.`);
        } catch (e) {
            console.error('Save bot error:', e);
            toast.error('Could not save bot');
        } finally {
            setIsSavingBot(false);
        }
    };

    const removeBot = async () => {
        if (!user) return;
        setIsDeletingBot(true);
        try {
            const token = await getAppUserToken(user);
            const res = await fetch('/api/telegram/bot', {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                setSavedBot(null);
                setBotUsername(undefined);
                setBotConfigured(false);
                setLinkCode(null);
                toast.success('Bot disconnected');
            } else {
                toast.error(data.error || 'Could not disconnect bot');
            }
        } catch (e) {
            console.error('Remove bot error:', e);
            toast.error('Could not disconnect bot');
        } finally {
            setIsDeletingBot(false);
        }
    };

    const openTelegram = () => {
        const username = botUsername?.replace(/^@/, '');
        window.open(`https://t.me/${username || 'your_bot'}`, '_blank');
    };

    return (
        <div ref={fadeRef} className="space-y-6 max-w-3xl">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Settings</h1>
                <p className="text-gray-400 mt-1">Manage your account preferences</p>
            </div>

            {/* Profile Settings */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <User className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-white">Profile</h2>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Display Name</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-primary focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Email</label>
                        <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-gray-400 cursor-not-allowed"
                        />
                    </div>
                </div>
            </GlassCard>

            {/* Telegram Linking */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Send className="w-5 h-5 text-primary" />
                    <div>
                        <h2 className="text-lg font-semibold text-white">Telegram Bot</h2>
                        <p className="text-sm text-gray-400">Chat with your KhataHouse AI on Telegram</p>
                    </div>
                </div>

                {!botConfigured || !savedBot ? (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-400">
                            Create your own bot with <span className="text-gray-200 bg-white/10 rounded px-1.5 py-0.5">@BotFather</span> on Telegram
                            (<span className="text-gray-300">/newbot</span>), then paste its token below. Your bot will chat with
                            KhataHouse AI, add expenses to your account, and reflect on the website.
                        </p>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Bot token</label>
                            <input
                                type="password"
                                value={botToken}
                                onChange={(e) => setBotToken(e.target.value)}
                                placeholder="123456789:AAE...paste-your-token"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-primary focus:outline-none"
                            />
                        </div>
                        <AnimatedButton onClick={saveBot} loading={isSavingBot}>
                            {!isSavingBot && <CheckCircle2 className="w-4 h-4" />}
                            Connect Bot
                        </AnimatedButton>
                        {savedBot?.botTokenMasked && (
                            <p className="text-xs text-gray-500">
                                Currently connected: <code className="text-gray-300">{savedBot.botTokenMasked}</code>
                            </p>
                        )}
                    </div>
                ) : botUsername && !linkCode ? (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                                    <Send className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white">@{botUsername}</p>
                                    <p className="text-xs text-gray-500">Your bot is connected</p>
                                </div>
                            </div>
                            <button
                                onClick={removeBot}
                                disabled={isDeletingBot}
                                className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                                {isDeletingBot ? 'Disconnecting…' : 'Disconnect'}
                            </button>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">
                            Generate a one-time code, send it to your bot with <code className="text-gray-200 bg-white/10 rounded px-1.5 py-0.5">/start &lt;code&gt;</code>, and this chat
                            gets linked to your account — you can then manage expenses, ask for insights, run the council and upload documents from Telegram.
                        </p>
                        <AnimatedButton variant="secondary" onClick={generateLinkCode} disabled={isGeneratingCode}>
                            {isGeneratingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Generate Link Code
                        </AnimatedButton>
                    </div>
                ) : linkCode ? (
                    <div className="bg-white/5 border border-primary/40 rounded-xl p-4 space-y-3">
                        <p className="text-sm text-gray-300">
                            1. Open Telegram and message:
                            <button onClick={openTelegram} className="text-primary hover:underline ml-1">
                                @{botUsername?.replace(/^@/, '')}
                            </button>
                        </p>
                        <p className="text-sm text-gray-300">
                            2. Send your code to the bot:
                        </p>
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-2xl tracking-[0.4em] text-white bg-white/10 rounded-xl px-4 py-2">
                                {linkCode}
                            </span>
                            <button
                                onClick={copyCode}
                                className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all"
                                aria-label="Copy code"
                            >
                                <Copy className="w-5 h-5" />
                            </button>
                            <span className="text-xs text-gray-500">expires in 10 min</span>
                        </div>
                        <p className="text-sm text-gray-400">
                            Example: <code className="text-gray-200 bg-white/10 rounded px-1.5 py-0.5">/start {linkCode}</code>
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setLinkCode(null)}
                                className="text-xs text-gray-500 hover:text-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={removeBot}
                                disabled={isDeletingBot}
                                className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                                {isDeletingBot ? 'Disconnecting…' : 'Disconnect bot'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-sm text-gray-400 mb-4">
                            Generate a one-time code, send it to the bot with <code className="text-gray-200 bg-white/10 rounded px-1.5 py-0.5">/start &lt;code&gt;</code>, and this chat
                            gets linked to your account — you can then manage expenses, ask for insights, run the council and upload documents from Telegram.
                        </p>
                        <AnimatedButton variant="secondary" onClick={generateLinkCode} disabled={isGeneratingCode}>
                            {isGeneratingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Generate Link Code
                        </AnimatedButton>
                    </div>
                )}
            </GlassCard>

            {/* Currency Settings */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-white">Currency</h2>
                </div>
                <div className="flex gap-4">
                    <button
                        className="flex-1 py-4 rounded-xl border bg-primary/20 border-primary text-white"
                        disabled
                    >
                        <div className="text-2xl mb-1">₹</div>
                        <div className="font-medium">Indian Rupee</div>
                    </button>
                </div>
            </GlassCard>

            {/* Risk Profile */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <Shield className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-white">Risk Tolerance</h2>
                </div>
                <div className="flex gap-4">
                    {(['low', 'medium', 'high'] as const).map((level) => (
                        <button
                            key={level}
                            onClick={() => setRiskTolerance(level)}
                            className={`flex-1 py-4 rounded-xl border transition-all ${riskTolerance === level
                                    ? 'bg-primary/20 border-primary text-white'
                                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                                }`}
                        >
                            <div className="font-medium capitalize">{level}</div>
                            <div className="text-xs mt-1 text-gray-500">
                                {level === 'low' && 'Conservative'}
                                {level === 'medium' && 'Balanced'}
                                {level === 'high' && 'Aggressive'}
                            </div>
                        </button>
                    ))}
                </div>
            </GlassCard>

            {/* Notifications */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-primary" />
                        <div>
                            <h2 className="text-lg font-semibold text-white">Notifications</h2>
                            <p className="text-sm text-gray-400">Receive alerts and updates</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setNotifications(!notifications)}
                        className={`w-14 h-8 rounded-full transition-colors ${notifications ? 'bg-primary' : 'bg-white/20'}`}
                    >
                        <div className={`w-6 h-6 rounded-full bg-white transition-transform ${notifications ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                </div>
            </GlassCard>

            {/* Save Button */}
            <AnimatedButton onClick={handleSave} loading={isSaving} className="w-full">
                <Save className="w-4 h-4" />
                Save Settings
            </AnimatedButton>
        </div>
    );
}