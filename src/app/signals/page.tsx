'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw, ScanLine, ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AdvancedSignal, SetupStatus, SignalHorizon, ReferencePlan, ManualScenario } from '@/lib/analysis/advanced-signals';
import LegacySignalScanner from './legacy-scanner';

type Market = 'all' | 'forex' | 'crypto';
type Source = 'market' | 'reference';
type Asset = { symbol: string; displaySymbol: string; name: string; marketType: 'forex' | 'crypto' };
interface ScanPayload {
  data: AdvancedSignal[]; generatedAt: string; universe: Asset[];
  scope: { market: Market; source: Source; horizon: SignalHorizon; page: number; pages: number; symbol: string | null; total: number };
}
const LABELS: Record<SetupStatus, string> = { candidate: 'Kandidat setup', wait: 'Tunggu', conflict: 'Konflik timeframe', stale: 'Data basi', unavailable: 'Data belum cukup' };
const number = (value: number | null, digits = 2) => value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { maximumFractionDigits: digits });
const price = (value: number | null) => number(value, value !== null && value < .01 ? 8 : value !== null && value < 10 ? 5 : 2);
const date = (value: string | null) => value ? new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const biasLabel = (bias: AdvancedSignal['bias']) => bias === 'bullish' ? 'Bullish' : bias === 'bearish' ? 'Bearish' : 'Netral';
const effectiveStatus = (row: AdvancedSignal, now: number): SetupStatus => row.expiresAt && Date.parse(row.expiresAt) < now && row.status !== 'unavailable' ? 'stale' : row.status;

function TradeLevels({ plan, scenario }: { plan: ReferencePlan; scenario?: ManualScenario }) {
  return <section className={cn('rounded-xl border p-4', plan.side === 'buy' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{plan.side.toUpperCase()} · {scenario ? 'Tunggu breakout' : 'Kandidat terkonfirmasi'}</h3><Badge variant="outline">{scenario ? 'Bersyarat · belum aktif' : 'Candle final'}</Badge></div>
    {scenario && <p className="mt-2 text-sm">Pemicu: close {plan.side === 'buy' ? 'di atas' : 'di bawah'} <strong className="tabular-nums">{price(scenario.triggerPrice)}</strong> · jarak entry {number(scenario.distanceAtr, 1)} ATR</p>}
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm tabular-nums">
      {[['Entry referensi', plan.entry], ['Stop Loss', plan.stopLoss], ['Take Profit 1', plan.takeProfit], ['Take Profit 2', plan.secondTarget]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-background/70 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-lg font-semibold">{price(value as number | null)}</dd></div>)}
    </dl>
    <p className="mt-3 text-sm">R:R kotor 1:{number(plan.grossRiskReward)} · jarak SL {number(Math.abs(plan.entry - plan.stopLoss))} ({number(Math.abs(plan.entry - plan.stopLoss) / plan.entry * 100)}%)</p>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.basis} Belum termasuk spread, swap dan slippage.</p>
    {scenario && <><p className="mt-3 text-sm leading-6">{scenario.confirmation}</p><p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{scenario.invalidation}</p></>}
  </section>;
}

function isPayload(value: unknown): value is ScanPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<ScanPayload>;
  return Array.isArray(data.data) && Array.isArray(data.universe) && !!data.scope && Number.isFinite(Date.parse(data.generatedAt ?? ''))
    && data.data.every(row => !!row && typeof row.symbol === 'string' && row.status in LABELS && Array.isArray(row.frames) && Array.isArray(row.reasons) && Array.isArray(row.groups));
}

function SignalDetail({ row, now }: { row: AdvancedSignal; now: number }) {
  const status = effectiveStatus(row, now), expired = status === 'stale';
  const plan = status === 'candidate' ? row.plan : null;
  const scenarios = status === 'stale' || status === 'unavailable' ? [] : row.manualScenarios ?? [];
  return <Card className="overflow-hidden border-primary/20">
    <CardHeader className="border-b bg-muted/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Analisis terpilih</p><CardTitle className="mt-1 text-2xl">{row.displaySymbol}</CardTitle></div>
        <Badge variant="outline" className={cn('text-sm', status === 'candidate' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{LABELS[status]}</Badge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{row.source.provider} · <strong>{row.source.instrument}</strong> · {row.setup}</p>
      <p className="text-sm leading-6 text-amber-700 dark:text-amber-300">{row.source.note}</p>
    </CardHeader>
    <CardContent className="space-y-6 p-4 md:p-5">
      <section aria-label="Rencana trading manual" className="space-y-3">
        <div><h3 className="text-lg font-semibold">Entry · Stop Loss · Take Profit</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{plan ? 'Kandidat lolos filter pada candle terakhir, bukan jaminan harga masih tersedia.' : 'Rencana bersyarat untuk dipantau, bukan instruksi entry sekarang. Dua arah adalah alternatif, bukan dua order sekaligus.'}</p></div>
        {plan ? <TradeLevels plan={plan} /> : scenarios.length ? scenarios.map(scenario => <TradeLevels key={scenario.side} plan={scenario} scenario={scenario} />) : <p className="rounded-xl border border-dashed p-4 text-sm leading-6 text-muted-foreground">{expired ? 'Level kedaluwarsa disembunyikan. Muat ulang sebelum menilai entry.' : status === 'unavailable' ? 'Data belum memenuhi pemeriksaan kualitas. Alasan dan timeframe yang bermasalah tercantum di bawah; harga tidak dibuat-buat.' : 'Belum ada level dekat harga yang layak dipantau (maksimal 3 ATR). Tunggu struktur baru.'}</p>}
        <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">{row.source.note} Cocokkan chart broker; level referensi ini tidak dikirim ke robot. Berlaku sampai {date(row.expiresAt)}.</p>
      </section>
      <div className="grid grid-cols-2 gap-4">
        <div><p className="text-sm text-muted-foreground">Bias harga</p><p className="text-lg font-semibold">{biasLabel(row.bias)}</p></div>
        <div><p className="text-sm text-muted-foreground">Kesepakatan aturan</p><p className="text-lg font-semibold">{expired ? '—' : number(row.conviction, 0)} / 100</p></div>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Skor bukan probabilitas menang. ADX mengukur kekuatan tren; ATR mengukur volatilitas, bukan arah.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm tabular-nums">
          <caption className="sr-only">Konfirmasi tiga timeframe dari candle selesai</caption>
          <thead className="bg-muted/50"><tr><th className="p-3">TF / kondisi</th><th className="p-3">Bias</th><th className="p-3">RSI</th><th className="p-3">ADX</th></tr></thead>
          <tbody>{row.frames.map(frame => <tr key={frame.timeframe} className="border-t">
            <td className="p-3 font-medium">{frame.timeframe}<p className="mt-1 text-xs font-normal text-muted-foreground">{frame.expiresAt && Date.parse(frame.expiresAt) < now ? 'basi' : frame.quality} · {frame.regime}</p></td>
            <td className="p-3">{biasLabel(frame.bias)}</td><td className="p-3">{number(frame.rsi, 1)}</td><td className="p-3">{number(frame.adx, 1)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="space-y-3">{row.groups.map(group => <div key={group.label}>
        <div className="flex justify-between gap-3 text-sm"><span>{group.label}</span><span className="tabular-nums">{expired ? '—' : group.points} / {group.maximum}</span></div>
        <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${expired ? 0 : group.points / group.maximum * 100}%` }} /></div>
        <p className="mt-1 text-xs text-muted-foreground">{group.detail}</p>
      </div>)}</div>
      <section><h3 className="font-semibold">Alasan keputusan</h3><ul className="mt-3 space-y-2 text-sm leading-6">{row.reasons.map(reason => <li key={reason} className="border-l-2 border-primary/30 pl-3">{reason}</li>)}</ul></section>
      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Struktur, volatilitas & kualitas data</summary>
        <div className="mt-4 space-y-4">{row.frames.map(frame => <div key={frame.timeframe} className="border-t pt-3">
          <p className="font-semibold">{frame.timeframe} · {frame.bars} candle final</p>
          <p className="mt-1 leading-6 text-muted-foreground">Close {price(frame.close)} · ATR {price(frame.atr)} ({number(frame.atrPercent)}%)<br />Support {price(frame.support)} · Resistance {price(frame.resistance)}<br />EMA50 {price(frame.ema50)} · EMA200 {price(frame.ema200)}<br />+DI {number(frame.plusDI, 1)} · −DI {number(frame.minusDI, 1)}<br />Volume relatif {number(frame.relativeVolume)} · bukan konfirmasi spot Forex<br />Candle selesai {date(frame.lastClosedAt)}<br />Valid sampai {date(frame.expiresAt)}</p>
          {frame.notes.map(note => <p key={note} className="mt-2 text-amber-600 dark:text-amber-400">{note}</p>)}
        </div>)}</div>
      </details>
      <div className="space-y-2 text-sm leading-6 text-muted-foreground">{row.cautions.slice(1).map(caution => <p key={caution}>{caution}</p>)}</div>
      <Link href={`/asset/${encodeURIComponent(row.symbol)}`} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>Buka chart & analisis aset</Link>
      <p className="text-xs text-muted-foreground">{row.modelVersion} · analisis {date(row.generatedAt)} · berakhir {date(row.expiresAt)}</p>
    </CardContent>
  </Card>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div><p className="mb-2 text-sm font-medium">{label}</p><Select value={value} items={options} onValueChange={value => { if (typeof value === 'string') onChange(value); }}><SelectTrigger className="w-full" aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}

export default function SignalScannerPage() {
  const [legacy, setLegacy] = useState(false);
  const [market, setMarket] = useState<Market>('all'), [source, setSource] = useState<Source>('market'), [horizon, setHorizon] = useState<SignalHorizon>('intraday');
  const [symbol, setSymbol] = useState<string | null>(null), [page, setPage] = useState(0), [focused, setFocused] = useState('XAU/USD');
  const [payload, setPayload] = useState<(ScanPayload & { receivedAt: number }) | null>(null);
  const [catalog, setCatalog] = useState<Asset[]>([
    { symbol: 'XAU/USD', displaySymbol: 'XAU/USD', name: 'Gold', marketType: 'forex' },
    { symbol: 'BTC/USDT', displaySymbol: 'BTC/USD', name: 'Bitcoin', marketType: 'crypto' },
  ]);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [now, setNow] = useState(Date.now);
  const requestRef = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller; setLoading(true);
    try {
      const query = new URLSearchParams({ market, source, horizon, page: String(page) }); if (symbol) query.set('symbol', symbol);
      const response = await fetch(`/api/signals/advanced?${query}`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) });
      const body: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`);
      if (!isPayload(body) || body.scope.market !== market || body.scope.source !== source || body.scope.horizon !== horizon || body.scope.page !== page || body.scope.symbol !== symbol) throw new Error('Respons tidak sesuai filter pemindaian.');
      setPayload({ ...body, receivedAt: Date.now() }); setCatalog(body.universe); setError(null);
    } catch (caught) {
      if (!controller.signal.aborted && requestRef.current === controller) { setPayload(null); setError(caught instanceof Error ? caught.message : 'Pemindaian belum berhasil.'); }
    } finally { if (!controller.signal.aborted && requestRef.current === controller) setLoading(false); }
  }, [market, source, horizon, page, symbol]);
  useEffect(() => {
    if (legacy) { requestRef.current?.abort(); return; }
    const start = setTimeout(() => void refresh(), 0), interval = setInterval(() => void refresh(), 90_000), ticker = setInterval(() => setNow(Date.now()), 10_000);
    return () => { clearTimeout(start); clearInterval(interval); clearInterval(ticker); requestRef.current?.abort(); };
  }, [refresh, legacy]);
  if (legacy) return <LegacySignalScanner onAdvanced={() => setLegacy(false)} />;
  const data = payload?.scope.market === market && payload.scope.source === source && payload.scope.horizon === horizon && payload.scope.page === page && payload.scope.symbol === symbol ? payload : null;
  const currentTime = data ? Date.parse(data.generatedAt) + Math.max(0, now - data.receivedAt) : now;
  const rows = data?.data ?? [], selected = rows.find(row => row.symbol === focused) ?? rows[0];
  const candidates = rows.filter(row => effectiveStatus(row, currentTime) === 'candidate').length;
  const watching = rows.filter(row => ['wait', 'conflict'].includes(effectiveStatus(row, currentTime)) && row.manualScenarios?.length).length;
  const filteredCatalog = catalog.filter(asset => market === 'all' || asset.marketType === market);
  const focusSymbol = (value: string) => { setMarket('all'); setPage(0); setSymbol(value); setFocused(value); };
  return <DashboardLayout><div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ScanLine className="h-6 w-6 text-primary" />Signals Advanced</h1><p className="mt-2 max-w-2xl text-base text-muted-foreground">Rencana trading manual: Entry, SL, TP1 & TP2 dengan analisis tiga timeframe. Bedakan kandidat terkonfirmasi dari skenario yang masih menunggu pemicu.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setLegacy(true)}>Scanner klasik</Button><Button onClick={() => void refresh()} disabled={loading}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />Muat ulang</Button></div>
    </header>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => focusSymbol('XAU/USD')}>Fokus XAUUSD</Button><Button variant="outline" onClick={() => focusSymbol('BTC/USDT')}>Fokus BTCUSD</Button><Button variant="ghost" onClick={() => { setMarket('all'); setSymbol(null); setPage(0); }}>Semua Forex & Crypto</Button></div>
    <section aria-label="Filter Signals" className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-4">
      <FilterSelect label="Market" value={market} options={[{ value: 'all', label: 'Forex & Crypto' }, { value: 'forex', label: 'Forex & Metals' }, { value: 'crypto', label: 'Crypto' }]} onChange={value => { if (value === 'all' || value === 'forex' || value === 'crypto') { setMarket(value); setPage(0); setSymbol(null); } }} />
      <FilterSelect label="Sumber harga" value={source} options={[{ value: 'market', label: 'Market utama' }, { value: 'reference', label: 'Reference / Yahoo' }]} onChange={value => { if (value === 'market' || value === 'reference') { setSource(value); setPage(0); setSymbol(null); } }} />
      <FilterSelect label="Horizon analisis" value={horizon} options={[{ value: 'intraday', label: 'Intraday · M15 / H1 / H4' }, { value: 'swing', label: 'Swing · H1 / H4 / D1' }]} onChange={value => { if (value === 'intraday' || value === 'swing') setHorizon(value); }} />
      <FilterSelect label="Instrumen" value={symbol ?? 'page'} options={[{ value: 'page', label: 'Pindai per halaman' }, ...filteredCatalog.map(asset => ({ value: asset.symbol, label: `${asset.displaySymbol} · ${asset.name}` }))]} onChange={value => { setSymbol(value === 'page' ? null : value); setPage(0); }} />
    </section>
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6"><ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-amber-500" /><p>Analisis ini hanya untuk trading manual dan tidak mengirim order. Market utama memakai Binance Spot untuk crypto; Forex/emas memerlukan snapshot broker MT5. Reference/Yahoo adalah proxy—jangan salin level langsung ke broker.</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" role="status"><p className="flex flex-wrap items-center gap-2"><Activity className="h-4 w-4 text-primary" />{loading ? 'Memindai candle final…' : error ? 'Pemindaian gagal' : `${rows.length} instrumen · ${candidates} kandidat · ${watching} dengan rencana bersyarat`}<span className="text-muted-foreground">· refresh 90 detik</span></p><p className="text-muted-foreground">{data ? `Pemindaian ${date(data.generatedAt)}` : 'Menunggu data provider'}</p></div>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">{error} Data lama tidak dianggap sebagai sinyal baru.</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,1fr)]">
      <section aria-label="Hasil scanner" className="space-y-3">
        {!rows.length && <div className="rounded-xl border border-dashed p-8 text-base text-muted-foreground">{loading ? 'Mengambil data instrumen terpilih. Kegagalan provider akan ditampilkan.' : 'Belum ada hasil. Pilih instrumen lalu muat ulang.'}</div>}
        {rows.map(row => { const status = effectiveStatus(row, currentTime), base = row.frames[0]; return <button key={row.id} type="button" onClick={() => setFocused(row.symbol)} aria-pressed={selected?.symbol === row.symbol} className={cn('w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50', selected?.symbol === row.symbol && 'border-primary ring-1 ring-primary/20')}>
          <div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-lg font-semibold">{row.displaySymbol}</h2><p className="text-xs text-muted-foreground">{row.source.instrument} · {row.marketType}</p></div><Badge variant="outline" className={cn('self-start text-sm', status === 'candidate' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{LABELS[status]}</Badge></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-sm font-medium">{row.bias === 'bullish' ? <ArrowUp className="h-4 w-4 text-emerald-500" /> : row.bias === 'bearish' ? <ArrowDown className="h-4 w-4 text-red-500" /> : null}{biasLabel(row.bias)} · {price(base.close)}</p><p className="text-sm tabular-nums">Aturan {status === 'stale' ? '—' : number(row.conviction, 0)}/100</p></div>
          <div className="mt-3 flex flex-wrap gap-2">{row.frames.map(frame => <span key={frame.timeframe} className="rounded-md bg-muted px-2 py-1 text-xs">{frame.timeframe} · {frame.quality === 'fresh' && !(frame.expiresAt && Date.parse(frame.expiresAt) < currentTime) ? biasLabel(frame.bias) : frame.quality === 'unavailable' ? 'no data' : 'basi'}</span>)}</div>
          {status !== 'stale' && status !== 'unavailable' && (row.plan || row.manualScenarios?.length) ? <div className="mt-3 space-y-2 border-t pt-3">{(status === 'candidate' && row.plan ? [row.plan] : row.manualScenarios ?? []).map(level => <div key={level.side} className="rounded-lg bg-muted/50 p-3 text-xs tabular-nums"><p className="mb-2 font-semibold">{level.side.toUpperCase()} · {status === 'candidate' ? 'Kandidat' : 'Bersyarat — belum entry'}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><span>Entry<br /><strong>{price(level.entry)}</strong></span><span>SL<br /><strong>{price(level.stopLoss)}</strong></span><span>TP1<br /><strong>{price(level.takeProfit)}</strong></span><span>TP2<br /><strong>{price(level.secondTarget)}</strong></span></div></div>)}</div> : null}
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{status === 'stale' ? 'Data melewati batas waktu; jangan memakai level lama.' : row.reasons[0]}</p><p className="mt-2 text-xs text-muted-foreground">Candle final {date(base.lastClosedAt)} · pilih untuk detail</p>
        </button>; })}
        {!symbol && <div className="flex items-center justify-between gap-2 pt-2"><Button variant="outline" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" />Sebelumnya</Button><span className="text-sm">{page + 1} / {data?.scope.pages ?? '—'}</span><Button variant="outline" disabled={loading || !data || page + 1 >= data.scope.pages} onClick={() => setPage(value => value + 1)}>Berikutnya<ChevronRight className="h-4 w-4" /></Button></div>}
        <p className="text-sm leading-6 text-muted-foreground">{data?.scope.total ?? '—'} instrumen dalam cakupan market. Maksimal enam dipindai per halaman; bukan seluruh market sekaligus. Saham dan mode gabungan tersedia di Scanner klasik.</p>
      </section>
      {selected ? <SignalDetail row={selected} now={currentTime} /> : <div className="rounded-xl border border-dashed p-8 text-muted-foreground">Detail tampil setelah data tersedia.</div>}
    </div>
  </div></DashboardLayout>;
}
