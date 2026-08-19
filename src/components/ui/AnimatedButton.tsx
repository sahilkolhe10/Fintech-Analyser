'use client';

// Animated Button Component with GSAP
import { useRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { gsap } from 'gsap';

interface AnimatedButtonProps {
    children: ReactNode;
    onClick?: () => void;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    className?: string;
    type?: 'button' | 'submit';
}

export function AnimatedButton({
    children,
    onClick,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    className,
    type = 'button',
}: AnimatedButtonProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const rippleRef = useRef<HTMLSpanElement>(null);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled || loading) return;

        // Ripple effect
        if (buttonRef.current && rippleRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            gsap.fromTo(rippleRef.current,
                { x, y, scale: 0, opacity: 0.5 },
                { scale: 4, opacity: 0, duration: 0.6, ease: 'power2.out' }
            );
        }

        onClick?.();
    };

    const variants = {
        primary: 'bg-primary text-white hover:shadow-[0_8px_22px_-8px_rgba(180,137,74,0.55)]',
        secondary: 'bg-[#22222b] text-[#f4f5fb] hover:bg-white/10 border border-white/[0.14]',
        ghost: 'text-white hover:bg-white/10',
        danger: 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:shadow-lg hover:shadow-red-500/30',
    };

    const sizes = {
        sm: 'px-3 py-1.5 text-sm rounded-lg',
        md: 'px-5 py-2.5 text-base rounded-xl',
        lg: 'px-7 py-3 text-lg rounded-2xl',
    };

    return (
        <button
            ref={buttonRef}
            type={type}
            onClick={handleClick}
            disabled={disabled || loading}
            className={cn(
                'relative overflow-hidden font-medium transition-all duration-300',
                'flex items-center justify-center gap-2',
                variants[variant],
                sizes[size],
                (disabled || loading) && 'opacity-50 cursor-not-allowed',
                className
            )}
        >
            <span ref={rippleRef} className="absolute w-4 h-4 rounded-full bg-white/30 pointer-events-none" />
            {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : children}
        </button>
    );
}
