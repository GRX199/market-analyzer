'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

function getLoginErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Email atau password tidak cocok.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Email belum dikonfirmasi.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  }
  return 'Login gagal. Periksa koneksi dan kredensial Anda.';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // Successfully logged in
      router.replace('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen items-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -left-32 top-0 -z-10 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 -z-10 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/70 shadow-2xl shadow-slate-950/10 backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.42),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.22),transparent_36%)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <TrendingUp className="h-6 w-6 text-indigo-300" />
              </div>
              <div>
                <p className="font-semibold tracking-tight">Market Analyzer</p>
                <p className="text-xs text-slate-400">Private trading workspace</p>
              </div>
            </div>

            <div className="mt-16 max-w-lg">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-indigo-200">
                <Sparkles className="h-3.5 w-3.5" />
                Analisis, risiko, dan robot dalam satu tempat
              </div>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight">
                Kendalikan keputusan trading dengan konteks yang lebih lengkap.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">
                Pantau pasar lintas aset, validasi sinyal, uji strategi, dan periksa kesiapan robot demo tanpa berpindah aplikasi.
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-3 gap-3">
            {[
              { icon: BarChart3, label: 'Multi-market' },
              { icon: ShieldCheck, label: 'Risk-aware' },
              { icon: Bot, label: 'Robot control' },
            ].map((feature) => (
              <div key={feature.label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <feature.icon className="h-4 w-4 text-indigo-300" />
                <p className="mt-2 text-xs font-medium text-slate-200">{feature.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Market Analyzer</h1>
              <p className="mt-1 text-sm text-muted-foreground">Ruang kerja trading privat Anda</p>
            </div>

            <div className="mb-7 hidden lg:block">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Selamat datang kembali</h2>
              <p className="mt-2 text-sm text-muted-foreground">Masuk menggunakan akun Supabase yang sudah terdaftar.</p>
            </div>

            <Card className="border-0 bg-transparent shadow-none ring-0 backdrop-blur-none">
              <form onSubmit={handleLogin}>
                <CardHeader className="px-0 lg:hidden">
                  <CardTitle>Akses Aman</CardTitle>
                  <CardDescription>Masukkan akun Supabase yang sudah terdaftar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 px-0">
                  {error && (
                    <Alert id="login-error" variant="destructive" className="py-2" role="alert" aria-live="assertive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="ml-2 text-xs">{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="nama@contoh.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-describedby={error ? 'login-error' : undefined}
                      className="h-11 rounded-xl bg-background/70"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        aria-describedby={error ? 'login-error' : undefined}
                        className="h-11 rounded-xl bg-background/70 pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="mt-2 border-0 bg-transparent px-0">
                  <Button type="submit" size="lg" className="w-full rounded-xl shadow-lg shadow-primary/20" disabled={loading}>
                    {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {loading ? 'Memverifikasi…' : 'Masuk ke workspace'}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            <div className="mt-7 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Sesi terverifikasi · Row Level Security aktif
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
