'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Globe,
  Star,
  History,
  Bell,
  Newspaper,
  Settings,
  AlertTriangle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Wallet,
  FlaskConical,
  ScanSearch,
  BookOpen,
  Columns3,
  Flame,
  Bot,
  ServerCog,
  BrainCircuit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/stores/user-store';

export const navSections = [
  {
    label: 'Pantau pasar',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/market', label: 'Jelajah Pasar', icon: Globe },
      { href: '/screener', label: 'Penyaring Aset', icon: ScanSearch },
      { href: '/watchlist', label: 'Pantauan', icon: Star },
    ],
  },
  {
    label: 'Analisis & trading',
    items: [
      { href: '/portfolio', label: 'Portofolio', icon: Wallet },
      { href: '/signals', label: 'Riwayat Sinyal', icon: History },
      { href: '/backtest', label: 'Backtest', icon: FlaskConical },
      { href: '/compare', label: 'Multi-Chart', icon: Columns3 },
      { href: '/scalping', label: 'Robot Crypto', icon: Flame },
    ],
  },
  {
    label: 'Operasional',
    items: [
      { href: '/forex-robot', label: 'Robot Forex', icon: Bot },
      { href: '/operations', label: 'Robot & Sistem', icon: ServerCog },
      { href: '/trade-intelligence', label: 'Trade Intelligence', icon: BrainCircuit },
      { href: '/journal', label: 'Jurnal Trading', icon: BookOpen },
      { href: '/alerts', label: 'Peringatan', icon: Bell },
      { href: '/news', label: 'Berita & Sentimen', icon: Newspaper },
    ],
  },
  {
    label: 'Akun',
    items: [
      { href: '/settings', label: 'Pengaturan', icon: Settings },
      { href: '/disclaimer', label: 'Risiko & Disclaimer', icon: AlertTriangle },
    ],
  },
];

export const navItems = navSections.flatMap((section) => section.items);

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUserStore();

  return (
    <aside
      className={cn(
        'hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col border-r bg-sidebar/90 shadow-xl shadow-slate-950/5 backdrop-blur-xl transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
          <TrendingUp className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
              Market Analyzer
            </span>
            <span className="text-[10px] text-muted-foreground">Private trading workspace</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle & Version */}
      <div className="border-t p-3 flex flex-col gap-2">
        {!collapsed && (
          <div className="text-center text-[10px] text-muted-foreground/70 font-mono tracking-wider">
            v0.1.0-{process.env.NEXT_PUBLIC_GIT_COMMIT || 'dev'}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-center"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}
