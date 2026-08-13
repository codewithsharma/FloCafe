/**
 * OpenTelemetry foundation for Opervia domain boundaries.
 *
 * Uses @opentelemetry/api only — no exporter/collector required.
 * Without a registered TracerProvider the API uses a no-op tracer,
 * so the system remains fully functional offline.
 *
 * Prioritized domains: POS, Order, Payment, Inventory, Tax, Authentication.
 */

import { context, trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

export type TraceDomain = 'pos' | 'order' | 'payment' | 'inventory' | 'tax' | 'authentication';

/** Canonical span names for major domain boundaries (use with withSpan). */
export const DOMAIN_SPAN = {
  authentication: {
    login: 'auth.login',
    recoverPassword: 'auth.recover_password',
  },
  order: {
    create: 'order.create',
    cancelItem: 'order.cancel_item',
  },
  payment: {
    prepareBatch: 'payment.prepare_batch',
    applyBatch: 'payment.apply_batch',
  },
  inventory: {
    decrement: 'inventory.decrement',
    adjust: 'inventory.adjust',
  },
  tax: {
    calculate: 'tax.calculate',
  },
  pos: {
    checkout: 'pos.checkout',
  },
} as const;

const SERVICE_NAME = 'opervia';

export function getTracer(domain: TraceDomain): Tracer {
  return trace.getTracer(`${SERVICE_NAME}.${domain}`, process.env.npm_package_version || '0.0.0');
}

/**
 * Run `fn` inside an active span. Errors are recorded and rethrown.
 * Safe with the default no-op provider (no external collector).
 */
export async function withSpan<T>(
  domain: TraceDomain,
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = getTracer(domain);
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      span.recordException(err instanceof Error ? err : new Error(message));
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Current trace id when a span is active; otherwise null. */
export function currentTraceId(): string | null {
  const span = trace.getSpan(context.active());
  if (!span) return null;
  const spanContext = span.spanContext();
  return spanContext.traceId || null;
}
