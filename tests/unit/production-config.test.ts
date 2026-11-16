import { describe, expect, it } from 'vitest';
import { getProductionEnvironmentErrors } from '@api/lib/production-config';

const validProductionEnvironment: Record<string, string | undefined> = {
  DATABASE_URL: 'postgresql://store:secret@db.example.test/store',
  NEXTAUTH_SECRET: 'n'.repeat(32),
  NEXTAUTH_URL: 'https://store.example.test',
  ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  METRICS_BEARER_TOKEN: 'm'.repeat(32),
  ORDER_EXPIRY_SECRET: 'o'.repeat(32),
  NOTIFICATION_WORKER_SECRET: 'w'.repeat(32),
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'store@example.test',
  SMTP_PASSWORD: 'mail-password',
  SMTP_FROM: 'store@example.test',
};

describe('production environment validation', () => {
  it('accepts a complete production configuration', async () => {
    await expect(getProductionEnvironmentErrors(validProductionEnvironment)).resolves.toEqual([]);
  });

  it('reports invalid critical settings without exposing their values', async () => {
    const errors = await getProductionEnvironmentErrors({
      ...validProductionEnvironment,
      NEXTAUTH_URL: 'http://store.example.test',
      NEXTAUTH_SECRET: 'private-secret',
      METRICS_BEARER_TOKEN: undefined,
      METRICS_BEARER_TOKEN_FILE: '/missing/metrics-token',
      SMTP_PORT: 'not-a-port',
    });

    expect(errors).toContain('NEXTAUTH_SECRET must contain at least 32 characters.');
    expect(errors).toContain('NEXTAUTH_URL must be an HTTPS URL without embedded credentials.');
    expect(errors).toContain('Configure METRICS_BEARER_TOKEN or a readable METRICS_BEARER_TOKEN_FILE containing at least 32 characters.');
    expect(errors).toContain('SMTP_PORT must be an integer between 1 and 65535.');
    expect(errors.join(' ')).not.toContain('private-secret');
  });

  it('requires complete bank details before checkout is enabled', async () => {
    const errors = await getProductionEnvironmentErrors({
      ...validProductionEnvironment,
      CHECKOUT_ORDERS_ENABLED: 'true',
    });

    expect(errors).toContain('Configure DEGEMS_BANK_NAME, DEGEMS_BANK_ACCOUNT_NAME, and a 10-digit DEGEMS_BANK_ACCOUNT_NUMBER before enabling checkout.');
  });

  it('accepts checkout when valid bank details are configured', async () => {
    await expect(getProductionEnvironmentErrors({
      ...validProductionEnvironment,
      CHECKOUT_ORDERS_ENABLED: 'true',
      DEGEMS_BANK_NAME: 'Example Bank',
      DEGEMS_BANK_ACCOUNT_NAME: 'DEGEMS Limited',
      DEGEMS_BANK_ACCOUNT_NUMBER: '0123456789',
    })).resolves.toEqual([]);
  });

  it('allows checkout to remain disabled without bank details', async () => {
    await expect(getProductionEnvironmentErrors({
      ...validProductionEnvironment,
      CHECKOUT_ORDERS_ENABLED: 'false',
    })).resolves.toEqual([]);
  });

  it('requires complete S3 and ImageKit settings when image storage is partially configured', async () => {
    const errors = await getProductionEnvironmentErrors({
      ...validProductionEnvironment,
      PRODUCT_IMAGE_S3_BUCKET: 'degems-product-images',
    });

    expect(errors).toContain(
      'PRODUCT_IMAGE_S3_BUCKET, PRODUCT_IMAGE_S3_REGION, IMAGEKIT_URL_ENDPOINT must be configured together.',
    );
  });
});
