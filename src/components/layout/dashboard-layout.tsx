'use client';

import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import { DisclaimerModal } from '@/components/common/disclaimer-modal';
import { CommandPalette } from '@/components/common/command-palette';
import { useUserStore } from '@/stores/user-store';
import { useMarketStore } from '@/stores/market-store';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { theme, sidebarCollapsed } = useUserStore();
  const [mounted, setMounted] = useState(false);

  // Rehydrate persisted stores on client mount
  useEffect(() => {
    useUserStore.persist.rehydrate();
    useMarketStore.persist.rehydrate();
    // eslint-disable-next-line
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme, mounted]);

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
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
