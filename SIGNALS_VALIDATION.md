# Audit historis Signals v3 — 9 September 2026

**Belum terbukti profitable secara konsisten. Tidak memberikan izin real trading.**

Ini evaluasi model website `confluence-v3-source-aware`, bukan strategi robot
MT5. Tidak ada order, pergantian akun, perubahan risiko atau tuning parameter.
Dataset berasal dari histori native XAUUSDm dan BTCUSDm pada terminal Exness
demo yang sudah terbuka. Harga bukan GC=F, BTC-USD Yahoo atau Binance USDT.

## Hasil yang ditemukan

Periode keseluruhan: **11 Juni–9 September 2026, pukul 08:00 UTC**.
Pembagian waktu dibekukan 60% development, 20% validation, 20% test.
Ini audit retrospektif, bukan klaim holdout baru yang belum pernah dilihat atau
forward-test. Tidak ada model yang dilatih otomatis pada fold development.

| Instrumen / periode | Trade biaya dasar | Net R dasar | Trade biaya 2× | Net R 2× |
| --- | ---: | ---: | ---: | ---: |
| XAU · development, 11 Jun–4 Agu | 2 | +0,857 | 2 | +0,709 |
| XAU · validation, 4–22 Agu | 4 | −0,702 | 4 | −1,013 |
| XAU · test, 22 Agu–9 Sep | 0 | 0 | 0 | 0 |
| BTC · development, 11 Jun–4 Agu | 5 | −2,503 | 3 | −3,240 |
| BTC · validation, 4–22 Agu | 2 | +0,768 | 1 | +1,639 |
| BTC · test, 22 Agu–9 Sep | 1 | −1,016 | 1 | −1,031 |

`R` adalah jarak harga entry simulasi ke SL per unit, **bukan persentase atau
nominal hasil akun**. Angka dibulatkan; seluruh trade ada dalam laporan lokal.
Jumlah trade terlalu kecil untuk menyatakan hasil stabil. Hasil positif satu
fold tidak menghapus kerugian fold lain; nol trade bukan bukti bebas risiko.

Biaya 2× adalah **resimulasi**, sehingga sebagian entry ditolak karena R:R tidak
lagi muat. BTC validation 2× tampak lebih baik karena trade yang berbeda, bukan
karena menaikkan biaya memperbaiki strategi. PF tanpa trade rugi ditulis `null`,
bukan bukti PF tak terbatas atau profit pasti.

XAU development memiliki 1.470 bar evaluasi berstatus data unavailable.
Gap 19 Juni dan 3 Juli belum dijelaskan kalender Exness yang terverifikasi oleh
model ini; guard tetap aktif. Hasil ini tidak mencakup peluang pada interval
tersebut. Data BTC tidak mengalami penolakan kualitas serupa pada tiga fold.

## Metode dan batasan

- Mengambil 16.000 M15, 5.000 H1 dan 1.800 H4; setiap keputusan menggunakan
  maksimal 320 candle **yang sudah ditutup pada saat keputusan**, bukan candle
  H1/H4 masa depan. Data invalid, duplikat, tidak berurutan atau belum final ditolak.
- Hanya kandidat model yang diuji; rencana bersyarat/WAIT tidak dianggap order.
  Entry memakai open M15 berikutnya yang kontigu, bukan harga close yang sudah lewat.
- Satu posisi per instrumen/fold, keluar penuh TP1; tidak menguji TP2 parsial,
  breakeven atau trailing robot. Time exit 12 jam, pada bar perdagangan yang
  tersedia. Setiap fold mengawali tanpa posisi dan menutup sisanya pada akhir fold.
- BUY memakai Ask perkiraan, SELL memakai Bid; pemicu SL/TP BUY memakai Bid,
  SELL memakai Ask perkiraan. Saat SL dan TP tersentuh pada candle sama, SL
  didahulukan. Gap SL diisi pada harga open yang lebih buruk; keuntungan gap TP
  dibatasi pada target. Pembulatan tick dan slippage dibuat merugikan posisi.
- Spread adalah maksimum antara spread M15 **sebelumnya** dan floor asumsi
  0,40 harga XAU / 20 harga BTC. Spread bar entry belum diketahui saat open,
  sehingga tidak dipakai untuk menentukan entry pada bar itu sendiri.
- Asumsi tambahan: komisi 0,5 basis point per sisi, slippage 0,5 basis point
  per sisi, biaya penahanan 1 basis point per hari secara proporsional waktu.
  Satu basis point = 0,01%. Skenario stress mengalikan seluruh biaya dengan 2.
  **Ini provisi sensitivitas, bukan tagihan historis Exness yang terverifikasi.**
- Tidak mensimulasikan Ask tick aktual, latency, berita, batas minimum stop,
  perubahan spesifikasi historis, lot minimum, margin/leverage, penolakan broker,
  benturan portofolio Forex+Crypto, floating drawdown atau swap rollover/triple
  yang sebenarnya. Karena itu hasil tidak diproyeksikan sebagai profit akun cent.

Dasar antarmuka data: [MT5 copy_rates_from_pos](https://www.mql5.com/en/docs/python_metatrader5/mt5copyratesfrompos_py)
menyediakan OHLC dan spread serta membatasi histori pada data terminal;
bar indeks 0 masih berjalan, sehingga collector memakai indeks 1.
Perlakuan harga entry dan pemicu mengikuti [prinsip transaksi MT5](https://www.metatrader5.com/en/terminal/help/trading/general_concept).

## Reproduksi dan jejak audit

```powershell
# Tidak membuka order. Buka tepat satu terminal MT5 terlebih dahulu.
node tools/run-signals-replay.mjs --mt5

# Mengulang data tersimpan tanpa menghubungi MT5:
node tools/run-signals-replay.mjs --input local-reports/signals-dataset-2026-09-09T08-02-39-665Z.json

node --test tests/signals-replay.test.mjs
python -m unittest discover -s tools/mt5 -p 'test_*.py'
```

Laporan asli: `local-reports/signals-replay-2026-09-09T08-02-39-665Z.json`.
Dataset dan laporan lokal di-ignore Git, tidak diunggah otomatis. Output memakai
nama bertimestamp dan mode tulis eksklusif agar bukti lama tidak ditimpa.

SHA-256 model: `3938d19099d61813096874f08c4abcb465232d36b75be90c3c40b9ee6d9a0d81`  
SHA-256 policy: `7bc9d7b4900181d23fd071a355ed4ac5d805d70dbdd57ce795b52098846b1773`  
SHA-256 simulator: `c9a53a39d96d489df1aee28f62027d1ca21dd318e1b97729901c7384c18fe894`  
SHA-256 dataset: `ff617f14643a0ff42c918b2261754221529c407196b2badc10dddc0693f69d35`

## Implikasi pengembangan

Belum ada dasar untuk mengganti status WAIT dengan entry, meningkatkan risiko,
atau mempromosikan model ini sebagai strategi profit stabil. Prioritas berikutnya
adalah cakupan sesi historis yang dapat diverifikasi, hipotesis strategi baru
yang didokumentasikan **sebelum** evaluasi, dan bukti forward/paper trading yang
terikat versi. Periode test di atas sudah dilihat; jangan memakainya berulang
untuk tuning sambil tetap menyebutnya holdout baru.
