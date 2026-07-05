'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUserStore } from '@/stores/user-store';
import { MarketSelector } from '@/components/market/market-selector';
import { Moon, Sun, Monitor, Bell, Shield, LogOut } from 'lucide-react';
import { DisclaimerBanner } from '@/components/common/disclaimer-banner';

export default function SettingsPage() {
  const { theme, toggleTheme, user } = useUserStore();

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
              <CardTitle className="flex items-center gap-2"><LogOut className="h-5 w-5" /> Account Profile</CardTitle>
              <CardDescription>Your personal information and session.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Email Address</p>
                  <p className="text-sm text-muted-foreground">{user?.email || 'demo@example.com'}</p>
                </div>
                <Button variant="outline">Sign Out</Button>
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

          {/* Legal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Legal & Compliance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Risk Disclaimer</p>
                  <p className="text-sm text-muted-foreground">Accepted on {new Date(user?.disclaimerAcceptedAt || Date.now()).toLocaleDateString()}</p>
                </div>
                <a href="/disclaimer">
                  <Button variant="outline">View Document</Button>
                </a>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
