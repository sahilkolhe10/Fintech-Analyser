'use client';

// Settings Page
import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn } from '@/lib/animations';
import { useAuthStore, useCurrencyStore, useThemeStore } from '@/store';
import { updateUserProfile } from '@/lib/firebase/firestore';
import { User, Bell, Shield, Palette, DollarSign, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
    const fadeRef = useFadeIn();
    const { user, profile, setProfile } = useAuthStore();
    const { currency, setCurrency } = useCurrencyStore();
    const { theme, toggleTheme } = useThemeStore();

    const [displayName, setDisplayName] = useState(profile?.displayName || '');
    const [riskTolerance, setRiskTolerance] = useState<'low' | 'medium' | 'high'>(profile?.preferences?.riskTolerance || 'medium');
    const [notifications, setNotifications] = useState(profile?.preferences?.notifications ?? true);
    const [isSaving, setIsSaving] = useState(false);

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

            {/* Currency Settings */}
            <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-white">Currency</h2>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => setCurrency('INR')}
                        className={`flex-1 py-4 rounded-xl border transition-all ${currency === 'INR'
                                ? 'bg-primary/20 border-primary text-white'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                    >
                        <div className="text-2xl mb-1">₹</div>
                        <div className="font-medium">Indian Rupee</div>
                    </button>
                    <button
                        onClick={() => setCurrency('USD')}
                        className={`flex-1 py-4 rounded-xl border transition-all ${currency === 'USD'
                                ? 'bg-primary/20 border-primary text-white'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                            }`}
                    >
                        <div className="text-2xl mb-1">$</div>
                        <div className="font-medium">US Dollar</div>
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
