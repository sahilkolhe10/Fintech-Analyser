'use client';

// Root Page - Redirects to login or dashboard
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/config';
import { useAuthStore } from '@/store';
import { ParticleBackground } from '@/components/3d/ParticleBackground';

export default function RootPage() {
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        // Demo session (persisted) → straight to dashboard, no Firebase.
        const demo = useAuthStore.getState().user;
        if (demo && 'isDemo' in demo && demo.isDemo) {
            router.push('/dashboard');
            return;
        }

        const auth = getFirebaseAuth();

        if (!auth) {
            // Firebase not configured, go to login
            router.push('/login');
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                router.push('/dashboard');
            } else {
                router.push('/login');
            }
            setChecking(false);
        });

        return () => unsubscribe();
    }, [router]);

    if (!checking) return null;

    return (
        <div className="min-h-screen flex items-center justify-center">
            <ParticleBackground particleCount={1500} />
            <div className="flex flex-col items-center gap-4 z-10">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse">
                    <span className="text-white font-bold text-2xl">K</span>
                </div>
                <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <p className="text-gray-400">Loading KhataHouse...</p>
            </div>
        </div>
    );
}
