import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Robot & Sistem',
  description: 'Status kesiapan website, antrean order, dan runtime robot demo.',
};

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
