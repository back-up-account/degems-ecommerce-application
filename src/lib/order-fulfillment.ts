import { Prisma } from '@prisma/client';
import { enqueueOrderNotification } from '@/lib/notifications';
import { recordOrderStatus } from '@/lib/metrics';
import { prisma } from '@/lib/prisma';
import { getFulfillmentAction, type FulfillmentTargetStatus } from '@/lib/order-fulfillment-status';

export class FulfillmentRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'FulfillmentRequestError';
  }
}

export async function advanceOrderFulfillment(
  orderId: string,
  nextStatus: FulfillmentTargetStatus,
  adminId: string,
  dispatch?: { provider: string; reference: string },
) {
  const result = await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        payment: { select: { status: true } },
        dispatchProvider: true,
        dispatchReference: true,
        customerEmail: true,
      },
    });

    if (!order) throw new FulfillmentRequestError('Order not found.', 404);
    if (order.payment?.status !== 'confirmed') {
      throw new FulfillmentRequestError('Only orders with confirmed payment can be fulfilled.', 409);
    }
    if (order.status === nextStatus) {
      return { status: nextStatus, alreadyUpdated: true };
    }

    const action = getFulfillmentAction(order.status);
    if (action?.next !== nextStatus) {
      throw new FulfillmentRequestError('This fulfillment transition is not allowed. Reload the order and try again.', 409);
    }
    if (nextStatus === 'shipped' && (!dispatch?.provider || !dispatch.reference)) {
      throw new FulfillmentRequestError('Enter the carrier and tracking reference before marking the order shipped.', 400);
    }

    const updated = await transaction.order.updateMany({
      where: { id: orderId, status: order.status },
      data: nextStatus === 'shipped'
        ? {
          status: nextStatus,
          dispatchProvider: dispatch?.provider,
          dispatchReference: dispatch?.reference,
        }
        : { status: nextStatus },
    });
    if (updated.count !== 1) {
      throw new FulfillmentRequestError('Order status changed at the same time. Reload and try again.', 409);
    }

    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'order.fulfillment.status_changed',
        entityType: 'Order',
        entityId: orderId,
        details: {
          fromStatus: order.status,
          toStatus: nextStatus,
          ...(nextStatus === 'shipped' ? dispatch : {}),
        },
      },
    });
    const notificationDetails = {
      fromStatus: order.status,
      toStatus: nextStatus,
      ...(nextStatus === 'shipped' ? dispatch : {}),
    };
    await enqueueOrderNotification(transaction, {
      orderId,
      eventType: 'fulfillment_status_changed',
      channel: 'webhook',
      payload: notificationDetails,
    });
    if (order.customerEmail) {
      await enqueueOrderNotification(transaction, {
        orderId,
        eventType: 'fulfillment_status_changed',
        channel: 'email',
        recipient: order.customerEmail,
        payload: notificationDetails,
      });
    }

    return {
      status: nextStatus,
      alreadyUpdated: false,
      dispatchProvider: nextStatus === 'shipped' ? dispatch?.provider : order.dispatchProvider,
      dispatchReference: nextStatus === 'shipped' ? dispatch?.reference : order.dispatchReference,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!result.alreadyUpdated) recordOrderStatus(nextStatus);
  return result;
}
