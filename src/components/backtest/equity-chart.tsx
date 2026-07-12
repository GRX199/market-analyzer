'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface EquityChartProps {
  data: { time: number; value: number; drawdown: number }[];
}

export function EquityChart({ data }: EquityChartProps) {
  if (!data || data.length === 0) return null;

  const chartData = data.map(d => ({
    date: format(new Date(d.time), 'MMM dd, yyyy'),
    value: parseFloat(d.value.toFixed(2)),
    drawdown: parseFloat((d.drawdown * 100).toFixed(2))
  }));

  const startValue = chartData[0].value;
  const endValue = chartData[chartData.length - 1].value;
  const isProfit = endValue >= startValue;
  
  const gradientColor = isProfit ? '#22c55e' : '#ef4444';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="font-semibold text-sm">
            Equity: ${payload[0]?.value?.toLocaleString()}
          </p>
          <p className="text-xs text-red-500 mt-1">
            Drawdown: {payload[0]?.payload?.drawdown}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={gradientColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={gradientColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
          <XAxis 
            dataKey="date" 
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis 
            domain={['auto', 'auto']}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={gradientColor} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#equityGradient)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
