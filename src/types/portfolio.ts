import { MarketType } from './market';

export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  marketType: MarketType;
  type: 'buy' | 'sell'; // long or short
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  isOpen: boolean;
  closedPrice?: number;
  closedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface PortfolioSnapshot {
  date: string; // YYYY-MM-DD
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  positionCount: number;
}

export interface PortfolioSummary {
  totalInvested: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  closedPositions: number;
  winRate: number; // percentage of profitable closed positions
  bestPerformer: { symbol: string; pnlPercent: number } | null;
  worstPerformer: { symbol: string; pnlPercent: number } | null;
}
