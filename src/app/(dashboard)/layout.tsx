'use client';

// Dashboard Layout with sidebar and topbar
// Shell styled per UI redesign strategy/FinManage.dc.html
import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SideNav, TopBar } from '@/components/layout';
import { AuthProvider } from '@/components/providers';
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
            <SideNav />
            <TopBar />
            <main
                className={cn(
                    'min-h-screen pt-16 pb-8 px-6 transition-all duration-300',
                    'bg-[radial-gradient(ellipse_70%_55%_at_18%_-8%,rgba(180,137,74,0.10),transparent),radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(34,211,238,0.06),transparent),linear-gradient(180deg,#17171d,#0c0c16)]',
                    sidebarOpen ? 'ml-64' : 'ml-20'
                )}
            >
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
