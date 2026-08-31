'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useUserStore } from '@/stores/user-store';
import { MarketSelector } from '@/components/market/market-selector';
import { Moon, Sun, Monitor, Bell, Shield, User, Save, CheckCircle, Download, Upload, Database } from 'lucide-react';
import { DisclaimerBanner } from '@/components/common/disclaimer-banner';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

export default function SettingsPage() {
  const {
    theme,
    toggleTheme,
    user,
    setUser,
    isAuthenticated,
    disclaimerAccepted,
    telegramChatId,
  } = useUserStore();
  
  // Profile form state
  const [displayName, setDisplayName] = useState(
    user?.displayName || user?.email?.split('@')[0] || '',
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const email = user?.email ?? '';

  const handleSaveProfile = async () => {
    const normalizedDisplayName = displayName.trim().replace(/\s+/g, ' ');
    if (!user || !isAuthenticated) {
      toast.error('Sesi belum terverifikasi. Muat ulang lalu coba lagi.');
      return;
    }
    if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 80) {
      toast.error('Nama tampilan harus berisi 2-80 karakter.');
      return;
    }

    const username = normalizedDisplayName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || null;

    setSaving(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          display_name: normalizedDisplayName,
          username,
        },
      });
      if (error) throw error;
      if (data.user?.id !== user.id) {
        throw new Error('Identitas sesi berubah saat profil disimpan.');
      }

      const updatedAt = new Date().toISOString();
      setDisplayName(normalizedDisplayName);
      setUser({
        ...user,
        username,
        displayName: normalizedDisplayName,
        theme,
        updatedAt,
      });
      setSaved(true);
      toast.success('Profil tersimpan di akun Supabase.');
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      toast.error('Profil gagal disimpan.', {
        description: error instanceof Error ? error.message : 'Kesalahan tidak diketahui.',
      });
    } finally {
      setSaving(false);
    }
  };

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const handleExportData = () => {
    const state = useUserStore.getState();
    if (!state.isAuthenticated || !state.authenticatedUserId) {
      toast.error('Sesi harus terverifikasi sebelum membuat backup.');
      return;
    }
    const data = JSON.stringify({
      version: 1,
      ownerUserId: state.authenticatedUserId,
      exportedAt: new Date().toISOString(),
      state: {
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        portfolioHistory: state.portfolioHistory,
      },
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `market-analyzer-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed: unknown = JSON.parse(content);
        const { importData } = useUserStore.getState();
        importData(parsed);
        toast.success('Preferensi dan histori snapshot lokal berhasil dipulihkan.');
      } catch (error) {
        toast.error('Backup tidak dapat diimpor.', {
          description: error instanceof Error ? error.message : 'Format JSON tidak valid.',
        });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences and account settings.</p>
        </div>

        <DisclaimerBanner />

        <div className="space-y-6">
          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Account Profile</CardTitle>
              <CardDescription>Nama profil disimpan pada metadata Supabase Auth; email mengikuti akun terverifikasi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar & Name */}
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-2xl font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <p className="text-lg font-semibold">{displayName || 'User'}</p>
                  <p className="text-sm text-muted-foreground">{email}</p>
                  {user?.createdAt && (
                    <p className="text-xs text-muted-foreground">Member since {new Date(user.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    readOnly
                    aria-readonly="true"
                    placeholder="Email akun belum tersedia"
                  />
                  <p className="text-xs text-muted-foreground">Email dikelola oleh penyedia autentikasi dan tidak diubah dari halaman ini.</p>
                </div>
                <Button
                  onClick={() => void handleSaveProfile()}
                  className="gap-2"
                  disabled={saving || !user || !isAuthenticated}
                >
                  {saved ? (
                    <>
                      <CheckCircle className="h-4 w-4" /> Saved!
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save Profile'}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" /> Preferences</CardTitle>
              <CardDescription>Customize your application experience.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Appearance</Label>
                  <p className="text-sm text-muted-foreground">Toggle between light and dark mode.</p>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-1">
                  <Button variant={theme === 'light' ? 'secondary' : 'ghost'} size="sm" onClick={() => theme === 'dark' && toggleTheme()} className="gap-2">
                    <Sun className="h-4 w-4" /> Light
                  </Button>
                  <Button variant={theme === 'dark' ? 'secondary' : 'ghost'} size="sm" onClick={() => theme === 'light' && toggleTheme()} className="gap-2">
                    <Moon className="h-4 w-4" /> Dark
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Default Market</Label>
                  <p className="text-sm text-muted-foreground">Which market to show when opening the app.</p>
                </div>
                <MarketSelector />
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
              <CardDescription>Delivery follows each active alert and the server-side Telegram allow-list.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Browser alerts</Label>
                  <p className="text-sm text-muted-foreground">Evaluated while this application is open. Activate or disable each rule on the Alerts page.</p>
                </div>
                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-500">Per alert</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Telegram delivery</Label>
                  <p className="text-sm text-muted-foreground">Requires a saved Chat ID plus matching server allow-lists. Missing configuration leaves scheduled alerts active.</p>
                </div>
                <span className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  telegramChatId
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-amber-500/10 text-amber-500',
                )}>
                  {telegramChatId ? 'Chat ID saved' : 'Not configured'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Data Management</CardTitle>
              <CardDescription>Backup lokal hanya mencakup preferensi dan histori snapshot portofolio untuk akun yang sama. Data utama tetap berada di Supabase.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Export Backup</p>
                  <p className="text-sm text-muted-foreground">Download preferensi dan maksimal 90 snapshot portofolio lokal.</p>
                </div>
                <Button onClick={handleExportData} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" /> Export JSON
                </Button>
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="font-medium">Import Backup</p>
                  <p className="text-sm text-muted-foreground text-amber-500/80">Hanya backup dengan owner UUID akun aktif yang diterima.</p>
                </div>
                <div>
                  <input
                    type="file"
                    id="import-file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImportData}
                  />
                  <Label htmlFor="import-file" className="cursor-pointer">
                    <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2">
                      <Upload className="w-4 h-4" /> Import JSON
                    </div>
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Security & Legal</CardTitle>
              <CardDescription>Authentication uses Supabase Auth sessions and database Row Level Security.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Authentication</p>
                  <p className="text-sm text-muted-foreground">Supabase session verified by the Next.js proxy and server routes</p>
                </div>
                <span className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  isAuthenticated
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-amber-500/10 text-amber-500',
                )}>
                  {isAuthenticated ? 'Verified' : 'Not verified'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Risk Disclaimer</p>
                  <p className="text-sm text-muted-foreground">
                    {disclaimerAccepted && user?.disclaimerAcceptedAt
                      ? `Accepted on ${new Date(user.disclaimerAcceptedAt).toLocaleDateString('id-ID')}`
                      : 'Not accepted for this account'}
                  </p>
                </div>
                <a href="/disclaimer">
                  <Button variant="outline" size="sm">View Document</Button>
                </a>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
