'use client';

import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

interface StockDataPoint {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// Mock Data Generator for Candlesticks
export const generateMockStockData = (days = 30): StockDataPoint[] => {
    const data: StockDataPoint[] = [];
    let price = 150;
    for (let i = 0; i < days; i++) {
        const move = (Math.random() - 0.5) * 5;
        const open = price;
        const close = price + move;
        const high = Math.max(open, close) + Math.random() * 2;
        const low = Math.min(open, close) - Math.random() * 2;
        const volume = Math.floor(Math.random() * 1000000) + 500000;

        // Format date MM/DD
        const d = new Date();
        d.setDate(d.getDate() - (days - i));
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;

        data.push({
            date: dateStr,
            open,
            high,
            low,
            close,
            volume
        });
        price = close;
    }
    return data;
};

interface StockAnalysisChartProps {
    symbol: string;
}

export function StockAnalysisChart({ symbol }: StockAnalysisChartProps) {
    // Symbol is reserved for live data wiring; chart currently renders
    // generated mock candles for the demo.
    void symbol;
    const data = generateMockStockData(60);

    return (
        <div className="w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                    <YAxis
                        yAxisId="left"
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF' }}
                        domain={['auto', 'auto']}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#9CA3AF"
                        tick={{ fill: '#9CA3AF', fontSize: 10 }}
                        tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                        itemStyle={{ color: '#F3F4F6' }}
                    />
                    <Bar yAxisId="right" dataKey="volume" fill="url(#colorVolume)" barSize={20} />
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="close"
                        stroke="#10B981"
                        strokeWidth={2}
                        dot={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
