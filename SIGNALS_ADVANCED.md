# Signals Advanced

Fitur analisis Forex, logam dan Crypto di `/signals`. Model `confluence-v4-structure-retest` terpisah dari strategi robot MT5. Mesin analisis tidak mengirim order atau mengubah risiko; tiket order manual yang sudah ada tetap memerlukan tindakan dan konfirmasi pengguna.

Audit v3 tersedia di [SIGNALS_VALIDATION.md](SIGNALS_VALIDATION.md), dan protokol serta hasil revisi v4 di [SIGNALS_V4_VALIDATION.md](SIGNALS_V4_VALIDATION.md).
Hasilnya **belum membuktikan profit konsisten**: sampel sangat kecil, XAU
validation negatif dan BTC test negatif setelah asumsi biaya. Unit test yang
lulus atau tampilnya Entry/SL/TP bukan bukti strategi profitable.

## Cara menggunakan

1. Masuk ke website, lalu buka **Signals**.
2. Pilih **Fokus XAUUSD**, **Fokus BTC**, atau instrumen dari daftar.
3. Pilih **Intraday (M15/H1/H4)** atau **Swing (H1/H4/D1)**. Ini horizon analisis website, bukan tombol pengganti mode robot.
4. Entry, SL, TP1 dan TP2 terlihat langsung di kartu scanner. Pilih hasil untuk melihat rencana manual, syarat konfirmasi, matriks timeframe, alasan keputusan, struktur dan ATR.
5. Periksa sumber harga, waktu candle, spread broker dan berita sebelum mempertimbangkan transaksi. Jangan menyalin level futures emas ke spot MT5.
6. Kartu dengan prioritas tertinggi muncul lebih dahulu: kandidat dengan quote broker yang masih lolos ditempatkan di atas kandidat referensi/spot, lalu skenario tunggu. Urutan ini hanya membantu triase, bukan probabilitas menang.
7. Pada panel level, pilih `BUY LIMIT`, `BUY STOP`, `SELL LIMIT`, atau `SELL STOP` untuk membuka tiket manual. Tiket memeriksa quote, sisi pending, volume, serta urutan SL/TP. **Salin template MT5** tidak mengirim order. **Kirim order** dapat mengantrekan order dari snapshot broker setelah konfirmasi akun/risiko; worker manual MT5 yang sesuai harus berjalan dan tetap memvalidasi ulang. Reference/spot tidak dapat dikirim langsung.
8. Panel **Kualitas pemicu entry** menampilkan level yang diuji, proporsi body, posisi close searah, dan jarak EMA20. Pada rencana yang memiliki penghalang, harga serta timeframe penghalang TP juga ditampilkan. Angka ini bukti aturan harga, bukan probabilitas profit.

Pemindaian mencakup katalog Forex/Crypto yang sudah ada, maksimal enam instrumen per halaman. XAU, BTC, EUR, ETH, GBP dan SOL diprioritaskan di halaman pertama. Pilih halaman berikutnya untuk instrumen lain; hasil tidak mengklaim memindai seluruh market sekaligus. Scanner klasik tetap tersedia untuk kemampuan lama termasuk saham. API klasik `/api/signals` dan pemakainya tidak diganti.

## Arti status

### Katalog tambahan — 16 September 2026

Katalog Signals kini memuat 36 Forex/metals dan 19 crypto:

- Forex tambahan: NZD/JPY, CAD/CHF, NZD/CAD, NZD/CHF, EUR/NZD, GBP/NZD.
- Crypto tambahan: BCH/USDT, TRX/USDT, SUI/USDT, NEAR/USDT, UNI/USDT, AAVE/USDT.
- Polygon aktif menggunakan POL/USDT, mengikuti [pengumuman pergantian MATIC ke POL Binance](https://www.binance.com/en/support/announcement/detail/619c4929fc3f4a0d9df7f9ae1d4519a5).
  Referensi MATIC lama tidak diubah menjadi POL diam-diam; histori/order lama tidak dimigrasikan.
- **Market populer lainnya** menyediakan 12 tombol akses cepat. Sumber harga
  yang dipilih pengguna tetap dipertahankan; daftar ini bukan ranking likuiditas/profit live.
- Pemeriksaan read-only Binance: ketujuh pair BCH/TRX/SUI/NEAR/UNI/AAVE/POL
  berstatus TRADING, dan masing-masing mengembalikan 319 candle final fresh
  pada M15/H1/H4. Ini pemeriksaan saat pengembangan, bukan jaminan feed selalu tersedia.
  TON belum ditambahkan karena status exchangeInfo saat pemeriksaan adalah BREAK.
- Instrumen Forex baru memerlukan snapshot MT5 milik pengguna, atau mode reference
  yang dipilih eksplisit. Tidak ada penggantian feed broker secara diam-diam.
  Belum memverifikasi bahwa setiap instrumen tersedia pada akun Exness pengguna.
- Pembaruan pengenal simbol pada sumber bridge tidak mengubah daftar simbol aktif,
  env, batas risiko, izin akun, atau worker yang sedang berjalan. Tidak membutuhkan migration.

### Status analisis

| Status | Makna |
| --- | --- |
| Kandidat setup | Semua aturan model terpenuhi pada candle selesai; bukan rekomendasi pasti menang atau instruksi order. |
| Tunggu | Data tersedia, tetapi setidaknya satu filter setup belum terpenuhi. |
| Konflik timeframe | Bias timeframe lebih tinggi berlawanan dengan timeframe pemicu. |
| Data basi | Setidaknya satu timeframe melewati masa berlaku; level entry disembunyikan. |
| Data belum cukup | Provider gagal, pemanasan kurang, data invalid, atau ada gap yang belum terverifikasi. Bukan sinyal netral. |

Antarmuka kini menyebut status terakhir **Data perlu diperiksa**, membedakannya dari **Tunggu konfirmasi**. Bila kualitas data gagal, alasan teknis didahulukan; RSI/ADX yang belum bisa dihitung tidak disebut sebagai filter strategi yang gagal.

## Pembaruan data broker — 9 September 2026

- `source=market`: MT5 untuk Forex/metals, Binance Spot USDT untuk crypto. Tidak ada fallback otomatis antarsumber.
- `source=mt5`: MT5 untuk semua instrumen, termasuk BTCUSDm/BTCUSDc. Kunci katalog BTC/USDT tetap dipakai untuk navigasi; label, quote, dan analisis menyebut BTC/USD CFD, **bukan konversi harga USD ke USDT**.
- `source=reference`: Yahoo hanya bila dipilih; futures dan USD referensi diberi label proxy.
- Detail menampilkan akun demo/real, server, bid/ask snapshot, spread harga dan timestamp. Snapshot bukan streaming tick. Akun real pada metadata berarti **sumber data real**, bukan izin robot real.
- Umur quote dan snapshot maksimal 180 detik. Expiry level adalah yang paling awal di antara expiry candle, quote dan snapshot; refresh tidak memperpanjang data lama.
- Jam tampilan memakai waktu server ditambah durasi request secara konservatif dan waktu yang berlalu. Perubahan jam PC ke belakang tidak memperpanjang sinyal. Masa berlaku diperiksa setiap detik dan ketika tab mendapat fokus kembali; expiry hilang/invalid tidak ditampilkan sebagai kandidat.
- Hasil privat terikat user yang meminta scan. Pergantian login langsung menyembunyikan snapshot user sebelumnya dan respons terlambat tidak dapat menggantikannya.
- Kandidat broker memiliki pemeriksaan R:R pada bid/ask snapshot, terpisah dari R:R kotor candle. Geometri memakai entry BUY pada Ask / SELL pada Bid dan pemicu SL/TP pada sisi penutupan sesuai [prinsip MT5](https://www.metatrader5.com/en/terminal/help/trading/general_concept). Entry lama diberi peringatan jika quote melampaui SL/TP1 atau R:R tersisa <1,5; SL/TP tidak digeser untuk membuat angka lebih menarik. Hasil yang masih muat hanya **review**, bukan izin transaksi; komisi, swap, slippage, lot/margin dan batas broker belum diverifikasi. Skenario bersyarat tidak memperoleh pemeriksaan seolah sudah terkonfirmasi.
- Perbaikan sesi Exness: native H4 berbeda dari H4 hasil agregasi Yahoo. Bucket MT5 hilang tidak dimaafkan jika sebagian bucket seharusnya buka. Kalender libur tidak diterapkan pada Binance/Yahoo/broker lain.
- Gap H1 XAU pada 7 Sep 2026 terverifikasi: [Exness Labor Day schedule](https://get.exness.help/hc/en-us/articles/17923046759836-Holiday-trading-hours) menyatakan tutup 18:28 UTC, close-only mulai 22:01:30, buka 22:05. Hanya bucket sepenuhnya di dalam penutupan yang dikecualikan; bukan mengabaikan seluruh tanggal. Sumber diperiksa 9 Sep WITA. Ini bukan kalender seluruh libur/maintenance mendatang.
- Panel **Feed MT5 untuk Signals** di Robot & Sistem membaca snapshot milik user via RLS. Feed segar tidak membuktikan robot ON. Campuran akun segar diberi peringatan.

Collector yang dipelihara berada di `tools/mt5/signal_market_bridge.py`; launcher lama di sibling `mt5-robot` diarahkan ke file ini. `.env` tetap berada di `mt5-robot`, tidak diunggah ke Git.

```powershell
# Dari folder market-analyzer — tidak ada order yang dikirim:
python tools/mt5/signal_market_bridge.py --dry-run --once
node tools/probe-signals.mjs
python tools/mt5/robot_audit.py
# Upload snapshot (token dan URL dari mt5-robot/.env):
python tools/mt5/signal_market_bridge.py --once
```

Default bridge mengirim enam simbol utama plus simbol konfigurasi yang suffix-nya cocok. `SIGNAL_MT5_SYMBOLS` dapat memilih 1–16 nama Market Watch yang eksplisit; instrumen tidak tersedia tidak diganti diam-diam. API masih menolak histori <250 bar di salah satu dari empat timeframe. Kegagalan satu simbol tidak menghentikan simbol lain; pergantian akun menghentikan collector. Log OK membutuhkan JSON pengakuan server, HTTP 409 dibedakan dari upload baru, kegagalan `--once` menghasilkan exit nonzero. Header/token tidak dicetak.

Tidak ada migration tambahan untuk pembaruan ini; memakai tabel snapshot dari migration 20260908000100. Perubahan lokal tetap perlu deploy sebelum berlaku online. `tools/mt5` memakai dependensi Python yang sama dengan robot; tidak termasuk runtime Python di Vercel.

## Rencana trading manual: kandidat vs bersyarat

Default horizon sekarang **Intraday (M15/H1/H4)**. Swing tetap dapat dipilih.

- **Kandidat terkonfirmasi**: aturan ketat sebelumnya tetap berlaku. Level dihitung dari close final dan struktur; bukan harga bid/ask terkini atau instruksi order.
- **Kandidat broker yang lolos quote**: pada sumber MT5, kartu hanya menampilkan Entry/SL/TP jika bid/ask snapshot masih segar, belum menembus perlindungan, dan R:R pada sisi quote masih minimal 1,5. Ringkasan memisahkan jumlah kandidat yang lolos pemeriksaan ini dari kandidat yang tertahan quote. Jika tertahan, level lama sengaja disembunyikan—muat ulang dan jangan mengejar harga lama.
- **Kandidat non-broker**: level tetap bersifat referensi. Crypto Binance Spot USDT dan reference/Yahoo harus dicocokkan ulang dengan bid/ask broker Anda; angka tersebut tidak memperoleh pemeriksaan quote MT5.
- **Tiket pending manual**: tersedia pilihan salin template atau kirim ke worker melalui `/api/trades/direct`. Quote broker wajib diisi dan entry harus berada pada sisi yang benar; SL/TP harus memenuhi geometri arah. Skenario conditional membutuhkan acknowledgement dan tetap harus menunggu candle konfirmasi + scan ulang, bukan otomatis menjadi kandidat.
- **BUY/SELL bersyarat — belum aktif**: ketika data tiga timeframe valid/fresh tetapi kandidat belum lolos, tampilkan level breakout yang bisa dipantau. Dua arah adalah alternatif, bukan dua order sekaligus. Konflik timeframe tidak diubah menjadi kandidat.
- Pemicu berada pada batas channel 20 bar dan pivot terdekat: BUY di atas maksimum resistance/channel/close, SELL di bawah minimum support/channel/close. Entry indikatif memakai buffer 0,1 ATR. Entry yang berjarak lebih dari 3 ATR dari close tidak ditampilkan.
- SL skenario bersyarat minimal 1,5 ATR di luar batas breakout. TP1 maksimal 2R, dibatasi pivot terdekat **setelah entry** dari ketiga timeframe; skenario dengan ruang kurang dari 1,5R tidak ditampilkan. TP2 3R hanya tersedia bila tidak melewati penghalang. Target tetap proyeksi; pemetaan terbatas pada jendela histori, bukan pengetahuan struktur masa depan.
- Tunggu candle timeframe pemicu selesai melewati batas, kemudian **pindai ulang** untuk memeriksa tren timeframe lebih tinggi, momentum dan ruang target. Jangan menggunakan proyeksi lama langsung sebagai order saat harga menyentuh pemicu.
- Rencana batal jika SL terlewati sebelum konfirmasi, feed basi, atau biaya/kondisi berita membuat risiko tidak layak. Data invalid/stale tidak menghasilkan skenario; UI juga menyembunyikannya saat kedaluwarsa.

Halaman menyediakan rencana bersyarat jika pemicu belum muncul tetapi data dan ruang target memadai. XAU pada mode market/MT5 memakai data broker dari bridge; **GC=F** hanya pada mode reference dan tidak boleh disalin sebagai level MT5.

Catatan historis 8 September 2026: feed GC=F pernah diblokir akibat gap yang belum terverifikasi. Bridge MT5 kemudian ditambahkan; catatan tersebut bukan status feed saat ini. Gangguan data tidak diperbaiki dengan mengganti harga broker menjadi harga proxy.

## Aturan kandidat yang dapat diaudit

- Hanya candle selesai, minimal 250 bar per timeframe. Waktu provider adalah awal bar; akhir dihitung dari durasi timeframe. Candle berjalan tidak dipakai untuk indikator/pemicu.
- OHLC harus positif, finite, koheren; duplikat, urutan mundur, tanggal masa depan dan OHLC parsial memblokir setup. Nilai O/H/L yang hilang tidak diganti dengan harga close.
- H4 dibentuk dari tepat empat candle H1 valid dan unik pada bucket UTC. Bucket tidak lengkap dibuang, tidak ditambal. Batas H4 UTC dapat berbeda dari broker MT5.
- Interval 50 bar terakhir diperiksa. Crypto diasumsikan kontinu. Forex memakai perkiraan weekend feed Yahoo bertanggal London; GC/SI memakai perkiraan sesi reguler New York, termasuk jeda pukul 17–18 dan weekend. Perbedaan durasi daily hanya diizinkan bila perubahan offset zona waktu menjelaskannya, bukan toleransi bebas satu jam. Ini **bukan kalender bursa lengkap**: libur, jeda khusus, sesi eksotik dan outage tidak dapat selalu dibedakan. Gap tak dikenal memblokir setup. Gap lebih lama tetap menjadi keterbatasan data pemanasan indikator.
- Masa berlaku: akhir candle terakhir + satu durasi timeframe + toleransi maksimum lima menit. Tidak diperpanjang otomatis ketika pasar tutup atau cache dibaca. Status basi bisa muncul setelah weekend sampai data final baru tersedia.
- Bias bullish: EMA50 di atas EMA200, EMA50 naik dibanding empat bar sebelumnya, close di atas EMA50. Bearish menggunakan kondisi cermin.
- Tren harus searah pada tiga timeframe. ADX Wilder periode 14 pada timeframe pemicu minimal 25; +DI > −DI untuk BUY, −DI > +DI untuk SELL. Ambang ini aturan heuristik, bukan bukti profitabilitas.
- Momentum: RSI Wilder periode 14 di antara 50–75 untuk buy, 25–50 untuk sell. Nilai datar=50, kenaikan satu arah=100, penurunan satu arah=0.
- Breakout: close melewati channel 20 bar sebelumnya + buffer 0,1 ATR, body searah ≥35% rentang, posisi close searah ≥65% rentang.
- Retest: sentuhan pertama setelah breakout berkualitas dalam enam candle final; toleransi sentuhan 0,25 ATR. Candle antara breakout dan retest tidak boleh menyentuh zona atau close kembali ke dalam. Candle retest harus kuat dan close melewati buffer; retest dalam/berulang bukan konfirmasi baru.
- Recovery: RSI melintasi 45 ke atas /55 ke bawah dalam tiga candle terakhir, lalu candle kuat menembus high/low candle sebelumnya dan melewati EMA20 searah tren. RSI pada keputusan tetap harus memenuhi filter momentum 50–75/25–50. Crossing saja tidak cukup.
- Tolak mengejar candle apabila jarak close terhadap EMA20 atau rentang candle lebih dari 2,5 ATR.
- Pivot support/resistance hanya terkonfirmasi setelah dua candle di kanan selesai. Level terdekat dicari dari jendela 122 bar terakhir dengan masing-masing dua bar konfirmasi di kiri dan kanan, tanpa harga masa depan.

### Skor dan level

Kesepakatan aturan = tren lintas timeframe 25 + RSI/DI 20 + konfirmasi entry 25 + ruang target 20 + kekuatan tren/jarak entry 10. BUY dan SELL menggunakan bobot yang sama. Skor 100 **bukan peluang menang 100%**; kelompok tersebut berasal dari data harga yang saling berkaitan. Kualitas/expiry data dan pemeriksaan quote broker tetap berlaku terpisah.

Entry kandidat memakai close final, bukan bid/ask yang bisa dieksekusi. SL minimal 1,5 ATR atau lebih jauh di luar low/high candle breakout, zona retest, atau empat candle recovery dengan buffer 0,2 ATR; jarak SL >3 ATR ditolak. Target pertama maksimal 2R, dibatasi pivot terdekat di depan entry pada **ketiga timeframe**, dengan buffer 0,1 ATR timeframe entry. Jika ruang kurang dari 1,5R, tidak ada rencana kandidat. Target lanjutan 3R hanya ditampilkan bila masih sebelum penghalang. R:R ini **kotor**; panel quote broker terpisah membandingkan entry Ask/Bid tanpa menggeser SL/TP, tetapi belum menghitung komisi, swap, slippage, lot atau margin.

Tidak ada asumsi volume spot Forex terpusat. Volume relatif hanya ditampilkan jika tersedia dan positif, tidak menambah skor arah. ATR adalah ukuran volatilitas, bukan arah atau jaminan level stop akan terisi tepat. [Panduan ATR Fidelity](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr).

## Sumber harga dan batas pemakaian

- `market=crypto` memakai candle Binance Spot USDT (mis. `BTCUSDT`) dan tetap menampilkan sumbernya; harga harus dicocokkan dengan broker sebelum entry.
- `market=forex` memakai snapshot candle/bid/ask MT5 melalui bridge read-only. Tanpa snapshot segar, instrumen ditandai unavailable—tidak diganti diam-diam dengan `GC=F` atau Yahoo.
- `source=reference` memilih Yahoo secara eksplisit. `GC=F` adalah futures emas, bukan spot XAU/USD MT5; `BTC-USD` adalah referensi USD, bukan Binance USDT atau CFD MT5.
- Hanya mode `source=reference` Forex yang memakai Yahoo tanpa spread/bid/ask broker. Mode MT5 tidak menggunakan kalender broker lain sebagai pengganti kalender sumber.
- Berita, kalender ekonomi, fundamental, order book dan sentimen tidak ditambahkan sebagai skor palsu/netral ketika data tidak tersedia.
- Chart aset dan Scanner klasik masih menggunakan mesin lama; jangan menganggap hasilnya identik dengan Advanced.

Model ini memiliki [audit retrospektif 90 hari](SIGNALS_VALIDATION.md) dengan periode terpisah dan asumsi biaya, tetapi belum memiliki bukti forward-test net-of-costs. Hasil audit belum membuktikan profit konsisten; jangan menyebut periode yang sudah dilihat sebagai holdout baru untuk tuning ulang. Tes kode memastikan aturan dan kegagalan data ditangani sesuai desain, **bukan membuktikan strategi profitable**. Validasi profit memerlukan biaya broker realistis dan evaluasi baru yang terikat versi. Tidak ada jaminan profit stabil/konsisten. [Peringatan CFTC mengenai sistem trading](https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/fraudadv_tradingsystem.html).

## Keandalan dan operasional

- Endpoint baru `GET /api/signals/advanced` mewajibkan sesi pengguna terverifikasi. Tidak ada secret atau data akun dalam respons.
- Parameter: `market=all|forex|crypto`, `horizon=intraday|swing`, `page=0…`, serta opsional `symbol`. Alias katalog `XAUUSD`, `BTCUSD`, `BTCUSDT` diterima; simbol sembarang ditolak.
- Respons bersifat `private, no-store`. Cache internal feed maksimal 48 entri, sukses 60 detik, error 10 detik; request identik yang masih berjalan digabung. Waktu analisis dihitung kembali agar cache tidak menghidupkan sinyal lama.
- Maksimal empat fetch aktif, 12 penunggu dengan deadline 20 detik, timeout fetch 12 detik; instance provider terpisah dari antrean legacy.
- Permintaan candle: M15 selama 7 hari, H1 selama 90 hari, D1 selama 730 hari; ketersediaan aktual bisa kurang. Pemanasan tetap wajib, tanpa fallback data rekaan.
- UI refresh 90 detik, timeout 45 detik, membatalkan request lama saat filter berubah, menolak respons yang tidak cocok, dan menyembunyikan level kedaluwarsa. Kegagalan baru tidak mempertahankan hasil lama seolah fresh.
- Snapshot broker memerlukan migration `supabase/migrations/20260908000100_add_signal_broker_snapshots.sql`, deploy website, lalu jalankan `signal_market_bridge.py` (atau `run_signal_bridge.bat`) pada PC/VPS yang terhubung ke terminal MT5. Bridge bersifat read-only dan tidak memanggil order API.
- Untuk audit histori read-only, bila ada lebih dari satu instalasi MT5, set `SIGNAL_MT5_TERMINAL_PATH` ke `terminal64.exe` yang sudah terbuka. Collector mencocokkan executable tersebut sebelum attach; tanpa path ia menolak kecuali tepat satu terminal berjalan. Ini tidak mengubah akun atau mengirim order.

## Verifikasi pengembangan

Halaman Robot Forex adalah preview terpisah, bukan Signals Advanced. Mulai perubahan lokal
15 September, preview menamai GC=F sebagai futures referensi, menggunakan pembacaan OHLC
ketat tanpa mengisi harga kosong, dan membedakan waktu buka/tutup candle. Kandidat
kedaluwarsa 120 detik setelah close; WAIT kedaluwarsa paling lambat 5 menit dari scan atau
close candle berikutnya + 90 detik. Level lama disembunyikan saat kedaluwarsa atau refresh
gagal/timeout 20 detik. Batas ini tidak mengubah konfigurasi atau guard robot MT5.
[Audit runtime robot](ROBOT_RUNTIME_VALIDATION.md) juga terpisah dari audit model Signals.

Jalankan `npm run check` untuk lint, type-check, seluruh tes dan build produksi. Suite Advanced memeriksa matematika indikator, candle final/gap/stale, H4 lengkap, BUY/SELL simetris, konflik timeframe, batas SL/TP, auth API, alias/cakupan seluruh katalog, timeout/semaphore/cache, dan kontrak pemisahan dari order robot.

Pemeriksaan data langsung pada 7 September 2026 menemukan feed XAU intraday terakhir masih 4 September dan timeout sebagian request BTC. Permintaan M15 kemudian diperkecil menjadi 7 hari; uji BTC berhasil mengembalikan 674 bar. Bar final tetap wajib melalui pemeriksaan kualitas. Data yang stale/unavailable tidak dianggap entry. Gangguan provider tidak membuktikan broker tutup dan bukan kegagalan strategi. Browser interaktif serta pengujian profitabilitas tidak termasuk validasi ini.
