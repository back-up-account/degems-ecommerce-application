import { notFound } from 'next/navigation';
import { TransferReportForm } from '@/components/transfer-report-form';
import { getBankTransferDetails } from '@/lib/bank-transfer';
import { hashInvoiceToken } from '@/lib/orders';
import { prisma } from '@/lib/prisma';
import { formatNairaFromKobo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'DEGEMS invoice',
  robots: { index: false, follow: false },
};

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();

  const access = await prisma.invoiceAccess.findUnique({
    where: { tokenHash: hashInvoiceToken(token) },
    include: { order: { include: { items: true, payment: true } } },
  });
  if (!access?.order.payment) notFound();

  const { order } = access;
  const { payment } = order;
  if (!payment) notFound();
  const bankDetails = getBankTransferDetails();
  const paymentWindowOpen = order.expiresAt !== null && order.expiresAt > new Date()
    && order.status !== 'expired' && payment.status !== 'confirmed';
  const itemSubtotal = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">DEGEMS · Invoice</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900">{`DG-${order.id.slice(0, 8).toUpperCase()}`}</h1>
        <p className="mt-2 text-sm text-stone-600">Created {order.createdAt.toLocaleString('en-NG')}</p>
      </header>

      <section className="rounded-3xl border border-stone-200 bg-white p-6">
        <div className="flex flex-wrap justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <h2 className="font-semibold text-stone-900">Order for {order.customerName ?? 'Customer'}</h2>
            {order.customerEmail ? <p className="mt-1 text-sm text-stone-600">{order.customerEmail}</p> : null}
            {order.customerPhone ? <p className="mt-1 text-sm text-stone-600">{order.customerPhone}</p> : null}
          </div>
          <div className="text-sm">
            <p className="text-stone-500">Payment status</p>
            <p className="mt-1 font-medium capitalize text-stone-900">{payment.status.replaceAll('_', ' ')}</p>
          </div>
        </div>

        <div className="divide-y divide-stone-100">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-4 py-4 text-sm">
              <div>
                <p className="font-medium text-stone-900">{item.name}{item.variantName ? ` — ${item.variantName}` : ''}</p>
                <p className="mt-1 text-stone-500">{item.quantity} × {formatNairaFromKobo(item.unitPrice)}</p>
              </div>
              <p className="shrink-0 font-medium text-stone-900">{formatNairaFromKobo(item.quantity * item.unitPrice)}</p>
            </div>
          ))}
        </div>

        <dl className="space-y-2 border-t border-stone-200 pt-4 text-sm">
          <div className="flex justify-between gap-4 text-stone-600">
            <dt>Items subtotal</dt>
            <dd>{formatNairaFromKobo(itemSubtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-stone-600">
            <dt>{order.deliveryMethod === 'door_delivery' ? 'Door delivery' : 'Free pickup'}</dt>
            <dd>{formatNairaFromKobo(order.deliveryFee)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-base font-semibold text-stone-900">
            <dt>Total payable</dt>
            <dd>{formatNairaFromKobo(order.total)}</dd>
          </div>
        </dl>
        {order.deliveryMethod === 'door_delivery' && order.deliveryAddress ? (
          <div className="mt-5 border-t border-stone-100 pt-4 text-sm">
            <p className="font-medium text-stone-900">Delivery to {order.deliveryZoneName ?? 'selected area'}</p>
            <p className="mt-1 whitespace-pre-line text-stone-600">{order.deliveryAddress}</p>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-stone-900">Manual bank transfer</h2>
        {paymentWindowOpen ? (
          <>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Transfer the exact total and include the payment reference. DEGEMS will verify the credit before confirming payment.
            </p>
            {bankDetails ? (
              <dl className="mt-5 grid gap-4 rounded-2xl bg-stone-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-stone-500">Bank</dt><dd className="mt-1 font-medium text-stone-900">{bankDetails.bankName}</dd></div>
                <div><dt className="text-stone-500">Account name</dt><dd className="mt-1 font-medium text-stone-900">{bankDetails.accountName}</dd></div>
                <div><dt className="text-stone-500">Account number</dt><dd className="mt-1 font-medium text-stone-900">{bankDetails.accountNumber}</dd></div>
                <div><dt className="text-stone-500">Payment reference</dt><dd className="mt-1 font-medium text-stone-900">{payment.reference}</dd></div>
              </dl>
            ) : (
              <p role="status" className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                Bank transfer instructions are temporarily unavailable. Do not transfer until DEGEMS support confirms the account details.
              </p>
            )}
            <p className="mt-4 text-sm text-stone-600">
              Payment window ends {order.expiresAt?.toLocaleString('en-NG')}. Reserved items are released after expiry.
            </p>
            <TransferReportForm
              token={token}
              disabled={!bankDetails || payment.status !== 'pending'}
            />
          </>
        ) : (
          <p role="status" className="mt-2 text-sm leading-6 text-stone-600">
            {payment.status === 'confirmed'
              ? 'Payment was verified by DEGEMS.'
              : 'This payment window is closed. Contact DEGEMS support before making a transfer.'}
          </p>
        )}
      </section>
    </main>
  );
}
