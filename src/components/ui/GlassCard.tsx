'use client';

// Glassmorphism Card Component
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    hover?: boolean;
    glow?: boolean;
    onClick?: () => void;
}

export function GlassCard({ children, className, hover = true, glow = false, onClick }: GlassCardProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                'relative overflow-hidden rounded-2xl backdrop-blur-xl',
                'bg-gradient-to-br from-white/10 to-white/5',
                'border border-white/10',
                'shadow-xl shadow-black/20',
                hover && 'transition-all duration-300 hover:scale-[1.02] hover:border-white/20 hover:shadow-2xl cursor-pointer',
                glow && 'animate-glow',
                className
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10">{children}</div>
        </div>
    );
}
