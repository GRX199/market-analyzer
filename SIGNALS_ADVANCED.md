# Signals Advanced

Fitur analisis referensi Forex, logam dan Crypto di `/signals`. Model `confluence-v2-manual` ini terpisah dari strategi serta eksekusi robot MT5. Tidak mengirim order, mengubah lot, membuka akses akun real, atau mengubah batas risiko.

## Cara menggunakan

1. Masuk ke website, lalu buka **Signals**.
2. Pilih **Fokus XAUUSD**, **Fokus BTCUSD**, atau instrumen dari daftar.
3. Pilih **Intraday (M15/H1/H4)** atau **Swing (H1/H4/D1)**. Ini horizon analisis website, bukan tombol pengganti mode robot.
4. Entry, SL, TP1 dan TP2 terlihat langsung di kartu scanner. Pilih hasil untuk melihat rencana manual, syarat konfirmasi, matriks timeframe, alasan keputusan, struktur dan ATR.
5. Periksa sumber harga, waktu candle, spread broker dan berita sebelum mempertimbangkan transaksi. Jangan menyalin level futures emas ke spot MT5.

Pemindaian mencakup katalog Forex/Crypto yang sudah ada, maksimal enam instrumen per halaman. XAU, BTC, EUR, ETH, GBP dan SOL diprioritaskan di halaman pertama. Pilih halaman berikutnya untuk instrumen lain; hasil tidak mengklaim memindai seluruh market sekaligus. Scanner klasik tetap tersedia untuk kemampuan lama termasuk saham. API klasik `/api/signals` dan pemakainya tidak diganti.

## Arti status

| Status | Makna |
| --- | --- |
| Kandidat setup | Semua aturan model terpenuhi pada candle selesai; bukan rekomendasi pasti menang atau instruksi order. |
| Tunggu | Data tersedia, tetapi setidaknya satu filter setup belum terpenuhi. |
| Konflik timeframe | Bias timeframe lebih tinggi berlawanan dengan timeframe pemicu. |
| Data basi | Setidaknya satu timeframe melewati masa berlaku; level entry disembunyikan. |
| Data belum cukup | Provider gagal, pemanasan kurang, data invalid, atau ada gap yang belum terverifikasi. Bukan sinyal netral. |

## Rencana trading manual: kandidat vs bersyarat

Default horizon sekarang **Intraday (M15/H1/H4)**. Swing tetap dapat dipilih.

- **Kandidat terkonfirmasi**: aturan ketat sebelumnya tetap berlaku. Level dihitung dari close final dan struktur; bukan harga bid/ask terkini atau instruksi order.
- **BUY/SELL bersyarat — belum aktif**: ketika data tiga timeframe valid/fresh tetapi kandidat belum lolos, tampilkan level breakout yang bisa dipantau. Dua arah adalah alternatif, bukan dua order sekaligus. Konflik timeframe tidak diubah menjadi kandidat.
- Pemicu berada pada batas channel 20 bar dan pivot terdekat: BUY di atas maksimum resistance/channel/close, SELL di bawah minimum support/channel/close. Entry indikatif memakai buffer 0,1 ATR. Entry yang berjarak lebih dari 3 ATR dari close tidak ditampilkan.
- SL skenario bersyarat berjarak 1,5 ATR; TP1 2R dan TP2 3R adalah **proyeksi aritmetis**, bukan target support/resistance yang sudah tervalidasi. Struktur setelah breakout belum dipetakan. Angka ini bukan peningkatan profitabilitas yang telah dibuktikan.
- Tunggu candle timeframe pemicu selesai melewati batas, kemudian **pindai ulang** untuk memeriksa tren timeframe lebih tinggi, momentum dan ruang target. Jangan menggunakan proyeksi lama langsung sebagai order saat harga menyentuh pemicu.
- Rencana batal jika SL terlewati sebelum konfirmasi, feed basi, atau biaya/kondisi berita membuat risiko tidak layak. Data invalid/stale tidak menghasilkan skenario; UI juga menyembunyikannya saat kedaluwarsa.

Halaman tidak lagi kosong hanya karena pemicu kandidat belum muncul, tetapi tetap tidak mengarang level ketika data gagal. Khusus XAU, semua angka tetap referensi **GC=F**, bukan level spot MT5 yang bisa langsung disalin.

Pemeriksaan feed langsung 8 September 2026: BTC intraday memiliki tiga timeframe fresh dan satu rencana bersyarat (bukan kandidat). GC=F masih diblokir: data intraday melompat dari 4 September malam UTC ke 8 September 04:00 UTC. Ini tidak diasumsikan sepenuhnya sebagai libur; rentang timestamp gap sekarang ditampilkan agar penyebab tidak adanya level jelas. Hasil pemindaian berikutnya dapat berubah. Dukungan feed spot MT5 yang kontinu belum ditambahkan pada perubahan ini.

## Aturan kandidat yang dapat diaudit

- Hanya candle selesai, minimal 250 bar per timeframe. Waktu provider adalah awal bar; akhir dihitung dari durasi timeframe. Candle berjalan tidak dipakai untuk indikator/pemicu.
- OHLC harus positif, finite, koheren; duplikat, urutan mundur, tanggal masa depan dan OHLC parsial memblokir setup. Nilai O/H/L yang hilang tidak diganti dengan harga close.
- H4 dibentuk dari tepat empat candle H1 valid dan unik pada bucket UTC. Bucket tidak lengkap dibuang, tidak ditambal. Batas H4 UTC dapat berbeda dari broker MT5.
- Interval 50 bar terakhir diperiksa. Crypto diasumsikan kontinu. Forex memakai perkiraan weekend feed Yahoo bertanggal London; GC/SI memakai perkiraan sesi reguler New York, termasuk jeda pukul 17–18 dan weekend. Perbedaan durasi daily hanya diizinkan bila perubahan offset zona waktu menjelaskannya, bukan toleransi bebas satu jam. Ini **bukan kalender bursa lengkap**: libur, jeda khusus, sesi eksotik dan outage tidak dapat selalu dibedakan. Gap tak dikenal memblokir setup. Gap lebih lama tetap menjadi keterbatasan data pemanasan indikator.
- Masa berlaku: akhir candle terakhir + satu durasi timeframe + toleransi maksimum lima menit. Tidak diperpanjang otomatis ketika pasar tutup atau cache dibaca. Status basi bisa muncul setelah weekend sampai data final baru tersedia.
- Bias bullish: EMA50 di atas EMA200, EMA50 naik dibanding empat bar sebelumnya, close di atas EMA50. Bearish menggunakan kondisi cermin.
- Tren harus searah pada tiga timeframe. ADX Wilder periode 14 pada timeframe pemicu minimal 25. ADX tidak menentukan arah; DI ditampilkan terpisah. Ambang ADX merupakan konvensi analisis, bukan bukti profitabilitas. [Penjelasan Fidelity tentang ADX](https://www.fidelity.com/viewpoints/active-investor/average-directional-index-ADX).
- Momentum: RSI Wilder periode 14 di antara 50–75 untuk buy, 25–50 untuk sell. Nilai datar=50, kenaikan satu arah=100, penurunan satu arah=0.
- Pemicu: close breakout channel 20 bar sebelumnya, atau RSI melintasi 45 ke atas /55 ke bawah dengan warna candle mendukung. Recovery tetap harus memenuhi filter momentum di atas pada candle yang sama.
- Tolak mengejar candle apabila jarak close terhadap EMA20 atau rentang candle lebih dari 2,5 ATR.
- Pivot support/resistance hanya terkonfirmasi setelah dua candle di kanan selesai. Level terdekat dicari dari jendela 122 bar terakhir dengan masing-masing dua bar konfirmasi di kiri dan kanan, tanpa harga masa depan.

### Skor dan level

Kesepakatan aturan = tren lintas timeframe 40 + momentum 25 + pemicu 35. BUY dan SELL menggunakan bobot yang sama. Skor 100 **bukan peluang menang 100%**. Ketiga kelompok juga bukan bukti statistik independen; semuanya berasal dari seri harga yang saling berkaitan. ADX, kualitas data, ekstensi dan ruang target adalah filter terpisah: skor tinggi belum tentu kandidat.

Entry referensi memakai close final, bukan bid/ask yang bisa dieksekusi. SL minimal 1,5 ATR atau lebih jauh di luar pivot dengan buffer 0,2 ATR; skenario ditolak jika jarak SL lebih dari 3 ATR. Target pertama maksimal 2R, dibatasi penghalang pivot terdekat dengan buffer 0,1 ATR. Jika ruang kurang dari 1,5R, tidak ada skenario entry. Target lanjutan 3R hanya ditampilkan bila masih sebelum penghalang. R:R adalah **kotor**, belum memperhitungkan biaya, spread, slippage, lot atau margin.

Tidak ada asumsi volume spot Forex terpusat. Volume relatif hanya ditampilkan jika tersedia dan positif, tidak menambah skor arah. ATR adalah ukuran volatilitas, bukan arah atau jaminan level stop akan terisi tepat. [Panduan ATR Fidelity](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr).

## Sumber harga dan batas pemakaian

- `market=crypto` memakai candle Binance Spot USDT (mis. `BTCUSDT`) dan tetap menampilkan sumbernya; harga harus dicocokkan dengan broker sebelum entry.
- `market=forex` memakai snapshot candle/bid/ask MT5 melalui bridge read-only. Tanpa snapshot segar, instrumen ditandai unavailable—tidak diganti diam-diam dengan `GC=F` atau Yahoo.
- `source=reference` memilih Yahoo secara eksplisit. `GC=F` adalah futures emas, bukan spot XAU/USD MT5; `BTC-USD` adalah referensi USD, bukan Binance USDT atau CFD MT5.
- Forex menggunakan feed referensi Yahoo, bukan spread/bid/ask broker. Jam broker, termasuk pair eksotik, bisa berbeda. [Contoh perbedaan sesi instrumen dan libur dari OANDA](https://www.oanda.com/us-en/trading/hours-of-operation/).
- Berita, kalender ekonomi, fundamental, order book dan sentimen tidak ditambahkan sebagai skor palsu/netral ketika data tidak tersedia.
- Chart aset dan Scanner klasik masih menggunakan mesin lama; jangan menganggap hasilnya identik dengan Advanced.

Model ini belum memiliki backtest out-of-sample atau bukti forward-test net-of-costs. Tes kode memastikan aturan dan kegagalan data ditangani sesuai desain, **bukan membuktikan strategi profitable**. Validasi profit memerlukan data broker yang sesuai, biaya realistis, pengujian periode terpisah dan evaluasi demo. Tidak ada jaminan profit stabil/konsisten. [Peringatan CFTC mengenai sistem trading](https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/fraudadv_tradingsystem.html).

## Keandalan dan operasional

- Endpoint baru `GET /api/signals/advanced` mewajibkan sesi pengguna terverifikasi. Tidak ada secret atau data akun dalam respons.
- Parameter: `market=all|forex|crypto`, `horizon=intraday|swing`, `page=0…`, serta opsional `symbol`. Alias katalog `XAUUSD`, `BTCUSD`, `BTCUSDT` diterima; simbol sembarang ditolak.
- Respons bersifat `private, no-store`. Cache internal feed maksimal 48 entri, sukses 60 detik, error 10 detik; request identik yang masih berjalan digabung. Waktu analisis dihitung kembali agar cache tidak menghidupkan sinyal lama.
- Maksimal empat fetch aktif, 12 penunggu dengan deadline 20 detik, timeout fetch 12 detik; instance provider terpisah dari antrean legacy.
- Permintaan candle: M15 selama 7 hari, H1 selama 90 hari, D1 selama 730 hari; ketersediaan aktual bisa kurang. Pemanasan tetap wajib, tanpa fallback data rekaan.
- UI refresh 90 detik, timeout 45 detik, membatalkan request lama saat filter berubah, menolak respons yang tidak cocok, dan menyembunyikan level kedaluwarsa. Kegagalan baru tidak mempertahankan hasil lama seolah fresh.
- Snapshot broker memerlukan migration `supabase/migrations/20260908000100_add_signal_broker_snapshots.sql`, deploy website, lalu jalankan `signal_market_bridge.py` (atau `run_signal_bridge.bat`) pada PC/VPS yang terhubung ke terminal MT5. Bridge bersifat read-only dan tidak memanggil order API.

## Verifikasi pengembangan

Jalankan `npm run check` untuk lint, type-check, seluruh tes dan build produksi. Suite Advanced memeriksa matematika indikator, candle final/gap/stale, H4 lengkap, BUY/SELL simetris, konflik timeframe, batas SL/TP, auth API, alias/cakupan seluruh katalog, timeout/semaphore/cache, dan kontrak pemisahan dari order robot.

Pemeriksaan data langsung pada 7 September 2026 menemukan feed XAU intraday terakhir masih 4 September dan timeout sebagian request BTC. Permintaan M15 kemudian diperkecil menjadi 7 hari; uji BTC berhasil mengembalikan 674 bar. Bar final tetap wajib melalui pemeriksaan kualitas. Data yang stale/unavailable tidak dianggap entry. Gangguan provider tidak membuktikan broker tutup dan bukan kegagalan strategi. Browser interaktif serta pengujian profitabilitas tidak termasuk validasi ini.
