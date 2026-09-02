import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Intelligence | Market Analyzer',
  description: 'Evaluasi hasil aktual robot MT5, risiko, biaya, dan kegagalan eksekusi.',
};

export default function TradeIntelligenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
