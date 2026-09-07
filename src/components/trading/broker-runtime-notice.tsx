import Link from 'next/link';
import { ArrowUpRight, ServerCog } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function BrokerRuntimeNotice({ market }: { market: 'crypto' | 'forex' }) {
  return (
    <section aria-label="Eksekusi robot MT5" className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-3xl gap-3">
          <ServerCog className="mt-1 h-5 w-5 shrink-0 text-blue-500" />
          <div className="space-y-2">
            <h2 className="font-semibold">{market === 'crypto' ? 'Robot BTC H1 · data broker MT5' : 'Robot Forex · eksekusi lokal MT5'}</h2>
            <p className="text-base text-muted-foreground">
              {market === 'crypto'
                ? 'Profil demo broker_h1 memakai EMA50/200, RSI recovery, SL 3 ATR dan TP 3R. Tidak memakai sinyal atau input lot M1 Binance di bawah.'
                : 'Pilihan mode di halaman ini mengubah preview, bukan konfigurasi proses Python. Sinyal final dan lot dihitung ulang dari data broker.'}
            </p>
            <p className="text-sm font-medium">Status proses MT5 belum tersedia di website. Feed tersambung atau unggahan histori bukan bukti robot sedang ON.</p>
            <p className="text-sm text-muted-foreground">Jalankan satu runtime gabungan lewat <code>run_demo_strategy_menu.bat</code>. Tab website boleh ditutup; terminal MT5 dan proses Python harus tetap berjalan. Periksa log untuk WAIT, risiko, dan status koneksi.</p>
          </div>
        </div>
        <Link href="/trade-intelligence" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Evaluasi hasil aktual <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
