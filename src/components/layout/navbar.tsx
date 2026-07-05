'use client';

import { Search, Bell, User, Menu, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { useMarketStore } from '@/stores/market-store';
import { Badge } from '@/components/ui/badge';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ALL_SYMBOLS } from '@/lib/constants';
import { navItems } from './sidebar';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { searchQuery, setSearchQuery } = useMarketStore();
  const router = useRouter();
  const pathname = usePathname();
  const [showResults, setShowResults] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card/80 backdrop-blur-xl px-4 md:px-6">
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden shrink-0">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="p-4 border-b text-left">
            <SheetTitle className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  Market Analyzer
                </span>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-80px)]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (pathname !== '/' && pathname.startsWith(item.href) && item.href !== '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive 
                      ? 'bg-primary/10 text-primary shadow-sm' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

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
