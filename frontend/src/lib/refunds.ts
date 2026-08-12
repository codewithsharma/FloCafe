/**
 * M6.1 — Bill refund API client for Orders UI.
 *
 * Thin wrapper around POST /bills/:id/refund. Terminal id is attached via api
 * interceptor (terminal-id.ts). Idempotency-Key is required by the backend.
 */
import axios from 'axios';
import api from './api';

export interface BillRefundInput {
  amount?: number | string;
  method?: string;
  reason: string;
  override_pin: string;
}

export interface PostBillRefundOptions {
  idempotencyKey: string;
}

export function createRefundIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Typed wrapper for POST /bills/:id/refund. */
export async function postBillRefund(
  billId: number,
  body: BillRefundInput,
  options: PostBillRefundOptions,
): Promise<unknown> {
  const { data } = await api.post(`/bills/${billId}/refund`, body, {
    headers: { 'Idempotency-Key': options.idempotencyKey },
  });
  return data;
}

/**
 * Prefer the server's code-aware `{ error, code }` payload over generic axios text.
 */
export function extractRefundErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body && typeof body === 'object') {
      const code = (body as { code?: unknown }).code;
      const error = (body as { error?: unknown }).error;
      if (typeof error === 'string' && error.trim()) {
        return error;
      }
      if (typeof code === 'string' && code.trim()) {
        return code;
      }
    }
    if (typeof body === 'string' && body.trim()) return body;
    if (!err.response) return 'Unable to reach the server';
    return 'Refund failed';
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return 'Refund failed';
}
