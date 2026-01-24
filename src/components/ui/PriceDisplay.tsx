'use client';

// Real-time Price Display with animation
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PriceDisplayProps {
    price: number;
    change: number;
    changePercent: number;
    currency?: 'INR' | 'USD';
    size?: 'sm' | 'md' | 'lg';
    showIcon?: boolean;
    className?: string;
}

export function PriceDisplay({
    price,
    change,
    changePercent,
    currency = 'INR',
    size = 'md',
    showIcon = true,
    className,
}: PriceDisplayProps) {
    const priceRef = useRef<HTMLSpanElement>(null);
    const prevPrice = useRef(price);
    const isPositive = change >= 0;
    const currencySymbol = currency === 'INR' ? '₹' : '$';

    useEffect(() => {
        if (priceRef.current && price !== prevPrice.current) {
            // Flash animation on price change
            const flashColor = price > prevPrice.current ? '#10B98140' : '#EF444440';
            gsap.fromTo(priceRef.current,
                { backgroundColor: flashColor },
                { backgroundColor: 'transparent', duration: 0.5 }
            );
            prevPrice.current = price;
        }
    }, [price]);

    const sizes = {
        sm: { price: 'text-lg', change: 'text-xs', icon: 12 },
        md: { price: 'text-2xl', change: 'text-sm', icon: 16 },
        lg: { price: 'text-4xl', change: 'text-base', icon: 20 },
    };

    const Icon = isPositive ? TrendingUp : change < 0 ? TrendingDown : Minus;

    return (
        <div className={cn('flex flex-col', className)}>
            <span ref={priceRef} className={cn('font-bold text-white rounded px-1', sizes[size].price)}>
                {currencySymbol}{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className={cn('flex items-center gap-1', sizes[size].change, isPositive ? 'text-green-400' : 'text-red-400')}>
                {showIcon && <Icon size={sizes[size].icon} />}
                <span>{isPositive ? '+' : ''}{change.toFixed(2)}</span>
                <span>({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)</span>
            </div>
        </div>
    );
}
