# Signals v4 — entry analysis protocol

## Hypotheses fixed before replay (15 September 2026)

This is a website/manual-analysis revision, not a robot strategy or permission
to trade. No order, account or risk setting is changed.

1. A channel breakout should close beyond a 0.1 ATR buffer, with a directional
   body of at least 35% of its range and a close in the outer 35% of the candle.
   A wick-only rejection or indecisive candle is not confirmed continuation.
2. A first retest of a qualified breakout within six closed candles is a separate
   entry opportunity. The level must hold, and a directional rejection candle
   must close back beyond the buffer. Never infer the intrabar sequence.
3. RSI recovery can occur over three closed candles, but needs price confirmation
   through the previous candle and EMA20. The existing 50 midline, non-extreme RSI,
   three-timeframe trend, ADX and anti-chase checks remain. DI must agree.
4. TP must respect the nearest confirmed pivot ahead of entry across all three
   timeframes, including for a conditional breakout. Do not skip a second known
   obstacle after crossing the first. Pivots require two closed right-hand bars.
5. Show the evidence and failed checks, not a win probability. Conditional plans
   remain unconfirmed. Preserve current broker quote/expiry/order checks.

These thresholds are engineering hypotheses, not optimized or validated trading
parameters. Evaluate once with the existing frozen replay policy and saved native
XAUUSDm/BTCUSDm dataset. That period has already been seen: this is retrospective
regression evidence, **not a new holdout**. Include losses, zero trades, fees,
spread stress and sample-size limitations; do not tune against the result.

## Hasil replay — selesai, bukan bukti profit

Periode sama dengan audit v3: 11 Juni–9 September 2026 pukul 08:00 UTC.
Dataset native Exness demo tersimpan; tidak menghubungi MT5 atau membuka order.
Fold development/validation/test tetap 60/20/20; tidak mengoptimalkan parameter.

| Instrumen / fold | Trade v4 biaya dasar | Net R v3 dasar | Net R v4 dasar | Trade v4 biaya 2× | Net R v4 biaya 2× |
| --- | ---: | ---: | ---: | ---: | ---: |
| XAU · development | 0 | +0,857 | 0 | 0 | 0 |
| XAU · validation | 4 | −0,702 | −0,702 | 4 | −1,012 |
| XAU · test | 0 | 0 | 0 | 0 | 0 |
| BTC · development | 1 | −2,503 | −1,027 | 1 | −1,050 |
| BTC · validation | 1 | +0,768 | +1,840 | 1 | +1,703 |
| BTC · test | 1 | −1,016 | −1,016 | 1 | −1,031 |

Total v4: XAU **4 trade, −0,702R**, BTC **3 trade, −0,203R** pada biaya dasar.
Pada biaya 2×: XAU −1,012R, BTC −0,378R. R adalah unit jarak entry ke SL,
bukan persen/nominal profit akun. Total ini penjumlahan fold, bukan simulasi
portofolio kontinu. Biaya dasar dan 2× adalah resimulasi, bukan pengamatan baru.

BTC membaik pada sebagian sampel tetapi masih negatif keseluruhan dan test.
XAU kehilangan dua trade development yang sebelumnya positif; hasil totalnya
justru lebih buruk. **Hipotesis peningkatan profit stabil belum terbukti.**
Tujuh trade dasar terlalu sedikit untuk mengukur win rate yang dapat diandalkan.
Jangan menyebut v4 lebih profitable, atau menggunakan hasil ini untuk menaikkan
risiko. Perbaikan yang terverifikasi adalah konsistensi aturan harga, pemetaan
penghalang, dan keterbukaan alasan keputusan—bukan keunggulan profit.

Limitasi replay tetap seperti [audit v3](SIGNALS_VALIDATION.md): candle final
as-of, next contiguous open, perkiraan spread dari bar sebelumnya, provisi
komisi/slippage/swap, SL lebih dahulu jika ambigu, gap SL merugikan, TP1 saja,
tanpa trailing/BE, satu posisi per simbol/fold. Kalender historis yang belum
terverifikasi menolak 1.470 bar XAU development. Tidak memodelkan lot minimum,
margin, tick Ask aktual, portofolio, atau floating/account drawdown. Skenario
bersyarat dan perubahan manual pada tiket tidak diuji sebagai transaksi.

## Verifikasi perangkat lunak

- `npm run check`: lint, TypeScript, **185 test** dan production build lulus.
- Test baru mencakup buffer/body/wick, simetri BUY/SELL, retest pertama vs
  berulang/gagal, recovery RSI multi-candle, stop candle pemicu, penghalang
  timeframe tinggi, target bersyarat, dan konfirmasi pivot tanpa candle masa depan.
- UI terisolasi desktop/mobile: panel bukti entry, level, tiket dengan
  acknowledgement, WAIT tetap bersyarat, data stale menyembunyikan level. Tidak
  ada request order atau koneksi broker. Ini bukan verifikasi deployment/live feed.

```powershell
node tools/run-signals-replay.mjs --input local-reports/signals-dataset-2026-09-09T08-02-39-665Z.json
node --test tests/advanced-signals.test.mjs tests/signals-replay.test.mjs
# Test browser opsional: set PLAYWRIGHT_TEST_MODULE ke paket Playwright lokal.
node tests/signals-browser.test.mjs
```

Laporan lokal (di-ignore Git):

- Baseline: `local-reports/signals-replay-2026-09-15T15-18-47-491Z.json`
- V4: `local-reports/signals-replay-2026-09-15T15-25-19-327Z.json`
- Screenshot UI: `local-reports/signals-ui/desktop.png`, `mobile.png`

SHA-256 analysis: `9b1d4f297ae84189b88a56af5ffa4ecded39950dc89d45d5bc7dd782074148b3`  
SHA-256 policy: `7bc9d7b4900181d23fd071a355ed4ac5d805d70dbdd57ce795b52098846b1773`  
SHA-256 replay: `c9a53a39d96d489df1aee28f62027d1ca21dd318e1b97729901c7384c18fe894`  
SHA-256 dataset: `ff617f14643a0ff42c918b2261754221529c407196b2badc10dddc0693f69d35`

Langkah pembuktian berikutnya: kumpulkan paper/forward observations terikat
versi pada periode **setelah** perubahan ini, lengkap dengan quote/cost dan
hasil aktual. Jangan menyebut pengulangan dataset lama sebagai holdout baru.
Perubahan ini tidak membutuhkan migration Supabase atau perubahan env robot.
