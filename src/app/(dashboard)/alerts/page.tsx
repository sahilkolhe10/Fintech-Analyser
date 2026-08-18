'use client';

// Alerts Management Page
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useFadeIn, useStaggerChildren } from '@/lib/animations';
import { formatCurrency } from '@/lib/utils';
import {
    Bell, Plus, TrendingUp, TrendingDown, Trash2,
    CheckCircle, AlertTriangle, Clock, Settings
} from 'lucide-react';

const sampleAlerts = [
    { id: '1', symbol: 'RELIANCE.NS', type: 'price_above', value: 2600, status: 'active', triggered: false },
    { id: '2', symbol: 'TCS.NS', type: 'price_below', value: 3800, status: 'active', triggered: true, triggeredAt: '2026-01-24' },
    { id: '3', symbol: 'INFY.NS', type: 'change_percent', value: 5, status: 'active', triggered: false },
    { id: '4', symbol: 'AAPL', type: 'price_above', value: 190, status: 'paused', triggered: false },
    { id: '5', symbol: 'Portfolio', type: 'budget', value: 80, status: 'active', triggered: true, triggeredAt: '2026-01-23' },
];

export default function AlertsPage() {
    const fadeRef = useFadeIn();
    const staggerRef = useStaggerChildren(0.1);
    const activeAlerts = sampleAlerts.filter(a => a.status === 'active').length;
    const triggeredAlerts = sampleAlerts.filter(a => a.triggered).length;

    const getAlertDescription = (alert: typeof sampleAlerts[0]) => {
        switch (alert.type) {
            case 'price_above':
                return `Price goes above ${formatCurrency(alert.value, alert.symbol.includes('.NS') ? 'INR' : 'USD')}`;
            case 'price_below':
                return `Price goes below ${formatCurrency(alert.value, alert.symbol.includes('.NS') ? 'INR' : 'USD')}`;
            case 'change_percent':
                return `Price changes by ${alert.value}%`;
            case 'budget':
                return `Budget usage exceeds ${alert.value}%`;
            default:
                return 'Custom alert';
        }
    };

    return (
        <div ref={fadeRef} className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Alerts</h1>
                    <p className="text-gray-400 mt-1">Manage price and portfolio alerts</p>
                </div>
                <AnimatedButton onClick={() => document.getElementById('quick-create')?.scrollIntoView({ behavior: 'smooth' })}>
                    <Plus className="w-4 h-4" />
                    Create Alert
                </AnimatedButton>
            </div>

            {/* Summary Cards */}
            <div ref={staggerRef} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Active Alerts</span>
                        <Bell className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-2xl font-bold text-white">{activeAlerts}</div>
                    <div className="text-gray-400 text-sm mt-1">Monitoring 24/7</div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Triggered Today</span>
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="text-2xl font-bold text-yellow-400">{triggeredAlerts}</div>
                    <div className="text-gray-400 text-sm mt-1">Requires attention</div>
                </GlassCard>

                <GlassCard className="p-5">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-sm">Total Alerts</span>
                        <Clock className="w-5 h-5 text-accent" />
                    </div>
                    <div className="text-2xl font-bold text-white">{sampleAlerts.length}</div>
                    <div className="text-gray-400 text-sm mt-1">All time</div>
                </GlassCard>
            </div>

            {/* Alert Types Quick Create */}
            <GlassCard className="p-6" >
                <h2 className="text-lg font-semibold text-white mb-4" id="quick-create">Quick Create</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { icon: TrendingUp, label: 'Price Above', color: '#10B981' },
                        { icon: TrendingDown, label: 'Price Below', color: '#EF4444' },
                        { icon: AlertTriangle, label: 'Price Change %', color: '#F59E0B' },
                        { icon: Bell, label: 'Budget Alert', color: '#8B5CF6' },
                    ].map((type) => (
                        <button
                            key={type.label}
                            className="p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all text-center group"
                        >
                            <div
                                className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110"
                                style={{ backgroundColor: `${type.color}20` }}
                            >
                                <type.icon className="w-6 h-6" style={{ color: type.color }} />
                            </div>
                            <div className="text-white text-sm font-medium">{type.label}</div>
                        </button>
                    ))}
                </div>
            </GlassCard>

            {/* Alerts List */}
            <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">All Alerts</h2>
                    <div className="flex gap-2">
                        <button className="px-3 py-1 text-sm bg-primary/20 text-primary rounded-lg">All</button>
                        <button className="px-3 py-1 text-sm bg-white/5 text-gray-400 rounded-lg hover:bg-white/10">Active</button>
                        <button className="px-3 py-1 text-sm bg-white/5 text-gray-400 rounded-lg hover:bg-white/10">Triggered</button>
                    </div>
                </div>

                <div className="space-y-3">
                    {sampleAlerts.map((alert) => (
                        <div
                            key={alert.id}
                            className={`flex items-center justify-between p-4 rounded-xl transition-colors ${alert.triggered ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/5 hover:bg-white/10'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert.triggered ? 'bg-yellow-500/20' : 'bg-primary/20'
                                    }`}>
                                    {alert.triggered ? (
                                        <CheckCircle className="w-5 h-5 text-yellow-400" />
                                    ) : (
                                        <Bell className="w-5 h-5 text-primary" />
                                    )}
                                </div>
                                <div>
                                    <div className="font-medium text-white">{alert.symbol.replace('.NS', '')}</div>
                                    <div className="text-sm text-gray-400">{getAlertDescription(alert)}</div>
                                    {alert.triggered && alert.triggeredAt && (
                                        <div className="text-xs text-yellow-400 mt-1">Triggered on {alert.triggeredAt}</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${alert.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                                    }`}>
                                    {alert.status}
                                </span>
                                <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                    <Settings className="w-4 h-4 text-gray-400" />
                                </button>
                                <button className="p-2 hover:bg-red-500/20 rounded-lg transition-colors">
                                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
}
