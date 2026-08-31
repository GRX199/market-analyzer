'use client';

import { Search, Bell, LogOut, Menu, Settings, TrendingUp } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { navItems } from './sidebar';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores/user-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Navbar() {
  const user = useUserStore((state) => state.user);
  const alerts = useUserStore((state) => state.alerts);
  const logout = useUserStore((state) => state.logout);
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeAlertCount = alerts.filter((alert) => alert.isActive && !alert.isTriggered).length;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Pengguna';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
    router.refresh();
  }, [logout, router]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-card/80 backdrop-blur-xl px-4 md:px-6">
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        {/* @ts-expect-error asChild is used by Shadcn but Base UI might use render */}
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden shrink-0" aria-label="Buka menu navigasi">
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

      {/* Search — opens Command Palette (Ctrl+K) */}
      <div className="flex-1 max-w-md">
        <button
          onClick={() => {
            // Dispatch Ctrl+K to open the command palette
            const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
            document.dispatchEvent(event);
          }}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border/50 bg-muted/30 text-muted-foreground text-sm hover:bg-muted/50 transition-colors"
          aria-label="Buka pencarian cepat"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs truncate">Search assets, pages...</span>
          <kbd className="ml-auto pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 text-[10px] font-medium text-muted-foreground shrink-0">
            Ctrl K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/alerts"
          className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative h-9 w-9 rounded-full' })}
          aria-label={`Peringatan aktif: ${activeAlertCount}`}
        >
          <Bell className="h-4 w-4" />
          {activeAlertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-blue-500 text-[10px] font-bold text-white flex items-center justify-center">
              {activeAlertCount > 9 ? '9+' : activeAlertCount}
            </span>
          )}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Buka menu akun"
          >
            <Avatar className="h-9 w-9 cursor-pointer hover:opacity-80 transition-opacity">
              <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="px-2 py-2">
              <span className="block truncate font-medium text-foreground">{displayName}</span>
              <span className="block truncate font-normal">{user?.email || 'Akun terverifikasi'}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')} className="px-2 py-2">
              <Settings className="mr-2 h-4 w-4" />
              Pengaturan akun
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void handleLogout()}
              className="px-2 py-2"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
