'use client';

// Design Card Component
// Styled per UI redesign strategy/FinManage.dc.html
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
                'bg-[linear-gradient(168deg,rgba(255,255,255,0.05),rgba(255,255,255,0)_45%),var(--panel,var(--bg-card))]',
                'border border-white/[0.07]',
                'shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_3px_6px_-3px_rgba(0,0,0,0.6),0_16px_34px_-18px_rgba(0,0,0,0.75)]',
                hover && 'transition-all duration-300 hover:border-white/[0.14] hover:shadow-[0_1px_0_rgba(255,255,255,0.1)_inset,0_6px_12px_-4px_rgba(0,0,0,0.55),0_34px_64px_-22px_rgba(0,0,0,0.85)]',
                glow && 'animate-glow',
                className
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10">{children}</div>
        </div>
    );
}
