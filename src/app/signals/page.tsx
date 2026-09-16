'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, RefreshCw, ScanLine, ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SIGNAL_QUICK_MARKETS } from '@/lib/constants';
import type { AdvancedSignal, SetupStatus, SignalHorizon, ReferencePlan, ManualScenario } from '@/lib/analysis/advanced-signals';
import { advanceSignalClock, assessBrokerPlan, effectiveSignalStatus as effectiveStatus, formatSignalPrice as price, signalDisplayTime, type SignalReceiptClock } from '@/lib/analysis/signal-presentation';
import { manualOrderLabel, manualOrderMetrics, manualOrderRequestKey, validateManualOrderDraft, type ManualOrderType } from '@/lib/trading/manual-order-ticket';
import { useUserStore } from '@/stores/user-store';
import LegacySignalScanner from './legacy-scanner';

type Market = 'all' | 'forex' | 'crypto';
type Source = 'market' | 'mt5' | 'reference';
type Asset = { symbol: string; displaySymbol: string; name: string; marketType: 'forex' | 'crypto' };
interface ScanPayload {
  data: AdvancedSignal[]; generatedAt: string; universe: Asset[];
  scope: { market: Market; source: Source; horizon: SignalHorizon; page: number; pages: number; symbol: string | null; total: number };
}
const LABELS: Record<SetupStatus, string> = { candidate: 'Kandidat setup', wait: 'Tunggu konfirmasi', conflict: 'Konflik timeframe', stale: 'Data kedaluwarsa', unavailable: 'Data perlu diperiksa' };
const number = (value: number | null, digits = 2) => value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { maximumFractionDigits: digits });
const date = (value: string | null) => value ? new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const biasLabel = (bias: AdvancedSignal['bias']) => bias === 'bullish' ? 'Bullish' : bias === 'bearish' ? 'Bearish' : 'Netral';

function compareSignals(left: AdvancedSignal, right: AdvancedSignal, now: number): number {
  const priority = (row: AdvancedSignal) => {
    const status = effectiveStatus(row, now);
    if (status === 'candidate') {
      // A live broker quote is the strongest manual signal because its
      // original geometry still survives the current Bid/Ask check.
      if (row.source.kind === 'broker') return assessBrokerPlan(row, now).status === 'review' ? 4 : 0;
      return 3;
    }
    if (status === 'wait' && row.manualScenarios?.length) return 2;
    if (status === 'conflict' && row.manualScenarios?.length) return 1;
    return 0;
  };
  const priorityDelta = priority(right) - priority(left);
  if (priorityDelta) return priorityDelta;
  const convictionDelta = (right.conviction ?? -1) - (left.conviction ?? -1);
  if (convictionDelta) return convictionDelta;
  const freshDelta = right.frames.filter(frame => frame.quality === 'fresh' && !(frame.expiresAt && Date.parse(frame.expiresAt) <= now)).length
    - left.frames.filter(frame => frame.quality === 'fresh' && !(frame.expiresAt && Date.parse(frame.expiresAt) <= now)).length;
  return freshDelta || left.symbol.localeCompare(right.symbol);
}

function OrderTicket({ row, plan, scenario, now, monotonicAt }: { row: AdvancedSignal; plan: ReferencePlan; scenario?: ManualScenario; now: number; monotonicAt: number }) {
  const userId = useUserStore(s => s.authenticatedUserId);
  const [open, setOpen] = useState(false);
  const [orderType, setOrderType] = useState<ManualOrderType>('buy_limit');
  const [quote, setQuote] = useState('');
  const [entry, setEntry] = useState(String(plan.entry));
  const [stopLoss, setStopLoss] = useState(String(plan.stopLoss));
  const [takeProfit, setTakeProfit] = useState(String(plan.takeProfit));
  const [secondTarget, setSecondTarget] = useState(String(plan.secondTarget ?? ''));
  const [volume, setVolume] = useState('0.01');
  const [acknowledged, setAcknowledged] = useState(false);
  const [accountKind, setAccountKind] = useState<'demo' | 'real'>('demo');
  const [accountAcknowledged, setAccountAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [orderFailed, setOrderFailed] = useState(false);
  const [openedSnapshot, setOpenedSnapshot] = useState('');
  const [attempted, setAttempted] = useState(false);
  const submittingRef = useRef(false);
  const snapshot = JSON.stringify([row.id, row.generatedAt, row.expiresAt, row.source, plan]);
  const snapshotChanged = open && openedSnapshot !== snapshot;
  const draft = { orderType, quote: Number(quote), entry: Number(entry), stopLoss: Number(stopLoss),
    takeProfit: Number(takeProfit), secondTarget: secondTarget.trim() ? Number(secondTarget) : null,
    volume: Number(volume), conditional: Boolean(scenario), acknowledged };
  const metrics = manualOrderMetrics(draft);
  const validation = validateManualOrderDraft(draft);
  const expired = ['stale', 'unavailable'].includes(effectiveStatus(row, now));
  const locked = submitting || attempted || Boolean(submitted);
  const currentDraftError = (eventMonotonicAt: number) => {
    if (useUserStore.getState().authenticatedUserId !== userId || !userId) return 'Session berubah. Masuk kembali dan pindai ulang.';
    if (snapshotChanged) return 'Signal telah diperbarui. Tutup dan buka tiket kembali untuk memakai data terbaru.';
    if (['stale', 'unavailable'].includes(effectiveStatus(row, now + Math.max(0, eventMonotonicAt - monotonicAt)))) return 'Signal kedaluwarsa. Muat ulang sebelum memakai level ini.';
    return null;
  };
  const quoteFor = (type: ManualOrderType) => {
    if (row.source.kind !== 'broker') return null;
    return type.startsWith('buy') ? row.source.ask ?? null : row.source.bid ?? null;
  };
  const openTicket = (type: ManualOrderType) => {
    if (submittingRef.current) return;
    if (attempted && !submitted) { setOpen(true); return; }
    setOrderType(type); setQuote(String(quoteFor(type) ?? '')); setEntry(String(plan.entry));
    setStopLoss(String(plan.stopLoss)); setTakeProfit(String(plan.takeProfit)); setSecondTarget(String(plan.secondTarget ?? ''));
    setAcknowledged(false); setAccountKind(row.source.accountKind ?? 'demo'); setAccountAcknowledged(false);
    setError(null); setCopied(false); setSubmitted(null); setOrderFailed(false); setAttempted(false); setOpenedSnapshot(snapshot); setOpen(true);
  };
  const copyTemplate = async (eventMonotonicAt: number) => {
    const freshnessError = currentDraftError(eventMonotonicAt);
    if (freshnessError) { setError(freshnessError); return; }
    if (!validation.valid) { setError(validation.error); setCopied(false); return; }
    const template = [
      'MT5 MANUAL ORDER TICKET',
      `Symbol: ${row.source.instrument}`,
      `Type: ${manualOrderLabel(orderType)}`,
      `Volume: ${volume} lot`,
      `Quote broker (${validation.side === 'buy' ? 'Ask' : 'Bid'}): ${quote}`,
      `Entry: ${entry}`,
      `Stop Loss: ${stopLoss}`,
      `Take Profit 1: ${takeProfit}`,
      `Take Profit 2 (referensi saja, tidak dikirim): ${secondTarget || 'tidak ditetapkan'}`,
      `R:R TP1 dari entry tiket: 1:${metrics?.riskReward.toFixed(2) ?? '—'} (sebelum biaya)`,
      `Source: ${row.source.provider} · ${row.source.note}`,
      scenario ? 'Status: CONDITIONAL — pending dipicu quote, bukan penutupan candle; konfirmasi model belum terpenuhi.' : 'Status: kandidat manual — verifikasi quote dan risiko sebelum submit.',
    ].join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard browser tidak tersedia.');
      await navigator.clipboard.writeText(template); setCopied(true); setError(null);
    } catch (caught) { setCopied(false); setError(caught instanceof Error ? caught.message : 'Template belum dapat disalin.'); }
  };
  const submitOrder = async (eventMonotonicAt: number) => {
    if (submittingRef.current || submitted) return;
    const freshnessError = currentDraftError(eventMonotonicAt);
    if (freshnessError) { setError(freshnessError); return; }
    if (row.source.kind !== 'broker') { setError('Direct order hanya tersedia untuk snapshot broker MT5, bukan proxy/reference.'); return; }
    if (!validation.valid) { setError(validation.error); return; }
    if (!accountAcknowledged) { setError('Centang konfirmasi akun dan parameter sebelum mengirim.'); return; }
    submittingRef.current = true;
    setSubmitting(true); setError(null); setCopied(false);
    let sent = false;
    try {
      const request = { symbol: row.source.instrument, marketType: row.marketType, action: validation.side,
        orderType, volume: Number(volume), quotePrice: Number(quote), entryPrice: Number(entry),
        stopLoss: Number(stopLoss), takeProfit: Number(takeProfit), accountKind };
      const idempotencyKey = manualOrderRequestKey(sessionStorage, userId!, request);
      setAttempted(true); sent = true;
      const response = await fetch('/api/trades/direct', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          ...request,
          idempotencyKey, conditionalAcknowledged: Boolean(scenario) && acknowledged,
          liveConfirmation: accountKind === 'demo' || accountAcknowledged,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if ([400, 401, 403, 413].includes(response.status)) { setAttempted(false); sent = false; }
        throw new Error(typeof payload?.error === 'string' ? payload.error : `Order ditolak (HTTP ${response.status}).`);
      }
      if (typeof payload?.trade?.id !== 'string' || typeof payload?.trade?.status !== 'string') throw new Error('Respons status order tidak lengkap.');
      const status = payload.trade.status;
      setOrderFailed(['failed', 'rejected', 'cancelled', 'canceled', 'expired'].includes(status));
      setSubmitted(`${payload.duplicate ? 'Request yang sama sudah tercatat' : 'Request tercatat'} (${payload.trade.id}). Status: ${status}.${payload.trade.error_message ? ` ${payload.trade.error_message}` : ''} TP broker: ${takeProfit}. Lihat Robot & Sistem untuk hasil eksekusi.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Status order belum dapat dikonfirmasi.';
      setError(sent ? `${message} Periksa Robot & Sistem. Percobaan ulang parameter yang sama memakai ID yang sama dalam tab ini, termasuk setelah reload.` : `Pengiriman belum dimulai: ${message}`);
    }
    finally { submittingRef.current = false; setSubmitting(false); }
  };
  return <section aria-label="Tiket pending order manual" className="rounded-xl border border-primary/20 bg-primary/5 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Order langsung ke MT5</h4><Badge variant="outline">TP1 dikirim · TP2 referensi</Badge></div>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Pilih tipe pending order. Setelah konfirmasi, order masuk antrean dan worker memvalidasi ulang quote broker, akun, risiko, lot, Entry, SL dan TP sebelum satu kali pengiriman.</p>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(['buy_limit', 'buy_stop', 'sell_limit', 'sell_stop'] as ManualOrderType[]).map(type => <Button key={type} type="button" variant="outline" size="sm" onClick={() => openTicket(type)}>{manualOrderLabel(type)}</Button>)}</div>
    <Dialog open={open} onOpenChange={value => { if (!submittingRef.current) setOpen(value); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{manualOrderLabel(orderType)} · {row.displaySymbol}</DialogTitle><DialogDescription>Isi quote broker terbaru, periksa geometri, pilih akun tujuan, lalu kirim satu order terproteksi ke antrean MT5.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {snapshotChanged && <p role="alert" className="rounded-lg border border-amber-500/30 p-3 text-sm">Signal telah diperbarui. Tutup dan buka tiket kembali untuk memakai data terbaru. Jika order sudah dikirim, periksa statusnya di Robot & Sistem.</p>}
          <fieldset disabled={locked} className="space-y-3" onChange={() => { setAccountAcknowledged(false); setCopied(false); setError(null); }}>
          {scenario && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm leading-6 text-amber-700 dark:text-amber-300">Konfirmasi model belum terpenuhi. Pending order dapat aktif ketika quote menyentuh Entry; MT5 tidak menunggu candle selesai. Untuk mengikuti konfirmasi model, tunggu candle final dan pindai ulang sebelum memasang order.</div>}
          <label className="block text-sm font-medium">Akun tujuan<Select disabled={locked} value={accountKind} items={[{ value: 'demo', label: 'Demo' }, { value: 'real', label: 'Real · Standard Cent' }]} onValueChange={value => { if (value === 'demo' || value === 'real') { setAccountKind(value); setAccountAcknowledged(false); setCopied(false); } }}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="demo">Demo</SelectItem><SelectItem value="real">Real · Standard Cent</SelectItem></SelectContent></Select></label>
          <label className="block text-sm font-medium">Quote broker ({orderType.startsWith('buy') ? 'Ask' : 'Bid'})<Input className="mt-1" type="number" inputMode="decimal" step="any" value={quote} onChange={event => setQuote(event.target.value)} placeholder="Masukkan quote MT5 terbaru" /></label>
          <label className="block text-sm font-medium">Volume (lot)<Input className="mt-1" type="number" inputMode="decimal" step="any" min="0" value={volume} onChange={event => setVolume(event.target.value)} /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Entry<Input className="mt-1" type="number" inputMode="decimal" step="any" value={entry} onChange={event => setEntry(event.target.value)} /></label><label className="block text-sm font-medium">Stop Loss<Input className="mt-1" type="number" inputMode="decimal" step="any" value={stopLoss} onChange={event => setStopLoss(event.target.value)} /></label><label className="block text-sm font-medium">Take Profit 1 · dikirim ke MT5<Input className="mt-1" type="number" inputMode="decimal" step="any" value={takeProfit} onChange={event => setTakeProfit(event.target.value)} /></label><label className="block text-sm font-medium">Take Profit 2 · referensi opsional<Input className="mt-1" type="number" inputMode="decimal" step="any" value={secondTarget} onChange={event => setSecondTarget(event.target.value)} placeholder="Boleh kosong" /></label></div>
          {scenario && <label className="flex items-start gap-2 rounded-lg border p-3 text-sm leading-5"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-1" />Saya memilih pending order bersyarat yang dapat aktif sebelum konfirmasi candle.</label>}
          </fieldset>
          <section aria-label="Evaluasi entry tiket" className="rounded-lg border bg-muted/30 p-3 text-sm">
            <h4 className="font-semibold">Evaluasi entry yang Anda isi</h4>
            {metrics ? <><dl className="mt-2 grid grid-cols-2 gap-3 tabular-nums"><div><dt>R:R TP1 sebelum biaya</dt><dd className="font-semibold">1:{number(metrics.riskReward)}</dd></div><div><dt>Jarak quote → entry</dt><dd>{price(metrics.quoteDistance)}</dd></div><div><dt>Jarak entry → SL</dt><dd>{price(metrics.risk)}</dd></div><div><dt>Jarak entry → TP1</dt><dd>{price(metrics.reward)}</dd></div></dl>{metrics.riskReward < 1.5 && <p className="mt-2 text-amber-700 dark:text-amber-300">R:R tiket di bawah 1,5R yang dipakai model. Level yang diedit belum tentu memenuhi analisis awal.</p>}</> : <p className="mt-2 text-amber-700 dark:text-amber-300">{!validation.valid ? validation.error : 'Lengkapi harga untuk menghitung R:R.'}</p>}
            <p className="mt-2 text-xs leading-5 text-muted-foreground">MT5 menerima satu TP pada harga TP1 untuk volume ini. TP2 hanya catatan target lanjutan; tidak ada pembagian lot otomatis. Jarak memakai satuan harga, bukan risiko uang. Lot step, margin, biaya dan slippage diperiksa di MT5.</p>
          </section>
          <label className="flex items-start gap-2 rounded-lg border border-primary/30 p-3 text-sm leading-5"><input type="checkbox" disabled={locked} checked={accountAcknowledged} onChange={event => setAccountAcknowledged(event.target.checked)} className="mt-1 shrink-0" /><span>Saya memeriksa akun <strong>{accountKind === 'real' ? 'REAL Standard Cent' : 'DEMO'}</strong>, volume, Entry, SL, TP dan memahami bahwa order dapat ditolak oleh guard broker.</span></label>
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
          {copied && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />Template tersalin.</p>}
          {submitted && <p role="status" className={cn('rounded-lg border p-3 text-sm', orderFailed ? 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300')}>{submitted}</p>}
        </div>
        <Link href="/operations" className="text-sm underline">Periksa status order di Robot & Sistem</Link>
        <DialogFooter><Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>Tutup</Button><Button type="button" variant="outline" disabled={submitting || expired || snapshotChanged} onClick={() => void copyTemplate(performance.now())}><Copy className="h-4 w-4" />Salin template MT5</Button><Button type="button" onClick={() => void submitOrder(performance.now())} disabled={submitting || Boolean(submitted) || expired || snapshotChanged || !validation.valid || row.source.kind !== 'broker' || !accountAcknowledged}>{submitting ? 'Mengirim…' : attempted && !submitted ? 'Coba ulang ID yang sama' : 'Kirim order'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

function TradeLevels({ plan, scenario, row, now, monotonicAt }: { plan: ReferencePlan; scenario?: ManualScenario; row: AdvancedSignal; now: number; monotonicAt: number }) {
  return <section className={cn('rounded-xl border p-4', plan.side === 'buy' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{plan.side.toUpperCase()} · {scenario ? 'Tunggu breakout' : 'Kandidat candle'}</h3><Badge variant="outline">{scenario ? 'Bersyarat · belum aktif' : 'Candle final'}</Badge></div>
    {scenario && <p className="mt-2 text-sm">Pemicu: close {plan.side === 'buy' ? 'di atas' : 'di bawah'} <strong className="tabular-nums">{price(scenario.triggerPrice)}</strong> · jarak entry {number(scenario.distanceAtr, 1)} ATR</p>}
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm tabular-nums">
      {[['Entry referensi', plan.entry], ['Stop Loss', plan.stopLoss], ['Take Profit 1', plan.takeProfit], ['Take Profit 2', plan.secondTarget]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-background/70 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-lg font-semibold">{price(value as number | null)}</dd></div>)}
    </dl>
    <p className="mt-3 text-sm">R:R kotor 1:{number(plan.grossRiskReward)} · jarak SL {number(Math.abs(plan.entry - plan.stopLoss))} ({number(Math.abs(plan.entry - plan.stopLoss) / plan.entry * 100)}%)</p>
    {plan.obstacle !== null && <p className="mt-2 text-sm">Penghalang target {plan.obstacleTimeframe ?? row.frames[0]?.timeframe}: <strong className="tabular-nums">{price(plan.obstacle)}</strong> · TP1 ditempatkan sebelum level ini.</p>}
    <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.basis} Belum termasuk spread, swap dan slippage.</p>
    {scenario && <><p className="mt-3 text-sm leading-6">{scenario.confirmation}</p><p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{scenario.invalidation}</p></>}
    <OrderTicket row={row} plan={plan} scenario={scenario} now={now} monotonicAt={monotonicAt} />
  </section>;
}

function isPayload(value: unknown): value is ScanPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<ScanPayload>;
  return Array.isArray(data.data) && Array.isArray(data.universe) && !!data.scope && Number.isFinite(Date.parse(data.generatedAt ?? ''))
    && data.data.every(row => !!row && typeof row.symbol === 'string' && row.status in LABELS && Array.isArray(row.frames) && Array.isArray(row.reasons) && Array.isArray(row.groups));
}

function SignalDetail({ row, now, monotonicAt }: { row: AdvancedSignal; now: number; monotonicAt: number }) {
  const status = effectiveStatus(row, now), expired = status === 'stale';
  const execution = assessBrokerPlan(row, now);
  // A broker candidate is only shown as a manual plan when the current
  // bid/ask still fits the original geometry. Reference/spot candidates stay
  // informational and must be matched to the user's broker separately.
  const brokerBlocked = status === 'candidate' && row.source.kind === 'broker' && execution.status !== 'review';
  const plan = status === 'candidate' && !brokerBlocked ? row.plan : null;
  const quoteSide = row.plan?.side === 'buy' ? 'Ask' : row.plan?.side === 'sell' ? 'Bid' : '—';
  const scenarios = status === 'stale' || status === 'unavailable' ? [] : row.manualScenarios ?? [];
  return <Card id="signal-detail" className="scroll-mt-24 overflow-hidden">
    <CardHeader className="border-b bg-muted/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Analisis terpilih</p><CardTitle className="mt-1 text-2xl">{row.displaySymbol}</CardTitle></div>
        <Badge variant="outline" className={cn('text-sm', status === 'candidate' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{LABELS[status]}</Badge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{row.source.provider} · <strong>{row.source.instrument}</strong> · {row.setup}</p>
      <p className="text-sm leading-6 text-amber-700 dark:text-amber-300">{row.source.note}</p>
    </CardHeader>
    <CardContent className="space-y-6 p-4 md:p-5">
      <a href="#scanner-results" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary xl:hidden"><ChevronLeft className="size-4" />Kembali ke daftar sinyal</a>
      <section aria-label="Koneksi sumber harga" className="rounded-xl border bg-muted/20 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Sumber & kesegaran data</h3><Badge variant="outline">{row.source.kind === 'broker' ? `Akun ${row.source.accountKind ?? 'belum terhubung'}` : row.source.kind === 'spot' ? 'Spot USDT' : 'Referensi / proxy'}</Badge></div>
        {row.source.kind === 'broker' ? <>
          <dl className="mt-3 grid grid-cols-2 gap-3 tabular-nums"><div><dt className="text-muted-foreground">Bid / Ask snapshot</dt><dd>{price(row.source.bid ?? null)} / {price(row.source.ask ?? null)}</dd></div><div><dt className="text-muted-foreground">Spread harga</dt><dd>{price(row.source.ask !== undefined && row.source.bid !== undefined ? row.source.ask - row.source.bid : null)}</dd></div><div><dt className="text-muted-foreground">Quote terakhir</dt><dd>{date(row.source.quoteTime ?? null)}</dd></div><div><dt className="text-muted-foreground">Snapshot diterima</dt><dd>{date(row.source.capturedAt ?? null)}</dd></div></dl>
          <p className="mt-3 text-xs text-muted-foreground">{row.source.server ?? 'Jalankan run_signal_bridge.bat pada terminal Exness.'} · Bridge mengirim data, bukan status robot ON. Quote dibatasi 3 menit; ini bukan streaming tick.</p>
        </> : <p className="mt-2 text-muted-foreground">{row.source.kind === 'spot' ? 'Candle Binance spot USDT, bukan harga CFD Exness. Pilih MT5 Broker untuk analisis pada instrumen terminal Anda.' : 'Mode pembanding. Harga dan sesi dapat berbeda dari broker.'}</p>}
      </section>
      <section aria-label="Rencana trading manual" className="space-y-3">
        <div><h3 className="text-lg font-semibold">Entry · Stop Loss · Take Profit</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{brokerBlocked ? 'Quote broker saat ini tidak lagi mendukung geometri rencana. Level lama disembunyikan; muat ulang untuk setup baru.' : plan ? row.source.kind === 'broker' ? 'Kandidat lolos filter pada candle terakhir dan pemeriksaan snapshot broker. Periksa kembali quote sebelum order.' : 'Kandidat lolos filter candle sumber ini. Belum diperiksa terhadap quote atau kontrak broker MT5.' : 'Rencana bersyarat untuk dipantau, bukan instruksi entry sekarang. Dua arah adalah alternatif, bukan dua order sekaligus.'}</p></div>
        {plan ? <TradeLevels row={row} plan={plan} now={now} monotonicAt={monotonicAt} /> : scenarios.length ? scenarios.map(scenario => <TradeLevels key={scenario.side} row={row} plan={scenario} scenario={scenario} now={now} monotonicAt={monotonicAt} />) : <p className="rounded-xl border border-dashed p-4 text-sm leading-6 text-muted-foreground">{expired ? 'Level kedaluwarsa disembunyikan. Muat ulang sebelum menilai entry.' : brokerBlocked ? 'Quote broker membuat R:R di bawah batas atau harga sudah melewati level. Jangan mengejar entry lama.' : status === 'unavailable' ? 'Data belum memenuhi pemeriksaan kualitas. Alasan dan timeframe yang bermasalah tercantum di bawah; harga tidak dibuat-buat.' : 'Belum ada rencana bersyarat dengan jarak entry ≤3 ATR dan ruang target ≥1,5R setelah memeriksa struktur tiga timeframe. Pantau channel dan penghalang pada detail struktur di bawah.'}</p>}
        {status === 'candidate' && row.source.kind === 'broker' && <section aria-label="Pemeriksaan harga entry broker" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <h4 className="font-semibold">{execution.status === 'blocked' ? 'Jangan gunakan entry lama' : 'Bandingkan dengan quote broker'}</h4>
          <p className="mt-2 leading-6">{execution.reason}</p>
          {execution.quoteEntry !== null && <dl className="mt-3 grid grid-cols-2 gap-3 tabular-nums"><div><dt className="text-muted-foreground">Entry pada {quoteSide} snapshot</dt><dd>{price(execution.quoteEntry)}</dd></div><div><dt className="text-muted-foreground">R:R pada quote</dt><dd>{execution.riskReward === null ? '—' : `1:${number(execution.riskReward)}`}</dd></div><div><dt className="text-muted-foreground">Pergeseran entry</dt><dd>{number(execution.entryDriftR)}R · positif = lebih buruk</dd></div><div><dt className="text-muted-foreground">Spread harga</dt><dd>{price(execution.spread)}</dd></div></dl>}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">SL/TP referensi tidak digeser untuk memperbesar R:R. BUY dinilai pada Ask dengan pemicu SL/TP pada Bid; SELL sebaliknya. Belum termasuk komisi, swap, slippage atau perubahan harga sejak snapshot. Ini bukan hasil profit maupun izin eksekusi.</p>
        </section>}
        <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">Kandidat memakai close candle; entry skenario adalah proyeksi setelah pemicu. Tombol Kirim order hanya aktif untuk snapshot broker dan tetap divalidasi ulang oleh worker MT5. Reference/spot tidak dapat dikirim langsung. Berlaku sampai {date(row.expiresAt)}.</p>
      </section>
      <details className="rounded-xl border p-4" data-analysis-details><summary className="cursor-pointer font-semibold">Lihat alasan & indikator analisis</summary><div className="mt-4 space-y-6">
      {status !== 'stale' && status !== 'unavailable' && row.frames[0] && <section aria-label="Kualitas pemicu entry" className="rounded-xl border bg-muted/20 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Kualitas pemicu entry · {row.frames[0].timeframe}</h3><Badge variant="outline">{row.frames[0].trigger ? row.setup : 'Belum terkonfirmasi'}</Badge></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 tabular-nums">
          <div><dt className="text-muted-foreground">Level yang diuji</dt><dd>{price(row.frames[0].triggerLevel ?? null)}</dd></div>
          <div><dt className="text-muted-foreground">Body / rentang candle</dt><dd>{number(row.frames[0].bodyFraction == null ? null : row.frames[0].bodyFraction * 100, 0)}%</dd></div>
          <div><dt className="text-muted-foreground">Posisi close searah</dt><dd>{number(row.frames[0].directionalClose == null ? null : row.frames[0].directionalClose * 100, 0)}%</dd></div>
          <div><dt className="text-muted-foreground">Jarak dari EMA20</dt><dd>{number(row.frames[0].extensionAtr)} ATR</dd></div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Breakout perlu buffer 0,1 ATR, body ≥35% dan posisi close ≥65% searah bias. Retest pertama atau recovery dengan konfirmasi harga dapat menjadi pemicu alternatif. Semua memakai candle final; skor bukan peluang profit.</p>
      </section>}
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
      <section><h3 className="font-semibold">{status === 'unavailable' || expired ? 'Perbaiki data sebelum menilai entry' : 'Alasan keputusan'}</h3><ul className="mt-3 space-y-2 text-sm leading-6">{row.reasons.map(reason => <li key={reason} className="border-l-2 border-primary/30 pl-3">{reason}</li>)}</ul></section>
      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Struktur, volatilitas & kualitas data</summary>
        <div className="mt-4 space-y-4">{row.frames.map(frame => <div key={frame.timeframe} className="border-t pt-3">
          <p className="font-semibold">{frame.timeframe} · {frame.bars} candle final</p>
          <p className="mt-1 leading-6 text-muted-foreground">Close {price(frame.close)} · ATR {price(frame.atr)} ({number(frame.atrPercent)}%)<br />Support {price(frame.support)} · Resistance {price(frame.resistance)}<br />Channel 20 bar {price(frame.channelLow)} – {price(frame.channelHigh)}<br />EMA50 {price(frame.ema50)} · EMA200 {price(frame.ema200)}<br />+DI {number(frame.plusDI, 1)} · −DI {number(frame.minusDI, 1)}<br />Volume relatif {number(frame.relativeVolume)} · bukan konfirmasi spot Forex<br />Candle selesai {date(frame.lastClosedAt)}<br />Valid sampai {date(frame.expiresAt)}</p>
          {frame.notes.map(note => <p key={note} className="mt-2 text-amber-600 dark:text-amber-400">{note}</p>)}
        </div>)}</div>
      </details>
      <div className="space-y-2 text-sm leading-6 text-muted-foreground">{row.cautions.slice(1).map(caution => <p key={caution}>{caution}</p>)}</div>
      </div></details>
      <Link href={`/asset/${encodeURIComponent(row.symbol)}`} className={buttonVariants({ variant: 'outline', className: 'w-full' })}>Buka chart & analisis aset</Link>
      <p className="text-xs text-muted-foreground">Chart aset memakai feed terpisah; jangan menganggap levelnya identik. Status robot dan antrean tersedia di <Link className="underline" href="/operations">Robot & Sistem</Link>.</p>
      <p className="text-xs text-muted-foreground">{row.modelVersion} · analisis {date(row.generatedAt)} · berakhir {date(row.expiresAt)}</p>
    </CardContent>
  </Card>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div><p className="mb-2 text-sm font-medium">{label}</p><Select value={value} items={options} onValueChange={value => { if (typeof value === 'string') onChange(value); }}><SelectTrigger className="w-full" aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}

export default function SignalScannerPage() {
  const userId = useUserStore(s => s.authenticatedUserId);
  const [legacy, setLegacy] = useState(false);
  const [market, setMarket] = useState<Market>('all'), [source, setSource] = useState<Source>('market'), [horizon, setHorizon] = useState<SignalHorizon>('intraday');
  const [symbol, setSymbol] = useState<string | null>(null), [page, setPage] = useState(0), [focused, setFocused] = useState('XAU/USD');
  const [payload, setPayload] = useState<(ScanPayload & SignalReceiptClock & { owner: string }) | null>(null);
  const [catalog, setCatalog] = useState<Asset[]>([
    { symbol: 'XAU/USD', displaySymbol: 'XAU/USD', name: 'Gold', marketType: 'forex' },
    { symbol: 'BTC/USDT', displaySymbol: 'BTC/USDT', name: 'Bitcoin', marketType: 'crypto' },
  ]);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => ({ wall: Date.now(), monotonic: performance.now() }));
  const requestRef = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    if (!userId) return;
    const controller = new AbortController(); requestRef.current = controller; setLoading(true);
    const startedAt = performance.now();
    try {
      const query = new URLSearchParams({ market, source, horizon, page: String(page) }); if (symbol) query.set('symbol', symbol);
      const response = await fetch(`/api/signals/advanced?${query}`, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) });
      const body: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted || requestRef.current !== controller || useUserStore.getState().authenticatedUserId !== userId) return;
      if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`);
      if (!isPayload(body) || body.scope.market !== market || body.scope.source !== source || body.scope.horizon !== horizon || body.scope.page !== page || body.scope.symbol !== symbol) throw new Error('Respons tidak sesuai filter pemindaian.');
      const receivedAt = Date.now(), receivedMonotonicAt = performance.now();
      setPayload({ ...body, owner: userId, receivedAt, receivedMonotonicAt, requestDurationMs: receivedMonotonicAt - startedAt });
      setClock({ wall: receivedAt, monotonic: receivedMonotonicAt }); setCatalog(body.universe); setError(null);
    } catch (caught) {
      if (!controller.signal.aborted && requestRef.current === controller) { setPayload(null); setError(caught instanceof Error ? caught.message : 'Pemindaian belum berhasil.'); }
    } finally { if (!controller.signal.aborted && requestRef.current === controller) setLoading(false); }
  }, [market, source, horizon, page, symbol, userId]);
  useEffect(() => {
    if (legacy || !userId) { requestRef.current?.abort(); return; }
    const tick = () => setClock(previous => advanceSignalClock(previous, Date.now(), performance.now()));
    const start = setTimeout(() => void refresh(), 0), interval = setInterval(() => void refresh(), 90_000), ticker = setInterval(tick, 1_000);
    window.addEventListener('focus', tick); document.addEventListener('visibilitychange', tick);
    return () => { clearTimeout(start); clearInterval(interval); clearInterval(ticker); requestRef.current?.abort(); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [refresh, legacy, userId]);
  if (legacy) return <LegacySignalScanner onAdvanced={() => setLegacy(false)} />;
  const data = userId && payload?.owner === userId && payload.scope.market === market && payload.scope.source === source && payload.scope.horizon === horizon && payload.scope.page === page && payload.scope.symbol === symbol ? payload : null;
  const currentTime = data ? signalDisplayTime(data.generatedAt, data, clock.wall, clock.monotonic) : clock.wall;
  const rows = [...(data?.data ?? [])].sort((left, right) => compareSignals(left, right, currentTime)), selected = rows.find(row => row.symbol === focused) ?? rows[0];
  const candidates = rows.filter(row => {
    if (effectiveStatus(row, currentTime) !== 'candidate') return false;
    return row.source.kind === 'broker' && assessBrokerPlan(row, currentTime).status === 'review';
  }).length;
  const referenceCandidates = rows.filter(row => effectiveStatus(row, currentTime) === 'candidate' && row.source.kind !== 'broker').length;
  const brokerBlocked = rows.filter(row => effectiveStatus(row, currentTime) === 'candidate' && row.source.kind === 'broker' && assessBrokerPlan(row, currentTime).status !== 'review').length;
  const watching = rows.filter(row => ['wait', 'conflict'].includes(effectiveStatus(row, currentTime)) && row.manualScenarios?.length).length;
  const filteredCatalog = catalog.filter(asset => market === 'all' || asset.marketType === market);
  const focusSymbol = (value: string) => { setMarket('all'); setPage(0); setSymbol(value); setFocused(value); };
  return <DashboardLayout><div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-sm font-medium text-primary">Signals Advanced</p><h1>Sinyal trading</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Temukan setup, periksa Entry / SL / TP, lalu tentukan order manual Anda.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setLegacy(true)}>Scanner klasik</Button><Button onClick={() => void refresh()} disabled={loading}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />Muat ulang</Button></div>
    </header>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => focusSymbol('XAU/USD')}>Fokus XAUUSD</Button><Button variant="outline" onClick={() => focusSymbol('BTC/USDT')}>Fokus BTC</Button><Button variant="ghost" onClick={() => { setMarket('all'); setSymbol(null); setPage(0); }}>Semua Forex & Crypto</Button></div>
    <details className="rounded-xl border bg-card px-4">
      <summary className="cursor-pointer text-sm font-semibold">Market populer lainnya</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{(['forex', 'crypto'] as const).map(kind => <section key={kind} aria-label={`Akses cepat ${kind}`}>
        <h2 className="mb-2 text-xs font-medium text-muted-foreground">{kind === 'forex' ? 'Forex & Silver' : 'Crypto'}</h2>
        <div className="flex flex-wrap gap-2">{SIGNAL_QUICK_MARKETS.filter(asset => asset.marketType === kind).map(asset => <Button key={asset.symbol} variant={symbol === asset.symbol ? 'default' : 'outline'} size="sm" aria-pressed={symbol === asset.symbol} onClick={() => focusSymbol(asset.symbol)}>{asset.label}</Button>)}</div>
      </section>)}</div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Akses cepat, bukan peringkat profit. Pilihan sumber harga tetap dipertahankan. Crypto spot memakai USDT; order MT5 hanya tersedia jika simbol didukung akun, snapshot bridge segar, dan worker mengizinkannya. Instrumen lain tersedia di filter Instrumen.</p>
    </details>
    <details className="rounded-xl border bg-card px-4">
      <summary className="cursor-pointer py-3 text-sm font-semibold">Atur filter analisis <span className="font-normal text-muted-foreground">· {horizon === 'intraday' ? 'Intraday' : 'Swing'} · {source === 'mt5' ? 'MT5 broker' : source === 'reference' ? 'Referensi Yahoo' : 'MT5 & Binance'}{symbol ? ` · ${symbol}` : ''}</span></summary>
      <section aria-label="Filter Signals" className="grid gap-4 border-t py-4 sm:grid-cols-2 xl:grid-cols-4">
      <FilterSelect label="Market" value={market} options={[{ value: 'all', label: 'Forex & Crypto' }, { value: 'forex', label: 'Forex & Metals' }, { value: 'crypto', label: 'Crypto' }]} onChange={value => { if (value === 'all' || value === 'forex' || value === 'crypto') { setMarket(value); setPage(0); setSymbol(null); } }} />
      <FilterSelect label="Sumber harga" value={source} options={[{ value: 'market', label: 'MT5 Forex + Binance Spot' }, { value: 'mt5', label: 'MT5 Broker · Forex & Crypto' }, { value: 'reference', label: 'Reference / Yahoo' }]} onChange={value => { if (value === 'market' || value === 'mt5' || value === 'reference') setSource(value); }} />
      <FilterSelect label="Horizon analisis" value={horizon} options={[{ value: 'intraday', label: 'Intraday · M15 / H1 / H4' }, { value: 'swing', label: 'Swing · H1 / H4 / D1' }]} onChange={value => { if (value === 'intraday' || value === 'swing') setHorizon(value); }} />
      <FilterSelect label="Instrumen" value={symbol ?? 'page'} options={[{ value: 'page', label: 'Pindai per halaman' }, ...filteredCatalog.map(asset => ({ value: asset.symbol, label: `${source === 'market' ? asset.displaySymbol : asset.symbol.replace('/USDT', '/USD')} · ${asset.name}` }))]} onChange={value => { setSymbol(value === 'page' ? null : value); setPage(0); }} />
      </section>
    </details>
    <details className="rounded-xl border bg-card px-4 text-sm leading-6"><summary className="cursor-pointer font-medium">Sumber harga & cara order</summary><p className="pb-4 text-muted-foreground">Signal dari Binance Spot dan Reference/Yahoo tetap informasional. Hanya snapshot MT5 broker yang memiliki tombol order langsung; worker akan memeriksa ulang akun demo/real, quote, margin, lot, geometri Entry/SL/TP dan guard risiko. Jangan salin level proxy ke broker.</p></details>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" role="status"><p className="flex flex-wrap items-center gap-2"><Activity className="h-4 w-4 text-primary" />{loading ? 'Memindai candle final…' : error ? 'Pemindaian gagal' : `${rows.length} instrumen · ${candidates} kandidat broker · ${referenceCandidates} kandidat spot/referensi · ${watching} rencana bersyarat${brokerBlocked ? ` · ${brokerBlocked} tertahan quote` : ''}`}<span className="text-muted-foreground">· refresh 90 detik</span></p><p className="text-muted-foreground">{data ? `Pemindaian ${date(data.generatedAt)}` : 'Menunggu data provider'}</p></div>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">{error} Data lama tidak dianggap sebagai sinyal baru.</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,1fr)]">
      <section id="scanner-results" aria-label="Hasil scanner" className="min-w-0 scroll-mt-24 space-y-3">
        {!rows.length && <div className="rounded-xl border border-dashed p-8 text-base text-muted-foreground">{loading ? 'Mengambil data instrumen terpilih. Kegagalan provider akan ditampilkan.' : 'Belum ada hasil. Pilih instrumen lalu muat ulang.'}</div>}
        {rows.map(row => { const status = effectiveStatus(row, currentTime), base = row.frames[0], execution = assessBrokerPlan(row, currentTime); return <button key={row.id} type="button" onClick={() => { setFocused(row.symbol); if (window.innerWidth < 1280) requestAnimationFrame(() => document.getElementById('signal-detail')?.scrollIntoView({ block: 'start' })); }} aria-pressed={selected?.symbol === row.symbol} className={cn('w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50', selected?.symbol === row.symbol && 'border-primary ring-1 ring-primary/20')}>
          <div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-lg font-semibold">{row.displaySymbol}</h2><p className="text-xs text-muted-foreground">{row.source.instrument} · {row.marketType}</p></div><Badge variant="outline" className={cn('self-start text-sm', status === 'candidate' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{LABELS[status]}</Badge></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-sm font-medium">{row.bias === 'bullish' ? <ArrowUp className="h-4 w-4 text-emerald-500" /> : row.bias === 'bearish' ? <ArrowDown className="h-4 w-4 text-red-500" /> : null}{biasLabel(row.bias)} · {price(base.close)}</p><p className="text-sm tabular-nums">Aturan {status === 'stale' ? '—' : number(row.conviction, 0)}/100</p></div>
          <div className="mt-3 flex flex-wrap gap-2">{row.frames.map(frame => <span key={frame.timeframe} className="rounded-md bg-muted px-2 py-1 text-xs">{frame.timeframe} · {frame.quality === 'fresh' && !(frame.expiresAt && Date.parse(frame.expiresAt) < currentTime) ? biasLabel(frame.bias) : frame.quality === 'unavailable' ? 'no data' : 'basi'}</span>)}</div>
          {status !== 'stale' && status !== 'unavailable' && ((status === 'candidate' && row.plan && (row.source.kind !== 'broker' || execution.status === 'review')) || (status !== 'candidate' && row.manualScenarios?.length)) ? <div className="mt-3 space-y-2 border-t pt-3">{(status === 'candidate' && row.plan ? [row.plan] : row.manualScenarios ?? []).map(level => <div key={level.side} className="rounded-lg bg-muted/50 p-3 text-xs tabular-nums"><p className="mb-2 font-semibold">{level.side.toUpperCase()} · {status === 'candidate' ? 'Kandidat' : 'Bersyarat — belum entry'}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><span>Entry<br /><strong>{price(level.entry)}</strong></span><span>SL<br /><strong>{price(level.stopLoss)}</strong></span><span>TP1<br /><strong>{price(level.takeProfit)}</strong></span><span>TP2<br /><strong>{price(level.secondTarget)}</strong></span></div></div>)}</div> : null}
          {status === 'candidate' && row.source.kind === 'broker' && <p className="mt-3 rounded-lg border border-amber-500/25 p-3 text-sm leading-6 text-amber-700 dark:text-amber-300">{execution.status === 'blocked' ? 'Entry lama tidak layak: ' : 'Pemeriksaan broker: '}{execution.reason}</p>}
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{status === 'stale' ? 'Data melewati batas waktu; jangan memakai level lama.' : row.reasons[0]}</p><p className="mt-2 text-xs text-muted-foreground">Candle final {date(base.lastClosedAt)} · pilih untuk detail</p>
        </button>; })}
        {!symbol && <div className="flex items-center justify-between gap-2 pt-2"><Button variant="outline" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" />Sebelumnya</Button><span className="text-sm">{page + 1} / {data?.scope.pages ?? '—'}</span><Button variant="outline" disabled={loading || !data || page + 1 >= data.scope.pages} onClick={() => setPage(value => value + 1)}>Berikutnya<ChevronRight className="h-4 w-4" /></Button></div>}
        <p className="text-sm leading-6 text-muted-foreground">{data?.scope.total ?? '—'} instrumen dalam cakupan market. Maksimal enam dipindai per halaman; bukan seluruh market sekaligus. Saham dan mode gabungan tersedia di Scanner klasik.</p>
      </section>
      {selected ? <SignalDetail key={`${userId}:${source}:${horizon}:${selected.symbol}`} row={selected} now={currentTime} monotonicAt={clock.monotonic} /> : <div className="rounded-xl border border-dashed p-8 text-muted-foreground">Detail tampil setelah data tersedia.</div>}
    </div>
  </div></DashboardLayout>;
}
