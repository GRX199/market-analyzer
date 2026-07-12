'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PortfolioPosition } from '@/types/portfolio';

interface AllocationChartProps {
  positions: PortfolioPosition[];
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', 
  '#ec4899', '#f43f5e', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="font-semibold text-sm">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          ${item.value.toLocaleString()} ({item.percentage}%)
        </p>
      </div>
    );
  }
  return null;
};

export function AllocationChart({ positions }: AllocationChartProps) {
  const openPositions = positions.filter(p => p.isOpen);

  if (openPositions.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
        No open positions to display
      </div>
    );
  }

  // Group by symbol and calculate value
  const grouped = openPositions.reduce<Record<string, number>>((acc, pos) => {
    const value = pos.quantity * pos.currentPrice;
    acc[pos.symbol] = (acc[pos.symbol] || 0) + value;
    return acc;
  }, {});

  const totalValue = Object.values(grouped).reduce((sum, v) => sum + v, 0);

  const data = Object.entries(grouped)
    .map(([symbol, value]) => ({
      name: symbol,
      value: parseFloat(value.toFixed(2)),
      percentage: totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : '0',
    }))
    .sort((a, b) => b.value - a.value);



  return (
    <div className="flex items-center gap-4">
      <div className="w-[180px] h-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 max-h-[180px] overflow-y-auto">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2 text-sm">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="font-medium truncate">{item.name}</span>
            <span className="ml-auto text-muted-foreground text-xs">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
