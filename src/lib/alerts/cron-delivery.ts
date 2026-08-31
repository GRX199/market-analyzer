export interface NotificationDeliveryResponse {
  ok: boolean;
  status: number;
}

export class NotificationDeliveryError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Notification provider returned HTTP ${status}`);
    this.name = 'NotificationDeliveryError';
    this.status = status;
  }
}

export type ClaimedNotificationResult =
  | {
      processed: true;
      attempted: boolean;
    }
  | {
      processed: false;
      attempted: true;
      rollbackApplied: boolean;
      sendError: unknown;
      rollbackError?: unknown;
    };

interface SettleClaimedNotificationOptions {
  send?: () => Promise<NotificationDeliveryResponse>;
  rollback: () => Promise<boolean>;
}

/**
 * Callers may explicitly omit `send` only when another channel (for example a
 * browser notification) owns delivery. Background jobs must validate their
 * delivery channel before claiming a row. Once delivery is attempted, any
 * provider or network failure releases the claim so a later invocation can
 * retry. A transport timeout can occur after provider acceptance, so callers
 * must tolerate at-least-once delivery and possible duplicates.
 */
export async function settleClaimedNotification({
  send,
  rollback,
}: SettleClaimedNotificationOptions): Promise<ClaimedNotificationResult> {
  if (!send) {
    return { processed: true, attempted: false };
  }

  try {
    const response = await send();
    if (!response.ok) {
      throw new NotificationDeliveryError(response.status);
    }

    return { processed: true, attempted: true };
  } catch (sendError) {
    try {
      return {
        processed: false,
        attempted: true,
        rollbackApplied: await rollback(),
        sendError,
      };
    } catch (rollbackError) {
      return {
        processed: false,
        attempted: true,
        rollbackApplied: false,
        sendError,
        rollbackError,
      };
    }
  }
}
