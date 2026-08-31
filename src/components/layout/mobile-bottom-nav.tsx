'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flame, Globe, LayoutDashboard, ServerCog } from 'lucide-react';

import { cn } from '@/lib/utils';

const mobileItems = [
  { href: '/dashboard', label: 'Beranda', icon: LayoutDashboard },
  { href: '/market', label: 'Pasar', icon: Globe },
  { href: '/scalping', label: 'Crypto', icon: Flame },
  { href: '/forex-robot', label: 'Forex', icon: ServerCog },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama mobile"
      className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-border/70 bg-card/90 p-1.5 shadow-2xl shadow-slate-950/15 backdrop-blur-xl md:hidden"
    >
      {mobileItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
