# Forex News & Orders

Halaman `/forex-news` menampilkan kalender ekonomi forex, skenario dampak mata
uang, dan jadwal pending order (BUY/SELL LIMIT/STOP). Ini analisis makro berbasis
aturan, bukan model yang telah membuktikan keuntungan strategi news. Skenario
inflasi/kebijakan, revisi, dan rilis bersamaan dapat menghasilkan respons pasar
yang berlawanan. Tidak ada klaim profit atau eksekusi tepat milidetik rilis.

## Mengaktifkan fitur

1. Jalankan migration **`20260915000200_add_forex_news_schedules.sql`** di Supabase
   setelah migration direct order `20260915000100_add_direct_order_intents.sql`.
   Jangan jalankan file SQL dalam `tests/fixtures` pada database Anda.
2. Deploy website beserta API-nya. Gunakan flag yang sama dengan order Signals:
   `TRADING_ENABLED`, `TRADING_ALLOWED_USER_IDS`, `TRADING_WORKER_TOKEN`;
   akun real juga memerlukan `TRADING_REAL_ORDERS_ENABLED=true`.
   Migration baru wajib sebelum API claim versi ini digunakan.
3. Restart **worker manual versi terbaru** di Windows. Pilih salah satu launcher
   yang sesuai akun, bukan keduanya pada terminal/login yang sama:

   ```powershell
   & "C:\Users\hulkm\.gemini\antigravity\scratch\mt5-robot\run_manual_demo.bat"
   # Atau, hanya jika memakai profil REAL Standard Cent yang sudah disetujui:
   & "C:\Users\hulkm\.gemini\antigravity\scratch\mt5-robot\run_manual_real_cent.bat"
   ```

   Pastikan log `NEWS SCHEDULES ON` muncul, Algo Trading aktif, dan bridge
   memiliki snapshot segar untuk market yang dipilih. Worker strategi gabungan
   tidak menjalankan polling jadwal news. Jangan menambah worker kedua pada akun
   yang sama. Worker lama tidak bisa claim order news; deadline dan akun eksak
   wajib diperiksa oleh worker terbaru.
4. Buka **Forex News & Orders**, pilih event, lalu market dan akun. Isi level
   sendiri atau gunakan **Ambil level Signals MT5**. Tidak menggunakan GC=F,
   harga spot crypto, atau level buatan untuk order broker.
5. Pilih arah/jenis pending, lot, Entry, SL, TP, jeda 0–600 detik, dan syarat
   pengiriman. Periksa ringkasan dan konfirmasi. Tidak ada pembalikan arah atau
   pembesaran lot otomatis. Level teknikal dibekukan saat disimpan; bukan
   prediksi harga ketika news. Tinjau/cancel jadwal bila analisis berubah.
6. Setelah jadwal tersimpan, browser boleh ditutup; **Windows, MT5, worker, dan
   koneksi harus tetap berjalan**. Status online worker tidak dibuktikan hanya
   oleh halaman website. Periksa log dan tiket broker.

## Sumber dan syarat aktual

- Tanpa key tambahan: [kalender mingguan Forex Factory](https://www.forexfactory.com/calendar),
  memakai [weekly JSON export](https://nfs.faireconomy.media/ff_calendar_thisweek.json).
  Cache satu jam, jadwal dapat berubah. Export ini hanya menyediakan waktu,
  dampak, forecast, previous; tidak menyediakan aktual. Mode **pada waktu saya**
  tersedia, tetapi **aktual di atas/bawah forecast** dinonaktifkan.
- Opsional: isi **`TRADING_ECONOMICS_API_KEY`** di environment server website
  (Vercel atau `.env.local`), lalu deploy/restart. Jangan memakai `NEXT_PUBLIC_`
  dan jangan menaruh key di browser. Akun/paket provider harus mencakup akses
  [economic calendar](https://docs.tradingeconomics.com/economic_calendar/country/).
  Kode mengikuti [DateSpan dan waktu UTC provider](https://docs.tradingeconomics.com/economic_calendar/schema/).
  Latensi aktual bergantung paket provider, bukan jaminan realtime milidetik.
- Mode aktual membandingkan rilis pertama yang terbaca dan terverifikasi dengan
  **forecast yang Anda konfirmasi saat menjadwalkan**, bukan consensus yang
  direvisi kemudian. Nilai kosong, rentang, unit tidak cocok, dan data sebelum
  waktu rilis tidak boleh memicu order. Kejutan sesuai konsensus tidak memenuhi
  kondisi `>` maupun `<`. Jika aktual pertama tidak cocok, jadwal diblokir;
  revisi berikutnya tidak mengaktifkannya kembali.

## Waktu, status, dan pembatalan

- Semua waktu UI **WITA (UTC+8)**; penyimpanan UTC. Jam tampilan mengikuti jam
  server, bukan hanya jam perangkat. Jam Windows worker tetap harus sinkron.
- Polling scheduler sekitar 5 detik; cache aktual provider 15 detik; refresh
  tampilan 30 detik. Antrean/manual protection/HTTP/broker dapat menambah latensi.
- Jendela **pengiriman** maksimal 90 detik dari waktu pilihan Anda. Bila feed,
  snapshot, atau worker tidak siap, tidak ada entry susulan setelah deadline.
  Deadline diperiksa lagi persis sebelum `order_send` di worker. Broker masih
  dapat merespons setelah deadline karena latensi; pengiriman bukan fill.
- `Terjadwal` berarti instruksi tersimpan. `Masuk antrean` belum diterima MT5.
  `Diterima broker` berarti ticket pending/eksekusi diterima, **bukan bukti posisi
  sudah terisi**. Posisi dibuka bila kondisi harga pending tercapai.
- Pending yang telah diterima broker adalah **GTC**. Jendela 90 detik **tidak**
  membatalkan pending tersebut; kelola pembatalannya langsung di MT5.
- Tombol Batalkan mengunci row yang sama dengan dispatcher. Pembatalan tidak
  mengaku sukses jika order sudah masuk antrean. Retry jaringan memakai ID yang
  sama; jangan membuat jadwal baru ketika hasil permintaan lama belum pasti.
- Worker manual tetap memakai konfigurasi akun/risiko Anda yang ada, dan
  break-even/trailing posisi manual yang sudah tersedia. Fitur ini tidak
  mengubah izin real, risk limits, SL/TP, strategi otomatis, atau order aktif.
  Saat news, spread/slippage/gap dapat besar; SL bukan jaminan harga keluar.

`MANUAL_NEWS_SCHEDULES_ENABLED=false` pada environment worker menghentikan
polling jadwal baru. Ini **tidak** membatalkan jadwal tersimpan atau order yang
sudah berada di antrean/MT5. Gunakan pembatalan yang sesuai status.

## Verifikasi pengembangan

`npm test` mencakup model, decoding provider, timestamp/forecast, auth route,
dispatch, dan kontrak UI. `python -m unittest discover -s tests` pada robot
menguji deadline pra-kirim, akun eksak, recovery, polling non-blocking, serta
proteksi manual. Semua memakai fixture tanpa akses trading.

Uji browser terisolasi: `node tests/forex-news-browser.test.mjs` (memerlukan
Playwright dan Edge; `PLAYWRIGHT_TEST_MODULE` dapat menunjuk package bawaan).
Uji ini membundel komponen asli dengan akun/feed fixture, tanpa route produksi
atau koneksi broker; memeriksa desktop/mobile, level Signals, pemulihan respons
hilang/navigation, pembatalan, serta overflow. Screenshot di `.next/forex-news-ui`.

Uji PostgreSQL terpisah: buat cluster **disposable** di loopback port 55487,
user `news_test`, database `forex_news_test`; jalankan
`tests/fixtures/forex-news-database.sql`, lalu
`node tests/forex-news-postgres.integration.mjs`. Uji ini memverifikasi replay
migration, balapan cancel/dispatch, RLS, satu claim, worker lama, dan expiry
saat menunggu row lock. Jangan arahkan fixture ini ke Supabase/produksi.
