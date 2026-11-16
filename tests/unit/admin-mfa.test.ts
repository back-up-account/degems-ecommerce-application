import { describe, expect, it } from 'vitest';
import {
  createAdminTotpSecret,
  decryptAdminTotpSecret,
  encryptAdminTotpSecret,
  findValidTotpStep,
  generateAdminRecoveryCodes,
  hashAdminRecoveryCode,
} from '@api/lib/admin-mfa';

const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

describe('administrator MFA', () => {
  it('encrypts MFA secrets with authenticated encryption', () => {
    const encrypted = encryptAdminTotpSecret(RFC_SECRET, ENCRYPTION_KEY);

    expect(encrypted).not.toContain(RFC_SECRET);
    expect(decryptAdminTotpSecret(encrypted, ENCRYPTION_KEY)).toBe(RFC_SECRET);
    expect(() => decryptAdminTotpSecret(encrypted, Buffer.alloc(32, 8).toString('base64'))).toThrow();
  });

  it('accepts a current or adjacent TOTP step once and rejects malformed or replayed codes', () => {
    expect(findValidTotpStep(RFC_SECRET, '287082', 59_000)).toBe(1);
    expect(findValidTotpStep(RFC_SECRET, '287082', 60_000)).toBe(1);
    expect(findValidTotpStep(RFC_SECRET, '287082', 59_000, 1)).toBeNull();
    expect(findValidTotpStep(RFC_SECRET, '12345', 59_000)).toBeNull();
  });

  it('generates strong random secrets and one-time recovery-code hashes', () => {
    const firstSecret = createAdminTotpSecret();
    const secondSecret = createAdminTotpSecret();
    const [recoveryCode] = generateAdminRecoveryCodes(1);

    expect(firstSecret).toMatch(/^[A-Z2-7]{32}$/);
    expect(secondSecret).not.toBe(firstSecret);
    expect(recoveryCode).toMatch(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/);
    expect(hashAdminRecoveryCode(recoveryCode)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAdminRecoveryCode(recoveryCode)).toBe(hashAdminRecoveryCode(recoveryCode.replaceAll('-', '')));
    expect(hashAdminRecoveryCode('invalid')).toBe('');
  });
});
