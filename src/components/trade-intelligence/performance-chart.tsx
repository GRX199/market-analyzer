'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { EquityPoint } from '@/lib/trade-intelligence/analytics';

function money(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function PerformanceChart({ data }: { data: EquityPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Kurva hasil akan muncul setelah posisi MT5 pertama ditutup.
      </div>
    );
  }

  const chartData = data.map((point, index) => ({
    ...point,
    index: index + 1,
    label: new Date(point.time).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="trade-profit-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="trade-drawdown-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.25} />
          <XAxis
            dataKey="index"
            axisLine={false}
            tickLine={false}
            minTickGap={24}
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => `#${value}`}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={64}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => money(value)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--popover))',
            }}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as { label?: string; symbol?: string } | undefined;
              return point ? `${point.label ?? ''} · ${point.symbol ?? ''}` : '';
            }}
            formatter={(value, name) => [
              money(Number(value ?? 0)),
              name === 'cumulativeProfit' ? 'P/L kumulatif' : 'Drawdown',
            ]}
          />
          <Area
            type="monotone"
            dataKey="cumulativeProfit"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#trade-profit-gradient)"
          />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="#f97316"
            strokeWidth={1.5}
            fill="url(#trade-drawdown-gradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
