import { NextResponse } from 'next/server';
import { listActiveDeliveryZones } from '@api/lib/delivery';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

async function getDeliveryZones() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Delivery options are not configured.' }, { status: 503 });
  }

  const zones = await listActiveDeliveryZones();
  return NextResponse.json({ zones }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const GET = instrumentHttpHandler('/api/delivery-zones', 'GET', getDeliveryZones);
