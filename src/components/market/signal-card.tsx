import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SignalType, RiskLevel } from '@/types/analysis';
import { TrendDirection } from '@/types/market';
import { SIGNAL_COLORS, SIGNAL_LABELS, RISK_LABELS, RISK_COLORS, TREND_COLORS } from '@/lib/constants';
import { ScoreGauge } from '@/components/charts/score-gauge';
import { TrendingUp, TrendingDown, Minus, Shield, AlertTriangle, Target } from 'lucide-react';

interface SignalCardProps {
  score: number;
  signal: SignalType;
  confidence: number;
  riskLevel: RiskLevel;
  trend: TrendDirection;
  reasons: string[];
  buyFactors?: string[];
  sellFactors?: string[];
  riskFactors?: string[];
  supportLevel?: number;
  resistanceLevel?: number;
  stopLoss?: number;
  takeProfit?: number;
  compact?: boolean;
}

export function SignalCard({
  score, signal, confidence, riskLevel, trend, reasons,
  buyFactors = [], sellFactors = [], riskFactors = [],
  supportLevel, resistanceLevel, stopLoss, takeProfit,
  compact = false,
}: SignalCardProps) {
  const TrendIcon = trend === 'bullish' ? TrendingUp : trend === 'bearish' ? TrendingDown : Minus;

  if (compact) {
    return (
      <Card className="overflow-hidden">
        <div
          className="h-1"
          style={{ backgroundColor: SIGNAL_COLORS[signal] }}
        />
        <CardContent className="p-4 flex items-center gap-4">
          <ScoreGauge score={score} signal={signal} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                className="text-xs font-bold"
                style={{ backgroundColor: SIGNAL_COLORS[signal] + '20', color: SIGNAL_COLORS[signal] }}
              >
                {SIGNAL_LABELS[signal]}
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <TrendIcon className="h-3 w-3" style={{ color: TREND_COLORS[trend] }} />
                {trend}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{reasons[0]}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-bold" style={{ color: SIGNAL_COLORS[signal] }}>{score}/100</p>
            <p className="text-[10px] text-muted-foreground">{confidence}% conf.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div
        className="h-1.5"
        style={{ backgroundColor: SIGNAL_COLORS[signal] }}
      />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Analysis Signal</CardTitle>
          <Badge
            className="text-sm font-bold px-3 py-1"
            style={{ backgroundColor: SIGNAL_COLORS[signal] + '20', color: SIGNAL_COLORS[signal] }}
          >
            {SIGNAL_LABELS[signal]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-6">
          <ScoreGauge score={score} signal={signal} size="md" />
          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Confidence</p>
              <p className="text-lg font-bold font-mono">{confidence}%</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Risk Level</p>
              <p className="text-lg font-bold" style={{ color: RISK_COLORS[riskLevel] }}>{RISK_LABELS[riskLevel]}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Trend</p>
              <div className="flex items-center gap-1">
                <TrendIcon className="h-4 w-4" style={{ color: TREND_COLORS[trend] }} />
                <p className="text-sm font-semibold capitalize" style={{ color: TREND_COLORS[trend] }}>{trend}</p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Score</p>
              <p className="text-lg font-bold font-mono" style={{ color: SIGNAL_COLORS[signal] }}>{score}/100</p>
            </div>
          </div>
        </div>

        {/* Reasons */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Analysis Summary</p>
          <ul className="space-y-1">
            {reasons.map((r, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: SIGNAL_COLORS[signal] }} />
                {r}
              </li>
            ))}
          </ul>
        </div>

        {/* Buy/Sell Factors */}
        {(buyFactors.length > 0 || sellFactors.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {buyFactors.length > 0 && (
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-green-500 mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Buy Factors
                </p>
                <ul className="space-y-1">
                  {buyFactors.map((f, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {f}</li>
                  ))}
                </ul>
              </div>
            )}
            {sellFactors.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-500 mb-2 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> Sell Factors
                </p>
                <ul className="space-y-1">
                  {sellFactors.map((f, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Risk & Levels */}
        {(riskFactors.length > 0 || supportLevel || resistanceLevel) && (
          <div className="grid grid-cols-2 gap-3">
            {riskFactors.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-500 mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Risk Warnings
                </p>
                <ul className="space-y-1">
                  {riskFactors.map((f, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {f}</li>
                  ))}
                </ul>
              </div>
            )}
            {(supportLevel || resistanceLevel || stopLoss || takeProfit) && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-blue-500 mb-2 flex items-center gap-1">
                  <Target className="h-3 w-3" /> Key Levels (Educational)
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm mt-3 pt-3 border-t">
                  {supportLevel ? <div><span className="text-muted-foreground">Support:</span> <span className="font-mono">{(supportLevel || 0).toFixed(4)}</span></div> : null}
                  {resistanceLevel ? <div><span className="text-muted-foreground">Resistance:</span> <span className="font-mono">{(resistanceLevel || 0).toFixed(4)}</span></div> : null}
                  {stopLoss ? <div><span className="text-red-400">SL:</span> <span className="font-mono">{(stopLoss || 0).toFixed(4)}</span></div> : null}
                  {takeProfit ? <div><span className="text-green-400">TP:</span> <span className="font-mono">{(takeProfit || 0).toFixed(4)}</span></div> : null}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
