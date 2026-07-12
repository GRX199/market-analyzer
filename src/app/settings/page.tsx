'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useUserStore } from '@/stores/user-store';
import { MarketSelector } from '@/components/market/market-selector';
import { Moon, Sun, Monitor, Bell, Shield, User, Save, CheckCircle, Download, Upload, Database } from 'lucide-react';
import { DisclaimerBanner } from '@/components/common/disclaimer-banner';

export default function SettingsPage() {
  const { theme, toggleTheme, user, setUser } = useUserStore();
  
  // Profile form state
  const [displayName, setDisplayName] = useState(user?.displayName || 'Admin');
  const [email, setEmail] = useState(user?.email || 'admin@marketanalyzer.app');
  const [saved, setSaved] = useState(false);

  const handleSaveProfile = () => {
    setUser({
      id: user?.id || 'local-user-1',
      email,
      username: displayName.toLowerCase().replace(/\s/g, '_'),
      displayName,
      avatarUrl: null,
      preferredMarket: user?.preferredMarket || 'crypto',
      theme: theme,
      disclaimerAccepted: true,
      disclaimerAcceptedAt: user?.disclaimerAcceptedAt || new Date().toISOString(),
      createdAt: user?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const handleExportData = () => {
    const data = localStorage.getItem('user-store');
    if (!data) return;
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
        const parsed = JSON.parse(content);
        if (parsed && parsed.state) {
          const { importData } = useUserStore.getState();
          importData(parsed.state);
          alert('Data imported successfully! The page will now reload.');
          window.location.reload();
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Failed to parse backup file.');
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
              <CardDescription>Your personal information. Data is stored locally in your browser.</CardDescription>
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
                  <p className="text-xs text-muted-foreground">Member since {new Date(user?.createdAt || "2026-01-01").toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
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
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                  />
                </div>
                <Button onClick={handleSaveProfile} className="gap-2">
                  {saved ? (
                    <>
                      <CheckCircle className="h-4 w-4" /> Saved!
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Profile
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
              <CardDescription>Configure how you receive alerts and updates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Price Alerts</Label>
                  <p className="text-sm text-muted-foreground">Receive push notifications when price targets hit.</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Signal Changes</Label>
                  <p className="text-sm text-muted-foreground">Get notified when an AI signal changes (e.g. Hold to Buy).</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Email Digest</Label>
                  <p className="text-sm text-muted-foreground">Receive a daily summary of market conditions.</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Data Management</CardTitle>
              <CardDescription>Export or import your locally stored data (portfolio, journal, watchlist).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Export Backup</p>
                  <p className="text-sm text-muted-foreground">Download a JSON file containing all your data.</p>
                </div>
                <Button onClick={handleExportData} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" /> Export JSON
                </Button>
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="font-medium">Import Backup</p>
                  <p className="text-sm text-muted-foreground text-red-500/80">Warning: This will overwrite your current data.</p>
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
              <CardDescription>Authentication is managed via Basic Auth in the proxy middleware.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Authentication</p>
                  <p className="text-sm text-muted-foreground">Protected via Basic Auth (configured in environment variables)</p>
                </div>
                <span className="text-xs font-medium text-green-500 bg-green-500/10 px-3 py-1 rounded-full">Active</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Risk Disclaimer</p>
                  <p className="text-sm text-muted-foreground">Accepted on {new Date(user?.disclaimerAcceptedAt || "2026-01-01").toLocaleDateString()}</p>
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
