'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PortfolioSnapshot } from '@/types/portfolio';

interface PerformanceChartProps {
  history: PortfolioSnapshot[];
}

export function PerformanceChart({ history }: PerformanceChartProps) {
  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
        Performance data will appear after you add positions
      </div>
    );
  }

  const data = history.map(snap => ({
    date: new Date(snap.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: parseFloat(snap.totalValue.toFixed(2)),
    pnl: parseFloat(snap.totalPnl.toFixed(2)),
  }));

  const latestPnl = history[history.length - 1]?.totalPnl || 0;
  const gradientColor = latestPnl >= 0 ? '#22c55e' : '#ef4444';
  const lineColor = latestPnl >= 0 ? '#22c55e' : '#ef4444';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="font-semibold text-sm">
            ${payload[0]?.value?.toLocaleString()}
          </p>
          <p className={`text-xs ${payload[1]?.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            P&L: ${payload[1]?.value?.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={gradientColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={gradientColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#portfolioGradient)"
          />
          <Area type="monotone" dataKey="pnl" stroke="transparent" fill="transparent" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
