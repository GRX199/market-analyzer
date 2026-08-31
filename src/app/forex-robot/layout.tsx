import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Robot Forex',
  description: 'Monitor strategi Forex M15 dan panduan runtime MT5 gabungan.',
};

export default function ForexRobotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
