/**
 * POS checkout coordinator (Phase 2.16).
 *
 * Thin HTTP orchestration seam for place-order / prepaid checkout.
 * Does NOT change request payloads. Does NOT own tax, inventory, or tender math.
 *
 * CURRENT DEBT: UI state, toast messaging, held-order cleanup, print triggers,
 * and prepaid discount reconciliation (GET order / replay bill) remain in
 * `frontend/src/app/(dashboard)/pos/page.tsx`. Further extract only when those
 * flows can move without a risky page rewrite.
 */

/** Minimal axios-like client (injected so tests can stub without bundling). */
/* eslint-disable @typescript-eslint/no-explicit-any -- axios seam stays intentionally loose */
export interface PosCheckoutApi {
  get: (url: string, config?: any) => Promise<{ data: any }>;
  post: (url: string, data?: any, config?: any) => Promise<{ data: any }>;
  patch: (url: string, data?: any, config?: any) => Promise<{ data: any }>;
}

export type PlacePostpaidInput =
  | {
      mode: 'create';
      body: Record<string, unknown>;
      idempotencyKey: string;
      /** When a prior attempt already created the order, skip the POST. */
      existingOrder?: { id: number; [key: string]: any };
    }
  | {
      mode: 'add-items';
      orderId: number | string;
      body: Record<string, unknown>;
      idempotencyKey: string;
    };

export interface PlacePostpaidResult {
  order: { id: number; order_number?: string; [key: string]: any };
}

/**
 * Postpaid place-order HTTP sequence: create order OR append items.
 * Payloads must match the historical page.tsx request bodies.
 */
export async function placePostpaidOrder(
  api: PosCheckoutApi,
  input: PlacePostpaidInput,
): Promise<PlacePostpaidResult> {
  if (input.mode === 'add-items') {
    const { data } = await api.post(`/orders/${input.orderId}/items`, input.body, {
      headers: { 'Idempotency-Key': input.idempotencyKey },
    });
    return { order: data.order };
  }

  if (input.existingOrder) {
    return { order: input.existingOrder as PlacePostpaidResult['order'] };
  }

  const { data } = await api.post('/orders', input.body, {
    headers: { 'Idempotency-Key': input.idempotencyKey },
  });
  return { order: data.order };
}

export interface PlacePrepaidParams {
  orderBody: Record<string, unknown>;
  orderIdempotencyKey: string;
  existingOrder?: { id: number; [key: string]: any };
  /** When set, PATCH /orders/:id/discount before bill generate. */
  discountBody?: Record<string, unknown> | null;
  existingBill?: { id: number; [key: string]: any };
  paymentBody: { payments: unknown[]; customer_id?: unknown };
  paymentIdempotencyKey: string;
  onOrderCreated?: (order: { id: number; [key: string]: any }) => void;
  onBillCreated?: (
    order: { id: number; [key: string]: any },
    bill: { id: number; [key: string]: any },
  ) => void;
}

export interface PlacePrepaidResult {
  order: { id: number; order_number?: string; [key: string]: any };
  bill: { id: number; payment_status?: string; balance?: number; [key: string]: any };
  paymentData: {
    bill?: PlacePrepaidResult['bill'];
    loyaltyPointsEarned?: number;
    [key: string]: any;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Prepaid checkout HTTP sequence: order → optional discount → bill → payments.
 * Callers keep retry/discount reconciliation; this only issues the mutations.
 */
export async function placePrepaidOrder(
  api: PosCheckoutApi,
  params: PlacePrepaidParams,
): Promise<PlacePrepaidResult> {
  let order = params.existingOrder;
  if (!order) {
    const { data } = await api.post('/orders', params.orderBody, {
      headers: { 'Idempotency-Key': params.orderIdempotencyKey },
    });
    order = data.order;
    params.onOrderCreated?.(order!);
  }

  if (params.discountBody) {
    await api.patch(`/orders/${order!.id}/discount`, params.discountBody, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
  }

  let bill = params.existingBill;
  if (!bill) {
    const { data } = await api.post('/bills/generate', { order_id: order!.id });
    bill = data.bill;
    params.onBillCreated?.(order!, bill!);
  }

  const { data: paymentData } = await api.post(`/bills/${bill!.id}/payments`, params.paymentBody, {
    headers: { 'Idempotency-Key': params.paymentIdempotencyKey },
  });

  return {
    order: order as PlacePrepaidResult['order'],
    bill: (paymentData?.bill || bill) as PlacePrepaidResult['bill'],
    paymentData: paymentData || {},
  };
}
