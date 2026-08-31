'use client';

import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { NewsItem } from '@/types/analysis';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Newspaper, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ErrorState } from '@/components/common/error-state';
import { EmptyState } from '@/components/common/empty-state';

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/news?limit=20');
      const result: unknown = await response.json().catch(() => null);
      const row = typeof result === 'object' && result !== null
        ? result as Record<string, unknown>
        : {};
      if (!response.ok || row.success !== true || !Array.isArray(row.data)) {
        throw new Error(typeof row.error === 'string' ? row.error : 'Respons berita tidak valid.');
      }
      setNews(row.data as NewsItem[]);
    } catch (caughtError) {
      console.error('Failed to fetch news', caughtError);
      setError(caughtError instanceof Error ? caughtError.message : 'Berita gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = globalThis.setTimeout(() => void loadNews(), 0);
    return () => globalThis.clearTimeout(initialTimer);
  }, [loadNews]);

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'negative': return 'text-red-500 bg-red-500/10 border-red-500/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const SentimentIcon = ({ sentiment }: { sentiment: string }) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="h-3 w-3 mr-1" />;
      case 'negative': return <TrendingDown className="h-3 w-3 mr-1" />;
      default: return <Minus className="h-3 w-3 mr-1" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Market News &amp; Sentiment</h1>
        <p className="text-muted-foreground">Headline terbaru dari provider beserta simbol pasar terkait.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Berita belum dapat dimuat"
          message={error}
          onRetry={() => void loadNews()}
        />
      ) : news.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Belum ada berita"
          description="Provider tidak mengembalikan headline saat ini. Coba kembali beberapa saat lagi."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {news.map(item => (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="block outline-none">
              <Card className="h-full hover:border-blue-500/30 transition-colors cursor-pointer group">
                <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row gap-3 md:gap-4 h-full">
                  <div className="mt-1 flex-shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-blue-500/10 transition-colors">
                    <Newspaper className="h-5 w-5 text-muted-foreground group-hover:text-blue-500" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold line-clamp-2 leading-snug group-hover:text-blue-500 transition-colors">
                          {item.title}
                        </h3>
                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {item.summary}
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-auto pt-3 border-t gap-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{item.source}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.relatedSymbols.slice(0, 2).map(sym => (
                          <Badge key={sym} variant="outline" className="text-[10px]">{sym}</Badge>
                        ))}
                        {item.sentiment !== 'neutral' && (
                          <Badge variant="outline" className={`text-[10px] flex items-center capitalize ${getSentimentColor(item.sentiment)}`}>
                            <SentimentIcon sentiment={item.sentiment} />
                            {item.sentiment}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
