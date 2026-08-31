'use client';

import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import { DisclaimerModal } from '@/components/common/disclaimer-modal';
import { CommandPalette } from '@/components/common/command-palette';
import { useUserStore } from '@/stores/user-store';
import { useMarketStore } from '@/stores/market-store';
import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, LoaderCircle, LogIn, RefreshCw, TrendingUp } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

function subscribeToHydration(onStoreChange: () => void) {
  const unsubscribeUser = useUserStore.persist.onFinishHydration(onStoreChange);
  const unsubscribeMarket = useMarketStore.persist.onFinishHydration(onStoreChange);

  return () => {
    unsubscribeUser();
    unsubscribeMarket();
  };
}

function getHydrationSnapshot() {
  return useUserStore.persist.hasHydrated() && useMarketStore.persist.hasHydrated();
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const theme = useUserStore((state) => state.theme);
  const sidebarCollapsed = useUserStore((state) => state.sidebarCollapsed);
  const isAccountLoading = useUserStore((state) => state.isAccountLoading);
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const authenticatedUserId = useUserStore((state) => state.authenticatedUserId);
  const accountLoadError = useUserStore((state) => state.accountLoadError);
  const loadFromSupabase = useUserStore((state) => state.loadFromSupabase);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getHydrationSnapshot,
    () => false,
  );

  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme, mounted]);

  if (!mounted || isAccountLoading) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-6"
        role="status"
        aria-live="polite"
      >
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <TrendingUp className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2 font-semibold">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Menyiapkan ruang kerja
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Memverifikasi sesi dan menyinkronkan data akun Anda.
          </p>
        </div>
      </div>
    );
  }

  if (accountLoadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-lg">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Data akun belum dapat dimuat</h1>
          <p className="mt-2 text-sm text-muted-foreground">{accountLoadError}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => void loadFromSupabase()}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Coba lagi
            </Button>
            <Link href="/login" className={buttonVariants({ variant: 'outline', className: 'w-full' })}>
              <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
              Kembali ke login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !authenticatedUserId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-lg">
          <LogIn className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">Sesi sudah berakhir</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Masuk kembali untuk membuka data dan fitur akun Anda.
          </p>
          <Link href="/login" className={buttonVariants({ className: 'mt-6' })}>
            Masuk kembali
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <DisclaimerModal />
      <CommandPalette />
      <Sidebar />
      <div 
        className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-300 w-full overflow-hidden",
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        )}
      >
        <Navbar />
        <main className="flex-1 p-4 md:p-6 w-full max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
