'use client';

import { useState } from 'react';
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

export default function AlertsPage() {
  const { alerts, addAlert, removeAlert, toggleAlert } = useUserStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAlert, setNewAlert] = useState({
    symbol: '',
    marketType: 'crypto' as 'crypto' | 'stocks' | 'forex',
    alertType: 'price_above' as 'price_above' | 'price_below' | 'signal_change',
    targetValue: '',
  });

  const handleCreateAlert = () => {
    if (!newAlert.symbol || !newAlert.targetValue) return;

    addAlert({
      id: Date.now().toString(),
      userId: 'local-user',
      symbol: newAlert.symbol.toUpperCase(),
      marketType: newAlert.marketType,
      alertType: newAlert.alertType,
      targetValue: parseFloat(newAlert.targetValue),
      targetSignal: null,
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
                <Input 
                  placeholder="e.g. BTC/USDT" 
                  value={newAlert.symbol} 
                  onChange={e => setNewAlert({...newAlert, symbol: e.target.value})}
                />
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price_above">Price goes above</SelectItem>
                    <SelectItem value="price_below">Price goes below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Price</label>
                <Input 
                  type="number" 
                  placeholder="e.g. 60000" 
                  value={newAlert.targetValue} 
                  onChange={e => setNewAlert({...newAlert, targetValue: e.target.value})}
                />
              </div>
              <Button className="w-full mt-4" onClick={handleCreateAlert}>
                Save Alert
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                  <Badge variant={alert.isActive ? "default" : "secondary"}>
                    {alert.isActive ? 'Active' : 'Paused'}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => toggleAlert(alert.id)}>
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
