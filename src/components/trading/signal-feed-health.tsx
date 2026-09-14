'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { useUserStore } from '@/stores/user-store';
import { advanceSignalClock, signalDisplayTime, type SignalReceiptClock } from '@/lib/analysis/signal-presentation';

interface Health { checkedAt: string; mixedAccounts: boolean; feeds: { symbol: string; instrument?: string; accountKind?: string; fresh: boolean; validUntil?: string; capturedAt?: string }[] }
export function SignalFeedHealth() {
  const userId = useUserStore(s => s.authenticatedUserId);
  const [state, setState] = useState<{ owner: string; data?: Health; error?: string; receipt: SignalReceiptClock } | null>(null);
  const [now, setNow] = useState(() => ({ wall: Date.now(), monotonic: performance.now() }));
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const startedAt = performance.now();
      const receipt = () => ({ receivedAt: Date.now(), receivedMonotonicAt: performance.now(), requestDurationMs: performance.now() - startedAt });
      try {
        const response = await fetch('/api/signals/broker', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Status bridge gagal dibaca.');
        if (!body || !Array.isArray(body.feeds) || !Number.isFinite(Date.parse(body.checkedAt))) throw new Error('Status bridge invalid.');
        if (alive) { const timing = receipt(); setState({ owner: userId, data: body, receipt: timing }); setNow({ wall: timing.receivedAt, monotonic: timing.receivedMonotonicAt }); }
      } catch (error) { if (alive) setState({ owner: userId, error: error instanceof Error ? error.message : 'Status bridge gagal dibaca.', receipt: receipt() }); }
      finally { pending = false; }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 30_000);
    const tick = () => setNow(previous => advanceSignalClock(previous, Date.now(), performance.now()));
    const clock = setInterval(tick, 1_000);
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', tick);
    return () => { alive = false; controller.abort(); clearInterval(poll); clearInterval(clock); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [userId]);
  const current = state?.owner === userId ? state : null;
  const data = current?.data;
  const clock = data ? signalDisplayTime(data.checkedAt, current!.receipt, now.wall, now.monotonic) : now.wall;
  const fresh = data?.feeds.filter(f => f.fresh && f.validUntil && Date.parse(f.validUntil) > clock) ?? [];
  return <section aria-label="Kesehatan feed MT5" className="rounded-xl border bg-card p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" />Feed MT5 untuk Signals</h2><Link href="/signals" className="text-primary underline">Buka Signals</Link></div>
    <p className="mt-2" role="status">{!userId ? 'Login untuk melihat status data.' : current?.error ? current.error : !data ? 'Memeriksa snapshot…' : `${fresh.length} dari ${data.feeds.length} feed memiliki quote segar.`}</p>
    {data?.mixedAccounts && <p className="mt-2 text-amber-600 dark:text-amber-400">Snapshot segar berasal dari beberapa akun. Periksa server dan akun di detail instrumen sebelum memakai level.</p>}
    <div className="mt-3 flex flex-wrap gap-2">{data?.feeds.map(f => <span key={f.symbol} className="rounded-md bg-muted px-2 py-1 text-xs">{f.instrument ?? f.symbol} · {f.accountKind ?? 'unknown'} · {fresh.includes(f) ? 'segar' : 'basi/invalid'}</span>)}</div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Bridge hanya mengirim candle dan quote, bukan robot pembuka order. Jika tidak segar, jalankan run_signal_bridge.bat pada PC dengan MT5; lihat log OK/WARNING. Proses robot tetap perlu diverifikasi terpisah.</p>
  </section>;
}
