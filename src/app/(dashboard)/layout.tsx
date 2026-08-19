'use client';

// Dashboard Layout with sidebar and topbar
import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SideNav, TopBar } from '@/components/layout';
import { AuthProvider } from '@/components/providers';
import { ParticleBackground } from '@/components/3d';
import { useAuthStore, useUIStore } from '@/store';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
    children: ReactNode;
}

function DashboardContent({ children }: DashboardLayoutProps) {
    const router = useRouter();
    const { user, isLoading } = useAuthStore();
    const { sidebarOpen } = useUIStore();

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <p className="text-gray-400">Loading KhataHouse...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <>
            <ParticleBackground particleCount={1500} />
            <SideNav />
            <TopBar />
            <main className={cn(
                'min-h-screen pt-20 pb-8 px-6 transition-all duration-300',
                sidebarOpen ? 'ml-64' : 'ml-20'
            )}>
                {children}
            </main>
        </>
    );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <AuthProvider>
            <DashboardContent>{children}</DashboardContent>
        </AuthProvider>
    );
}
