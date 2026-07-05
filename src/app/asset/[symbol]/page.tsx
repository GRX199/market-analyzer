import { Suspense } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import AssetClientPage from './asset-client';

export default async function AssetPage(props: { params: Promise<{ symbol: string }> }) {
  const params = await props.params;
  const decodedSymbol = decodeURIComponent(params.symbol);

  return (
    <DashboardLayout>
      <Suspense fallback={<div className="p-8 text-center animate-pulse">Loading Asset Data...</div>}>
        <AssetClientPage symbol={decodedSymbol} />
      </Suspense>
    </DashboardLayout>
  );
}
