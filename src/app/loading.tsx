import { LoaderCircle, TrendingUp } from 'lucide-react';

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6" role="status" aria-live="polite">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <TrendingUp className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2 font-semibold">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Memuat halaman
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Menyiapkan data yang diperlukan.</p>
      </div>
    </main>
  );
}
