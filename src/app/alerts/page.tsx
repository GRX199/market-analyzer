/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { EmptyState } from '@/components/common/empty-state';
import { useUserStore } from '@/stores/user-store';
import { Bell, Plus, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ALL_SYMBOLS } from '@/lib/constants';
import { Send, BellRing, Info, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AlertsPage() {
  const { alerts, addAlert, removeAlert, toggleAlert, telegramChatId, setTelegramChatId } = useUserStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tempChatId, setTempChatId] = useState(telegramChatId || '');
  const [notificationStatus, setNotificationStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  useEffect(() => {
    setTempChatId(telegramChatId || '');
  }, [telegramChatId]);

  const requestNotificationPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationStatus(permission);
      });
    }
  };

  const handleSaveTelegramId = () => {
    setTelegramChatId(tempChatId);
    // Could add a toast notification here
  };
  const [newAlert, setNewAlert] = useState({
    symbol: '',
    marketType: 'crypto' as 'crypto' | 'stocks' | 'forex',
    alertType: 'price_above' as 'price_above' | 'price_below' | 'signal_change',
    targetValue: '',
    targetSignal: 'strong_buy',
    timeframe: '1H',
  });
  const [openSymbol, setOpenSymbol] = useState(false);

  const handleCreateAlert = () => {
    if (!newAlert.symbol || !newAlert.targetValue) return;

    addAlert({
      id: Date.now().toString(),
      userId: 'local-user',
      symbol: newAlert.symbol.toUpperCase(),
      marketType: newAlert.marketType,
      alertType: newAlert.alertType,
      targetValue: newAlert.alertType === 'signal_change' ? null : parseFloat(newAlert.targetValue),
      targetSignal: newAlert.alertType === 'signal_change' ? newAlert.targetSignal : null,
      timeframe: newAlert.alertType === 'signal_change' ? newAlert.timeframe : null,
      isActive: true,
      isTriggered: false,
      triggeredAt: null,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
    });

    setIsDialogOpen(false);
    setNewAlert({ ...newAlert, symbol: '', targetValue: '' });
  };

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Price & Signal Alerts</h1>
          <p className="text-muted-foreground">Manage your notifications for specific market conditions.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          {/* @ts-expect-error asChild is used by Shadcn but Base UI might use render */}
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Create Alert
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Asset Symbol</label>
                <Popover open={openSymbol} onOpenChange={setOpenSymbol}>
                  {/* @ts-expect-error asChild is used by Shadcn but Base UI might use render */}
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openSymbol}
                      className="w-full justify-between font-normal"
                    >
                      {newAlert.symbol || "Select or type symbol..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search asset (e.g., BTC/USDT)..." onValueChange={(val) => setNewAlert({...newAlert, symbol: val.toUpperCase()})}/>
                      <CommandList>
                        <CommandEmpty>
                          Type custom symbol manually...
                        </CommandEmpty>
                        <CommandGroup>
                          {ALL_SYMBOLS.map((asset) => (
                            <CommandItem
                              key={asset.symbol}
                              value={asset.symbol}
                              onSelect={(currentValue) => {
                                setNewAlert({...newAlert, symbol: currentValue.toUpperCase(), marketType: asset.marketType as any});
                                setOpenSymbol(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newAlert.symbol.toUpperCase() === asset.symbol.toUpperCase() ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {asset.symbol} <span className="ml-2 text-xs text-muted-foreground line-clamp-1">{asset.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Market Type</label>
                <Select value={newAlert.marketType} onValueChange={(v: any) => setNewAlert({...newAlert, marketType: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select market" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="stocks">Stocks</SelectItem>
                    <SelectItem value="forex">Forex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Condition</label>
                <Select value={newAlert.alertType} onValueChange={(v: any) => setNewAlert({...newAlert, alertType: v})}>
                  <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price_above">Price goes above</SelectItem>
                    <SelectItem value="price_below">Price goes below</SelectItem>
                    <SelectItem value="signal_change">Signal changes to</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newAlert.alertType === 'signal_change' ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Timeframe</label>
                    <Select value={newAlert.timeframe} onValueChange={(v: any) => setNewAlert({...newAlert, timeframe: v})}>
                      <SelectTrigger><SelectValue placeholder="Select timeframe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15m">15 Minutes</SelectItem>
                        <SelectItem value="1H">1 Hour</SelectItem>
                        <SelectItem value="4H">4 Hours</SelectItem>
                        <SelectItem value="1D">1 Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Signal</label>
                    <Select value={newAlert.targetSignal} onValueChange={(v: any) => setNewAlert({...newAlert, targetSignal: v})}>
                      <SelectTrigger><SelectValue placeholder="Select target signal" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strong_buy">Strong Buy</SelectItem>
                        <SelectItem value="buy">Buy</SelectItem>
                        <SelectItem value="sell">Sell</SelectItem>
                        <SelectItem value="strong_sell">Strong Sell</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Price</label>
                  <Input 
                    type="number"
                    placeholder="e.g. 60000" 
                    value={newAlert.targetValue} 
                    onChange={e => setNewAlert({...newAlert, targetValue: e.target.value})}
                  />
                </div>
              )}
              
              <Button className="w-full" onClick={handleCreateAlert}>Save Alert</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card className="bg-card">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                <Send className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-lg leading-none">Telegram Bot</h3>
                <p className="text-sm text-muted-foreground">Receive instant alerts to your Telegram app.</p>
                
                <div className="flex gap-2 pt-2">
                  <Input 
                    placeholder="Enter Telegram Chat ID" 
                    value={tempChatId}
                    onChange={(e) => setTempChatId(e.target.value)}
                  />
                  <Button onClick={handleSaveTelegramId} variant={telegramChatId === tempChatId ? "secondary" : "default"}>
                    {telegramChatId === tempChatId ? 'Saved' : 'Save'}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded-md mt-2 flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Send any message to <strong>@userinfobot</strong> on Telegram to get your Chat ID.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-500/10 rounded-xl text-orange-500">
                <BellRing className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-lg leading-none">Browser Notifications</h3>
                <p className="text-sm text-muted-foreground">Get desktop pop-ups when the app is open.</p>
                
                <div className="pt-2">
                  {notificationStatus === 'granted' ? (
                    <Badge variant="default" className="bg-green-500/20 text-green-500 border-none px-3 py-1">
                      Enabled
                    </Badge>
                  ) : notificationStatus === 'denied' ? (
                    <Badge variant="destructive" className="px-3 py-1">
                      Blocked by Browser
                    </Badge>
                  ) : (
                    <Button onClick={requestNotificationPermission} variant="outline" className="w-full">
                      Enable Browser Alerts
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-bold mb-4">Active Alerts</h2>

      {alerts.length > 0 ? (
        <div className="space-y-4">
          {alerts.map(alert => (
            <Card key={alert.id} className="overflow-hidden">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    {alert.symbol}
                    <Badge variant="secondary" className="text-xs">{alert.marketType}</Badge>
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Alert when {alert.alertType.replace('_', ' ')} {alert.targetValue || alert.targetSignal}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {alert.isTriggered ? (
                    <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-none">
                      Triggered
                    </Badge>
                  ) : (
                    <Badge variant={alert.isActive ? "default" : "secondary"}>
                      {alert.isActive ? 'Active' : 'Paused'}
                    </Badge>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => toggleAlert(alert.id)} disabled={alert.isTriggered}>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => removeAlert(alert.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="No alerts set"
          description="You haven't set up any alerts. Create an alert to get notified when prices hit your targets or when AI signals change."
          action={
            <Button className="mt-4 gap-2" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Create First Alert
            </Button>
          }
        />
      )}
    </DashboardLayout>
  );
}
