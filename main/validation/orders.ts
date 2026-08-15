/**
 * Order boundary Zod schemas — create order and add-items HTTP payloads.
 * Business rules (notes length, stock, addon limits) stay in route/service.
 */

import { z } from 'zod';

const orderTypeSchema = z.enum(['dine_in', 'takeaway', 'delivery', 'online'], {
  message: 'Valid type is required (dine_in, takeaway, delivery, online)',
});

const nonNegativeCharge = z
  .union([
    z.number().finite().min(0, 'Packaging and delivery charges must be non-negative numbers'),
    z.string(),
  ])
  .optional()
  .nullable();

const orderItemSchema = z
  .object({
    product_id: z.union([z.string().min(1), z.number()]),
    quantity: z.number().finite().positive('Item quantity must be greater than zero'),
    special_instructions: z.string().optional().nullable(),
    addons: z.array(z.any()).optional().nullable(),
  })
  .passthrough();

export const createOrderBodySchema = z
  .object({
    type: orderTypeSchema,
    items: z.array(orderItemSchema).min(1, 'At least one item is required'),
    table_id: z.union([z.string(), z.number()]).optional().nullable(),
    customer_id: z.union([z.string(), z.number()]).optional().nullable(),
    guest_count: z
      .number()
      .int('guest_count must be a whole number between 1 and 99')
      .min(1, 'guest_count must be a whole number between 1 and 99')
      .max(99, 'guest_count must be a whole number between 1 and 99')
      .optional()
      .nullable(),
    special_instructions: z.string().optional().nullable(),
    packaging_charge: nonNegativeCharge,
    delivery_charge: nonNegativeCharge,
  })
  .passthrough()
  .superRefine((body, ctx) => {
    for (const field of ['packaging_charge', 'delivery_charge'] as const) {
      const raw = body[field];
      if (raw === undefined || raw === null || raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Packaging and delivery charges must be non-negative numbers',
          path: [field],
        });
      }
    }
  });

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;

export const addOrderItemsBodySchema = z
  .object({
    items: z.array(orderItemSchema).min(1, 'At least one item is required'),
    special_instructions: z.string().optional().nullable(),
  })
  .passthrough();

export type AddOrderItemsBody = z.infer<typeof addOrderItemsBodySchema>;

export const orderDiscountBodySchema = z
  .object({
    discount_type: z.enum(['percentage', 'amount']).optional().nullable(),
    discount_value: z.number().finite().min(0).optional().nullable(),
    discount_reason: z.string().max(500).optional().nullable(),
    override_pin: z.string().optional().nullable(),
  })
  .passthrough();

export type OrderDiscountBody = z.infer<typeof orderDiscountBodySchema>;

export const orderStatusBodySchema = z
  .object({
    status: z.enum(['preparing', 'ready', 'served', 'completed', 'cancelled'], {
      message: 'Invalid status. Use: preparing, ready, served, completed, cancelled',
    }),
    reason: z.string().max(500).optional().nullable(),
    override_pin: z.string().optional().nullable(),
    free_table: z.boolean().optional().nullable(),
  })
  .passthrough();

export type OrderStatusBody = z.infer<typeof orderStatusBodySchema>;

export const orderItemCancelBodySchema = z
  .object({
    reason: z.string().max(500).optional().nullable(),
    override_pin: z.string().optional().nullable(),
  })
  .passthrough();

export type OrderItemCancelBody = z.infer<typeof orderItemCancelBodySchema>;
