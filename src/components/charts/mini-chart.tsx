'use client';

import { useEffect, useRef } from 'react';
import { OHLCV } from '@/types/market';

interface MiniChartProps {
  data: OHLCV[];
  width?: number;
  height?: number;
  color?: string;
}

export function MiniChart({ data, width = 120, height = 40, color }: MiniChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const closes = data.slice(-30).map(d => d.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;

    const isUp = closes[closes.length - 1] >= closes[0];
    const lineColor = color || (isUp ? '#22c55e' : '#ef4444');

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();

    closes.forEach((close, i) => {
      const x = (i / (closes.length - 1)) * width;
      const y = height - ((close - min) / range) * (height - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, lineColor + '30');
    gradient.addColorStop(1, lineColor + '00');

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }, [data, width, height, color]);

  return <canvas ref={canvasRef} style={{ width, height }} className="rounded" />;
}
