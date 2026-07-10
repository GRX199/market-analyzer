import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = decodeURIComponent(rawSymbol).toUpperCase();
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

    // Safely extract values with fallbacks
    const trend = analysisData.trend || 'unknown';
    const signal = analysisData.signal || 'unknown';
    const confidence = analysisData.confidence || 0;
    const techScore = analysisData.technical?.score || 0;
    const macdSignal = analysisData.technical?.macd?.signal || 'unknown';
    const rsiValue = typeof analysisData.technical?.rsi?.value === 'number' 
      ? analysisData.technical.rsi.value.toFixed(2) 
      : 'N/A';
    const supportLevel = analysisData.supportLevel || 'N/A';
    const resistanceLevel = analysisData.resistanceLevel || 'N/A';
    const reasons = Array.isArray(analysisData.reasons) 
      ? analysisData.reasons.join('. ') 
      : 'No reasons provided';

    // Construct the prompt for Gemini
    const prompt = `You are an elite financial analyst and algorithmic trader.
Please write a concise, professional, and easily readable 1-2 paragraph summary of the current market conditions for the asset: ${symbol}.
Use the provided technical and fundamental analysis data to formulate your summary.
Do not list out stats mechanically; weave them into a narrative like a professional market report.
Keep it under 100 words. Focus on the most important indicators, trend, and the final verdict (Buy, Sell, or Neutral).

Data context:
- Asset: ${symbol}
- Trend: ${trend}
- Signal: ${signal}
- Confidence: ${confidence}%
- Technical Score: ${techScore}/100
- MACD Signal: ${macdSignal}
- RSI Value: ${rsiValue}
- Key Support: ${supportLevel}
- Key Resistance: ${resistanceLevel}
- Primary Reasons: ${reasons}`;

    // Initialize Gemini API inside the handler to ensure fresh key read
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Use gemini-2.0-flash (latest stable fast model)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({
      success: true,
      summary: text,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Summary Error:', errorMessage);
    return NextResponse.json(
      { success: false, error: `AI analysis failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
