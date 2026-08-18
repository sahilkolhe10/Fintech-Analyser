'use client';

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { useCurrencyStore } from '@/store';
import { formatCurrency } from '@/lib/utils';

interface InteractivePortfolioChartProps {
    startValue: number;
    years: number;
    growthRate: number;
}

export function InteractivePortfolioChart({ startValue, years, growthRate }: InteractivePortfolioChartProps) {
    const { currency } = useCurrencyStore();

    const data = Array.from({ length: years + 1 }).map((_, i) => {
        const baseGrowth = growthRate / 100;
        const bullGrowth = baseGrowth + 0.05;
        const bearGrowth = Math.max(0, baseGrowth - 0.05);

        return {
            year: i === 0 ? 'Now' : `Year ${i}`,
            Expected: Math.round(startValue * Math.pow(1 + baseGrowth, i)),
            Bull: Math.round(startValue * Math.pow(1 + bullGrowth, i)),
            Bear: Math.round(startValue * Math.pow(1 + bearGrowth, i)),
        };
    });

    return (
        <div className="w-full h-[300px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorBull" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                    <XAxis
                        dataKey="year"
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF' }}
                        tickLine={false}
                    />
                    <YAxis
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF' }}
                        tickFormatter={(value) => formatCurrency(Number(value), currency)}
                        width={80}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                        itemStyle={{ color: '#F3F4F6' }}
                        formatter={(value) => formatCurrency(Number(value), currency)}
                    />
                    <Area
                        type="monotone"
                        dataKey="Bull"
                        stroke="#10B981"
                        fillOpacity={1}
                        fill="url(#colorBull)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                    />
                    <Area
                        type="monotone"
                        dataKey="Expected"
                        stroke="#3B82F6"
                        fillOpacity={1}
                        fill="url(#colorExpected)"
                        strokeWidth={3}
                    />
                    <Area
                        type="monotone"
                        dataKey="Bear"
                        stroke="#EF4444"
                        fillOpacity={0}
                        fill="transparent"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
