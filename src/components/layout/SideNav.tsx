'use client';

// Sidebar Navigation Component
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard, Wallet, TrendingUp, Receipt,
    Bot, Bell, Search, Settings, ChevronLeft,
    ChevronRight, LogOut
} from 'lucide-react';
import { useUIStore, useAuthStore } from '@/store';
import { logOut } from '@/lib/firebase/auth';

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Wallet, label: 'Portfolio', href: '/portfolio' },

    { icon: Receipt, label: 'Expenses', href: '/expenses' },
    { icon: Bot, label: 'AI Advisor', href: '/ai-advisor' },
    { icon: Bell, label: 'Alerts', href: '/alerts' },
    { icon: Search, label: 'Research', href: '/research' },
    { icon: Settings, label: 'Settings', href: '/settings' },
];

export function SideNav() {
    const pathname = usePathname();
    const { sidebarOpen, toggleSidebar } = useUIStore();
    const { user, reset } = useAuthStore();

    const handleLogout = async () => {
        await logOut();
        reset();
    };

    return (
        <aside className={cn(
            'fixed left-0 top-0 h-screen z-40 transition-all duration-300',
            'bg-gradient-to-b from-[#0F0F1A]/95 to-[#1a1a2e]/95 backdrop-blur-xl',
            'border-r border-white/10',
            sidebarOpen ? 'w-64' : 'w-20'
        )}>
            <div className="flex flex-col h-full p-4">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-8 px-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <span className="text-white font-bold text-lg">F</span>
                    </div>
                    {sidebarOpen && (
                        <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            FinManage
                        </span>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href ||
                            (item.href !== '/' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                                    'hover:bg-white/10 group',
                                    isActive && 'bg-gradient-to-r from-primary/20 to-transparent border-l-2 border-primary'
                                )}
                            >
                                <item.icon className={cn(
                                    'w-5 h-5 transition-colors',
                                    isActive ? 'text-primary' : 'text-gray-400 group-hover:text-white'
                                )} />
                                {sidebarOpen && (
                                    <span className={cn(
                                        'text-sm font-medium transition-colors',
                                        isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
                                    )}>
                                        {item.label}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* User & Toggle */}
                <div className="space-y-2">
                    {user && (
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                            {sidebarOpen && <span className="text-sm">Logout</span>}
                        </button>
                    )}
                    <button
                        onClick={toggleSidebar}
                        className="w-full flex items-center justify-center p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        {sidebarOpen ? <ChevronLeft className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                    </button>
                </div>
            </div>
        </aside>
    );
}
