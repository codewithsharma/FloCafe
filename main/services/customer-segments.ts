/**
 * R7 — centralized CRM segment rules (explainable, settings-backed).
 * Do not scatter thresholds across UI/routes.
 */

import { getSettingValue } from '../db';

export type CustomerSegmentId =
  'new' | 'returning' | 'loyal' | 'high_value' | 'inactive' | 'frequent';

export interface CrmSegmentRules {
  new_max_orders: number;
  returning_min_orders: number;
  loyal_min_orders: number;
  frequent_min_orders: number;
  frequent_window_days: number;
  high_value_min_spend_cents: number;
  inactive_days: number;
}

export const DEFAULT_CRM_SEGMENT_RULES: CrmSegmentRules = {
  new_max_orders: 1,
  returning_min_orders: 2,
  loyal_min_orders: 5,
  frequent_min_orders: 8,
  frequent_window_days: 90,
  high_value_min_spend_cents: 100_000,
  inactive_days: 60,
};

export function loadCrmSegmentRules(): CrmSegmentRules {
  const raw = getSettingValue('crm_segment_rules');
  if (!raw) return { ...DEFAULT_CRM_SEGMENT_RULES };
  try {
    const parsed = JSON.parse(raw) as Partial<CrmSegmentRules>;
    return {
      new_max_orders: Number(parsed.new_max_orders) || DEFAULT_CRM_SEGMENT_RULES.new_max_orders,
      returning_min_orders:
        Number(parsed.returning_min_orders) || DEFAULT_CRM_SEGMENT_RULES.returning_min_orders,
      loyal_min_orders:
        Number(parsed.loyal_min_orders) || DEFAULT_CRM_SEGMENT_RULES.loyal_min_orders,
      frequent_min_orders:
        Number(parsed.frequent_min_orders) || DEFAULT_CRM_SEGMENT_RULES.frequent_min_orders,
      frequent_window_days:
        Number(parsed.frequent_window_days) || DEFAULT_CRM_SEGMENT_RULES.frequent_window_days,
      high_value_min_spend_cents:
        Number(parsed.high_value_min_spend_cents) ||
        DEFAULT_CRM_SEGMENT_RULES.high_value_min_spend_cents,
      inactive_days: Number(parsed.inactive_days) || DEFAULT_CRM_SEGMENT_RULES.inactive_days,
    };
  } catch {
    return { ...DEFAULT_CRM_SEGMENT_RULES };
  }
}

export interface SegmentInput {
  orderCount: number;
  cancelledCount: number;
  totalSpendCents: number;
  ordersInWindow: number;
  daysSinceLastOrder: number | null;
  isActive: boolean;
}

export interface ExplainedSegment {
  id: CustomerSegmentId;
  label: string;
  reason: string;
}

/** Deterministic multi-label segments with human-readable reasons. */
export function explainSegments(
  input: SegmentInput,
  rules: CrmSegmentRules = loadCrmSegmentRules(),
): ExplainedSegment[] {
  const out: ExplainedSegment[] = [];
  const completedish = Math.max(0, input.orderCount);

  if (!input.isActive) {
    out.push({
      id: 'inactive',
      label: 'Inactive',
      reason: 'Customer profile is archived (is_active=0)',
    });
  } else if (input.daysSinceLastOrder !== null && input.daysSinceLastOrder >= rules.inactive_days) {
    out.push({
      id: 'inactive',
      label: 'Inactive',
      reason: `No orders in the last ${rules.inactive_days} days (last order ${input.daysSinceLastOrder} days ago)`,
    });
  }

  if (completedish <= rules.new_max_orders) {
    out.push({
      id: 'new',
      label: 'New',
      reason: `Order count ${completedish} ≤ ${rules.new_max_orders}`,
    });
  }

  if (completedish >= rules.returning_min_orders) {
    out.push({
      id: 'returning',
      label: 'Returning',
      reason: `Order count ${completedish} ≥ ${rules.returning_min_orders}`,
    });
  }

  if (completedish >= rules.loyal_min_orders) {
    out.push({
      id: 'loyal',
      label: 'Loyal',
      reason: `Order count ${completedish} ≥ ${rules.loyal_min_orders}`,
    });
  }

  if (input.ordersInWindow >= rules.frequent_min_orders) {
    out.push({
      id: 'frequent',
      label: 'Frequent',
      reason: `${input.ordersInWindow} orders in last ${rules.frequent_window_days} days (threshold ${rules.frequent_min_orders})`,
    });
  }

  if (input.totalSpendCents >= rules.high_value_min_spend_cents) {
    out.push({
      id: 'high_value',
      label: 'High value',
      reason: `Lifetime spend ${input.totalSpendCents}¢ ≥ ${rules.high_value_min_spend_cents}¢`,
    });
  }

  return out;
}
