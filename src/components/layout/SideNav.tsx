'use client';

// Sidebar Navigation Component
// Styled per UI redesign strategy/FinManage.dc.html
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard, Wallet, LineChart, Receipt,
    Bot, Bell, Search, Settings, ChevronLeft,
    ChevronRight, LogOut, Landmark, FileText
} from 'lucide-react';
import { useUIStore, useAuthStore } from '@/store';
import { logOut } from '@/lib/firebase/auth';

const navSections = [
    {
        label: 'Overview',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
            { icon: Wallet, label: 'Portfolio', href: '/portfolio' },
            { icon: LineChart, label: 'Investment', href: '/investment' },
            { icon: Receipt, label: 'Expenses', href: '/expenses' },
        ],
    },
    {
        label: 'Intelligence',
        items: [
            { icon: Bot, label: 'AI Advisor', href: '/ai-advisor' },
            { icon: Landmark, label: 'AI Council', href: '/council' },
            { icon: Search, label: 'Research', href: '/research' },
        ],
    },
    {
        label: 'Manage',
        items: [
            { icon: FileText, label: 'Documents', href: '/documents' },
            { icon: Landmark, label: 'Loans & EMI', href: '/loans' },
            { icon: Bell, label: 'Alerts', href: '/alerts' },
            { icon: Settings, label: 'Settings', href: '/settings' },
        ],
    },
];

export function SideNav() {
    const pathname = usePathname();
    const { sidebarOpen, toggleSidebar } = useUIStore();
    const { user, profile, reset } = useAuthStore();

    const handleLogout = async () => {
        await logOut();
        reset();
    };

    return (
        <aside
            className={cn(
                'fixed left-0 top-0 h-screen z-40 transition-all duration-300',
                'bg-[rgba(26,26,33,0.6)] backdrop-blur-xl',
                'border-r border-white/[0.07]',
                'shadow-[28px_0_64px_-34px_rgba(0,0,0,0.95)]',
                sidebarOpen ? 'w-64' : 'w-20'
            )}
        >
            <div className="flex flex-col h-full p-4">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-6 px-2">
                    <div className="w-9 h-9 rounded-[11px] bg-primary flex items-center justify-center shadow-[0_6px_18px_-4px_rgba(180,137,74,0.6)]">
                        <span className="text-white font-extrabold text-base">K</span>
                    </div>
                    {sidebarOpen && (
                        <div className="leading-tight">
                            <span className="block text-[15.5px] font-bold tracking-tight text-white">
                                KhataHouse
                            </span>
                            <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-[#5d6580]">
                                Wealth OS
                                <span className="px-1.5 py-px rounded-md bg-[#D8B876]/15 border border-[#D8B876]/30 text-[#D8B876] text-[9px] font-bold tracking-wider">
                                    v2.1
                                </span>
                            </span>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto no-scrollbar space-y-5">
                    {navSections.map((section) => (
                        <div key={section.label}>
                            {sidebarOpen && (
                                <div className="px-2.5 pb-1.5 text-[10px] font-bold tracking-[0.13em] text-[#5d6580] uppercase">
                                    {section.label}
                                </div>
                            )}
                            <div className="flex flex-col gap-0.5">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/' && pathname.startsWith(item.href));
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                'relative flex items-center gap-3 px-2.5 py-2 rounded-[11px] transition-colors duration-150',
                                                'hover:bg-white/[0.06] group',
                                                isActive && 'bg-white/[0.06]'
                                            )}
                                        >
                                            {isActive && (
                                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-[3px] bg-[#D8B876]" />
                                            )}
                                            <item.icon
                                                className={cn(
                                                    'w-[18px] h-[18px] transition-colors',
                                                    isActive ? 'text-[#D8B876]' : 'text-[#5d6580] group-hover:text-white'
                                                )}
                                            />
                                            {sidebarOpen && (
                                                <span
                                                    className={cn(
                                                        'text-[13.5px] whitespace-nowrap transition-colors',
                                                        isActive ? 'font-semibold text-[#f4f5fb]' : 'font-medium text-[#98a1b6] group-hover:text-white'
                                                    )}
                                                >
                                                    {item.label}
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* User & Toggle */}
                <div className="space-y-2">
                    {user && (
                        <div className="flex items-center gap-2.5 border-t border-white/[0.07] pt-2.5">
                            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-none overflow-hidden">
                                {user.photoURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-white text-sm font-semibold">
                                        {(profile?.displayName || user.displayName || 'U').charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            {sidebarOpen && (
                                <div className="min-w-0 leading-tight flex-1">
                                    <div className="text-[13px] font-semibold text-white truncate">
                                        {profile?.displayName || user.displayName || 'User'}
                                    </div>
                                    <div className="text-[11px] text-[#5d6580] truncate">{user.email}</div>
                                </div>
                            )}
                            <button
                                onClick={handleLogout}
                                title="Logout"
                                className="flex items-center justify-center p-2 rounded-[9px] text-[#5d6580] hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={toggleSidebar}
                        className="w-full flex items-center justify-center p-2.5 rounded-[10px] bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-[#98a1b6]" /> : <ChevronRight className="w-4 h-4 text-[#98a1b6]" />}
                    </button>
                    {sidebarOpen && (
                        <p className="pt-1 text-center text-[10px] tracking-wide text-[#5d6580]">
                            Enhanced UI by <span className="text-[#D8B876] font-semibold">Sahil</span>
                        </p>
                    )}
                </div>
            </div>
        </aside>
    );
}
