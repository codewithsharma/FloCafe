/**
 * Auth boundary Zod schemas — untrusted external input at login / recovery / setup.
 */

import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().trim().min(1, 'Email and password required'),
  password: z.string().min(1, 'Email and password required'),
  rememberMe: z.boolean().optional(),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const recoverPasswordBodySchema = z.object({
  email: z.string().trim().min(1, 'A valid email is required'),
  master_pin: z.string().min(1, 'Master PIN is required'),
  new_password: z.string().min(1, 'New password is required'),
});

export type RecoverPasswordBody = z.infer<typeof recoverPasswordBodySchema>;

/** Required setup fields only; remaining first-run keys pass through unchanged. */
export const setupInitializeBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name, email, and password are required'),
    email: z.string().trim().min(1, 'Name, email, and password are required'),
    password: z.string().min(1, 'Name, email, and password are required'),
  })
  .passthrough();

export type SetupInitializeBody = z.infer<typeof setupInitializeBodySchema>;
