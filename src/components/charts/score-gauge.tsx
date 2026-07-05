'use client';

import { SignalType } from '@/types/analysis';
import { SIGNAL_COLORS, SIGNAL_LABELS } from '@/lib/constants';

interface ScoreGaugeProps {
  score: number;
  signal: SignalType;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ScoreGauge({ score, signal, size = 'md', showLabel = true }: ScoreGaugeProps) {
  const sizes = {
    sm: { container: 80, radius: 30, strokeWidth: 5, fontSize: 14, labelSize: 9 },
    md: { container: 140, radius: 55, strokeWidth: 8, fontSize: 24, labelSize: 12 },
    lg: { container: 200, radius: 80, strokeWidth: 10, fontSize: 36, labelSize: 14 },
  };

  const s = sizes[size];
  const circumference = 2 * Math.PI * s.radius;
  const arc = circumference * 0.75; // 270 degrees
  const offset = arc - (score / 100) * arc;
  const color = SIGNAL_COLORS[signal] || '#6366f1';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={s.container} height={s.container} viewBox={`0 0 ${s.container} ${s.container}`}>
        <circle
          cx={s.container / 2}
          cy={s.container / 2}
          r={s.radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/20"
          strokeWidth={s.strokeWidth}
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${s.container / 2} ${s.container / 2})`}
        />
        <circle
          cx={s.container / 2}
          cy={s.container / 2}
          r={s.radius}
          fill="none"
          stroke={color}
          strokeWidth={s.strokeWidth}
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(135 ${s.container / 2} ${s.container / 2})`}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
        <text
          x={s.container / 2}
          y={s.container / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={s.fontSize}
          fontWeight="bold"
          className="font-mono"
        >
          {score}
        </text>
        {showLabel && (
          <text
            x={s.container / 2}
            y={s.container / 2 + s.fontSize * 0.8}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize={s.labelSize}
            className="uppercase tracking-wider font-bold"
          >
            {SIGNAL_LABELS[signal] || signal}
          </text>
        )}
      </svg>
    </div>
  );
}
