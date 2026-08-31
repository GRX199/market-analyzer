'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AlertCircle, Lock } from 'lucide-react';
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 text-primary">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Market Analyzer</h1>
          <p className="text-muted-foreground mt-2">Masuk ke ruang kerja trading privat Anda</p>
        </div>

        <Card className="border-border/50 shadow-2xl bg-card/50 backdrop-blur-xl">
          <form onSubmit={handleLogin}>
            <CardHeader>
              <CardTitle>Akses Aman</CardTitle>
              <CardDescription>Masukkan akun Supabase yang sudah terdaftar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert id="login-error" variant="destructive" className="py-2" role="alert" aria-live="assertive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs ml-2">{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@contoh.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby={error ? 'login-error' : undefined}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  aria-describedby={error ? 'login-error' : undefined}
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Memverifikasi…' : 'Masuk'}
              </Button>
            </CardFooter>
          </form>
        </Card>
        
        <p className="text-center text-xs text-muted-foreground mt-8">
          Sesi diverifikasi oleh Supabase dan dilindungi Row Level Security (RLS)
        </p>
      </div>
    </div>
  );
}
