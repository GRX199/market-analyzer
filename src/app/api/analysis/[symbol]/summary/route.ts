import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = rawSymbol.toUpperCase();
    const body = await request.json();
    
    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        success: true,
        summary: `Analysis summary for ${symbol} is temporarily unavailable because the AI API key is not configured. Please add GEMINI_API_KEY to your environment variables to enable AI-powered market summaries.`,
      });
    }

    const { analysisData } = body;
    
    if (!analysisData) {
      return NextResponse.json({ success: false, error: 'Analysis data is required' }, { status: 400 });
    }

    // Construct the prompt for Gemini
    const prompt = `
You are an elite financial analyst and algorithmic trader.
Please write a concise, professional, and easily readable 1-2 paragraph summary of the current market conditions for the asset: ${symbol}.
Use the provided technical and fundamental analysis data to formulate your summary.
Do not list out stats mechanically; weave them into a narrative like a professional market report.
Keep it under 100 words. Focus on the most important indicators, trend, and the final verdict (Buy, Sell, or Neutral).

Data context:
- Asset: ${symbol}
- Trend: ${analysisData.trend}
- Signal: ${analysisData.signal}
- Confidence: ${analysisData.confidence}%
- Technical Score: ${analysisData.technical?.score}/100
- ADX (Market Context): ${analysisData.technical?.adx?.trendStrength} ${analysisData.technical?.adx?.trendDirection}
- MACD Signal: ${analysisData.technical?.macd?.signal}
- RSI Value: ${analysisData.technical?.rsi?.value?.toFixed(2)}
- Key Support: ${analysisData.supportLevel}
- Key Resistance: ${analysisData.resistanceLevel}
- Primary Reasons: ${analysisData.reasons?.join('. ')}
`;

    // Select the model (gemini-1.5-flash is fast and good for text)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({
      success: true,
      summary: text,
    });
  } catch (error: any) {
    console.error('Error generating AI summary:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate AI summary', details: error.message },
      { status: 500 }
    );
  }
}
