'use client';

// AI-powered Stock Search with suggestions
import { useState, useRef, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gsap } from 'gsap';

interface SearchResult {
    symbol: string;
    name: string;
    exchange: string;
    type: string;
}

interface SearchBarProps {
    onSearch?: (query: string) => void;
    onSelect?: (result: SearchResult) => void;
    searchFunction?: (query: string) => Promise<SearchResult[]>;
    placeholder?: string;
    className?: string;
}

export function SearchBar({
    onSearch,
    onSelect,
    searchFunction,
    placeholder = 'Search stocks, ETFs, mutual funds...',
    className,
}: SearchBarProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            if (searchFunction) {
                setIsLoading(true);
                try {
                    const res = await searchFunction(query);
                    setResults(res);
                    // Animate results in
                    if (dropdownRef.current) {
                        gsap.fromTo(dropdownRef.current.children,
                            { opacity: 0, y: -10 },
                            { opacity: 1, y: 0, duration: 0.2, stagger: 0.05 }
                        );
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsLoading(false);
                }
            }
            onSearch?.(query);
        }, 300);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, searchFunction, onSearch]);

    const handleSelect = (result: SearchResult) => {
        setQuery(result.symbol);
        setResults([]);
        setIsFocused(false);
        onSelect?.(result);
    };

    const clearSearch = () => {
        setQuery('');
        setResults([]);
        inputRef.current?.focus();
    };

    return (
        <div className={cn('relative w-full', className)}>
            <div className={cn(
                'relative flex items-center bg-white/5 rounded-xl border transition-all duration-300',
                isFocused ? 'border-primary shadow-lg shadow-primary/20' : 'border-white/10'
            )}>
                <Search className="absolute left-4 w-5 h-5 text-gray-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                    placeholder={placeholder}
                    className="w-full bg-transparent py-3 pl-12 pr-10 text-white placeholder-gray-400 outline-none"
                />
                {isLoading ? (
                    <Loader2 className="absolute right-4 w-5 h-5 text-gray-400 animate-spin" />
                ) : query && (
                    <button onClick={clearSearch} className="absolute right-4 text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {results.length > 0 && isFocused && (
                <div
                    ref={dropdownRef}
                    className="absolute top-full left-0 right-0 mt-2 py-2 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl z-50 max-h-80 overflow-auto"
                >
                    {results.map((result) => (
                        <button
                            key={result.symbol}
                            onClick={() => handleSelect(result)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                        >
                            <div className="text-left">
                                <div className="font-medium text-white">{result.symbol}</div>
                                <div className="text-sm text-gray-400 truncate">{result.name}</div>
                            </div>
                            <div className="text-xs text-gray-500">{result.exchange}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
