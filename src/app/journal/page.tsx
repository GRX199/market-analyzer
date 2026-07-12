'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useUserStore } from '@/stores/user-store';
import { JournalEntry, Emotion } from '@/types/user';
import { ALL_SYMBOLS } from '@/lib/constants';
import { BookOpen, Plus, Trash2, Calendar, Smile, Meh, Frown, AlertCircle, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

export default function TradingJournalPage() {
  const { journals, addJournal, removeJournal } = useUserStore();
  
  const [isComposing, setIsComposing] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    symbol: 'none',
    emotion: 'neutral' as Emotion,
  });

  const handleSave = () => {
    if (!form.title || !form.content) return;

    const entry: JournalEntry = {
      id: Date.now().toString(),
      title: form.title,
      content: form.content,
      symbol: form.symbol !== 'none' ? form.symbol : undefined,
      emotion: form.emotion,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addJournal(entry);
    setIsComposing(false);
    setForm({ title: '', content: '', symbol: 'none', emotion: 'neutral' });
  };

  const getEmotionIcon = (emotion: Emotion) => {
    switch (emotion) {
      case 'confident': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'greedy': return <Smile className="w-4 h-4 text-emerald-500" />;
      case 'neutral': return <Meh className="w-4 h-4 text-gray-500" />;
      case 'fearful': return <Frown className="w-4 h-4 text-orange-500" />;
      case 'frustrated': return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getEmotionColor = (emotion: Emotion) => {
    switch (emotion) {
      case 'confident': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'greedy': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'neutral': return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'fearful': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'frustrated': return 'bg-red-500/10 text-red-500 border-red-500/20';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <BookOpen className="w-7 h-7 text-primary" />
              Trading Journal
            </h1>
            <p className="text-muted-foreground mt-1">Reflect on your trades and psychology to improve over time.</p>
          </div>
          
          <Button onClick={() => setIsComposing(!isComposing)} className="gap-2">
            <Plus className="w-4 h-4" /> New Entry
          </Button>
        </div>

        {isComposing && (
          <Card className="border-primary/50 shadow-md">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <CardTitle className="text-lg">Write new entry</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <Input 
                placeholder="Title (e.g. Great entry on BTC, but closed too early)" 
                value={form.title}
                onChange={e => setForm({...form, title: e.target.value})}
                className="font-semibold"
              />
              <Textarea 
                placeholder="What happened? What did you feel? What will you do better next time?" 
                value={form.content}
                onChange={e => setForm({...form, content: e.target.value})}
                className="min-h-[150px]"
              />
              <div className="flex flex-wrap gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Related Asset (Optional)</label>
                  <Select value={form.symbol} onValueChange={(v: any) => v && setForm({...form, symbol: v})}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select asset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {ALL_SYMBOLS.map(s => (
                        <SelectItem key={s.symbol} value={s.symbol}>{s.symbol}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Primary Emotion</label>
                  <Select value={form.emotion} onValueChange={(v: any) => setForm({...form, emotion: v})}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select emotion" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confident">Confident</SelectItem>
                      <SelectItem value="greedy">Greedy / FOMO</SelectItem>
                      <SelectItem value="neutral">Neutral / Balanced</SelectItem>
                      <SelectItem value="fearful">Fearful / Anxious</SelectItem>
                      <SelectItem value="frustrated">Frustrated / Angry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2 border-t border-border/50 pt-4">
              <Button variant="ghost" onClick={() => setIsComposing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.title || !form.content}>Save Entry</Button>
            </CardFooter>
          </Card>
        )}

        <div className="space-y-4">
          {journals.length === 0 && !isComposing ? (
            <Card className="border-dashed py-12">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground opacity-20 mb-4" />
                <h3 className="font-semibold text-lg mb-1">Your journal is empty</h3>
                <p className="text-muted-foreground text-sm max-w-sm">The best traders track their psychology. Start writing your daily reflections to find patterns in your behavior.</p>
                <Button variant="outline" className="mt-4" onClick={() => setIsComposing(true)}>Write First Entry</Button>
              </CardContent>
            </Card>
          ) : (
            journals.map(entry => (
              <Card key={entry.id}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start gap-4 mb-3">
                    <div>
                      <h3 className="font-bold text-lg leading-tight">{entry.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(new Date(entry.createdAt), 'MMM dd, yyyy - HH:mm')}
                        </span>
                        {entry.symbol && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{entry.symbol}</Badge>
                        )}
                        <Badge variant="outline" className={`px-1.5 py-0 text-[10px] gap-1 ${getEmotionColor(entry.emotion)}`}>
                          {getEmotionIcon(entry.emotion)}
                          {entry.emotion.charAt(0).toUpperCase() + entry.emotion.slice(1)}
                        </Badge>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0"
                      onClick={() => removeJournal(entry.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {entry.content}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
