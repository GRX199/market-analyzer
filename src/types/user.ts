import { MarketType } from './market';

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  preferredMarket: MarketType;
  theme: 'dark' | 'light';
  disclaimerAccepted: boolean;
  disclaimerAcceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  symbol: string;
  marketType: MarketType;
  displayName: string;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface UserAlert {
  id: string;
  userId: string;
  symbol: string;
  marketType: MarketType;
  alertType: 'price_above' | 'price_below' | 'score_above' | 'score_below' | 'signal_change' | 'trend_change';
  targetValue: number | null;
  targetSignal: string | null;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
}

export interface UserNote {
  id: string;
  userId: string;
  symbol: string;
  marketType: MarketType;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
