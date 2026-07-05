'use client';

import { Search, Bell, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { useMarketStore } from '@/stores/market-store';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ALL_SYMBOLS } from '@/lib/constants';

export function Navbar() {
  const { searchQuery, setSearchQuery } = useMarketStore();
  const router = useRouter();
  const [showResults, setShowResults] = useState(false);

  const filteredSymbols = searchQuery.length > 0
    ? ALL_SYMBOLS.filter(s =>
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const handleSelect = useCallback((symbol: string) => {
    setSearchQuery('');
    setShowResults(false);
    router.push(`/asset/${encodeURIComponent(symbol)}`);
  }, [setSearchQuery, router]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card/80 backdrop-blur-xl px-6">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search symbol... (BTC/USDT, AAPL, EUR/USD)"
          className="pl-9 bg-muted/50 border-0"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
        />
        {showResults && filteredSymbols.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden z-50">
            {filteredSymbols.map((s) => (
              <button
                key={s.symbol}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                onMouseDown={() => handleSelect(s.symbol)}
              >
                <span className="font-medium">{s.symbol}</span>
                <span className="text-muted-foreground text-xs">{s.name}</span>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {s.marketType}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link href="/alerts">
          <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-blue-500 text-[10px] font-bold text-white flex items-center justify-center">0</span>
          </Button>
        </Link>
        <Link href="/settings">
          <Avatar className="h-9 w-9 cursor-pointer hover:opacity-80 transition-opacity">
            <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm">
              U
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </header>
  );
}
