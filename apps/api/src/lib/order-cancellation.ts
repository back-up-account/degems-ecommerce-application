import { Prisma } from '@prisma/client';
import { enqueueOrderNotification } from '@api/lib/notifications';
import { recordOrderStatus, recordPaymentStatus, recordReservationEvent } from '@api/lib/metrics';
import { prisma } from '@api/lib/prisma';

const cancellableStatuses = ['pending_payment', 'payment_under_review', 'confirmed', 'processing', 'ready_for_dispatch'];

export class OrderCancellationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OrderCancellationError';
  }
}

export async function cancelOrder(orderId: string, reason: string, adminId: string) {
  let releasedReservationCount = 0;
  const result = await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { payment: true, items: true, reservations: true },
    });
    if (!order) throw new OrderCancellationError('Order not found.', 404);
    if (order.status === 'cancelled') {
      return {
        status: order.status,
        paymentStatus: order.payment?.status ?? null,
        alreadyCancelled: true,
      };
    }
    if (!cancellableStatuses.includes(order.status)) {
      throw new OrderCancellationError('Orders cannot be cancelled after dispatch or completion.', 409);
    }
    if (!order.payment || !['pending', 'under_review', 'confirmed'].includes(order.payment.status)) {
      throw new OrderCancellationError('The payment state does not allow cancellation. Resolve the order manually.', 409);
    }
    if (order.items.length > 0 && order.reservations.length !== order.items.length) {
      throw new OrderCancellationError('Inventory reservations are incomplete. Resolve stock manually before cancelling.', 409);
    }

    const paymentStatus = order.payment.status === 'confirmed' ? 'refund_pending' : 'cancelled';
    const updatedOrder = await transaction.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: 'cancelled', cancellationReason: reason, cancelledAt: new Date() },
    });
    const updatedPayment = await transaction.payment.updateMany({
      where: { id: order.payment.id, status: order.payment.status },
      data: { status: paymentStatus },
    });
    if (updatedOrder.count !== 1 || updatedPayment.count !== 1) {
      throw new OrderCancellationError('Order or payment changed at the same time. Reload and try again.', 409);
    }

    for (const reservation of order.reservations) {
      if (reservation.releasedAt) continue;
      const released = await transaction.inventoryReservation.updateMany({
        where: { id: reservation.id, releasedAt: null },
        data: { releasedAt: new Date() },
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
        releasedReservationCount += 1;
      }
    }

    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'order.cancelled',
        entityType: 'Order',
        entityId: order.id,
        details: {
          reason,
          previousStatus: order.status,
          previousPaymentStatus: order.payment.status,
          paymentStatus,
          inventoryRestored: order.reservations.reduce(
            (total, reservation) => total + (reservation.releasedAt ? 0 : reservation.quantity),
            0,
          ),
        },
      },
    });
    const notificationDetails = { reason, paymentStatus };
    await enqueueOrderNotification(transaction, {
      orderId: order.id,
      eventType: 'order_cancelled',
      channel: 'webhook',
      payload: notificationDetails,
    });
    if (order.customerEmail) {
      await enqueueOrderNotification(transaction, {
        orderId: order.id,
        eventType: 'order_cancelled',
        channel: 'email',
        recipient: order.customerEmail,
        payload: notificationDetails,
      });
    }

    return { status: 'cancelled', paymentStatus, alreadyCancelled: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!result.alreadyCancelled) {
    recordOrderStatus('cancelled');
    recordPaymentStatus(result.paymentStatus ?? 'cancelled', 'bank_transfer');
    recordReservationEvent('released', releasedReservationCount);
  }
  return result;
}

export async function recordOrderRefund(orderId: string, refundReference: string, adminId: string) {
  const result = await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order?.payment) throw new OrderCancellationError('Order or payment record not found.', 404);

    if (order.status !== 'cancelled') {
      throw new OrderCancellationError('Only a cancelled order can be refunded.', 409);
    }
    if (order.payment.status === 'refunded' && order.payment.refundReference === refundReference) {
      return { status: 'refunded', alreadyRefunded: true };
    }
    if (order.payment.status !== 'refund_pending') {
      throw new OrderCancellationError('This order is not awaiting a refund.', 409);
    }

    const now = new Date();
    const updated = await transaction.payment.updateMany({
      where: { id: order.payment.id, status: 'refund_pending' },
      data: { status: 'refunded', refundReference, refundedAt: now, refundedById: adminId },
    });
    if (updated.count !== 1) {
      throw new OrderCancellationError('Refund status changed at the same time. Reload and try again.', 409);
    }

    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'order.refund.recorded',
        entityType: 'Order',
        entityId: order.id,
        details: {
          paymentId: order.payment.id,
          refundReference,
          amountKobo: order.payment.amount,
        },
      },
    });
    const notificationDetails = { refundReference, amountKobo: order.payment.amount };
    await enqueueOrderNotification(transaction, {
      orderId: order.id,
      eventType: 'order_refunded',
      channel: 'webhook',
      payload: notificationDetails,
    });
    if (order.customerEmail) {
      await enqueueOrderNotification(transaction, {
        orderId: order.id,
        eventType: 'order_refunded',
        channel: 'email',
        recipient: order.customerEmail,
        payload: notificationDetails,
      });
    }

    return { status: 'refunded', alreadyRefunded: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!result.alreadyRefunded) recordPaymentStatus('refunded', 'bank_transfer');
  return result;
}
