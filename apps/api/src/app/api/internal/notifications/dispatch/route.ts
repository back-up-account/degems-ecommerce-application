import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { dispatchNotificationBatch } from '@api/lib/notifications';

async function postDispatchNotifications(request: Request) {
  const secret = process.env.NOTIFICATION_WORKER_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ message: 'Notification worker is not configured.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const supplied = Buffer.from(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  const expected = Buffer.from(secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  return NextResponse.json(await dispatchNotificationBatch(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const POST = instrumentHttpHandler('/api/internal/notifications/dispatch', 'POST', postDispatchNotifications);
