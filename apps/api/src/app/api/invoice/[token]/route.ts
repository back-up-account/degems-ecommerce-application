import { NextResponse } from 'next/server';
import { getBankTransferDetails } from '@api/lib/bank-transfer';
import { hashInvoiceToken } from '@api/lib/orders';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { prisma } from '@api/lib/prisma';

async function getInvoice(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ message: 'Invoice not found.' }, { status: 404 });
  }

  const access = await prisma.invoiceAccess.findUnique({
    where: { tokenHash: hashInvoiceToken(token) },
    select: {
      order: {
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          status: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          deliveryMethod: true,
          deliveryFee: true,
          deliveryZoneName: true,
          deliveryAddress: true,
          total: true,
          items: {
            select: { id: true, name: true, variantName: true, quantity: true, unitPrice: true },
          },
          payment: { select: { status: true, reference: true } },
        },
      },
    },
  });

  if (!access?.order.payment) {
    return NextResponse.json({ message: 'Invoice not found.' }, { status: 404 });
  }

  return NextResponse.json({
    order: access.order,
    bankDetails: getBankTransferDetails(),
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export const GET = instrumentHttpHandler('/api/invoice/[token]', 'GET', getInvoice);
