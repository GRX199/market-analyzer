'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, AlertCircle, Globe, Clock } from 'lucide-react';

// Mock Economic Data for prototype
const MOCK_EVENTS = [
  { id: 1, time: '08:30 AM', country: 'US', impact: 'High', event: 'Non-Farm Employment Change (NFP)', actual: '215K', forecast: '190K', previous: '175K' },
  { id: 2, time: '08:30 AM', country: 'US', impact: 'High', event: 'Unemployment Rate', actual: '3.8%', forecast: '3.9%', previous: '3.9%' },
  { id: 3, time: '10:00 AM', country: 'US', impact: 'Medium', event: 'ISM Manufacturing PMI', actual: '-', forecast: '50.1', previous: '49.8' },
  { id: 4, time: '04:00 AM', country: 'EU', impact: 'High', event: 'ECB Press Conference', actual: '-', forecast: '-', previous: '-' },
  { id: 5, time: '04:30 AM', country: 'UK', impact: 'Medium', event: 'Construction PMI', actual: '51.2', forecast: '50.5', previous: '49.7' },
  { id: 6, time: '09:30 PM', country: 'AU', impact: 'High', event: 'RBA Interest Rate Decision', actual: '4.35%', forecast: '4.35%', previous: '4.35%' },
];

export default function EconomicCalendarPage() {
  const [filterImpact, setFilterImpact] = useState('all');
  
  const filteredEvents = MOCK_EVENTS.filter(e => {
    if (filterImpact === 'all') return true;
    return e.impact.toLowerCase() === filterImpact;
  });

  const getImpactColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'medium': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'low': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <CalendarDays className="w-7 h-7 text-primary" />
              Economic Calendar
            </h1>
            <p className="text-muted-foreground mt-1">Track upcoming global economic events and their potential market impact.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={filterImpact} onValueChange={(v: any) => v && setFilterImpact(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter Impact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Impacts</SelectItem>
                <SelectItem value="high">High Impact</SelectItem>
                <SelectItem value="medium">Medium Impact</SelectItem>
                <SelectItem value="low">Low Impact</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                Today's Events ({new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })})
              </CardTitle>
              <Badge variant="outline" className="font-mono text-xs">UTC-4 (EST)</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Country</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Impact</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Event</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actual</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Forecast</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Previous</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => (
                    <tr key={event.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-4 px-4 font-mono text-xs whitespace-nowrap">{event.time}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          <span className="font-semibold">{event.country}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant="outline" className={getImpactColor(event.impact)}>
                          {event.impact}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 font-medium">{event.event}</td>
                      <td className={`py-4 px-4 text-right font-mono font-bold ${event.actual !== '-' ? (event.actual > event.forecast ? 'text-green-500' : 'text-red-500') : ''}`}>
                        {event.actual}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-muted-foreground">{event.forecast}</td>
                      <td className="py-4 px-4 text-right font-mono text-muted-foreground">{event.previous}</td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        No economic events match your filters today.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
