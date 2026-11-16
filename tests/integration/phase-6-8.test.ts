import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AdapterUser } from 'next-auth/adapters';
import type { Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { PrismaClient, type UserRole } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getMetrics } from '@/app/api/metrics/route';
import { POST as requestPasswordResetEndpoint } from '@/app/api/account/password-reset/route';
import { POST as adminLoginPreflight } from '@/app/api/auth/admin/preflight/route';
import { authConfig } from '@api/lib/auth';
import {
  completeCustomerRegistration,
  forceStaffPasswordReset,
  hasPendingStaffPasswordReset,
  registerCustomer,
  updatePassword,
} from '@api/lib/account-actions';
import { createAdminTotpSecret, encryptAdminTotpSecret } from '@api/lib/admin-mfa';
import { accountRegistrationSchema } from '@api/lib/account-validation';
import { adjustVariantStock, updateProductDetails } from '@api/lib/admin-products';
import { cancelOrder, recordOrderRefund } from '@api/lib/order-cancellation';
import { advanceOrderFulfillment } from '@api/lib/order-fulfillment';
import { mergeGuestCartIntoAccount } from '@api/lib/cart';
import { productUpdateSchema } from '@api/lib/product-validation';
import { dispatchNotificationBatch, retryFailedNotification } from '@api/lib/notifications';
import { prisma } from '@api/lib/prisma';
import { hashPassword, verifyPassword } from '@api/lib/security';

const database = new PrismaClient();
const fixedNow = new Date('2026-11-13T15:00:00.000Z');

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^degems_test_[a-z0-9_]+$/.test(decodeURIComponent(new URL(databaseUrl).pathname.slice(1)))) {
    throw new Error('Integration tests must use an isolated degems_test_<suffix> database.');
  }
  await database.$connect();
});

beforeEach(async () => {
  await database.notification.deleteMany();
});

afterAll(async () => {
  await database.$disconnect();
});

afterEach(async () => {
  await database.notification.deleteMany();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('administration and notification integration', () => {
  it('verifies staff passwords before requesting MFA without creating a session', async () => {
    vi.stubEnv('ADMIN_MFA_ENCRYPTION_KEY', Buffer.alloc(32, 11).toString('base64'));
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-with-more-than-thirty-two-characters');
    const email = `admin-preflight-${randomUUID()}@example.test`;
    const user = await database.user.create({
      data: {
        email,
        role: 'ADMIN',
        password: await hashPassword('correct-password'),
        mfaSecret: encryptAdminTotpSecret(createAdminTotpSecret()),
        mfaEnabledAt: fixedNow,
      },
    });

    try {
      const crossSiteResponse = await adminLoginPreflight(new Request('http://localhost/api/auth/admin/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
        body: JSON.stringify({ email, password: 'incorrect-password' }),
      }));
      expect(crossSiteResponse.status).toBe(403);

      const validResponse = await adminLoginPreflight(new Request('http://localhost/api/auth/admin/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ email, password: 'correct-password' }),
      }));
      expect(validResponse.status).toBe(200);
      const challengeResult = await validResponse.json() as { status: string; challenge: string };
      expect(challengeResult).toMatchObject({ status: 'mfa' });
      expect(challengeResult.challenge).toEqual(expect.any(String));
      expect(validResponse.headers.get('set-cookie')).toBeNull();

      const credentialsProvider = authConfig.providers.find(
        (provider) => typeof provider !== 'function' && provider.type === 'credentials',
      );
      if (!credentialsProvider || typeof credentialsProvider === 'function'
        || credentialsProvider.type !== 'credentials') {
        throw new Error('Credentials provider is not configured.');
      }
      expect(await credentialsProvider.authorize({
        adminLogin: 'true',
        adminChallenge: challengeResult.challenge,
        mfaCode: 'not-a-code',
      }, { body: {}, query: {}, headers: {}, method: 'POST' })).toBeNull();
      expect(await database.adminAuthThrottle.findUniqueOrThrow({ where: { userId: user.id } }))
        .toMatchObject({ failureCount: 1 });

      const invalidResponse = await adminLoginPreflight(new Request('http://localhost/api/auth/admin/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ email, password: 'incorrect-password' }),
      }));
      expect(invalidResponse.status).toBe(401);
      expect(await database.adminAuthThrottle.findUniqueOrThrow({ where: { userId: user.id } }))
        .toMatchObject({ failureCount: 2 });
    } finally {
      await database.user.delete({ where: { id: user.id } });
    }
  });

  it('requires MFA for staff sessions and permits a properly enrolled staff role', async () => {
    const user = await database.user.create({
      data: {
        email: `catalog-staff-${randomUUID()}@example.test`,
        role: 'CATALOG_STAFF',
        emailVerified: fixedNow,
      },
    });
    const sessionCallback = authConfig.callbacks?.session;
    if (!sessionCallback) throw new Error('Auth session callback is not configured.');

    const makeSession = () => ({
      session: {
        user: { id: user.id, role: 'CATALOG_STAFF' as UserRole, email: user.email },
        expires: new Date(Date.now() + 60_000).toISOString(),
      } satisfies Session,
      token: { sub: user.id, authVersion: 0 } satisfies JWT,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      } satisfies AdapterUser,
      newSession: undefined,
      trigger: 'update' as const,
    });

    try {
      expect((await sessionCallback(makeSession())).user).toMatchObject({ id: '', role: 'CUSTOMER' });
      await database.user.update({
        where: { id: user.id },
        data: { mfaSecret: 'encrypted-staff-secret', mfaEnabledAt: fixedNow },
      });
      expect((await sessionCallback(makeSession())).user).toMatchObject({ id: user.id, role: 'CATALOG_STAFF' });
    } finally {
      await database.user.delete({ where: { id: user.id } });
    }
  });

  it('retries failed notifications only after a transactional audited requeue', async () => {
    const fixture = await createOrderFixture({ orderStatus: 'confirmed', paymentStatus: 'confirmed' });
    const failed = await database.notification.create({
      data: {
        orderId: fixture.order.id,
        eventType: 'payment_confirmed',
        channel: 'email',
        status: 'failed',
        attempts: 6,
        lastError: 'smtp_unavailable',
      },
    });

    expect(await retryFailedNotification(failed.id, fixture.admin.id)).toEqual({ result: 'retried' });
    expect(await database.notification.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({
      status: 'queued',
      attempts: 0,
      lastError: null,
      lockedAt: null,
    });
    expect(await database.auditLog.findFirst({
      where: { entityId: failed.id, action: 'notification.retry.requested', actorId: fixture.admin.id },
    })).not.toBeNull();
    expect(await retryFailedNotification(failed.id, fixture.admin.id)).toMatchObject({ result: 'not_failed' });
  });

  it('audits variant stock changes and retains deactivated variants', async () => {
    const unique = randomUUID();
    const admin = await database.user.create({
      data: { email: `variant-stock-admin-${unique}@example.test`, role: 'ADMIN' },
    });
    const category = await database.category.create({
      data: { name: `Variant stock ${unique}`, slug: `variant-stock-${unique}`, description: 'Variant stock fixture' },
    });
    const product = await database.product.create({
      data: {
        name: `Variant stock product ${unique}`,
        slug: `variant-stock-product-${unique}`,
        shortDescription: 'Variant administration fixture',
        description: 'Variant administration integration fixture.',
        price: 1_000,
        image: 'https://example.test/variant-stock.png',
        sku: `VARIANT-STOCK-${unique}`,
        stock: 0,
        published: true,
        categoryId: category.id,
        variants: {
          create: {
            name: 'Blue',
            sku: `VARIANT-BLUE-${unique}`,
            stock: 4,
          },
        },
      },
      include: { variants: true },
    });
    const variant = product.variants[0];

    try {
      expect(await adjustVariantStock(variant.id, 3, 'Verified supplier delivery', admin.id)).toEqual({ stock: 7 });
      expect(await database.auditLog.findFirst({
        where: { entityType: 'ProductVariant', entityId: variant.id, action: 'product.variant.stock.adjusted' },
      })).not.toBeNull();

      const input = productUpdateSchema.parse({
        name: product.name,
        sku: product.sku,
        categorySlug: 'kitchen-dining',
        subcategory: '',
        shortDescription: product.shortDescription,
        description: product.description,
        price: 10,
        stock: 0,
        image: product.image,
        gallery: [],
        variants: [{
          id: variant.id,
          name: 'Blue',
          sku: variant.sku,
          stock: 7,
          active: false,
        }],
        featured: false,
        published: true,
      });
      await updateProductDetails(product.id, input, admin.id);
      expect(await database.productVariant.findUniqueOrThrow({ where: { id: variant.id } }))
        .toMatchObject({ active: false, stock: 7 });
      expect(await database.auditLog.findFirst({
        where: { actorId: admin.id, entityId: product.id, action: 'product.updated' },
      })).not.toBeNull();
    } finally {
      await database.product.delete({ where: { id: product.id } });
      await database.category.delete({ where: { id: category.id } });
      await database.user.delete({ where: { id: admin.id } });
    }
  });

  it('merges guest quantities into an account cart and claims a guest cart when no account cart exists', async () => {
    const unique = randomUUID();
    const user = await database.user.create({ data: { email: `cart-${unique}@example.test` } });
    const secondUser = await database.user.create({ data: { email: `cart-empty-${unique}@example.test` } });
    const category = await database.category.create({
      data: { name: `Cart ${unique}`, slug: `cart-${unique}`, description: 'Cart migration fixture' },
    });
    const product = await database.product.create({
      data: {
        name: `Cart product ${unique}`,
        slug: `cart-product-${unique}`,
        shortDescription: 'Cart migration fixture',
        description: 'Cart migration fixture',
        price: 250,
        image: 'https://example.test/cart-product.png',
        sku: `CART-${unique}`,
        stock: 20,
        categoryId: category.id,
      },
    });
    const accountCart = await database.cart.create({
      data: {
        userId: user.id,
        items: { create: { productId: product.id, lineKey: `product:${product.id}`, quantity: 2 } },
      },
    });
    const guestCart = await database.cart.create({
      data: {
        guestToken: createHash('sha256').update(randomUUID()).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
        items: { create: { productId: product.id, lineKey: `product:${product.id}`, quantity: 3 } },
      },
    });
    const guestCartToClaim = await database.cart.create({
      data: {
        guestToken: createHash('sha256').update(randomUUID()).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
        items: { create: { productId: product.id, lineKey: `product:${product.id}`, quantity: 4 } },
      },
    });

    try {
      expect(await mergeGuestCartIntoAccount(user.id, guestCart.id)).toBe(accountCart.id);
      expect(await database.cartItem.findUniqueOrThrow({
        where: { cartId_lineKey: { cartId: accountCart.id, lineKey: `product:${product.id}` } },
      })).toMatchObject({ quantity: 5 });
      expect(await database.cart.findUnique({ where: { id: guestCart.id } })).toBeNull();

      expect(await mergeGuestCartIntoAccount(secondUser.id, guestCartToClaim.id)).toBe(guestCartToClaim.id);
      expect(await database.cart.findUniqueOrThrow({ where: { id: guestCartToClaim.id } }))
        .toMatchObject({ userId: secondUser.id, guestToken: null, expiresAt: null });
      expect(await database.cartItem.findUniqueOrThrow({
        where: { cartId_lineKey: { cartId: guestCartToClaim.id, lineKey: `product:${product.id}` } },
      })).toMatchObject({ quantity: 4 });
    } finally {
      await database.user.deleteMany({ where: { id: { in: [user.id, secondUser.id] } } });
      await database.product.delete({ where: { id: product.id } });
      await database.category.delete({ where: { id: category.id } });
    }
  });

  it('creates an unverified customer and queues a protected verification email', async () => {
    const email = `register-${randomUUID()}@example.test`;
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-with-more-than-thirty-two-characters');
    const input = accountRegistrationSchema.parse({
      name: 'New Customer',
      email,
    });

    try {
      await registerCustomer(input);
      await registerCustomer(input);

      expect(await database.user.findUnique({ where: { email } })).toBeNull();
      expect(await database.pendingAccount.findUniqueOrThrow({ where: { email } })).toMatchObject({
        name: 'New Customer',
      });

      const tokens = await database.verificationToken.findMany({
        where: { identifier: `email-verification:${email}` },
      });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].token).toMatch(/^[a-f0-9]{64}$/);
      expect(await database.notification.count({
        where: { recipient: email, eventType: 'account_verification', status: 'queued' },
      })).toBe(1);
      expect((await database.notification.findFirstOrThrow({
        where: { recipient: email, eventType: 'account_verification' },
      })).secretPayload).toMatch(/^v1\./);
    } finally {
      await database.verificationToken.deleteMany({ where: { identifier: `email-verification:${email}` } });
      await database.pendingAccount.deleteMany({ where: { email } });
      await database.user.deleteMany({ where: { email } });
    }
  });

  it('forces staff password reset, revokes sessions, and queues a protected reset email', async () => {
    const unique = randomUUID();
    const admin = await database.user.create({
      data: { email: `reset-owner-${unique}@example.test`, role: 'ADMIN' },
    });
    const email = `reset-staff-${unique}@example.test`;
    const staff = await database.user.create({
      data: {
        email,
        role: 'CATALOG_STAFF',
        emailVerified: fixedNow,
        password: await hashPassword('existing-staff-password'),
      },
    });
    const identifier = `staff-password-reset:${email}`;
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-with-more-than-thirty-two-characters');

    try {
      expect(await forceStaffPasswordReset(staff.id, admin.id)).toBe(email);
      const updatedStaff = await database.user.findUniqueOrThrow({ where: { id: staff.id } });
      expect(updatedStaff.authVersion).toBe(1);
      expect(await hasPendingStaffPasswordReset(email)).toBe(true);
      expect(await database.verificationToken.findFirst({ where: { identifier } })).toMatchObject({
        token: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      await database.verificationToken.updateMany({
        where: { identifier },
        data: { expires: fixedNow },
      });
      expect(await hasPendingStaffPasswordReset(email)).toBe(true);
      const credentialsProvider = authConfig.providers.find(
        (provider) => typeof provider !== 'function' && provider.type === 'credentials',
      );
      if (!credentialsProvider || typeof credentialsProvider === 'function'
        || credentialsProvider.type !== 'credentials') {
        throw new Error('Credentials provider is not configured.');
      }
      expect(await credentialsProvider.authorize({
        email,
        password: 'existing-staff-password',
        mfaCode: '',
      }, { body: {}, query: {}, headers: {}, method: 'POST' })).toBeNull();
      expect(await database.adminAuthThrottle.count({ where: { userId: staff.id } })).toBe(0);
      expect(await database.notification.findFirst({
        where: { recipient: email, eventType: 'staff_password_reset', status: 'queued' },
      })).toMatchObject({ secretPayload: expect.stringMatching(/^v1\./) });
      expect(await database.auditLog.findFirst({
        where: { actorId: admin.id, entityId: staff.id, action: 'staff.password.reset.required' },
      })).not.toBeNull();

      const sessionCallback = authConfig.callbacks?.session;
      if (!sessionCallback) throw new Error('Auth session callback is not configured.');
      const staleSession = await sessionCallback({
        session: {
          user: { id: staff.id, role: 'CATALOG_STAFF', email },
          expires: new Date(Date.now() + 60_000).toISOString(),
        } satisfies Session,
        token: { sub: staff.id, authVersion: 0 } satisfies JWT,
        user: { id: staff.id, email, emailVerified: staff.emailVerified } satisfies AdapterUser,
        newSession: undefined,
        trigger: 'update',
      });
      expect(staleSession.user).toMatchObject({ id: '', role: 'CUSTOMER' });
    } finally {
      await database.notification.deleteMany({ where: { recipient: email } });
      await database.verificationToken.deleteMany({ where: { identifier } });
      await database.auditLog.deleteMany({ where: { entityId: staff.id } });
      await database.user.deleteMany({ where: { id: { in: [staff.id, admin.id] } } });
    }
  });

  it('consumes a forced staff password reset token once', async () => {
    const unique = randomUUID();
    const email = `forced-reset-${unique}@example.test`;
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const staff = await database.user.create({
      data: {
        email,
        role: 'FINANCE_STAFF',
        emailVerified: fixedNow,
        password: await hashPassword('before-forced-reset-password'),
      },
    });

    try {
      await database.verificationToken.create({
        data: {
          identifier: `staff-password-reset:${email}`,
          token: tokenHash,
          expires: new Date(Date.now() + 60_000),
        },
      });
      expect(await updatePassword(rawToken, 'after-forced-reset-password')).toBe(true);
      expect(await updatePassword(rawToken, 'another-forced-reset-password')).toBe(false);
      expect(await hasPendingStaffPasswordReset(email)).toBe(false);
      const updatedStaff = await database.user.findUniqueOrThrow({ where: { id: staff.id } });
      expect(updatedStaff.authVersion).toBe(1);
      expect(await verifyPassword('after-forced-reset-password', updatedStaff.password ?? '')).toBe(true);
      expect(await database.auditLog.findFirst({
        where: { entityId: staff.id, action: 'account.password.reset.completed' },
      })).not.toBeNull();
    } finally {
      await database.verificationToken.deleteMany({ where: { identifier: `staff-password-reset:${email}` } });
      await database.auditLog.deleteMany({ where: { entityId: staff.id } });
      await database.user.deleteMany({ where: { id: staff.id } });
    }
  });

  it('consumes email verification and password reset tokens once', async () => {
    const email = `account-${randomUUID()}@example.test`;
    const verificationToken = randomBytes(32).toString('base64url');
    const resetToken = randomBytes(32).toString('base64url');
    const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

    try {
      await database.pendingAccount.create({
        data: {
          email,
          name: 'Verified Customer',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await database.verificationToken.create({
        data: {
          identifier: `email-verification:${email}`,
          token: hashToken(verificationToken),
          expires: new Date(Date.now() + 60_000),
        },
      });
      expect(await completeCustomerRegistration(verificationToken, 'original-password')).toBe(true);
      expect(await completeCustomerRegistration(verificationToken, 'another-password')).toBe(false);
      const user = await database.user.findUniqueOrThrow({ where: { email } });
      expect(await database.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
        role: 'CUSTOMER',
        emailVerified: expect.any(Date),
      });

      await database.verificationToken.create({
        data: {
          identifier: `password-reset:${email}`,
          token: hashToken(resetToken),
          expires: new Date(Date.now() + 60_000),
        },
      });
      expect(await updatePassword(resetToken, 'replacement-password')).toBe(true);
      expect(await updatePassword(resetToken, 'another-password')).toBe(false);
      const updatedUser = await database.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(updatedUser.authVersion).toBe(1);
      expect(await verifyPassword('replacement-password', updatedUser.password ?? '')).toBe(true);
      expect(await verifyPassword('original-password', updatedUser.password ?? '')).toBe(false);

      const sessionCallback = authConfig.callbacks?.session;
      if (!sessionCallback) throw new Error('Auth session callback is not configured.');
      const staleSession = await sessionCallback({
        session: {
          user: { id: user.id, role: 'CUSTOMER', email },
          expires: new Date(Date.now() + 60_000).toISOString(),
        } satisfies Session,
        token: { sub: user.id, authVersion: 0 } satisfies JWT,
        user: { id: user.id, email, emailVerified: updatedUser.emailVerified } satisfies AdapterUser,
        newSession: undefined,
        trigger: 'update',
      });
      expect(staleSession.user).toMatchObject({ id: '', role: 'CUSTOMER' });
    } finally {
      await database.verificationToken.deleteMany({
        where: { identifier: { in: [`email-verification:${email}`, `password-reset:${email}`] } },
      });
      await database.pendingAccount.deleteMany({ where: { email } });
      await database.user.deleteMany({ where: { email } });
    }
  });

  it('queues password recovery without disclosing account existence and limits repeated sends', async () => {
    const email = `recovery-${randomUUID()}@example.test`;
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-with-more-than-thirty-two-characters');
    vi.stubEnv('NEXTAUTH_URL', 'https://store.example.test');
    vi.stubEnv('SMTP_HOST', 'smtp.example.test');
    vi.stubEnv('SMTP_PORT', '587');
    vi.stubEnv('SMTP_USER', 'test-user');
    vi.stubEnv('SMTP_PASSWORD', 'test-password');
    vi.stubEnv('SMTP_FROM', 'store@example.test');
    await database.user.create({
      data: {
        email,
        role: 'CUSTOMER',
        emailVerified: fixedNow,
        password: await hashPassword('original-password'),
      },
    });

    try {
      const requestReset = (address: string) => requestPasswordResetEndpoint(new Request('http://localhost/api/account/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      }));
      const knownResponse = await requestReset(email);
      const repeatedResponse = await requestReset(email);
      const unknownResponse = await requestReset(`missing-${email}`);
      expect(knownResponse.status).toBe(202);
      expect(repeatedResponse.status).toBe(202);
      expect(await unknownResponse.json()).toEqual(await knownResponse.clone().json());

      expect(await database.verificationToken.count({
        where: { identifier: `password-reset:${email}` },
      })).toBe(1);
      expect(await database.notification.count({
        where: { recipient: email, eventType: 'password_reset', status: 'queued' },
      })).toBe(1);
      expect(await database.notification.count({
        where: { eventType: 'password_reset', recipient: `missing-${email}` },
      })).toBe(0);
    } finally {
      await database.verificationToken.deleteMany({ where: { identifier: `password-reset:${email}` } });
      await database.user.deleteMany({ where: { email } });
    }
  });

  it('disables an existing customer session and preserves customer-safe role data', async () => {
    const user = await database.user.create({
      data: { email: `disabled-${randomUUID()}@example.test`, role: 'CUSTOMER', emailVerified: fixedNow },
    });
    const sessionCallback = authConfig.callbacks?.session;
    if (!sessionCallback) throw new Error('Auth session callback is not configured.');

    const makeSession = () => ({
      session: {
        user: { id: user.id, role: 'CUSTOMER' as UserRole, email: user.email },
        expires: new Date(Date.now() + 60_000).toISOString(),
      } satisfies Session,
      token: { sub: user.id } satisfies JWT,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      } satisfies AdapterUser,
      newSession: undefined,
      trigger: 'update' as const,
    });

    const activeSession = await sessionCallback(makeSession());
    expect(activeSession.user).toMatchObject({ id: user.id, role: 'CUSTOMER' });

    await database.user.update({ where: { id: user.id }, data: { emailVerified: null } });
    const unverifiedSession = await sessionCallback(makeSession());
    expect(unverifiedSession.user).toMatchObject({ id: '', role: 'CUSTOMER' });

    await database.user.update({ where: { id: user.id }, data: { emailVerified: fixedNow } });
    await database.user.update({ where: { id: user.id }, data: { disabledAt: fixedNow } });
    const disabledSession = await sessionCallback(makeSession());
    expect(disabledSession.user).toMatchObject({ id: '', role: 'CUSTOMER' });
  });

  it('cancels a paid order once, releases stock once, and records the actual refund reference', async () => {
    const fixture = await createOrderFixture({
      orderStatus: 'processing',
      paymentStatus: 'confirmed',
      reservedQuantity: 2,
      stockAfterReservation: 3,
    });

    const cancellation = await cancelOrder(fixture.order.id, 'Customer requested cancellation', fixture.admin.id);
    expect(cancellation).toMatchObject({ status: 'cancelled', paymentStatus: 'refund_pending', alreadyCancelled: false });
    expect(await database.product.findUniqueOrThrow({ where: { id: fixture.product.id } })).toMatchObject({ stock: 5 });

    const retry = await cancelOrder(fixture.order.id, 'Customer requested cancellation', fixture.admin.id);
    expect(retry.alreadyCancelled).toBe(true);
    expect(await database.product.findUniqueOrThrow({ where: { id: fixture.product.id } })).toMatchObject({ stock: 5 });

    const refundReference = `REF-${randomUUID().slice(0, 12).toUpperCase()}`;
    expect(await recordOrderRefund(fixture.order.id, refundReference, fixture.admin.id))
      .toMatchObject({ status: 'refunded', alreadyRefunded: false });
    expect(await recordOrderRefund(fixture.order.id, refundReference, fixture.admin.id))
      .toMatchObject({ status: 'refunded', alreadyRefunded: true });

    const payment = await database.payment.findUniqueOrThrow({ where: { orderId: fixture.order.id } });
    expect(payment).toMatchObject({ status: 'refunded', refundReference, refundedById: fixture.admin.id });
    expect(await database.inventoryReservation.count({
      where: { orderId: fixture.order.id, releasedAt: { not: null } },
    })).toBe(1);
  });

  it('rejects cancelling a shipped order without restoring its stock', async () => {
    const fixture = await createOrderFixture({
      orderStatus: 'shipped',
      paymentStatus: 'confirmed',
      reservedQuantity: 1,
      stockAfterReservation: 4,
    });

    await expect(cancelOrder(fixture.order.id, 'Too late to cancel', fixture.admin.id))
      .rejects.toMatchObject({ status: 409 });
    expect(await database.product.findUniqueOrThrow({ where: { id: fixture.product.id } })).toMatchObject({ stock: 4 });
    expect(await database.order.findUniqueOrThrow({ where: { id: fixture.order.id } })).toMatchObject({ status: 'shipped' });
  });

  it('requires carrier details before dispatch and records them on shipment', async () => {
    const fixture = await createOrderFixture({
      orderStatus: 'ready_for_dispatch',
      paymentStatus: 'confirmed',
      includeReservation: false,
    });

    await expect(advanceOrderFulfillment(fixture.order.id, 'shipped', fixture.admin.id))
      .rejects.toMatchObject({ status: 400 });
    const shipped = await advanceOrderFulfillment(fixture.order.id, 'shipped', fixture.admin.id, {
      provider: 'Test carrier',
      reference: 'TRACK-12345',
    });
    expect(shipped).toMatchObject({
      status: 'shipped',
      dispatchProvider: 'Test carrier',
      dispatchReference: 'TRACK-12345',
    });
  });

  it('retries failed notifications and recovers stale processing locks without network access', async () => {
    vi.stubEnv('NOTIFICATION_PROVIDER', 'discord');
    vi.stubEnv('NOTIFICATION_WEBHOOK_URL', 'https://discord.com/api/webhooks/test/token');
    const fixture = await createOrderFixture({ orderStatus: 'confirmed', paymentStatus: 'confirmed' });
    const queued = await database.notification.create({
      data: { orderId: fixture.order.id, eventType: 'payment_confirmed', channel: 'webhook' },
    });
    const send = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);

    const firstAttempt = await dispatchNotificationBatch();
    expect(firstAttempt.retryCount).toBe(1);
    const retry = await database.notification.findUniqueOrThrow({ where: { id: queued.id } });
    expect(retry).toMatchObject({ status: 'queued', attempts: 1, lastError: 'webhook_http_503' });
    expect(retry.availableAt.getTime()).toBeGreaterThan(Date.now());

    await dispatchNotificationBatch();
    expect(send).toHaveBeenCalledTimes(1);

    await database.notification.update({
      where: { id: queued.id },
      data: { availableAt: new Date(Date.now() - 1_000) },
    });
    const recoveredRetry = await dispatchNotificationBatch();
    expect(recoveredRetry.sentCount).toBe(1);
    expect(await database.notification.findUniqueOrThrow({ where: { id: queued.id } }))
      .toMatchObject({ status: 'sent', attempts: 2 });

    const stale = await database.notification.create({
      data: {
        orderId: fixture.order.id,
        eventType: 'payment_confirmed',
        channel: 'webhook',
        status: 'processing',
        attempts: 1,
        lockedAt: new Date(Date.now() - 6 * 60_000),
      },
    });
    const recoveredLock = await dispatchNotificationBatch();
    expect(recoveredLock.sentCount).toBe(1);
    expect(await database.notification.findUniqueOrThrow({ where: { id: stale.id } }))
      .toMatchObject({ status: 'sent', attempts: 2, lockedAt: null });
  });

  it('does not attempt queued notifications when delivery providers are not configured', async () => {
    vi.stubEnv('NOTIFICATION_PROVIDER', '');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_USER', '');
    vi.stubEnv('SMTP_PASSWORD', '');
    vi.stubEnv('SMTP_FROM', '');
    const fixture = await createOrderFixture({ orderStatus: 'confirmed', paymentStatus: 'confirmed' });
    const notification = await database.notification.create({
      data: { orderId: fixture.order.id, eventType: 'payment_confirmed', channel: 'webhook' },
    });

    const result = await dispatchNotificationBatch();
    expect(result.skippedForConfiguration).toBeGreaterThanOrEqual(1);
    expect(await database.notification.findUniqueOrThrow({ where: { id: notification.id } }))
      .toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('protects metrics and reports healthy and unavailable database health states', async () => {
    vi.stubEnv('METRICS_BEARER_TOKEN', 'test-metrics-token-that-is-at-least-32-chars');
    expect((await getMetrics(new Request('http://localhost/api/metrics'))).status).toBe(401);
    expect((await getMetrics(new Request('http://localhost/api/metrics', {
      headers: { authorization: 'Bearer wrong-token' },
    }))).status).toBe(401);

    const authorizedMetrics = await getMetrics(new Request('http://localhost/api/metrics', {
      headers: { authorization: 'Bearer test-metrics-token-that-is-at-least-32-chars' },
    }));
    expect(authorizedMetrics.status).toBe(200);
    expect(authorizedMetrics.headers.get('content-type')).toContain('text/plain');
    expect(await authorizedMetrics.text()).toContain('ecommerce_orders_current');

    const healthy = await getHealth();
    expect(healthy.status).toBe(200);
    expect(await healthy.json()).toMatchObject({ status: 'ok', database: 'ok' });

    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('simulated database outage'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unavailable = await getHealth();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ status: 'unavailable', database: 'unavailable' });
  });
});

async function createOrderFixture(input: {
  orderStatus: string;
  paymentStatus: string;
  reservedQuantity?: number;
  stockAfterReservation?: number;
  includeReservation?: boolean;
}) {
  const unique = randomUUID();
  const admin = await database.user.create({
    data: { email: `admin-${unique}@example.test`, role: 'ADMIN' },
  });
  const customer = await database.user.create({
    data: { email: `customer-${unique}@example.test`, role: 'CUSTOMER' },
  });
  const category = await database.category.create({
    data: { name: `Test ${unique}`, slug: `test-${unique}`, description: 'Integration fixture' },
  });
  const quantity = input.reservedQuantity ?? 1;
  const product = await database.product.create({
    data: {
      name: `Test product ${unique}`,
      slug: `test-product-${unique}`,
      shortDescription: 'Integration fixture',
      description: 'Integration fixture',
      price: 12_000,
      image: 'https://example.test/product.png',
      sku: `TEST-${unique}`,
      stock: input.stockAfterReservation ?? 3,
      categoryId: category.id,
    },
  });
  const order = await database.order.create({
    data: {
      customerName: 'Integration Test',
      customerEmail: customer.email,
      status: input.orderStatus,
      total: 12_000,
      items: {
        create: {
          productId: product.id,
          name: product.name,
          quantity,
          unitPrice: product.price,
        },
      },
      payment: {
        create: {
          method: 'bank_transfer',
          reference: `DG-${unique}`,
          status: input.paymentStatus,
          amount: 12_000,
        },
      },
      ...(input.includeReservation === false ? {} : {
        reservations: {
          create: {
            productId: product.id,
            lineKey: `product:${product.id}`,
            quantity,
            expiresAt: new Date(Date.now() + 60 * 60_000),
          },
        },
      }),
    },
  });
  return { admin, customer, category, product, order };
}
