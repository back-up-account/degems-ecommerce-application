import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { getMetricsRegistry, refreshDatabaseMetrics } from '@api/lib/metrics';
import { getMetricsBearerToken } from '@api/lib/metrics-auth';

async function getMetrics(request: Request) {
  const secret = await getMetricsBearerToken();
  if (!secret || secret.length < 32) {
    return NextResponse.json({ message: 'Metrics access is not configured.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const supplied = Buffer.from(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  const expected = Buffer.from(secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  await refreshDatabaseMetrics();
  return new Response(await getMetricsRegistry().metrics(), {
    headers: {
      'Content-Type': getMetricsRegistry().contentType,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = instrumentHttpHandler('/api/metrics', 'GET', getMetrics);
