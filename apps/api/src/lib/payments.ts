import { Prisma } from '@prisma/client';
import { recordOrderStatus, recordPaymentStatus } from '@api/lib/metrics';
import { enqueueOrderNotification } from '@api/lib/notifications';
import { prisma } from '@api/lib/prisma';
import { hashInvoiceToken } from '@api/lib/orders';

export class PaymentRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PaymentRequestError';
  }
}

export async function reportBankTransfer(input: {
  token: string;
  bankTransferReference: string;
}) {
  const invoice = await prisma.invoiceAccess.findUnique({
    where: { tokenHash: hashInvoiceToken(input.token) },
    include: { order: { include: { payment: true } } },
  });
  if (!invoice?.order.payment) throw new PaymentRequestError('Invoice not found.', 404);

  const { order } = invoice;
  const { payment } = order;
  if (!payment) throw new PaymentRequestError('Invoice not found.', 404);
  if (order.status === 'expired' || (order.expiresAt && order.expiresAt <= new Date())) {
    throw new PaymentRequestError('This payment window has expired. Contact DEGEMS support before transferring.', 410);
  }

  if (payment.status === 'under_review' && payment.bankTransferReference === input.bankTransferReference) {
    return { status: 'under_review' as const, message: 'Your transfer reference is already under review.' };
  }
  if (payment.status !== 'pending' || order.status !== 'pending_payment') {
    throw new PaymentRequestError('This invoice is no longer accepting transfer reports.', 409);
  }

  await prisma.$transaction(async (transaction) => {
    const orderUpdated = await transaction.order.updateMany({
      where: { id: order.id, status: 'pending_payment', expiresAt: { gt: new Date() } },
      data: { status: 'payment_under_review' },
    });
    if (orderUpdated.count !== 1) {
      throw new PaymentRequestError('This invoice is no longer accepting transfer reports.', 409);
    }

    const paymentUpdated = await transaction.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: { status: 'under_review', bankTransferReference: input.bankTransferReference },
    });
    if (paymentUpdated.count !== 1) {
      throw new PaymentRequestError('This invoice is no longer accepting transfer reports.', 409);
    }

    await enqueueOrderNotification(transaction, {
      orderId: order.id,
      eventType: 'payment_under_review',
      channel: 'webhook',
      payload: { transferReference: input.bankTransferReference },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  recordOrderStatus('payment_under_review');
  recordPaymentStatus('under_review', payment.method);
  return {
    status: 'under_review' as const,
    message: 'Transfer reference submitted. Payment is not confirmed until DEGEMS verifies receipt.',
  };
}

export async function confirmOrderPayment(orderId: string, adminId: string) {
  const now = new Date();
  const result = await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { payment: true, items: true, reservations: true },
    });
    if (!order?.payment) throw new PaymentRequestError('Order or payment record not found.', 404);

    if (order.status === 'confirmed' && order.payment.status === 'confirmed') {
      return { status: 'confirmed' as const, alreadyConfirmed: true };
    }
    if (order.status !== 'payment_under_review' || order.payment.status !== 'under_review') {
      throw new PaymentRequestError('Only a transfer under review can be confirmed.', 409);
    }
    if (!order.expiresAt || order.expiresAt <= now) {
      throw new PaymentRequestError('The reservation expired. Resolve inventory availability before confirming.', 409);
    }
    if (!order.payment.bankTransferReference) {
      throw new PaymentRequestError('A customer transfer reference is required before review.', 409);
    }

    const activeReservations = order.reservations.filter((reservation) => (
      reservation.releasedAt === null
      && reservation.expiresAt > now
      && order.items.some((item) => (
        item.productId === reservation.productId
        && item.variantId === reservation.variantId
        && item.quantity === reservation.quantity
      ))
    ));
    if (order.items.length === 0 || activeReservations.length !== order.items.length) {
      throw new PaymentRequestError('Inventory reservation is missing or expired. Resolve the order manually.', 409);
    }

    const paymentUpdated = await transaction.payment.updateMany({
      where: { id: order.payment.id, status: 'under_review' },
      data: { status: 'confirmed', confirmedAt: now, confirmedById: adminId },
    });
    const orderUpdated = await transaction.order.updateMany({
      where: { id: order.id, status: 'payment_under_review', expiresAt: { gt: now } },
      data: { status: 'confirmed' },
    });
    if (paymentUpdated.count !== 1 || orderUpdated.count !== 1) {
      throw new PaymentRequestError('Payment status changed at the same time. Reload and verify the order.', 409);
    }

    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'order.payment.confirmed',
        entityType: 'Order',
        entityId: order.id,
        details: { paymentId: order.payment.id, amountKobo: order.payment.amount },
      },
    });
    await enqueueOrderNotification(transaction, {
      orderId: order.id,
      eventType: 'payment_confirmed',
      channel: 'webhook',
    });
    if (order.customerEmail) {
      await enqueueOrderNotification(transaction, {
        orderId: order.id,
        eventType: 'payment_confirmed',
        channel: 'email',
        recipient: order.customerEmail,
      });
    }

    return { status: 'confirmed' as const, alreadyConfirmed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!result.alreadyConfirmed) {
    recordOrderStatus('confirmed');
    recordPaymentStatus('confirmed', 'bank_transfer');
  }
  return result;
}
