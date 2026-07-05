'use client';

import { useEffect, useRef, useCallback } from 'react';
import { OHLCV } from '@/types/market';

interface CandlestickChartProps {
  data: OHLCV[];
  height?: number;
  onCrosshairMove?: (price: number | null) => void;
}

export function CandlestickChart({ data, height = 400, onCrosshairMove }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const initChart = useCallback(async () => {
    if (!chartContainerRef.current) return;

    // Dynamic import for SSR safety
    const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');

    // Clean up existing chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        // Ignore "Object is disposed"
      }
      chartRef.current = null;
    }

    const isDark = document.documentElement.classList.contains('dark');

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#9ca3af' : '#6b7280',
        fontFamily: 'inherit',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const chartData = data
      .map(d => ({
        time: typeof d.time === 'string' ? d.time : (d.time > 1e10 ? Math.floor(d.time / 1000) : d.time) as any,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      .sort((a, b) => {
        if (a.time < b.time) return -1;
        if (a.time > b.time) return 1;
        return 0;
      })
      .filter((d, index, self) => index === 0 || d.time !== self[index - 1].time); // Deduplicate

    candleSeries.setData(chartData);

    // Volume histogram
    const volumeSeries = chart.addHistogramSeries({
      color: '#6366f1',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const volumeData = data
      .map(d => ({
        time: typeof d.time === 'string' ? d.time : (d.time > 1e10 ? Math.floor(d.time / 1000) : d.time) as any,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
      }))
      .sort((a, b) => {
        if (a.time < b.time) return -1;
        if (a.time > b.time) return 1;
        return 0;
      })
      .filter((d, index, self) => index === 0 || d.time !== self[index - 1].time); // Deduplicate

    volumeSeries.setData(volumeData);

    chart.timeScale().fitContent();

    if (onCrosshairMove) {
      chart.subscribeCrosshairMove((param: any) => {
        if (!param || !param.seriesData) {
          onCrosshairMove(null);
          return;
        }
        const data = param.seriesData.get(candleSeries);
        if (data) {
          onCrosshairMove((data as any).close);
        }
      });
    }

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch (e) {
        // Ignore "Object is disposed" error in React strict mode
      }
    };
  }, [data, height, onCrosshairMove]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.then(fn => fn?.());
    };
  }, [initChart]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full rounded-lg overflow-hidden"
      style={{ height }}
    />
  );
}
