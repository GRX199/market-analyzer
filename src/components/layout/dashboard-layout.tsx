'use client';

import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import { MobileBottomNav } from './mobile-bottom-nav';
import { DisclaimerModal } from '@/components/common/disclaimer-modal';
import { CommandPalette } from '@/components/common/command-palette';
import { useUserStore } from '@/stores/user-store';
import { useMarketStore } from '@/stores/market-store';
import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, LogIn, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

function WorkspaceBootSkeleton() {
  return (
    <div className="flex min-h-screen bg-background" role="status" aria-live="polite">
      <span className="sr-only">Memverifikasi sesi akun</span>
      <aside className="hidden w-60 border-r bg-card p-4 lg:block">
        <div className="flex items-center gap-3 border-b border-border/60 pb-4">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2 w-20" />
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-xl" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border/70 px-4 md:px-6">
          <Skeleton className="h-9 flex-1 rounded-xl sm:max-w-md" />
          <Skeleton className="h-9 w-9 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </header>
        <main className="grid flex-1 gap-4 p-4 md:grid-cols-2 md:p-6 lg:grid-cols-4">
          <Skeleton className="h-40 rounded-2xl md:col-span-2 lg:col-span-4" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
          <Skeleton className="h-72 rounded-2xl md:col-span-2 lg:col-span-4" />
        </main>
      </div>
    </div>
  );
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
    return <WorkspaceBootSkeleton />;
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
    <div className="workspace-shell flex min-h-dvh bg-background">
      <a href="#workspace-content" className="skip-link">Lewati ke konten</a>
      <DisclaimerModal />
      <CommandPalette />
      <Sidebar />
      <div 
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-60"
        )}
      >
        <Navbar />
        <main id="workspace-content" tabIndex={-1} className="workspace-content min-w-0 flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full min-w-0 max-w-[1440px]">{children}</div>
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
