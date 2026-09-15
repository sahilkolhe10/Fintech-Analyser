'use client';

// Top Bar Component
// Styled per UI redesign strategy/FinManage.dc.html
import { Bell, User } from 'lucide-react';
import { useAuthStore } from '@/store';
import { SearchBar } from '@/components/ui/SearchBar';
import { marketService } from '@/services/market';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';

export function TopBar() {
    const { user, profile } = useAuthStore();
    const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
    const searchWrapRef = useRef<HTMLDivElement>(null);

    // Press "/" anywhere to jump to search — small UX enhancement.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
            if (e.key === '/' && !typing) {
                e.preventDefault();
                searchWrapRef.current?.querySelector('input')?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const handleSearch = async (query: string) => {
        return marketService.searchStocks(query);
    };

    return (
        <header
            className={cn(
                'fixed top-0 right-0 h-16 z-30 flex items-center gap-4 px-6',
                'bg-[rgba(28,28,36,0.6)] backdrop-blur-xl',
                'border-b border-white/[0.07]',
                'shadow-[0_20px_44px_-32px_rgba(0,0,0,0.95)]',
                'left-20 lg:left-64'
            )}
        >
            {/* Search */}
            <div ref={searchWrapRef} className="flex-1 max-w-[440px] relative">
                <SearchBar
                    searchFunction={handleSearch}
                    onSelect={(result) => console.log('Selected:', result)}
                    placeholder="Search stocks, ETFs, insights…  ( press / )"
                />
            </div>

            <div className="flex-1" />

            {/* Actions */}
            <div className="flex items-center gap-3">
                {/* Currency toggle */}
                <div className="flex items-center gap-0.5 p-[3px] rounded-[10px] bg-[#1c1c24] border border-white/[0.07] shadow-[var(--e2)]">
                    <button
                        onClick={() => setCurrency('INR')}
                        className={cn(
                            'px-2.5 py-1 rounded-[7px] text-xs font-semibold transition-colors',
                            currency === 'INR' ? 'bg-primary text-white' : 'text-[#98a1b6] hover:text-white'
                        )}
                    >
                        ₹ INR
                    </button>
                    <button
                        onClick={() => setCurrency('USD')}
                        className={cn(
                            'px-2.5 py-1 rounded-[7px] text-xs font-semibold transition-colors',
                            currency === 'USD' ? 'bg-primary text-white' : 'text-[#98a1b6] hover:text-white'
                        )}
                    >
                        $ USD
                    </button>
                </div>

                {/* Notifications */}
                <button className="relative w-[38px] h-[38px] rounded-[10px] bg-[#1c1c24] border border-white/[0.07] hover:bg-white/[0.06] transition-colors flex items-center justify-center">
                    <Bell className="w-[18px] h-[18px] text-[#98a1b6]" />
                    <span className="absolute top-[9px] right-[9px] w-[7px] h-[7px] rounded-full bg-[#D8B876] shadow-[0_0_0_2px_#17171d]" />
                </button>

                {/* User */}
                <div className="flex items-center gap-3">
                    <div className="relative w-9 h-9 rounded-full bg-primary flex items-center justify-center overflow-hidden ring-1 ring-[#D8B876]/40">
                        {user?.photoURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <User className="w-5 h-5 text-white" />
                        )}
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#1c1c24]" title="Online" />
                    </div>
                    <div className="hidden lg:block leading-tight">
                        <p className="text-[13px] font-semibold text-white">{profile?.displayName || user?.displayName || 'User'}</p>
                        <p className="text-[11px] text-[#98a1b6]">{user?.email}</p>
                    </div>
                </div>
            </div>
        </header>
    );
}
