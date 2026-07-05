'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { EmptyState } from '@/components/common/empty-state';
import { useUserStore } from '@/stores/user-store';
import { Bell, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AlertsPage() {
  const { alerts } = useUserStore();

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Price & Signal Alerts</h1>
          <p className="text-muted-foreground">Manage your notifications for specific market conditions.</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Create Alert
        </Button>
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
                  <Button variant="ghost" size="icon">
                    <Settings className="h-4 w-4 text-muted-foreground" />
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
            <Button className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Create First Alert
            </Button>
          }
        />
      )}
    </DashboardLayout>
  );
}
