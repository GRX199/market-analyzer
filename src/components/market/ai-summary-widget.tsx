'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Sparkles, Loader2 } from 'lucide-react';
import { FinalAnalysis } from '@/types/analysis';

interface AISummaryWidgetProps {
  symbol: string;
  analysis: FinalAnalysis;
}

export function AISummaryWidget({ symbol, analysis }: AISummaryWidgetProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [displayedText, setDisplayedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    // Only fetch once per analysis result
    if (hasFetchedRef.current) return;
    
    const fetchSummary = async () => {
      setLoading(true);
      setError(null);
      hasFetchedRef.current = true;
      
      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(symbol)}/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysisData: analysis }),
        });
        
        if (!response.ok) {
          try {
            const errData = await response.json();
            setError(errData.error || `AI service unavailable (${response.status})`);
          } catch {
            setError(`AI service unavailable (${response.status})`);
          }
          return;
        }

        const data = await response.json();
        
        if (data.success) {
          setSummary(data.summary);
          setIsTyping(true);
        } else {
          setError(data.error || 'Failed to fetch summary');
        }
      } catch (err) {
        setError('An unexpected error occurred while fetching AI summary');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [symbol, analysis]);

  // Typing effect
  useEffect(() => {
    if (!isTyping || !summary) return;

    let currentIndex = 0;
    const intervalId = setInterval(() => {
      setDisplayedText(summary.substring(0, currentIndex + 1));
      currentIndex++;

      if (currentIndex === summary.length) {
        clearInterval(intervalId);
        setIsTyping(false);
      }
    }, 15); // Adjust typing speed here (ms per character)

    return () => clearInterval(intervalId);
  }, [summary, isTyping]);

  return (
    <Card className="overflow-hidden border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 shadow-lg shadow-indigo-500/5 relative">
      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
        <Sparkles className="w-24 h-24" />
      </div>
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <div className="p-2 bg-indigo-500/20 text-indigo-500 rounded-lg">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <CardTitle className="text-lg">AI Market Analyst</CardTitle>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Powered by Gemini AI</p>
        </div>
      </CardHeader>
      <CardContent className="pt-2 min-h-[100px] flex items-center">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Synthesizing market data...</span>
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <div className="relative">
            <p className="text-sm leading-relaxed text-foreground/90">
              {displayedText}
              {isTyping && <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-500 animate-pulse align-middle" />}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
