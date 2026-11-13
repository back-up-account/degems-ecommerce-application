import { NextResponse } from 'next/server';

import { instrumentHttpHandler } from '@/lib/http-metrics';
import { prisma } from '@/lib/prisma';

async function getHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok', service: 'degems-ecommerce', database: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      'Health check could not reach the database:',
      error instanceof Error ? error.name : 'unknown error',
    );
    return NextResponse.json(
      { status: 'unavailable', service: 'degems-ecommerce', database: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export const GET = instrumentHttpHandler('/api/health', 'GET', getHealth);
