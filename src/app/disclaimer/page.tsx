import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, AlertTriangle } from 'lucide-react';
import { DISCLAIMER_TEXT } from '@/lib/constants';

export default function DisclaimerPage() {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Shield className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Risk Disclaimer</h1>
          <p className="text-muted-foreground">Important Information Regarding Trading Risks</p>
        </div>

        <Card className="border-amber-500/20">
          <CardContent className="p-8 prose prose-sm dark:prose-invert max-w-none">
            <div className="flex items-start gap-4 mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-1" />
              <p className="font-bold text-amber-500 m-0">
                {DISCLAIMER_TEXT}
              </p>
            </div>

            <h3>1. Educational Purpose Only</h3>
            <p>
              The Market Analyzer application, its AI-generated signals, analysis scores, support/resistance levels, and any other data provided are strictly for educational and informational purposes. They do NOT constitute financial advice, investment recommendations, or an endorsement to buy, sell, or hold any financial instrument.
            </p>

            <h3>2. High Risk Warning</h3>
            <p>
              Trading Forex, Stocks, Cryptocurrencies, and other financial instruments carries a high level of risk and may not be suitable for all investors. The high degree of leverage available in some markets can work against you as well as for you. Before deciding to invest or trade, you should carefully consider your investment objectives, level of experience, and risk appetite. You could sustain a loss of some or all of your initial investment. Do not invest money that you cannot afford to lose.
            </p>

            <h3>3. No Guarantees of Performance</h3>
            <p>
              Past performance of any trading system or methodology is not necessarily indicative of future results. The AI algorithms and technical indicators used in this application rely on historical data and probabilistic models, which cannot account for sudden market shocks, news events, or unforeseen black swan events. 
            </p>

            <h3>4. Independent Verification</h3>
            <p>
              You should always conduct your own independent research, verify all information, and seek advice from an independent, qualified financial advisor before making any investment decisions. 
            </p>

            <h3>5. Data Accuracy</h3>
            <p>
              While we strive to provide accurate and timely market data, the information is provided &quot;as is&quot;. We make no warranties, expressed or implied, regarding the accuracy, completeness, or reliability of the data, charts, or analysis provided. Data may be delayed or subject to errors.
            </p>

            <div className="mt-8 pt-6 border-t text-xs text-muted-foreground text-center">
              Last updated: {new Date("2026-07-01").toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
