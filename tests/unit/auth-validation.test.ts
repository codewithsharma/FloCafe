import { describe, expect, it } from 'vitest';
import {
  loginBodySchema,
  recoverPasswordBodySchema,
  setupInitializeBodySchema,
} from '../../main/validation/auth';

describe('auth zod schemas', () => {
  it('accepts a valid login body', () => {
    const parsed = loginBodySchema.parse({
      email: 'owner@example.com',
      password: 'Secret123',
      rememberMe: true,
    });
    expect(parsed.email).toBe('owner@example.com');
    expect(parsed.rememberMe).toBe(true);
  });

  it('rejects empty login credentials', () => {
    const result = loginBodySchema.safeParse({ email: '', password: '' });
    expect(result.success).toBe(false);
  });

  it('accepts recover-password body', () => {
    const parsed = recoverPasswordBodySchema.parse({
      email: 'owner@example.com',
      master_pin: '123456',
      new_password: 'NewPass123',
    });
    expect(parsed.master_pin).toBe('123456');
  });

  it('passes through extra setup fields', () => {
    const parsed = setupInitializeBodySchema.parse({
      name: 'Owner',
      email: 'owner@example.com',
      password: 'Secret123',
      country: 'IN',
      terms_accepted: true,
    });
    expect(parsed.country).toBe('IN');
    expect(parsed.terms_accepted).toBe(true);
  });
});
