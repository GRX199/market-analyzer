'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, Globe, Star, Bell, Newspaper, CalendarClock, Settings,
  AlertTriangle, TrendingUp, ChevronLeft, ChevronRight, Wallet, FlaskConical,
  ScanSearch, BookOpen, Columns3, Flame, Bot, ServerCog, BrainCircuit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/stores/user-store';

export const navSections = [
  { label: 'Pantau pasar', items: [
    { href: '/dashboard', label: 'Beranda', icon: LayoutDashboard },
    { href: '/signals', label: 'Sinyal trading', icon: Activity },
    { href: '/market', label: 'Semua pasar', icon: Globe },
    { href: '/watchlist', label: 'Pantauan', icon: Star },
  ] },
  { label: 'Analisis & trading', items: [
    { href: '/screener', label: 'Penyaring aset', icon: ScanSearch },
    { href: '/forex-news', label: 'Berita ekonomi & order', icon: CalendarClock },
    { href: '/news', label: 'Berita pasar', icon: Newspaper },
    { href: '/compare', label: 'Bandingkan chart', icon: Columns3 },
    { href: '/backtest', label: 'Uji strategi', icon: FlaskConical },
  ] },
  { label: 'Robot & evaluasi', items: [
    { href: '/operations', label: 'Status MT5', icon: ServerCog },
    { href: '/forex-robot', label: 'Robot Forex', icon: Bot },
    { href: '/scalping', label: 'Robot Crypto', icon: Flame },
    { href: '/trade-intelligence', label: 'Evaluasi trading', icon: BrainCircuit },
    { href: '/journal', label: 'Jurnal trading', icon: BookOpen },
    { href: '/portfolio', label: 'Portofolio', icon: Wallet },
    { href: '/alerts', label: 'Peringatan', icon: Bell },
  ] },
  { label: 'Akun', items: [
    { href: '/settings', label: 'Pengaturan', icon: Settings },
    { href: '/disclaimer', label: 'Informasi risiko', icon: AlertTriangle },
  ] },
];
export const navItems = navSections.flatMap(section => section.items);

export function WorkspaceBrand({ compact = false }: { compact?: boolean }) {
  return <Link href="/dashboard" aria-label="Market Analyzer — Beranda" className="flex min-h-11 min-w-11 items-center gap-3 rounded-lg">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><TrendingUp className="size-5" aria-hidden="true" /></span>
    {!compact && <span className="min-w-0"><span className="block text-sm font-semibold tracking-tight">Market Analyzer</span><span className="block text-xs text-muted-foreground">Ruang kerja trading</span></span>}
  </Link>;
}

/** One navigation tree for sidebar, mobile drawer and command search. */
export function WorkspaceNavigation({ collapsed = false, onNavigate, label = 'Navigasi utama' }: { collapsed?: boolean; onNavigate?: () => void; label?: string }) {
  const pathname = usePathname();
  return <nav aria-label={label} className="space-y-5 p-3">
    {navSections.map(section => <div key={section.label} className="space-y-1">
      {!collapsed && <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{section.label}</p>}
      {section.items.map(item => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return <Link key={item.href} href={item.href} onClick={onNavigate} title={collapsed ? item.label : undefined}
          aria-label={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined}
          className={cn('flex min-h-11 min-w-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors', collapsed && 'justify-center px-0',
            active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <item.icon className="size-[18px] shrink-0" aria-hidden="true" />{!collapsed && <span>{item.label}</span>}
        </Link>;
      })}
    </div>)}
  </nav>;
}

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUserStore();
  return <aside aria-label="Panel navigasi desktop" className={cn('fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-sidebar lg:flex', collapsed ? 'w-[72px]' : 'w-60')}>
    <div className={cn('flex h-[72px] shrink-0 items-center border-b', collapsed ? 'justify-center px-2' : 'px-5')}><WorkspaceBrand compact={collapsed} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><WorkspaceNavigation collapsed={collapsed} /></div>
    <div className="border-t p-3"><Button variant="ghost" onClick={toggleSidebar} className="w-full justify-start" aria-label={collapsed ? 'Perluas navigasi' : 'Ringkas navigasi'} aria-expanded={!collapsed}>
      {collapsed ? <ChevronRight className="size-4" /> : <><ChevronLeft className="size-4" /><span>Ringkas menu</span></>}
    </Button></div>
  </aside>;
}
