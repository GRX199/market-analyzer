'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Shield } from 'lucide-react';
import { useUserStore } from '@/stores/user-store';
import { DISCLAIMER_TEXT } from '@/lib/constants';

export function DisclaimerModal() {
  const { disclaimerAccepted, acceptDisclaimer } = useUserStore();

  if (disclaimerAccepted) return null;

  return (
    <Dialog open={!disclaimerAccepted} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <Shield className="h-7 w-7 text-amber-500" />
          </div>
          <DialogTitle className="text-center text-xl">Risk Disclaimer</DialogTitle>
          <DialogDescription className="text-center">
            Please read and accept before continuing
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {DISCLAIMER_TEXT}
            </p>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={acceptDisclaimer} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
            I Understand and Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
