// GSAP Animation Utilities for FinManage
import { gsap } from 'gsap';

// Page transition animations
export const pageTransitions = {
    fadeIn: (element: HTMLElement | string, duration = 0.5) => {
        gsap.fromTo(element, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration, ease: 'power2.out' });
    },
    fadeOut: (element: HTMLElement | string, duration = 0.3) => {
        gsap.to(element, { opacity: 0, y: -20, duration, ease: 'power2.in' });
    },
    slideInLeft: (element: HTMLElement | string, duration = 0.6) => {
        gsap.fromTo(element, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration, ease: 'power3.out' });
    },
    slideInRight: (element: HTMLElement | string, duration = 0.6) => {
        gsap.fromTo(element, { opacity: 0, x: 50 }, { opacity: 1, x: 0, duration, ease: 'power3.out' });
    },
    scaleIn: (element: HTMLElement | string, duration = 0.5) => {
        gsap.fromTo(element, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration, ease: 'back.out(1.7)' });
    },
};

// Number counter animation
export const animateNumber = (element: HTMLElement | string, endValue: number, duration = 1.5, prefix = '', suffix = '') => {
    const obj = { value: 0 };
    gsap.to(obj, {
        value: endValue,
        duration,
        ease: 'power2.out',
        onUpdate: () => {
            const el = typeof element === 'string' ? document.querySelector(element) : element;
            if (el) el.textContent = `${prefix}${obj.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
        },
    });
};

// Stagger animation for lists
export const staggerIn = (elements: HTMLElement[] | string, stagger = 0.1, duration = 0.5) => {
    gsap.fromTo(elements, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration, stagger, ease: 'power2.out' });
};

// Hover effects
export const hoverScale = (element: HTMLElement) => {
    element.addEventListener('mouseenter', () => gsap.to(element, { scale: 1.05, duration: 0.2, ease: 'power2.out' }));
    element.addEventListener('mouseleave', () => gsap.to(element, { scale: 1, duration: 0.2, ease: 'power2.in' }));
};

// Glow pulse animation
export const glowPulse = (element: HTMLElement | string, color = '#8B5CF6') => {
    gsap.to(element, {
        boxShadow: `0 0 20px ${color}40, 0 0 40px ${color}20`,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
    });
};

// Card entrance animation
export const cardEntrance = (cards: HTMLElement[] | string, delay = 0) => {
    gsap.fromTo(cards,
        { opacity: 0, y: 30, rotateX: 10 },
        { opacity: 1, y: 0, rotateX: 0, duration: 0.6, stagger: 0.1, delay, ease: 'power3.out' }
    );
};

// Loading spinner animation
export const spinnerRotate = (element: HTMLElement | string) => {
    return gsap.to(element, { rotation: 360, duration: 1, repeat: -1, ease: 'none' });
};

// Price change flash
export const priceFlash = (element: HTMLElement | string, isPositive: boolean) => {
    const color = isPositive ? '#10B981' : '#EF4444';
    gsap.fromTo(element,
        { backgroundColor: `${color}40` },
        { backgroundColor: 'transparent', duration: 0.5, ease: 'power2.out' }
    );
};

// Chart drawing animation
export const drawChart = (path: SVGPathElement, duration = 1.5) => {
    const length = path.getTotalLength();
    gsap.fromTo(path,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration, ease: 'power2.out' }
    );
};
