# Audit runtime robot — 10 September 2026

**Profit stabil belum terbukti. Ini bukan izin real trading atau perubahan konfigurasi.**

Laporan ini menguji profil XAU H1, XAU M15 dan BTC H1 dari kode Python produksi
menggunakan dataset native Exness demo yang direkam 9 September. Model website
Signals memiliki [audit terpisah](SIGNALS_VALIDATION.md); hasil keduanya tidak
boleh dicampur. Tidak ada order, perubahan akun, risiko, ledger, atau proses robot.

## Hasil

Periode 90 hari: 11 Juni–9 September 2026, pukul 08:00 UTC. Pembagian waktu
60% development, 20% validation, 20% test; bukan holdout baru yang belum pernah
dilihat. Profil dan asumsi dibekukan sebelum membaca dataset, tanpa pencarian
parameter. Tabel berisi posisi simulasi yang sudah selesai, setelah asumsi biaya.

| Profil | Periode | Trade dasar | Net R dasar | Net R resimulasi biaya 2× | Net R transaksi sama + biaya tambahan |
| --- | --- | ---: | ---: | ---: | ---: |
| XAU H1 | development | 10 | −2,178 | −1,713 | −2,500 |
| XAU H1 | validation | 3 | +3,178 | +3,061 | +3,039 |
| XAU H1 | test | 3 | −0,596 | −0,636 | −0,672 |
| XAU M15 | development | 24 | +3,916 | +5,148 | +1,817 |
| XAU M15 | validation | 11 | +0,722 | +0,442 | −0,140 |
| XAU M15 | test | 7 | −1,190 | −1,379 | −1,781 |
| BTC H1 | development | 8 | −8,298 | 0 (tanpa trade) | −9,083 |
| BTC H1 | validation | 3 | +0,780 | 0 (tanpa trade) | +0,392 |
| BTC H1 | test | 2 | +1,929 | 0 (tanpa trade) | +1,825 |

`R` adalah unit risiko harga awal simulasi, bukan persen atau nominal profit akun.
BTC H1 total 13 trade sekitar **−5,589R**, meskipun dua trade tes terakhir positif.
XAU M15 total positif tetapi periode tes negatif dan validation negatif pada
transaksi sama dengan tambahan biaya. Tidak ada dasar menyebut hasil konsisten.

Posisi belum selesai tidak disembunyikan: XAU H1 development memiliki satu
posisi tersisa; termasuk nilai model pada akhir fold, net dasar menjadi −2,888R.
Validation juga menyisakan satu posisi; termasuk mark-to-market menjadi +6,102R.
Nilai ini bukan exit broker yang terealisasi. Profil/fold lain tidak menyisakan
posisi. Laporan menyimpan kedua tampilan dan seluruh trade.

Resimulasi biaya dapat memilih transaksi berbeda. XAU M15 development 2× hanya
22 trade, bukan 24; hasil lebih tinggi tidak berarti biaya memperbaiki strategi.
BTC 2× tidak masuk karena batas spread audit: nol trade bukan bukti bebas risiko.
Kolom transaksi sama mempertahankan entry/exit dasar lalu menambahkan biaya.

## Apa yang diaudit dan apa yang belum

- Memanggil fungsi sinyal produksi pada setiap indeks yang dievaluasi, memakai
  2.000 candle final terakhir; ATR memakai fungsi produksi. Cache hasil indeks
  dibagi antarskenario biaya, bukan menggunakan sinyal dari masa depan.
- Pengelolaan posisi dan eksekusi OHLC memakai mirror dalam
  `validate_forex_runtime_profiles.py`: entry setelah candle sinyal selesai,
  SL/TP ditambatkan ke quote sebelum slippage, stop-first ketika OHLC ambigu,
  gap fill merugikan dan pemisahan fold tanpa exit masa depan.
- Simulator BTC lama `research_crypto_broker_profiles.py` menambatkan SL/TP
  ke fill setelah slippage, berbeda dari gateway produksi. Audit ini tidak
  mewarisi asumsi tersebut. Perbedaan hasil antar-audit juga dipengaruhi periode
  dan biaya; jangan mengatribusikan seluruh perbedaan pada satu koreksi.
- Spread memakai bar yang sebelumnya sudah ditutup, dengan floor asumsi
  XAU 0,40 harga dan BTC 20 harga. Ini proxy kausal, bukan Ask tick historis.
- Forex: batas spread 0,02%, slippage 0,1 basis point per sisi, komisi pulang-pergi
  0,5 basis point. BTC: batas 0,05%, slippage 1 basis point per sisi, komisi
  pulang-pergi 2 basis point. Penahanan 1 basis point/hari secara proporsional
  waktu; stress menggandakan biaya. Satu basis point = 0,01%.
- **Biaya/spesifikasi adalah asumsi sensitivitas**, bukan tagihan Exness yang
  diverifikasi atau klaim konfigurasi worker saat ini. Stop-level floor nol,
  tanpa pembulatan digit/tick broker. Swap rollover/triple aktual, latency,
  minimum lot, margin, risk ledger, benturan Forex+Crypto dan penolakan broker
  tidak disimulasikan. Drawdown closed-R bukan floating/account drawdown.
- Audit ini memakai profil sumber tanpa memuat `.env`; bukan sertifikasi bahwa
  worker yang mungkin berjalan memakai parameter identik. Kondisi sesi historis
  dan data terminal juga belum mencakup audit kontinuitas tick penuh.
- EURJPY tidak ada dalam dataset ini. Audit 7 September tetap merupakan bukti
  terpisah: PF holdout EURJPY 1,044 turun ke 0,805 pada penalti biaya transaksi sama.
  Holdout XAU yang positif di jendela lama tidak menjamin hasil periode terbaru.

## Reproduksi offline

Jalankan dari folder website, dengan folder robot sibling yang sesuai hash sumber:

```powershell
# Optional for a new read-only Signals dataset when more than one MT5 installation exists.
# The path must already be running; this step contacts MT5 but never sends orders.
$env:SIGNAL_MT5_TERMINAL_PATH = 'C:\Program Files\MetaTrader 5\terminal64.exe'
node tools/run-signals-replay.mjs --mt5

# Offline robot runtime replay of the saved dataset used by this audit:
python tools/mt5/robot_runtime_replay.py --input local-reports/signals-dataset-2026-09-09T08-02-39-665Z.json
python -m unittest discover -s tools/mt5 -p 'test_*.py'
```

`SIGNAL_MT5_TERMINAL_PATH` hanya mengunci executable yang dibaca; collector
tetap tidak login, memilih akun, atau mengirim order. Jika variabel tidak diisi,
collector hanya mau melanjutkan ketika tepat satu proses `terminal64` terdeteksi.

Perintah replay tidak menghubungi MT5. Laporan asli:
`local-reports/robot-runtime-replay-20260910T114126044956Z.json`.
Dataset/laporan di-ignore Git; file keluaran baru memakai timestamp dan tulis
eksklusif agar bukti lama tidak ditimpa. Hash setiap modul produksi ada di laporan.

SHA-256 dataset: `ff617f14643a0ff42c918b2261754221529c407196b2badc10dddc0693f69d35`  
SHA-256 simulator: `58f12666c9863840804bee1dc089b7370ef0767b6b76a843ae26691794e5510a`

## Langkah riset berikutnya

Jangan menurunkan guard atau menaikkan lot untuk membuat hasil terlihat lebih baik.
Periode di atas sudah terungkap; hipotesis strategi berikutnya harus ditulis dan
dibekukan sebelum evaluasi baru. Butuh data forward/paper terikat versi, biaya
dan kualitas eksekusi aktual, serta pengujian portfolio/lot minimum sebelum
menarik kesimpulan kesiapan akun real. Profit tetap tidak dapat dijamin.
