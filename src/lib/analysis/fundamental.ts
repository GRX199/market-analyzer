import { MarketType } from '@/types/market';
import {
  FundamentalAnalysis,
  ForexFundamentals,
  StockFundamentals,
  CryptoFundamentals,
} from '@/types/analysis';

export function analyzeForexFundamentals(
  data: ForexFundamentals | null
): FundamentalAnalysis {
  let score = 50;
  const reasons: string[] = [];

  if (!data) {
    return {
      marketType: 'forex',
      data: {} as ForexFundamentals,
      score: 50,
      reasons: ['No fundamental data available.'],
    };
  }

  // Interest Rate Differential (max ±20 points)
  const rateDiff = data.baseInterestRate - data.quoteInterestRate;
  if (rateDiff > 2) {
    score += 20;
    reasons.push('Strong positive interest rate differential favors base currency.');
  } else if (rateDiff > 0.5) {
    score += 10;
    reasons.push('Positive interest rate differential.');
  } else if (rateDiff < -2) {
    score -= 20;
    reasons.push('Strong negative interest rate differential favors quote currency.');
  } else if (rateDiff < -0.5) {
    score -= 10;
    reasons.push('Negative interest rate differential.');
  }

  // Inflation (max ±15 points) - Lower inflation is generally better for currency value
  const inflationDiff = data.quoteInflation - data.baseInflation;
  if (inflationDiff > 2) {
    score += 15;
    reasons.push('Base currency has significantly lower inflation.');
  } else if (inflationDiff > 0.5) {
    score += 5;
    reasons.push('Base currency has lower inflation.');
  } else if (inflationDiff < -2) {
    score -= 15;
    reasons.push('Base currency has significantly higher inflation.');
  } else if (inflationDiff < -0.5) {
    score -= 5;
    reasons.push('Base currency has higher inflation.');
  }

  // GDP Growth (max ±10 points)
  const gdpDiff = data.baseGDP - data.quoteGDP;
  if (gdpDiff > 1) {
    score += 10;
    reasons.push('Base economy showing stronger growth.');
  } else if (gdpDiff < -1) {
    score -= 10;
    reasons.push('Quote economy showing stronger growth.');
  }

  // Unemployment (max ±5 points) - Lower is better
  const employmentDiff = data.quoteUnemployment - data.baseUnemployment;
  if (employmentDiff > 1) {
    score += 5;
    reasons.push('Base economy has stronger labor market.');
  } else if (employmentDiff < -1) {
    score -= 5;
    reasons.push('Quote economy has stronger labor market.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    marketType: 'forex',
    data,
    score,
    reasons,
  };
}

export function analyzeStockFundamentals(
  data: StockFundamentals | null
): FundamentalAnalysis {
  let score = 50;
  const reasons: string[] = [];

  if (!data) {
    return {
      marketType: 'stocks',
      data: {} as StockFundamentals,
      score: 50,
      reasons: ['No fundamental data available.'],
    };
  }

  // P/E Ratio (max ±20 points)
  if (data.peRatio > 0 && data.peRatio < 15) {
    score += 20;
    reasons.push('Stock is undervalued based on low P/E ratio.');
  } else if (data.peRatio >= 15 && data.peRatio < 25) {
    score += 5;
    reasons.push('P/E ratio is within normal historical ranges.');
  } else if (data.peRatio >= 35 || data.peRatio < 0) {
    score -= 15;
    reasons.push('High or negative P/E indicates expensive valuation or lack of earnings.');
  }

  // Revenue Growth (max ±15 points)
  if (data.revenueGrowth > 20) {
    score += 15;
    reasons.push('Exceptional revenue growth (>20%).');
  } else if (data.revenueGrowth > 5) {
    score += 5;
    reasons.push('Solid revenue growth.');
  } else if (data.revenueGrowth < 0) {
    score -= 15;
    reasons.push('Declining revenue is a major concern.');
  }

  // Profit Margin (max ±15 points)
  if (data.netProfitMargin > 20) {
    score += 15;
    reasons.push('Outstanding profit margins (>20%).');
  } else if (data.netProfitMargin > 10) {
    score += 5;
    reasons.push('Healthy profit margins.');
  } else if (data.netProfitMargin < 0) {
    score -= 15;
    reasons.push('Company is currently operating at a loss.');
  }

  // Debt to Equity (max ±10 points) - Lower is better
  if (data.debtToEquity < 0.5) {
    score += 10;
    reasons.push('Very healthy balance sheet with low debt.');
  } else if (data.debtToEquity > 2) {
    score -= 10;
    reasons.push('High debt burden increases financial risk.');
  }

  // ROE (Return on Equity) (max ±10 points)
  if (data.roe > 15) {
    score += 10;
    reasons.push('Excellent Return on Equity (>15%).');
  } else if (data.roe < 5) {
    score -= 5;
    reasons.push('Poor Return on Equity.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    marketType: 'stocks',
    data,
    score,
    reasons,
  };
}

export function analyzeCryptoFundamentals(
  data: CryptoFundamentals | null
): FundamentalAnalysis {
  let score = 50;
  const reasons: string[] = [];

  if (!data) {
    return {
      marketType: 'crypto',
      data: {} as CryptoFundamentals,
      score: 50,
      reasons: ['No fundamental data available.'],
    };
  }

  // Market Cap / FDV Ratio (max ±15 points)
  if (data.fullyDilutedValuation > 0) {
    const unlockRatio = data.marketCap / data.fullyDilutedValuation;
    if (unlockRatio > 0.8) {
      score += 10;
      reasons.push('Low inflation risk (most tokens are already circulating).');
    } else if (unlockRatio < 0.2) {
      score -= 15;
      reasons.push('High inflation risk (large upcoming token unlocks).');
    }
  }

  // Volume to Market Cap Ratio (max ±15 points)
  const volToMcap = data.volume24h / data.marketCap;
  if (volToMcap > 0.1) {
    score += 15;
    reasons.push('High trading volume indicates strong liquidity and interest.');
  } else if (volToMcap < 0.01) {
    score -= 10;
    reasons.push('Low trading volume suggests poor liquidity.');
  }

  // Developer Activity (max ±10 points)
  if (data.developerActivity > 80) {
    score += 10;
    reasons.push('Very high developer activity and ecosystem growth.');
  } else if (data.developerActivity < 20) {
    score -= 10;
    reasons.push('Low developer activity is a red flag for project longevity.');
  }

  // Whale Activity (max ±10 points)
  if (data.whaleActivity === 'accumulating') {
    score += 10;
    reasons.push('On-chain data shows large holders are accumulating.');
  } else if (data.whaleActivity === 'distributing') {
    score -= 10;
    reasons.push('On-chain data shows large holders are selling (distributing).');
  }

  // Exchange Flow (max ±10 points)
  if (data.exchangeFlow === 'outflow') {
    score += 10;
    reasons.push('Net exchange outflows suggest holding behavior (bullish).');
  } else if (data.exchangeFlow === 'inflow') {
    score -= 10;
    reasons.push('Net exchange inflows suggest intent to sell (bearish).');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    marketType: 'crypto',
    data,
    score,
    reasons,
  };
}

export function generateDefaultFundamentals(marketType: MarketType): FundamentalAnalysis {
  switch (marketType) {
    case 'forex':
      return analyzeForexFundamentals({
        baseCurrency: 'XXX', quoteCurrency: 'YYY',
        baseInterestRate: 5.0, quoteInterestRate: 4.5,
        baseInflation: 2.5, quoteInflation: 3.0,
        baseGDP: 2.1, quoteGDP: 1.8,
        baseUnemployment: 4.0, quoteUnemployment: 4.2,
        sentiment: 'neutral',
        economicEvents: [],
        currencyStrength: { base: 60, quote: 55 }
      });
    case 'stocks':
      return analyzeStockFundamentals({
        peRatio: 22, pbv: 3.5, eps: 4.2,
        revenueGrowth: 8.5, netProfitMargin: 12.4,
        debtToEquity: 1.1, roe: 14.5, dividendYield: 1.5,
        marketCap: 100000000000, quarterlyRevenue: [], newsHeadlines: []
      });
    case 'crypto':
      return analyzeCryptoFundamentals({
        marketCap: 1000000000, volume24h: 150000000,
        circulatingSupply: 1000000, totalSupply: 1000000, fullyDilutedValuation: 1000000000,
        developerActivity: 65, fearGreedIndex: 55, bitcoinDominance: 50,
        whaleActivity: 'neutral', exchangeFlow: 'neutral', newsHeadlines: []
      });
  }
}
