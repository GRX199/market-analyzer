import type { FinalizeTradeInput } from '@/lib/trading/validation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function matchesCommittedTerminalResult(
  row: unknown,
  requestedResult: FinalizeTradeInput
): boolean {
  if (!isRecord(row) || row.status !== requestedResult.status) {
    return false;
  }

  if (requestedResult.status === 'executed') {
    const executionPrice = Number(row.execution_price);
    const executedVolume = Number(row.executed_volume);
    return (
      Number.isFinite(executionPrice)
      && executionPrice === requestedResult.execution_price
      && Number.isFinite(executedVolume)
      && executedVolume === requestedResult.executed_volume
      && row.broker_order_ticket === requestedResult.broker_order_ticket
      && row.error_message === null
      && typeof row.executed_at === 'string'
    );
  }

  return (
    row.error_message === requestedResult.error_message
    && row.execution_price === null
    && row.executed_volume === null
    && row.broker_order_ticket === null
    && row.executed_at === null
  );
}
