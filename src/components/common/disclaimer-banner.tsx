import { AlertTriangle } from 'lucide-react';
import { DISCLAIMER_TEXT } from '@/lib/constants';

export function DisclaimerBanner() {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {DISCLAIMER_TEXT}
        </p>
      </div>
    </div>
  );
}
