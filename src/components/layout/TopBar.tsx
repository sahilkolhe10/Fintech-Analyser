'use client';

// Top Bar Component
import { Bell, User } from 'lucide-react';
import { useAuthStore } from '@/store';
import { SearchBar } from '@/components/ui/SearchBar';
import { marketService } from '@/services/market';

export function TopBar() {
    const { user, profile } = useAuthStore();

    const handleSearch = async (query: string) => {
        return marketService.searchStocks(query);
    };

    return (
        <header className="fixed top-0 right-0 left-20 lg:left-64 h-16 z-30 bg-[#0F0F1A]/80 backdrop-blur-xl border-b border-white/10">
            <div className="flex items-center justify-between h-full px-6">
                {/* Search */}
                <div className="flex-1 max-w-xl">
                    <SearchBar
                        searchFunction={handleSearch}
                        onSelect={(result) => console.log('Selected:', result)}
                        placeholder="Search stocks, ETFs..."
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4">
                    {/* Currency — INR only */}
                    <div className="flex items-center bg-white/5 rounded-lg p-1">
                        <button className="px-3 py-1 rounded text-sm font-medium bg-primary text-white" disabled>
                            ₹ INR
                        </button>
                    </div>

                    {/* Notifications */}
                    <button className="relative p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                        <Bell className="w-5 h-5 text-gray-400" />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    </button>

                    {/* User */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center overflow-hidden">
                            {user?.photoURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <User className="w-5 h-5 text-white" />
                            )}
                        </div>
                        <div className="hidden lg:block">
                            <p className="text-sm font-medium text-white">{profile?.displayName || user?.displayName || 'User'}</p>
                            <p className="text-xs text-gray-400">{user?.email}</p>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
