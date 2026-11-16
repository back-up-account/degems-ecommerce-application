import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@api/lib/admin-api-auth';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { prisma } from '@api/lib/prisma';
import { retryFailedNotification } from '@api/lib/notifications';

const retrySchema = z.object({ notificationId: z.string().uuid() }).strict();

async function getFailedNotifications() {
  const authorization = await authorizeAdminPermission('notifications.manage');
  if ('response' in authorization) return authorization.response;

  const [failedCount, notifications] = await Promise.all([
    prisma.notification.count({ where: { status: 'failed' } }),
    prisma.notification.findMany({
      where: { status: 'failed' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderId: true,
        eventType: true,
        channel: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    failedCount,
    notifications: notifications.map((notification) => ({
      ...notification,
      orderReference: notification.orderId ? `DG-${notification.orderId.slice(0, 8).toUpperCase()}` : null,
      updatedAt: notification.updatedAt.toISOString(),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

async function postRetryNotification(request: Request) {
  const authorization = await authorizeAdminPermission('notifications.manage');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Choose a valid failed notification.' }, { status: 400 });
  }

  try {
    const result = await retryFailedNotification(parsed.data.notificationId, authorization.userId);
    if (result.result === 'not_found') {
      return NextResponse.json({ message: 'Notification not found.' }, { status: 404 });
    }
    if (result.result === 'not_failed') {
      return NextResponse.json({ message: 'Only failed notifications can be retried.' }, { status: 409 });
    }
    return NextResponse.json({ retried: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ message: 'Notification state changed at the same time. Reload and retry.' }, { status: 409 });
    }
    throw error;
  }
}

export const GET = instrumentHttpHandler('/api/admin/notifications', 'GET', getFailedNotifications);
export const POST = instrumentHttpHandler('/api/admin/notifications', 'POST', postRetryNotification);
