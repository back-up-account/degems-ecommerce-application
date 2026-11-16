import { describe, expect, it } from 'vitest';
import {
  accountEmailSchema,
  accountRegistrationSchema,
  accountCompletionInputSchema,
  passwordResetSchema,
} from '@api/lib/account-validation';

describe('account input validation', () => {
  it('normalizes registration emails and requires a matching password at verification', () => {
    const parsed = accountRegistrationSchema.safeParse({
      name: 'Test Customer',
      email: '  CUSTOMER@EXAMPLE.TEST ',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe('customer@example.test');
    expect(accountRegistrationSchema.safeParse({ name: 'Test Customer', email: 'customer@example.test' }).success).toBe(true);
    expect(accountCompletionInputSchema.safeParse({
      token: 'A'.repeat(43),
      password: 'short',
      confirmPassword: 'short',
    }).success).toBe(false);
    expect(accountCompletionInputSchema.safeParse({
      token: 'A'.repeat(43),
      password: 'a-long-test-password',
      confirmPassword: 'different-long-password',
    }).success).toBe(false);
  });

  it('accepts only valid email addresses and 32-byte URL-safe action tokens', () => {
    expect(accountEmailSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(accountCompletionInputSchema.safeParse({
      token: 'A'.repeat(43),
      password: 'a-long-test-password',
      confirmPassword: 'a-long-test-password',
    }).success).toBe(true);
    expect(accountCompletionInputSchema.safeParse({
      token: 'short',
      password: 'a-long-test-password',
      confirmPassword: 'a-long-test-password',
    }).success).toBe(false);
    expect(passwordResetSchema.safeParse({
      token: 'A'.repeat(43),
      password: 'a-long-test-password',
      confirmPassword: 'a-long-test-password',
    }).success).toBe(true);
  });
});
