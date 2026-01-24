'use client';

// React hooks for GSAP animations
import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

// Use fade in on mount
export function useFadeIn(duration = 0.5, delay = 0) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            gsap.fromTo(ref.current,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration, delay, ease: 'power2.out' }
            );
        }
    }, [duration, delay]);

    return ref;
}

// Use scale on hover
export function useHoverScale(scale = 1.05) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const onEnter = () => gsap.to(el, { scale, duration: 0.2, ease: 'power2.out' });
        const onLeave = () => gsap.to(el, { scale: 1, duration: 0.2, ease: 'power2.in' });

        el.addEventListener('mouseenter', onEnter);
        el.addEventListener('mouseleave', onLeave);

        return () => {
            el.removeEventListener('mouseenter', onEnter);
            el.removeEventListener('mouseleave', onLeave);
        };
    }, [scale]);

    return ref;
}

// Animated counter hook
export function useAnimatedCounter(endValue: number, duration = 1.5) {
    const ref = useRef<HTMLSpanElement>(null);
    const objRef = useRef({ value: 0 });

    useEffect(() => {
        if (!ref.current) return;

        gsap.to(objRef.current, {
            value: endValue,
            duration,
            ease: 'power2.out',
            onUpdate: () => {
                if (ref.current) {
                    ref.current.textContent = objRef.current.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
                }
            },
        });
    }, [endValue, duration]);

    return ref;
}

// Stagger children animation
export function useStaggerChildren(stagger = 0.1) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            const children = ref.current.children;
            gsap.fromTo(children,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.5, stagger, ease: 'power2.out' }
            );
        }
    }, [stagger]);

    return ref;
}
