import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { AdapterUser } from 'next-auth/adapters';
import type { Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { guestCheckoutSchema } from '@api/lib/checkout-validation';
import { authConfig } from '@api/lib/auth';
import { updatePassword } from '@api/lib/account-actions';
import { cancelOrder } from '@api/lib/order-cancellation';
import {
  clearAdminLoginFailures,
  isAdminLoginBlocked,
  recordAdminLoginFailure,
} from '@api/lib/admin-auth-throttle';
import {
  consumeAdminSecondFactor,
  encryptAdminTotpSecret,
  generateAdminRecoveryCodes,
  hashAdminRecoveryCode,
} from '@api/lib/admin-mfa';
import { expirePendingOrders, createPendingOrder, hashInvoiceToken } from '@api/lib/orders';
import { confirmOrderPayment, reportBankTransfer } from '@api/lib/payments';
import { prisma } from '@api/lib/prisma';
import { hashPassword, verifyPassword } from '@api/lib/security';

const database = new PrismaClient();

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^degems_test_[a-z0-9_]+$/.test(decodeURIComponent(new URL(databaseUrl).pathname.slice(1)))) {
    throw new Error('Integration tests must use an isolated degems_test_<suffix> database.');
  }
  await database.$connect();
});

afterAll(async () => {
  await database.$disconnect();
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

describe('Phase 5 order and payment processing', () => {
  it('creates an order from a persistent account cart and safely retries the idempotency key', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-with-more-than-thirty-two-characters');
    const unique = randomUUID();
    const user = await database.user.create({ data: { email: `phase5-${unique}@example.test` } });
    const category = await database.category.create({
      data: { name: `Phase 5 ${unique}`, slug: `phase-5-${unique}`, description: 'Order fixture' },
    });
    const product = await database.product.create({
      data: {
        name: `Phase 5 product ${unique}`,
        slug: `phase-5-product-${unique}`,
        shortDescription: 'Order fixture',
        description: 'Order fixture',
        price: 12_500,
        image: 'https://example.test/phase-5-product.png',
        sku: `PHASE5-${unique}`,
        stock: 8,
        published: true,
        categoryId: category.id,
      },
    });
    const cart = await database.cart.create({
      data: {
        userId: user.id,
        expiresAt: null,
        items: { create: { productId: product.id, lineKey: `product:${product.id}`, quantity: 2 } },
      },
    });
    const input = {
      cartId: cart.id,
      idempotencyKey: randomUUID(),
      customer: guestCheckoutSchema.parse({
        fullName: 'Phase Five',
        email: user.email,
        phone: '08012345678',
        deliveryMethod: 'pickup',
      }),
    };
    let orderId: string | null = null;

    try {
      const attempts = await Promise.allSettled([
        createPendingOrder(input),
        createPendingOrder(input),
      ]);
      const results = attempts.flatMap((attempt) => attempt.status === 'fulfilled' ? [attempt.value] : []);
      const created = results.find((result) => result.created);
      if (created) orderId = created.order.id;
      const failedAttempt = attempts.find((attempt) => attempt.status === 'rejected');
      if (failedAttempt?.status === 'rejected') throw failedAttempt.reason;
      if (!created) throw new Error('Concurrent order requests did not create an order.');
      expect(results.filter((result) => result.created)).toHaveLength(1);
      const createdOrderId = created.order.id;
      expect(created).toMatchObject({
        created: true,
        order: { status: 'pending_payment', total: 25_000, currency: 'NGN' },
      });

      const retry = results.find((result) => !result.created);
      if (!retry) throw new Error('Concurrent order retry did not return the existing order.');
      expect(retry).toMatchObject({ created: false, order: { id: createdOrderId } });
      expect(retry.order.invoiceUrl).not.toBe(created.order.invoiceUrl);
      const sequentialRetry = await createPendingOrder(input);
      expect(sequentialRetry).toMatchObject({ created: false, order: { id: createdOrderId } });
      expect(await database.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ stock: 6 });
      expect(await database.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
      expect(await database.order.findUniqueOrThrow({ where: { id: createdOrderId } })).toMatchObject({
        userId: user.id,
      });
      expect(await database.invoiceAccess.count({ where: { orderId: createdOrderId } })).toBe(3);
      expect(await database.inventoryReservation.count({ where: { orderId: createdOrderId } })).toBe(1);
    } finally {
      if (orderId) await database.order.delete({ where: { id: orderId } });
      await database.user.delete({ where: { id: user.id } });
      await database.product.delete({ where: { id: product.id } });
      await database.category.delete({ where: { id: category.id } });
    }
  });

  it('uses selected variant prices and reserves each variant stock independently', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-with-more-than-thirty-two-characters');
    const unique = randomUUID();
    const admin = await database.user.create({
      data: { email: `variant-admin-${unique}@example.test`, role: 'ADMIN' },
    });
    const category = await database.category.create({
      data: { name: `Variant ${unique}`, slug: `variant-${unique}`, description: 'Variant fixture' },
    });
    const product = await database.product.create({
      data: {
        name: `Variant product ${unique}`,
        slug: `variant-product-${unique}`,
        shortDescription: 'Variant fixture',
        description: 'Variant fixture for order pricing.',
        price: 12_000,
        image: 'https://example.test/variant-product.png',
        sku: `VARIANT-${unique}`,
        stock: 0,
        published: true,
        categoryId: category.id,
        variants: {
          create: [
            { name: 'Blue / Large', sku: `BLUE-${unique}`, price: 14_500, stock: 5 },
            { name: 'Red / Large', sku: `RED-${unique}`, stock: 3 },
          ],
        },
      },
      include: { variants: true },
    });
    const [blue, red] = product.variants;
    const cart = await database.cart.create({
      data: {
        expiresAt: new Date(Date.now() + 60_000),
        items: {
          create: [
            { productId: product.id, variantId: blue.id, lineKey: `variant:${blue.id}`, quantity: 2 },
            { productId: product.id, variantId: red.id, lineKey: `variant:${red.id}`, quantity: 1 },
          ],
        },
      },
    });
    let orderId: string | null = null;

    try {
      const result = await createPendingOrder({
        cartId: cart.id,
        idempotencyKey: randomUUID(),
        customer: guestCheckoutSchema.parse({
          fullName: 'Variant Customer',
          email: `variant-${unique}@example.test`,
          phone: '08012345678',
          deliveryMethod: 'pickup',
        }),
      });
      orderId = result.order.id;

      expect(result.order.total).toBe(41_000);
      expect(await database.productVariant.findUniqueOrThrow({ where: { id: blue.id } })).toMatchObject({ stock: 3 });
      expect(await database.productVariant.findUniqueOrThrow({ where: { id: red.id } })).toMatchObject({ stock: 2 });
      const order = await database.order.findUniqueOrThrow({
        where: { id: result.order.id },
        include: { items: true, reservations: true },
      });
      expect(order.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ variantId: blue.id, variantName: blue.name, unitPrice: 14_500, quantity: 2 }),
        expect.objectContaining({ variantId: red.id, variantName: red.name, unitPrice: 12_000, quantity: 1 }),
      ]));
      expect(order.reservations.map((reservation) => reservation.variantId)).toEqual(
        expect.arrayContaining([blue.id, red.id]),
      );
      await cancelOrder(order.id, 'Variant inventory test cleanup', admin.id);
      expect(await database.productVariant.findUniqueOrThrow({ where: { id: blue.id } })).toMatchObject({ stock: 5 });
      expect(await database.productVariant.findUniqueOrThrow({ where: { id: red.id } })).toMatchObject({ stock: 3 });
    } finally {
      if (orderId) await database.order.delete({ where: { id: orderId } });
      await database.cart.delete({ where: { id: cart.id } });
      await database.product.delete({ where: { id: product.id } });
      await database.category.delete({ where: { id: category.id } });
      await database.user.delete({ where: { id: admin.id } });
    }
  });

  it('expires an unpaid order and releases its inventory exactly once', async () => {
    const unique = randomUUID();
    const category = await database.category.create({
      data: { name: `Expiry ${unique}`, slug: `expiry-${unique}`, description: 'Expiry fixture' },
    });
    const product = await database.product.create({
      data: {
        name: `Expiry product ${unique}`,
        slug: `expiry-product-${unique}`,
        shortDescription: 'Expiry fixture',
        description: 'Expiry fixture',
        price: 5_000,
        image: 'https://example.test/expiry-product.png',
        sku: `EXPIRY-${unique}`,
        stock: 3,
        categoryId: category.id,
      },
    });
    const expiredAt = new Date(Date.now() - 60_000);
    const order = await database.order.create({
      data: {
        customerName: 'Phase Five',
        status: 'pending_payment',
        total: 10_000,
        expiresAt: expiredAt,
        items: { create: { productId: product.id, name: product.name, quantity: 2, unitPrice: product.price } },
        reservations: { create: { productId: product.id, lineKey: `product:${product.id}`, quantity: 2, expiresAt: expiredAt } },
        payment: {
          create: {
            method: 'bank_transfer',
            reference: `DG-${unique}`,
            status: 'pending',
            amount: 10_000,
          },
        },
      },
    });

    try {
      const runs = await Promise.all([expirePendingOrders(), expirePendingOrders()]);
      expect(runs.reduce((total, result) => total + result.expiredCount, 0)).toBe(1);
      expect(await database.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'expired' });
      expect(await database.payment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({ status: 'expired' });
      expect(await database.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ stock: 5 });
      expect(await database.inventoryReservation.count({
        where: { orderId: order.id, releasedAt: { not: null } },
      })).toBe(1);

      expect(await expirePendingOrders()).toEqual({ expiredCount: 0 });
      expect(await database.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ stock: 5 });
    } finally {
      await database.order.delete({ where: { id: order.id } });
      await database.product.delete({ where: { id: product.id } });
      await database.category.delete({ where: { id: category.id } });
    }
  });

  it('reports and confirms a manual bank transfer idempotently', async () => {
    const unique = randomUUID();
    const invoiceToken = randomBytes(32).toString('base64url');
    const admin = await database.user.create({ data: { email: `phase5-admin-${unique}@example.test`, role: 'ADMIN' } });
    const category = await database.category.create({
      data: { name: `Payment ${unique}`, slug: `payment-${unique}`, description: 'Payment fixture' },
    });
    const product = await database.product.create({
      data: {
        name: `Payment product ${unique}`,
        slug: `payment-product-${unique}`,
        shortDescription: 'Payment fixture',
        description: 'Payment fixture',
        price: 5_000,
        image: 'https://example.test/payment-product.png',
        sku: `PAYMENT-${unique}`,
        stock: 2,
        categoryId: category.id,
      },
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const order = await database.order.create({
      data: {
        customerName: 'Phase Five',
        customerEmail: `customer-${unique}@example.test`,
        status: 'pending_payment',
        total: 5_000,
        expiresAt,
        items: { create: { productId: product.id, name: product.name, quantity: 1, unitPrice: product.price } },
        reservations: { create: { productId: product.id, lineKey: `product:${product.id}`, quantity: 1, expiresAt } },
        invoiceAccesses: { create: { tokenHash: hashInvoiceToken(invoiceToken) } },
        payment: {
          create: {
            method: 'bank_transfer',
            reference: `DG-${unique}`,
            status: 'pending',
            amount: 5_000,
          },
        },
      },
    });

    try {
      const report = { token: invoiceToken, bankTransferReference: `TRANSFER-${unique}` };
      expect(await reportBankTransfer(report)).toMatchObject({ status: 'under_review' });
      expect(await reportBankTransfer(report)).toMatchObject({ status: 'under_review' });
      expect(await database.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
        status: 'payment_under_review',
      });
      expect(await database.payment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
        status: 'under_review',
        bankTransferReference: report.bankTransferReference,
      });

      expect(await confirmOrderPayment(order.id, admin.id)).toMatchObject({
        status: 'confirmed',
        alreadyConfirmed: false,
      });
      expect(await confirmOrderPayment(order.id, admin.id)).toMatchObject({
        status: 'confirmed',
        alreadyConfirmed: true,
      });
      expect(await database.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
        status: 'confirmed',
      });
      expect(await database.payment.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
        status: 'confirmed',
        confirmedById: admin.id,
        confirmedAt: expect.any(Date),
      });
      expect(await database.auditLog.count({
        where: { entityId: order.id, action: 'order.payment.confirmed' },
      })).toBe(1);
      expect(await database.notification.count({
        where: { orderId: order.id, eventType: { in: ['payment_under_review', 'payment_confirmed'] } },
      })).toBe(3);
    } finally {
      await database.notification.deleteMany({ where: { orderId: order.id } });
      await database.auditLog.deleteMany({ where: { entityId: order.id } });
      await database.order.delete({ where: { id: order.id } });
      await database.user.delete({ where: { id: admin.id } });
      await database.product.delete({ where: { id: product.id } });
      await database.category.delete({ where: { id: category.id } });
    }
  });

  it('consumes administrator recovery codes only once', async () => {
    vi.stubEnv('ADMIN_MFA_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
    const code = generateAdminRecoveryCodes(1)[0];
    const user = await database.user.create({
      data: {
        email: `phase5-mfa-${randomUUID()}@example.test`,
        role: 'ADMIN',
        mfaSecret: encryptAdminTotpSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),
        mfaEnabledAt: new Date(),
        adminRecoveryCodes: { create: { tokenHash: hashAdminRecoveryCode(code) } },
      },
    });

    try {
      const input = {
        userId: user.id,
        encryptedSecret: user.mfaSecret ?? '',
        lastUsedStep: user.mfaLastStep,
        code,
      };
      expect(await consumeAdminSecondFactor(input)).toBe(true);
      expect(await consumeAdminSecondFactor(input)).toBe(false);
      expect(await database.adminRecoveryCode.findFirstOrThrow({
        where: { userId: user.id },
      })).toMatchObject({ usedAt: expect.any(Date) });
    } finally {
      await database.user.delete({ where: { id: user.id } });
    }
  });

  it('rejects existing administrator sessions until MFA has been provisioned', async () => {
    const user = await database.user.create({
      data: { email: `phase5-admin-unenrolled-${randomUUID()}@example.test`, role: 'ADMIN' },
    });
    const sessionCallback = authConfig.callbacks?.session;
    if (!sessionCallback) throw new Error('Auth session callback is not configured.');

    try {
      const session = await sessionCallback({
        session: {
          user: { id: user.id, role: 'ADMIN', email: user.email },
          expires: new Date(Date.now() + 60_000).toISOString(),
        } satisfies Session,
        token: { sub: user.id, authVersion: user.authVersion } satisfies JWT,
        user: { id: user.id, email: user.email, emailVerified: null } satisfies AdapterUser,
        newSession: undefined,
        trigger: 'update',
      });
      expect(session.user).toMatchObject({ id: '', role: 'CUSTOMER' });
    } finally {
      await database.user.delete({ where: { id: user.id } });
    }
  });

  it('throttles repeated administrator sign-in failures and clears the lock after successful sign-in', async () => {
    const user = await database.user.create({
      data: { email: `phase5-admin-throttle-${randomUUID()}@example.test`, role: 'ADMIN' },
    });
    const now = new Date();

    try {
      expect(await isAdminLoginBlocked(user.id, now)).toBe(false);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await recordAdminLoginFailure(user.id, now);
      }
      expect(await isAdminLoginBlocked(user.id, now)).toBe(true);
      expect(await isAdminLoginBlocked(user.id, new Date(now.getTime() + 15 * 60 * 1000))).toBe(false);
      await clearAdminLoginFailures(user.id);
      expect(await database.adminAuthThrottle.findUnique({ where: { userId: user.id } })).toBeNull();
    } finally {
      await database.user.delete({ where: { id: user.id } });
    }
  });

  it('lets an admin recover a password without removing MFA and revokes existing sessions', async () => {
    vi.stubEnv('ADMIN_MFA_ENCRYPTION_KEY', Buffer.alloc(32, 4).toString('base64'));
    const email = `phase5-admin-reset-${randomUUID()}@example.test`;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const identifier = `password-reset:${email}`;
    const user = await database.user.create({
      data: {
        email,
        role: 'ADMIN',
        password: await hashPassword('old-admin-password'),
        mfaSecret: encryptAdminTotpSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),
        mfaEnabledAt: new Date(),
      },
    });
    await database.verificationToken.create({
      data: { identifier, token: tokenHash, expires: new Date(Date.now() + 60_000) },
    });

    try {
      expect(await updatePassword(token, 'new-admin-password-123')).toBe(true);
      const updated = await database.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updated.authVersion).toBe(user.authVersion + 1);
      expect(updated.mfaEnabledAt).not.toBeNull();
      expect(updated.mfaSecret).toBe(user.mfaSecret);
      expect(await verifyPassword('new-admin-password-123', updated.password ?? '')).toBe(true);

      const sessionCallback = authConfig.callbacks?.session;
      if (!sessionCallback) throw new Error('Auth session callback is not configured.');
      const session = await sessionCallback({
        session: {
          user: { id: user.id, role: 'ADMIN', email },
          expires: new Date(Date.now() + 60_000).toISOString(),
        } satisfies Session,
        token: { sub: user.id, authVersion: user.authVersion } satisfies JWT,
        user: { id: user.id, email, emailVerified: null } satisfies AdapterUser,
        newSession: undefined,
        trigger: 'update',
      });
      expect(session.user).toMatchObject({ id: '', role: 'CUSTOMER' });
    } finally {
      await database.verificationToken.deleteMany({ where: { identifier } });
      await database.user.delete({ where: { id: user.id } });
    }
  });
});
