import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = decodeURIComponent(rawSymbol).toUpperCase();
    
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    
    // Check if API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
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

    const prompt = `You are an elite financial analyst and algorithmic trader.
Write a concise 1-2 paragraph professional market summary for ${symbol}.
Weave the data into a narrative. Keep it under 100 words.

Data: Trend=${trend}, Signal=${signal}, Confidence=${confidence}%, Tech Score=${techScore}/100, MACD=${macdSignal}, RSI=${rsiValue}, Support=${supportLevel}, Resistance=${resistanceLevel}. Reasons: ${reasons}`;

    const genAI = new GoogleGenerativeAI(apiKey);

    // Try models in order of preference (latest valid models first)
    const modelsToTry = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    
    let lastError = '';
    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({
          success: true,
          summary: text,
          model: modelName,
        });
      } catch (modelError: unknown) {
        lastError = modelError instanceof Error ? modelError.message : String(modelError);
        console.warn(`Model ${modelName} failed: ${lastError}`);
        continue; // Try next model
      }
    }

    // All models failed — return the error details so we can debug
    return NextResponse.json(
      { success: false, error: `All AI models failed. Last error: ${lastError}` },
      { status: 500 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI Summary Route Error:', errorMessage);
    return NextResponse.json(
      { success: false, error: `Server error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
