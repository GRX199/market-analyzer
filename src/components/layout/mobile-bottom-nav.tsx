'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Globe, LayoutDashboard, ServerCog } from 'lucide-react';
import { cn } from '@/lib/utils';

const mobileItems = [
  { href: '/dashboard', label: 'Beranda', icon: LayoutDashboard },
  { href: '/signals', label: 'Sinyal', icon: Activity },
  { href: '/market', label: 'Pasar', icon: Globe },
  { href: '/operations', label: 'Status MT5', icon: ServerCog },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return <nav aria-label="Navigasi utama mobile" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden">
    {mobileItems.map(item => {
      const active = pathname === item.href || pathname.startsWith(item.href + '/');
      return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
        className={cn('flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium transition-colors',
          active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
        <item.icon className="size-5" aria-hidden="true" /><span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}
