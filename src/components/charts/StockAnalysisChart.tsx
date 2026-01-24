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
    Cell
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
    const data = generateMockStockData(60);

    // Custom Candlestick Shape
    const Candlestick = (props: any) => {
        const { x, y, width, height, low, high, open, close } = props;
        const isUp = close > open;
        const color = isUp ? '#10B981' : '#EF4444';
        const ratio = Math.abs(high - low) / height;

        // Calculate Y positions relative to the chart area
        // Recharts passes y as the top of the bar (max value) ??? No, bar logic is tricky.
        // Easier way: 
        // We render a Bar for the body (Open-Close range).
        // We render a Line or ErrorBar for High-Low? No.
        // Let's us Custom Shape for the entire candle.
        // Actually, Recharts works best with just data points. Using ComposedChart with Error Bars is complex.
        // Standard approach in Recharts: 
        // Use Bar chart where [min, max] is the range.
        // But we need 4 points.

        // Simplification for Recharts:
        // Render an "ErrorBar" type logic or just lines.

        // Let's stick to a Close Price Line Chart + Volume Bar for robustness, 
        // as true Candlestick needing 4 dimensions is tricky in pure Recharts without heavy SVG manipulation.
        // We will overlay Close Price (Line) and Volume (Bar) for a "TradingView-lite" look.
        return null;
    };

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
