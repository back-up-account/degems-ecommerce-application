import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function isAdminLoginBlocked(userId: string, now = new Date()) {
  const throttle = await prisma.adminAuthThrottle.findUnique({
    where: { userId },
    select: { lockedUntil: true },
  });
  return Boolean(throttle?.lockedUntil && throttle.lockedUntil > now);
}

export async function recordAdminLoginFailure(userId: string, now = new Date(), retries = 0): Promise<void> {
  try {
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.adminAuthThrottle.findUnique({ where: { userId } });
      if (!current) {
        await transaction.adminAuthThrottle.create({
          data: { userId, failureCount: 1, windowStartedAt: now },
        });
        return;
      }

      if (current.lockedUntil && current.lockedUntil > now) return;
      const resetWindow = current.windowStartedAt.getTime() <= now.getTime() - FAILURE_WINDOW_MS
        || Boolean(current.lockedUntil && current.lockedUntil <= now);
      const failureCount = resetWindow ? 1 : current.failureCount + 1;
      const updated = await transaction.adminAuthThrottle.updateMany({
        where: {
          userId,
          failureCount: current.failureCount,
          windowStartedAt: current.windowStartedAt,
          lockedUntil: current.lockedUntil,
        },
        data: {
          failureCount,
          windowStartedAt: resetWindow ? now : current.windowStartedAt,
          lockedUntil: failureCount >= MAX_FAILURES ? new Date(now.getTime() + LOCKOUT_MS) : null,
        },
      });
      if (updated.count !== 1) throw new AdminAuthThrottleConflictError();
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const retryable = error instanceof AdminAuthThrottleConflictError
      || (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code));
    if (!retryable || retries >= 3) throw error;
    return recordAdminLoginFailure(userId, now, retries + 1);
  }
}

export async function clearAdminLoginFailures(userId: string) {
  await prisma.adminAuthThrottle.deleteMany({ where: { userId } });
}

class AdminAuthThrottleConflictError extends Error {}
