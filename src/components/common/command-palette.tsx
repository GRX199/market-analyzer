'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { ALL_SYMBOLS } from '@/lib/constants';
import { navItems } from '@/components/layout/sidebar';
import { BellRing, BookOpenText, BrainCircuit, Radar, ServerCog } from 'lucide-react';

const marketIcons: Record<string, string> = {
  forex: '💱',
  stocks: '📈',
  crypto: '₿',
};

const quickActions = [
  { label: 'Cari peluang pasar', detail: 'Buka screener multi-aset', href: '/screener', icon: Radar },
  { label: 'Pantau robot forex', detail: 'Buka monitor strategi Forex M15', href: '/forex-robot', icon: Radar },
  { label: 'Periksa kesiapan robot', detail: 'Cek koneksi dan status operasional', href: '/operations', icon: ServerCog },
  { label: 'Evaluasi hasil robot', detail: 'Analisis loss, biaya, dan performa aktual', href: '/trade-intelligence', icon: BrainCircuit },
  { label: 'Tulis jurnal trading', detail: 'Catat keputusan dan hasil transaksi', href: '/journal', icon: BookOpenText },
  { label: 'Kelola peringatan', detail: 'Atur alert harga dan sinyal', href: '/alerts', icon: BellRing },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        // Don't trigger if typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false);
      router.push(value);
    },
    [router]
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Cari aset, halaman, atau perintah..." />
        <CommandList>
          <CommandEmpty>Tidak ada hasil yang cocok.</CommandEmpty>

          <CommandGroup heading="Aksi cepat">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={action.href}
                  value={`action-${action.label}-${action.detail}`}
                  onSelect={() => handleSelect(action.href)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2 h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-medium">{action.label}</span>
                    <span className="text-xs text-muted-foreground">{action.detail}</span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          {/* Navigation */}
          <CommandGroup heading="Halaman">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`page-${item.label}`}
                  onSelect={() => handleSelect(item.href)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          {/* Assets */}
          <CommandGroup heading="Aset">
            {ALL_SYMBOLS.map((asset) => (
              <CommandItem
                key={asset.symbol}
                value={`asset-${asset.symbol}-${asset.name}`}
                onSelect={() =>
                  handleSelect(`/asset/${encodeURIComponent(asset.symbol)}`)
                }
                className="cursor-pointer"
              >
                <span className="mr-2 text-base">{marketIcons[asset.marketType] || '📊'}</span>
                <div className="flex flex-col">
                  <span className="font-medium">{asset.symbol}</span>
                  <span className="text-xs text-muted-foreground">{asset.name}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
