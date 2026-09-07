# Signals Advanced

Fitur analisis referensi Forex, logam dan Crypto di `/signals`. Model `confluence-v1` ini terpisah dari strategi serta eksekusi robot MT5. Tidak mengirim order, mengubah lot, membuka akses akun real, atau mengubah batas risiko.

## Cara menggunakan

1. Masuk ke website, lalu buka **Signals**.
2. Pilih **Fokus XAUUSD**, **Fokus BTCUSD**, atau instrumen dari daftar.
3. Pilih **Intraday (M15/H1/H4)** atau **Swing (H1/H4/D1)**. Ini horizon analisis website, bukan tombol pengganti mode robot.
4. Pilih hasil untuk melihat matriks timeframe, alasan keputusan, struktur, ATR dan level referensi.
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

## Aturan yang dapat diaudit

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

- `XAU/USD` → Yahoo `GC=F`, **futures emas**, bukan spot XAUUSD MT5. `XAG/USD` → `SI=F`. Basis, rollover dan batas sesi dapat menghasilkan level berbeda. [Spesifikasi dan jam kontrak emas GC](https://www.schwab.com/futures/gold-futures).
- Simbol internal `BTC/USDT` → Yahoo `BTC-USD`; tampilan Advanced menyebut **BTC/USD**. Bukan harga Binance USDT atau CFD MT5. Konvensi internal dipertahankan agar navigasi lama tetap kompatibel.
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
- Tidak diperlukan migration Supabase, API key baru, perubahan `.env`, atau restart robot untuk fitur ini. Perubahan harus dipublikasikan terlebih dahulu agar muncul pada website online.

## Verifikasi pengembangan

Jalankan `npm run check` untuk lint, type-check, seluruh tes dan build produksi. Suite Advanced memeriksa matematika indikator, candle final/gap/stale, H4 lengkap, BUY/SELL simetris, konflik timeframe, batas SL/TP, auth API, alias/cakupan seluruh katalog, timeout/semaphore/cache, dan kontrak pemisahan dari order robot.

Pemeriksaan data langsung pada 7 September 2026 menemukan feed XAU intraday terakhir masih 4 September dan timeout sebagian request BTC. Permintaan M15 kemudian diperkecil menjadi 7 hari; uji BTC berhasil mengembalikan 674 bar. Bar final tetap wajib melalui pemeriksaan kualitas. Data yang stale/unavailable tidak dianggap entry. Gangguan provider tidak membuktikan broker tutup dan bukan kegagalan strategi. Browser interaktif serta pengujian profitabilitas tidak termasuk validasi ini.
