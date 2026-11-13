import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { GuestCheckoutDetails } from '@/lib/checkout-validation';
import { quoteDelivery } from '@/lib/delivery';
import { recordOrderStatus, recordPaymentStatus, recordReservationEvent } from '@/lib/metrics';
import { enqueueOrderNotification } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';

const RESERVATION_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const orderSelect = {
  id: true,
  cartId: true,
  status: true,
  total: true,
  expiresAt: true,
  payment: { select: { reference: true } },
} satisfies Prisma.OrderSelect;

export class OrderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OrderRequestError';
  }
}

export async function createPendingOrder(input: {
  cartId: string;
  idempotencyKey: string;
  customer: GuestCheckoutDetails;
}) {
  const existingOrder = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: orderSelect,
  });
  if (existingOrder) return getIdempotentOrder(existingOrder, input.cartId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_WINDOW_MS);
  let reservationCount = 0;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const cart = await transaction.cart.findFirst({
        where: { id: input.cartId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  stock: true,
                  published: true,
                  variants: { where: { active: true }, select: { id: true } },
                },
              },
              variant: true,
            },
            orderBy: [{ productId: 'asc' }, { lineKey: 'asc' }],
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new OrderRequestError('Your cart is empty or has expired.', 409);
      }
      reservationCount = cart.items.length;

      const preparedItems = cart.items.map((item) => {
        const variant = item.variant?.productId === item.productId && item.variant.active
          ? item.variant
          : null;
        const hasVariants = item.product.variants.length > 0;
        return {
          ...item,
          variant: hasVariants ? variant : null,
          stock: variant?.stock ?? item.product.stock,
          price: variant?.price ?? item.product.price,
          variantValid: hasVariants ? Boolean(variant) : item.variantId === null,
        };
      });

      if (preparedItems.some((item) => !item.product.published || !item.variantValid)) {
        throw new OrderRequestError('One or more products are no longer available.', 409);
      }

      const delivery = await quoteDelivery(input.customer, transaction);
      const subtotal = preparedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const total = subtotal + delivery.deliveryFee;
      if (!Number.isSafeInteger(total) || total > MAX_DATABASE_INTEGER) {
        throw new OrderRequestError('The cart total exceeds the supported order amount.', 400);
      }

      const invoiceToken = randomBytes(32).toString('base64url');
      const paymentReference = `DG-${randomBytes(12).toString('hex').toUpperCase()}`;
      for (const item of preparedItems) {
        const reserved = item.variant
          ? await transaction.productVariant.updateMany({
              where: { id: item.variant.id, active: true, stock: { gte: item.quantity } },
              data: { stock: { decrement: item.quantity } },
            })
          : await transaction.product.updateMany({
              where: { id: item.productId, published: true, stock: { gte: item.quantity } },
              data: { stock: { decrement: item.quantity } },
            });
        if (reserved.count !== 1) {
          throw new OrderRequestError(`${item.product.name}${item.variant ? ` (${item.variant.name})` : ''} no longer has enough stock. Review your cart.`, 409);
        }
      }

      const order = await transaction.order.create({
        data: {
          cartId: cart.id,
          userId: cart.userId,
          idempotencyKey: input.idempotencyKey,
          customerName: input.customer.fullName,
          customerEmail: input.customer.email,
          customerPhone: input.customer.phone,
          deliveryMethod: delivery.deliveryMethod,
          deliveryFee: delivery.deliveryFee,
          deliveryZoneId: delivery.deliveryZoneId,
          deliveryZoneName: delivery.deliveryZoneName,
          deliveryAddress: delivery.deliveryAddress,
          status: 'pending_payment',
          total,
          currency: 'NGN',
          expiresAt,
          items: {
            create: preparedItems.map((item) => ({
              productId: item.productId,
              variantId: item.variant?.id,
              variantName: item.variant?.name,
              name: item.product.name,
              quantity: item.quantity,
              unitPrice: item.price,
            })),
          },
          reservations: {
            create: preparedItems.map((item) => ({
              productId: item.productId,
              variantId: item.variant?.id,
              lineKey: item.lineKey,
              quantity: item.quantity,
              expiresAt,
            })),
          },
          invoiceAccesses: { create: { tokenHash: hashInvoiceToken(invoiceToken) } },
          payment: {
            create: {
              method: 'bank_transfer',
              reference: paymentReference,
              status: 'pending',
              amount: total,
            },
          },
        },
        select: orderSelect,
      });

      await enqueueOrderNotification(transaction, {
        orderId: order.id,
        eventType: 'order_created',
        channel: 'webhook',
        invoiceToken,
      });
      if (input.customer.email) {
        await enqueueOrderNotification(transaction, {
          orderId: order.id,
          eventType: 'order_created',
          channel: 'email',
          recipient: input.customer.email,
          invoiceToken,
        });
      }
      await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
      return { order: publicOrder(order, invoiceToken), created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.created) {
      recordOrderStatus('pending_payment');
      recordPaymentStatus('pending', 'bank_transfer');
      recordReservationEvent('reserved', reservationCount);
    }
    return result;
  } catch (error) {
    if (error instanceof OrderRequestError) {
      if (error.status === 409) {
        const concurrentOrder = await prisma.order.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: orderSelect,
        });
        if (concurrentOrder) return getIdempotentOrder(concurrentOrder, input.cartId);
      }
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      const concurrentOrder = await prisma.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: orderSelect,
      });
      if (concurrentOrder) return getIdempotentOrder(concurrentOrder, input.cartId);
    }

    throw error;
  }
}

export async function expirePendingOrders(now = new Date(), batchSize = 100) {
  const candidates = await prisma.order.findMany({
    where: { status: { in: ['pending_payment', 'payment_under_review'] }, expiresAt: { lte: now } },
    select: { id: true, customerEmail: true },
    orderBy: { expiresAt: 'asc' },
    take: batchSize,
  });

  let expiredCount = 0;
  for (const candidate of candidates) {
    let result: { expired: boolean; releasedCount: number };
    try {
      result = await prisma.$transaction(async (transaction) => {
        const claimed = await transaction.order.updateMany({
          where: { id: candidate.id, status: { in: ['pending_payment', 'payment_under_review'] }, expiresAt: { lte: now } },
          data: { status: 'expired' },
        });
        if (claimed.count === 0) return { expired: false, releasedCount: 0 };

        await transaction.payment.updateMany({
          where: { orderId: candidate.id, status: { in: ['pending', 'under_review'] } },
          data: { status: 'expired' },
        });

        const reservations = await transaction.inventoryReservation.findMany({
          where: { orderId: candidate.id, releasedAt: null },
          select: { id: true, productId: true, variantId: true, quantity: true },
        });

        let releasedCount = 0;
        for (const reservation of reservations) {
          const released = await transaction.inventoryReservation.updateMany({
            where: { id: reservation.id, releasedAt: null },
            data: { releasedAt: now },
          });
          if (released.count === 1) {
            if (reservation.variantId) {
              await transaction.productVariant.update({
                where: { id: reservation.variantId },
                data: { stock: { increment: reservation.quantity } },
              });
            } else {
              await transaction.product.update({
                where: { id: reservation.productId },
                data: { stock: { increment: reservation.quantity } },
              });
            }
            releasedCount += 1;
          }
        }

        await transaction.auditLog.create({
          data: {
            action: 'order.expired',
            entityType: 'Order',
            entityId: candidate.id,
            details: { expiredAt: now.toISOString(), reservationsReleased: releasedCount },
          },
        });
        await enqueueOrderNotification(transaction, {
          orderId: candidate.id,
          eventType: 'order_expired',
          channel: 'webhook',
        });
        if (candidate.customerEmail) {
          await enqueueOrderNotification(transaction, {
            orderId: candidate.id,
            eventType: 'order_expired',
            channel: 'email',
            recipient: candidate.customerEmail,
          });
        }

        return { expired: true, releasedCount };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;

      const currentOrder = await prisma.order.findUnique({
        where: { id: candidate.id },
        select: { status: true, expiresAt: true },
      });
      if (!currentOrder
        || !['pending_payment', 'payment_under_review'].includes(currentOrder.status)
        || !currentOrder.expiresAt
        || currentOrder.expiresAt > now) {
        continue;
      }
      throw error;
    }

    if (result.expired) {
      expiredCount += 1;
      recordOrderStatus('expired');
      recordPaymentStatus('expired', 'bank_transfer');
      recordReservationEvent('released', result.releasedCount);
    }
  }

  return { expiredCount };
}

async function getIdempotentOrder(
  order: {
    id: string;
    cartId: string | null;
    status: string;
    total: number;
    expiresAt: Date | null;
    payment: { reference: string } | null;
  },
  cartId: string,
) {
  if (order.cartId !== cartId) {
    throw new OrderRequestError('This idempotency key was already used.', 409);
  }
  if (!order.payment) throw new OrderRequestError('Payment details are unavailable for this order.', 409);

  const invoiceToken = randomBytes(32).toString('base64url');
  await prisma.invoiceAccess.create({
    data: { orderId: order.id, tokenHash: hashInvoiceToken(invoiceToken) },
  });
  return { order: publicOrder(order, invoiceToken), created: false };
}

function publicOrder(
  order: { id: string; status: string; total: number; expiresAt: Date | null; payment: { reference: string } | null },
  invoiceToken: string,
) {
  if (!order.payment) throw new OrderRequestError('Payment details are unavailable for this order.', 409);
  return {
    id: order.id,
    reference: `DG-${order.id.slice(0, 8).toUpperCase()}`,
    status: order.status,
    total: order.total,
    currency: 'NGN',
    expiresAt: order.expiresAt,
    paymentReference: order.payment.reference,
    invoiceUrl: `/invoice/${invoiceToken}`,
  };
}

export function hashInvoiceToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

