import { readFile } from 'node:fs/promises';
import {
  ProductImageStorageConfigurationError,
  readProductImageStorageConfig,
} from '@api/lib/product-image-storage-config';

type Environment = Record<string, string | undefined>;

export async function getProductionEnvironmentErrors(env: Environment = process.env) {
  const errors: string[] = [];

  if (!isPostgresUrl(env.DATABASE_URL)) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (!env.NEXTAUTH_SECRET || env.NEXTAUTH_SECRET.length < 32) {
    errors.push('NEXTAUTH_SECRET must contain at least 32 characters.');
  }

  if (!isHttpsUrl(env.NEXTAUTH_URL)) {
    errors.push('NEXTAUTH_URL must be an HTTPS URL without embedded credentials.');
  }

  const mfaKey = env.ADMIN_MFA_ENCRYPTION_KEY;
  if (!mfaKey || !isBase64Key(mfaKey, 32)) {
    errors.push('ADMIN_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }

  if (!(await hasMetricsToken(env))) {
    errors.push('Configure METRICS_BEARER_TOKEN or a readable METRICS_BEARER_TOKEN_FILE containing at least 32 characters.');
  }

  requireSecret(env, 'ORDER_EXPIRY_SECRET', errors);
  requireSecret(env, 'NOTIFICATION_WORKER_SECRET', errors);
  validateSmtp(env, errors);
  try {
    readProductImageStorageConfig(env);
  } catch (error) {
    if (!(error instanceof ProductImageStorageConfigurationError)) throw error;
    errors.push(error.message);
  }
  validateOptionalCredentials(env, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], errors);
  validateBankTransfer(env, errors);

  const checkoutEnabled = env.CHECKOUT_ORDERS_ENABLED;
  if (checkoutEnabled !== undefined && checkoutEnabled !== 'true' && checkoutEnabled !== 'false') {
    errors.push('CHECKOUT_ORDERS_ENABLED must be either "true" or "false".');
  }

  return errors;
}

function isPostgresUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['postgres:', 'postgresql:'].includes(url.protocol)
      && Boolean(url.hostname)
      && url.pathname.length > 1;
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isBase64Key(value: string, expectedBytes: number) {
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === expectedBytes && decoded.toString('base64') === value;
}

async function hasMetricsToken(env: Environment) {
  const token = env.METRICS_BEARER_TOKEN;
  if (token && token.length >= 32) return true;

  const tokenFile = env.METRICS_BEARER_TOKEN_FILE;
  if (!tokenFile) return false;

  try {
    return (await readFile(tokenFile, 'utf8')).trim().length >= 32;
  } catch {
    return false;
  }
}

function requireSecret(env: Environment, name: string, errors: string[]) {
  if (!env[name] || env[name]!.length < 32) {
    errors.push(`${name} must contain at least 32 characters.`);
  }
}

function validateSmtp(env: Environment, errors: string[]) {
  const smtpValues = [env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_FROM];
  if (smtpValues.some((value) => !value?.trim())) {
    errors.push('SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM are required for production email delivery.');
  }

  if (env.SMTP_PORT && (!/^\d+$/.test(env.SMTP_PORT) || Number(env.SMTP_PORT) < 1 || Number(env.SMTP_PORT) > 65535)) {
    errors.push('SMTP_PORT must be an integer between 1 and 65535.');
  }
}

function validateOptionalCredentials(
  env: Environment,
  names: string[],
  errors: string[],
) {
  const configured = names.filter((name) => Boolean(env[name]?.trim()));
  if (configured.length > 0 && configured.length !== names.length) {
    errors.push(`${names.join(', ')} must either all be configured or all be omitted.`);
  }
}

function validateBankTransfer(env: Environment, errors: string[]) {
  const bankValues = [
    env.DEGEMS_BANK_NAME?.trim(),
    env.DEGEMS_BANK_ACCOUNT_NAME?.trim(),
    env.DEGEMS_BANK_ACCOUNT_NUMBER?.trim(),
  ];
  const anyBankValue = bankValues.some(Boolean);
  const checkoutEnabled = env.CHECKOUT_ORDERS_ENABLED === 'true';

  if ((anyBankValue || checkoutEnabled) && (!bankValues[0] || !bankValues[1] || !/^\d{10}$/.test(bankValues[2] ?? ''))) {
    errors.push('Configure DEGEMS_BANK_NAME, DEGEMS_BANK_ACCOUNT_NAME, and a 10-digit DEGEMS_BANK_ACCOUNT_NUMBER before enabling checkout.');
  }
}
