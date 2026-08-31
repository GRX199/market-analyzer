'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-lg">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">Halaman mengalami gangguan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Operasi dihentikan dengan aman. Muat ulang segmen ini untuk mencoba kembali.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">Referensi: {error.digest}</p>
        )}
        <Button type="button" onClick={() => unstable_retry()} className="mt-6">
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Coba lagi
        </Button>
      </div>
    </main>
  );
}
