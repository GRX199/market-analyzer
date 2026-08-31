'use client';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-background text-foreground">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-bold">Aplikasi mengalami gangguan</h1>
          <p className="text-sm text-muted-foreground">
            Operasi dihentikan dengan aman. Tidak ada order baru yang dikirim dari halaman ini.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">Referensi: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
