'use client';

import { Search, Bell, Bot, LogOut, Menu, Settings } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { navItems, WorkspaceBrand, WorkspaceNavigation } from './sidebar';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores/user-store';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useScalperRobotStatus } from '@/components/scalping/scalper-robot-provider';

export function Navbar() {
  const user = useUserStore(state => state.user);
  const alerts = useUserStore(state => state.alerts);
  const logout = useUserStore(state => state.logout);
  const robotStatus = useScalperRobotStatus();
  const router = useRouter(), pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activePage = navItems.find(item => pathname === item.href || pathname.startsWith(item.href + '/'));
  const activeAlertCount = alerts.filter(alert => alert.isActive && !alert.isTriggered).length;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Pengguna';
  const initials = displayName.split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase().slice(0, 2) || 'U';
  useEffect(() => {
    const media = matchMedia('(min-width: 1024px)');
    const closeDesktopMenu = (event: MediaQueryListEvent) => { if (event.matches) setMobileMenuOpen(false); };
    media.addEventListener('change', closeDesktopMenu);
    return () => media.removeEventListener('change', closeDesktopMenu);
  }, []);
  const handleLogout = useCallback(async () => {
    await logout(); router.push('/login'); router.refresh();
  }, [logout, router]);

  return <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-2 border-b bg-card px-4 sm:gap-3 sm:px-6 lg:px-8">
    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Buka menu navigasi" />}>
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(320px,calc(100vw-32px))] gap-0 p-0">
        <SheetHeader className="shrink-0 border-b px-5 pt-5 pb-4 pr-14">
          <WorkspaceBrand />
          <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
          <SheetDescription className="sr-only">Pilih halaman di ruang kerja Market Analyzer.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          <WorkspaceNavigation label="Semua fitur" onNavigate={() => setMobileMenuOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
    <div className="min-w-0 flex-1 sm:max-w-44">
      <p className="hidden text-xs text-muted-foreground sm:block">Ruang kerja</p>
      <p className="truncate text-sm font-semibold">{activePage?.label || 'Market Analyzer'}</p>
    </div>
    <button type="button" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
      className="flex size-11 shrink-0 items-center justify-center gap-3 rounded-lg text-muted-foreground hover:bg-muted sm:w-auto sm:min-w-0 sm:flex-1 sm:justify-start sm:border sm:bg-background sm:px-3 lg:max-w-md"
      aria-label="Buka pencarian cepat">
      <Search className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="hidden truncate text-sm sm:inline">Cari aset atau fitur</span>
      <kbd className="ml-auto hidden shrink-0 rounded border px-1.5 py-0.5 text-xs lg:block">Ctrl K</kbd>
    </button>
    <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
      {robotStatus.isAutoTradingEnabled && <Link href="/scalping" className={cn(buttonVariants({ variant: 'outline' }), 'hidden xl:inline-flex')}
        title={robotStatus.symbol + ' · status antrean website, bukan status MT5'}>
        <Bot className="size-4" /><span>{robotStatus.isRobotPaused ? 'M1 dijeda' : 'Antrean M1 aktif'}</span>
      </Link>}
      <ThemeToggle />
      <Link href="/alerts" className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative hidden sm:inline-flex')}
        aria-label={'Peringatan aktif: ' + activeAlertCount}>
        <Bell className="size-[18px]" />
        {activeAlertCount > 0 && <span className="absolute top-1 right-0 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">{activeAlertCount > 9 ? '9+' : activeAlertCount}</span>}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex size-11 items-center justify-center rounded-lg" aria-label="Buka menu akun">
          <Avatar className="size-9"><AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials}</AvatarFallback></Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="p-3"><span className="block truncate font-medium text-foreground">{displayName}</span><span className="block truncate font-normal">{user?.email || 'Akun terverifikasi'}</span></DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push('/settings')}><Settings className="size-4" />Pengaturan akun</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void handleLogout()}><LogOut className="size-4" />Keluar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}
