import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_CODE_LENGTH = 6;

export function createAdminTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function encryptAdminTotpSecret(secret: string, encodedKey = process.env.ADMIN_MFA_ENCRYPTION_KEY) {
  const key = decodeEncryptionKey(encodedKey);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${nonce.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptAdminTotpSecret(encrypted: string, encodedKey = process.env.ADMIN_MFA_ENCRYPTION_KEY) {
  const key = decodeEncryptionKey(encodedKey);
  const [version, nonceValue, tagValue, ciphertextValue] = encrypted.split('.');
  if (version !== 'v1' || !nonceValue || !tagValue || !ciphertextValue) {
    throw new Error('Stored administrator MFA secret has an invalid format.');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonceValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function findValidTotpStep(secret: string, code: string, now = Date.now(), lastUsedStep: number | null = null) {
  if (!/^\d{6}$/.test(code)) return null;

  const currentStep = Math.floor(now / (TOTP_PERIOD_SECONDS * 1000));
  for (const step of [currentStep, currentStep - 1, currentStep + 1]) {
    if (step < 0 || (lastUsedStep !== null && step <= lastUsedStep)) continue;
    const expected = createTotpCode(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

export async function consumeAdminSecondFactor(input: {
  userId: string;
  encryptedSecret: string;
  lastUsedStep: number | null;
  code: string;
}) {
  if (input.code.length === TOTP_CODE_LENGTH) {
    const secret = decryptAdminTotpSecret(input.encryptedSecret);
    const matchedStep = findValidTotpStep(secret, input.code, Date.now(), input.lastUsedStep);
    if (matchedStep === null) return false;

    const updated = await prisma.user.updateMany({
      where: {
        id: input.userId,
        role: { not: 'CUSTOMER' },
        mfaEnabledAt: { not: null },
        mfaLastStep: input.lastUsedStep,
      },
      data: { mfaLastStep: matchedStep },
    });
    return updated.count === 1;
  }

  const recoveryCodeHash = hashAdminRecoveryCode(input.code);
  const consumed = await prisma.adminRecoveryCode.updateMany({
    where: { userId: input.userId, tokenHash: recoveryCodeHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  return consumed.count === 1;
}

export function hashAdminRecoveryCode(code: string) {
  const normalized = code.toUpperCase().replaceAll('-', '');
  if (!/^[A-F0-9]{16}$/.test(normalized)) return '';
  return createHash('sha256').update(normalized).digest('hex');
}

export function generateAdminRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = randomBytes(8).toString('hex').toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
  });
}

export function createTotpUri(email: string, secret: string) {
  const label = encodeURIComponent(`DEGEMS:${email}`);
  const issuer = encodeURIComponent('DEGEMS');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

function decodeEncryptionKey(encodedKey: string | undefined) {
  if (!encodedKey) throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be configured for administrator MFA.');
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

function createTotpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** TOTP_CODE_LENGTH)).padStart(TOTP_CODE_LENGTH, '0');
}

function encodeBase32(value: Buffer) {
  let bits = 0;
  let accumulator = 0;
  let encoded = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return encoded;
}

function decodeBase32(value: string) {
  let bits = 0;
  let accumulator = 0;
  const decoded: number[] = [];
  for (const character of value.toUpperCase().replaceAll('=', '')) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Stored administrator MFA secret is invalid.');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      decoded.push((accumulator >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(decoded);
}

