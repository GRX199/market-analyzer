import { SentimentAnalysis, NewsItem } from '@/types/analysis';

export function analyzeSentiment(
  news: NewsItem[],
  socialScore?: number,
  fearGreedIndex?: number
): SentimentAnalysis {
  let score = 50;
  const reasons: string[] = [];

  // News Sentiment Analysis (max ±25 points)
  let newsSentimentScore = 50;
  if (news.length > 0) {
    let positiveWeight = 0;
    let negativeWeight = 0;

    news.forEach(item => {
      const multiplier = item.impact === 'high' ? 3 : item.impact === 'medium' ? 2 : 1;
      if (item.sentiment === 'positive') positiveWeight += multiplier;
      else if (item.sentiment === 'negative') negativeWeight += multiplier;
    });

    const totalWeight = positiveWeight + negativeWeight;
    if (totalWeight > 0) {
      // Scale to 0-100 where 50 is neutral
      newsSentimentScore = (positiveWeight / totalWeight) * 100;
      
      const newsImpact = (newsSentimentScore - 50) * 0.5; // max ±25
      score += newsImpact;

      if (newsSentimentScore > 75) {
        reasons.push('Highly positive recent news coverage.');
      } else if (newsSentimentScore > 60) {
        reasons.push('Generally positive news sentiment.');
      } else if (newsSentimentScore < 25) {
        reasons.push('Highly negative recent news coverage.');
      } else if (newsSentimentScore < 40) {
        reasons.push('Generally negative news sentiment.');
      }
    }
  } else {
    reasons.push('Insufficient news data for sentiment analysis.');
  }

  // Social/Alternative Data Score (max ±15 points)
  if (socialScore !== undefined) {
    const socialImpact = (socialScore - 50) * 0.3; // max ±15
    score += socialImpact;
    if (socialScore > 70) reasons.push('Strong positive social media momentum.');
    else if (socialScore < 30) reasons.push('Negative social media sentiment.');
  }

  // Fear & Greed Index (Crypto mainly) (max ±10 points)
  // Note: Extreme greed is often a bearish contrarian signal, and extreme fear a bullish one
  if (fearGreedIndex !== undefined) {
    if (fearGreedIndex > 85) {
      score -= 10;
      reasons.push('Extreme Greed: Market may be due for a correction.');
    } else if (fearGreedIndex > 70) {
      score += 5;
      reasons.push('Greed: Strong market momentum.');
    } else if (fearGreedIndex < 20) {
      score += 10;
      reasons.push('Extreme Fear: Potential capitulation / buying opportunity.');
    } else if (fearGreedIndex < 40) {
      score -= 5;
      reasons.push('Fear: Weak market momentum.');
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let overallSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (score > 60) overallSentiment = 'positive';
  else if (score < 40) overallSentiment = 'negative';

  if (reasons.length === 0) {
    reasons.push('Neutral market sentiment.');
  }

  return {
    overallSentiment,
    newsScore: newsSentimentScore,
    socialScore: socialScore || 50,
    fearGreedIndex,
    score,
    reasons
  };
}
