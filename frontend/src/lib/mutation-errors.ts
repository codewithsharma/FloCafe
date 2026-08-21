/**
 * P14 — Classify mutation HTTP failures for offline/reconnect retry policy.
 * Transport/5xx may retry; 409 conflict and other permanent 4xx must not.
 */
export type MutationErrorClass = 'retryable' | 'conflict' | 'auth' | 'permanent';

function readStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const withResponse = err as { response?: { status?: number }; status?: number };
  if (typeof withResponse.response?.status === 'number') return withResponse.response.status;
  if (typeof withResponse.status === 'number') return withResponse.status;
  return undefined;
}

export function classifyMutationError(err: unknown): MutationErrorClass {
  const status = readStatus(err);
  if (status === 401 || status === 403) return 'auth';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 404 || status === 422) return 'permanent';
  if (
    status === undefined ||
    status === 0 ||
    status === 408 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500)
  ) {
    return 'retryable';
  }
  if (typeof status === 'number' && status >= 400 && status < 500) return 'permanent';
  return 'retryable';
}

/** Clear sticky POS attempts on conflict/auth/permanent; keep for transport retry. */
export function shouldClearMutationAttempt(classification: MutationErrorClass): boolean {
  return classification !== 'retryable';
}
