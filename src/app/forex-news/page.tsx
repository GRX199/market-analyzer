'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Clock3, Radio, RefreshCw, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUserStore } from '@/stores/user-store';
import { NEWS_CURRENCIES, affectedPairs, analyzeEvent, economicNumber, pairImplication, type CalendarFeed, type EconomicEvent, type NewsSchedule } from '@/lib/forex-news/model';
import type { AdvancedSignal } from '@/lib/analysis/advanced-signals';

const selectClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm';
const panel = 'rounded-2xl border bg-card p-5 shadow-sm';
const when = (value: string) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const number = (value: string) => value || '—';
const statusLabel: Record<NewsSchedule['status'], string> = { armed: 'Terjadwal', queued: 'Masuk antrean', cancelled: 'Dibatalkan', expired: 'Waktu habis', blocked: 'Tidak dikirim' };
type Envelope = { ownerId: string; id: string; eventId: string; eventTime: string; forecast: string; symbol: string; accountKind: string; orderType: string; volume: number; entryPrice: number; stopLoss: number; takeProfit: number; condition: string; offsetSeconds: number; confirmed: true };
type SavedRequest = { event: EconomicEvent; request: Envelope };
const storageKey = (owner: string) => `forex-news-pending:${owner}`;
async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function NewsTicket({ event, feed, owner, now, saved, onPending, onSaved, onClose }: {
  event: EconomicEvent; feed: CalendarFeed | null; owner: string; now: number; saved?: SavedRequest;
  onPending: (draft: SavedRequest | undefined) => void; onSaved: (order?: NewsSchedule) => void; onClose: () => void;
}) {
  const initial = saved?.request;
  const [symbol, setSymbol] = useState(initial?.symbol ?? affectedPairs(event.currency)[0]);
  const [account, setAccount] = useState(initial?.accountKind ?? 'demo');
  const [type, setType] = useState(initial?.orderType ?? 'buy_stop');
  const [volume, setVolume] = useState(String(initial?.volume ?? 0.01));
  const [entry, setEntry] = useState(String(initial?.entryPrice ?? ''));
  const [sl, setSl] = useState(String(initial?.stopLoss ?? ''));
  const [tp, setTp] = useState(String(initial?.takeProfit ?? ''));
  const [condition, setCondition] = useState(initial?.condition ?? 'at_time');
  const [offset, setOffset] = useState(String(initial?.offsetSeconds ?? 0));
  const [confirmed, setConfirmed] = useState(!!saved);
  const [busy, setBusy] = useState(false), [loadingPlan, setLoadingPlan] = useState(false);
  const [message, setMessage] = useState(saved ? 'Permintaan sebelumnya belum dikonfirmasi. Periksa ulang dengan ID yang sama; tidak membuat order duplikat.' : '');
  const [planNote, setPlanNote] = useState('');
  const [locked, setLocked] = useState(!!saved);
  const envelope = useRef<Envelope | null>(initial ?? null), active = useRef(true);
  const draftId = useRef(initial?.id ?? ''), uncertain = useRef(!!saved);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const stillOwner = () => active.current && useUserStore.getState().authenticatedUserId === owner;
  const scheduleTime = Date.parse(event.scheduledAt) + Number(offset) * 1000;
  const macro = analyzeEvent(event, now);
  const changed = () => { setConfirmed(false); setPlanNote(''); };

  async function loadPlan() {
    if (loadingPlan || busy || locked) return;
    setLoadingPlan(true); setMessage('');
    try {
      const data = await jsonFetch(`/api/signals/advanced?market=forex&source=mt5&horizon=intraday&symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(20000) });
      if (!stillOwner()) return;
      const row = (data.data as AdvancedSignal[])?.find(item => item.symbol === symbol);
      if (!row || row.source.kind !== 'broker' || row.source.isProxy || row.source.accountKind !== account
        || !row.source.validUntil || Date.parse(row.source.validUntil) <= Date.now()
        || !row.expiresAt || Date.parse(row.expiresAt) <= Date.now()
        || row.status === 'stale' || row.status === 'unavailable') throw new Error('Belum ada level MT5 segar untuk akun ini. Periksa bridge atau isi level secara manual.');
      const side = type.startsWith('buy') ? 'buy' : 'sell';
      const candidate = row.status === 'candidate' && row.plan?.side === side ? row.plan : null;
      const plan = candidate ?? (type.endsWith('stop') ? row.manualScenarios.find(item => item.side === side) : null);
      if (!plan) throw new Error('Analisis teknikal belum menyediakan setup untuk arah/jenis ini. Tidak ada level yang dibuat-buat.');
      const quote = side === 'buy' ? row.source.ask : row.source.bid;
      const validEntry = quote && (type === 'buy_limit' ? plan.entry < quote : type === 'buy_stop' ? plan.entry > quote : type === 'sell_limit' ? plan.entry > quote : plan.entry < quote);
      if (!validEntry) throw new Error('Level Signals tidak cocok dengan jenis pending ini pada quote sekarang. Pilih jenis yang sesuai atau tentukan level sendiri.');
      setEntry(String(plan.entry)); setSl(String(plan.stopLoss)); setTp(String(plan.takeProfit)); setConfirmed(false);
      setPlanNote(`${candidate ? 'Kandidat teknikal' : 'Skenario breakout bersyarat'} · ${row.source.instrument} · ${when(row.generatedAt)} WITA. Level dibekukan, bukan prediksi harga saat news; tinjau ulang sebelum jadwal.`);
    } catch (error) { if (stillOwner()) setMessage(error instanceof Error ? error.message : 'Analisis tidak tersedia.'); }
    finally { if (stillOwner()) setLoadingPlan(false); }
  }

  async function submit() {
    if (busy || !confirmed || !stillOwner()) return;
    setBusy(true); setMessage('');
    draftId.current ||= crypto.randomUUID();
    const payload = envelope.current ?? { ownerId: owner, id: draftId.current, eventId: event.id, eventTime: event.scheduledAt, forecast: event.forecast, symbol,
      accountKind: account, orderType: type, volume: Number(volume), entryPrice: Number(entry), stopLoss: Number(sl),
      takeProfit: Number(tp), condition, offsetSeconds: Number(offset), confirmed: true as const };
    envelope.current = payload; setLocked(true);
    try {
      // Persist BEFORE sending. Network failure/navigation retries this exact ID.
      sessionStorage.setItem(storageKey(owner), JSON.stringify({ event, request: payload }));
      onPending({ event, request: payload });
    } catch {
      setBusy(false); setMessage('Penyimpanan sesi browser tidak tersedia; jadwal belum dikirim.'); return;
    }
    try {
      const response = await fetch('/api/forex-news/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!stillOwner()) return;
      if (!response.ok) {
        // 4xx is a definitive refusal. 5xx/network may have committed; keep ID.
        if (response.status >= 400 && response.status < 500 && !uncertain.current) {
          sessionStorage.removeItem(storageKey(owner)); envelope.current = null; setLocked(false); setConfirmed(false);
          onPending(undefined);
        }
        throw new Error(data.error || 'Jadwal belum terkonfirmasi.');
      }
      sessionStorage.removeItem(storageKey(owner)); onSaved(data.order);
    } catch (error) {
      if (envelope.current) uncertain.current = true;
      if (stillOwner()) setMessage(error instanceof Error ? error.message : 'Status belum pasti; ulangi pemeriksaan dengan ID yang sama.');
    }
    finally { if (stillOwner()) setBusy(false); }
  }

  async function verifySaved() {
    if (busy || !envelope.current) return;
    setBusy(true);
    try {
      const data = await jsonFetch(`/api/forex-news/orders?id=${encodeURIComponent(envelope.current.id)}`, { signal: AbortSignal.timeout(15000) });
      if (!stillOwner()) return;
      if (data.order || now >= scheduleTime + 90000) {
        sessionStorage.removeItem(storageKey(owner)); onSaved(data.order ?? undefined);
      } else setMessage('Belum ditemukan jadwal tersimpan. Hasil permintaan lama mungkin masih diproses; gunakan retry dengan ID yang sama.');
    } catch (err) { if (stillOwner()) setMessage(err instanceof Error ? err.message : 'Status belum terkonfirmasi.'); }
    finally { if (stillOwner()) setBusy(false); }
  }

  return <section className={`${panel} border-sky-500/40 space-y-4`} aria-labelledby="news-ticket-title">
    <div className="flex justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-widest text-sky-500">Order terjadwal</p><h2 id="news-ticket-title" className="mt-1 text-lg font-semibold">{event.title} · {event.currency}</h2></div><Button variant="ghost" size="icon" aria-label="Tutup formulir" disabled={busy} onClick={onClose}><X /></Button></div>
    <fieldset disabled={busy || locked || loadingPlan} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 disabled:opacity-70">
      <label className="space-y-1 text-sm">Akun MT5<select className={selectClass} value={account} onChange={e => { setAccount(e.target.value); changed(); }}><option value="demo">Demo</option><option value="real">Real — uang sungguhan</option></select></label>
      <label className="space-y-1 text-sm">Market<select className={selectClass} value={symbol} onChange={e => { setSymbol(e.target.value); setEntry(''); setSl(''); setTp(''); changed(); }}>{affectedPairs(event.currency).map(pair => <option key={pair}>{pair}</option>)}</select></label>
      <label className="space-y-1 text-sm">Jenis order<select className={selectClass} value={type} onChange={e => { setType(e.target.value); changed(); }}>{['buy_stop', 'sell_stop', 'buy_limit', 'sell_limit'].map(item => <option value={item} key={item}>{item.replace('_', ' ').toUpperCase()}</option>)}</select></label>
      <label className="space-y-1 text-sm">Volume (lot)<Input type="number" min="0.00000001" max="100" step="any" value={volume} onChange={e => { setVolume(e.target.value); changed(); }} /></label>
      <label className="space-y-1 text-sm">Entry<Input type="number" step="any" min="0" value={entry} onChange={e => { setEntry(e.target.value); changed(); }} /></label>
      <label className="space-y-1 text-sm">Stop Loss<Input type="number" step="any" min="0" value={sl} onChange={e => { setSl(e.target.value); changed(); }} /></label>
      <label className="space-y-1 text-sm">Take Profit<Input type="number" step="any" min="0" value={tp} onChange={e => { setTp(e.target.value); changed(); }} /></label>
      <label className="space-y-1 text-sm">Jeda setelah rilis (detik)<Input type="number" min="0" max="600" step="1" value={offset} onChange={e => { setOffset(e.target.value); changed(); }} /></label>
      <label className="space-y-1 text-sm sm:col-span-2">Syarat pengiriman<select className={selectClass} value={condition} onChange={e => { setCondition(e.target.value); changed(); }}><option value="at_time">Pada waktu pilihan saya (tanpa menunggu aktual)</option><option value="actual_above" disabled={!feed?.actualsSupported || !economicNumber(event.forecast)}>Aktual di atas forecast {event.forecast}</option><option value="actual_below" disabled={!feed?.actualsSupported || !economicNumber(event.forecast)}>Aktual di bawah forecast {event.forecast}</option></select></label>
      <div className="flex items-end gap-3 sm:col-span-2"><Button variant="outline" onClick={loadPlan}>{loadingPlan ? 'Membaca MT5…' : 'Ambil level Signals MT5'}</Button><Link className="pb-1 text-sm text-sky-500 underline" href="/signals">Buka Signals</Link></div>
    </fieldset>
    <div className="grid gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2">
      <p><span className="font-semibold">Aktual di atas forecast:</span> {pairImplication(event.currency, symbol, macro.polarity)}</p>
      <p><span className="font-semibold">Aktual di bawah forecast:</span> {pairImplication(event.currency, symbol, -macro.polarity)}</p>
      <p className="text-muted-foreground sm:col-span-2">Skenario ini hanya membantu memilih arah. Jenis order tidak diubah otomatis; konfirmasi price action, rilis bersamaan, dan konteks kebijakan.</p>
    </div>
    {planNote && <p className="text-xs text-muted-foreground">{planNote}</p>}
    <div className="rounded-xl bg-muted/50 p-4 text-sm space-y-2">
      <p className="font-medium">{account === 'real' ? 'REAL' : 'DEMO'} · {symbol} · {type.replace('_', ' ').toUpperCase()} · {volume} lot</p>
      <p>Entry {entry || '—'} · SL {sl || '—'} · TP {tp || '—'}</p>
      <p>Mulai kirim: {Number.isFinite(scheduleTime) ? when(new Date(scheduleTime).toISOString()) : '—'} WITA · jendela 90 detik.</p>
      <p className="text-xs text-muted-foreground">Worker manual + MT5 harus berjalan di akun yang sama. Browser boleh ditutup setelah tersimpan. Order dikirim saat waktu/syarat terpenuhi; posisi baru terbuka ketika harga menyentuh Entry. Pending yang diterima broker tetap GTC, tidak otomatis dibatalkan setelah 90 detik. News dapat memperlebar spread dan menimbulkan slippage; SL tidak menjamin harga eksekusi.</p>
    </div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={confirmed} disabled={busy || locked} onChange={e => setConfirmed(e.target.checked)} /><span>Saya menyetujui arah, level, lot, akun {account.toUpperCase()}, dan waktu ini. {condition !== 'at_time' ? 'Aktual hanya menyaring order ini, tidak membalik arah otomatis.' : 'Order ini tidak menunggu analisis angka aktual.'}</span></label>
    <Button onClick={submit} disabled={busy || loadingPlan || !confirmed || (!locked && (scheduleTime <= now || ![volume, entry, sl, tp].every(v => Number.isFinite(Number(v)) && Number(v) > 0)))}>{busy ? 'Memeriksa jadwal…' : locked ? 'Periksa / ulangi dengan ID yang sama' : 'Konfirmasi & jadwalkan order'}</Button>
    {locked && <Button className="ml-2" variant="outline" disabled={busy} onClick={verifySaved}>Periksa status tersimpan</Button>}
    {message && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{message}</p>}
  </section>;
}

function NewsWorkspace({ owner }: { owner: string }) {
  const [feed, setFeed] = useState<CalendarFeed | null>(null), [orders, setOrders] = useState<NewsSchedule[]>([]);
  const [error, setError] = useState(''), [orderError, setOrderError] = useState('');
  const [loading, setLoading] = useState(true), [now, setNow] = useState(0);
  const [currency, setCurrency] = useState('all'), [impact, setImpact] = useState('all'), [period, setPeriod] = useState('upcoming');
  const [search, setSearch] = useState(''), [selected, setSelected] = useState<EconomicEvent | null>(null);
  const [saved, setSaved] = useState<SavedRequest | undefined>(), [notice, setNotice] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const receipt = useRef({ server: 0, local: 0 }), requestRef = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (useUserStore.getState().authenticatedUserId !== owner) return;
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true);
    const valid = () => !controller.signal.aborted && useUserStore.getState().authenticatedUserId === owner;
    await Promise.all([
      jsonFetch('/api/forex-news', { signal: controller.signal }).then(data => {
        if (!valid()) return;
        receipt.current = { server: Date.parse(data.serverTime), local: performance.now() };
        setNow(receipt.current.server); setFeed(data); setError('');
      }).catch(err => { if (valid()) { setError(err.message); setFeed(null); } }),
      jsonFetch('/api/forex-news/orders', { signal: controller.signal }).then(data => {
        if (valid()) { setOrders(data.orders ?? []); setOrderError(''); }
      }).catch(err => { if (valid()) setOrderError(err.message); }),
    ]);
    if (valid()) setLoading(false);
  }, [owner]);
  useEffect(() => {
    let active = true;
    // Resume a request interrupted by navigation using its original payload.
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = sessionStorage.getItem(storageKey(owner));
        if (raw) { const draft = JSON.parse(raw) as SavedRequest; if (draft.request.ownerId === owner) { setSaved(draft); setSelected(draft.event); } }
      } catch { /* no saved request */ }
      void reload();
    });
    const timer = setInterval(() => { if (!document.hidden) void reload(); }, 30000);
    const clock = setInterval(() => { if (receipt.current.server) setNow(receipt.current.server + performance.now() - receipt.current.local); }, 1000);
    return () => { active = false; clearInterval(timer); clearInterval(clock); requestRef.current?.abort(); };
  }, [owner, reload]);
  const rows = feed?.events.filter(e => (currency === 'all' || e.currency === currency)
    && (impact === 'all' || e.importance === Number(impact))
    && (period === 'all' || (period === 'upcoming' ? Date.parse(e.scheduledAt) >= now : Date.parse(e.scheduledAt) < now))
    && `${e.title} ${e.currency}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const next = feed?.events.find(e => e.precise && Date.parse(e.scheduledAt) > now && e.importance === 3);
  const minutes = next ? Math.max(0, Math.ceil((Date.parse(next.scheduledAt) - now) / 60000)) : null;

  async function cancel(id: string) {
    if (cancelling) return;
    setCancelling(id); setNotice('');
    try {
      await jsonFetch(`/api/forex-news/orders?id=${encodeURIComponent(id)}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
      if (useUserStore.getState().authenticatedUserId === owner) { setNotice('Jadwal dibatalkan sebelum masuk antrean.'); await reload(); }
    } catch (err) { if (useUserStore.getState().authenticatedUserId === owner) setNotice(err instanceof Error ? err.message : 'Pembatalan belum terkonfirmasi.'); }
    finally { setCancelling(null); }
  }

  return <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <header className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-white md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-sky-300"><Radio className="size-4" /> Macro event desk</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Forex News & Orders</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Jadwal ekonomi, skenario dampak mata uang, dan pending order berdasarkan keputusan Anda. Data sumber nyata; bukan sinyal profit pasti.</p></div><Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" disabled={loading} onClick={() => void reload()}><RefreshCw className={loading ? 'animate-spin' : ''} /> Perbarui</Button></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">High impact berikutnya</p><p className="mt-1 text-lg font-semibold">{next ? `${next.currency} · ${minutes} menit` : 'Belum tersedia'}</p><p className="mt-1 text-xs text-slate-300">{next?.title ?? 'Sesuai kalender provider'}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">Jadwal menunggu worker</p><p className="mt-1 text-lg font-semibold">{orderError ? '—' : orders.filter(o => o.status === 'armed').length}</p><p className="mt-1 text-xs text-slate-300">Status online worker tidak diverifikasi halaman ini</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">Sumber kalender</p><p className="mt-1 text-lg font-semibold">{feed ? feed.actualsSupported ? 'Trading Economics' : 'Forex Factory' : 'Memeriksa feed'}</p><p className="mt-1 text-xs text-slate-300">{feed?.actualsSupported ? 'Syarat aktual tersedia' : 'Jadwal, forecast & previous'}</p></div>
      </div>
    </header>
    <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>Semua jam: WITA (UTC+8) · jam server {now ? when(new Date(now).toISOString()) : '—'}</span><span>{feed ? `Feed diambil ${when(feed.fetchedAt)}` : 'Data tidak tersedia bukan berarti tidak ada event'}</span></div>
    {feed && <p className="rounded-xl border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{feed.note}</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-600 dark:text-amber-400">{error}</p>}
    {saved && !selected && <div className={`${panel} space-y-2`}><p className="text-sm">Ada permintaan yang belum terkonfirmasi. Periksa sebelum membuat jadwal baru.</p><Button onClick={() => setSelected(saved.event)}>Lanjutkan pemeriksaan</Button></div>}
    {selected && <NewsTicket key={selected.id} event={selected} feed={feed} now={now} owner={owner} saved={saved} onPending={setSaved}
      onClose={() => setSelected(null)} onSaved={order => { setSelected(null); setSaved(undefined); setNotice(order ? `Jadwal tersimpan — ${statusLabel[order.status]}. Periksa riwayat dan worker manual pada akun MT5 yang dipilih.` : 'Tidak ada jadwal tersimpan dan jendela waktu sudah habis. Periksa riwayat MT5 sebelum membuat rencana baru.'); void reload(); }} />}
    <section className="space-y-3" aria-labelledby="calendar-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="calendar-title" className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="size-5 text-sky-500" /> Kalender & skenario</h2><span className="text-xs text-muted-foreground">{rows.length} event sesuai filter</span></div>
      <div className="grid gap-2 sm:grid-cols-4"><Input aria-label="Cari berita" placeholder="Cari CPI, payroll, suku bunga…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Mata uang" className={selectClass} value={currency} onChange={e => setCurrency(e.target.value)}><option value="all">Semua mata uang</option>{NEWS_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select><select aria-label="Dampak" className={selectClass} value={impact} onChange={e => setImpact(e.target.value)}><option value="all">Semua dampak</option><option value="3">High impact</option><option value="2">Medium impact</option><option value="1">Low impact</option></select><select aria-label="Waktu event" className={selectClass} value={period} onChange={e => setPeriod(e.target.value)}><option value="upcoming">Akan datang</option><option value="released">Sudah lewat</option><option value="all">Seluruh kalender</option></select></div>
      {!rows.length && <div className={`${panel} text-sm text-muted-foreground`}>{loading ? 'Mengambil kalender ekonomi…' : feed ? 'Tidak ada event sesuai filter. Coba seluruh kalender atau mata uang lain.' : 'Kalender belum tersedia. Periksa pesan koneksi di atas.'}</div>}
      <div className="grid gap-4 xl:grid-cols-2">{rows.map(event => {
        const analysis = analyzeEvent(event, now), past = Date.parse(event.scheduledAt) <= now;
        return <article key={event.id} className={`${panel} flex flex-col gap-4`}>
          <div className="flex justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-md bg-muted px-2 py-1 font-bold">{event.currency}</span><span className={event.importance === 3 ? 'text-rose-500' : 'text-muted-foreground'}>{['Dampak belum diketahui', 'Low impact', 'Medium impact', 'High impact'][event.importance]}</span></div><h3 className="mt-2 font-semibold">{event.title}</h3></div><div className="text-right text-xs text-muted-foreground"><p>{when(event.scheduledAt)}</p><p className="mt-1">{!event.precise ? 'Waktu belum pasti / seharian' : past ? 'Waktu rilis lewat' : 'Akan datang'}</p></div></div>
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-sm">{[['Previous', event.previous], ['Forecast', event.forecast], ['Actual', past ? event.actual : '']].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{number(value)}</dd></div>)}</dl>
          <div className="space-y-2 text-sm"><p className="font-medium">{analysis.bias}</p><p className="flex gap-2"><ArrowUpRight className="mt-0.5 size-4 shrink-0 text-sky-500" />{analysis.above}</p><p className="flex gap-2"><ArrowDownRight className="mt-0.5 size-4 shrink-0 text-violet-500" />{analysis.below}</p><p className="text-xs leading-5 text-muted-foreground">{analysis.note} {event.currency === 'USD' && 'USD menguat biasanya menekan XAU/USD dan EUR/USD, serta mendukung USD/JPY; hubungan ini tidak selalu berlaku.'}</p>{event.revised && <p className="text-xs text-muted-foreground">Revisi: {event.revised}</p>}</div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3"><a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-500 underline">{event.source}</a><Button variant="outline" disabled={past || !event.precise || !!selected || !!saved} onClick={() => { setSelected(event); setSaved(undefined); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Clock3 /> Analisis & jadwalkan</Button></div>
        </article>;
      })}</div>
    </section>
    <section className={`${panel} space-y-4`} aria-labelledby="schedules-title"><h2 id="schedules-title" className="text-lg font-semibold">Jadwal & hasil pengiriman</h2>
      <p className="text-xs text-muted-foreground">50 jadwal terakhir. “Diterima broker” bukan berarti posisi sudah terisi. Pembatalan di sini hanya untuk jadwal yang belum masuk antrean; pending broker dikelola di MT5.</p>
      {notice && <p role="status" className="text-sm text-sky-600 dark:text-sky-400">{notice}</p>}{orderError && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{orderError}</p>}
      {!orders.length && !orderError && <p className="text-sm text-muted-foreground">Belum ada jadwal order news.</p>}
      {orders.map(order => <div key={order.id} className="flex flex-wrap justify-between gap-3 rounded-xl border p-4"><div className="min-w-0 space-y-1 text-sm"><p className="font-semibold">{order.event.title} · {order.instrument} · {order.account_kind.toUpperCase()}</p><p>{order.order_type.replace('_', ' ').toUpperCase()} {order.volume} lot · Entry {order.entry_price} · SL {order.stop_loss} · TP {order.take_profit}</p><p className="text-xs text-muted-foreground">{when(order.scheduled_at)} WITA · {order.condition === 'at_time' ? 'Sesuai waktu' : `${order.condition === 'actual_above' ? 'Aktual >' : 'Aktual <'} forecast ${order.event.forecast}`}</p><p className="text-xs text-muted-foreground">{order.trade?.error_message || order.reason}</p>{order.trade?.broker_order_ticket && <p className="text-xs">Tiket MT5: {order.trade.broker_order_ticket}</p>}</div><div className="flex items-center gap-3"><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{order.trade?.status === 'executed' ? 'Diterima broker' : order.trade?.status === 'failed' ? 'Ditolak worker/broker' : order.trade?.status === 'processing' ? 'Diproses worker' : statusLabel[order.status]}</span>{order.status === 'armed' && <Button variant="outline" disabled={!!cancelling} onClick={() => void cancel(order.id)}>{cancelling === order.id ? 'Memeriksa…' : 'Batalkan'}</Button>}</div></div>)}
    </section>
  </main>;
}

export default function ForexNewsPage() {
  const owner = useUserStore(state => state.authenticatedUserId);
  return <DashboardLayout>{owner && <NewsWorkspace key={owner} owner={owner} />}</DashboardLayout>;
}
