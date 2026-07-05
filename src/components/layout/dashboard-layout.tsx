'use client';

import { Sidebar } from './sidebar';
import { Navbar } from './navbar';
import { DisclaimerModal } from '@/components/common/disclaimer-modal';
import { useUserStore } from '@/stores/user-store';
import { useEffect, useState } from 'react';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useUserStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
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
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen md:ml-64 transition-all duration-300 w-full overflow-hidden">
        <Navbar />
        <main className="flex-1 p-4 md:p-6 w-full max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
