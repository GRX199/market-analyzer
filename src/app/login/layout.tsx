import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke ruang kerja privat Market Analyzer.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
