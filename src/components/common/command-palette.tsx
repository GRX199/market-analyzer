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

const marketIcons: Record<string, string> = {
  forex: '💱',
  stocks: '📈',
  crypto: '₿',
};

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
        <CommandInput placeholder="Search assets, pages, or type a command..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Navigation */}
          <CommandGroup heading="Pages">
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
          <CommandGroup heading="Assets">
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
