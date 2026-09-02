# Market Analyzer

Dashboard Next.js 16 untuk analisis pasar, alert, portfolio simulasi, backtest, dan pengiriman sinyal yang dijaga ke robot MT5.

> Tidak ada strategi yang menjamin profit. Jalankan robot dalam mode dry-run/paper terlebih dahulu dan gunakan dana yang sanggup Anda tanggung jika hilang.

## Persyaratan

- Node.js 22.6 atau lebih baru.
- Project Supabase dengan migrasi pada `supabase/migrations`.
- Backend robot pada folder saudara `../mt5-robot` bila automasi MT5 diperlukan.

## Menjalankan dashboard

1. Salin `.env.example` menjadi `.env.local`.
2. Isi URL dan publishable/anon key Supabase.
3. Simpan seluruh key sensitif hanya pada variabel server.
4. Jalankan:

```powershell
npm ci
npm run dev
```

Dashboard tersedia pada `http://localhost:3000`.

Setelah login, buka `/operations` (menu **Robot & Sistem**) untuk melihat status
sesi, owner akun, kedua kill switch, token worker, integrasi opsional, dan 10
intent antrean terbaru. Halaman ini sengaja tidak memiliki tombol untuk
menjalankan proses lokal atau mengaktifkan Algo Trading MT5 dari browser.

## Menyalakan website dan robot demo dari awal

1. Login terminal MT5 ke akun **demo**, pastikan simbol tersedia, lalu aktifkan
   Algo Trading.
2. Jalankan website dengan `npm run dev`, login, lalu periksa halaman **Robot &
   Sistem**.
3. Untuk observasi chart/backtest tanpa order, biarkan `TRADING_ENABLED=false`
   dan `NEXT_PUBLIC_TRADING_ENABLED=false`.
4. Bila memang memulai uji order demo, samakan kedua flag menjadi `true`,
   restart website, dan pastikan semua pemeriksaan wajib di **Robot & Sistem**
   hijau. Runtime gabungan pengirim order demo memakai `TRADING_MODE=live`,
   tetapi wajib mempertahankan `ALLOW_REAL_MONEY_ACCOUNT=false` sehingga akun
   real tetap ditolak.
5. Dari folder saudara `../mt5-robot`, jalankan hanya
   `run_combined_demo.bat`. Runtime ini menserialkan siklus Forex dan Crypto
   pada satu login MT5; jangan jalankan worker terpisah untuk akun yang sama.

Status proses robot tidak dapat dibuktikan oleh browser karena robot berjalan
di proses Windows terpisah. Konfirmasi log startup robot, status Algo Trading,
serta akun/nomor login pada terminal MT5 sebelum mengaktifkan enqueue.

## Pemeriksaan wajib

```powershell
npm run lint
npm run type-check
npm test
npm run build
```

`npm run check` menjalankan seluruh pemeriksaan di atas secara berurutan. Build tidak mengabaikan error TypeScript.
Jalankan juga `npm audit` dan `npm audit --omit=dev` secara eksplisit sebelum
deploy; audit dependency tidak termasuk di dalam `npm run check`.

## Keamanan trading

- Browser tidak boleh menulis langsung ke antrean order.
- Pembuatan sinyal harus melalui Route Handler yang memvalidasi sesi, simbol, action, volume, dan idempotency key.
- Runtime scalper dipasang pada root layout, sehingga tombol Robot ON dan loop
  candle tetap hidup saat navigasi antarhalaman selama tab browser tetap
  terbuka. Menutup/refresh tab, logout, kehilangan koneksi, atau mematikan
  komputer tetap menghentikan atau menjeda runtime browser.
- `volume` adalah lot tepat yang diminta, bukan lagi batas yang boleh diturunkan
  diam-diam. Worker menolak order sebelum dikirim bila lot itu tidak sesuai
  langkah broker atau melewati batas risiko. `executed_volume` menyimpan volume
  aktual dari MT5 secara terpisah untuk mengaudit partial fill broker.
- `TRADING_ALLOWED_USER_IDS` harus berisi tepat satu UUID owner akun broker.
  Konfigurasi kosong, malformed, atau berisi lebih dari satu UUID ditolak.
- Robot mengklaim row owner tersebut secara atomik sebelum mengirim order ke
  broker; owner UUID menjadi argumen wajib RPC dan bagian filter SQL.
- Boundary HTTP worker menerima `limit=1` saja. Runtime crypto memang
  sequential agar satu hasil broker ambigu tidak meninggalkan batch row lain
  dalam status `processing`; batas internal RPC service-role tetap defensif.
- Endpoint worker wajib menerima bearer secret `TRADING_WORKER_TOKEN`; nilai
  kosong membuat claim/finalisasi gagal tertutup. Jangan pernah mengirim
  service-role key Supabase ke robot sebagai pengganti token ini.
- Finalisasi queue memakai `claimed_at` dan `attempts` sebagai fencing token,
  sehingga worker dari generasi klaim lama tidak dapat memfinalisasi klaim baru.
- Replay finalisasi dengan fence dan hasil terminal yang identik mengembalikan
  sukses. Hasil yang berbeda tetap ditolak agar response loss tidak mengubah
  audit broker.
- Key Supabase `service_role` hanya boleh berada pada backend/server dan harus segera dirotasi bila pernah masuk source, log, atau file contoh.
- `TRADING_ENABLED=false` menghentikan pembuatan intent dan claim baru, tetapi
  endpoint finalisasi tetap tersedia untuk merekam hasil broker yang sudah
  diterima. Flag ini tidak menutup posisi yang sudah terbuka.
- Auto-trading tetap dinonaktifkan bersama
  `NEXT_PUBLIC_TRADING_ENABLED=false` sampai migrasi terpasang serta robot lulus
  paper/demo test. Keduanya harus selaras saat diaktifkan.
- Gunakan secret acak minimal 32 karakter untuk `TRADING_WORKER_TOKEN` dan
  `CRON_SECRET`; placeholder ditolak.
- `TELEGRAM_ALLOWED_USER_IDS` menerima tepat satu UUID owner. Daftar
  `TELEGRAM_ALLOWED_CHAT_IDS` boleh comma-separated, tetapi satu entri malformed
  membuat seluruh konfigurasi notifikasi gagal tertutup.
- Alert dari browser tidak lagi menulis status atau mengirim Telegram langsung.
  Endpoint server memeriksa ulang harga provider, mengklaim alert dengan
  conditional update, lalu mengirim notifikasi. Cron dan browser memakai
  fencing yang sama agar hanya satu pihak menang.
- Notifikasi Telegram dikirim sebagai plain text. Timeout transport bersifat
  ambigu dan menggunakan semantik at-least-once: claim di-rollback secara
  kondisional, sehingga retry dapat menghasilkan notifikasi duplikat.
- Jangan menjalankan lebih dari satu proses robot pada login akun MT5 yang sama.
  Backend memakai OS lock per akun dan akan menolak proses kedua. Crypto dan
  Forex pada satu akun demo harus memakai runtime tunggal
  `../mt5-robot/robot_combined_demo.py`, yang menserialkan akses MT5.

`GEMINI_API_KEY` dan opsional `GEMINI_MODEL` hanya dipakai untuk ringkasan
analisis non-eksekusi. Input dibatasi dan ringkasan tidak digunakan sebagai
sinyal order atau janji profit.

## Deployment

Docker menggunakan Node.js 22 dan output standalone Next.js:

```powershell
docker build `
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co `
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key `
  --build-arg NEXT_PUBLIC_TRADING_ENABLED=false `
  --build-arg NEXT_PUBLIC_FINNHUB_API_KEY= `
  -t market-analyzer .
docker run --rm -p 3000:3000 --env-file .env.production market-analyzer
```

Variabel `NEXT_PUBLIC_*` dibekukan saat build. File `.env.production` dikecualikan
dari Docker build context dan hanya digunakan saat container berjalan untuk
secret server.

Untuk Vercel, konfigurasi `CRON_SECRET` agar endpoint cron hanya menerima
request dengan header `Authorization: Bearer <CRON_SECRET>`. Repository tidak
memaksakan jadwal cron karena frekuensi yang tersedia bergantung plan deploy.
Tambahkan schedule Vercel atau scheduler eksternal yang mengirim `GET
/api/cron/check-alerts` dengan bearer tersebut. Tanpa scheduler, price alert
masih dapat dipicu atomik saat aplikasi pengguna terbuka, tetapi auto-scanner
watchlist tidak berjalan di background. Pilih cadence sesuai quota provider
(misalnya lima menit), catat status HTTP/durasi setiap run, dan buat alarm untuk
gagal berulang atau tidak adanya heartbeat scheduler.

Terapkan migration sampai
`20260903000100_track_executed_trade_volume.sql`. Migration queue hingga
`20260801000400_enforce_single_inflight_trade.sql` wajib sebelum mengaktifkan
trading atau cron. Migration `003` menghapus overload claim tanpa owner, menambahkan
version fence scanner, dan mengamankan tabel legacy `signal_history`.
Migration `004` memaksa limit tepat satu, menahan advisory lock per owner,
menolak claim saat row owner itu masih `processing`, dan memasang unique partial
index sebagai pagar lintas proses/host.

Migration Trade Intelligence menambah tabel riwayat posisi tertutup yang hanya
dapat ditulis worker melalui endpoint server dan hanya dapat dibaca owner lewat
RLS. Setelah migration terpasang, restart runtime gabungan agar riwayat MT5
disinkronkan. Buka `/trade-intelligence` untuk melihat expectancy, profit
factor, drawdown, biaya, loss streak, performa simbol/strategi, dan kegagalan
antrean. Hasil analitik tidak mengubah strategi atau lot secara otomatis.

Migration volume eksekusi menambah `auto_trades.executed_volume`. Pasang
migration ini sebelum menjalankan worker versi baru agar finalisasi order dapat
merekam lot aktual broker dan halaman antrean dapat membandingkannya dengan lot
yang diminta.

Sebelum migration: matikan enqueue, worker, dan cron; buat backup; audit seluruh
row `processing`; lalu rekonsiliasi owner kosong, lebih dari satu row processing
per owner, dan duplikat `(user_id, idempotency_key)`. Terapkan lebih dahulu di
staging, verifikasi RLS/grant/signature RPC serta constraint/index, deploy
server dan worker yang cocok, kemudian hidupkan kembali secara bertahap. Jangan
mengubah row processing legacy menjadi `pending`; cocokkan dahulu dengan order,
deal, dan posisi broker.

## Struktur penting

- `src/app` — halaman dan Route Handlers.
- `src/lib` — analisis, Supabase, backtest, Trade Intelligence, serta aturan trading.
- `src/stores` — state client.
- `supabase/migrations` — schema, RLS, constraints, dan atomic queue claim.
- `../mt5-robot` — worker Python/MetaTrader 5.

Dokumentasi strategi harus diperlakukan sebagai hipotesis yang perlu diuji, bukan janji hasil. Evaluasi minimal harus memasukkan spread, slippage, komisi, latency, out-of-sample data, dan max drawdown.

Kalender ekonomi prototype yang sebelumnya berisi event hard-coded telah
dipensiunkan dari navigasi. Tambahkan kembali hanya setelah ada provider data
terverifikasi, timestamp/zona waktu yang jelas, serta penanganan data basi.
