import nextEnv from '@next/env';
import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'argon2';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', true);

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD?.trim();
const name = process.env.ADMIN_NAME?.trim() || 'DEGEMS Administrator';
const encryptionKey = process.env.ADMIN_MFA_ENCRYPTION_KEY;

const isValidEmail = typeof email === 'string' && email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const decodedEncryptionKey = encryptionKey ? Buffer.from(encryptionKey, 'base64') : Buffer.alloc(0);

if (!isValidEmail) {
  console.error('Set ADMIN_EMAIL to a valid email address before creating the administrator.');
  process.exitCode = 1;
} else if (!password || password.length < 12) {
  console.error('Set ADMIN_PASSWORD to a value of at least 12 characters before creating the administrator.');
  process.exitCode = 1;
} else if (decodedEncryptionKey.length !== 32) {
  console.error('Set ADMIN_MFA_ENCRYPTION_KEY to a base64-encoded 32-byte key before provisioning an administrator.');
  process.exitCode = 1;
} else if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL before creating the administrator.');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient();

  try {
    const passwordHash = await hash(password);
    const totpSecret = encodeBase32(randomBytes(20));
    const mfaSecret = encryptTotpSecret(totpSecret, decodedEncryptionKey);
    const recoveryCodes = Array.from({ length: 10 }, createRecoveryCode);
    const mfaEnabledAt = new Date();
    await prisma.$transaction(async (transaction) => {
      const admin = await transaction.user.upsert({
        where: { email },
        create: {
          email,
          name,
          password: passwordHash,
          role: UserRole.ADMIN,
          mfaSecret,
          mfaEnabledAt,
        },
        update: {
          name,
          password: passwordHash,
          role: UserRole.ADMIN,
          mfaSecret,
          mfaEnabledAt,
          mfaLastStep: null,
          authVersion: { increment: 1 },
        },
        select: { id: true },
      });
      await transaction.adminRecoveryCode.deleteMany({ where: { userId: admin.id } });
      await transaction.adminAuthThrottle.deleteMany({ where: { userId: admin.id } });
      await transaction.adminRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: admin.id,
          tokenHash: hashRecoveryCode(code),
        })),
      });
    });
    console.info(`Administrator account provisioned for ${email}.`);
    console.info('Scan this one-time authenticator URI and store the recovery codes securely:');
    console.info(createTotpUri(email, totpSecret));
    console.info('One-time recovery codes:');
    for (const code of recoveryCodes) console.info(code);
    console.info('Re-running this command replaces the password, MFA secret, and all recovery codes.');
  } catch (error) {
    console.error('Could not provision administrator:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function encodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let accumulator = 0;
  let encoded = '';
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += alphabet[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += alphabet[(accumulator << (5 - bits)) & 31];
  return encoded;
}

function encryptTotpSecret(secret, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function createTotpUri(address, secret) {
  const label = encodeURIComponent(`DEGEMS:${address}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=DEGEMS&algorithm=SHA1&digits=6&period=30`;
}

function createRecoveryCode() {
  const value = randomBytes(8).toString('hex').toUpperCase();
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
}

function hashRecoveryCode(code) {
  return createHash('sha256').update(code.replaceAll('-', '')).digest('hex');
}
