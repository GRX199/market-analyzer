import type { Metadata } from "next";
import "./globals.css";
import { AlertWatcher } from '@/components/common/alert-watcher';
import { ScalperRobotProvider } from '@/components/scalping/scalper-robot-provider';

export const metadata: Metadata = {
  title: {
    default: "Market Analyzer",
    template: "%s | Market Analyzer",
  },
  description: "Analisis pasar, kontrol risiko, backtest, dan automasi MT5 yang dijaga.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ScalperRobotProvider>
          <AlertWatcher />
          {children}
        </ScalperRobotProvider>
      </body>
    </html>
  );
}
