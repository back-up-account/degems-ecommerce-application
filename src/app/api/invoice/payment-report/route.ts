import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import { reportBankTransfer, PaymentRequestError } from '@/lib/payments';

const reportSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  bankTransferReference: z.string().trim().min(4).max(100)
    .regex(/^[A-Za-z0-9._/-]+$/)
    .transform((value) => value.toUpperCase()),
});

async function postPaymentReport(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Enter a valid bank transfer reference.', errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await reportBankTransfer(parsed.data);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { message: 'This bank transfer reference has already been reported for another order.' },
        { status: 409 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json(
        { message: 'Payment status changed at the same time. Reload the invoice and try again.' },
        { status: 409 },
      );
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/invoice/payment-report', 'POST', postPaymentReport);
