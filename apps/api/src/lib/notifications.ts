import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createTransport } from 'nodemailer-v10';
import { Prisma } from '@prisma/client';
import { formatNairaFromKobo } from '@api/lib/utils';
import { prisma } from '@api/lib/prisma';

const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 25;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 60 * 60 * 1000;
const PROCESSING_LOCK_MS = 5 * 60 * 1000;

type NotificationChannel = 'webhook' | 'email';
type NotificationDatabase = Pick<Prisma.TransactionClient, 'notification'>;
type NotificationPayload = Prisma.InputJsonObject;

export async function enqueueOrderNotification(
  transaction: NotificationDatabase,
  input: {
    orderId: string;
    eventType: string;
    channel: NotificationChannel;
    recipient?: string | null;
    payload?: NotificationPayload;
    invoiceToken?: string;
  },
) {
  await transaction.notification.create({
    data: {
      orderId: input.orderId,
      eventType: input.eventType,
      channel: input.channel,
      recipient: input.recipient ?? null,
      payload: input.payload,
      secretPayload: input.invoiceToken ? encryptSecret(input.invoiceToken) : null,
    },
  });
}

export async function enqueueAccountNotification(
  transaction: NotificationDatabase,
  input: {
    eventType: 'account_verification' | 'password_reset' | 'staff_password_reset' | 'staff_invitation';
    recipient: string;
    token: string;
  },
) {
  await transaction.notification.create({
    data: {
      eventType: input.eventType,
      channel: 'email',
      recipient: input.recipient,
      secretPayload: encryptSecret(input.token),
    },
  });
}

export function isAccountEmailDeliveryConfigured() {
  if (!isSmtpConfigured() || !process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) return false;

  try {
    const baseUrl = new URL(process.env.NEXTAUTH_URL ?? '');
    return ['http:', 'https:'].includes(baseUrl.protocol)
      && !baseUrl.username
      && !baseUrl.password
      && (process.env.NODE_ENV !== 'production' || baseUrl.protocol === 'https:');
  } catch {
    return false;
  }
}

export async function dispatchNotificationBatch() {
  const enabledChannels = getConfiguredChannels();
  if (enabledChannels.length === 0) {
    return {
      sentCount: 0,
      retryCount: 0,
      failedCount: 0,
      skippedForConfiguration: await prisma.notification.count({ where: { status: 'queued' } }),
    };
  }

  const now = new Date();
  const staleLockBefore = new Date(now.getTime() - PROCESSING_LOCK_MS);
  const candidates = await prisma.notification.findMany({
    where: {
      OR: [
        { status: 'queued', availableAt: { lte: now } },
        { status: 'processing', lockedAt: { lte: staleLockBefore } },
      ],
      channel: { in: enabledChannels },
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: BATCH_SIZE,
    select: { id: true },
  });

  let sentCount = 0;
  let retryCount = 0;
  let failedCount = 0;

  for (const candidate of candidates) {
    const claimed = await prisma.$transaction(async (transaction) => {
      const update = await transaction.notification.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: 'queued', availableAt: { lte: now } },
            { status: 'processing', lockedAt: { lte: staleLockBefore } },
          ],
        },
        data: { status: 'processing', lockedAt: now, attempts: { increment: 1 } },
      });
      if (update.count !== 1) return null;
      return transaction.notification.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          orderId: true,
          eventType: true,
          channel: true,
          recipient: true,
          payload: true,
          secretPayload: true,
          attempts: true,
        },
      });
    });
    if (!claimed) continue;

    try {
      if (claimed.channel === 'webhook') {
        await sendAdminWebhook(claimed);
      } else if (claimed.channel === 'email') {
        await sendCustomerEmail(claimed);
      } else {
        throw new NotificationDeliveryError('unsupported_channel');
      }

      await prisma.notification.update({
        where: { id: claimed.id },
        data: { status: 'sent', sentAt: new Date(), lockedAt: null, lastError: null, secretPayload: null },
      });
      sentCount += 1;
    } catch (error) {
      const exhausted = claimed.attempts >= MAX_ATTEMPTS;
      const delay = Math.min(BASE_RETRY_MS * (2 ** Math.max(0, claimed.attempts - 1)), MAX_RETRY_MS);
      await prisma.notification.update({
        where: { id: claimed.id },
        data: {
          status: exhausted ? 'failed' : 'queued',
          availableAt: exhausted ? now : new Date(now.getTime() + delay),
          lockedAt: null,
          lastError: safeNotificationError(error),
        },
      });
      if (exhausted) failedCount += 1;
      else retryCount += 1;
    }
  }

  const allChannels: NotificationChannel[] = ['webhook', 'email'];
  const skippedChannels = allChannels.filter((channel) => !enabledChannels.includes(channel));
  const skippedForConfiguration = skippedChannels.length === 0
    ? 0
    : await prisma.notification.count({ where: { status: 'queued', channel: { in: skippedChannels } } });

  return { sentCount, retryCount, failedCount, skippedForConfiguration };
}

export async function retryFailedNotification(notificationId: string, adminId: string) {
  return prisma.$transaction(async (transaction) => {
    const failed = await transaction.notification.findUnique({
      where: { id: notificationId },
      select: { status: true, attempts: true },
    });
    if (!failed) return { result: 'not_found' as const };
    if (failed.status !== 'failed') return { result: 'not_failed' as const, status: failed.status };

    const updated = await transaction.notification.updateMany({
      where: { id: notificationId, status: 'failed' },
      data: {
        status: 'queued',
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
    if (updated.count !== 1) return { result: 'not_failed' as const };

    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'notification.retry.requested',
        entityType: 'Notification',
        entityId: notificationId,
        details: { previousAttempts: failed.attempts },
      },
    });
    return { result: 'retried' as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function getConfiguredChannels(): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (isWebhookConfigured()) channels.push('webhook');
  if (isSmtpConfigured()) channels.push('email');
  return channels;
}

function isWebhookConfigured() {
  const provider = process.env.NOTIFICATION_PROVIDER;
  if (provider === 'discord') {
    try {
      const url = new URL(process.env.NOTIFICATION_WEBHOOK_URL ?? '');
      return url.protocol === 'https:'
        && ['discord.com', 'discordapp.com'].includes(url.hostname)
        && url.pathname.startsWith('/api/webhooks/');
    } catch {
      return false;
    }
  }
  return provider === 'telegram'
    && Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function isSmtpConfigured() {
  const port = Number(process.env.SMTP_PORT);
  return Boolean(
    process.env.SMTP_HOST
    && Number.isInteger(port)
    && port > 0
    && process.env.SMTP_USER
    && process.env.SMTP_PASSWORD
    && process.env.SMTP_FROM,
  );
}

async function sendAdminWebhook(notification: {
  orderId: string | null;
  eventType: string;
  payload: Prisma.JsonValue | null;
  secretPayload: string | null;
}) {
  const order = notification.orderId
    ? await prisma.order.findUnique({
      where: { id: notification.orderId },
      include: { items: true, payment: true },
    })
    : null;
  if (!order) throw new NotificationDeliveryError('order_unavailable');

  const lines = [
    `DEGEMS ${formatEventName(notification.eventType)}`,
    `Order: DG-${order.id.slice(0, 8).toUpperCase()}`,
    `Customer: ${order.customerName ?? 'Guest'} · ${order.customerEmail ?? 'No email'} · ${order.customerPhone ?? 'No phone'}`,
  ];

  if (notification.eventType === 'order_created') {
    lines.push(
      `Invoice: ${getInvoiceUrl(notification.secretPayload)}`,
      `Items: ${order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ') || 'None'}`,
      `Amount: ${formatNairaFromKobo(order.total)}`,
      `Payment: bank transfer · ${order.payment?.reference ?? 'reference unavailable'}`,
      `Created: ${order.createdAt.toISOString()}`,
    );
  } else {
    lines.push(`Status: ${order.status.replaceAll('_', ' ')}`);
    if (notification.payload && typeof notification.payload === 'object' && !Array.isArray(notification.payload)) {
      const details = Object.entries(notification.payload)
        .map(([key, value]) => `${formatEventName(key)}: ${String(value)}`)
        .join(' · ');
      if (details) lines.push(details);
    }
    if (order.payment) lines.push(`Payment: ${order.payment.status.replaceAll('_', ' ')}`);
  }

  const message = lines.join('\n').slice(0, 3800);
  if (process.env.NOTIFICATION_PROVIDER === 'discord') {
    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) throw new NotificationDeliveryError('webhook_not_configured');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message.slice(0, 1900), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new NotificationDeliveryError(`webhook_http_${response.status}`);
    return;
  }

  if (process.env.NOTIFICATION_PROVIDER === 'telegram') {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new NotificationDeliveryError(`webhook_http_${response.status}`);
    return;
  }

  throw new NotificationDeliveryError('webhook_not_configured');
}

async function sendCustomerEmail(notification: {
  orderId: string | null;
  eventType: string;
  recipient: string | null;
  payload: Prisma.JsonValue | null;
  secretPayload: string | null;
}) {
  if (!notification.recipient) throw new NotificationDeliveryError('recipient_unavailable');
  const eventType = notification.eventType;
  if (isAccountActionEvent(eventType)) {
    await sendAccountActionEmail({
      eventType,
      recipient: notification.recipient,
      secretPayload: notification.secretPayload,
    });
    return;
  }

  const order = notification.orderId
    ? await prisma.order.findUnique({
      where: { id: notification.orderId },
      select: { id: true, status: true, total: true, deliveryZoneName: true, dispatchProvider: true, dispatchReference: true },
    })
    : null;
  if (!order) throw new NotificationDeliveryError('order_unavailable');

  const orderReference = `DG-${order.id.slice(0, 8).toUpperCase()}`;
  const detail = order.dispatchProvider
    ? ` Dispatch: ${order.dispatchProvider}${order.dispatchReference ? ` (${order.dispatchReference})` : ''}.`
    : '';
  const subjects: Record<string, string> = {
    order_created: `DEGEMS invoice ${orderReference}`,
    payment_confirmed: `Payment confirmed for ${orderReference}`,
    fulfillment_status_changed: `Order update for ${orderReference}`,
    order_cancelled: `Order cancelled: ${orderReference}`,
    order_refunded: `Refund recorded for ${orderReference}`,
  };
  const text = [
    `Your DEGEMS order ${orderReference} has been updated.`,
    `Order status: ${order.status.replaceAll('_', ' ')}.`,
    `Amount: ${formatNairaFromKobo(order.total)}.`,
    notification.eventType === 'order_created' ? `Secure invoice: ${getInvoiceUrl(notification.secretPayload)}.` : '',
    order.deliveryZoneName ? `Delivery area: ${order.deliveryZoneName}.` : '',
    detail,
    notification.payload && typeof notification.payload === 'object' && !Array.isArray(notification.payload)
      ? Object.entries(notification.payload).map(([key, value]) => `${formatEventName(key)}: ${String(value)}.`).join(' ')
      : '',
  ].filter(Boolean).join('\n');

  await sendSmtpEmail({
    to: notification.recipient,
    subject: subjects[notification.eventType] ?? `DEGEMS order update ${orderReference}`,
    text,
  });
}

async function sendAccountActionEmail(notification: {
  eventType: 'account_verification' | 'password_reset' | 'staff_password_reset' | 'staff_invitation';
  recipient: string;
  secretPayload: string | null;
}) {
  const token = notification.secretPayload ? decryptSecret(notification.secretPayload) : null;
  if (!token) throw new NotificationDeliveryError('account_link_unavailable');

  if (notification.eventType === 'staff_invitation') {
    const setupUrl = getStaffLoginUrl();
    await sendSmtpEmail({
      to: notification.recipient,
      subject: 'Your DEGEMS staff account is ready to set up',
      text: [
        'A DEGEMS administrator created a staff account for you.',
        `Temporary password: ${token}`,
        `First sign-in and security setup: ${setupUrl}`,
        'The temporary password expires in 24 hours. Before accessing staff tools, choose a new password and enroll an authenticator app. Keep your recovery codes private.',
        'If you were not expecting this account, contact your administrator.',
      ].join('\n\n'),
    });
    return;
  }

  const verification = notification.eventType === 'account_verification';
  const actionUrl = getAccountActionUrl(verification ? '/account/verify' : '/account/reset-password', token);
  const forcedStaffReset = notification.eventType === 'staff_password_reset';
  await sendSmtpEmail({
    to: notification.recipient,
    subject: verification
      ? 'Verify your DEGEMS account'
      : forcedStaffReset
        ? 'Action required: update your DEGEMS staff password'
        : 'Reset your DEGEMS password',
    text: verification
      ? `Confirm your email address, then choose a password to finish creating your DEGEMS customer account:\n${actionUrl}\n\nThis link expires in 30 minutes. If you did not request this account, you can ignore this email.`
      : forcedStaffReset
        ? `A DEGEMS administrator requires you to change your staff password. Use this one-time link to choose a new password:\n${actionUrl}\n\nThis link expires in 30 minutes. Your existing sessions have been signed out. Contact your administrator if you did not expect this request.`
        : `Use this link to reset your DEGEMS password:\n${actionUrl}\n\nThis link expires in 30 minutes. If you did not request a reset, you can ignore this email.`,
  });
}

async function sendSmtpEmail(input: { to: string; subject: string; text: string }) {
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    requireTLS: Number(process.env.SMTP_PORT) !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
  } finally {
    transporter.close();
  }
}

function encryptSecret(value: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptSecret(value: string) {
  const key = getEncryptionKey();
  if (!key) return null;
  const [version, ivText, tagText, ciphertextText] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

function getEncryptionKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new NotificationDeliveryError('encryption_key_unavailable');
  }
  return createHash('sha256').update(secret).digest();
}

function getInvoiceUrl(secretPayload: string | null) {
  const token = secretPayload ? decryptSecret(secretPayload) : null;
  if (!token || !process.env.NEXTAUTH_URL) {
    throw new NotificationDeliveryError('invoice_link_unavailable');
  }

  try {
    const url = new URL(`/invoice/${token}`, process.env.NEXTAUTH_URL);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new NotificationDeliveryError('invoice_link_unavailable');
    }
    return url.toString();
  } catch (error) {
    if (error instanceof NotificationDeliveryError) throw error;
    throw new NotificationDeliveryError('invoice_link_unavailable');
  }
}

function getAccountActionUrl(path: '/account/verify' | '/account/reset-password', token: string) {
  let baseUrl: URL;
  try {
    baseUrl = new URL(process.env.NEXTAUTH_URL ?? '');
  } catch {
    throw new NotificationDeliveryError('account_link_unavailable');
  }

  if (!['http:', 'https:'].includes(baseUrl.protocol)
    || baseUrl.username
    || baseUrl.password
    || (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:')) {
    throw new NotificationDeliveryError('account_link_unavailable');
  }

  const url = new URL(path, baseUrl.origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function getStaffLoginUrl() {
  let baseUrl: URL;
  try {
    baseUrl = new URL(process.env.NEXTAUTH_URL ?? '');
  } catch {
    throw new NotificationDeliveryError('account_link_unavailable');
  }

  if (!['http:', 'https:'].includes(baseUrl.protocol)
    || baseUrl.username
    || baseUrl.password
    || (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:')) {
    throw new NotificationDeliveryError('account_link_unavailable');
  }

  return new URL('/admin/login', baseUrl.origin).toString();
}

function safeNotificationError(error: unknown) {
  if (error instanceof NotificationDeliveryError) return error.code.slice(0, 120);
  return error instanceof Error ? error.name.slice(0, 120) : 'unknown_error';
}

function formatEventName(value: string) {
  return value.replaceAll('_', ' ');
}

function isAccountActionEvent(
  value: string,
): value is 'account_verification' | 'password_reset' | 'staff_password_reset' | 'staff_invitation' {
  return value === 'account_verification'
    || value === 'password_reset'
    || value === 'staff_password_reset'
    || value === 'staff_invitation';
}

class NotificationDeliveryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NotificationDeliveryError';
  }
}
